import { Rss, ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Search } from 'lucide-react'

/**
 * Sidebar 组件 - 左侧订阅源导航
 * 支持：搜索过滤、分类展开/折叠、订阅源选择
 */
export default function Sidebar({
  feeds,
  selectedFeed,
  expandedCategories,
  onToggleCategory,
  onSelectFeed,
  onSelectAll,
  searchQuery,
  onSearchChange,
  unreadCounts
}) {
  // 过滤订阅源
  const filterFeeds = (feeds) => {
    if (!searchQuery.trim()) return feeds

    const query = searchQuery.toLowerCase()
    return feeds.map(category => ({
      ...category,
      feeds: category.feeds.filter(
        feed => feed.title.toLowerCase().includes(query)
      )
    })).filter(category => category.feeds.length > 0)
  }

  const filteredFeeds = filterFeeds(feeds)

  // 计算总未读数 - 只计算每个feed的未读数，不包含分类的未读数（避免重复相加）
  const totalUnread = feeds.reduce((total, category) => {
    const categoryFeedUnread = category.feeds.reduce((sum, feed) => {
      const feedKey = `${category.category}-${feed.xmlUrl}`
      return sum + (unreadCounts[feedKey] || 0)
    }, 0)
    return total + categoryFeedUnread
  }, 0)

  return (
    <aside className="sidebar w-64 overflow-y-auto shrink-0" style={{ borderRight: '1px solid var(--border-color)' }}>
      {/* 搜索框 */}
      <div style={{ padding: '12px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="搜索订阅源..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
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
      </div>

      {/* 已缓存文章 */}
      <div style={{ padding: '0 12px 12px' }}>
        <div
          onClick={onSelectAll}
          className={`sidebar-item ${!selectedFeed || selectedFeed.xmlUrl === 'cached' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '6px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} />
            <span>已缓存文章</span>
          </div>
          {totalUnread > 0 && (
            <span style={{
              backgroundColor: 'var(--accent-color)',
              color: '#fff',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {totalUnread}
            </span>
          )}
        </div>
      </div>

      {/* 分类列表 */}
      <div style={{ padding: '0 8px' }}>
        {filteredFeeds.map((category) => {
          const categoryUnread = unreadCounts[category.category] || 0
          const isExpanded = expandedCategories[category.category]

          return (
            <div key={category.category} style={{ marginBottom: '4px' }}>
              <div
                onClick={() => onToggleCategory(category.category)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isExpanded ? (
                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
                  ) : (
                    <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  {isExpanded ? (
                    <FolderOpen size={16} style={{ color: 'var(--text-secondary)' }} />
                  ) : (
                    <Folder size={16} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {category.category}
                  </span>
                </div>
                {categoryUnread > 0 && !searchQuery && (
                  <span style={{
                    backgroundColor: 'var(--accent-color)',
                    color: '#fff',
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: 600
                  }}>
                    {categoryUnread}
                  </span>
                )}
              </div>

              {isExpanded && (
                <div style={{ paddingLeft: '24px' }}>
                  {category.feeds.length === 0 ? (
                    <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      无匹配结果
                    </div>
                  ) : (
                    category.feeds.map((feed) => {
                      const feedUnread = unreadCounts[`${category.category}-${feed.xmlUrl}`] || 0
                      return (
                        <div
                          key={feed.xmlUrl}
                          onClick={() => onSelectFeed(category.category, feed)}
                          className={`sidebar-item ${selectedFeed?.xmlUrl === feed.xmlUrl ? 'active' : ''}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '6px', fontSize: '14px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                            <Rss size={12} style={{ color: '#ff9500', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feed.title}</span>
                          </div>
                          {feedUnread > 0 && (
                            <span style={{
                              backgroundColor: 'var(--accent-color)',
                              color: '#fff',
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '10px',
                              fontWeight: 600,
                              flexShrink: 0
                            }}>
                              {feedUnread}
                            </span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
