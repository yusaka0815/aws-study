/**
 * wake-lock.test.js
 * Wake Lock APIの単体テスト
 *
 * テスト対象: src/wake-lock.js
 * jsdom環境ではnavigator.wakeLockが存在しないため
 * 非サポート環境のgraceful degradationを中心に確認する。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestWakeLock, releaseWakeLock, isWakeLockActive } from '../../src/wake-lock.js';

// ============================================================
// 非サポート環境（jsdom: navigator.wakeLock なし）
// ============================================================

describe('wake-lock.js: wakeLock 非サポート環境', () => {
  it('requestWakeLock: falseを返す', async () => {
    const result = await requestWakeLock();
    expect(result).toBe(false);
  });

  it('isWakeLockActive: falseを返す', () => {
    expect(isWakeLockActive()).toBe(false);
  });

  it('releaseWakeLock: sentinel なしでも安全に完了する', async () => {
    await expect(releaseWakeLock()).resolves.toBeUndefined();
  });
});

// ============================================================
// Wake Lock API モック環境
// ============================================================

describe('wake-lock.js: wakeLock モック環境', () => {
  let originalWakeLock;

  beforeEach(() => {
    originalWakeLock = Object.getOwnPropertyDescriptor(navigator, 'wakeLock');
  });

  afterEach(async () => {
    await releaseWakeLock(); // sentinelが残っていれば解放
    if (originalWakeLock) {
      Object.defineProperty(navigator, 'wakeLock', originalWakeLock);
    } else {
      // プロパティを削除して元の状態（存在しない）に戻す
      try {
        delete navigator.wakeLock;
      } catch { /* 削除できない環境では無視 */ }
    }
  });

  function mockWakeLock(sentinel) {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockResolvedValue(sentinel) },
    });
  }

  it('requestWakeLock: trueを返しisWakeLockActiveがtrueになる', async () => {
    const mockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    mockWakeLock(mockSentinel);

    const result = await requestWakeLock();
    expect(result).toBe(true);
    expect(isWakeLockActive()).toBe(true);
  });

  it('releaseWakeLock: sentinel.release が呼ばれ isWakeLockActive が false になる', async () => {
    const mockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    mockWakeLock(mockSentinel);

    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);

    await releaseWakeLock();
    expect(mockSentinel.release).toHaveBeenCalledOnce();
    expect(isWakeLockActive()).toBe(false);
  });

  it('requestWakeLock: request() が例外を投げてもfalseを返す', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockRejectedValue(new Error('NotAllowedError')) },
    });

    const result = await requestWakeLock();
    expect(result).toBe(false);
    expect(isWakeLockActive()).toBe(false);
  });
});
