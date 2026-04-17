// CatReader Worker
// 两个职责:
//   /?url=<target>   CORS 代理:代抓任意 http(s) URL,加 CORS 头后透传响应
//   /sync?key=<id>   跨设备同步:KV 里存 per-user 的 readStatus + readingList JSON

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

const MAX_SYNC_PAYLOAD = 1024 * 1024 // 1 MB,够 1 年重度用户
const SYNC_KEY_RE = /^[a-zA-Z0-9-]{32,128}$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/sync') return handleSync(request, url, env)
    return handleProxy(request, url)
  },
}

// ============ /sync ============
async function handleSync(request, url, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  const key = url.searchParams.get('key')
  if (!key) {
    return json({ error: 'Missing ?key= param' }, 400)
  }
  if (!SYNC_KEY_RE.test(key)) {
    return json({ error: 'Invalid key format' }, 400)
  }

  if (request.method === 'GET') {
    const stored = await env.SYNC_KV.get(key, 'json')
    if (stored) return json(stored, 200)
    // 未同步过,返回空状态而非 404,简化客户端逻辑
    return json({ version: 1, updatedAt: null, readStatus: [], readingList: [] }, 200)
  }

  if (request.method === 'POST') {
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_SYNC_PAYLOAD) {
      return json({ error: 'Payload too large' }, 413)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    // 粗略结构校验:必须有 version 和两个数组字段
    if (
      typeof body !== 'object' || body === null ||
      typeof body.version !== 'number' ||
      !Array.isArray(body.readStatus) ||
      !Array.isArray(body.readingList)
    ) {
      return json({ error: 'Malformed sync payload' }, 400)
    }

    // 保险再量一次实际序列化后的大小(content-length 可能被客户端误报)
    const serialized = JSON.stringify(body)
    if (serialized.length > MAX_SYNC_PAYLOAD) {
      return json({ error: 'Payload too large' }, 413)
    }

    await env.SYNC_KV.put(key, serialized)
    return json({ ok: true, savedAt: Date.now() }, 200)
  }

  return json({ error: 'Method not allowed' }, 405)
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' },
  })
}

// ============ /?url=<target>(原代抓逻辑,行为不变) ============
async function handleProxy(request, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const target = url.searchParams.get('url')
  if (!target) {
    return new Response('Missing ?url= param', { status: 400, headers: CORS_HEADERS })
  }

  let targetUrl
  try {
    targetUrl = new URL(target)
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return new Response('Only http(s) supported', { status: 400, headers: CORS_HEADERS })
    }
  } catch {
    return new Response('Invalid url', { status: 400, headers: CORS_HEADERS })
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CatReader RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      headers.set(k, v)
    }
    headers.delete('x-frame-options')
    headers.delete('content-security-policy')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  } catch (err) {
    return new Response(`Fetch failed: ${err.message}`, {
      status: 502,
      headers: CORS_HEADERS,
    })
  }
}
