import { FileText, Trash2, ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * ReadingList 组件 - 阅读列表管理
 * 支持：显示已保存的文章、删除文章、打开原文
 */
export default function ReadingList({
  articles,
  onSelectArticle,
  onRemoveArticle,
  getArticleImage,
  formatDate,
  selectedArticle
}) {
  if (articles.length === 0) {
    return (
      <main className="article-list w-[380px] flex flex-col overflow-hidden shrink-0">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
          <h2 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            阅读列表
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            保存想稍后阅读的文章
          </p>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center">
          <FileText size={48} style={{ opacity: 0.2, marginBottom: '12px', color: 'var(--text-muted)' }} />
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>阅读列表为空</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>在文章阅读界面点击书签图标保存</p>
        </div>
      </main>
    )
  }

  return (
    <main className="article-list w-[380px] flex flex-col overflow-hidden shrink-0">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>
        <h2 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
          阅读列表
        </h2>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {articles.length} 篇文章
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {articles.map((article) => {
          const articleKey = `${article.feedUrl}-${article.guid || article.link}`
          const selectedKey = selectedArticle ? `${selectedArticle.feedUrl}-${selectedArticle.guid || selectedArticle.link}` : null
          const isSelected = articleKey === selectedKey

          return (
            <div
              key={articleKey}
              onClick={() => onSelectArticle(article)}
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-color)',
                cursor: 'pointer',
                backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{article.feedTitle}</span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {article.savedAt
                    ? `${formatDistanceToNow(new Date(article.savedAt), { addSuffix: true, locale: zhCN })} 保存`
                    : formatDate(article.isoDate)
                  }
                </span>
              </div>
              <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                lineHeight: 1.4
              }}>
                {article.title}
              </h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                    style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectArticle(article)
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  阅读
                </button>
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  原文
                  <ExternalLink size={12} />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveArticle(articleKey)
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: 'auto'
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
