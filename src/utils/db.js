/**
 * IndexedDB 工具 - 用于存储 RSS 文章实现离线阅读
 * 数据库名: CatReaderDB
 * 对象存储:
 *   - articles: 文章内容
 *   - feeds: 订阅源信息
 *   - readStatus: 已读状态
 */

const DB_NAME = 'CatReaderDB'
const DB_VERSION = 3

// 打开数据库
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('[DB] Failed to open database:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      console.log('[DB] Database opened successfully')
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      console.log('[DB] Upgrading database...')

      // 创建文章存储
      if (!db.objectStoreNames.contains('articles')) {
        const articlesStore = db.createObjectStore('articles', { keyPath: 'id' })
        articlesStore.createIndex('feedUrl', 'feedUrl', { unique: false })
        articlesStore.createIndex('publishedAt', 'publishedAt', { unique: false })
      }

      // 创建订阅源存储
      if (!db.objectStoreNames.contains('feeds')) {
        db.createObjectStore('feeds', { keyPath: 'url' })
      }

      // 创建已读状态存储
      if (!db.objectStoreNames.contains('readStatus')) {
        db.createObjectStore('readStatus', { keyPath: 'articleKey' })
      }

      // 创建阅读列表存储
      if (!db.objectStoreNames.contains('readingList')) {
        const readingListStore = db.createObjectStore('readingList', { keyPath: 'id' })
        readingListStore.createIndex('savedAt', 'savedAt', { unique: false })
      }

      // 创建 feed 元信息存储（记录每个 feed 的 lastFetchedAt，用于 5min TTL 热缓存）
      if (!db.objectStoreNames.contains('feedMeta')) {
        db.createObjectStore('feedMeta', { keyPath: 'feedUrl' })
      }
    }
  })
}

