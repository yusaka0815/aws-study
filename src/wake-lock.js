/**
 * wake-lock.js
 * スリープ防止（Wake Lock API）
 */

let sentinel = null;

/**
 * スリープ防止を開始
 * @returns {Promise<boolean>} Wake Lock 取得に成功したか
 */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * スリープ防止を解除
 */
export async function releaseWakeLock() {
  if (sentinel) {
    await sentinel.release();
    sentinel = null;
  }
}

/**
 * 現在 Wake Lock が有効かどうか
 * @returns {boolean}
 */
export function isWakeLockActive() {
  return sentinel !== null;
}
