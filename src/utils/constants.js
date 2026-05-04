// 前端共享常量

// Cloudflare Worker 的根 URL。目前只作为 RSS CORS 代理:
//   `${CORS_WORKER_URL}/?url=<target>`
// 用户状态同步已迁到 Go 后端 `/api/user-state`。
export const CORS_WORKER_URL = 'https://catreader-proxy.jackychi.workers.dev'

// CatReader Go 后端 API。后端不可用时,前端仍按现有本地缓存/抓取逻辑工作。
export const CATREADER_API_URL = import.meta.env.VITE_CATREADER_API_URL || 'http://localhost:8080'

// RSS Bridge 媒体代理。Twitter 等 CDN 有防盗链,视频/图片需经 bridge 中转。
export const BRIDGE_PROXY_URL = import.meta.env.VITE_BRIDGE_PROXY_URL || 'http://localhost:3847/proxy'
