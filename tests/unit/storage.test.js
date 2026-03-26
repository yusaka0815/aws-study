/**
 * storage.js 単体テスト
 * localStorage管理・バックアップ検証
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  loadState,
  saveState,
  importBackup,
  resetState,
} from '../../storage.js';

// ============================================================
// createInitialState
// ============================================================
describe('createInitialState', () => {
  it('正しい初期構造を返す', () => {
    const state = createInitialState();
    expect(state.version).toBe(1);
    expect(state.currentExam).toBeNull();
    expect(state.questions).toEqual({});
  });
});

// ============================================================
// saveState / loadState
// ============================================================
describe('saveState / loadState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存して読み込むと同じ内容が返る', () => {
    const state = {
      version: 1,
      currentExam: 'SAA',
      questions: {
        'SAA-001': {
          attempts: 3,
          correct: 2,
          wrong: 1,
          recentResults: [1, 0, 1],
          lastAnsweredAt: 1000000,
          nextReviewAt: 1600000,
        },
      },
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded.currentExam).toBe('SAA');
    expect(loaded.questions['SAA-001'].attempts).toBe(3);
    expect(loaded.questions['SAA-001'].correct).toBe(2);
  });

  it('localStorage が空のとき初期状態を返す', () => {
    const state = loadState();
    expect(state.version).toBe(1);
    expect(state.currentExam).toBeNull();
    expect(state.questions).toEqual({});
  });

  it('破損したJSONがあっても初期状態を返してクラッシュしない', () => {
    localStorage.setItem('aws-study-state-v1', '{invalid json!!!}');
    const state = loadState();
    expect(state.version).toBe(1);
    expect(state.questions).toEqual({});
  });

  it('バージョン不一致のデータは初期状態を返す', () => {
    localStorage.setItem('aws-study-state-v1', JSON.stringify({ version: 99, questions: {} }));
    const state = loadState();
    expect(state.questions).toEqual({});
  });
});

// ============================================================
// importBackup: バックアップ検証
// ============================================================
describe('importBackup', () => {
  const validState = {
    version: 1,
    currentExam: 'SAA',
    questions: {
      'SAA-001': {
        attempts: 5,
        correct: 4,
        wrong: 1,
        recentResults: [1, 0, 1, 1, 1],
        lastAnsweredAt: 1710000000000,
        nextReviewAt: 1710001000000,
      },
    },
  };

  it('正常なJSONは成功し、同じデータを返す', () => {
    const result = importBackup(JSON.stringify(validState));
    expect(result.version).toBe(1);
    expect(result.currentExam).toBe('SAA');
    expect(result.questions['SAA-001'].attempts).toBe(5);
  });

  it('不正なJSON文字列はエラーをスロー', () => {
    expect(() => importBackup('{bad json')).toThrow();
  });

  it('versionが一致しないとエラーをスロー', () => {
    const badVersion = { ...validState, version: 99 };
    expect(() => importBackup(JSON.stringify(badVersion))).toThrow();
  });

  it('questionsフィールドがないとエラーをスロー', () => {
    const noQuestions = { version: 1, currentExam: 'SAA' };
    expect(() => importBackup(JSON.stringify(noQuestions))).toThrow();
  });

  it('recentResultsは最大10件に切り詰められる', () => {
    const longResults = { ...validState };
    longResults.questions['SAA-001'] = {
      ...validState.questions['SAA-001'],
      recentResults: Array(20).fill(1), // 20件（制限超過）
    };
    const result = importBackup(JSON.stringify(longResults));
    expect(result.questions['SAA-001'].recentResults.length).toBeLessThanOrEqual(10);
  });

  it('recentResultsに0/1以外の値は除外される（XSS対策）', () => {
    const injected = { ...validState };
    injected.questions['SAA-001'] = {
      ...validState.questions['SAA-001'],
      recentResults: [1, 0, 99, 'evil', 1],
    };
    const result = importBackup(JSON.stringify(injected));
    const filtered = result.questions['SAA-001'].recentResults;
    expect(filtered.every(r => r === 0 || r === 1)).toBe(true);
  });

  it('currentExamが文字列でない場合はnullになる', () => {
    const badExam = { ...validState, currentExam: { evil: true } };
    const result = importBackup(JSON.stringify(badExam));
    expect(result.currentExam).toBeNull();
  });
});

// ============================================================
// resetState
// ============================================================
describe('resetState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('リセット後は初期状態が返る', () => {
    // まず何かデータを保存
    saveState({
      version: 1,
      currentExam: 'MLA',
      questions: { 'MLA-001': { attempts: 10, correct: 8, wrong: 2, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 } },
    });

    const reset = resetState();
    expect(reset.currentExam).toBeNull();
    expect(reset.questions).toEqual({});
  });

  it('リセット後のloadStateも初期状態', () => {
    saveState({ version: 1, currentExam: 'SAA', questions: { 'SAA-001': {} } });
    resetState();
    const loaded = loadState();
    expect(loaded.questions).toEqual({});
  });
});
