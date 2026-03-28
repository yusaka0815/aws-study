/**
 * sw.js
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'aws-study-v9';

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
// アクティベート: 古いキャッシュを削除し全クライアントを制御下に置く
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() =>
      // 全ページに更新通知（新しいapp.jsにリスナーがある場合に有効）
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
      )
    )
  );
});

// SW自身のベースURL（例: https://example.com/aws-study/ ）
const SW_BASE = new URL('./', location.href).href;

// ============================================================
// フェッチ: アプリシェルはネットワーク優先、データはキャッシュ優先
// ============================================================
self.addEventListener('fetch', event => {
  // GET以外は無視
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // ルート・サブパスどちらの構成でも正しく判定
  const relPath = url.href.startsWith(SW_BASE)
    ? './' + url.href.slice(SW_BASE.length)
    : null;
  const isAppShell = relPath !== null && APP_SHELL.has(relPath);

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
