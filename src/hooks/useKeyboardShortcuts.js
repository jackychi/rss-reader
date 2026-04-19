import { useEffect, useRef } from 'react'

// 声明式键盘快捷键 hook
//
// 接受一个 bindings 数组,每项形如:
//   { key: 'j',       handler: fn }              // 单键
//   { key: 'Shift+A', handler: fn }              // 修饰键 + 键
//   { key: 'Mod+K',   handler: fn, allowInInput: true }  // Mod = Mac Cmd / 其他平台 Ctrl
//   { key: 'g a',     handler: fn }              // chord,空格分隔两段
//   { key: 'Escape',  handler: fn }              // 特殊键名
//   { key: '?',       handler: fn }              // 特殊字符
//
// 行为:
// - 在可编辑元素(input/textarea/select/contenteditable)聚焦时,single/chord 默认不触发;
//   允许 allowInInput: true 的 binding 绕开此限制
// - chord 第一段命中后,1 秒内按第二段生效;超时/按了无匹配的第二段 → 清状态
// - 修饰键严格匹配(需要 Shift 就必须按 Shift,反之亦然),避免 'j' 意外吃到 'Shift+j'
// - 跨平台 Mod:Mac 识别 metaKey,其他平台 ctrlKey

const CHORD_TIMEOUT_MS = 1000

function isMac() {
  if (typeof navigator === 'undefined') return false
  return /mac/i.test(navigator.platform || navigator.userAgent || '')
}

function isEditableTarget(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

// 把单段('Shift+A' / 'j' / 'Escape' / '?')解析成 { key, modifiers }
function parseSingle(str) {
  const tokens = str.split('+').map((t) => t.trim())
  const key = tokens.pop()
  const modifiers = new Set(tokens.map((m) => m.toLowerCase()))
  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    modifiers,
  }
}

// 'j' → {type: 'single', parsed}
// 'g a' → {type: 'chord', prefix, suffix}
function parseBinding(str) {
  const parts = str.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return { type: 'chord', prefix: parseSingle(parts[0]), suffix: parseSingle(parts[1]) }
  }
  return { type: 'single', parsed: parseSingle(str) }
}

function eventMatches(parsed, e, mac) {
  const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (eventKey !== parsed.key) return false
  const needShift = parsed.modifiers.has('shift')
  const needAlt = parsed.modifiers.has('alt')
  const needMod = parsed.modifiers.has('mod') || parsed.modifiers.has('ctrl') || parsed.modifiers.has('cmd') || parsed.modifiers.has('meta')
  const modPressed = mac ? e.metaKey : e.ctrlKey
  if (e.shiftKey !== needShift) return false
  if (e.altKey !== needAlt) return false
  if (modPressed !== needMod) return false
  return true
}

export function useKeyboardShortcuts(bindings) {
  // 用 ref 保存最新 bindings,避免 keydown listener 频繁重挂;但执行时读最新闭包
  // 赋值放 useEffect 里而不是 render 里(React 新 lint 禁止 render 期改 ref)
  const bindingsRef = useRef(bindings)
  useEffect(() => {
    bindingsRef.current = bindings
  })

  useEffect(() => {
    const mac = isMac()
    // chord 待定状态:{ prefix: parsedSingle, timeoutId }
    let pending = null

    function clearPending() {
      if (pending?.timeoutId) clearTimeout(pending.timeoutId)
      pending = null
    }

    function parsed() {
      // 每次事件重新 parse,容忍 bindings 里 key 写法多样
      return bindingsRef.current.map((b) => ({
        ...b,
        _parsed: parseBinding(b.key),
      }))
    }

    function handleKeyDown(e) {
      // 跳过纯修饰键按下(Shift / Control / Meta / Alt 等)避免干扰 chord 状态
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt') return

      const editable = isEditableTarget(e.target)
      const all = parsed()

      // chord 前缀已按下,尝试匹配后缀
      if (pending) {
        const prefix = pending.prefix
        const match = all.find(
          (b) =>
            b._parsed.type === 'chord' &&
            b._parsed.prefix.key === prefix.key &&
            // 修饰键一致(chord 前缀通常无修饰键,但保留完整性)
            [...prefix.modifiers].every((m) => b._parsed.prefix.modifiers.has(m)) &&
            eventMatches(b._parsed.suffix, e, mac)
        )
        clearPending()
        if (match) {
          // chord 命中;可编辑目标 + 非 allowInInput 的仍然要跳过
          if (editable && !match.allowInInput) return
          e.preventDefault()
          try { match.handler(e) } catch (err) { console.error('[shortcut]', match.key, err) }
        }
        return
      }

      // 没有 pending:先看是否命中某个 chord 的前缀
      const chordPrefixMatch = all.find(
        (b) => b._parsed.type === 'chord' && eventMatches(b._parsed.prefix, e, mac)
      )
      if (chordPrefixMatch) {
        if (editable && !chordPrefixMatch.allowInInput) return
        e.preventDefault()
        pending = {
          prefix: chordPrefixMatch._parsed.prefix,
          timeoutId: setTimeout(clearPending, CHORD_TIMEOUT_MS),
        }
        return
      }

      // 单键匹配
      const singleMatch = all.find(
        (b) => b._parsed.type === 'single' && eventMatches(b._parsed.parsed, e, mac)
      )
      if (!singleMatch) return
      if (editable && !singleMatch.allowInInput) return
      e.preventDefault()
      try { singleMatch.handler(e) } catch (err) { console.error('[shortcut]', singleMatch.key, err) }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearPending()
    }
  }, [])
}
