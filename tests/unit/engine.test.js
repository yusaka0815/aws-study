/**
 * engine.test.js
 * 出題アルゴリズム・SRS計算の単体テスト
 *
 * テスト対象: src/engine.js
 * 純粋関数のみで構成されているためモック不要
 */

import { describe, it, expect } from 'vitest';
import {
  getIntervalMs,
  calculateScore,
  getNextQuestion,
  updateQuestionState,
  getStats,
  getTodayStats,
  formatInterval,
  isAnswerCorrect,
} from '../../src/engine.js';

// ============================================================
// テストフィクスチャ
// ============================================================

const MINUTE = 60 * 1000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

/** 最小構成の問題オブジェクトを生成 */
function makeQuestion(id, category = 'S3') {
  return {
    id,
    category,
    difficulty: 1,
    question: `問題 ${id}`,
    choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
    answers: [0],
    explanation: `解説 ${id}`,
    tags: [],
  };
}

/** 全問正解済みの問題状態を生成 */
function makeMasteredState(now) {
  return {
    attempts: 10,
    correct: 10,
    wrong: 0,
    recentResults: [1, 1, 1, 1, 1],
    lastAnsweredAt: now,
    nextReviewAt: now + 3 * DAY,
  };
}

const MOCK_QUESTIONS = ['Q-001', 'Q-002', 'Q-003', 'Q-004', 'Q-005']
  .map((id, i) => makeQuestion(id, ['S3', 'EC2', 'VPC', 'IAM', 'RDS'][i]));

