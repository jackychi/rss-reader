// 前端共享常量

// Cloudflare Worker 的根 URL
// 两个路由都挂这个 origin 下:
//   `${CORS_WORKER_URL}/?url=<target>`  — CORS 代理(useRSSFetcher 用)
//   `${CORS_WORKER_URL}/sync?key=<id>`  — 跨设备同步(utils/sync.js 用)
// 换域名只改这一处,日后抽成 Vite env var 也集中在此。
export const CORS_WORKER_URL = 'https://catreader-proxy.jackychi.workers.dev'

// CatReader Go 后端 API。后端不可用时,前端仍按现有本地缓存/抓取逻辑工作。
export const CATREADER_API_URL = import.meta.env.VITE_CATREADER_API_URL || 'http://localhost:8080'
