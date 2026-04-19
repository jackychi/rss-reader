import { useEffect, useMemo } from 'react'
import { Keyboard, X } from 'lucide-react'

// 根据按键字符串生成可渲染的 <kbd> 片段数组
// 'Shift+A' → ['Shift', '+', 'A'];'g a' → ['g', 'a'](两 kbd + 中间" 然后 ")
function renderKeyCaps(key) {
  if (key.includes(' ')) {
    const parts = key.split(/\s+/)
    return parts.map((p, i) => ({ kind: 'chord', index: i, text: p }))
  }
  return key.split('+').map((t, i, arr) => ({
    kind: 'combo',
    index: i,
    text: t,
    isLast: i === arr.length - 1,
  }))
}

function KbdDisplay({ item }) {
  if (item.kind === 'chord') {
    return (
      <>
        {item.index > 0 && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>然后</span>}
        <kbd>{item.text}</kbd>
      </>
    )
  }
  return (
    <>
      <kbd>{item.text}</kbd>
      {!item.isLast && <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>+</span>}
    </>
  )
}

export default function ShortcutsOverlay({ isOpen, onClose, shortcuts = [] }) {
  // 按 group 分组
  const grouped = useMemo(() => {
    const map = new Map()
    for (const s of shortcuts) {
      const g = s.group || '其他'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(s)
    }
    return Array.from(map.entries())
  }, [shortcuts])

  // Esc 关闭(overlay 打开时单独挂,避免跟 useKeyboardShortcuts 的 Escape 抢)
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          padding: '20px 24px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          fontSize: '13px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Keyboard size={18} style={{ color: '#ff9500' }} />
          <span style={{ fontWeight: 600, fontSize: '15px', flex: 1 }}>键盘快捷键</span>
          <button
            onClick={onClose}
            title="关闭"
            style={{ padding: '4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 分组列表 */}
        {grouped.map(([group, items]) => (
          <section key={group} style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px',
            }}>{group}</div>
            <div>
              {items.map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 0',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{s.description}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {renderKeyCaps(s.key).map((item, i) => (
                      <KbdDisplay key={i} item={item} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          提示:在输入框聚焦时,单键/chord 快捷键会让路。Cmd/Ctrl+K 在输入框中也能触发。
        </div>
      </div>
    </div>
  )
}
