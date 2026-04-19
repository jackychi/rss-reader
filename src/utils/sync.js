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
  getReadingListWithTombstones,
  getReadingListItemById,
  saveToReadingList,
  getArticleById,
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
  // 粘贴场景下 ID 可能混入空格、换行、零宽字符(尤其是从聊天工具复制过来)
  // 一律剥干净再校验,避免"看着合法但 regex 过不了"的隐性失败
  const normalized = String(id)
    .replace(/\s+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
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

  // readingList:按 id (= articleKey) union,墓碑优先
  // 规则:如果任一方标记了 removedAt,取 removedAt 更大的那份(最新删除);
  // 如果没有 removedAt,按 savedAt 取最早的(保留首次收藏时间)
  const listMap = new Map()
  for (const item of [...(a?.readingList || []), ...(b?.readingList || [])]) {
    const key = item?.id ?? (item?.feedUrl && (item?.guid || item?.link) ? getArticleKey(item) : null)
    if (!key) continue
    const prev = listMap.get(key)
    if (!prev) {
      listMap.set(key, item)
    } else if (item.removedAt || prev.removedAt) {
      // 任一方有墓碑:取 removedAt 更大的(最新删除胜出)
      if ((item.removedAt ?? 0) > (prev.removedAt ?? 0)) {
        listMap.set(key, item)
      }
    } else if ((item.savedAt ?? 0) < (prev.savedAt ?? 0)) {
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
    // 含墓碑的完整列表,供 writeLocal / pushRemote 使用
    readingListAll,
  }
}

// ============ 本地/远端 I/O ============

async function readLocal() {
  const [readStatus, readingList] = await Promise.all([
    getAllReadStatusRecords(),
    getReadingListWithTombstones(),
  ])
  return { version: SYNC_VERSION, updatedAt: Date.now(), readStatus, readingList }
}

// push 前剥离 readingList 里的 content / contentSnippet 字段
// 原因:单篇带图长文的 content HTML 很容易 200-500KB,几条就突破 KV 的 payload 上限
// 本地 IDB 不动,内容依然能从本地 articles store(按 id = articleKey)回填
function stripReadingListForWire(list) {
  return list.map((item) => {
    // 结构化克隆排除 content,其他字段原样保留
    // eslint-disable-next-line no-unused-vars
    const { content, contentSnippet, ...rest } = item
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

async function writeLocal(merged) {
  await Promise.all([
    saveReadStatusRecordsBatch(merged.readStatus),
    // 写 readingList 时保留本地已有的 content,避免覆盖丢失
    // 场景:远端 item 被 stripReadingListForWire 剥离了 content,回填时 articles store
    // 可能已过期清理,此时直接 put 会把本地有 content 的记录覆盖成无 content 的
    Promise.all(merged.readingList.map(async (item) => {
      if (item.content) {
        // merged item 已有 content,直接写
        return saveToReadingList(item)
      }
      // 尝试从本地 readingList store 取已有记录的 content
      const existing = await getReadingListItemById(item.id)
      if (existing?.content) {
        return saveToReadingList({ ...item, content: existing.content, contentSnippet: existing.contentSnippet || item.contentSnippet })
      }
      // 本地也没有,从 articles store 回填
      const article = await getArticleById(item.id)
      if (article?.content) {
        return saveToReadingList({ ...item, content: article.content, contentSnippet: article.contentSnippet || item.contentSnippet })
      }
      return saveToReadingList(item)
    })),
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
    writeLocal({ ...merged, readingList: merged.readingListAll }),
  ])

  return {
    readSet: new Set(merged.readStatus.map((r) => r.articleKey)),
    readingList: enrichedList,
    merged,
  }
}
