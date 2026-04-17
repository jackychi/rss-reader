// 跨设备同步模块 - Cloudflare Workers KV 存后端
//
// 核心设计:UNION merge。readStatus 和 readingList 都是单调增集合
// (一旦加入永远不移除),所以 "合并两份状态" = "取并集,时间戳取最早"。
// 这个幂等性让 syncNow 可以一视同仁地处理双向同步,不用区分 push/pull。
//
// 流程:
//   1. 并发:GET remote  +  读本地 IDB
//   2. mergeStates(local, remote)  → 纯函数合并
//   3. 并发:POST merged 到 remote  +  writeLocal 把 merged 写回 IDB
//   4. 返回 { readSet, readingList } 给 UI 层更新 state

import { CORS_WORKER_URL } from './constants'
import { getArticleKey } from './articleKey'
import {
  getAllReadStatusRecords,
  saveReadStatusRecordsBatch,
  getReadingList,
  saveToReadingList,
} from './db'

const SYNC_ENDPOINT = `${CORS_WORKER_URL}/sync`
const SYNC_ID_KEY = 'rss-reader-sync-id'
export const SYNC_VERSION = 1

// ============ Sync ID 管理 ============

export function getSyncId() {
  try {
    return localStorage.getItem(SYNC_ID_KEY)
  } catch {
    return null
  }
}

export function setSyncId(id) {
  const normalized = String(id).trim()
  if (!/^[a-zA-Z0-9-]{32,128}$/.test(normalized)) {
    throw new Error('Sync ID 格式不合法(需 32-128 位字母数字或短横线)')
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
  // readStatus:按 articleKey union,readAt 取较早的那份(保留首次已读时间)
  const readMap = new Map()
  for (const rec of [...(a?.readStatus || []), ...(b?.readStatus || [])]) {
    if (!rec?.articleKey) continue
    const prev = readMap.get(rec.articleKey)
    if (!prev || (rec.readAt ?? Infinity) < (prev.readAt ?? Infinity)) {
      readMap.set(rec.articleKey, { articleKey: rec.articleKey, readAt: rec.readAt ?? Date.now() })
    }
  }

  // readingList:按 id (= articleKey) union,savedAt 取较早的(保留首次收藏时间)
  const listMap = new Map()
  for (const item of [...(a?.readingList || []), ...(b?.readingList || [])]) {
    const key = item?.id ?? (item?.feedUrl && (item?.guid || item?.link) ? getArticleKey(item) : null)
    if (!key) continue
    const prev = listMap.get(key)
    if (!prev || (item.savedAt ?? 0) < (prev.savedAt ?? 0)) {
      listMap.set(key, item)
    }
  }
  const readingList = Array.from(listMap.values()).sort(
    (x, y) => (y.savedAt ?? 0) - (x.savedAt ?? 0)
  )

  return {
    version: SYNC_VERSION,
    updatedAt: Date.now(),
    readStatus: Array.from(readMap.values()),
    readingList,
  }
}

// ============ 本地/远端 I/O ============

async function readLocal() {
  const [readStatus, readingList] = await Promise.all([
    getAllReadStatusRecords(),
    getReadingList(),
  ])
  return { version: SYNC_VERSION, updatedAt: Date.now(), readStatus, readingList }
}

async function writeLocal(merged) {
  await Promise.all([
    saveReadStatusRecordsBatch(merged.readStatus),
    // saveToReadingList 单条,循环调用;item 数通常 < 100,不加批量足够
    Promise.all(merged.readingList.map((item) => saveToReadingList(item))),
  ])
}

async function pullRemote(id) {
  const res = await fetch(`${SYNC_ENDPOINT}?key=${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`Pull failed: HTTP ${res.status}`)
  }
  return res.json()
}

async function pushRemote(id, state) {
  const res = await fetch(`${SYNC_ENDPOINT}?key=${encodeURIComponent(id)}`, {
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

// ============ 主入口 ============

// 双向同步。返回 { readSet, readingList, merged } 供 UI 更新 state
export async function syncNow(id) {
  if (!id) throw new Error('Sync ID 未设置')

  const [remote, local] = await Promise.all([pullRemote(id), readLocal()])
  const merged = mergeStates(local, remote)

  await Promise.all([
    pushRemote(id, merged),
    writeLocal(merged),
  ])

  return {
    readSet: new Set(merged.readStatus.map((r) => r.articleKey)),
    readingList: merged.readingList,
    merged,
  }
}
