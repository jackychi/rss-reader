// Ask Cat - LLM 阅读助手核心逻辑
//
// 职责分三块:
//   1. 配置读取(getLLMConfig / fetchLLMConfig)
//   2. Prompt 构建(buildContextArticles / buildMessages)
//   3. LLM API 调用(callLLM,OpenAI-compatible Chat Completions 格式)
//
// 走 OpenAI-compatible 协议覆盖 MiniMax / OpenAI / DeepSeek / Qwen /
// Moonshot / Groq / Together / Ollama 等一大批服务,用户只要配
// baseUrl + apiKey + model 三件就能接入

import { getArticleKey } from './articleKey'

const env = import.meta.env || {}

export const DEFAULT_CONFIG = {
  baseUrl: (env.VITE_ASKCAT_BASE_URL || '').trim().replace(/\/+$/, ''),
  apiKey: (env.VITE_ASKCAT_API_KEY || '').trim(),
  model: (env.VITE_ASKCAT_MODEL || '').trim(),
  contextSize: Math.max(5, Math.min(200, Number(env.VITE_ASKCAT_CONTEXT_SIZE) || 30)),
}

// ============ 配置读取 ============

export function normalizeLLMConfig(config = {}) {
  return {
    baseUrl: (config.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: (config.apiKey || '').trim(),
    model: (config.model || '').trim(),
    contextSize: Math.max(5, Math.min(200, Number(config.contextSize) || 30)),
  }
}

export function getLLMConfig() {
  return normalizeLLMConfig(DEFAULT_CONFIG)
}

export async function fetchLLMConfig(apiBaseUrl, { signal } = {}) {
  const res = await fetch(`${apiBaseUrl}/api/admin/llm-config`, { signal })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      message = data?.error || message
    } catch { /* ignore */ }
    throw new Error(message)
  }
  const data = await res.json()
  return normalizeLLMConfig({ ...DEFAULT_CONFIG, ...data })
}

