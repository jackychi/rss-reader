/**
 * IndexedDB 工具 - 用于存储 RSS 文章实现离线阅读
 * 数据库名: CatReaderDB
 * 对象存储:
 *   - articles: 文章内容
 *   - feeds: 订阅源信息
 *   - readStatus: 已读状态
 */

const DB_NAME = 'CatReaderDB'
const DB_VERSION = 1

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
export async function getArticles(feedUrl = null, limit = 100) {
  try {
    const db = await openDB()
    const tx = db.transaction('articles', 'readonly')
    const store = tx.objectStore('articles')
    const index = feedUrl ? store.index('feedUrl') : null

    return new Promise((resolve, reject) => {
      const request = index
        ? index.getAll(IDBKeyRange.only(feedUrl), limit)
        : store.getAll()

      request.onsuccess = () => {
        const articles = request.result || []
        // 按发布时间排序
        articles.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))
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

// 清理过期缓存（超过 7 天）
export async function clearExpiredCache() {
  try {
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
        if (article.cachedAt && (now - article.cachedAt) > sevenDays) {
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

export default {
  openDB,
  saveArticles,
  getArticles,
  saveFeeds,
  getFeeds,
  saveReadStatus,
  getReadStatus,
  getAllReadStatus,
  clearExpiredCache,
}
