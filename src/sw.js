/**
 * sw.js
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'aws-study-v2';

// アプリシェル: 常にネットワーク優先で更新を即座に反映
const APP_SHELL = new Set([
  './',
  './index.html',
  './style.css',
  './app.js',
  './engine.js',
  './storage.js',
  './ui.js',
  './audio.js',
  './wake-lock.js',
  './manifest.json',
  './icons/icon.svg',
]);

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './engine.js',
  './storage.js',
  './ui.js',
  './audio.js',
  './wake-lock.js',
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
// フェッチ: アプリシェルはネットワーク優先、データはキャッシュ優先
// ============================================================
self.addEventListener('fetch', event => {
  // GET以外は無視
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppShell = APP_SHELL.has(url.pathname.replace(/^\/[^/]+/, '.'));

  if (isAppShell) {
    // ネットワーク優先: 更新を即座に反映。失敗時はキャッシュにフォールバック
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.destination === 'document') return caches.match('./index.html');
      }))
    );
  } else {
    // キャッシュ優先: 問題データ等の大きなJSONは初回取得後キャッシュから配信
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        }).catch(() => {
          if (event.request.destination === 'document') return caches.match('./index.html');
        });
      })
    );
  }
});

// ============================================================
// メッセージ: クライアントからのSKIP_WAITING要求を処理
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
