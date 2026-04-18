---
marp: true
theme: default
paginate: true
size: 16:9
header: 'CatReader · 两天的架构跃迁'
footer: '2026-04-17 → 04-19'
style: |
  section {
    font-family: "Open Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
    padding: 32px 48px;
    font-size: 20px;
    line-height: 1.55;
  }
  section.lead { text-align: center; padding-top: 140px; }
  section.lead h1 { font-size: 2.2em; margin-bottom: 0.4em; }
  section.lead h2 { font-size: 1.2em; color: #666; font-weight: 400; border: 0; }
  section.lead p { font-size: 1.1em; color: #555; }
  h1 { color: #ff9500; font-size: 1.7em; margin: 0 0 0.3em; }
  h2 { color: #007aff; font-size: 1.1em; border-bottom: 2px solid #e5e5e5; padding-bottom: 4px; margin: 0.9em 0 0.4em; }
  h3 { color: #333; font-size: 1em; margin: 0.6em 0 0.2em; }
  p, li { font-size: 0.92em; }
  li { margin: 0.2em 0; }
  code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
  pre { background: #f5f5f5; padding: 10px 14px; border-radius: 6px; font-size: 0.75em; line-height: 1.45; overflow-x: auto; }
  pre code { background: transparent; padding: 0; font-size: 1em; }
  table { font-size: 0.85em; border-collapse: collapse; }
  th, td { padding: 4px 10px; border: 1px solid #e5e5e5; }
  th { background: #f0f7ff; }
  .insight {
    background: #fff9e6;
    padding: 8px 14px;
    border-left: 3px solid #ff9500;
    font-size: 0.82em;
    margin-top: 10px;
    line-height: 1.5;
  }
  .metric {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 3px 10px;
    background: #f0f7ff;
    border-radius: 4px;
    font-size: 0.82em;
  }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #666; font-size: 0.9em; }
---

<!-- _class: lead -->

# CatReader
## 两天把一个本地 RSS 阅读器升级成个人知识库

2026-04-17 → 04-19
从 `localStorage 单机` 到 `IDB + Worker + KV 同步 + LLM 阅读助手`

---

## 起点:`stable-pre-refactor` 时的状态

**能用,但天花板低**

- ✅ 三栏布局 + 50+ 预置订阅源
- ✅ 离线阅读 + 播客播放 + 阅读位置记忆
- ❌ 状态全在 localStorage,5MB 容量快撞墙
- ❌ 代理链 4/6 挂了,部分 feed 拉不到内容
- ❌ 换设备 = 全部重来
- ❌ 只能一篇一篇看,跨文章问题无解

> "做得不错的个人项目,但每个薄弱环节都知道,只是没动"

---

## 改造路线:四层叠加

| 层 | 目标 | 代表 commit |
|---|---|---|
| 存储层 | localStorage → IDB | `refactor(cache)` `refactor(read-state)` |
| 网络层 | 自建代理 + SWR | `feat(proxy)` `refactor(fetch)` |
| 同步层 | 跨设备状态一致 | `feat(worker)` `feat(sync)` |
| 产品层 | LLM 阅读助手 | `feat(askcat)` 系列 |

从 stable tag 到 HEAD 一共 **13 个 commit**,共 **2000+ 行**改动。

---

## 存储层:articleCache localStorage → IDB

**问题**
- 50+ feeds × 几百文章的缓存压在 localStorage
- 写入是同步 API,每次切 feed 都 JSON.stringify 阻塞主线程
- 5MB 配额注定爆

**做法**
- 文章本身早就在 IDB `articles` store(一直重复存)
- localStorage 的 articleCache 唯一有用的字段是**每个 feed 的 TTL**
- 新建 `feedMeta` store(keyPath=feedUrl),只存 `{lastFetchedAt}`
- `DB_VERSION` 2→3,迁移时自动清掉老 localStorage 键

<div class="insight">
💡 localStorage 只剩"小标志位"(主题、字号、UI 偏好),大 payload 全 IDB。
</div>

---

## 存储层:readStatus 反转(最妙的一步)

**原来:否定列表** — 存"哪些已读"
```js
readStatus = { "articleKey": true, ... }
// 单调增长、O(n×m) 算未读数
```

**改成:肯定列表** — 存"每个 feed 哪些未读"
```js
unreadByFeed = Map<feedUrl, Set<articleKey>>  // 未读数 = set.size
readSet = Set<articleKey>                       // "是否已读"O(1) 查询
```

**效果**
- `unreadCounts` 从 O(feeds × articles) 降到 O(feeds)
- unread set 天然有上限(当前 feed 文章数),永不溢出

<div class="insight">
💡 存正存反看着等价,但<b>操作成本可以差一个数量级</b>。
</div>

---

## 网络层:真相浮现

云风的 blog 加载不出来,为什么?curl 下来 feed 本身是好的。**代理链早就半死**:

| 代理 | 状态 |
|---|---|
| `corsproxy.io` | 403,改付费了 |
| `api.allorigins.win` | 500,不稳定 |
| `cors-anywhere.herokuapp.com` | 303 → `/corsdemo`,**2021 年就关了** |
| `rsshub.app` vercel 实例 | 仅支持 RSSHub 路由 |
| `rss2json` | 可用,免费版**只返回 10 条** |
| 直连 | CORS 拒绝 |

用户一直看着 localStorage 里的 **articleCache 旧副本**,以为还在正常工作。articleCache 清掉的那一刻,遮羞布掉下来。

---

## 网络层:fix(fetcher) 的 break 早退 bug

```js
const items = xml.querySelectorAll('item, entry')
const articles = Array.from(items).map(...)  // 空数组
articlesWithFeed = articles.map(...)
break  // ← 关键 bug:不管空不空,直接跳出
```

当 `corsproxy.io` 返回 **200 + 自家主页 HTML**:
1. `response.ok` true(HTTP 200)
2. DOMParser 不抛错(对 HTML 宽容)
3. `querySelectorAll('entry')` 返回空数组
4. `break` 跳出,后面能工作的 rss2json 永远跑不到

**修法**:`break` 前加 `if (articles.length === 0) continue`。4 行代码。

<div class="insight">
💡 DOMParser 不抛异常——"成功 parse ≠ 得到数据"。判据必须是"<b>有实际产出</b>"。
</div>

---

## 网络层:自建 Cloudflare Worker CORS 代理

30 分钟部署,从此告别公共代理。核心代码约 25 行:

```js
export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url')
    const upstream = await fetch(target, {
      headers: { 'User-Agent': '...' }
    })
    const headers = new Headers(upstream.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(upstream.body, { status: upstream.status, headers })
  }
}
```

<span class="metric">免费 10 万次/天</span> <span class="metric">全球边缘节点</span> <span class="metric">CF 核心业务</span>

代理链从 6 个砍到 3 个:**直连 → CF Worker → rss2json**。bundle 反而**小了 1KB**。

---

## 网络层:SWR — click 不再触发网络

**反馈**:"每次点左侧 feed 都在拉数据,很烦"

**根因**:`handleSelectFeed` 里有 5 分钟 TTL。但用户 50+ feeds,基本不会在 5 分钟内重复点同一个,**TTL 形同虚设**。

**改动**
```
click feed   = 读 IDB,秒开,不联网
refresh 按钮 = 联网抓新,替换 state
```

匹配 Feedly/NetNewsWire/Reeder 的约定。启动时不再自动全量抓,改由点击驱动。

**副产品**:Worker 调用量降 80%+,UI 响应从 1-3 秒变 0ms。

---

## 同步层:KV + UNION merge

**唯一的操作:`syncNow(id)`**
```
1. 并发:GET remote   +   读 local IDB
2. mergeStates(local, remote)   — 纯函数,UNION 合并
3. 并发:POST merged  +   写 local
```

**为什么不区分 push/pull?**

readStatus 和 readingList 都是**单调增集合**(一旦加入永远不移除)。UNION 在这类集合上:
- **幂等**:10 次 syncNow = 1 次
- **可交换**:A push 后 B 和 B push 后 A 最终一致

<div class="insight">
💡 选对数学性质,UX 自动简化。一个"立即同步"按钮搞定双向。
</div>

---

## 同步层:Payload 413 的两层修

**症状**:`Push failed: HTTP 413`

**根因**:阅读列表每条带完整 sanitized HTML content。带图长文 200-500KB,3-5 篇就过 1MB。

**两层 defense in depth**

| 层 | 改动 |
|---|---|
| **Worker** | `MAX_SYNC_PAYLOAD` 1MB → 5MB(兜底) |
| **客户端** | push 时剥离 content;pull 时从本地 articles store 按 id 回填 |

修完后同样的 readingList,wire 体积从 1MB+ 缩到 ~50KB。

---

## 产品层:Ask Cat — 基于 RSS 的 LLM 阅读助手

**为什么不走 Karpathy 的 raw → wiki pipeline?**

我们的数据**持续流入**,不是一次性归档。50 feeds × 10 篇/天 × 几个月 = 过百兆,全量编译撑不住。

**v1 路线:最简"全量塞 prompt"**
- 每次 query 把最近 N 篇的 snippet + 元数据塞进 prompt
- 200K context window 可容纳远超所需
- 今天就能跑

<span class="metric">OpenAI-compatible</span> <span class="metric">MiniMax / DeepSeek / Qwen / 豆包</span>
<span class="metric">marked + DOMPurify</span> <span class="metric">ClipboardItem 双格式复制</span>

---

## Ask Cat:当前文章感知

Reader 里打开的文章作为 `CURRENT_ARTICLE` 注入 system prompt。

**LLM 自己决定**是否用全文:
- "翻译这篇" / "总结一下" → 用 CURRENT_ARTICLE 全文
- "最近有什么新的" → 忽略,用 ARTICLES 列表

**零客户端关键词匹配**,意图识别交给 LLM 擅长的事。

<div class="insight">
💡 让 LLM 做 LLM 擅长的事:意图识别交给 LLM,客户端只负责数据管道和渲染。
</div>

---

## Ask Cat:三类链接三种行为

| 类 | 形式 | 行为 |
|---|---|---|
| 引用 | `[1]` → 橙色小药丸 | 在 Reader 打开 |
| 本知识库文章 | 🔗 前缀 URL | 在 Reader 打开 |
| 其他外链 | 普通下划线 | 新标签页 |

**实现**:渲染管线三层分流(marked → DOMPurify → 自定义 regex 后处理)。

**协同**:system prompt 明确指示 LLM "引用文章带完整 URL",让链接分流频繁触发。

---

## Ask Cat:推理模型分层 + 富文本

**推理过程 vs 正式答案**

兼容两种协议:
- `reasoning_content` 字段(MiniMax / OpenAI o1)
- `<think>...</think>` 标签(DeepSeek R1)

用 `<details>` 折叠展示。

**富文本管线**:marked → DOMPurify → regex 后处理 → ref innerHTML

**CJK-Latin 自动空格**:10 行 regex,无 deps,贴近 pangu.js 风格。

**消息气泡底部**:复制(`ClipboardItem` 写 `text/html` + `text/plain`)+ 重试(truncate messages + 复用 sendToLLM)。

---

## 交互细节:看不见但你会感觉到

**抽屉**
- 左边缘可拖拽调宽度 + localStorage 持久化(默认 432px)
- 点抽屉外自动收起(豁免 toggle 按钮)
- 打开时按配置状态决定视图,不再"莫名进到设置"

**侧边栏**
- 分类文件夹点击 = 展开 + 选中(中间栏显示该分类全部缓存文章)
- 分类视图下点刷新,批量抓取该分类所有 feed
- Sync ID 字段直接可编辑,不用两步切换

**字体细节**
- 中西文自动空格
- 段间距 > 行间距
- 外链 `rel="noopener noreferrer"` 防 tabnabbing

---

## 维护性:数据自洁

**问题**:用户移除订阅源后,IDB 里那个 feed 的几百条文章是孤儿。

**做法**:`pruneOrphanedArticles(validFeedUrls)` — feeds 变化时自动清理 `articles` 和 `feedMeta` 里不在订阅中的残留。不动 readStatus 和 readingList(用户显式行为数据)。

**效果**:defaultFeeds 改成 follow.opml 全量导入后,**旧 feed 的几千条文章 IDB 里自动消失**,sidebar 的未读数立即跟新状态对齐。

<div class="insight">
💡 自动清理隐形孤儿数据,不用每次 schema 变动都跳出一个"要不要清缓存"的对话框。
</div>

---

## 数据流全景

```
RSS Source → CF Worker(CORS) → useRSSFetcher → articles state
                                                │
                                                ↓
                       saveArticles useEffect → IDB articles store
                                                │
                                                ↓
                              reconcile useEffect → unreadByFeed Map
                                                │
                                                ↓
                              Sidebar / ArticleList / Reader
                                                │
         ┌──────────────────────────────────────┤
         ↓                                      ↓
    markAsRead                          bookmark/unbookmark
         ↓                                      ↓
    readSet + IDB                       saveToReadingList
         └──────────────┬─────────────────────────┘
                        ↓
                syncNow (debounced 3s)
                        ↓
            UNION merge → Worker /sync → KV
                        ↓
    Ask Cat (LLM:articles 上下文 + 当前文章)
```

---

## 数字

<span class="metric">代码行数:+~2500 / -~400</span>
<span class="metric">IDB store:4 → 6</span>
<span class="metric">代理链可用:1 → 3</span>

<span class="metric">Ask Cat context 上限:0 → 200 篇</span>
<span class="metric">bundle:251 → 327 KB</span>
<span class="metric">unreadCounts:O(n·m) → O(n)</span>

bundle 增长主要来自 `marked`(~30KB)+ AskCatDrawer(~20KB)。其余净增接近零 —— **很多性能改进不但没涨代码,反而让代码更少**。

---

## 下一步可选路线

**短期**
- 订阅源管理 UI(加/删/重命名 feed,目前只能靠 OPML)
- 键盘快捷键(J/K 切文章、B 收藏、M 标记已读)
- Reader 组件拆分(612 行,audio/font/fullscreen 揉一起)

**中期:Ask Cat v2 RAG**
- 火山引擎豆包 embedding(OpenAI 兼容,¥0.0005/1K tokens)
- Worker 透传 CORS
- IDB 新增 `articleEmbeddings` store,1000 篇 ≈ 10MB
- 纯 JS cosine similarity(1000 篇点积 ~10ms)
- 混合检索:relevance + recency

**长期**
- 阅读数据统计 / feeds 跨设备同步 / AI 摘要预生成

---

## 三个设计哲学

**1. 选对数据形状,UX 自动简化**
- UNION merge → push/pull 合并
- Set of unread → 未读数 O(1)
- 用 URL 而非内部 ID → 数据换,标识符不换

**2. 防御性代码要有信号**
- 不只是 break-on-success,而是 break-on-has-output
- 不只是 `target="_blank"`,而是 `+ rel="noopener noreferrer"`
- 不只是"API 成功",而是"**有预期结构**的响应"

**3. 让 LLM 做 LLM 擅长的事**
- 意图识别 / URL 归类 / 文风调整 交给 LLM
- 客户端只负责数据管道、渲染、交互

---

<!-- _class: lead -->

# 两天,一个可持续的个人知识库

从"能用"到"耐看"
不是靠加功能,而是靠**每个薄弱环节都让它对了一次**
