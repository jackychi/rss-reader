import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// 数据和组件
import { defaultFeeds } from './data/defaultFeeds'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useRSSFetcher } from './hooks/useRSSFetcher'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { saveArticles, getArticles, clearExpiredCache, saveToReadingList, removeFromReadingList, getReadingList, saveFeedMeta, getAllReadStatus, saveReadStatusBatch, pruneOrphanedArticles, setActiveUserId, migrateLegacyUserState } from './utils/db'
import { getArticleKey } from './utils/articleKey'
import { ensureSyncId, getSyncId, setSyncId, generateSyncId, normalizePositionMap, syncNow } from './utils/sync'
import { CATREADER_API_URL } from './utils/constants'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import Reader from './components/Reader'
import ReadingList from './components/ReadingList'
import AskCatDrawer from './components/AskCatDrawer'
import ShortcutsOverlay from './components/ShortcutsOverlay'

// 常量
const STORAGE_KEYS = {
  FEEDS: 'rss-reader-feeds',
  FONT_SIZE: 'rss-reader-font-size',
  THEME: 'rss-reader-theme',
  EXPANDED_CATS: 'rss-reader-expanded-cats',
  READ_POSITIONS: 'rss-reader-read-positions',
  AUDIO_POSITIONS: 'rss-reader-audio-positions',
  SERVER_ARTICLE_COUNT: 'rss-reader-server-article-count',
}

// 已迁移到 IndexedDB 的遗留 localStorage 键,启动时一次性清掉
const LEGACY_ARTICLE_CACHE_KEY = 'rss-reader-article-cache'
const LEGACY_READ_STATUS_KEY = 'rss-reader-read-status'
const USER_STATE_RETRY_DELAY_MS = 10_000

