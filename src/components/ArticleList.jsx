import { useState, useRef, useEffect, useMemo } from 'react'
import { Loader2, AlertCircle, Search, RefreshCw, CheckCheck } from 'lucide-react'
import { getArticleKey } from '../utils/articleKey'
import { quotes } from '../data/quotes'

/**
 * ArticleList 组件 - 中间文章列表
 * 支持：已读/未读状态显示、缩略图、加载状态、文章搜索
 */
export default function ArticleList({
  articles,
  selectedFeed,
  selectedArticle,
  loading,
  error,
  onSelectArticle,
  unreadArticles,
  getArticleImage,
  formatDate,
  searchQuery,
  onSearchChange,
  onMarkAllAsRead,
  onRefresh,
  isRefreshing,
  onLoadMore,
  hasMore,
  isLoadingMore,
}) {
  const randomQuote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], [])

  // 搜索框显示状态
  const [showSearch, setShowSearch] = useState(false)

  // 每篇文章的 row DOM ref,供 j/k 切换时把选中项滚入视野
  // 用 Map 而不是 useRef 为每个 row 单独存,避免随文章数增长的 ref 对象数量
  const rowRefs = useRef(new Map())

  // 列表末尾的 sentinel:进入视野时触发 onLoadMore
  // 用 IntersectionObserver 而非 onScroll 阈值——浏览器自动节流,且不会重复 fire
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!selectedArticle) return
    const key = getArticleKey(selectedArticle)
    const row = rowRefs.current.get(key)
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedArticle])

  // 搜索时禁用滚动加载:客户端搜索只搜已加载的部分,无限滚也匹配不到未加载的内容
  useEffect(() => {
    const target = sentinelRef.current
    if (!target || !hasMore || !onLoadMore || searchQuery.trim()) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore()
    }, { rootMargin: '200px' })

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, searchQuery, articles.length])

  return (
    <main className="article-list w-[380px] flex flex-col overflow-hidden shrink-0">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFeed?.title || 'All Articles'}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {unreadArticles.size > 0 ? `${unreadArticles.size} 未读` : '已全部读完'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              onClick={() => setShowSearch(!showSearch)}
              style={{
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: showSearch ? 'var(--accent-color)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="搜索文章"
            >
              <Search size={16} style={{ color: showSearch ? '#fff' : 'var(--text-secondary)' }} />
            </button>
            <button
              onClick={onRefresh}
              disabled={!selectedFeed || isRefreshing || loading}
              style={{
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: (!selectedFeed || isRefreshing || loading) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: (!selectedFeed || isRefreshing || loading) ? 0.4 : 1,
              }}
              title="刷新"
            >
              <RefreshCw size={16} style={{ color: 'var(--text-secondary)', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={onMarkAllAsRead}
              disabled={!selectedFeed || articles.length === 0}
              style={{
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: (!selectedFeed || articles.length === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: (!selectedFeed || articles.length === 0) ? 0.4 : 1,
              }}
              title="全部已读"
            >
              <CheckCheck size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>

        {/* 文章搜索框 */}
        {showSearch && (
          <div style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="搜索文章标题和内容..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                border: 'none',
                backgroundColor: 'transparent',
                outline: 'none',
                fontSize: '13px',
                lineHeight: '18px',
                height: '18px',
                padding: 0,
                color: 'var(--text-primary)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  width: '18px',
                  height: '18px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                  flexShrink: 0
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-3 bg-red-50 border-b border-red-100 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center h-full" style={{ padding: '24px', paddingTop: '75%' }}>
            {searchQuery ? (
              <p className="text-sm text-gray-400">没有找到匹配的文章</p>
            ) : (
              <div style={{ maxWidth: '360px', textAlign: 'center' }}>
                <div style={{
                  fontSize: '32px',
                  lineHeight: 1,
                  color: 'var(--text-muted)',
                  opacity: 0.3,
                  marginBottom: '12px',
                }}>"</div>
                <p style={{
                  fontSize: '18px',
                  lineHeight: 1.8,
                  color: 'var(--text-secondary)',
                  margin: '0 0 60px',
                }}>{randomQuote.text}</p>
                <p style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  margin: 0,
                }}>—— {randomQuote.author}，{randomQuote.source}</p>
              </div>
            )}
          </div>
        ) : (
          articles.map((article) => {
            const articleKey = getArticleKey(article)
            const isUnread = unreadArticles.has(articleKey)

            const selectedKey = selectedArticle ? getArticleKey(selectedArticle) : null
            const isSelected = articleKey === selectedKey

            // 检查文章是否匹配搜索（高亮显示）
            const isMatch = searchQuery && (
              article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              article.contentSnippet?.toLowerCase().includes(searchQuery.toLowerCase())
            )

            return (
              <div
                key={articleKey}
                ref={(el) => {
                  if (el) rowRefs.current.set(articleKey, el)
                  else rowRefs.current.delete(articleKey)
                }}
                onClick={() => onSelectArticle(article)}
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  borderLeft: isMatch ? '3px solid var(--accent-color)' : 'none',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  {isUnread && (
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-color)',
                      flexShrink: 0
                    }} />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{article.feedTitle}</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(article.isoDate)}</span>
                </div>
                <h3 style={{
                  fontSize: '15px',
                  fontWeight: isUnread ? 600 : 500,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  lineHeight: 1.4
                }}>
                  {article.title}
                </h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {article.contentSnippet && (
                    <p style={{
                      flex: 1,
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>{article.contentSnippet}</p>
                  )}
                  {getArticleImage(article) && (
                    <img
                      src={getArticleImage(article)}
                      alt=""
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* 末尾 sentinel + 加载提示。搜索时不渲染(避免 observer 误触发) */}
        {!loading && articles.length > 0 && !searchQuery.trim() && (
          <div ref={sentinelRef} style={{ padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            {isLoadingMore ? (
              <Loader2 size={16} className="animate-spin" />
            ) : hasMore ? (
              <span>下拉加载更多</span>
            ) : (
              <span>没有更多了</span>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
