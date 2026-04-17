// 前端共享常量

// Cloudflare Worker 的根 URL
// 两个路由都挂这个 origin 下:
//   `${CORS_WORKER_URL}/?url=<target>`  — CORS 代理(useRSSFetcher 用)
//   `${CORS_WORKER_URL}/sync?key=<id>`  — 跨设备同步(utils/sync.js 用)
// 换域名只改这一处,日后抽成 Vite env var 也集中在此。
export const CORS_WORKER_URL = 'https://catreader-proxy.jackychi.workers.dev'
