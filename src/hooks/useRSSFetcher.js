import { useState, useCallback, useRef } from 'react'
import { CORS_WORKER_URL } from '../utils/constants'
import { saveArticles, saveFeedMeta } from '../utils/db'

const BATCH_SIZE = 5
const BATCH_DELAY = 300
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

function buildContentSnippet(content = '') {
  return content
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function extractArticleContent(item) {
  const encodedByTag = item.getElementsByTagName('content:encoded')[0]?.textContent
  const itunesSummary = item.getElementsByTagName('itunes:summary')[0]?.textContent
  const encodedBySelector = item.querySelector('content\\:encoded, content')?.textContent
  const description = item.querySelector('description, summary')?.textContent

  return (encodedByTag || itunesSummary || encodedBySelector || description || '').trim()
}

export function useRSSFetcher() {
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState([])
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const requestIdRef = useRef(0)

  const setArticlesExternal = useCallback((newArticles) => {
    setArticles(newArticles)
  }, [])

  // 单个订阅源获取（带重试机制）
  const fetchFeed = useCallback(async function fetchFeedWithRetry(feed, retryCount = 0) {
    const isXgoIng = feed.xmlUrl.includes('api.xgo.ing')
    const rsshubBase = 'https://rsshub-eta-topaz-88.vercel.app'

    const proxies = isXgoIng
      ? [`${rsshubBase}/${feed.xmlUrl.replace(/^https?:\/\//, '')}`]
      : [
          { url: feed.xmlUrl, isDirect: true },
          `${CORS_WORKER_URL}/?url=${encodeURIComponent(feed.xmlUrl)}`,
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
          const fullContentEl = extractArticleContent(item)
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
            contentSnippet: buildContentSnippet(fullContentEl),
            pubDate: dateEl,
            isoDate: dateEl,
            guid: item.querySelector('id')?.textContent || linkEl,
            enclosure,
          }
        })

        if (articles.length === 0) {
          console.warn(`[fetchFeed] ${proxyUrl} returned 0 items for ${feed.title}, trying next proxy`)
          continue
        }
        articlesWithFeed = articles.map(item => ({
          ...item,
          feedTitle: title,
          feedUrl: feed.xmlUrl,
        }))
        break
      } catch {
        continue
      }
    }

    if (articlesWithFeed && articlesWithFeed.length > 0) {
      return { feed, articles: articlesWithFeed }
    }

    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return fetchFeedWithRetry(feed, retryCount + 1)
    }

    throw new Error('All proxies failed')
  }, [])

  // 批量获取所有订阅源（首次访问，无缓存场景：清空文章 + 显示 loading）
  const fetchAllFeeds = useCallback(async (feedList, currentRequestId) => {
    if (currentRequestId !== requestIdRef.current) {
      return []
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
        setLoading(false)
        return []
      }

      const batch = feedList.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(batch.map(feed => fetchFeed(feed)))

      if (currentRequestId !== requestIdRef.current) {
        setLoading(false)
        return []
      }

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
      setLoading(false)
      return []
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
    return allArticles
  }, [fetchFeed])

  // 后台静默刷新：抓数据 + 写 IDB，不动 UI 状态
  // 用于刷新按钮触发的 revalidate——保留当前文章在屏上，刷新完成后由调用方从 IDB 重新加载
  const backgroundRefreshFeeds = useCallback(async (feedList, currentRequestId) => {
    const results = []
    const total = feedList.length
    let failedCount = 0

    for (let i = 0; i < total; i += BATCH_SIZE) {
      if (currentRequestId !== requestIdRef.current) return null

      const batch = feedList.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(batch.map(feed => fetchFeed(feed)))

      if (currentRequestId !== requestIdRef.current) return null

      // 每批抓完就写 IDB，不等到全部结束
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.articles.length > 0) {
          results.push(result.value)
          await saveArticles(result.value.articles).catch(() => {})
          await saveFeedMeta(result.value.feed.xmlUrl).catch(() => {})
        } else {
          failedCount++
        }
      }

      if (i + BATCH_SIZE < total) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }

    return { total, failedCount }
  }, [fetchFeed])

  const createRequest = useCallback(() => {
    requestIdRef.current += 1
    return requestIdRef.current
  }, [])

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
    backgroundRefreshFeeds,
    createRequest,
    searchArticles,
    setArticles: setArticlesExternal,
  }
}

export default useRSSFetcher
