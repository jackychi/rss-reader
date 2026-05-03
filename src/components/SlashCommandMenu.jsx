import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { groupCommandsByContext, filterCommands } from '../utils/slashCommands'

export default forwardRef(function SlashCommandMenu({ commands, query, onSelect, onClose, visible }, ref) {
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])
  const groups = useMemo(() => groupCommandsByContext(filtered), [filtered])
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups])
  const [activeIndex, setActiveIndex] = useState(0)
  const itemRefs = useRef([])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = itemRefs.current[activeIndex]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = useCallback((e) => {
    if (!visible || flatItems.length === 0) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => (i + 1) % flatItems.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => (i - 1 + flatItems.length) % flatItems.length)
      return true
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(flatItems[activeIndex])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return true
    }
    return false
  }, [visible, flatItems, activeIndex, onSelect, onClose])

  useImperativeHandle(ref, () => ({
    __handleKeyDown: handleKeyDown,
  }), [handleKeyDown])

  if (!visible || flatItems.length === 0) return null

  let itemIndex = 0

  return (
    <div className="slash-menu">
      {groups.map((group) => (
        <div key={group.label} className="slash-menu-group">
          <div className="slash-menu-group-label">{group.label}</div>
          {group.items.map((cmd) => {
            const idx = itemIndex++
            return (
              <div
                key={cmd.id}
                ref={el => { itemRefs.current[idx] = el }}
                className={`slash-menu-item ${idx === activeIndex ? 'slash-menu-item--active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => onSelect(cmd)}
              >
                <span className="slash-menu-item-command">{cmd.command}</span>
                <span className="slash-menu-item-label">{cmd.label}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
})
