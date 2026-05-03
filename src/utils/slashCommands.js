const FOLLOW_UP_INSTRUCTION = `

【重要】在回答末尾，必须另起两行，给出恰好两个读者可能感兴趣的后续追问。
每行以 [?] 开头，格式如下：
[?] 问题1
[?] 问题2`

const COMMANDS = [
  // ── article 级 ──
  {
    id: 'summary',
    command: '/summary',
    label: '总结全文',
    context: ['article'],
    buildPrompt: () =>
      `请为这篇文章提供一个清晰、简洁的总结。先给个一句话介绍，然后提炼核心观点和总结。
默认读者已经对相关背景有一定了解。为了可读性，多用短句和自然过渡，避免长句、过多从句和分号。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'keypoints',
    command: '/keypoints',
    label: '提取要点',
    context: ['article'],
    buildPrompt: () =>
      `请从当前文章中提取 3-5 个关键要点，每个要点用一句话概括核心信息。
要点之间保持独立、不重复。按重要性排序。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'translate',
    command: '/translate',
    label: '翻译全文',
    context: ['article'],
    buildPrompt: () =>
      `请翻译当前文章的全文。如果原文是英文则翻译为中文，如果原文是中文则翻译为英文。
保留原文的段落结构和格式。专业术语首次出现时在括号中保留原文。`,
  },
  {
    id: 'explain',
    command: '/explain',
    label: '术语解释',
    context: ['article'],
    buildPrompt: () =>
      `请找出当前文章中的专业术语、技术概念和不易理解的背景知识，逐一解释。
解释要简明扼要，假设读者有基本的技术素养但不一定了解该细分领域。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'opinion',
    command: '/opinion',
    label: '观点评析',
    context: ['article'],
    buildPrompt: () =>
      `请对当前文章的核心观点进行分析。包括：
1. 作者的主要论点是什么
2. 论据是否充分，逻辑是否严密
3. 有哪些亮点或独到之处
4. 有哪些可商榷或值得进一步思考的地方
保持客观、克制，避免过度主观判断。${FOLLOW_UP_INSTRUCTION}`,
  },

  // ── feed 级 ──
  {
    id: 'digest',
    command: '/digest',
    label: '订阅源动态',
    context: ['feed'],
    buildPrompt: (ctx) =>
      `请总结订阅源「${ctx.feedTitle}」最近的内容动态和趋势。

以下是该订阅源最近的文章：
${ctx.feedArticlesSummary}

请归纳这些内容的主要话题和趋势，指出值得关注的信号。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'intro',
    command: '/intro',
    label: '订阅源介绍',
    context: ['feed'],
    buildPrompt: (ctx) =>
      `请基于以下最近的文章，介绍订阅源「${ctx.feedTitle}」的定位和特点。

以下是该订阅源最近的文章：
${ctx.feedArticlesSummary}

请分析：这个源主要关注什么领域、内容风格如何、适合什么样的读者。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'highlights',
    command: '/highlights',
    label: '精选推荐',
    context: ['feed'],
    buildPrompt: (ctx) =>
      `请从订阅源「${ctx.feedTitle}」的最近文章中，挑出 3-5 篇最值得阅读的内容，并简要说明推荐理由。

以下是该订阅源最近的文章：
${ctx.feedArticlesSummary}

推荐时考虑：信息价值、独特性、时效性。引用文章时使用 [ID] 格式。${FOLLOW_UP_INSTRUCTION}`,
  },

  // ── category 级 ──
  {
    id: 'overview',
    command: '/overview',
    label: '分类总览',
    context: ['category'],
    buildPrompt: (ctx) =>
      `请总览「${ctx.categoryName}」分类下各订阅源的近期动态。

该分类包含的订阅源和最近文章：
${ctx.categoryArticlesSummary}

请按订阅源分组归纳各自的近期重点，最后给出该分类整体的话题趋势。${FOLLOW_UP_INSTRUCTION}`,
  },
  {
    id: 'recommend',
    command: '/recommend',
    label: '分类推荐',
    context: ['category'],
    buildPrompt: (ctx) =>
      `请从「${ctx.categoryName}」分类下推荐最值得阅读的 3-5 篇文章。

该分类的最近文章：
${ctx.categoryArticlesSummary}

推荐标准：信息密度高、观点独到、时效性强。引用文章时使用 [ID] 格式，并说明推荐理由。${FOLLOW_UP_INSTRUCTION}`,
  },

  // ── global ──
  {
    id: 'help',
    command: '/help',
    label: '查看指令',
    context: ['global'],
    buildPrompt: null,
  },
]

function buildFeedArticlesSummary(articles, feedTitle) {
  const feedArticles = articles
    .filter(a => a.feedTitle === feedTitle)
    .sort((a, b) => {
      const ta = new Date(a.pubDate || a.isoDate || 0).getTime()
      const tb = new Date(b.pubDate || b.isoDate || 0).getTime()
      return tb - ta
    })
    .slice(0, 15)

  if (feedArticles.length === 0) return '(暂无该订阅源的文章)'

  return feedArticles.map((a, i) =>
    `[${i + 1}] ${a.title || '(无标题)'}  (${a.pubDate || a.isoDate || ''})
${(a.contentSnippet || '').slice(0, 200)}`
  ).join('\n\n')
}

function buildCategoryArticlesSummary(articles, categoryName, feedsByCategory) {
  const categoryFeeds = feedsByCategory?.[categoryName] || []
  const feedTitles = new Set(categoryFeeds.map(f => f.title))

  const catArticles = articles
    .filter(a => feedTitles.has(a.feedTitle))
    .sort((a, b) => {
      const ta = new Date(a.pubDate || a.isoDate || 0).getTime()
      const tb = new Date(b.pubDate || b.isoDate || 0).getTime()
      return tb - ta
    })
    .slice(0, 20)

  if (catArticles.length === 0) return '(暂无该分类的文章)'

  const grouped = {}
  for (const a of catArticles) {
    const feed = a.feedTitle || '(未知)'
    if (!grouped[feed]) grouped[feed] = []
    grouped[feed].push(a)
  }

  return Object.entries(grouped).map(([feed, items]) =>
    `【${feed}】\n${items.map((a, i) =>
      `  [${i + 1}] ${a.title || '(无标题)'}  (${a.pubDate || a.isoDate || ''})\n  ${(a.contentSnippet || '').slice(0, 150)}`
    ).join('\n')}`
  ).join('\n\n')
}

export function detectContext({ selectedArticle, currentFeed, currentCategory, articles }) {
  const contexts = new Set(['global'])

  if (selectedArticle && (selectedArticle.content || selectedArticle['content:encoded'] || selectedArticle.contentSnippet)) {
    contexts.add('article')
  }

  const feedTitle = currentFeed || selectedArticle?.feedTitle
  if (feedTitle && articles?.some(a => a.feedTitle === feedTitle)) {
    contexts.add('feed')
  }

  if (currentCategory) {
    contexts.add('category')
  }

  return contexts
}

export function getAvailableCommands({ selectedArticle, currentFeed, currentCategory, articles, feedsByCategory }) {
  const activeContexts = detectContext({ selectedArticle, currentFeed, currentCategory, articles })
  const feedTitle = currentFeed || selectedArticle?.feedTitle

  return COMMANDS
    .filter(cmd => cmd.context.some(c => activeContexts.has(c)))
    .map(cmd => ({
      ...cmd,
      resolvedPrompt: cmd.buildPrompt ? cmd.buildPrompt({
        feedTitle,
        feedArticlesSummary: feedTitle ? buildFeedArticlesSummary(articles || [], feedTitle) : '',
        categoryName: currentCategory || '',
        categoryArticlesSummary: currentCategory ? buildCategoryArticlesSummary(articles || [], currentCategory, feedsByCategory) : '',
      }) : null,
    }))
}

export function filterCommands(commands, query) {
  if (!query) return commands
  const lower = query.toLowerCase()
  return commands.filter(cmd =>
    cmd.command.toLowerCase().includes(lower) ||
    cmd.label.toLowerCase().includes(lower) ||
    cmd.id.toLowerCase().includes(lower)
  )
}

export function buildHelpMessage(allCommands, availableCommands) {
  const availableIds = new Set(availableCommands.map(c => c.id))

  const groups = { article: [], feed: [], category: [] }
  for (const cmd of allCommands) {
    if (cmd.id === 'help') continue
    const ctx = cmd.context[0]
    if (groups[ctx]) groups[ctx].push(cmd)
  }

  const formatCmd = (c) => `\`${c.command}\` — ${c.label}  `

  const groupDefs = [
    { key: 'article', title: '文章相关', hint: '打开一篇文章后可用' },
    { key: 'feed', title: '订阅源相关', hint: '选中一个订阅源后可用' },
    { key: 'category', title: '分类相关', hint: '进入一个分类后可用' },
  ]

  const sections = groupDefs.map(({ key, title, hint }) => {
    const avail = groups[key].some(c => availableIds.has(c.id))
    const heading = avail ? `**${title}**  ` : `**${title}** — ${hint}  `
    return `${heading}\n${groups[key].map(formatCmd).join('\n')}`
  })

  return `以下是全部快捷指令：\n\n${sections.join('\n\n')}\n\n在输入框中输入 \`/\` 即可唤出指令菜单。`
}

const CONTEXT_GROUP_LABELS = {
  article: '当前文章',
  feed: '当前订阅源',
  category: '当前分类',
  global: '通用',
}

export function groupCommandsByContext(commands) {
  const groups = []
  const seen = new Set()
  const order = ['article', 'feed', 'category', 'global']

  for (const ctx of order) {
    const items = commands.filter(cmd => cmd.context[0] === ctx && !seen.has(cmd.id))
    if (items.length > 0) {
      groups.push({ label: CONTEXT_GROUP_LABELS[ctx] || ctx, items })
      items.forEach(cmd => seen.add(cmd.id))
    }
  }

  return groups
}

export { COMMANDS }
