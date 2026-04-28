// 跨设备同步模块 - Go 后端 + MySQL 用户状态库
//
// 核心设计:按 articleKey 合并。readStatus 为未来支持 unread 做成
// latest-updatedAt-wins；readingList 保留 removedAt 墓碑；阅读/音频进度
// 也按 updatedAt 决胜。
//
// 流程:
//   1. 并发:GET remote  +  读本地 IDB
//   2. mergeStates(local, remote)  → 纯函数合并
//   3. 并发:POST merged 到 remote  +  writeLocal 把 merged 写回 IDB
//   4. 返回 { readSet, readingList } 给 UI 层更新 state

import { CATREADER_API_URL } from './constants'
import { getArticleKey } from './articleKey'
import {
  getAllReadStatusRecords,
  saveReadStatusRecordsBatch,
  getReadingListWithTombstones,
  getReadingListItemById,
  saveToReadingList,
  getArticleById,
} from './db'

const SYNC_ENDPOINT = `${CATREADER_API_URL}/api/user-state`
const SYNC_ID_KEY = 'rss-reader-sync-id'
const SYNC_REQUEST_TIMEOUT_MS = 30000
const SYNC_TOTAL_TIMEOUT_MS = 60000
export const SYNC_VERSION = 2

// ============ Sync ID 管理 ============

export function getSyncId() {
  try {
    return localStorage.getItem(SYNC_ID_KEY)
  } catch {
    return null
  }
}

export function ensureSyncId() {
  const existing = getSyncId()
  if (existing) return existing
  const id = generateSyncId()
  localStorage.setItem(SYNC_ID_KEY, id)
  return id
}