// 保存文章到 IndexedDB
export async function saveArticles(articles) {
  try {
    const db = await openDB()
    const tx = db.transaction('articles', 'readwrite')
    const store = tx.objectStore('articles')

    articles.forEach((article) => {
      store.put({
        id: `${article.feedUrl}-${article.guid || article.link}`,
        ...article,
        cachedAt: Date.now(),
      })
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save articles:', error)
    return false
  }
}

// 从 IndexedDB 获取文章
// 注意:不用 IDB index limit,因为 limit 按主键序截取而非按时间,
// 会漏掉最新文章(如 ximalaya 256 期只取到前 100 期老数据)
export async function getArticles(feedUrl = null, limit = null) {
  try {
    const db = await openDB()
    const tx = db.transaction('articles', 'readonly')
    const store = tx.objectStore('articles')
    const index = feedUrl ? store.index('feedUrl') : null

    return new Promise((resolve, reject) => {
      const request = index
        ? index.getAll(IDBKeyRange.only(feedUrl))
        : store.getAll()

      request.onsuccess = () => {
        let articles = request.result || []
        // 按发布时间排序
        articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))
        if (limit && articles.length > limit) {
          articles = articles.slice(0, limit)
        }
        resolve(articles)
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get articles:', error)
    return []
  }
}

// 保存订阅源
export async function saveFeeds(feeds) {
  try {
    const db = await openDB()
    const tx = db.transaction('feeds', 'readwrite')
    const store = tx.objectStore('feeds')

    feeds.forEach((category) => {
      category.feeds.forEach((feed) => {
        store.put({
          url: feed.xmlUrl,
          title: feed.title,
          category: category.category,
          cachedAt: Date.now(),
        })
      })
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save feeds:', error)
    return false
  }
}

// 获取订阅源
export async function getFeeds() {
  try {
    const db = await openDB()
    const tx = db.transaction('feeds', 'readonly')
    const store = tx.objectStore('feeds')

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get feeds:', error)
    return []
  }
}

// 保存已读状态
export async function saveReadStatus(articleKey) {
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readwrite')
    const store = tx.objectStore('readStatus')

    store.put({
      articleKey,
      readAt: Date.now(),
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save read status:', error)
    return false
  }
}

// 批量保存已读状态(mark all as read / localStorage 迁移场景,单条事务)
export async function saveReadStatusBatch(articleKeys) {
  if (!Array.isArray(articleKeys) || articleKeys.length === 0) return true
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readwrite')
    const store = tx.objectStore('readStatus')
    const readAt = Date.now()

    articleKeys.forEach((articleKey) => {
      store.put({ articleKey, readAt })
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save read status batch:', error)
    return false
  }
}

// 批量保存已读记录(保留传入的 readAt,用于跨设备同步合并)
// 跟 saveReadStatusBatch 的区别:那个统一使用 Date.now(),这个保留原始时间戳
export async function saveReadStatusRecordsBatch(records) {
  if (!Array.isArray(records) || records.length === 0) return true
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readwrite')
    const store = tx.objectStore('readStatus')

    records.forEach((rec) => {
      if (!rec?.articleKey) return
      store.put({ articleKey: rec.articleKey, readAt: rec.readAt ?? Date.now() })
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save read status records batch:', error)
    return false
  }
}

// 按 id 查单篇文章(供 sync 模块从 articles store 回填 readingList 的 content)
// id 格式跟 articles store 的 keyPath 一致:`${feedUrl}-${guid || link}`
export async function getArticleById(id) {
  try {
    const db = await openDB()
    const tx = db.transaction('articles', 'readonly')
    const store = tx.objectStore('articles')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get article by id:', error)
    return null
  }
}

// 获取所有已读记录(含 readAt 时间戳,供同步模块使用)
// 跟 getAllReadStatus() 的区别:那个返回 {articleKey: true} map,这个返回原始记录数组
export async function getAllReadStatusRecords() {
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readonly')
    const store = tx.objectStore('readStatus')

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get all read status records:', error)
    return []
  }
}

// 获取已读状态
export async function getReadStatus(articleKey) {
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readonly')
    const store = tx.objectStore('readStatus')

    return new Promise((resolve, reject) => {
      const request = store.get(articleKey)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get read status:', error)
    return null
  }
}

// 获取所有已读状态
export async function getAllReadStatus() {
  try {
    const db = await openDB()
    const tx = db.transaction('readStatus', 'readonly')
    const store = tx.objectStore('readStatus')

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const statusMap = {}
        request.result?.forEach((item) => {
          statusMap[item.articleKey] = true
        })
        resolve(statusMap)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get all read status:', error)
    return {}
  }
}

// 保存文章到阅读列表
export async function saveToReadingList(article) {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readwrite')
    const store = tx.objectStore('readingList')

    const id = article.id ?? `${article.feedUrl}-${article.guid || article.link}`
    store.put({
      id,
      ...article,
      // 同步回写要保留已合并过的 savedAt,否则每次 sync 都会把收藏时间刷新成“现在”
      savedAt: article.savedAt ?? Date.now(),
    })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save to reading list:', error)
    return false
  }
}

// 从阅读列表移除文章 — 写墓碑而非真删,防止跨设备同步 UNION merge 把已删条目合回来
export async function removeFromReadingList(articleId) {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readwrite')
    const store = tx.objectStore('readingList')

    const existing = await new Promise((resolve, reject) => {
      const req = store.get(articleId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (existing) {
      store.put({ ...existing, removedAt: Date.now() })
    } else {
      store.put({ id: articleId, removedAt: Date.now() })
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to remove from reading list:', error)
    return false
  }
}

// 获取阅读列表所有文章
export async function getReadingList() {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readonly')
    const store = tx.objectStore('readingList')

    return new Promise((resolve, reject) => {
      const request = store.getAll()

      request.onsuccess = () => {
        const articles = (request.result || [])
          .filter(a => !a.removedAt) // 过滤墓碑
        // 按保存时间倒序排列
        articles.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
        resolve(articles)
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get reading list:', error)
    return []
  }
}

// 获取阅读列表所有条目(含墓碑),供同步模块使用
export async function getReadingListWithTombstones() {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readonly')
    const store = tx.objectStore('readingList')

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get reading list with tombstones:', error)
    return []
  }
}

// 按 ID 获取阅读列表中的单条记录(含 content),供同步模块保留本地 content
export async function getReadingListItemById(articleId) {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readonly')
    const store = tx.objectStore('readingList')

    return new Promise((resolve, reject) => {
      const request = store.get(articleId)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get reading list item by id:', error)
    return null
  }
}

// 检查文章是否在阅读列表中
export async function isInReadingList(articleId) {
  try {
    const db = await openDB()
    const tx = db.transaction('readingList', 'readonly')
    const store = tx.objectStore('readingList')

    return new Promise((resolve, reject) => {
      const request = store.get(articleId)
      request.onsuccess = () => resolve(!!request.result && !request.result.removedAt)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to check reading list:', error)
    return false
  }
}

// 清理孤儿:feedUrl 不在 validFeedUrls 集合里的 articles + feedMeta 记录
// 使用场景:用户删除/OPML 导入覆盖了订阅源后,同步清理残留的缓存文章
// 不动 readStatus 和 readingList——前者小成本留着,后者是用户显式收藏
// 返回各 store 删除的条数 { articles, feedMeta }
export async function pruneOrphanedArticles(validFeedUrls) {
  const validSet = validFeedUrls instanceof Set ? validFeedUrls : new Set(validFeedUrls)
  let articlesDeleted = 0
  let feedMetaDeleted = 0

  try {
    const db = await openDB()

    // 1. articles store:按 feedUrl 字段判断
    await new Promise((resolve, reject) => {
      const tx = db.transaction('articles', 'readwrite')
      const store = tx.objectStore('articles')
      const request = store.openCursor()
      request.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          const { feedUrl } = cursor.value
          if (feedUrl && !validSet.has(feedUrl)) {
            cursor.delete()
            articlesDeleted++
          }
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    // 2. feedMeta store:keyPath 就是 feedUrl
    await new Promise((resolve, reject) => {
      const tx = db.transaction('feedMeta', 'readwrite')
      const store = tx.objectStore('feedMeta')
      const request = store.openCursor()
      request.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          if (!validSet.has(cursor.key)) {
            cursor.delete()
            feedMetaDeleted++
          }
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    if (articlesDeleted > 0 || feedMetaDeleted > 0) {
      console.log(`[DB] Pruned ${articlesDeleted} orphaned articles, ${feedMetaDeleted} feedMeta entries`)
    }
  } catch (error) {
    console.error('[DB] Prune failed:', error)
  }

  return { articles: articlesDeleted, feedMeta: feedMetaDeleted }
}

// 清理过期缓存（超过 7 天）,但保留阅读列表中文章的 content
export async function clearExpiredCache() {
  try {
    // 先收集仍在阅读列表中的文章 ID,这些文章的缓存要保留
    // 墓碑代表“已移除”,不能继续阻止缓存过期清理
    const savedItems = await getReadingListWithTombstones()
    const savedIds = new Set(savedItems.filter(item => !item.removedAt).map(item => item.id))

    const db = await openDB()
    const tx = db.transaction('articles', 'readwrite')
    const store = tx.objectStore('articles')
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    const request = store.openCursor()
    let deletedCount = 0

    request.onsuccess = (event) => {
      const cursor = event.target.result
      if (cursor) {
        const article = cursor.value
        if (article.cachedAt && (now - article.cachedAt) > sevenDays && !savedIds.has(article.id)) {
          cursor.delete()
          deletedCount++
        }
        cursor.continue()
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log(`[DB] Cleared ${deletedCount} expired articles`)
        resolve(deletedCount)
      }
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to clear cache:', error)
    return 0
  }
}

// 保存 feed 的最近 fetch 时间（per-feed 5min TTL 热缓存依赖这个）
export async function saveFeedMeta(feedUrl, lastFetchedAt = Date.now()) {
  try {
    const db = await openDB()
    const tx = db.transaction('feedMeta', 'readwrite')
    const store = tx.objectStore('feedMeta')

    store.put({ feedUrl, lastFetchedAt })

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.error('[DB] Failed to save feed meta:', error)
    return false
  }
}

// 读取 feed 的最近 fetch 时间，未命中返回 null
export async function getFeedMeta(feedUrl) {
  try {
    const db = await openDB()
    const tx = db.transaction('feedMeta', 'readonly')
    const store = tx.objectStore('feedMeta')

    return new Promise((resolve, reject) => {
      const request = store.get(feedUrl)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[DB] Failed to get feed meta:', error)
    return null
  }
}

export default {
  openDB,
  saveArticles,
  getArticles,
  getArticleById,
  saveFeeds,
  getFeeds,
  saveReadStatus,
  saveReadStatusBatch,
  saveReadStatusRecordsBatch,
  getReadStatus,
  getAllReadStatus,
  getAllReadStatusRecords,
  saveToReadingList,
  removeFromReadingList,
  getReadingList,
  getReadingListWithTombstones,
  getReadingListItemById,
  isInReadingList,
  clearExpiredCache,
  pruneOrphanedArticles,
  saveFeedMeta,
  getFeedMeta,
}
