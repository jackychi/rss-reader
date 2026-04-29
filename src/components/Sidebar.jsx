import { Rss, ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Search, Bookmark } from 'lucide-react'

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
  onSelectCategory,
  searchQuery,
  onSearchChange,
  unreadCounts,
  dataReady = true,
  articleCount = 0,
  readingListCount = 0,
  showReadingList = false,
  onToggleReadingList
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
  const formattedArticleCount = articleCount.toLocaleString('en-US')

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
      </div>

      {/* 文章总计 */}
      <div style={{ padding: '0 12px 12px' }}>
        <div
          onClick={onSelectAll}
          className={`sidebar-item ${(selectedFeed?.xmlUrl === 'cached') || (!selectedFeed && !showReadingList) ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '6px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <FileText size={16} style={{ flexShrink: 0 }} />
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              文章总计
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1, transform: 'translateY(1px)' }}>
                {formattedArticleCount}
              </span>
            </span>
          </div>
          {dataReady && totalUnread > 0 && (
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

      {/* 阅读列表 */}
      <div style={{ padding: '0 12px 12px' }}>
        <div
          onClick={onToggleReadingList}
          className={`sidebar-item ${showReadingList ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '6px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={16} />
            <span>阅读列表</span>
          </div>
          {dataReady && readingListCount > 0 && (
            <span style={{
              backgroundColor: 'var(--accent-color)',
              color: '#fff',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '10px',
              fontWeight: 600
            }}>
              {readingListCount}
            </span>
          )}
        </div>
      </div>

      {/* 分类列表 */}
      <div style={{ padding: '0 8px' }}>
        {filteredFeeds.map((category) => {
          const categoryUnread = unreadCounts[category.category] || 0
          const isExpanded = expandedCategories[category.category]
          const isSelected = selectedFeed?.xmlUrl === `category:${category.category}`

          return (
            <div key={category.category} style={{ marginBottom: '4px' }}>
              <div
                onClick={() => {
                  // 同一次点击做两件事:同时选中该分类(中间栏展示该分类全部缓存文章)
                  // 与切换展开/收起状态
                  onSelectCategory?.(category.category)
                  onToggleCategory(category.category)
                }}
                className={isSelected ? 'sidebar-item active' : 'sidebar-item'}
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
                {dataReady && categoryUnread > 0 && !searchQuery && (
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
                          {dataReady && feedUnread > 0 && (
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
