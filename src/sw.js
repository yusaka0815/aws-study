/**
 * sw.js
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'aws-study-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './engine.js',
  './storage.js',
  './ui.js',
  './manifest.json',
  './icons/icon.svg',
  './data/saa.json',
  './data/mla.json',
];

// ============================================================
// インストール: 全リソースをキャッシュ
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ============================================================
// アクティベート: 古いキャッシュを削除
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================
// フェッチ: キャッシュ優先、フォールバックはネットワーク
// ============================================================
self.addEventListener('fetch', event => {
  // GET以外は無視
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // 正常なレスポンスのみキャッシュに追加
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      }).catch(() => {
        // ネットワークエラー時: HTMLリクエストならオフラインフォールバック
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
