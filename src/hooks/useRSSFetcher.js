import { useState, useCallback, useRef } from 'react'

/**
 * useRSSFetcher Hook - RSS 订阅源获取与解析
 * 提供统一的订阅源获取逻辑、智能重试、缓存支持
 */

const BATCH_SIZE = 5
const BATCH_DELAY = 300
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

export function useRSSFetcher() {
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState([])
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const requestIdRef = useRef(0)

  // 暴露 setArticles 方法用于外部设置文章（如离线加载）
  const setArticlesExternal = useCallback((newArticles) => {
    setArticles(newArticles)
  }, [])

  // 单个订阅源获取（带重试机制）
  const fetchFeed = useCallback(async (feed, retryCount = 0) => {
    const isXgoIng = feed.xmlUrl.includes('api.xgo.ing')
    const rsshubBase = 'https://rsshub-eta-topaz-88.vercel.app'

    // 通用 limit 参数（用于非 rss2json 的代理）
    const limitParam = '&limit=100'
    // 问号还是 &
    const hasQuery = feed.xmlUrl.includes('?')
    const urlSuffix = hasQuery ? limitParam : ''

    const proxies = isXgoIng
      ? [`${rsshubBase}/${feed.xmlUrl.replace(/^https?:\/\//, '')}`]
      : [
          // 优先尝试直接请求
          { url: feed.xmlUrl, isDirect: true },
          // 代理都加 limit（除了 rss2json）
          `https://corsproxy.io/?${encodeURIComponent(feed.xmlUrl)}${urlSuffix}`,
          `https://api.allorigins.win/get?url=${encodeURIComponent(feed.xmlUrl)}${urlSuffix}`,
          `https://cors-anywhere.herokuapp.com/${feed.xmlUrl}${urlSuffix}`,
          `${rsshubBase}/${feed.xmlUrl.replace(/^https?:\/\//, '')}${urlSuffix}`,
          // rss2json 免费版有 10 条限制，放最后
          { url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.xmlUrl)}`, isRss2Json: true },
        ]

    let articlesWithFeed = null

    for (const proxy of proxies) {
      try {
        const proxyUrl = typeof proxy === 'string' ? proxy : proxy.url

        if (proxy.isRss2Json || proxyUrl.includes('rss2json')) {
          const jsonRes = await fetch(proxyUrl)
          if (jsonRes.status === 429) continue
          const jsonData = await jsonRes.json()
          if (jsonData.status === 'ok' && jsonData.items) {
            articlesWithFeed = jsonData.items.map(item => ({
              ...item,
              feedTitle: jsonData.feed.title || feed.title,
              feedUrl: feed.xmlUrl,
              content: item.content || item['content:encoded'] || item.description || '',
              contentSnippet: (item.content || item.description || '')?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
              isoDate: item.pubDate,
            }))
            break
          }
        }

        if (proxyUrl.includes('allorigins.win/get')) {
          const response = await fetch(proxyUrl)
          const data = await response.json()
          if (!data.contents) continue
          const xmlText = data.contents
          const domParser = new DOMParser()
          const xml = domParser.parseFromString(xmlText, 'text/xml')
          const items = xml.querySelectorAll('item, entry')
          const title = xml.querySelector('channel > title, feed > title')?.textContent || feed.title
          const articles = Array.from(items).map(item => {
            const enclosureEl = item.getElementsByTagName('enclosure')[0]
            const enclosure = enclosureEl ? {
              url: enclosureEl.getAttribute('url'),
              type: enclosureEl.getAttribute('type'),
              length: enclosureEl.getAttribute('length')
            } : null
            return {
              title: item.querySelector('title')?.textContent || '',
              link: item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '',
              content: item.querySelector('content\\:encoded, content, description, summary')?.textContent || '',
              contentSnippet: item.querySelector('content\\:encoded, content, description, summary')?.textContent?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
              pubDate: item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString(),
              isoDate: item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString(),
              guid: item.querySelector('id')?.textContent || item.querySelector('link')?.textContent || '',
              enclosure,
            }
          })
          articlesWithFeed = articles.map(item => ({
            ...item,
            feedTitle: title,
            feedUrl: feed.xmlUrl,
          }))
          break
        }

        const response = await fetch(proxyUrl)
        if (!response.ok) continue
        const xmlText = await response.text()

        const domParser = new DOMParser()
        const xml = domParser.parseFromString(xmlText, 'text/xml')
        const items = xml.querySelectorAll('item, entry')
        const title = xml.querySelector('channel > title, feed > title')?.textContent || feed.title

        const articles = Array.from(items).map(item => {
          const titleEl = item.querySelector('title')?.textContent || ''
          const linkEl = item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || ''
          const fullContentEl = item.querySelector('content\\:encoded, content')?.textContent || item.querySelector('description, summary')?.textContent || ''
          const dateEl = item.querySelector('pubDate, published, updated')?.textContent || new Date().toISOString()
          const enclosureEl = item.getElementsByTagName('enclosure')[0]
          const enclosure = enclosureEl ? {
            url: enclosureEl.getAttribute('url'),
            type: enclosureEl.getAttribute('type'),
            length: enclosureEl.getAttribute('length')
          } : null

          return {
            title: titleEl,
            link: linkEl,
            content: fullContentEl,
            contentSnippet: fullContentEl.replace(/<[^>]*>/g, '').slice(0, 200),
            pubDate: dateEl,
            isoDate: dateEl,
            guid: item.querySelector('id')?.textContent || linkEl,
            enclosure,
          }
        })

        articlesWithFeed = articles.map(item => ({
          ...item,
          feedTitle: title,
          feedUrl: feed.xmlUrl,
        }))
        break
      } catch (e) {
        continue
      }
    }

    if (articlesWithFeed && articlesWithFeed.length > 0) {
      return { feed, articles: articlesWithFeed }
    }

    // 重试机制
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return fetchFeed(feed, retryCount + 1)
    }

    throw new Error('All proxies failed')
  }, [])

  // 批量获取所有订阅源
  const fetchAllFeeds = useCallback(async (feedList, currentRequestId) => {
    if (currentRequestId !== requestIdRef.current) {
      return
    }

    setLoading(true)
    setError(null)
    setArticles([])
    setProgress({ loaded: 0, total: feedList.length })

    const results = []
    const total = feedList.length
    let loaded = 0

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (currentRequestId !== requestIdRef.current) {
        return
      }

      const batch = feedList.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(batch.map(feed => fetchFeed(feed)))

      if (currentRequestId !== requestIdRef.current) {
        return
      }

      // 处理部分失败
      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.articles.length > 0) {
          results.push(result.value)
        } else {
          console.warn(`Failed to fetch: ${batch[idx]?.title}`)
        }
      })

      loaded += batch.length
      setProgress({ loaded, total })

      const validArticles = results
        .flatMap(r => r.articles)
        .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))

      if (loaded < total) {
        // 还在加载中，显示当前累积的文章
      } else {
        setArticles(validArticles)
      }

      if (i + BATCH_SIZE < total) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }

    if (currentRequestId !== requestIdRef.current) {
      return
    }

    const errors = results.length < total ? `${total - results.length} feed(s) failed to load` : null
    if (errors) {
      setError(errors)
    }

    const allArticles = results
      .flatMap(r => r.articles)
      .sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate))

    setArticles(allArticles)
    setLoading(false)
  }, [fetchFeed])

  // 创建新的请求
  const createRequest = useCallback(() => {
    requestIdRef.current += 1
    return requestIdRef.current
  }, [])

  // 搜索文章
  const searchArticles = useCallback((query, articleList) => {
    if (!query.trim()) return articleList

    const lowerQuery = query.toLowerCase()
    return articleList.filter(article =>
      article.title?.toLowerCase().includes(lowerQuery) ||
      article.contentSnippet?.toLowerCase().includes(lowerQuery) ||
      article.feedTitle?.toLowerCase().includes(lowerQuery)
    )
  }, [])

  return {
    loading,
    articles,
    error,
    progress,
    fetchFeed,
    fetchAllFeeds,
    createRequest,
    searchArticles,
    setArticles: setArticlesExternal,
  }
}

export default useRSSFetcher
