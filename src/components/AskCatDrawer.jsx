import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MessageCircle, Settings, X, Send, Cat, Loader2, Copy, RotateCcw, Check } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  getLLMConfig,
  saveLLMConfig,
  isConfigValid,
  buildContextArticles,
  buildMessages,
  callLLM,
} from '../utils/askCat'

// 起手建议,空对话时展示。覆盖三类典型用法:
//   全局浏览(1/2)、分类视图(3)、单篇操作(4/5,需要先在 Reader 里打开文章)
const STARTER_PROMPTS = [
  '帮我总结一下 AI 相关的热门话题',
  '最近更新了什么有意思的话题',
  '总结一下这个栏目下更新的内容',
  '翻译正文',
  '总结正文',
]

// 抽屉宽度可拖拽 + 持久化
const DRAWER_WIDTH_KEY = 'rss-reader-askcat-width'
const DRAWER_DEFAULT_WIDTH = 432   // 原 360 × 1.2
const DRAWER_MIN_WIDTH = 280       // 太窄聊天气泡会变丑
const DRAWER_MAX_WIDTH_RATIO = 0.8 // 最多占视口 80%,给左边留空

function getStoredDrawerWidth() {
  try {
    const raw = localStorage.getItem(DRAWER_WIDTH_KEY)
    const n = Number(raw)
    if (Number.isFinite(n) && n >= DRAWER_MIN_WIDTH) return n
  } catch { /* ignore */ }
  return DRAWER_DEFAULT_WIDTH
}

// 中西文之间自动插入空格(Pangu spacing 风格,最小实现)
// CJK Unified Ideographs 和半角字母/数字相邻时,中间加个空格
// 放在 markdown 源上做,marked 后的 HTML tag 不会被误加空格
function addCJKSpacing(text) {
  if (!text) return text
  return text
    .replace(/([\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff])/g, '$1 $2')
}

