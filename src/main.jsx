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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[App] Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('[App] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
