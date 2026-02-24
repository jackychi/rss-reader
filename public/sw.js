// Service Worker for RSS Reader - Offline Support

const CACHE_NAME = 'rss-reader-cache-v1';
const STATIC_CACHE = 'rss-reader-static-v1';
const API_CACHE = 'rss-reader-api-v1';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/cat-icon.svg',
  '/vite.svg',
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name.startsWith('rss-reader-') &&
                   name !== STATIC_CACHE &&
                   name !== API_CACHE;
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截 - 实现缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过 chrome-extension 和其他非 http(s) 请求
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API 请求 - Stale-While-Revalidate 策略
  if (isApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 静态资源 - Cache First 策略
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 其他请求 - Network First 策略
  event.respondWith(networkFirst(request));
});

// 判断是否为 API 请求
function isApiRequest(url) {
  const apiPatterns = [
    'api.rss2json.com',
    'api.allorigins.win',
    'corsproxy.io',
    'cors-anywhere.herokuapp.com',
    'rsshub',
    'xgo.ing',
    'ximalaya.com',
    'youtube.com/feeds',
  ];
  return apiPatterns.some(pattern => url.href.includes(pattern));
}

// 判断是否为静态资源
function isStaticAsset(url) {
  const staticPatterns = [
    /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/,
  ];
  return staticPatterns.some(pattern => pattern.test(url.pathname));
}

// Cache First 策略 - 优先用缓存
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache First - Network failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network First 策略 - 优先用网络
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network First - Falling back to cache');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 503 });
  }
}

// Stale-While-Revalidate - 立即返回缓存，后台更新
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[SW] Stale-While-Revalidate - Network failed:', error);
    return cachedResponse || new Response('Offline', { status: 503 });
  });

  // 立即返回缓存，如果没有缓存则等待网络响应
  return cachedResponse || fetchPromise;
}

// 监听消息 - 允许前端触发缓存操作
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