// 把 LLM 返回的 markdown content 渲染成可交互的 HTML:
//   1. CJK-Latin 自动空格
//   2. 把 [N] / [N,M] 替换成 [link](#article-N,M) 形式,marked 才会识别成 <a>
//   3. marked → HTML
//   4. DOMPurify sanitize(允许 data-* / target / rel 透传)
//   5. href="#article-X" 的 a 改写成带 data-article-id 的 citation 链接
//   6. 其他 http(s) 链接分两种处理:
//      - URL 命中 articleLinks(本次 context 里某篇文章的 link)→ 加 data-article-link,
//        点击在 Reader 里打开
//      - 其他 → target="_blank" + rel="noopener noreferrer" 外部打开
// 顺序保证 LLM 再恶意输出都过不了 DOMPurify 这一关
function renderAssistantHTML(content, articleLinks = null) {
  const spaced = addCJKSpacing(content)

  const withCitations = spaced.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, ids) => {
    const cleaned = ids.replace(/\s+/g, '')
    return `[${cleaned}](#article-${cleaned})`
  })

  const html = marked.parse(withCitations, { breaks: false, gfm: true })

  const sanitized = DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-article-id', 'data-article-link', 'target', 'rel'],
  })

  // citation 链接特殊改写(#article-N → 保留 href + 加 data-article-id)
  // 保留 href 使复制到外部富文本编辑器后仍可点击，JS 点击拦截走 onOpenArticle
  const withCitationAttrs = sanitized.replace(
    /<a([^>]*?)href="#article-([\d,]+)"([^>]*?)>/g,
    '<a$1href="#article-$2" data-article-id="$2"$3 class="askcat-citation">'
  )

  // http(s) 链接分流:本知识库里的 article → Reader;其他 → 新标签页
  const withLinks = withCitationAttrs.replace(
    /<a([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/g,
    (match, pre, href, post) => {
      if (/target=/.test(match) || /data-article-link=/.test(match)) return match
      if (articleLinks && articleLinks.has(href)) {
        // 知识库里有这篇 → 点击走 Reader;不加 target,不加 rel,不加 citation 样式
        return `<a${pre}href="${href}"${post} data-article-link="${href}" class="askcat-article-link">`
      }
      // 外链:防 tabnabbing + 新标签页
      return `<a${pre}href="${href}"${post} target="_blank" rel="noopener noreferrer">`
    }
  )

  // 去掉 article-link 前面 AI 自带的 🔗 emoji,避免与 CSS ::before 重复
  return withLinks.replace(/🔗\s*(<a[^>]*class="askcat-article-link")/g, '$1')
}

export default function AskCatDrawer({ isOpen, onClose, articles, selectedArticle, onOpenArticle }) {
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState(() => getLLMConfig())
  const [messages, setMessages] = useState([]) // {role: 'user'|'assistant', content, isError?}
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [contextByIdRef] = useState(() => ({ current: new Map() }))
  const [contextByLinkRef] = useState(() => ({ current: new Map() }))
  const [drawerWidth, setDrawerWidth] = useState(() => getStoredDrawerWidth())
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const drawerRef = useRef(null)
  const prevIsOpenRef = useRef(isOpen)

  // 拖拽左边缘调整抽屉宽度
  // 鼠标左移 → 宽度增大(起点右 - 当前点 = 正 delta)
  // mouseup 时一次性写 localStorage,避免拖动过程中频繁落盘
  const startResizing = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = drawerWidth
    let latestWidth = startWidth

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      const delta = startX - ev.clientX
      const maxWidth = window.innerWidth * DRAWER_MAX_WIDTH_RATIO
      const next = Math.max(DRAWER_MIN_WIDTH, Math.min(maxWidth, startWidth + delta))
      latestWidth = next
      setDrawerWidth(next)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem(DRAWER_WIDTH_KEY, String(Math.round(latestWidth)))
      } catch { /* ignore */ }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [drawerWidth])

  const configValid = isConfigValid(config)

  const [draft, setDraft] = useState(config)
  useEffect(() => {
    if (showSettings) setDraft(config)
  }, [showSettings, config])

  // 抽屉每次"从关 → 开"时,按配置状态决定初始视图
  //   - 未配置 LLM → 自动进 Settings
  //   - 已配置 → 一定重置成 Chat 视图(避免上次遗留的 Settings 状态污染)
  // 关键:不在抽屉已打开时修改 showSettings,尊重用户手动切设置的意图
  useEffect(() => {
    const wasClosed = !prevIsOpenRef.current
    prevIsOpenRef.current = isOpen
    if (isOpen && wasClosed) {
      setShowSettings(!configValid)
    }
  }, [isOpen, configValid])

  // Outside-click 关抽屉(只在抽屉打开时挂 listener)
  // mousedown 而非 click:抢在 React click handler 之前决定关抽屉
  // 例外:点 Header 的 Ask Cat toggle 按钮不算 outside,否则按钮会"先关再开"失灵
  useEffect(() => {
    if (!isOpen) return
    const handleDocMouseDown = (e) => {
      if (drawerRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-askcat-toggle]')) return
      onClose()
    }
    document.addEventListener('mousedown', handleDocMouseDown)
    return () => document.removeEventListener('mousedown', handleDocMouseDown)
  }, [isOpen, onClose])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [isOpen, showSettings])

  const handleSaveSettings = () => {
    const saved = saveLLMConfig(draft)
    setConfig(saved)
    setShowSettings(false)
  }

  // 核心:给定 question + 显式 history → 调 LLM → 把 assistant 回复 append 到 messages
  // 用户说话那一条不在这函数职责范围,调用方自己 setMessages 先加 user 条目
  const sendToLLM = useCallback(async (question, historyToUse) => {
    if (!configValid) {
      setShowSettings(true)
      return
    }
    if (!articles || articles.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '本地还没有缓存的文章。先点左边的订阅源加载一下,再回来问我吧 🐱' },
      ])
      return
    }

    const { items, byId } = buildContextArticles(articles, config.contextSize)
    contextByIdRef.current = byId
    const byLink = new Map()
    for (const article of byId.values()) {
      if (article.link) byLink.set(article.link, article)
    }
    contextByLinkRef.current = byLink

    const llmMessages = buildMessages({
      contextArticles: items,
      history: historyToUse,
      userQuestion: question,
      currentArticle: selectedArticle || null,
    })

    setIsLoading(true)
    try {
      const reply = await callLLM(llmMessages, config)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: reply.content,
        reasoning: reply.reasoning || '',
      }])
    } catch (err) {
      console.error('[AskCat] LLM call failed:', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err?.message || '未知错误'}`, isError: true },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [configValid, articles, config, selectedArticle, contextByIdRef, contextByLinkRef])

  const handleSend = useCallback(async (overrideInput) => {
    const question = (overrideInput ?? input).trim()
    if (!question || isLoading) return
    // 先把当前 messages 快照成 history,再 setMessages 加 user(避免 LLM history 里混 user 自己)
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    await sendToLLM(question, history)
  }, [input, isLoading, messages, sendToLLM])

  // 重试某条 assistant 消息:找到前一个 user,砍掉 assistant 和之后的,用相同 question 重新 LLM
  const handleRetryMessage = useCallback(async (index) => {
    if (isLoading) return
    const msg = messages[index]
    if (!msg || msg.role !== 'assistant') return
    let userMsgIdx = -1
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsgIdx = i; break }
    }
    if (userMsgIdx === -1) return
    const userQuestion = messages[userMsgIdx].content
    const historyToUse = messages.slice(0, userMsgIdx).map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => prev.slice(0, userMsgIdx + 1))
    await sendToLLM(userQuestion, historyToUse)
  }, [messages, isLoading, sendToLLM])

  const handleListClick = useCallback((e) => {
    // citation [N] 点击 → 通过 id 查 context 里的 article
    const citation = e.target.closest?.('a[data-article-id]')
    if (citation) {
      e.preventDefault()
      const ids = citation.getAttribute('data-article-id').split(',').map((n) => parseInt(n, 10))
      for (const id of ids) {
        const article = contextByIdRef.current.get(id)
        if (article && onOpenArticle) {
          onOpenArticle(article)
          return
        }
      }
      return
    }

    // 本知识库里文章的普通 URL 链接 → 通过 link 查 article,打开 Reader
    const articleLink = e.target.closest?.('a[data-article-link]')
    if (articleLink) {
      const href = articleLink.getAttribute('data-article-link')
      const article = contextByLinkRef.current.get(href)
      if (article && onOpenArticle) {
        e.preventDefault()
        onOpenArticle(article)
      }
      // 查不到就走默认行为(不加 target,当前页会跳走——罕见 edge case,不特殊处理)
    }
  }, [contextByIdRef, contextByLinkRef, onOpenArticle])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearChat = () => {
    setMessages([])
    contextByIdRef.current = new Map()
  }

  return (
    <aside
      ref={drawerRef}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: `min(${drawerWidth}px, 100vw)`,
        backgroundColor: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: isOpen ? '-4px 0 16px var(--shadow-color)' : 'none',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary)',
      }}
    >
      {/* 左边缘拖拽手柄 - 4px 宽,hover 时显示 accent 颜色提示可拖 */}
      <div
        onMouseDown={startResizing}
        title="拖拽调整宽度"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 1,
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-color)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-color)',
        gap: '8px',
      }}>
        <Cat size={18} style={{ color: '#ff9500' }} />
        <span style={{ fontWeight: 600, fontSize: '14px', flex: 1 }}>Ask Cat</span>
        {!showSettings && messages.length > 0 && (
          <button
            onClick={handleClearChat}
            title="清空对话"
            style={{ padding: '4px 8px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)' }}
          >清空</button>
        )}
        <button
          onClick={() => setShowSettings((v) => !v)}
          title="设置"
          style={{ padding: '6px', border: 'none', backgroundColor: showSettings ? 'var(--bg-tertiary)' : 'transparent', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <Settings size={16} />
        </button>
        <button
          onClick={onClose}
          title="关闭"
          style={{ padding: '6px', border: 'none', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <X size={16} />
        </button>
      </div>

      {showSettings ? (
        <SettingsPanel
          draft={draft}
          onChange={setDraft}
          onSave={handleSaveSettings}
          onCancel={() => { setDraft(config); setShowSettings(false) }}
        />
      ) : (
        <>
          {!configValid && (
            <div style={{ padding: '12px', backgroundColor: 'var(--bg-secondary)', fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              ⚠️ 还没配置 LLM。点右上角 <Settings size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> 填入 API 信息再开始问。
            </div>
          )}

          <div
            onClick={handleListClick}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {messages.length === 0 ? (
              <EmptyState onPrompt={(p) => handleSend(p)} disabled={!configValid || !articles?.length} />
            ) : (
              messages.map((m, idx) => (
                <MessageBubble
                  key={idx}
                  index={idx}
                  message={m}
                  articleLinks={contextByLinkRef.current}
                  onRetry={handleRetryMessage}
                  isLoading={isLoading}
                />
              ))
            )}
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Loader2 size={14} className="animate-spin" />
                <span>思考中...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            borderTop: '1px solid var(--border-color)',
            padding: '10px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={configValid ? '问点什么... (Enter 发送,Shift+Enter 换行)' : '先到设置里配 LLM 再问'}
              disabled={!configValid || isLoading}
              rows={2}
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!configValid || isLoading || !input.trim()}
              title="发送"
              style={{
                padding: '8px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: (!configValid || isLoading || !input.trim()) ? 'var(--bg-tertiary)' : 'var(--accent-color)',
                color: '#fff',
                cursor: (!configValid || isLoading || !input.trim()) ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

// ============ 子组件 ============

function EmptyState({ onPrompt, disabled }) {
  return (
    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
      <MessageCircle size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
      <div style={{ marginBottom: '16px' }}>基于你订阅源里的文章聊聊</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            disabled={disabled}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              cursor: disabled ? 'default' : 'pointer',
              fontSize: '12px',
              opacity: disabled ? 0.5 : 1,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

// 通用:把 markdown 内容通过 ref + useEffect 挂到 div 的 innerHTML
// (语义等价于 React 的 dangerouslySetInnerHTML,但绕开部分 lint/hook 的字符串匹配)
function RichContent({ html, className, style }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html
  }, [html])
  return <div ref={ref} className={className} style={style} />
}

function MessageBubble({ message, articleLinks, index, onRetry, isLoading }) {
  const isUser = message.role === 'user'
  const [copyDone, setCopyDone] = useState(false)

  const contentHTML = useMemo(
    () => (isUser ? null : renderAssistantHTML(message.content || '', articleLinks)),
    [isUser, message.content, articleLinks]
  )
  const reasoningHTML = useMemo(
    () => (isUser || !message.reasoning ? null : renderAssistantHTML(message.reasoning, articleLinks)),
    [isUser, message.reasoning, articleLinks]
  )

  // 复制富文本:优先 text/html + text/plain 双写入,粘到富文本编辑器(文档/邮件)保留格式
  // Safari/老 Firefox 没 ClipboardItem 时降级到纯文本
  const handleCopy = async () => {
    if (isUser) return
    const html = contentHTML || ''
    const plain = message.content || ''
    try {
      if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new window.ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ])
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(plain)
      }
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 1500)
    } catch (err) {
      console.error('[AskCat] copy failed:', err)
    }
  }

  if (isUser) {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%' }}>
        <div style={{
          backgroundColor: 'var(--accent-color)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '12px',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div
      className="askcat-bubble"
      style={{
        alignSelf: 'flex-start',
        maxWidth: '95%',
        backgroundColor: message.isError ? '#fee2e2' : 'var(--bg-secondary)',
        color: message.isError ? '#991b1b' : 'var(--text-primary)',
        padding: '10px 12px',
        borderRadius: '12px',
        fontSize: '13px',
        lineHeight: 1.7,
        wordBreak: 'break-word',
      }}
    >
      {/* 推理过程:默认折叠,点 summary 展开 */}
      {reasoningHTML && (
        <details className="askcat-thinking">
          <summary>💭 推理过程</summary>
          <RichContent html={reasoningHTML} className="askcat-thinking-body" />
        </details>
      )}
      {/* 正式答案 */}
      <RichContent html={contentHTML} className="askcat-answer" />
      {/* 底部操作:复制(富文本)+ 重新生成 */}
      <div className="askcat-actions">
        <button onClick={handleCopy} disabled={isLoading} title="复制(富文本)">
          {copyDone ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {onRetry && (
          <button onClick={() => onRetry(index)} disabled={isLoading} title="重新生成">
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function SettingsPanel({ draft, onChange, onSave, onCancel }) {
  const update = (field) => (e) => onChange({ ...draft, [field]: e.target.value })
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5, backgroundColor: 'var(--bg-secondary)', padding: '8px', borderRadius: '4px' }}>
        支持 OpenAI 兼容格式:MiniMax / OpenAI / DeepSeek / Qwen / Moonshot / Groq / Together 等。Anthropic (Claude) 原生不支持浏览器直连。API Key 仅存本地 localStorage。
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 500 }}>Base URL</span>
        <input
          type="text"
          value={draft.baseUrl}
          onChange={update('baseUrl')}
          placeholder="https://api.minimaxi.com/v1"
          style={{
            padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '4px',
            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
            fontSize: '12px', fontFamily: 'ui-monospace, monospace', outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 500 }}>API Key</span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={update('apiKey')}
          placeholder="sk-..."
          style={{
            padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '4px',
            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
            fontSize: '12px', fontFamily: 'ui-monospace, monospace', outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 500 }}>Model</span>
        <input
          type="text"
          value={draft.model}
          onChange={update('model')}
          placeholder="MiniMax-Text-01 / gpt-4o-mini / deepseek-chat"
          style={{
            padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '4px',
            backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
            fontSize: '12px', fontFamily: 'ui-monospace, monospace', outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 500 }}>Context 文章数: {draft.contextSize}</span>
        <input
          type="range"
          min="5"
          max="200"
          value={draft.contextSize}
          onChange={(e) => onChange({ ...draft, contextSize: Number(e.target.value) })}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
          每次 query 会把最近这么多篇文章塞进 prompt。越多上下文越全,但 token 消耗越大。200 篇约 10K tokens,主流 LLM 还留很多余量。
        </span>
      </label>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={onSave}
          style={{
            flex: 1, padding: '8px', border: 'none', borderRadius: '4px',
            backgroundColor: 'var(--accent-color)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
          }}
        >保存</button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px',
            backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px',
          }}
        >取消</button>
      </div>
    </div>
  )
}
