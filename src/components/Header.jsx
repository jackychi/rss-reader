import { useState, useRef, useEffect } from 'react'
import { Rss, RefreshCw, Upload, PanelLeft, Sun, Moon, CloudSun, WifiOff } from 'lucide-react'

const themes = [
  { id: 'light', name: '浅色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon },
  { id: 'warm', name: '淡黄', icon: CloudSun },
]

/**
 * Header 组件 - 顶部工具栏
 * 支持：刷新进度显示、主题切换、OPML 导入、离线状态提示
 */
export default function Header({
  theme,
  onToggleTheme,
  onToggleSidebar,
  onRefresh,
  onImportOPML,
  isRefreshing,
  selectedFeed,
  loading,
  progress,
  isOnline
}) {
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const menuRef = useRef(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowThemeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentTheme = themes.find(t => t.id === theme) || themes[0]
  const CurrentIcon = currentTheme.icon

  // 计算进度百分比
  const progressPercent = progress.total > 0
    ? Math.round((progress.loaded / progress.total) * 100)
    : 0

  return (
    <header className="h-12 header flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          style={{ padding: '6px', borderRadius: '6px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Toggle Sidebar"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <PanelLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Rss size={18} style={{ color: '#ff9500' }} />
          <span style={{ fontWeight: 600, fontSize: '15px' }}>CatReader</span>
        </div>

        {/* 离线状态提示 */}
        {!isOnline && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            backgroundColor: 'var(--accent-color)',
            color: '#fff',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 500,
            zIndex: 100
          }}>
            <WifiOff size={12} />
            离线模式
          </div>
        )}
      </div>

      {/* 加载进度条 */}
      {loading && progress.total > 0 && (
        <div style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: '2px',
          width: '100%',
          backgroundColor: 'var(--bg-tertiary)'
        }}>
          <div style={{
            height: '100%',
            width: `${progressPercent}%`,
            backgroundColor: 'var(--accent-color)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* 刷新按钮 + 进度 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {loading && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '32px' }}>
              {progressPercent}%
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={!selectedFeed || isRefreshing || loading}
            style={{
              padding: '6px',
              borderRadius: '6px',
              opacity: !selectedFeed || isRefreshing || loading ? 0.5 : 1,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: !selectedFeed || isRefreshing || loading ? 'default' : 'pointer'
            }}
            title={loading ? `加载中 ${progressPercent}%` : 'Refresh'}
            onMouseEnter={(e) => { if (selectedFeed && !loading) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <RefreshCw size={18} className={isRefreshing || loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <label style={{ padding: '6px', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'transparent' }} title="Import OPML"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Upload size={18} />
          <input
            type="file"
            accept=".opml,.xml"
            onChange={onImportOPML}
            className="hidden"
          />
        </label>

        {/* 主题切换按钮 */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: showThemeMenu ? 'var(--bg-tertiary)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="切换主题"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => { if (!showThemeMenu) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <CurrentIcon size={16} />
            <span style={{ fontSize: '12px' }}>{currentTheme.name}</span>
          </button>

          {/* 主题菜单 */}
          {showThemeMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px var(--shadow-color)',
              padding: '4px',
              zIndex: 1000,
              minWidth: '100px'
            }}>
              {themes.map(t => {
                const Icon = t.icon
                const isActive = t.id === theme
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      onToggleTheme(t.id)
                      setShowThemeMenu(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      backgroundColor: isActive ? 'var(--active-bg)' : 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400
                    }}
                  >
                    <Icon size={14} />
                    {t.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