export async function saveLLMConfig(apiBaseUrl, config, { signal } = {}) {
  const normalized = normalizeLLMConfig(config)
  const res = await fetch(`${apiBaseUrl}/api/admin/llm-config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(normalized),
    signal,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      message = data?.error || message
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return normalizeLLMConfig({ ...normalized, ...(await res.json()) })
}

export function isConfigValid(config) {
  return !!(config?.baseUrl && config?.apiKey && config?.model)
}

// ============ Prompt 构建 ============

// 从全量 articles 里选最近 N 篇,打包成 LLM 好理解的结构
// 返回 { items: [...], byId: Map<id, article> }
// byId 用于客户端后处理 citation 点击时把 [N] 反查成原始 article 对象
export function buildContextArticles(articles, contextSize = 30) {
  const sorted = [...articles].sort((a, b) => {
    const ta = new Date(a.pubDate || a.isoDate || 0).getTime()
    const tb = new Date(b.pubDate || b.isoDate || 0).getTime()
    return tb - ta
  })
  const recent = sorted.slice(0, contextSize)
  const byId = new Map()
  const items = recent.map((a, idx) => {
    const id = idx + 1
    byId.set(id, a)
    return {
      id,
      feedTitle: a.feedTitle || '(未知订阅源)',
      title: a.title || '(无标题)',
      pubDate: a.pubDate || a.isoDate || '',
      snippet: (a.contentSnippet || '').slice(0, 250),
      link: a.link || '',
      articleKey: getArticleKey(a),
    }
  })
  return { items, byId }
}

const SYSTEM_PROMPT = `You are CatBot, a helpful reading assistant inside CatReader (an RSS reader).
You have access to:
1. CURRENT_ARTICLE: the article the user is currently reading on screen (may be absent).
2. ARTICLES: the user's most recent cached articles across all feeds (for browsing-level queries).

Rules:
- If the user's question references "this article", "这篇", "当前", "it", or asks to
  translate / summarize / analyze / extract from the article they're reading,
  use CURRENT_ARTICLE's full content as the primary source.
- For broader queries (what's new, trending topics, recent updates across feeds),
  use the ARTICLES list.
- When you reference a ARTICLES entry, cite it by its ID in square brackets: [1] or [1,3].
  The brackets must contain only digits and commas.
- **When your response mentions an article or any related web resource, include the
  full URL as a clickable link**. The client will auto-detect article URLs in this
  knowledge base and open them in the in-app reader; other URLs open externally.
- Respond in the same language as the user's question.
- If you don't have enough info to answer, say so honestly — don't invent facts.
- Be concise; don't pad the answer.`

function formatArticleForPrompt(a) {
  return `[${a.id}] 【${a.feedTitle}】${a.title}  (${a.pubDate})
${a.snippet}
link: ${a.link}`
}

// 从 article 对象抽取纯文本 + 图片列表,用于塞进 prompt
// content 字段通常是 HTML,直接塞太吃 token 而且 LLM 也不需要标签
function extractArticleText(article) {
  const html = article.content || article['content:encoded'] || article.contentSnippet || ''
  if (typeof document === 'undefined') {
    // SSR / worker 场景兜底:regex 粗暴剥标签
    return { text: String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), images: [] }
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const images = []
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    const alt = img.getAttribute('alt') || ''
    if (src) images.push({ src, alt })
  })
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  return { text, images }
}

function formatCurrentArticleBlock(article) {
  if (!article) return ''
  const { text, images } = extractArticleText(article)
  const imagesBlock = images.length > 0
    ? `\n\nImages in article (${images.length}):\n${images.map((img, i) =>
        `  ${i + 1}. ${img.alt ? `[${img.alt}] ` : ''}${img.src}`
      ).join('\n')}`
    : ''
  return `\n\nCURRENT_ARTICLE (the user is currently reading this on screen):
Title: ${article.title || ''}
Feed: ${article.feedTitle || ''}
Date: ${article.pubDate || article.isoDate || ''}
Link: ${article.link || ''}

Full content (plain text):
${text}${imagesBlock}`
}

// 构建给 LLM 的完整 messages 数组
// history 是之前的对话(role + content),由调用方传入
// currentArticle 是用户正在 Reader 里看的文章,作为 CURRENT_ARTICLE 特殊注入
export function buildMessages({ contextArticles, history = [], userQuestion, currentArticle = null }) {
  const articlesBlock = contextArticles.length === 0
    ? '(no articles cached yet)'
    : contextArticles.map(formatArticleForPrompt).join('\n\n')

  const currentBlock = formatCurrentArticleBlock(currentArticle)

  return [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}${currentBlock}

ARTICLES (most recent first):

${articlesBlock}`,
    },
    ...history,
    { role: 'user', content: userQuestion },
  ]
}

// ============ LLM 调用 ============

// 从 assistant content 里抽取 <think>...</think> 块作为 reasoning
// 部分模型(DeepSeek R1 等)把推理写在 content 里用标签包裹,而非单独字段
function extractThinkTag(content) {
  if (typeof content !== 'string') return { content: '', reasoning: '' }
  const m = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/)
  if (m) return { reasoning: m[1].trim(), content: m[2].trim() }
  return { content, reasoning: '' }
}

// 调 OpenAI-compatible /chat/completions
// 返回 { content: string, reasoning: string }
// reasoning 来自两个可能位置:
//   - message.reasoning_content(OpenAI o1 / MiniMax-M1 等)
//   - content 里的 <think>...</think> 包裹(DeepSeek R1 等)
// 抛错时 error.message 包含 HTTP status,方便 UI 层分类处理
export async function callLLM(messages, config, { signal } = {}) {
  if (!isConfigValid(config)) {
    throw new Error('LLM 未配置,请先到设置里填入 Base URL / API Key / Model')
  }

  const url = `${config.baseUrl}/chat/completions`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 8000,
      }),
      signal,
    })
  } catch (networkErr) {
    if (networkErr?.name === 'AbortError') {
      throw networkErr
    }
    // TypeError: Failed to fetch 典型就是 CORS 或断网
    const msg = networkErr?.message || String(networkErr)
    if (/CORS|Failed to fetch/i.test(msg)) {
      throw new Error(`网络或 CORS 错误:${msg}。确认 LLM 服务允许浏览器直连(Anthropic 不允许,OpenAI / MiniMax / DeepSeek 允许)`)
    }
    throw new Error(`网络错误:${msg}`)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message || errJson?.message || JSON.stringify(errJson)
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(`LLM API HTTP ${res.status}: ${detail || res.statusText}`)
  }

  const data = await res.json()
  const msg = data?.choices?.[0]?.message
  const rawContent = msg?.content
  if (typeof rawContent !== 'string') {
    throw new Error(`LLM 返回格式非预期: ${JSON.stringify(data).slice(0, 200)}`)
  }

  // 两条路径合并:优先显式 reasoning_content 字段,否则从 content 里剥 <think>
  // Truncation detection
  const finishReason = data?.choices?.[0]?.finish_reason
  let content = rawContent.trim()
  if (finishReason === 'length') {
    content += '\n\n---\n⚠️ 回答因 token 上限被截断，可以缩小问题范围后重试。'
  }

  const explicitReasoning = typeof msg.reasoning_content === 'string' ? msg.reasoning_content.trim() : ''
  if (explicitReasoning) {
    return { content, reasoning: explicitReasoning }
  }
  return extractThinkTag(content)
}

// ============ 文章评分 ============

const SCORE_SYSTEM_PROMPT = `You are a reading curator. Given a list of RSS articles, pick the 12 most worth reading.
Prefer: unique insights, depth, timeliness, and diversity of topics. Avoid duplicates or low-value listicles.
Return ONLY a JSON array of 12 objects: [{"index": <0-based index>, "reason": "<one sentence in Chinese>"}]
No markdown fencing, no explanation outside the array.`

export async function scoreArticles(articles, config) {
  const fallback = () => {
    const shuffled = [...articles].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 12).map((a, i) => ({ article: a, reason: '' }))
  }

  if (!isConfigValid(config) || articles.length <= 12) {
    return articles.length <= 12
      ? articles.map(a => ({ article: a, reason: '' }))
      : fallback()
  }

  const listing = articles.map((a, i) =>
    `[${i}] 【${a.feedTitle || ''}】${a.title || ''} (${a.publishedAt || a.pubDate || ''})\n${(a.contentSnippet || '').slice(0, 120)}`
  ).join('\n\n')

  try {
    const reply = await callLLM([
      { role: 'system', content: SCORE_SYSTEM_PROMPT },
      { role: 'user', content: listing },
    ], config)

    const jsonStr = reply.content.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const picks = JSON.parse(jsonStr)
    if (!Array.isArray(picks)) return fallback()

    const results = []
    for (const p of picks) {
      const idx = typeof p.index === 'number' ? p.index : parseInt(p.index, 10)
      if (idx >= 0 && idx < articles.length) {
        results.push({ article: articles[idx], reason: p.reason || '' })
      }
    }
    return results.length > 0 ? results.slice(0, 12) : fallback()
  } catch (err) {
    console.error('[AskCat] scoreArticles failed, using fallback:', err)
    return fallback()
  }
}
