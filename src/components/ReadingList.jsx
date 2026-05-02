import { useState, useRef, useEffect } from 'react'
import { FileText, Link2, BookmarkCheck, MoreHorizontal, Copy, Check, Send, Cat } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { getArticleKey } from '../utils/articleKey'

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
  selectedArticle,
  onAskCatArticle,
}) {
  const rowRefs = useRef(new Map())

  useEffect(() => {
    if (!selectedArticle) return
    const row = rowRefs.current.get(getArticleKey(selectedArticle))
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedArticle])

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
          const articleKey = getArticleKey(article)
          const selectedKey = selectedArticle ? getArticleKey(selectedArticle) : null
          const isSelected = articleKey === selectedKey

          return (
            <ReadingListCard
              key={articleKey}
              article={article}
              articleKey={articleKey}
              isSelected={isSelected}
              onSelectArticle={onSelectArticle}
              onRemoveArticle={onRemoveArticle}
              getArticleImage={getArticleImage}
              formatDate={formatDate}
              onAskCatArticle={onAskCatArticle}
              rowRef={(node) => {
                if (node) rowRefs.current.set(articleKey, node)
                else rowRefs.current.delete(articleKey)
              }}
            />
          )
        })}
      </div>
    </main>
  )
}

// 卡片子组件:把菜单状态 + 复制反馈隔离在单卡片里,避免父组件管理全局 state
function ReadingListCard({
  article,
  articleKey,
  isSelected,
  onSelectArticle,
  onRemoveArticle,
  getArticleImage,
  formatDate,
  onAskCatArticle,
  rowRef,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef(null)

  // 点菜单外关闭
  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const handleCopyLink = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(article.link || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('[ReadingList] copy failed:', err)
    }
    setMenuOpen(false)
  }

  return (
    <div
      ref={rowRef}
      onClick={() => onSelectArticle(article)}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)')}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? 'var(--bg-tertiary)' : 'transparent' }}
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
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4 }}>
        {article.title}
      </h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {article.contentSnippet && (
          <p style={{
            flex: 1, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{article.contentSnippet}</p>
        )}
        {getArticleImage(article) && (
          <img
            src={getArticleImage(article)}
            alt=""
            style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', flexShrink: 0 }}
            onError={(e) => (e.target.style.display = 'none')}
          />
        )}
      </div>

      {/* 底部操作栏 */}
      {/* 左:链接 + 书签(已收藏,点取消);右:三点下拉(复制链接 / 转发到墨问) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
        {/* 左侧图标组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onAskCatArticle && (
            <button
              onClick={(e) => { e.stopPropagation(); onAskCatArticle(article) }}
              title="AI 总结这篇文章"
              style={{
                padding: '6px', borderRadius: '6px', border: 'none',
                backgroundColor: 'transparent', color: '#ff9500',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <Cat size={16} />
            </button>
          )}
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="打开原文"
            style={{
              padding: '6px', borderRadius: '6px', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Link2 size={16} />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveArticle(articleKey) }}
            title="从阅读列表移除"
            style={{
              padding: '6px', borderRadius: '6px', border: 'none',
              backgroundColor: 'transparent', color: 'var(--accent-color)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <BookmarkCheck size={16} fill="currentColor" />
          </button>
        </div>

        {/* 右侧三点菜单 */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            title="更多操作"
            style={{
              padding: '6px', borderRadius: '6px', border: 'none',
              backgroundColor: menuOpen ? 'var(--bg-tertiary)' : 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' } }}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: '8px', boxShadow: '0 4px 12px var(--shadow-color)',
                minWidth: '160px', padding: '4px', zIndex: 100,
              }}
            >
              <button
                onClick={handleCopyLink}
                style={{
                  width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  borderRadius: '4px', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? '已复制' : '复制链接'}</span>
              </button>
              <button
                disabled
                title="即将推出"
                style={{
                  width: '100%', padding: '8px 12px', border: 'none', backgroundColor: 'transparent',
                  color: 'var(--text-muted)', cursor: 'not-allowed', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  borderRadius: '4px', textAlign: 'left', opacity: 0.5,
                }}
              >
                <Send size={14} />
                <span>转发到墨问</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