// ============================================================
// getIntervalMs: SRSインターバル計算
// ============================================================
describe('getIntervalMs', () => {
  it('空配列は即出題（0ms）', () => {
    expect(getIntervalMs([])).toBe(0);
  });

  it('null は即出題（0ms）', () => {
    expect(getIntervalMs(null)).toBe(0);
  });

  it('末尾が不正解は即出題（0ms）', () => {
    expect(getIntervalMs([1, 1, 0])).toBe(0);
  });

  it('1連続正解 → 10分', () => {
    expect(getIntervalMs([0, 1])).toBe(10 * MINUTE);
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

  it('6連続以上でも上限は3日', () => {
    expect(getIntervalMs(Array(10).fill(1))).toBe(3 * DAY);
  });

  it('途中ミスがあっても末尾のみカウント（連続2 → 1時間）', () => {
    expect(getIntervalMs([1, 1, 1, 0, 1, 1])).toBe(HOUR);
  });
});

// ============================================================
// calculateScore: 優先スコア計算
// ============================================================
describe('calculateScore', () => {
  const now = Date.now();

  it('未回答（null）はスコア10（最高優先）', () => {
    expect(calculateScore(null, now)).toBe(10);
  });

  it('attempts=0 もスコア10', () => {
    expect(calculateScore({ attempts: 0 }, now)).toBe(10);
  });

  it('全問正解・復習タイミング前はスコア低（1未満）', () => {
    const qState = {
      attempts: 10, correct: 10,
      recentResults: [1, 1, 1, 1, 1],
      lastAnsweredAt: now - 1000,
      nextReviewAt: now + 999_999,
    };
    expect(calculateScore(qState, now)).toBeLessThan(1);
  });

  it('全問不正解・期限切れはスコア最大（A=5+B=3+C=4=12）', () => {
    const qState = {
      attempts: 5, correct: 0,
      recentResults: [0, 0, 0, 0, 0],
      lastAnsweredAt: now - 999_999,
      nextReviewAt: now - 1,
    };
    expect(calculateScore(qState, now)).toBe(12);
  });

  it('復習タイミングを過ぎるとBが3加算される', () => {
    const base = {
      attempts: 2, correct: 1,
      recentResults: [1, 0],
      lastAnsweredAt: now - 10000,
    };
    const before = calculateScore({ ...base, nextReviewAt: now + 999_999 }, now);
    const after  = calculateScore({ ...base, nextReviewAt: now - 1 }, now);
    expect(after - before).toBe(3);
  });

  it('最近の誤答率が高いほどスコアが高い', () => {
    const allWrong = {
      attempts: 5, correct: 0,
      recentResults: [0, 0, 0, 0, 0],
      lastAnsweredAt: now, nextReviewAt: now + 999_999,
    };
    const allCorrect = {
      attempts: 5, correct: 5,
      recentResults: [1, 1, 1, 1, 1],
      lastAnsweredAt: now, nextReviewAt: now + 999_999,
    };
    expect(calculateScore(allWrong, now)).toBeGreaterThan(calculateScore(allCorrect, now));
  });
});

// ============================================================
// getNextQuestion: 出題選択
// ============================================================
describe('getNextQuestion', () => {
  const emptyUserState = { questions: {} };

  it('問題リストから必ず1問返す', () => {
    const q = getNextQuestion(MOCK_QUESTIONS, emptyUserState);
    expect(q).not.toBeNull();
    expect(q.id).toBeDefined();
  });

  it('空リストはnullを返す', () => {
    expect(getNextQuestion([], emptyUserState)).toBeNull();
  });

  it('nullリストはnullを返す', () => {
    expect(getNextQuestion(null, emptyUserState)).toBeNull();
  });

  it('返される問題は必ず問題リストに含まれる', () => {
    const ids = MOCK_QUESTIONS.map(q => q.id);
    const q = getNextQuestion(MOCK_QUESTIONS, emptyUserState);
    expect(ids).toContain(q.id);
  });

  it('直前の問題と同じ問題を連続して返さない（100回試行）', () => {
    const twoQuestions = MOCK_QUESTIONS.slice(0, 2);
    for (let i = 0; i < 100; i++) {
      const first  = getNextQuestion(twoQuestions, emptyUserState);
      const second = getNextQuestion(twoQuestions, emptyUserState, first.id);
      expect(second.id).not.toBe(first.id);
    }
  });

  it('未回答問題（スコア10）が全正解済み問題より優先される', () => {
    const now = Date.now();
    const userState = {
      questions: Object.fromEntries(
        ['Q-001', 'Q-003', 'Q-004', 'Q-005'].map(id => [id, makeMasteredState(now)])
      ),
    };
    // Q-002 だけ未回答 → 50回試行中に必ず出現するはず
    const results = Array.from({ length: 50 }, () => getNextQuestion(MOCK_QUESTIONS, userState));
    expect(results.some(q => q.id === 'Q-002')).toBe(true);
  });
});

// ============================================================
// updateQuestionState: 回答後の状態更新
// ============================================================
describe('updateQuestionState', () => {
  const now = Date.now();

  it('初回正解: attempts=1, correct=1, wrong=0', () => {
    const result = updateQuestionState(null, true, now);
    expect(result).toMatchObject({ attempts: 1, correct: 1, wrong: 0 });
  });

  it('初回不正解: attempts=1, correct=0, wrong=1', () => {
    const result = updateQuestionState(null, false, now);
    expect(result).toMatchObject({ attempts: 1, correct: 0, wrong: 1 });
  });

  it('既存状態に正しく加算される', () => {
    const prev = { attempts: 5, correct: 3, wrong: 2, recentResults: [1, 0, 1], lastAnsweredAt: 0, nextReviewAt: 0 };
    const result = updateQuestionState(prev, true, now);
    expect(result).toMatchObject({ attempts: 6, correct: 4, wrong: 2 });
  });

  it('recentResultsは最大10件を超えない（FIFOで先頭を捨てる）', () => {
    const prev = {
      attempts: 10, correct: 8, wrong: 2,
      recentResults: Array(10).fill(1),
      lastAnsweredAt: 0, nextReviewAt: 0,
    };
    const result = updateQuestionState(prev, false, now);
    expect(result.recentResults.length).toBe(10);
    expect(result.recentResults.at(-1)).toBe(0); // 末尾に追加
    expect(result.recentResults[0]).toBe(1);      // 先頭は残る（先頭の1が削除され残りがシフト）
  });

  it('lastAnsweredAt が now に更新される', () => {
    expect(updateQuestionState(null, true, now).lastAnsweredAt).toBe(now);
  });

  it('正解後の nextReviewAt は now より後', () => {
    expect(updateQuestionState(null, true, now).nextReviewAt).toBeGreaterThan(now);
  });

  it('不正解後の nextReviewAt は now（即出題）', () => {
    expect(updateQuestionState(null, false, now).nextReviewAt).toBe(now);
  });
});

// ============================================================
// getStats: 統計計算
// ============================================================
describe('getStats', () => {
  const questions = [
    makeQuestion('Q-001', 'S3'),
    makeQuestion('Q-002', 'S3'),
    makeQuestion('Q-003', 'EC2'),
  ];

  it('未回答: answered=0, unanswered=3, accuracy=0', () => {
    const stats = getStats(questions, { questions: {} });
    expect(stats).toMatchObject({ total: 3, answered: 0, unanswered: 3, accuracy: 0 });
  });

  it('全問正解: accuracy=100', () => {
    const userState = {
      questions: Object.fromEntries(
        questions.map(q => [q.id, { attempts: 5, correct: 5, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 }])
      ),
    };
    expect(getStats(questions, userState).accuracy).toBe(100);
  });

  it('正答率50%: accuracy=50', () => {
    const userState = {
      questions: { 'Q-001': { attempts: 4, correct: 2, wrong: 2, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 } },
    };
    expect(getStats(questions, userState).accuracy).toBe(50);
  });

  it('categoryList に S3 と EC2 が含まれる', () => {
    const stats = getStats(questions, { questions: {} });
    const names = stats.categoryList.map(c => c.name);
    expect(names).toContain('S3');
    expect(names).toContain('EC2');
  });

  it('S3 の total は 2', () => {
    const stats = getStats(questions, { questions: {} });
    const s3 = stats.categoryList.find(c => c.name === 'S3');
    expect(s3.total).toBe(2);
  });

  it('qState.correct が undefined でも accuracy が NaN にならない', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 1, correct: undefined, wrong: 1, recentResults: [0], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.accuracy).not.toBeNaN();
    expect(stats.accuracy).toBe(0);
  });

  it('qState.attempts が undefined でも accuracy が NaN にならない', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: undefined, correct: 0, wrong: 1, recentResults: [0], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.accuracy).not.toBeNaN();
    expect(stats.accuracy).toBe(0);
  });

  it('カテゴリ別 accuracy も NaN にならない（correct が undefined）', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 2, correct: undefined, wrong: 2, recentResults: [0, 0], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    const s3 = stats.categoryList.find(c => c.name === 'S3');
    expect(s3.accuracy).not.toBeNaN();
    expect(s3.accuracy).toBe(0);
  });

  it('qState.correct が実際の NaN でも accuracy が NaN にならない', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 3, correct: NaN, wrong: 1, recentResults: [0], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.accuracy).not.toBeNaN();
    expect(stats.accuracy).toBe(0);
  });

  it('qState.attempts が実際の NaN でも answered カウントが壊れない', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: NaN, correct: 0, wrong: 1, recentResults: [0], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    expect(stats.answered).toBe(0); // NaN attempts はゼロ扱いで未回答
    expect(stats.accuracy).not.toBeNaN();
  });
});