export function setSyncId(id) {
  // 粘贴场景下 ID 可能混入空格、换行、零宽字符(尤其是从聊天工具复制过来)
  // 一律剥干净再校验,避免"看着合法但 regex 过不了"的隐性失败
  const normalized = String(id)
    .replace(/\s+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
  if (!/^[a-zA-Z0-9-]{32,128}$/.test(normalized)) {
    throw new Error('用户 ID 格式不合法(需 32-128 位字母数字或短横线)')
  }
  localStorage.setItem(SYNC_ID_KEY, normalized)
  return normalized
}

export function clearSyncId() {
  localStorage.removeItem(SYNC_ID_KEY)
}

export function generateSyncId() {
  // crypto.randomUUID 在所有现代浏览器可用,产出 36 字符的 UUID v4
  return crypto.randomUUID()
}

// ============ 纯函数:合并两份状态 ============

// 导出供单测使用
export function mergeStates(a, b) {
  const now = Date.now()

  // readStatus:支持 read/unread。read/read 合并时保留首次 readAt,
  // 状态冲突时 updatedAt 新的赢。
  const readMap = new Map()
  for (const raw of [...(a?.readStatus || []), ...(b?.readStatus || [])]) {
    const rec = normalizeReadStatus(raw, now)
    if (!rec.articleKey) continue
    const prev = readMap.get(rec.articleKey)
    if (!prev) {
      readMap.set(rec.articleKey, rec)
    } else if (prev.status === 'read' && rec.status === 'read') {
      readMap.set(rec.articleKey, {
        ...rec,
        readAt: Math.min(prev.readAt || rec.readAt || now, rec.readAt || prev.readAt || now),
        updatedAt: Math.max(prev.updatedAt || 0, rec.updatedAt || 0),
      })
    } else if ((rec.updatedAt || 0) >= (prev.updatedAt || 0)) {
      readMap.set(rec.articleKey, rec)
    }
  }

  // readingList:按 id (= articleKey) 合并,保留墓碑。新状态按 updatedAt 决胜。
  const listMap = new Map()
  for (const raw of [...(a?.readingList || []), ...(b?.readingList || [])]) {
    const item = normalizeReadingListItem(raw, now)
    const key = item?.id ?? (item?.feedUrl && (item?.guid || item?.link) ? getArticleKey(item) : null)
    if (!key) continue
    item.id = key
    const prev = listMap.get(key)
    if (!prev || (item.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) {
      listMap.set(key, item)
    }
  }
  // 合并结果中过滤掉墓碑条目(不推给 UI,但保留在 wire payload 里让远端也同步删除)
  const readingListAll = Array.from(listMap.values()).sort(
    (x, y) => (y.savedAt ?? 0) - (x.savedAt ?? 0)
  )
  const readingList = readingListAll.filter(item => !item.removedAt)

  return {
    version: SYNC_VERSION,
    updatedAt: Date.now(),
    readStatus: Array.from(readMap.values()),
    readingList,
    readPositions: mergePositionMaps(a?.readPositions, b?.readPositions, now),
    audioPositions: mergePositionMaps(a?.audioPositions, b?.audioPositions, now),
    // 含墓碑的完整列表,供 writeLocal / pushRemote 使用
    readingListAll,
  }
}

// ============ 本地/远端 I/O ============

function normalizeReadStatus(rec, now = Date.now()) {
  if (!rec?.articleKey) return { articleKey: '' }
  const status = rec.status || 'read'
  const updatedAt = rec.updatedAt || rec.readAt || now
  return {
    articleKey: rec.articleKey,
    status,
    readAt: status === 'read' ? (rec.readAt || updatedAt) : (rec.readAt || 0),
    updatedAt,
  }
}

function normalizeReadingListItem(item, now = Date.now()) {
  if (!item) return null
  const updatedAt = item.updatedAt || item.removedAt || item.savedAt || now
  return { ...item, updatedAt }
}

export function normalizePositionMap(map, now = Date.now()) {
  const normalized = {}
  for (const [key, value] of Object.entries(map || {})) {
    if (!key) continue
    if (typeof value === 'number') {
      normalized[key] = { position: value, updatedAt: now }
    } else if (value && typeof value === 'object') {
      normalized[key] = {
        position: Number(value.position ?? 0),
        updatedAt: Number(value.updatedAt || now),
      }
    }
  }
  return normalized
}

function mergePositionMaps(a, b, now = Date.now()) {
  const merged = {}
  for (const source of [normalizePositionMap(a, now), normalizePositionMap(b, now)]) {
    for (const [key, rec] of Object.entries(source)) {
      if (!merged[key] || rec.updatedAt >= merged[key].updatedAt) {
        merged[key] = rec
      }
    }
  }
  return merged
}

async function readLocal(id, localState = {}) {
  const [readStatus, readingList] = await Promise.all([
    getAllReadStatusRecords(id),
    getReadingListWithTombstones(id),
  ])
  return {
    version: SYNC_VERSION,
    updatedAt: Date.now(),
    readStatus,
    readingList,
    readPositions: normalizePositionMap(localState.readPositions),
    audioPositions: normalizePositionMap(localState.audioPositions),
  }
}

// push 前剥离 readingList 里的 content 字段。
// 原因:单篇带图长文的 content HTML 很容易 200-500KB,没必要作为用户状态重复存。
// 本地 IDB 不动,内容依然能从本地 articles store(按 id = articleKey)回填
function stripReadingListForWire(list) {
  return list.map((item) => {
    // 结构化克隆排除 content,其他字段原样保留
    // eslint-disable-next-line no-unused-vars
    const { content, ...rest } = item
    return rest
  })
}

// 从 articles store 按 id 找文章,有 content 的话拿来丰富 readingList 条目
// 同一设备既订阅着对应 feed 又逛过相关文章时,articles store 里就有这篇
async function enrichReadingListWithContent(list) {
  return Promise.all(list.map(async (item) => {
    if (item.content) return item // 本地已有,不动
    try {
      const article = await getArticleById(item.id)
      if (article?.content) {
        return {
          ...item,
          content: article.content,
          contentSnippet: article.contentSnippet || '',
        }
      }
    } catch { /* 回填失败不算错,保持 item 不变 */ }
    return item
  }))
}

async function writeLocal(id, merged) {
  await Promise.all([
    saveReadStatusRecordsBatch(merged.readStatus.filter((r) => (r.status || 'read') === 'read'), id),
    // 写 readingList 时保留本地已有的 content,避免覆盖丢失
    // 场景:远端 item 被 stripReadingListForWire 剥离了 content,回填时 articles store
    // 可能已过期清理,此时直接 put 会把本地有 content 的记录覆盖成无 content 的
    Promise.all(merged.readingList.map(async (item) => {
      if (item.content) {
        // merged item 已有 content,直接写
        return saveToReadingList(item, id)
      }
      // 尝试从本地 readingList store 取已有记录的 content
      const existing = await getReadingListItemById(item.id, id)
      if (existing?.content) {
        return saveToReadingList({ ...item, content: existing.content, contentSnippet: existing.contentSnippet || item.contentSnippet }, id)
      }
      // 本地也没有,从 articles store 回填
      const article = await getArticleById(item.id)
      if (article?.content) {
        return saveToReadingList({ ...item, content: article.content, contentSnippet: article.contentSnippet || item.contentSnippet }, id)
      }
      return saveToReadingList(item, id)
    })),
  ])
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`用户状态请求超时(${Math.round(SYNC_REQUEST_TIMEOUT_MS / 1000)}s)`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function pullRemote(id) {
  const res = await fetchWithTimeout(`${SYNC_ENDPOINT}?syncid=${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`Pull failed: HTTP ${res.status}`)
  }
  return res.json()
}

async function pushRemote(id, state) {
  const res = await fetchWithTimeout(`${SYNC_ENDPOINT}?syncid=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Push failed: HTTP ${res.status} ${text}`)
  }
  return res.json()
}

async function withTotalSyncTimeout(work) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`用户状态更新超时(${Math.round(SYNC_TOTAL_TIMEOUT_MS / 1000)}s)`))
    }, SYNC_TOTAL_TIMEOUT_MS)
  })
  try {
    return await Promise.race([work(), timeout])
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============ 主入口 ============

// 双向同步。返回 { readSet, readingList, merged } 供 UI 更新 state
export async function syncNow(id, localState = {}) {
  return withTotalSyncTimeout(() => syncNowInner(id, localState))
}

async function syncNowInner(id, localState = {}) {
  if (!id) throw new Error('用户 ID 未设置')

  const [remote, local] = await Promise.all([pullRemote(id), readLocal(id, localState)])
  const merged = mergeStates(local, remote)

  // readingListAll 含墓碑,用于写入远端和本地 IDB(让删除状态传播)
  // readingList 不含墓碑,用于 UI 展示
  const forWire = {
    ...merged,
    readingList: stripReadingListForWire(merged.readingListAll),
    readingListAll: undefined, // 远端不需要这个额外字段
  }
  const enrichedList = await enrichReadingListWithContent(merged.readingList)

  await Promise.all([
    pushRemote(id, forWire),
    writeLocal(id, { ...merged, readingList: merged.readingListAll }),
  ])

  return {
    readSet: new Set(merged.readStatus.filter((r) => (r.status || 'read') === 'read').map((r) => r.articleKey)),
    readingList: enrichedList,
    readPositions: merged.readPositions,
    audioPositions: merged.audioPositions,
    merged,
  }
}
