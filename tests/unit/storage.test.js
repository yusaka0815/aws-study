/**
 * storage.test.js
 * localStorage管理・バックアップ検証の単体テスト
 *
 * テスト対象: src/storage.js
 * jsdom 環境により localStorage が利用可能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  loadState,
  saveState,
  importBackup,
  resetState,
} from '../../src/storage.js';

// ============================================================
// テストフィクスチャ
// ============================================================

const VALID_BACKUP = {
  version: 1,
  currentExam: 'SAA',
  questions: {
    'SAA-001': {
      attempts: 5,
      correct: 4,
      wrong: 1,
      recentResults: [1, 0, 1, 1, 1],
      lastAnsweredAt: 1_710_000_000_000,
      nextReviewAt:  1_710_001_000_000,
    },
  },
};

// ============================================================
// createInitialState
// ============================================================
describe('createInitialState', () => {
  it('version=1, currentExam=null, questions={}, dailyLog={}, examHistory=[] を返す', () => {
    expect(createInitialState()).toEqual({ version: 1, currentExam: null, questions: {}, dailyLog: {}, examHistory: [] });
  });
});

// ============================================================
// saveState / loadState
// ============================================================
describe('saveState / loadState', () => {
  beforeEach(() => localStorage.clear());

  it('保存→読み込みでデータが一致する', () => {
    const state = {
      version: 1,
      currentExam: 'SAA',
      questions: {
        'SAA-001': {
          attempts: 3, correct: 2, wrong: 1,
          recentResults: [1, 0, 1],
          lastAnsweredAt: 1_000_000,
          nextReviewAt: 1_600_000,
        },
      },
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded.currentExam).toBe('SAA');
    expect(loaded.questions['SAA-001'].attempts).toBe(3);
  });

  it('空の localStorage は初期状態を返す', () => {
    expect(loadState()).toEqual(createInitialState());
  });

  it('破損したJSONでも初期状態を返してクラッシュしない', () => {
    localStorage.setItem('aws-study-state-v1', '{invalid!!!}');
    expect(loadState()).toEqual(createInitialState());
  });

  it('バージョン不一致のデータは初期状態を返す', () => {
    localStorage.setItem('aws-study-state-v1', JSON.stringify({ version: 99, questions: {} }));
    expect(loadState()).toEqual(createInitialState());
  });
});

// ============================================================
// importBackup: バックアップ検証とサニタイズ
// ============================================================
describe('importBackup', () => {
  it('正常なJSONは成功し同じデータを返す', () => {
    const result = importBackup(JSON.stringify(VALID_BACKUP));
    expect(result.version).toBe(1);
    expect(result.currentExam).toBe('SAA');
    expect(result.questions['SAA-001'].attempts).toBe(5);
  });

  it('不正なJSON文字列はエラーをスロー', () => {
    expect(() => importBackup('{bad json')).toThrow();
  });

  it('version 不一致はエラーをスロー', () => {
    expect(() => importBackup(JSON.stringify({ ...VALID_BACKUP, version: 99 }))).toThrow();
  });

  it('questions フィールドなしはエラーをスロー', () => {
    const { questions: _q, ...noQuestions } = VALID_BACKUP;
    expect(() => importBackup(JSON.stringify(noQuestions))).toThrow();
  });

  it('recentResults は最大10件に切り詰められる', () => {
    const withLong = {
      ...VALID_BACKUP,
      questions: {
        'SAA-001': { ...VALID_BACKUP.questions['SAA-001'], recentResults: Array(20).fill(1) },
      },
    };
    const result = importBackup(JSON.stringify(withLong));
    expect(result.questions['SAA-001'].recentResults.length).toBeLessThanOrEqual(10);
  });

  it('recentResults に 0/1 以外の値は除外される（サニタイズ）', () => {
    const withDirty = {
      ...VALID_BACKUP,
      questions: {
        'SAA-001': { ...VALID_BACKUP.questions['SAA-001'], recentResults: [1, 0, 99, 'evil', null] },
      },
    };
    const result = importBackup(JSON.stringify(withDirty));
    const filtered = result.questions['SAA-001'].recentResults;
    expect(filtered.every(r => r === 0 || r === 1)).toBe(true);
  });

  it('currentExam が文字列以外の場合は null になる', () => {
    const result = importBackup(JSON.stringify({ ...VALID_BACKUP, currentExam: { evil: true } }));
    expect(result.currentExam).toBeNull();
  });

  it('不正な問題エントリは無視されてクラッシュしない', () => {
    const withBadEntry = {
      ...VALID_BACKUP,
      questions: { ...VALID_BACKUP.questions, null_key: null, 123: 'not_object' },
    };
    expect(() => importBackup(JSON.stringify(withBadEntry))).not.toThrow();
  });
});

// ============================================================
// resetState
// ============================================================
describe('resetState', () => {
  beforeEach(() => localStorage.clear());

  it('リセット後は初期状態が返る', () => {
    saveState({ version: 1, currentExam: 'MLA', questions: { 'MLA-001': {} } });
    const reset = resetState();
    expect(reset).toEqual(createInitialState());
  });

  it('リセット後の loadState も初期状態', () => {
    saveState({ version: 1, currentExam: 'SAA', questions: { 'SAA-001': {} } });
    resetState();
    expect(loadState()).toEqual(createInitialState());
  });
});