// ============================================================
// getTodayStats: 今日の統計とストリーク
// ============================================================
describe('getTodayStats', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('dailyLog が未定義でも todayCount=0, streak=0 を返す', () => {
    const result = getTodayStats({ questions: {} });
    expect(result).toEqual({ todayCount: 0, streak: 0 });
  });

  it('今日の回答数を正しく返す', () => {
    const state = { dailyLog: { [today]: 7 } };
    expect(getTodayStats(state).todayCount).toBe(7);
  });

  it('今日だけ回答: streak=1', () => {
    const state = { dailyLog: { [today]: 3 } };
    expect(getTodayStats(state).streak).toBe(1);
  });

  it('dailyLog が空: streak=0', () => {
    expect(getTodayStats({ dailyLog: {} }).streak).toBe(0);
  });

  it('連続2日: streak=2', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const state = { dailyLog: { [today]: 5, [yesterday]: 3 } };
    expect(getTodayStats(state).streak).toBe(2);
  });
});

// ============================================================
// getStats: weeklyLog
// ============================================================
describe('getStats / weeklyLog', () => {
  const questions = [makeQuestion('Q-001', 'S3')];

  it('weeklyLog は7件のエントリを返す', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.weeklyLog).toHaveLength(7);
  });

  it('今日のエントリのラベルは「今日」', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.weeklyLog.at(-1).label).toBe('今日');
  });

  it('dailyLog の値が weeklyLog に反映される', () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = getStats(questions, { questions: {}, dailyLog: { [today]: 12 } });
    expect(stats.weeklyLog.at(-1).count).toBe(12);
  });

  it('dailyLog が undefined でもクラッシュしない', () => {
    expect(() => getStats(questions, { questions: {} })).not.toThrow();
  });
});

