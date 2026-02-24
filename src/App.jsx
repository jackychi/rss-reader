import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

// 数据和组件
import { defaultFeeds } from './data/defaultFeeds'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useRSSFetcher } from './hooks/useRSSFetcher'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { saveArticles, getArticles, getAllReadStatus, clearExpiredCache } from './utils/db'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import Reader from './components/Reader'

// 常量
const STORAGE_KEYS = {
  FEEDS: 'rss-reader-feeds',
  READ_STATUS: 'rss-reader-read-status',
  FONT_SIZE: 'rss-reader-font-size',
  THEME: 'rss-reader-theme',
  EXPANDED_CATS: 'rss-reader-expanded-cats',
  READ_POSITIONS: 'rss-reader-read-positions',
  AUDIO_POSITIONS: 'rss-reader-audio-positions',
  ARTICLE_CACHE: 'rss-reader-article-cache',
}

function App() {
  // ============ 状态管理 ============
  // 订阅源 - 持久化
  const [feeds, setFeeds] = useLocalStorage(STORAGE_KEYS.FEEDS, defaultFeeds)
  // 已读状态 - 持久化
  const [readStatus, setReadStatus] = useLocalStorage(STORAGE_KEYS.READ_STATUS, {})
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
  // 文章缓存 - 持久化
  const [articleCache, setArticleCache] = useLocalStorage(STORAGE_KEYS.ARTICLE_CACHE, {})

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

  // 使用 RSS Fetcher Hook
  const { loading, articles, error, progress, fetchAllFeeds, createRequest, searchArticles, setArticles } = useRSSFetcher()

  // 网络状态检测
  const { isOnline } = useOnlineStatus()

  // 请求 ID，用于处理竞态条件
  const requestIdRef = useRef(0)

  // 过滤后的文章（支持搜索）
  const filteredArticles = useMemo(() => {
    if (!articleSearchQuery.trim()) return articles
    return searchArticles(articleSearchQuery, articles)
  }, [articles, articleSearchQuery, searchArticles])

  // 保存文章到 IndexedDB 缓存（当获取到新文章时）
  useEffect(() => {
    if (articles.length > 0 && !loading) {
      saveArticles(articles).then((success) => {
        if (success) {
          console.log('[App] Articles cached to IndexedDB')
        }
      }).catch((err) => {
        console.error('[App] Failed to cache articles:', err)
      })
    }
  }, [articles, loading])

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
  }, [feeds])

  // ============ 初始化 IndexedDB 缓存 ============
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    // 尝试加载缓存的文章
    const loadCachedArticles = async () => {
      try {
        const cachedArticles = await getArticles()
        if (cachedArticles.length > 0) {
          console.log('[App] Loaded', cachedArticles.length, 'cached articles')
          setArticles(cachedArticles)
          setOfflineReady(true)
        }
        // 清理过期缓存
        await clearExpiredCache()
      } catch (error) {
        console.error('[App] Failed to load cached articles:', error)
      }
    }
    loadCachedArticles()
  }, [])

  // ============ 启动时自动获取RSS源 ============
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  useEffect(() => {
    if (initialLoadDone || !isOnline) return
    setInitialLoadDone(true)

    const fetchInitialFeeds = async () => {
      const currentId = createRequest()
      requestIdRef.current = currentId
      console.log('[App] Auto-fetching all feeds on startup')
      const allFeeds = feeds.flatMap(f => f.feeds)
      await fetchAllFeeds(allFeeds, currentId)
    }

    fetchInitialFeeds()
  }, [feeds, createRequest, fetchAllFeeds, isOnline, initialLoadDone])

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

  // ============ 加载所有缓存文章用于计算未读数 ============
  const [allCachedArticles, setAllCachedArticles] = useState([])

  useEffect(() => {
    const loadAllCached = async () => {
      const all = await getArticles()
      setAllCachedArticles(all)
    }
    loadAllCached()
  }, [selectedFeed]) // 切换订阅源时重新加载

  // ============ 计算未读数 ============
  // 使用所有缓存的文章来计算，确保切换订阅源后未读数不丢失
  const unreadCounts = useMemo(() => {
    const counts = {}
    const feedUnreadCounts = {}

    // 使用 allCachedArticles 计算未读数，而不是当前显示的 articles
    const articleSource = allCachedArticles.length > 0 ? allCachedArticles : articles

    feeds.forEach(category => {
      let categoryUnread = 0
      category.feeds.forEach(feed => {
        const key = `${category.category}-${feed.xmlUrl}`
        const feedArticles = articleSource.filter(a => a.feedUrl === feed.xmlUrl)
        const unreadInFeed = feedArticles.filter(a => {
          const articleKey = `${a.feedUrl}-${a.guid || a.link}`
          return readStatus[articleKey] !== true
        }).length

        feedUnreadCounts[key] = unreadInFeed
        categoryUnread += unreadInFeed
      })
      counts[category.category] = categoryUnread
    })

    return { ...counts, ...feedUnreadCounts }
  }, [feeds, allCachedArticles, articles, readStatus])

  // 未读文章 Set（用于快速查找）
  const unreadArticles = useMemo(() => {
    const set = new Set()
    articles.forEach((article) => {
      const key = `${article.feedUrl}-${article.guid || article.link}`
      if (!readStatus[key]) {
        set.add(key)
      }
    })
    return set
  }, [articles, readStatus])

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
  const handleSelectFeed = useCallback(async (category, feed) => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed(feed)
    setSelectedArticle(null)
    setShowOriginal(false)
    setArticleSearchQuery('') // 切换订阅源时清除文章搜索
    setIsFullscreen(false) // 切换订阅源时退出全屏模式

    // 离线模式：直接从 IndexedDB 加载缓存
    if (!isOnline) {
      console.log('[App] Offline mode - loading from IndexedDB')
      const cachedArticles = await getArticles(feed.xmlUrl)
      if (cachedArticles.length > 0) {
        console.log('[App] Loaded', cachedArticles.length, 'cached articles for', feed.title)
        setArticles(cachedArticles)
      } else {
        setArticles([])
      }
      return
    }

    // 在线模式：检查缓存
    const cacheKey = feed.xmlUrl
    const cached = articleCache[cacheKey]
    const cacheAge = cached ? Date.now() - cached.timestamp : Infinity
    const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

    if (cached && cacheAge < CACHE_TTL) {
      // 使用缓存
      console.log('Using cached articles for:', feed.title)
    }

    await fetchAllFeeds([feed], currentId)
  }, [createRequest, fetchAllFeeds, articleCache, isOnline, setArticles])

  const handleSelectAll = useCallback(async () => {
    const currentId = createRequest()
    requestIdRef.current = currentId
    setSelectedFeed({ title: '已缓存文章', xmlUrl: 'cached' })
    setSelectedArticle(null)
    setShowOriginal(false)
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
    const articleKey = `${article.feedUrl}-${article.guid || article.link}`
    return readPositions[articleKey] || 0
  }, [readPositions])

  // 获取文章的音频位置
  const getArticleAudioPosition = useCallback((article) => {
    const articleKey = `${article.feedUrl}-${article.guid || article.link}`
    return audioPositions[articleKey] || 0
  }, [audioPositions])

  // 更新阅读位置
  const handleUpdateReadPosition = useCallback((article, position) => {
    const articleKey = `${article.feedUrl}-${article.guid || article.link}`
    setReadPositions(prev => ({
      ...prev,
      [articleKey]: position
    }))
  }, [setReadPositions])

  // 更新音频位置
  const handleUpdateAudioPosition = useCallback((article, position) => {
    const articleKey = `${article.feedUrl}-${article.guid || article.link}`
    setAudioPositions(prev => ({
      ...prev,
      [articleKey]: position
    }))
  }, [setAudioPositions])

  // 选择文章时标记为已读
  const handleSelectArticle = useCallback((article) => {
    setSelectedArticle(article)
    setShowOriginal(false)
    setReaderVisible(true)

    // 标记为已读
    const articleKey = `${article.feedUrl}-${article.guid || article.link}`
    setReadStatus(prev => ({
      ...prev,
      [articleKey]: true
    }))
  }, [setReadStatus])

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
          />
        )}

        {/* Article List - 全屏模式下隐藏 */}
        {!isFullscreen && (
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
          />
        )}

        {/* Reader */}
        {readerVisible && (
          <Reader
            selectedArticle={selectedArticle}
            readerVisible={readerVisible}
            onClose={closeReader}
            showOriginal={showOriginal}
            onToggleOriginal={toggleOriginal}
            getArticleContent={getArticleContent}
            getArticleAudio={getArticleAudio}
            formatDate={formatDate}
            fontSize={fontSize}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onFontSizeChange={handleFontSizeChange}
            initialReadPosition={selectedArticle ? getArticleReadPosition(selectedArticle) : 0}
            initialAudioPosition={selectedArticle ? getArticleAudioPosition(selectedArticle) : 0}
            onUpdateReadPosition={(position) => handleUpdateReadPosition(selectedArticle, position)}
            onUpdateAudioPosition={(position) => handleUpdateAudioPosition(selectedArticle, position)}
          />
        )}
      </div>
    </div>
  )
}

export default App
