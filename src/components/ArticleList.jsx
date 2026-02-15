import { useState, useMemo } from 'react'
import { FileText, Loader2, AlertCircle, Search } from 'lucide-react'

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
  onSearchChange
}) {
  // 搜索框显示状态
  const [showSearch, setShowSearch] = useState(false)

  // 过滤后的文章数
  const articleCount = useMemo(() => articles.length, [articles])

  return (
    <main className="article-list w-[380px] flex flex-col overflow-hidden shrink-0">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFeed?.title || 'All Articles'}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {unreadArticles.size > 0 ? `${unreadArticles.size} 未读` : '已全部读完'}
            </p>
          </div>
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
                  padding: '2px',
                  color: 'var(--text-muted)'
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
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FileText size={48} className="mb-3 opacity-30" />
            <p className="text-sm">{
              searchQuery
                ? '没有找到匹配的文章'
                : 'Select a feed to start reading'
            }</p>
          </div>
        ) : (
          articles.map((article, idx) => {
            // 生成文章唯一标识（与 readStatus 存储格式一致，不含 idx）
            const articleKey = `${article.feedUrl}-${article.guid || article.link}`
            const isUnread = !unreadArticles.has(articleKey)

            // 检查文章是否匹配搜索（高亮显示）
            const isMatch = searchQuery && (
              article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              article.contentSnippet?.toLowerCase().includes(searchQuery.toLowerCase())
            )

            return (
              <div
                key={articleKey}
                onClick={() => onSelectArticle(article)}
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  backgroundColor: selectedArticle?.guid === article.guid ? 'var(--bg-secondary)' : 'transparent',
                  borderLeft: isMatch ? '3px solid var(--accent-color)' : 'none',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                onMouseLeave={(e) => {
                  if (selectedArticle?.guid !== article.guid) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
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
      </div>
    </main>
  )
}
