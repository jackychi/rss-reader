import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// 数据和组件
import { defaultFeeds } from './data/defaultFeeds'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useRSSFetcher } from './hooks/useRSSFetcher'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { saveArticles, getArticles, clearExpiredCache, saveToReadingList, removeFromReadingList, getReadingList, saveFeedMeta, getFeedMeta, getAllReadStatus, saveReadStatusBatch } from './utils/db'
import { getArticleKey } from './utils/articleKey'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import Reader from './components/Reader'
import ReadingList from './components/ReadingList'

// 常量
const STORAGE_KEYS = {
  FEEDS: 'rss-reader-feeds',
  FONT_SIZE: 'rss-reader-font-size',
  THEME: 'rss-reader-theme',
  EXPANDED_CATS: 'rss-reader-expanded-cats',
  READ_POSITIONS: 'rss-reader-read-positions',
  AUDIO_POSITIONS: 'rss-reader-audio-positions',
}

// 已迁移到 IndexedDB 的遗留 localStorage 键,启动时一次性清掉
const LEGACY_ARTICLE_CACHE_KEY = 'rss-reader-article-cache'
const LEGACY_READ_STATUS_KEY = 'rss-reader-read-status'

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
  // 阅读位置 - 持久化
  const [readPositions, setReadPositions] = useLocalStorage(STORAGE_KEYS.READ_POSITIONS, {})
  // 音频播放位置 - 持久化
  const [audioPositions, setAudioPositions] = useLocalStorage(STORAGE_KEYS.AUDIO_POSITIONS, {})

  // 已读/未读状态 - 内存镜像,持久化层是 IndexedDB readStatus store
  // readSet: 已读文章 key 集合,O(1) 查询
  // unreadByFeed: 每个 feed 的未读 key 集合,计算未读数只需 set.size
  const [readSet, setReadSet] = useState(() => new Set())
  const [unreadByFeed, setUnreadByFeed] = useState(() => new Map())

  // 其他状态
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [readerVisible, setReaderVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [articleSearchQuery, setArticleSearchQuery] = useState('')
  // 阅读列表状态
  const [readingList, setReadingList] = useState([])
  const [showReadingList, setShowReadingList] = useState(false)

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
  const { loading, articles, error, progress, fetchFeed, fetchAllFeeds, createRequest, searchArticles, setArticles } = useRSSFetcher()

  // 网络状态检测
  const { isOnline } = useOnlineStatus()

  // 请求 ID，用于处理竞态条件
  const requestIdRef = useRef(0)

  // 过滤后的文章（支持搜索）
  const filteredArticles = useMemo(() => {
    if (!articleSearchQuery.trim()) return articles
    return searchArticles(articleSearchQuery, articles)
  }, [articles, articleSearchQuery, searchArticles])

  // 保存文章到 IndexedDB 缓存(仅依赖 articles/loading,避免 readSet 变化时重复写)
  useEffect(() => {
    if (articles.length === 0 || loading) return
    saveArticles(articles).then((success) => {
      if (success) console.log('[App] Articles cached to IndexedDB')
    }).catch((err) => {
      console.error('[App] Failed to cache articles:', err)
    })
  }, [articles, loading])

  // 增量维护 unreadByFeed:新 articles 里不在 readSet 的 key 加入对应 feed 的未读集合
  // 只加、不减(文章从 articles 里消失不等于已读)
  useEffect(() => {
    if (articles.length === 0) return
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
  }, [articles, readSet])

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

  // ============ 初始化已读状态 + 清理遗留的 localStorage 键 ============
  // articleCache 已迁到 feedMeta store,readStatus 已迁到 readStatus store
  // 这里做两件事:一次性把老用户的 localStorage readStatus 迁到 IDB,然后从
  // IDB 加载已读集合,派生出 per-feed 未读集合。
  useEffect(() => {
    let cancelled = false
    async function init() {
      // 1. 清理已经迁移的 articleCache 键(无需迁移,纯缓存)
      try { localStorage.removeItem(LEGACY_ARTICLE_CACHE_KEY) } catch { /* 忽略 */ }

      // 2. 一次性迁移 readStatus: localStorage -> IDB
      try {
        const legacy = localStorage.getItem(LEGACY_READ_STATUS_KEY)
        if (legacy) {
          const parsed = JSON.parse(legacy)
          const keys = Object.keys(parsed).filter(k => parsed[k] === true)
          if (keys.length > 0) {
            await saveReadStatusBatch(keys)
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
        const readMap = await getAllReadStatus()
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
    }
    init()
    return () => { cancelled = true }
  }, [])

  // ============ 初始化 IndexedDB 缓存 ============
  useEffect(() => {
    // 尝试加载缓存的文章
    const loadCachedArticles = async () => {
      try {
        const cachedArticles = await getArticles()
        if (cachedArticles.length > 0) {
          console.log('[App] Loaded', cachedArticles.length, 'cached articles')
          setArticles(cachedArticles)
        }
        // 清理过期缓存
        await clearExpiredCache()
      } catch (error) {
        console.error('[App] Failed to load cached articles:', error)
      }
    }
    loadCachedArticles()
  }, [setArticles])

  // ============ 加载阅读列表 ============
  const loadReadingList = useCallback(async () => {
    try {
      const list = await getReadingList()
      setReadingList(list)
    } catch (error) {
      console.error('[App] Failed to load reading list:', error)
    }
  }, [])

  useEffect(() => {
    loadReadingList()
  }, [loadReadingList])

  // 启动时不再自动全量抓 feed,改为"点击 feed = 读 IDB 缓存;过期则后台 revalidate;
  // 用户主动点刷新才显式抓"——见 handleSelectFeed 和 handleRefresh。首次装完没缓存
  // 的新 feed,点进去时走阻塞式 fetch(fetchAllFeeds)显示加载状态。

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
      // "已缓存文章"视图:所有 feed 的未读合集
      const merged = new Set()
      unreadByFeed.forEach(set => set.forEach(k => merged.add(k)))
      return merged
    }
    if (selectedFeed?.xmlUrl) {
      return unreadByFeed.get(selectedFeed.xmlUrl) || new Set()
    }
    return new Set()
  }, [selectedFeed, unreadByFeed])

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
    saveReadStatusBatch(allKeys).catch(err =>
      console.error('[App] saveReadStatusBatch failed:', err)
    )
  }, [])

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
    if (enclosureUrl && article.enclosure?.type?.includes('audio')) {
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
  // 点击 feed 的交互采用 stale-while-revalidate 模式:
  //   1. 立即读 IDB 缓存 setArticles(秒开,UI 永远不 block)
  //   2. 离线 → 到此为止
  //   3. 缓存为空(新 feed 首次访问) → 走 fetchAllFeeds 阻塞抓,配合 loading 指示
  //   4. 缓存存在但超过 STALE_TTL → 静默 revalidate(fetchFeed 不 set loading),
  //      抓到新数据后 setArticles 覆盖、saveFeedMeta 更新时间戳
  //   5. 缓存新鲜 → 完全不请求网络
  // 想要强制刷新时用顶栏刷新按钮(handleRefresh)
  const handleSelectFeed = useCallback(async (_category, feed) => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed(feed)
    setSelectedArticle(null)
    setShowOriginal(false)
    setShowReadingList(false)
    setArticleSearchQuery('')
    setIsFullscreen(false)

    // 1. 先读 IDB 立即展示
    const cachedArticles = await getArticles(feed.xmlUrl)
    if (currentId !== requestIdRef.current) return
    setArticles(cachedArticles)

    // 2. 离线到此为止
    if (!isOnline) return

    // 3. IDB 空:首次访问,阻塞式抓(显示 loading)
    if (cachedArticles.length === 0) {
      const fetched = await fetchAllFeeds([feed], currentId)
      if (fetched.length > 0) {
        await saveFeedMeta(feed.xmlUrl, Date.now())
      }
      return
    }

    // 4. 看 TTL,新鲜就跳过 revalidate
    const STALE_TTL = 15 * 60 * 1000
    const meta = await getFeedMeta(feed.xmlUrl)
    if (currentId !== requestIdRef.current) return
    const cacheAge = meta ? Date.now() - meta.lastFetchedAt : Infinity
    if (cacheAge < STALE_TTL) return

    // 5. 过期 → 静默 revalidate(fetchFeed 不 set loading,UI 保留缓存文章)
    try {
      const result = await fetchFeed(feed)
      if (currentId !== requestIdRef.current) return
      if (result?.articles?.length > 0) {
        setArticles(result.articles)
        await saveFeedMeta(feed.xmlUrl, Date.now())
      }
    } catch {
      // 悄默失败,IDB 缓存仍在屏上
    }
  }, [createRequest, fetchFeed, fetchAllFeeds, isOnline, setArticles])

  const handleSelectAll = useCallback(async () => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed({ title: '已缓存文章', xmlUrl: 'cached' })
    setSelectedArticle(null)
    setShowOriginal(false)
    setShowReadingList(false) // 切换到已缓存文章时退出阅读列表视图
    setArticleSearchQuery('')
    setIsFullscreen(false) // 切换到已缓存文章时退出全屏模式

    // 直接从 IndexedDB 加载所有缓存的文章
    console.log('[App] Loading all cached articles from IndexedDB')
    const cachedArticles = await getArticles()
    if (cachedArticles.length > 0) {
      console.log('[App] Loaded', cachedArticles.length, 'cached articles')
      // 按发布时间倒序排列
      const sorted = cachedArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      setArticles(sorted)
    } else {
      setArticles([])
    }
  }, [createRequest, setArticles])

  const handleRefresh = useCallback(async () => {
    if (!selectedFeed) return
    const currentId = createRequest()
    requestIdRef.current = currentId
    setIsRefreshing(true)

    // 已缓存文章：从 IndexedDB 重新加载
    if (selectedFeed.xmlUrl === 'cached') {
      console.log('[App] Refreshing cached articles from IndexedDB')
      const cachedArticles = await getArticles()
      if (cachedArticles.length > 0) {
        const sorted = cachedArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        setArticles(sorted)
      }
    } else {
      // 其他订阅源：正常刷新
      await fetchAllFeeds([selectedFeed], currentId)
    }
    setIsRefreshing(false)
  }, [selectedFeed, createRequest, fetchAllFeeds, setArticles])

  // 标记当前订阅源(或"已缓存文章"视图下所有 feed)的未读文章为已读
  // 直接从 unreadByFeed 里取 key,不需要回头扫 articles
  const handleMarkAllAsRead = useCallback(() => {
    const isAll = selectedFeed?.xmlUrl === 'cached'
    const allKeys = []
    const feedsToClear = []

    if (isAll) {
      unreadByFeed.forEach((set, feedUrl) => {
        if (set.size === 0) return
        set.forEach(k => allKeys.push(k))
        feedsToClear.push(feedUrl)
      })
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

    saveReadStatusBatch(allKeys).catch(err =>
      console.error('[App] mark all as read IDB write failed:', err)
    )
  }, [selectedFeed, unreadByFeed])

  // 切换文章书签状态
  const handleToggleArticleBookmark = useCallback(async () => {
    if (!selectedArticle) return

    const articleKey = getArticleKey(selectedArticle)
    const isCurrentlyInList = readingList.some(a => getArticleKey(a) === articleKey)

    if (isCurrentlyInList) {
      await removeFromReadingList(articleKey)
      setReadingList(prev => prev.filter(a => getArticleKey(a) !== articleKey))
    } else {
      await saveToReadingList(selectedArticle)
      setReadingList(prev => [selectedArticle, ...prev])
    }
  }, [selectedArticle, readingList])

  // 检查文章是否在阅读列表中
  const isArticleInReadingList = useCallback(() => {
    if (!selectedArticle) return false
    const articleKey = getArticleKey(selectedArticle)
    return readingList.some(a => getArticleKey(a) === articleKey)
  }, [selectedArticle, readingList])

  // 从阅读列表移除文章
  const handleRemoveFromReadingList = useCallback(async (articleKey) => {
    await removeFromReadingList(articleKey)
    setReadingList(prev => prev.filter(a => getArticleKey(a) !== articleKey))
  }, [])

  // 在阅读列表中选择文章
  const handleSelectFromReadingList = useCallback((article) => {
    setSelectedArticle(article)
    setShowOriginal(false)
    setReaderVisible(true)
    // 不退出阅读列表视图,不切换到频道
    markAsRead(article)
  }, [markAsRead])

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
    return readPositions[getArticleKey(article)] || 0
  }, [readPositions])

  // 获取文章的音频位置
  const getArticleAudioPosition = useCallback((article) => {
    return audioPositions[getArticleKey(article)] || 0
  }, [audioPositions])

  // 更新阅读位置
  const handleUpdateReadPosition = useCallback((article, position) => {
    const articleKey = getArticleKey(article)
    setReadPositions(prev => ({ ...prev, [articleKey]: position }))
  }, [setReadPositions])

  // 更新音频位置
  const handleUpdateAudioPosition = useCallback((article, position) => {
    const articleKey = getArticleKey(article)
    setAudioPositions(prev => ({ ...prev, [articleKey]: position }))
  }, [setAudioPositions])

  // 选择文章时标记为已读
  const handleSelectArticle = useCallback((article) => {
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
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            unreadCounts={unreadCounts}
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
            loading={loading}
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
          />
        )}
      </div>
    </div>
  )
}

export default App
