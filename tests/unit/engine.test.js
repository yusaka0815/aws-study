/**
 * engine.js 単体テスト
 * 出題アルゴリズム・SRS計算の検証
 */

import { describe, it, expect } from 'vitest';
import {
  getIntervalMs,
  calculateScore,
  getNextQuestion,
  updateQuestionState,
  getStats,
} from '../../engine.js';

// ============================================================
// getIntervalMs: SRSインターバル計算
// ============================================================
describe('getIntervalMs', () => {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('空配列のとき即出題（0）', () => {
    expect(getIntervalMs([])).toBe(0);
  });

  it('nullのとき即出題（0）', () => {
    expect(getIntervalMs(null)).toBe(0);
  });

  it('末尾が不正解のとき即出題（0）', () => {
    expect(getIntervalMs([1, 1, 0])).toBe(0);
  });

  it('1連続正解 → 10分', () => {
    expect(getIntervalMs([0, 1])).toBe(10 * MIN);
  });

  it('2連続正解 → 1時間', () => {
    expect(getIntervalMs([1, 1])).toBe(HOUR);
  });

  it('3連続正解 → 6時間', () => {
    expect(getIntervalMs([0, 1, 1, 1])).toBe(6 * HOUR);
  });

  it('4連続正解 → 1日', () => {
    expect(getIntervalMs([1, 1, 1, 1])).toBe(DAY);
  });

  it('5連続正解 → 3日', () => {
    expect(getIntervalMs([1, 1, 1, 1, 1])).toBe(3 * DAY);
  });

  it('6連続正解以上でも上限は3日', () => {
    expect(getIntervalMs([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(3 * DAY);
  });

  it('途中にミスがあっても末尾からのみカウント', () => {
    // 末尾から2連続正解 → 1時間
    expect(getIntervalMs([1, 1, 1, 0, 1, 1])).toBe(HOUR);
  });
});

// ============================================================
// calculateScore: 優先スコア計算
// ============================================================
describe('calculateScore', () => {
  const now = Date.now();

  it('未回答問題はスコア10（最高優先）', () => {
    expect(calculateScore(null, now)).toBe(10);
    expect(calculateScore({ attempts: 0 }, now)).toBe(10);
  });

  it('正答率100%で復習タイミング前 → スコア低（0に近い）', () => {
    const qState = {
      attempts: 10,
      correct: 10,
      recentResults: [1, 1, 1, 1, 1],
      lastAnsweredAt: now - 1000,
      nextReviewAt: now + 999999,
    };
    const score = calculateScore(qState, now);
    expect(score).toBeLessThan(1);
  });

  it('正答率0%で復習タイミング後 → スコア高（8以上）', () => {
    const qState = {
      attempts: 5,
      correct: 0,
      recentResults: [0, 0, 0, 0, 0],
      lastAnsweredAt: now - 999999,
      nextReviewAt: now - 1,  // 期限切れ
    };
    const score = calculateScore(qState, now);
    // A=5 + B=3 + C=4 = 12
    expect(score).toBe(12);
  });

  it('復習タイミングを過ぎたらB=3が加算される', () => {
    const base = {
      attempts: 2,
      correct: 1,
      recentResults: [1, 0],
      lastAnsweredAt: now - 10000,
    };
    const before = calculateScore({ ...base, nextReviewAt: now + 999999 }, now);
    const after = calculateScore({ ...base, nextReviewAt: now - 1 }, now);
    expect(after - before).toBe(3);
  });

  it('最近の誤答率がスコアに反映される（CコンポーネントはC=誤答率×4）', () => {
    const allWrong = {
      attempts: 5, correct: 0,
      recentResults: [0, 0, 0, 0, 0],
      lastAnsweredAt: now, nextReviewAt: now + 999999,
    };
    const allCorrect = {
      attempts: 5, correct: 5,
      recentResults: [1, 1, 1, 1, 1],
      lastAnsweredAt: now, nextReviewAt: now + 999999,
    };
    expect(calculateScore(allWrong, now)).toBeGreaterThan(calculateScore(allCorrect, now));
  });
});

// ============================================================
// getNextQuestion: 出題選択
// ============================================================
describe('getNextQuestion', () => {
  const mockQuestions = [
    { id: 'Q-001', category: 'S3', difficulty: 1, question: 'Q1', choices: ['A', 'B'], answers: [0], explanation: 'exp' },
    { id: 'Q-002', category: 'EC2', difficulty: 1, question: 'Q2', choices: ['A', 'B'], answers: [1], explanation: 'exp' },
    { id: 'Q-003', category: 'VPC', difficulty: 2, question: 'Q3', choices: ['A', 'B'], answers: [0], explanation: 'exp' },
    { id: 'Q-004', category: 'IAM', difficulty: 2, question: 'Q4', choices: ['A', 'B'], answers: [1], explanation: 'exp' },
    { id: 'Q-005', category: 'RDS', difficulty: 3, question: 'Q5', choices: ['A', 'B'], answers: [0], explanation: 'exp' },
  ];

  const emptyUserState = { questions: {} };

  it('問題が存在すれば必ず1問返す', () => {
    const q = getNextQuestion(mockQuestions, emptyUserState);
    expect(q).not.toBeNull();
    expect(q.id).toBeDefined();
  });

  it('空の問題リストはnullを返す', () => {
    expect(getNextQuestion([], emptyUserState)).toBeNull();
    expect(getNextQuestion(null, emptyUserState)).toBeNull();
  });

  it('返された問題はmockQuestionsに含まれる', () => {
    const q = getNextQuestion(mockQuestions, emptyUserState);
    const ids = mockQuestions.map(q => q.id);
    expect(ids).toContain(q.id);
  });

  it('直前と同じ問題は連続して返さない（100回試行）', () => {
    // 問題が2問以上あれば直前と同じは返さないはず
    const twoQuestions = mockQuestions.slice(0, 2);
    for (let i = 0; i < 100; i++) {
      const first = getNextQuestion(twoQuestions, emptyUserState);
      const second = getNextQuestion(twoQuestions, emptyUserState, first.id);
      expect(second.id).not.toBe(first.id);
    }
  });

  it('未回答問題（スコア10）が全回答済み問題（スコア低）より優先される', () => {
    const now = Date.now();
    // Q-001のみ全問正解で復習タイミング遠い（スコア低）
    // Q-002は未回答（スコア10）
    const userState = {
      questions: {
        'Q-001': {
          attempts: 10, correct: 10, wrong: 0,
          recentResults: [1, 1, 1, 1, 1],
          lastAnsweredAt: now,
          nextReviewAt: now + 3 * 24 * 60 * 60 * 1000,
        },
        'Q-003': {
          attempts: 10, correct: 10, wrong: 0,
          recentResults: [1, 1, 1, 1, 1],
          lastAnsweredAt: now,
          nextReviewAt: now + 3 * 24 * 60 * 60 * 1000,
        },
        'Q-004': {
          attempts: 10, correct: 10, wrong: 0,
          recentResults: [1, 1, 1, 1, 1],
          lastAnsweredAt: now,
          nextReviewAt: now + 3 * 24 * 60 * 60 * 1000,
        },
        'Q-005': {
          attempts: 10, correct: 10, wrong: 0,
          recentResults: [1, 1, 1, 1, 1],
          lastAnsweredAt: now,
          nextReviewAt: now + 3 * 24 * 60 * 60 * 1000,
        },
      },
    };
    // Q-002だけ未回答なので50回中少なくとも1回はQ-002が返るはず
    const results = Array.from({ length: 50 }, () => getNextQuestion(mockQuestions, userState));
    const hasUnanswered = results.some(q => q.id === 'Q-002');
    expect(hasUnanswered).toBe(true);
  });
});

// ============================================================
// updateQuestionState: 回答後の状態更新
// ============================================================
describe('updateQuestionState', () => {
  const now = Date.now();

  it('初回正解: attempts=1, correct=1, wrong=0', () => {
    const result = updateQuestionState(null, true, now);
    expect(result.attempts).toBe(1);
    expect(result.correct).toBe(1);
    expect(result.wrong).toBe(0);
  });

  it('初回不正解: attempts=1, correct=0, wrong=1', () => {
    const result = updateQuestionState(null, false, now);
    expect(result.attempts).toBe(1);
    expect(result.correct).toBe(0);
    expect(result.wrong).toBe(1);
  });

  it('既存状態に加算される', () => {
    const prev = { attempts: 5, correct: 3, wrong: 2, recentResults: [1, 0, 1], lastAnsweredAt: 0, nextReviewAt: 0 };
    const result = updateQuestionState(prev, true, now);
    expect(result.attempts).toBe(6);
    expect(result.correct).toBe(4);
    expect(result.wrong).toBe(2);
  });

  it('recentResultsは最大10件を超えない（FIFO）', () => {
    const prev = {
      attempts: 10, correct: 8, wrong: 2,
      recentResults: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 既に10件
      lastAnsweredAt: 0, nextReviewAt: 0,
    };
    const result = updateQuestionState(prev, false, now);
    expect(result.recentResults.length).toBe(10);
    expect(result.recentResults[result.recentResults.length - 1]).toBe(0); // 末尾に不正解追加
    expect(result.recentResults[0]).toBe(1); // 先頭を削除して残りをシフト
  });

  it('lastAnsweredAtが更新される', () => {
    const result = updateQuestionState(null, true, now);
    expect(result.lastAnsweredAt).toBe(now);
  });

  it('正解後のnextReviewAtはnowより後（インターバル分加算）', () => {
    const result = updateQuestionState(null, true, now);
    expect(result.nextReviewAt).toBeGreaterThan(now);
  });

  it('不正解後のnextReviewAtはnow（即出題）', () => {
    const result = updateQuestionState(null, false, now);
    expect(result.nextReviewAt).toBe(now); // 不正解 → interval=0 → now+0=now
  });
});

// ============================================================
// getStats: 統計計算
// ============================================================
describe('getStats', () => {
  const questions = [
    { id: 'Q-001', category: 'S3', difficulty: 1, question: 'Q1', choices: [], answers: [0], explanation: '' },
    { id: 'Q-002', category: 'S3', difficulty: 1, question: 'Q2', choices: [], answers: [0], explanation: '' },
    { id: 'Q-003', category: 'EC2', difficulty: 2, question: 'Q3', choices: [], answers: [0], explanation: '' },
  ];

  it('未回答のとき: answered=0, accuracy=0', () => {
    const stats = getStats(questions, { questions: {} });
    expect(stats.total).toBe(3);
    expect(stats.answered).toBe(0);
    expect(stats.unanswered).toBe(3);
    expect(stats.accuracy).toBe(0);
  });

  it('全問正解のとき: accuracy=100', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 5, correct: 5, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 },
        'Q-002': { attempts: 3, correct: 3, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 },
        'Q-003': { attempts: 2, correct: 2, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.answered).toBe(3);
    expect(stats.accuracy).toBe(100);
  });

  it('正答率50%のとき: accuracy=50', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 4, correct: 2, wrong: 2, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.accuracy).toBe(50);
  });

  it('カテゴリ別集計が含まれる', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 2, correct: 1, wrong: 1, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.categoryList.length).toBeGreaterThan(0);
    const s3 = stats.categoryList.find(c => c.name === 'S3');
    expect(s3).toBeDefined();
    expect(s3.total).toBe(2);
  });
});
