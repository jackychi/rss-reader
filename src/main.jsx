import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Open Sans 自托管(@fontsource 由 Vite 打包进 dist,避免依赖 Google CDN
// 在中国大陆网络不稳的问题)。只要 latin 子集 + 四个常用字重,体积受控。
// CJK 字符由字体栈后续项(PingFang SC / Microsoft YaHei 等系统字体)处理。
import '@fontsource/open-sans/latin-400.css'
import '@fontsource/open-sans/latin-500.css'
import '@fontsource/open-sans/latin-600.css'
import '@fontsource/open-sans/latin-700.css'
import './index.css'
import App from './App.jsx'

// 注册 Service Worker 实现离线支持
// 仅在 production 构建里启用:dev 模式下 Vite 的 HMR + 模块预转译会跟 SW 缓存打架,
// 常见症状是"首次打开白屏,硬刷新后正常"——因为 SW 拦了一个老的 index.html 或模块
// prod 构建产物的 hash 命名让 cache-first 策略安全,不会出现这个问题
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[App] Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('[App] Service Worker registration failed:', error);
      });
  });
} else if ('serviceWorker' in navigator) {
  // 开发时若之前注册过 SW,主动注销避免残留拦截
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister())
  }).catch(() => { /* ignore */ })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
