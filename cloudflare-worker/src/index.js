// CatReader Worker
// RSS CORS 代理:
//   /?url=<target>   代抓任意 http(s) RSS/Atom URL,加 CORS 头后透传响应。
//
// 用户状态同步已迁移到 Go 后端 `/api/user-state`,这里不再处理 /sync 或 KV。

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    return handleProxy(request, url)
  },
}

// ============ /?url=<target> ============
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
