/**
 * audio.test.js
 * Web Audio API効果音の単体テスト
 *
 * テスト対象: src/audio.js
 * jsdom環境にはAudioContextが存在しないため、
 * まず非サポート環境のgraceful degradationを確認し、
 * 次にモックを使って通常実行を確認する。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { playCorrectSound, playWrongSound } from '../../src/audio.js';

function createMockAudioContext() {
  const gainNode = {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
  const osc = {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: 'sine',
    frequency: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
  };
  return {
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gainNode),
    currentTime: 0,
    destination: {},
    state: 'running',
    resume: vi.fn(),
  };
}

// ============================================================
// グレースフルデグラデーション
// jsdom では AudioContext が未定義のため、最初のテストで非サポート環境を確認
// ============================================================

describe('audio.js: AudioContext 非サポート環境', () => {
  it('playCorrectSound: AudioContext なしでもエラーにならない', () => {
    expect(() => playCorrectSound()).not.toThrow();
  });

  it('playWrongSound: AudioContext なしでもエラーにならない', () => {
    expect(() => playWrongSound()).not.toThrow();
  });
});

// ============================================================
// AudioContext モック環境
// 上記テストで audioCtx = null のまま残るので、スタブで上書き可能
// ============================================================

describe('audio.js: AudioContext モック環境', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('playCorrectSound: モックContextでエラーなく実行される', () => {
    vi.stubGlobal('AudioContext', vi.fn(() => createMockAudioContext()));
    expect(() => playCorrectSound()).not.toThrow();
  });

  it('playWrongSound: モックContextでエラーなく実行される', () => {
    vi.stubGlobal('AudioContext', vi.fn(() => createMockAudioContext()));
    expect(() => playWrongSound()).not.toThrow();
  });

  it('AudioContext コンストラクタが例外を投げてもエラーにならない', () => {
    vi.stubGlobal('AudioContext', vi.fn(() => { throw new Error('NotAllowedError'); }));
    expect(() => playCorrectSound()).not.toThrow();
    expect(() => playWrongSound()).not.toThrow();
  });
});
