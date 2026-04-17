// Ask Cat - LLM 阅读助手核心逻辑
//
// 职责分三块:
//   1. 配置管理(getLLMConfig / saveLLMConfig)
//   2. Prompt 构建(buildContextArticles / buildMessages)
//   3. LLM API 调用(callLLM,OpenAI-compatible Chat Completions 格式)
//
// 走 OpenAI-compatible 协议覆盖 MiniMax / OpenAI / DeepSeek / Qwen /
// Moonshot / Groq / Together / Ollama 等一大批服务,用户只要配
// baseUrl + apiKey + model 三件就能接入

import { getArticleKey } from './articleKey'

const CONFIG_KEY = 'rss-reader-llm-config'

export const DEFAULT_CONFIG = {
  baseUrl: '',
  apiKey: '',
  model: '',
  contextSize: 30,
}

// ============ 配置管理 ============

export function getLLMConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveLLMConfig(config) {
  const clean = {
    baseUrl: (config.baseUrl || '').trim().replace(/\/+$/, ''), // 去尾部斜杠
    apiKey: (config.apiKey || '').trim(),
    model: (config.model || '').trim(),
    contextSize: Math.max(5, Math.min(50, Number(config.contextSize) || 30)),
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(clean))
  return clean
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
You have access to the user's most recent articles below.

Rules:
- Answer based ONLY on the provided articles.
- When you reference an article, cite it by its ID in square brackets, like [1] or [1,3]. The brackets must contain only digits and commas.
- Respond in the same language as the user's question.
- If the articles do not contain enough information to answer, say so honestly — do not invent facts.
- Be concise; do not pad the answer.`

function formatArticleForPrompt(a) {
  return `[${a.id}] 【${a.feedTitle}】${a.title}  (${a.pubDate})
${a.snippet}
link: ${a.link}`
}

// 构建给 LLM 的完整 messages 数组
// history 是之前的对话(role + content),由调用方传入
export function buildMessages({ contextArticles, history = [], userQuestion }) {
  const articlesBlock = contextArticles.length === 0
    ? '(no articles cached yet)'
    : contextArticles.map(formatArticleForPrompt).join('\n\n')

  return [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}

ARTICLES (most recent first):

${articlesBlock}`,
    },
    ...history,
    { role: 'user', content: userQuestion },
  ]
}

// ============ LLM 调用 ============

// 调 OpenAI-compatible /chat/completions
// 返回 assistant message content(string)
// 抛错时 error.message 包含 HTTP status,方便 UI 层分类处理
export async function callLLM(messages, config) {
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
        max_tokens: 2000,
      }),
    })
  } catch (networkErr) {
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
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`LLM 返回格式非预期: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return content
}
