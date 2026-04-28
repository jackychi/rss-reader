import { useState, useRef, useEffect } from 'react'
import { Rss, RefreshCw, Upload, PanelLeft, Sun, Moon, CloudSun, WifiOff, Cloud, Copy, Check, MessageCircle, Keyboard } from 'lucide-react'

const themes = [
  { id: 'light', name: '浅色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon },
  { id: 'warm', name: '淡黄', icon: CloudSun },
]

// 相对时间格式化(不引 date-fns 避免又多一个 import)
function formatRelative(ts) {
  if (!ts) return '从未'
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

function syncIconColor(status) {
  switch (status) {
    case 'syncing': return 'var(--accent-color)'
    case 'ok': return '#10b981'
    case 'error': return '#ef4444'
    default: return 'var(--text-muted)'
  }
}

/**
 * Header 组件 - 顶部工具栏
 * 支持：刷新进度显示、主题切换、OPML 导入、离线状态提示、跨设备同步
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
  isOnline,
  // 同步相关
  syncId,
  syncStatus = 'idle',
  syncError = null,
  lastSyncedAt = null,
  onEnableSync,
  onPairSync,
  onSync,
  onDisableSync,
  // Ask Cat
  onToggleAskCat,
  isAskCatOpen = false,
  // 快捷键帮助
  onShowShortcuts,
}) {
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [showSyncMenu, setShowSyncMenu] = useState(false)
  const [pairingMode, setPairingMode] = useState(false)
  const [pairingInput, setPairingInput] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [syncIdDraftState, setSyncIdDraftState] = useState(() => ({
    baseSyncId: syncId || '',
    value: syncId || '',
  }))
  const currentSyncId = syncId || ''
  const syncIdDraft = syncIdDraftState.baseSyncId === currentSyncId
    ? syncIdDraftState.value
    : currentSyncId
  const syncIdDraftTrimmed = syncIdDraft.trim()
  const isSyncIdDirty = syncIdDraftTrimmed.length > 0 && syncIdDraftTrimmed !== currentSyncId

  const setSyncIdDraft = (value) => {
    setSyncIdDraftState({ baseSyncId: currentSyncId, value })
  }

  const handleSaveSyncId = () => {
    if (!isSyncIdDirty) return
    const ok = confirm(
      '切换到此 Sync ID 会立即同步:当前设备的数据会与新 ID 对应的远端数据合并(UNION),然后双向写入。\n\n确定切换?'
    )
    if (!ok) return
    onPairSync?.(syncIdDraftTrimmed)
  }
  const menuRef = useRef(null)
  const syncMenuRef = useRef(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowThemeMenu(false)
      }
      if (syncMenuRef.current && !syncMenuRef.current.contains(e.target)) {
        setShowSyncMenu(false)
        setPairingMode(false)
        setPairingInput('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCopySyncId = async () => {
    if (!syncId) return
    try {
      await navigator.clipboard.writeText(syncId)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    } catch {
      // clipboard API 不可用时忽略,用户仍能手选复制
    }
  }

  const handleSubmitPair = () => {
    const id = pairingInput.trim()
    if (!id) return
    onPairSync?.(id)
    setPairingMode(false)
    setPairingInput('')
  }

  const handleDisable = () => {
    if (confirm('确定要关闭同步?本地数据保留,但新变化不再同步到其他设备。')) {
      onDisableSync?.()
      setShowSyncMenu(false)
    }
  }

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
        {/* 跨设备同步 */}
        <div ref={syncMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowSyncMenu((v) => !v)}
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: showSyncMenu ? 'var(--bg-tertiary)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title={syncId ? `同步: ${syncStatus === 'error' ? '错误' : '已启用'}` : '跨设备同步'}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => { if (!showSyncMenu) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Cloud
              size={18}
              style={{ color: syncIconColor(syncStatus) }}
              className={syncStatus === 'syncing' ? 'animate-pulse' : ''}
            />
          </button>

          {showSyncMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px var(--shadow-color)',
              padding: '12px',
              zIndex: 1000,
              minWidth: '280px',
              fontSize: '13px',
              color: 'var(--text-primary)',
            }}>
              {!syncId ? (
                // ---- 未启用状态 ----
                pairingMode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 600 }}>粘贴另一设备的 Sync ID</div>
                    <input
                      type="text"
                      autoFocus
                      value={pairingInput}
                      onChange={(e) => setPairingInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitPair() }}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      style={{
                        padding: '6px 8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontFamily: 'ui-monospace, monospace',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={handleSubmitPair}
                        style={{ flex: 1, padding: '6px', border: 'none', backgroundColor: 'var(--accent-color)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >确定</button>
                      <button
                        onClick={() => { setPairingMode(false); setPairingInput('') }}
                        style={{ flex: 1, padding: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >取消</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontWeight: 600 }}>☁️ 跨设备同步</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                      同步已读状态和阅读列表。首次启用会生成一个 Sync ID,在另一台设备上粘贴此 ID 即可配对。
                    </div>
                    <button
                      onClick={() => { onEnableSync?.(); setShowSyncMenu(false) }}
                      style={{ padding: '8px', border: 'none', backgroundColor: 'var(--accent-color)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
                    >启用同步</button>
                    <button
                      onClick={() => setPairingMode(true)}
                      style={{ padding: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-primary)', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >用现有 ID 配对</button>
                  </div>
                )
              ) : (
                // ---- 已启用状态 ----
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cloud size={14} style={{ color: syncIconColor(syncStatus) }} />
                    <span>
                      {syncStatus === 'syncing' ? '正在同步...'
                        : syncStatus === 'error' ? '同步失败'
                        : '同步已启用'}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Sync ID(勿公开分享,等同密钥;可编辑直接切换)
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={syncIdDraft}
                      onChange={(e) => setSyncIdDraft(e.target.value)}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontFamily: 'ui-monospace, monospace',
                        backgroundColor: 'var(--bg-secondary)',
                        border: `1px solid ${isSyncIdDirty ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleCopySyncId}
                      title={copyFeedback ? '已复制' : '复制'}
                      style={{ padding: '6px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-primary)' }}
                    >
                      {copyFeedback ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  {isSyncIdDirty && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        切换到新 ID 会合并并同步
                      </span>
                      <button
                        onClick={handleSaveSyncId}
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: 'var(--accent-color)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 500,
                        }}
                      >保存</button>
                      <button
                        onClick={() => setSyncIdDraft(syncId || '')}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          backgroundColor: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >取消</button>
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    上次同步: {formatRelative(lastSyncedAt)}
                    {syncError && (
                      <div style={{ color: '#ef4444', marginTop: '4px', fontSize: '11px' }}>
                        {syncError}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => { onSync?.() }}
                    disabled={syncStatus === 'syncing'}
                    style={{
                      padding: '8px',
                      border: 'none',
                      backgroundColor: 'var(--accent-color)',
                      color: '#fff',
                      borderRadius: '4px',
                      cursor: syncStatus === 'syncing' ? 'default' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      opacity: syncStatus === 'syncing' ? 0.6 : 1,
                    }}
                  >立即同步</button>

                  <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                  <button
                    onClick={handleDisable}
                    style={{ padding: '6px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                  >关闭同步</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 快捷键帮助 */}
        <button
          onClick={onShowShortcuts}
          style={{ padding: '6px', borderRadius: '6px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
          title="键盘快捷键 (按 ? 也可)"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Keyboard size={18} />
        </button>

        {/* Ask Cat */}
        <button
          data-askcat-toggle
          onClick={onToggleAskCat}
          style={{
            padding: '6px',
            borderRadius: '6px',
            backgroundColor: isAskCatOpen ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          title="Ask Cat — 基于你订阅源文章的 LLM 助手"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
          onMouseLeave={(e) => { if (!isAskCatOpen) e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <MessageCircle size={18} />
        </button>

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