// ============================================================
// getStats: masteredCount
// ============================================================
describe('getStats / masteredCount', () => {
  const questions = [makeQuestion('Q-001', 'S3'), makeQuestion('Q-002', 'EC2')];
  const now = Date.now();

  it('未回答問題は masteredCount に含まれない', () => {
    expect(getStats(questions, { questions: {}, dailyLog: {} }).masteredCount).toBe(0);
  });

  it('直近5回全正解でマスター済み', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 5, correct: 5, wrong: 0, recentResults: [1, 1, 1, 1, 1], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).masteredCount).toBe(1);
  });

  it('直近5回に1つでも不正解があればマスター外', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 5, correct: 4, wrong: 1, recentResults: [1, 1, 1, 1, 0], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).masteredCount).toBe(0);
  });

  it('recentResults が 5 件未満はマスター外', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 4, correct: 4, wrong: 0, recentResults: [1, 1, 1, 1], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).masteredCount).toBe(0);
  });
});

// ============================================================
// formatInterval: 次回復習時間のフォーマット
// ============================================================
describe('formatInterval', () => {
  const now = Date.now();

  it('過去または現在は「すぐ」', () => {
    expect(formatInterval(now - 1000)).toBe('すぐ');
    expect(formatInterval(now)).toBe('すぐ');
  });

  it('5分後', () => {
    expect(formatInterval(now + 5 * 60_000)).toBe('5分後');
  });

  it('1時間後', () => {
    expect(formatInterval(now + 60 * 60_000)).toBe('1時間後');
  });

  it('3日後', () => {
    expect(formatInterval(now + 3 * 86_400_000)).toBe('3日後');
  });
});

// ============================================================
// getStats: dueCount
// ============================================================
describe('getStats / dueCount', () => {
  const questions = [makeQuestion('Q-001', 'S3'), makeQuestion('Q-002', 'EC2')];
  const now = Date.now();

  it('未回答問題は dueCount に含まれない', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.dueCount).toBe(0);
  });

  it('nextReviewAt が過去の問題は dueCount に含まれる', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now - 1 },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).dueCount).toBe(1);
  });

  it('nextReviewAt が未来の問題は dueCount に含まれない', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now + 999_999 },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).dueCount).toBe(0);
  });
});

// ============================================================
// isAnswerCorrect: 回答正誤判定
// ============================================================
describe('isAnswerCorrect', () => {
  it('単一選択: 正解インデックスが一致する場合 true', () => {
    expect(isAnswerCorrect([0], [0])).toBe(true);
  });

  it('単一選択: 不一致の場合 false', () => {
    expect(isAnswerCorrect([1], [0])).toBe(false);
  });

  it('複数選択: 全インデックスが一致する場合 true（順序不問）', () => {
    expect(isAnswerCorrect([2, 0], [0, 2])).toBe(true);
  });

  it('複数選択: 一部のみ正解は false', () => {
    expect(isAnswerCorrect([0, 1], [0, 2])).toBe(false);
  });

  it('選択数が足りない場合は false', () => {
    expect(isAnswerCorrect([0], [0, 1])).toBe(false);
  });

  it('選択数が多い場合は false', () => {
    expect(isAnswerCorrect([0, 1, 2], [0, 1])).toBe(false);
  });

  it('空配列同士は true', () => {
    expect(isAnswerCorrect([], [])).toBe(true);
  });
});