function toParagraphHtml(text) {
  const escapeHtml = (input) => input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

// 文章列表分页大小:首次加载和滚动加载更多都用这个
// 避免一次性渲染上万条把页面卡死
const ARTICLE_PAGE_SIZE = 200

function formatArticleCount(count) {
  return Number(count || 0).toLocaleString('en-US')
}

function normalizeServerArticle(article) {
  const publishedAt = article.publishedAt || article.pubDate || article.isoDate || ''
  return {
    ...article,
    feedUrl: article.feedUrl || article.feed_url || '',
    feedTitle: article.feedTitle || article.feed_title || '',
    contentSnippet: article.contentSnippet || article.content_snippet || '',
    pubDate: publishedAt,
    isoDate: publishedAt,
  }
}

async function fetchServerStats() {
  const res = await fetch(`${CATREADER_API_URL}/api/stats`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchServerArticles({ feedUrl = '', category = '', search = '', limit = ARTICLE_PAGE_SIZE, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  if (feedUrl) params.set('feed_url', feedUrl)
  if (category) params.set('category', category)
  if (search) params.set('q', search)

  const res = await fetch(`${CATREADER_API_URL}/api/articles?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.items || []).map(normalizeServerArticle)
}

async function fetchServerArticle(id) {
  const res = await fetch(`${CATREADER_API_URL}/api/articles/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return normalizeServerArticle(await res.json())
}

async function refreshServerArticles({ feedUrl = '', category = '' } = {}) {
  const body = { wait: true }
  if (feedUrl) body.feedUrl = feedUrl
  if (category) body.category = category

  const res = await fetch(`${CATREADER_API_URL}/api/admin/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function positionValue(record) {
  if (typeof record === 'number') return record
  return Number(record?.position || 0)
}

function positionMapsEqual(a, b) {
  const left = normalizePositionMap(a)
  const right = normalizePositionMap(b)
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) =>
    right[key] &&
    left[key].position === right[key].position &&
    left[key].updatedAt === right[key].updatedAt
  )
}

function userStorageKey(key, syncId) {
  return `${key}:${syncId}`
}

function readUserStorage(key, syncId, fallback) {
  if (!syncId) return fallback
  try {
    const scopedKey = userStorageKey(key, syncId)
    const item = localStorage.getItem(scopedKey)
    if (item) return JSON.parse(item)

    // 迁移老版本全局阅读位置到当前自动用户 ID。只在新 user-scoped key 为空时读取。
    const legacyMarker = `${key}:legacy-migrated`
    if (localStorage.getItem(legacyMarker) === '1') return fallback
    const legacy = localStorage.getItem(key)
    if (!legacy) return fallback
    localStorage.setItem(scopedKey, legacy)
    localStorage.setItem(legacyMarker, '1')
    return JSON.parse(legacy)
  } catch (error) {
    console.error(`Error reading localStorage key "${key}" for user "${syncId}":`, error)
    return fallback
  }
}

function writeUserStorage(key, syncId, value) {
  if (!syncId) return
  try {
    localStorage.setItem(userStorageKey(key, syncId), JSON.stringify(value))
  } catch (error) {
    console.error(`Error setting localStorage key "${key}" for user "${syncId}":`, error)
  }
}

function App() {
  // ============ 状态管理 ============
  // 订阅源 - 持久化
  const [feeds, setFeeds] = useLocalStorage(STORAGE_KEYS.FEEDS, defaultFeeds)
  // 字体大小 - 持久化
  const [fontSize, setFontSize] = useLocalStorage(STORAGE_KEYS.FONT_SIZE, 16)
  // 主题 - 持久化
  const [theme, setTheme] = useLocalStorage(STORAGE_KEYS.THEME, 'light')
  // 分类展开状态 - 持久化
  const [expandedCategories, setExpandedCategories] = useLocalStorage(STORAGE_KEYS.EXPANDED_CATS, {})
  // 用户 ID。当前阶段用 syncid 作为用户标识;后续可替换为墨问用户系统。
  const [syncId, setSyncIdState] = useState(() => ensureSyncId())
  // 阅读位置/音频播放位置 - 按 syncid 隔离持久化
  const [readPositions, setReadPositionsState] = useState(() => readUserStorage(STORAGE_KEYS.READ_POSITIONS, getSyncId(), {}))
  const [audioPositions, setAudioPositionsState] = useState(() => readUserStorage(STORAGE_KEYS.AUDIO_POSITIONS, getSyncId(), {}))
  // 服务端统一生成的栏目介绍,按 feed URL 建索引。
  const [serverFeedIntros, setServerFeedIntros] = useState({})

  // 已读/未读状态 - 内存镜像,持久化层是 IndexedDB readStatus store
  // readSet: 已读文章 key 集合,O(1) 查询
  // unreadByFeed: 每个 feed 的未读 key 集合,计算未读数只需 set.size
  const [readSet, setReadSet] = useState(() => new Set())
  const [unreadByFeed, setUnreadByFeed] = useState(() => new Map())
  const [idbReady, setIdbReady] = useState(false)   // 本地 IDB 加载完成
  const [dataReady, setDataReady] = useState(false) // 本地 IDB 状态可用于首屏显示

  // 其他状态
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [readerVisible, setReaderVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSwitchingFeed, setIsSwitchingFeed] = useState(false)
  // 分页状态:每次 select 重置,handleLoadMore 累加
  // hasMore 用"本次返回 < PAGE_SIZE 即到底"判断,不需要后端 total
  const [pageOffset, setPageOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [articleSearchQuery, setArticleSearchQuery] = useState('')
  // 阅读列表状态
  const [readingList, setReadingList] = useState([])
  const [showReadingList, setShowReadingList] = useState(false)
  const [serverArticleCount, setServerArticleCount] = useLocalStorage(STORAGE_KEYS.SERVER_ARTICLE_COUNT, 0)

  // Ask Cat 抽屉状态(始终挂载组件,仅切换可见性)
  const [isAskCatOpen, setIsAskCatOpen] = useState(false)
  // 快捷键帮助浮层
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false)
  const [feedIntroStatus, setFeedIntroStatus] = useState('idle') // idle | loading | ready | empty | error
  const [feedIntroError, setFeedIntroError] = useState(null)

  // 用户状态自动保存/加载状态
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | ok | error
  const [syncError, setSyncError] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const syncPushTimerRef = useRef(null)
  const syncRetryTimerRef = useRef(null)
  const syncInitRef = useRef(false) // 跳过 mount 时首次 auto-push(只响应真正变化)
  const syncInFlightRef = useRef(false) // 防止同一设备并发 doSync(上一次还没回来不起新的)
  const initialSyncDoneRef = useRef(false)

  const setReadPositions = useCallback((value) => {
    setReadPositionsState((prev) => {
      const next = value instanceof Function ? value(prev) : value
      writeUserStorage(STORAGE_KEYS.READ_POSITIONS, syncId, next)
      return next
    })
  }, [syncId])

  const setAudioPositions = useCallback((value) => {
    setAudioPositionsState((prev) => {
      const next = value instanceof Function ? value(prev) : value
      writeUserStorage(STORAGE_KEYS.AUDIO_POSITIONS, syncId, next)
      return next
    })
  }, [syncId])

  // ============ 用户状态自动保存/加载 ============
  // applySyncResult:把 syncNow 返回的合并状态应用到 React state
  // 关键点:compare-before-update——如果合并结果与当前 state 内容一致,不触发 setState,
  // 从而避免"auto-push useEffect 再次触发 syncNow"的死循环
  const applySyncResult = useCallback((result) => {
    setReadSet(prev => {
      if (prev.size === result.readSet.size) {
        let allSame = true
        for (const k of result.readSet) {
          if (!prev.has(k)) { allSame = false; break }
        }
        if (allSame) return prev
      }
      return result.readSet
    })

    setReadingList(prev => {
      if (prev.length === result.readingList.length) {
        const prevIds = new Set(prev.map(a => getArticleKey(a)))
        const allMatch = result.readingList.every(a => prevIds.has(getArticleKey(a)))
        if (allMatch) return prev
      }
      return result.readingList
    })

    if (result.readPositions) {
      setReadPositions(prev => (
        positionMapsEqual(prev, result.readPositions) ? prev : result.readPositions
      ))
    }
    if (result.audioPositions) {
      setAudioPositions(prev => (
        positionMapsEqual(prev, result.audioPositions) ? prev : result.audioPositions
      ))
    }

    // 新同步来的已读 key,要从 unreadByFeed 里相应 feed 的 Set 中移除
    setUnreadByFeed(prev => {
      const next = new Map()
      for (const [feedUrl, keys] of prev) {
        const filtered = new Set()
        for (const k of keys) {
          if (!result.readSet.has(k)) filtered.add(k)
        }
        next.set(feedUrl, filtered)
      }
      return next
    })
  }, [setAudioPositions, setReadPositions])

  const doSync = useCallback(async () => {
    const id = syncId || getSyncId()
    if (!id) return
    if (syncInFlightRef.current) return // 已有同步在途,跳过;下次状态变化会重新触发
    syncInFlightRef.current = true
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const result = await syncNow(id, { readPositions, audioPositions })
      applySyncResult(result)
      setSyncStatus('ok')
      setLastSyncedAt(Date.now())
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current)
        syncRetryTimerRef.current = null
      }
    } catch (err) {
      console.error('[App] sync failed:', err)
      setSyncStatus('error')
      setSyncError(err?.message || String(err))
    } finally {
      syncInFlightRef.current = false
    }
  }, [applySyncResult, audioPositions, readPositions, syncId])

  const handleCreateUserId = useCallback(() => {
    const id = generateSyncId()
    setSyncId(id)
    setSyncIdState(id)
  }, [])

  const handleSetUserId = useCallback((id) => {
    try {
      const normalized = setSyncId(id)
      setSyncIdState(normalized)
    } catch (err) {
      setSyncError(err?.message || '用户 ID 不合法')
      setSyncStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!syncId) return
    setActiveUserId(syncId)
    setReadPositionsState(readUserStorage(STORAGE_KEYS.READ_POSITIONS, syncId, {}))
    setAudioPositionsState(readUserStorage(STORAGE_KEYS.AUDIO_POSITIONS, syncId, {}))
    setReadSet(new Set())
    setUnreadByFeed(new Map())
    setReadingList([])
    setIdbReady(false)
    setDataReady(false)
    setLastSyncedAt(null)
    setSyncError(null)
    setSyncStatus('idle')
    syncInitRef.current = false
    initialSyncDoneRef.current = false
    if (syncPushTimerRef.current) {
      clearTimeout(syncPushTimerRef.current)
      syncPushTimerRef.current = null
    }
    if (syncRetryTimerRef.current) {
      clearTimeout(syncRetryTimerRef.current)
      syncRetryTimerRef.current = null
    }
  }, [syncId])

  // 切换阅读列表视图
  const handleToggleReadingList = useCallback(() => {
    if (showReadingList) {
      // 当前在阅读列表，退出
      setShowReadingList(false)
    } else {
      // 进入阅读列表，清空订阅源选中状态
      setSelectedFeed(null)
      setSelectedArticle(null)
      setShowReadingList(true)
    }
  }, [showReadingList])

  // 使用 RSS Fetcher Hook
  const { loading, articles, error, progress, createRequest, searchArticles, setArticles } = useRSSFetcher()

  // 网络状态检测
  const { isOnline } = useOnlineStatus()

  // 请求 ID，用于处理竞态条件
  const requestIdRef = useRef(0)

  // 过滤后的文章（支持搜索）
  const filteredArticles = useMemo(() => {
    if (!articleSearchQuery.trim()) return articles
    return searchArticles(articleSearchQuery, articles)
  }, [articles, articleSearchQuery, searchArticles])

  const activeNavigationArticles = useMemo(() => (
    showReadingList ? readingList : filteredArticles
  ), [showReadingList, readingList, filteredArticles])

  // 保存文章到 IndexedDB 缓存(仅依赖 articles/loading,避免 readSet 变化时重复写)
  useEffect(() => {
    if (articles.length === 0 || loading) return
    saveArticles(articles).then((success) => {
      if (success) console.log('[App] Articles cached to IndexedDB')
    }).catch((err) => {
      console.error('[App] Failed to cache articles:', err)
    })
  }, [articles, loading])

  const refreshServerStats = useCallback(() => {
    return fetchServerStats()
      .then((stats) => {
        setServerArticleCount(stats.articleCount || 0)
      })
      .catch((err) => {
        console.info('[Stats] backend stats unavailable:', err?.message || err)
      })
  }, [setServerArticleCount])

  useEffect(() => {
    refreshServerStats()
    const timer = window.setInterval(refreshServerStats, 60_000)
    return () => window.clearInterval(timer)
  }, [refreshServerStats])

  const refreshServerFeedIntros = useCallback((signal) => {
    return fetch(`${CATREADER_API_URL}/api/feeds`, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const next = {}
        for (const category of data.categories || []) {
          for (const feed of category.feeds || []) {
            if (feed.url && feed.intro?.content) {
              next[feed.url] = feed.intro
            }
          }
        }
        setServerFeedIntros(next)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        console.info('[FeedIntro] backend intros unavailable:', err?.message || err)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refreshServerFeedIntros(controller.signal)
    const timer = window.setInterval(() => {
      refreshServerFeedIntros()
    }, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [refreshServerFeedIntros])

  useEffect(() => {
    refreshServerFeedIntros()
  }, [selectedFeed?.xmlUrl, refreshServerFeedIntros])

  useEffect(() => {
    let cancelled = false
    const scheduleFeedIntroState = (status, error = null) => {
      queueMicrotask(() => {
        if (cancelled) return
        setFeedIntroError(error)
        setFeedIntroStatus(status)
      })
    }

    const isSingleFeed = selectedFeed?.xmlUrl &&
      selectedFeed.xmlUrl !== 'cached' &&
      !selectedFeed.xmlUrl.startsWith('category:')

    if (!isSingleFeed || selectedArticle || showReadingList) {
      scheduleFeedIntroState('idle')
      return () => { cancelled = true }
    }

    const serverIntro = serverFeedIntros[selectedFeed.xmlUrl]
    if (serverIntro?.content) {
      scheduleFeedIntroState('ready')
      return () => { cancelled = true }
    }

    if (isSwitchingFeed || loading) {
      scheduleFeedIntroState('loading')
      return () => { cancelled = true }
    }

    scheduleFeedIntroState('empty')
    return () => { cancelled = true }
  }, [
    selectedFeed,
    selectedArticle,
    showReadingList,
    serverFeedIntros,
    loading,
    isSwitchingFeed,
  ])

  // 增量维护 unreadByFeed:新 articles 里不在 readSet 的 key 加入对应 feed 的未读集合
  // 只加、不减(文章从 articles 里消失不等于已读)
  // 守卫 idbReady:readSet 从 IDB 加载完成之前不执行,避免用空 readSet 把所有文章
  // 算成未读,导致 sidebar 未读数先飙高再回落的闪烁
  useEffect(() => {
    if (!idbReady || articles.length === 0) return
    setUnreadByFeed(prev => {
      let changed = false
      const next = new Map(prev)
      for (const article of articles) {
        const key = getArticleKey(article)
        if (readSet.has(key)) continue
        const feedUrl = article.feedUrl
        const cur = next.get(feedUrl)
        if (cur?.has(key)) continue
        const n = new Set(cur || [])
        n.add(key)
        next.set(feedUrl, n)
        changed = true
      }
      return changed ? next : prev
    })
  }, [articles, readSet, idbReady])

  // ============ 初始化展开状态 ============
  useEffect(() => {
    if (feeds && feeds.length > 0) {
      setExpandedCategories(prev => {
        const initialExpanded = { ...prev }
        feeds.forEach(cat => {
          if (initialExpanded[cat.category] === undefined) {
            initialExpanded[cat.category] = false
          }
        })
        return initialExpanded
      })
    }
  }, [feeds, setExpandedCategories])

  // ============ 清理被移除订阅源的缓存 ============
  // feeds 变化时比对 IDB,清掉 articles + feedMeta 里不再订阅的 feedUrl 残留
  // 同步收缩 unreadByFeed 的内存镜像,sidebar 的未读数马上反映新状态
  useEffect(() => {
    if (!feeds || feeds.length === 0) return
    const validUrls = new Set(feeds.flatMap(cat => cat.feeds.map(f => f.xmlUrl)))
    pruneOrphanedArticles(validUrls).then(({ articles, feedMeta }) => {
      if (articles > 0 || feedMeta > 0) {
        setUnreadByFeed(prev => {
          const next = new Map()
          for (const [feedUrl, set] of prev) {
            if (validUrls.has(feedUrl)) next.set(feedUrl, set)
          }
          return next
        })
      }
    }).catch(err => console.error('[App] prune orphaned failed:', err))
  }, [feeds])

  // ============ 初始化已读状态 + 清理遗留的 localStorage 键 ============
  // articleCache 已迁到 feedMeta store,readStatus 已迁到 readStatus store
  // 这里做两件事:一次性把老用户的 localStorage readStatus 迁到 IDB,然后从
  // IDB 加载已读集合,派生出 per-feed 未读集合。
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!syncId) return
      // 1. 清理已经迁移的 articleCache 键(无需迁移,纯缓存)
      try { localStorage.removeItem(LEGACY_ARTICLE_CACHE_KEY) } catch { /* 忽略 */ }
      await migrateLegacyUserState(syncId)

      // 2. 一次性迁移 readStatus: localStorage -> IDB
      try {
        const legacy = localStorage.getItem(LEGACY_READ_STATUS_KEY)
        if (legacy) {
          const parsed = JSON.parse(legacy)
          const keys = Object.keys(parsed).filter(k => parsed[k] === true)
          if (keys.length > 0) {
            await saveReadStatusBatch(keys, syncId)
            console.log('[App] Migrated', keys.length, 'read-status entries from localStorage to IDB')
          }
          localStorage.removeItem(LEGACY_READ_STATUS_KEY)
        }
      } catch (err) {
        console.error('[App] readStatus migration failed:', err)
      }
      if (cancelled) return

      // 3. 从 IDB 加载已读集合,并根据缓存文章派生每个 feed 的未读集合
      try {
        const readMap = await getAllReadStatus(syncId)
        if (cancelled) return
        const read = new Set(Object.keys(readMap))

        const all = await getArticles()
        if (cancelled) return

        const unread = new Map()
        for (const article of all) {
          const key = getArticleKey(article)
          if (read.has(key)) continue
          const feedUrl = article.feedUrl
          if (!unread.has(feedUrl)) unread.set(feedUrl, new Set())
          unread.get(feedUrl).add(key)
        }

        // 合并式 set,避免覆盖 init 期间用户点击产生的 markAsRead 写入
        setReadSet(prev => prev.size === 0 ? read : new Set([...prev, ...read]))
        setUnreadByFeed(prev => {
          if (prev.size === 0) return unread
          const merged = new Map(prev)
          for (const [feedUrl, keys] of unread) {
            const cur = merged.get(feedUrl)
            merged.set(feedUrl, cur ? new Set([...cur, ...keys]) : keys)
          }
          return merged
        })
      } catch (err) {
        console.error('[App] readStatus init failed:', err)
      }
      if (!cancelled) setIdbReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [syncId])

  // ============ 启动时清理过期缓存 ============
  // 不再 mount 时自动展示缓存文章——上万条一次性渲染会卡死页面。
  // 等用户主动点 feed/category,handler 走分页拉取。
  useEffect(() => {
    clearExpiredCache().catch((err) => console.error('[App] clearExpiredCache failed:', err))
  }, [])

  // ============ 加载阅读列表 ============
  const loadReadingList = useCallback(async () => {
    try {
      const list = await getReadingList(syncId)
      setReadingList(list)
    } catch (error) {
      console.error('[App] Failed to load reading list:', error)
    }
  }, [syncId])

  useEffect(() => {
    loadReadingList()
  }, [loadReadingList])

  // 启动时不再自动全量抓 feed。文章展示优先走后端,IndexedDB 只作为本机缓存和离线兜底。

  // ============ 跨设备同步 - 初始同步 ============
  // syncId 存在且在线时触发一次 syncNow。syncId 变化(用户启用/配对)也会重跑。
  // IDB 就绪后先放行本地已读/未读显示;云端同步在后台合并并修正状态。
  useEffect(() => {
    if (!idbReady) return

    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true
      setDataReady(true)
    }

    if (!syncId || !isOnline) return

    const doInitialSync = async () => {
      try { await doSync() } catch { /* 同步失败也放行,避免卡死 */ }
    }
    doInitialSync()
  }, [syncId, isOnline, idbReady, doSync])

  // ============ 用户状态自动重试 ============
  // 后端启动较慢、临时断网或用户状态库短暂不可用时,失败后自动后台重试。
  useEffect(() => {
    if (syncStatus !== 'error' || !syncId || !isOnline) return
    if (syncRetryTimerRef.current) return

    syncRetryTimerRef.current = setTimeout(() => {
      syncRetryTimerRef.current = null
      doSync()
    }, USER_STATE_RETRY_DELAY_MS)

    return () => {
      if (syncRetryTimerRef.current) {
        clearTimeout(syncRetryTimerRef.current)
        syncRetryTimerRef.current = null
      }
    }
  }, [syncStatus, syncId, isOnline, doSync])

  // ============ 用户状态自动写回 ============
  // readSet / readingList / 阅读进度变化时 debounce 3s 调 syncNow。
  // syncInitRef 守卫 mount 时第一次变化(init useEffect 把 readSet 从空变有会触发)。
  // applySyncResult 里有 compare-before-update,sync 结果若与当前 state 相同不触发
  // 再次 setReadSet,从而断掉 "sync → setState → useEffect → sync" 的死循环。
  useEffect(() => {
    if (!syncInitRef.current) {
      syncInitRef.current = true
      return
    }
    if (!syncId || !isOnline) return

    if (syncPushTimerRef.current) {
      clearTimeout(syncPushTimerRef.current)
    }
    syncPushTimerRef.current = setTimeout(() => {
      doSync()
    }, 3000)

    return () => {
      if (syncPushTimerRef.current) {
        clearTimeout(syncPushTimerRef.current)
      }
    }
  }, [readSet, readingList, readPositions, audioPositions, syncId, isOnline, doSync])

  // ============ 主题处理 ============
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // 切换主题
  const toggleTheme = useCallback((themeId) => {
    if (themeId) {
      setTheme(themeId)
    } else {
      const themes = ['light', 'dark', 'warm']
      const currentIndex = themes.indexOf(theme)
      const nextIndex = (currentIndex + 1) % themes.length
      setTheme(themes[nextIndex])
    }
  }, [setTheme, theme])

  // ============ 计算未读数(O(feeds),从 unreadByFeed 派生) ============
  const unreadCounts = useMemo(() => {
    const counts = {}
    feeds.forEach(category => {
      let categoryUnread = 0
      category.feeds.forEach(feed => {
        const size = unreadByFeed.get(feed.xmlUrl)?.size || 0
        counts[`${category.category}-${feed.xmlUrl}`] = size
        categoryUnread += size
      })
      counts[category.category] = categoryUnread
    })
    return counts
  }, [feeds, unreadByFeed])

  // 未读文章 Set(ArticleList 用于红点标识,接口保持 Set 不变)
  const unreadArticles = useMemo(() => {
    if (selectedFeed?.xmlUrl === 'cached') {
      // "文章总计"视图:所有 feed 的未读合集
      const merged = new Set()
      unreadByFeed.forEach(set => set.forEach(k => merged.add(k)))
      return merged
    }
    if (selectedFeed?.xmlUrl?.startsWith('category:')) {
      // 分类视图:该分类下所有 feed 的未读合集
      const categoryObj = feeds.find(c => c.category === selectedFeed.category)
      if (!categoryObj) return new Set()
      const merged = new Set()
      for (const feed of categoryObj.feeds) {
        const set = unreadByFeed.get(feed.xmlUrl)
        if (set) set.forEach(k => merged.add(k))
      }
      return merged
    }
    if (selectedFeed?.xmlUrl) {
      return unreadByFeed.get(selectedFeed.xmlUrl) || new Set()
    }
    return new Set()
  }, [selectedFeed, unreadByFeed, feeds])

  // ============ 统一的标记已读 helper ============
  const markAsRead = useCallback((articleOrArticles) => {
    const list = Array.isArray(articleOrArticles) ? articleOrArticles : [articleOrArticles]
    if (list.length === 0) return

    // 按 feed 分组 key,方便后面从 unreadByFeed 里对应删除
    const keysByFeed = new Map()
    const allKeys = []
    for (const a of list) {
      if (!a) continue
      const k = getArticleKey(a)
      allKeys.push(k)
      if (!keysByFeed.has(a.feedUrl)) keysByFeed.set(a.feedUrl, new Set())
      keysByFeed.get(a.feedUrl).add(k)
    }
    if (allKeys.length === 0) return

    setReadSet(prev => {
      const next = new Set(prev)
      allKeys.forEach(k => next.add(k))
      return next
    })
    setUnreadByFeed(prev => {
      const next = new Map(prev)
      for (const [feedUrl, keySet] of keysByFeed) {
        const cur = next.get(feedUrl)
        if (!cur || cur.size === 0) continue
        const n = new Set(cur)
        keySet.forEach(k => n.delete(k))
        next.set(feedUrl, n)
      }
      return next
    })

    // IDB 写入 fire-and-forget,UI 不等
    saveReadStatusBatch(allKeys, syncId).catch(err =>
      console.error('[App] saveReadStatusBatch failed:', err)
    )
  }, [syncId])

  // ============ 辅助函数 ============
  const formatDate = useCallback((dateStr) => {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return '未知时间'
      return formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
    } catch {
      return '未知时间'
    }
  }, [])

  const getArticleImage = useCallback((article) => {
    if (article.mediaContent?.['$']?.url) {
      return article.mediaContent['$'].url
    }
    if (article.mediaThumbnail?.['$']?.url) {
      return article.mediaThumbnail['$'].url
    }
    if (article.enclosure?.url && article.enclosure.type?.startsWith('image')) {
      return article.enclosure.url
    }
    const content = article.content || article.contentSnippet || article.description || ''
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1]
    }
    return null
  }, [])

  const getArticleContent = useCallback((article) => {
    // 配置 DOMPurify 添加 target="_blank" 到所有链接
    const sanitizeOptions = {
      ADD_ATTR: ['target', 'rel']
    }

    if (article['content:encoded']) {
      let content = article['content:encoded']
      // 给所有链接添加 target="_blank" 和 rel="noopener noreferrer"
      content = content.replace(/<a([^>]*)>/g, '<a$1 target="_blank" rel="noopener noreferrer">')
      return DOMPurify.sanitize(content, sanitizeOptions)
    }
    if (article.content) {
      let content = article.content
      if (!/<[a-z][\s\S]*>/i.test(content) && content.includes('\n')) {
        content = toParagraphHtml(content)
      }
      content = content.replace(/<a([^>]*)>/g, '<a$1 target="_blank" rel="noopener noreferrer">')
      return DOMPurify.sanitize(content, sanitizeOptions)
    }
    return article.contentSnippet ? DOMPurify.sanitize(`<p>${article.contentSnippet}</p>`, sanitizeOptions) : ''
  }, [])

  const getArticleAudio = useCallback((article) => {
    const content = article.content || article['content:encoded'] || article.contentSnippet || ''
    const enclosureUrl = article.enclosure?.url || article.enclosure?.link
    if (enclosureUrl && (article.enclosure?.type?.includes('audio') || /\.(mp3|m4a|wav|ogg|aac)(?:[?#].*)?$/i.test(enclosureUrl))) {
      return enclosureUrl
    }
    if (article.mediaContent?.url && article.mediaContent?.type?.startsWith('audio')) {
      return article.mediaContent.url
    }
    const audioMatch = content.match(/<audio[^>]*src=["']([^"']+)["'][^>]*>/i)
    if (audioMatch) return audioMatch[1]
    const sourceMatch = content.match(/<source[^>]*src=["']([^"']+)["'][^>]*>/i)
    if (sourceMatch) return sourceMatch[1]
    const audioLinkMatch = content.match(/href=["']([^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/i)
    if (audioLinkMatch) return audioLinkMatch[1]
    const dataSrcMatch = content.match(/(?:data-src|src)=["']([^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/i)
    if (dataSrcMatch) return dataSrcMatch[1]
    return null
  }, [])

  // ============ 事件处理 ============
  // 文章内容以后端为主,IndexedDB 只做本机缓存和离线兜底。
  const handleSelectFeed = useCallback(async (_category, feed) => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed(feed)
    setSelectedArticle(null)
    setShowOriginal(false)
    setShowReadingList(false)
    setArticleSearchQuery('')
    setIsFullscreen(false)

    // 立即清空,防止上一个视图的旧文章残留在屏上
    setIsSwitchingFeed(true)
    setArticles([])
    setPageOffset(0)
    setHasMore(false)

    try {
      const serverArticles = await fetchServerArticles({ feedUrl: feed.xmlUrl })
      if (currentId !== requestIdRef.current) return
      setArticles(serverArticles)
      setPageOffset(serverArticles.length)
      setHasMore(serverArticles.length === ARTICLE_PAGE_SIZE)
      setIsSwitchingFeed(false)
      if (serverArticles.length > 0) {
        await saveArticles(serverArticles)
        await saveFeedMeta(feed.xmlUrl, Date.now())
      }
      return
    } catch {
      const cachedArticles = await getArticles(feed.xmlUrl)
      if (currentId !== requestIdRef.current) return
      setArticles(cachedArticles)
      setIsSwitchingFeed(false)
    }
  }, [createRequest, setArticles])

  const handleSelectAll = useCallback(async () => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed({ title: `文章总计 ${formatArticleCount(serverArticleCount)}`, xmlUrl: 'cached' })
    setSelectedArticle(null)
    setShowOriginal(false)
    setShowReadingList(false) // 切换到文章总计时退出阅读列表视图
    setArticleSearchQuery('')
    setIsFullscreen(false) // 切换到文章总计时退出全屏模式

    // 立即清空,防止上一个视图的旧文章残留在屏上
    setIsSwitchingFeed(true)
    setArticles([])
    setPageOffset(0)
    setHasMore(false)

    try {
      const [stats, serverArticles] = await Promise.all([
        fetchServerStats(),
        fetchServerArticles(),
      ])
      if (currentId !== requestIdRef.current) return
      setServerArticleCount(stats.articleCount || 0)
      setSelectedFeed({ title: `文章总计 ${formatArticleCount(stats.articleCount)}`, xmlUrl: 'cached' })
      setArticles(serverArticles)
      setPageOffset(serverArticles.length)
      setHasMore(serverArticles.length === ARTICLE_PAGE_SIZE)
      setIsSwitchingFeed(false)
      if (serverArticles.length > 0) await saveArticles(serverArticles)
    } catch {
      const cachedArticles = await getArticles()
      if (currentId !== requestIdRef.current) return
      setArticles(cachedArticles)
      setIsSwitchingFeed(false)
    }
  }, [createRequest, serverArticleCount, setArticles, setServerArticleCount])

  // 选中某个分类(folder):展示该分类下所有 feed 的缓存文章;refresh 会批量抓所有 feed
  // 用 xmlUrl 前缀 `category:` 作为 sentinel,跟单 feed / "cached" 区分
  const handleSelectCategory = useCallback(async (categoryName) => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    const categoryObj = feeds.find(c => c.category === categoryName)
    if (!categoryObj) return

    setSelectedFeed({
      title: categoryName,
      xmlUrl: `category:${categoryName}`,
      category: categoryName,
    })
    setSelectedArticle(null)
    setShowOriginal(false)
    setShowReadingList(false)
    setArticleSearchQuery('')
    setIsFullscreen(false)

    // 立即清空,防止上一个视图的旧文章残留在屏上
    setIsSwitchingFeed(true)
    setArticles([])
    setPageOffset(0)
    setHasMore(false)

    try {
      const serverArticles = await fetchServerArticles({ category: categoryName })
      if (currentId !== requestIdRef.current) return
      setArticles(serverArticles)
      setPageOffset(serverArticles.length)
      setHasMore(serverArticles.length === ARTICLE_PAGE_SIZE)
      setIsSwitchingFeed(false)
      if (serverArticles.length > 0) await saveArticles(serverArticles)
    } catch {
      const feedUrls = new Set(categoryObj.feeds.map(f => f.xmlUrl))
      const all = await getArticles()
      if (currentId !== requestIdRef.current) return
      setIsSwitchingFeed(false)
      const filtered = all
        .filter(a => feedUrls.has(a.feedUrl))
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      setArticles(filtered)
    }
  }, [feeds, createRequest, setArticles])

  // 手动刷新:由 Go 后端抓取当前范围并写入 SQLite,完成后再从后端重新加载当前视图。
  // 如果刷新期间用户切走了,requestIdRef 不匹配就跳过 UI 更新。
  const handleRefresh = useCallback(async () => {
    if (!selectedFeed) return
    const currentId = createRequest()
    requestIdRef.current = currentId
    setIsRefreshing(true)

    // 刷新等同重新拉第一页,把分页指针归零
    const commitFirstPage = (serverArticles) => {
      setArticles(serverArticles)
      setPageOffset(serverArticles.length)
      setHasMore(serverArticles.length === ARTICLE_PAGE_SIZE)
    }

    try {
      // 文章总计:以后端为准,IndexedDB 只做失败兜底
      if (selectedFeed.xmlUrl === 'cached') {
        try {
          await refreshServerArticles()
          const [stats, serverArticles] = await Promise.all([
            fetchServerStats(),
            fetchServerArticles(),
          ])
          if (currentId !== requestIdRef.current) return
          setServerArticleCount(stats.articleCount || 0)
          setSelectedFeed({ title: `文章总计 ${formatArticleCount(stats.articleCount)}`, xmlUrl: 'cached' })
          commitFirstPage(serverArticles)
          if (serverArticles.length > 0) await saveArticles(serverArticles)
        } catch {
          const cachedArticles = await getArticles()
          if (currentId !== requestIdRef.current) return
          setArticles(cachedArticles)
        }
        return
      }

      if (selectedFeed.xmlUrl?.startsWith('category:')) {
        await refreshServerArticles({ category: selectedFeed.category })
        if (currentId !== requestIdRef.current) return
        const serverArticles = await fetchServerArticles({ category: selectedFeed.category })
        if (currentId !== requestIdRef.current) return
        commitFirstPage(serverArticles)
        if (serverArticles.length > 0) await saveArticles(serverArticles)
        return
      }

      await refreshServerArticles({ feedUrl: selectedFeed.xmlUrl })
      if (currentId !== requestIdRef.current) return
      const serverArticles = await fetchServerArticles({ feedUrl: selectedFeed.xmlUrl })
      if (currentId !== requestIdRef.current) return
      commitFirstPage(serverArticles)
      if (serverArticles.length > 0) await saveArticles(serverArticles)
    } finally {
      setIsRefreshing(false)
    }
  }, [selectedFeed, createRequest, setArticles, setServerArticleCount])

  // 滚动加载更多:接 ArticleList 末尾的 sentinel(IntersectionObserver),按 PAGE_SIZE 累加
  // 切换 feed 时 requestId 会自增,旧请求即使回来也会被守卫丢弃
  const handleLoadMore = useCallback(async () => {
    if (!selectedFeed || isLoadingMore || !hasMore) return
    if (isSwitchingFeed || isRefreshing) return

    const currentId = requestIdRef.current
    setIsLoadingMore(true)

    const params = { limit: ARTICLE_PAGE_SIZE, offset: pageOffset }
    if (selectedFeed.xmlUrl?.startsWith('category:')) {
      params.category = selectedFeed.category
    } else if (selectedFeed.xmlUrl && selectedFeed.xmlUrl !== 'cached') {
      params.feedUrl = selectedFeed.xmlUrl
    }

    try {
      const more = await fetchServerArticles(params)
      if (currentId !== requestIdRef.current) return
      if (more.length > 0) {
        setArticles((prev) => [...prev, ...more])
        setPageOffset((prev) => prev + more.length)
      }
      setHasMore(more.length === ARTICLE_PAGE_SIZE)
    } catch (err) {
      console.error('[App] loadMore failed:', err)
    } finally {
      if (currentId === requestIdRef.current) setIsLoadingMore(false)
    }
  }, [selectedFeed, isLoadingMore, hasMore, isSwitchingFeed, isRefreshing, pageOffset, setArticles])

  // 标记当前订阅源(或 "文章总计" / 分类视图下所有 feed)的未读文章为已读
  // 直接从 unreadByFeed 里取 key,不需要回头扫 articles
  const handleMarkAllAsRead = useCallback(() => {
    const isAll = selectedFeed?.xmlUrl === 'cached'
    const isCategory = selectedFeed?.xmlUrl?.startsWith('category:')
    const allKeys = []
    const feedsToClear = []

    if (isAll) {
      unreadByFeed.forEach((set, feedUrl) => {
        if (set.size === 0) return
        set.forEach(k => allKeys.push(k))
        feedsToClear.push(feedUrl)
      })
    } else if (isCategory) {
      const categoryObj = feeds.find(c => c.category === selectedFeed.category)
      if (!categoryObj) return
      for (const feed of categoryObj.feeds) {
        const set = unreadByFeed.get(feed.xmlUrl)
        if (!set || set.size === 0) continue
        set.forEach(k => allKeys.push(k))
        feedsToClear.push(feed.xmlUrl)
      }
    } else {
      const feedUrl = selectedFeed?.xmlUrl
      const set = feedUrl ? unreadByFeed.get(feedUrl) : null
      if (!set || set.size === 0) return
      set.forEach(k => allKeys.push(k))
      feedsToClear.push(feedUrl)
    }

    if (allKeys.length === 0) return

    setReadSet(prev => {
      const next = new Set(prev)
      allKeys.forEach(k => next.add(k))
      return next
    })
    setUnreadByFeed(prev => {
      const next = new Map(prev)
      feedsToClear.forEach(f => next.set(f, new Set()))
      return next
    })

    saveReadStatusBatch(allKeys, syncId).catch(err =>
      console.error('[App] mark all as read IDB write failed:', err)
    )
  }, [selectedFeed, unreadByFeed, feeds, syncId])

  // 切换文章书签状态
  const handleToggleArticleBookmark = useCallback(async () => {
    if (!selectedArticle) return

    const articleKey = getArticleKey(selectedArticle)
    const isCurrentlyInList = readingList.some(a => getArticleKey(a) === articleKey)

    if (isCurrentlyInList) {
      await removeFromReadingList(articleKey, syncId)
      setReadingList(prev => prev.filter(a => getArticleKey(a) !== articleKey))
    } else {
      await saveToReadingList(selectedArticle, syncId)
      setReadingList(prev => [selectedArticle, ...prev])
    }
  }, [selectedArticle, readingList, syncId])

  // 检查文章是否在阅读列表中
  const isArticleInReadingList = useCallback(() => {
    if (!selectedArticle) return false
    const articleKey = getArticleKey(selectedArticle)
    return readingList.some(a => getArticleKey(a) === articleKey)
  }, [selectedArticle, readingList])

  // 从阅读列表移除文章
  const handleRemoveFromReadingList = useCallback(async (articleKey) => {
    await removeFromReadingList(articleKey, syncId)
    setReadingList(prev => prev.filter(a => getArticleKey(a) !== articleKey))
  }, [syncId])

  const hydrateSelectedArticle = useCallback((article) => {
    if ((!article.content || !article.enclosure?.url) && article.id) {
      fetchServerArticle(article.id)
        .then((fullArticle) => {
          setSelectedArticle((current) => (
            current && getArticleKey(current) === getArticleKey(article)
              ? { ...current, ...fullArticle }
              : current
          ))
        })
        .catch(() => {})
    }
  }, [])

  // 在阅读列表中选择文章
  const handleSelectFromReadingList = useCallback((article) => {
    setSelectedArticle(article)
    setShowOriginal(false)
    setReaderVisible(true)
    // 不退出阅读列表视图,不切换到频道
    markAsRead(article)
    hydrateSelectedArticle(article)
  }, [markAsRead, hydrateSelectedArticle])

  // 从文章阅读器跳转到对应 feed 专栏
  const handleNavigateToFeed = useCallback((article) => {
    const feedUrl = article.feedUrl
    if (!feedUrl) return
    // 在 feeds 中查找匹配的 category + feed
    for (const category of feeds) {
      for (const feed of category.feeds) {
        if (feed.xmlUrl === feedUrl) {
          // 展开对应分类
          if (!expandedCategories[category.category]) {
            setExpandedCategories(prev => ({ ...prev, [category.category]: true }))
          }
          handleSelectFeed(category.category, feed)
          // 确保侧边栏可见
          if (!sidebarVisible) setSidebarVisible(true)
          return
        }
      }
    }
  }, [feeds, expandedCategories, handleSelectFeed, sidebarVisible, setExpandedCategories])

  const handleImportOPML = useCallback(async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const text = await file.text()
    const parserDOM = new DOMParser()
    const xml = parserDOM.parseFromString(text, 'text/xml')

    const outlines = xml.querySelectorAll('outline[type="rss"], outline[xmlUrl]')
    const newFeeds = {}

    outlines.forEach(outline => {
      const xmlUrl = outline.getAttribute('xmlUrl')
      const text = outline.getAttribute('title') || outline.getAttribute('text')
      const parent = outline.parentElement
      let category = 'Uncategorized'

      if (parent && parent.getAttribute) {
        const parentText = parent.getAttribute('title') || parent.getAttribute('text')
        if (parentText && parentText !== 'Feeds') {
          category = parentText
        }
      }

      if (xmlUrl && text) {
        if (!newFeeds[category]) {
          newFeeds[category] = []
        }
        newFeeds[category].push({ title: text, xmlUrl })
      }
    })

    const mergedFeeds = Object.entries(newFeeds).map(([category, feeds]) => ({
      category,
      feeds
    }))

    if (mergedFeeds.length > 0) {
      setFeeds(prev => [...prev, ...mergedFeeds])
    }
  }, [setFeeds])

  // 获取文章的阅读位置
  const getArticleReadPosition = useCallback((article) => {
    return positionValue(readPositions[getArticleKey(article)])
  }, [readPositions])

  // 获取文章的音频位置
  const getArticleAudioPosition = useCallback((article) => {
    return positionValue(audioPositions[getArticleKey(article)])
  }, [audioPositions])

  // 更新阅读位置
  const handleUpdateReadPosition = useCallback((article, position) => {
    const articleKey = getArticleKey(article)
    setReadPositions(prev => ({ ...prev, [articleKey]: { position, updatedAt: Date.now() } }))
  }, [setReadPositions])

  // 更新音频位置
  const handleUpdateAudioPosition = useCallback((article, position) => {
    const articleKey = getArticleKey(article)
    setAudioPositions(prev => ({ ...prev, [articleKey]: { position, updatedAt: Date.now() } }))
  }, [setAudioPositions])

  // 选择文章时标记为已读
  const handleSelectArticle = useCallback((article) => {
    setSelectedArticle(article)
    setShowOriginal(false)
    setReaderVisible(true)
    markAsRead(article)
    hydrateSelectedArticle(article)
  }, [markAsRead, hydrateSelectedArticle])

  // Ask Cat 里点击引用时,打开对应文章
  // 不动 selectedFeed,让 Reader 直接展示这篇(相当于从聊天抽屉"插入阅读")
  // 抽屉保持打开,用户可以点多个引用轮流看
  const handleOpenArticleFromAskCat = useCallback((article) => {
    setSelectedArticle(article)
    setShowOriginal(false)
    setReaderVisible(true)
    markAsRead(article)
  }, [markAsRead])

  const toggleCategory = useCallback((category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }, [setExpandedCategories])

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => !prev)
  }, [])

  const closeReader = useCallback(() => {
    setReaderVisible(false)
    setIsFullscreen(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev)
  }, [])

  const toggleOriginal = useCallback((show) => {
    setShowOriginal(show)
  }, [])

  const handleFontSizeChange = useCallback((size) => {
    setFontSize(size)
  }, [setFontSize])

  // 文章搜索处理
  const handleArticleSearchChange = useCallback((query) => {
    setArticleSearchQuery(query)
  }, [])

  // ============ 键盘快捷键 ============

  const handleNextArticle = useCallback(() => {
    if (!activeNavigationArticles.length) return
    const currentIdx = selectedArticle
      ? activeNavigationArticles.findIndex(a => getArticleKey(a) === getArticleKey(selectedArticle))
      : -1
    const nextIdx = Math.min(activeNavigationArticles.length - 1, currentIdx + 1)
    const next = activeNavigationArticles[nextIdx]
    if (next && next !== selectedArticle) {
      if (showReadingList) handleSelectFromReadingList(next)
      else handleSelectArticle(next)
    }
  }, [activeNavigationArticles, selectedArticle, showReadingList, handleSelectFromReadingList, handleSelectArticle])

  const handlePrevArticle = useCallback(() => {
    if (!activeNavigationArticles.length) return
    const currentIdx = selectedArticle
      ? activeNavigationArticles.findIndex(a => getArticleKey(a) === getArticleKey(selectedArticle))
      : 0
    const prevIdx = Math.max(0, currentIdx - 1)
    const prev = activeNavigationArticles[prevIdx]
    if (prev && prev !== selectedArticle) {
      if (showReadingList) handleSelectFromReadingList(prev)
      else handleSelectArticle(prev)
    }
  }, [activeNavigationArticles, selectedArticle, showReadingList, handleSelectFromReadingList, handleSelectArticle])

  // v1 的 m 等同点击该文章(markAsRead 是单向的,"标记为未读"产品功能单独做)
  const handleToggleReadSelected = useCallback(() => {
    if (selectedArticle) markAsRead(selectedArticle)
  }, [selectedArticle, markAsRead])

  // Esc 按优先级逐层退出
  const handleEscape = useCallback(() => {
    if (showShortcutsOverlay) { setShowShortcutsOverlay(false); return }
    if (isFullscreen) { setIsFullscreen(false); return }
    if (isAskCatOpen) { setIsAskCatOpen(false); return }
    if (showReadingList) { setShowReadingList(false); return }
    if (articleSearchQuery) { setArticleSearchQuery(''); return }
  }, [showShortcutsOverlay, isFullscreen, isAskCatOpen, showReadingList, articleSearchQuery])

  // g s 聚焦侧栏搜索;Sidebar 结构稳定,querySelector 够用
  const handleFocusSidebarSearch = useCallback(() => {
    const input = document.querySelector('aside.sidebar input[type="text"]')
    if (input) input.focus()
  }, [])

  // 声明式 shortcuts 表:既驱动键盘,也驱动 ShortcutsOverlay 渲染
  const SHORTCUTS = useMemo(() => [
    // 导航
    { key: 'j',       group: '导航', description: '下一篇',        handler: handleNextArticle },
    { key: 'k',       group: '导航', description: '上一篇',        handler: handlePrevArticle },

    // 状态
    { key: 'm',       group: '状态', description: '标记已读',      handler: handleToggleReadSelected },
    { key: 'b',       group: '状态', description: '切换收藏',       handler: handleToggleArticleBookmark },
    { key: 'r',       group: '状态', description: '刷新当前',       handler: handleRefresh },
    { key: 'Shift+A', group: '状态', description: '标记全部已读',   handler: handleMarkAllAsRead },

    // 视图(f / v 只对"已打开的文章"有意义,没选中时 no-op)
    { key: 'f',       group: '视图', description: '切换全屏',       handler: () => { if (selectedArticle) toggleFullscreen() } },
    { key: 'v',       group: '视图', description: '在新标签页打开原文', handler: () => { if (selectedArticle?.link) window.open(selectedArticle.link, '_blank', 'noopener,noreferrer') } },
    { key: 'Escape',  group: '视图', description: '关闭 / 退出',     handler: handleEscape },

    // 跳转(chord)
    { key: 'g a',     group: '跳转', description: '文章总计',       handler: handleSelectAll },
    { key: 'g r',     group: '跳转', description: '阅读列表',       handler: () => { if (!showReadingList) handleToggleReadingList() } },
    { key: 'g s',     group: '跳转', description: '聚焦侧栏搜索',   handler: handleFocusSidebarSearch },

    // 应用
    { key: 'Mod+K',   group: '应用', description: '打开 Ask Cat',   handler: () => setIsAskCatOpen(true), allowInInput: true },
    { key: 'Alt+K',   group: '应用', description: '收起 Ask Cat',   handler: () => setIsAskCatOpen(false), allowInInput: true },
    { key: '?',       group: '应用', description: '显示此帮助',     handler: () => setShowShortcutsOverlay(true) },
  ], [
    handleNextArticle, handlePrevArticle, handleToggleReadSelected,
    handleToggleArticleBookmark, handleRefresh, handleMarkAllAsRead,
    toggleFullscreen, handleEscape,
    handleSelectAll, handleToggleReadingList, showReadingList,
    handleFocusSidebarSearch, selectedArticle,
  ])

  useKeyboardShortcuts(SHORTCUTS)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleSidebar={toggleSidebar}
        onRefresh={handleRefresh}
        onImportOPML={handleImportOPML}
        isRefreshing={isRefreshing}
        selectedFeed={selectedFeed}
        loading={loading}
        progress={progress}
        isOnline={isOnline}
        syncId={syncId}
        syncStatus={syncStatus}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
        onCreateUserId={handleCreateUserId}
        onSetUserId={handleSetUserId}
        isAskCatOpen={isAskCatOpen}
        onToggleAskCat={() => setIsAskCatOpen(v => !v)}
        onShowShortcuts={() => setShowShortcutsOverlay(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarVisible && (
          <Sidebar
            feeds={feeds}
            selectedFeed={selectedFeed}
            expandedCategories={expandedCategories}
            onToggleCategory={toggleCategory}
            onSelectFeed={handleSelectFeed}
            onSelectAll={handleSelectAll}
            onSelectCategory={handleSelectCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            unreadCounts={unreadCounts}
            dataReady={dataReady}
            articleCount={serverArticleCount}
            readingListCount={readingList.length}
            showReadingList={showReadingList}
            onToggleReadingList={handleToggleReadingList}
          />
        )}

        {/* Reading List - 全屏模式下隐藏 */}
        {!isFullscreen && showReadingList && (
          <ReadingList
            articles={readingList}
            onSelectArticle={handleSelectFromReadingList}
            onRemoveArticle={handleRemoveFromReadingList}
            getArticleImage={getArticleImage}
            formatDate={formatDate}
            selectedArticle={selectedArticle}
          />
        )}

        {/* Article List - 全屏模式下隐藏，且不在阅读列表视图时 */}
        {!isFullscreen && !showReadingList && (
          <ArticleList
            articles={filteredArticles}
            selectedFeed={selectedFeed}
            selectedArticle={selectedArticle}
            loading={loading || isSwitchingFeed}
            error={error}
            onSelectArticle={handleSelectArticle}
            unreadArticles={unreadArticles}
            getArticleImage={getArticleImage}
            formatDate={formatDate}
            searchQuery={articleSearchQuery}
            onSearchChange={handleArticleSearchChange}
            onMarkAllAsRead={handleMarkAllAsRead}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        )}

        {/* Reader */}
        {readerVisible && (
          <Reader
            key={selectedArticle ? getArticleKey(selectedArticle) : 'reader-empty'}
            selectedArticle={selectedArticle}
            onClose={closeReader}
            showOriginal={showOriginal}
            onToggleOriginal={toggleOriginal}
            getArticleContent={getArticleContent}
            getArticleAudio={getArticleAudio}
            fontSize={fontSize}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onFontSizeChange={handleFontSizeChange}
            initialReadPosition={selectedArticle ? getArticleReadPosition(selectedArticle) : 0}
            initialAudioPosition={selectedArticle ? getArticleAudioPosition(selectedArticle) : 0}
            onUpdateReadPosition={(position) => handleUpdateReadPosition(selectedArticle, position)}
            onUpdateAudioPosition={(position) => handleUpdateAudioPosition(selectedArticle, position)}
            isInReadingList={isArticleInReadingList()}
            onToggleReadingList={handleToggleArticleBookmark}
            onNavigateToFeed={handleNavigateToFeed}
            selectedFeed={selectedFeed}
            feedIntro={selectedFeed?.xmlUrl ? serverFeedIntros[selectedFeed.xmlUrl]?.content || '' : ''}
            feedIntroStatus={feedIntroStatus}
            feedIntroError={feedIntroError}
          />
        )}
      </div>

      {/* Ask Cat 抽屉 — 始终挂载,transform 控制滑入滑出;消息状态随组件生命周期 */}
      <AskCatDrawer
        isOpen={isAskCatOpen}
        onClose={() => setIsAskCatOpen(false)}
        articles={articles}
        selectedArticle={selectedArticle}
        onOpenArticle={handleOpenArticleFromAskCat}
      />

      {/* 键盘快捷键帮助浮层 — ? 键触发,SHORTCUTS 数据双用:驱动按键 + 渲染表格 */}
      <ShortcutsOverlay
        isOpen={showShortcutsOverlay}
        onClose={() => setShowShortcutsOverlay(false)}
        shortcuts={SHORTCUTS}
      />
    </div>
  )
}

export default App
