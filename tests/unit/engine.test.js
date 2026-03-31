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

  it('6連続正解 → 1週間', () => {
    expect(getIntervalMs([1, 1, 1, 1, 1, 1])).toBe(7 * DAY);
  });

  it('7連続正解 → 2週間', () => {
    expect(getIntervalMs([1, 1, 1, 1, 1, 1, 1])).toBe(14 * DAY);
  });

  it('8連続正解 → 1ヶ月', () => {
    expect(getIntervalMs([1, 1, 1, 1, 1, 1, 1, 1])).toBe(30 * DAY);
  });

  it('9連続以上でも上限は1ヶ月', () => {
    expect(getIntervalMs(Array(15).fill(1))).toBe(30 * DAY);
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
// updateQuestionState / 追加境界値テスト（Sprint 48）
// ============================================================
describe('updateQuestionState / 追加境界値', () => {
  const now = Date.now();

  it('recentResults が undefined の場合は [result] で初期化される', () => {
    const prev = { attempts: 1, correct: 1, wrong: 0, recentResults: undefined, lastAnsweredAt: 0, nextReviewAt: 0 };
    const result = updateQuestionState(prev, true, now);
    expect(result.recentResults).toEqual([1]);
  });

  it('recentResults が9件のとき追加後10件になる', () => {
    const prev = {
      attempts: 9, correct: 9, wrong: 0,
      recentResults: Array(9).fill(1),
      lastAnsweredAt: 0, nextReviewAt: 0,
    };
    const result = updateQuestionState(prev, false, now);
    expect(result.recentResults.length).toBe(10);
  });

  it('recentResults が10件のとき追加→shift後10件のまま', () => {
    const prev = {
      attempts: 10, correct: 10, wrong: 0,
      recentResults: Array(10).fill(1),
      lastAnsweredAt: 0, nextReviewAt: 0,
    };
    const result = updateQuestionState(prev, true, now);
    expect(result.recentResults.length).toBe(10);
  });

  it('連続8回正解後の nextReviewAt は now + 30日以上', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const prev = {
      attempts: 8, correct: 8, wrong: 0,
      recentResults: Array(8).fill(1),
      lastAnsweredAt: 0, nextReviewAt: 0,
    };
    const result = updateQuestionState(prev, true, now);
    expect(result.nextReviewAt).toBeGreaterThanOrEqual(now + 30 * DAY);
  });

  it('wrong カウントが正しく加算される', () => {
    const prev = { attempts: 3, correct: 2, wrong: 1, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 };
    const result = updateQuestionState(prev, false, now);
    expect(result.wrong).toBe(2);
    expect(result.correct).toBe(2);
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

  it('categoryList はカテゴリ正確度の昇順にソートされる', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 2, correct: 0, wrong: 2, recentResults: [0, 0], lastAnsweredAt: 0, nextReviewAt: 0 }, // S3: 0%
        'Q-003': { attempts: 2, correct: 2, wrong: 0, recentResults: [1, 1], lastAnsweredAt: 0, nextReviewAt: 0 }, // EC2: 100%
      },
    };
    const stats = getStats(questions, userState);
    const accuracies = stats.categoryList.map(c => c.accuracy ?? 101);
    for (let i = 1; i < accuracies.length; i++) {
      expect(accuracies[i]).toBeGreaterThanOrEqual(accuracies[i - 1]);
    }
  });

  it('カテゴリの answered カウントが正しい', () => {
    const userState = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
    };
    const stats = getStats(questions, userState);
    const s3 = stats.categoryList.find(c => c.name === 'S3');
    expect(s3.answered).toBe(1);
    const ec2 = stats.categoryList.find(c => c.name === 'EC2');
    expect(ec2.answered).toBe(0);
  });

  it('カテゴリの due カウントが正しい（期限切れ復習）', () => {
    const past = Date.now() - 1000;
    const future = Date.now() + 100_000;
    const userState = {
      questions: {
        'Q-001': { attempts: 2, correct: 1, wrong: 1, recentResults: [0], lastAnsweredAt: past, nextReviewAt: past }, // due
        'Q-002': { attempts: 2, correct: 2, wrong: 0, recentResults: [1], lastAnsweredAt: past, nextReviewAt: future }, // not due
      },
    };
    const stats = getStats(questions, userState);
    const s3 = stats.categoryList.find(c => c.name === 'S3');
    expect(s3.due).toBe(1);
  });
});

// ============================================================
// getTodayStats: 今日の統計とストリーク
// ============================================================
describe('getTodayStats', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('dailyLog が未定義でも todayCount=0, streak=0, prevStreak=0, todayAccuracy=null を返す', () => {
    const result = getTodayStats({ questions: {} });
    expect(result).toMatchObject({ todayCount: 0, streak: 0, prevStreak: 0, todayAccuracy: null });
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

  it('今日未回答・昨日回答済みの場合 prevStreak=1 (ストリーク危機)', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const state = { dailyLog: { [yesterday]: 5 } };
    const result = getTodayStats(state);
    expect(result.todayCount).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.prevStreak).toBe(1);
  });

  it('今日回答済みの場合 prevStreak=0', () => {
    const state = { dailyLog: { [today]: 3 } };
    expect(getTodayStats(state).prevStreak).toBe(0);
  });

  it('dailyCorrectLog から todayAccuracy を正しく計算', () => {
    const state = { dailyLog: { [today]: 10 }, dailyCorrectLog: { [today]: 7 } };
    const result = getTodayStats(state);
    expect(result.todayCorrect).toBe(7);
    expect(result.todayAccuracy).toBe(70);
  });

  it('今日未回答の場合 todayAccuracy=null', () => {
    expect(getTodayStats({ dailyLog: {} }).todayAccuracy).toBeNull();
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

  it('calendarData は35件のエントリを返す', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.calendarData).toHaveLength(35);
  });

  it('calendarData の最後のエントリ isToday=true', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.calendarData.at(-1).isToday).toBe(true);
  });

  it('calendarData に dailyLog の値が反映される', () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = getStats(questions, { questions: {}, dailyLog: { [today]: 42 } });
    expect(stats.calendarData.at(-1).count).toBe(42);
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
// getStats: predictedScore
// ============================================================
describe('getStats / predictedScore', () => {
  const questions = [
    makeQuestion('Q-001', 'S3'),
    makeQuestion('Q-002', 'S3'),
    makeQuestion('Q-003', 'EC2'),
    makeQuestion('Q-004', 'EC2'),
  ];
  const now = Date.now();

  it('未回答のみ: predictedScore=0', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.predictedScore).toBe(0);
    expect(stats.lastCorrectCount).toBe(0);
  });

  it('4問中1問の直近回答が正解: predictedScore=25（未回答は不正解換算）', () => {
    // predictedScore = lastCorrectCount / total (全問数で割る、未回答=不正解扱い)
    // Q-001: last=1(正解), Q-002: last=0(不正解), Q-003/Q-004: 未回答 → 1/4=25%
    const state = {
      questions: {
        'Q-001': { attempts: 2, correct: 2, wrong: 0, recentResults: [1, 1], lastAnsweredAt: now, nextReviewAt: now },
        'Q-002': { attempts: 1, correct: 0, wrong: 1, recentResults: [0],    lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    expect(stats.predictedScore).toBe(25);
    expect(stats.lastCorrectCount).toBe(1);
  });

  it('4問中2問の直近回答が正解: predictedScore=50', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now },
        'Q-002': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now },
        'Q-003': { attempts: 1, correct: 0, wrong: 1, recentResults: [0], lastAnsweredAt: now, nextReviewAt: now },
        'Q-004': { attempts: 1, correct: 0, wrong: 1, recentResults: [0], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    expect(stats.predictedScore).toBe(50);
    expect(stats.lastCorrectCount).toBe(2);
  });

  it('全問の直近回答が正解: predictedScore=100', () => {
    const state = {
      questions: Object.fromEntries(
        questions.map(q => [q.id, { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now }])
      ),
      dailyLog: {},
    };
    expect(getStats(questions, state).predictedScore).toBe(100);
  });

  it('直近回答が不正解（recentResults.at(-1)===0）は含まれない', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 3, correct: 2, wrong: 1, recentResults: [1, 1, 0], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    expect(stats.lastCorrectCount).toBe(0);
    expect(stats.predictedScore).toBe(0);
  });

  it('recentResults が空配列の問題はカウントされない', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [], lastAnsweredAt: now, nextReviewAt: now },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    expect(stats.lastCorrectCount).toBe(0);
  });
});

// ============================================================
// getStats: upcoming24h / nextReviewIn
// ============================================================
describe('getStats / upcoming24h and nextReviewIn', () => {
  const questions = [makeQuestion('Q-001', 'S3'), makeQuestion('Q-002', 'EC2')];
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY  = 24 * HOUR;

  it('未回答問題は upcoming24h に含まれない', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.upcoming24h).toBe(0);
  });

  it('nextReviewAt が未来24h以内の問題は upcoming24h に含まれる', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now + HOUR },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).upcoming24h).toBe(1);
  });

  it('nextReviewAt が24h超の問題は upcoming24h に含まれない', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now + DAY + 1000 },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).upcoming24h).toBe(0);
  });

  it('期限切れ（dueCount）の問題は upcoming24h に含まれない', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now - 1 },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    expect(stats.dueCount).toBe(1);
    expect(stats.upcoming24h).toBe(0);
  });

  it('nextReviewIn は未来の最小 nextReviewAt - now を返す', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now + 5 * HOUR },
        'Q-002': { attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now + 2 * HOUR },
      },
      dailyLog: {},
    };
    const stats = getStats(questions, state);
    // nextReviewIn は最小の待ち時間（2時間分）
    expect(stats.nextReviewIn).toBeGreaterThanOrEqual(2 * HOUR - 100);
    expect(stats.nextReviewIn).toBeLessThanOrEqual(2 * HOUR + 100);
  });

  it('全問未回答なら nextReviewIn は null', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.nextReviewIn).toBeNull();
  });

  it('全問が期限切れなら nextReviewIn は null（未来の予定なし）', () => {
    const state = {
      questions: {
        'Q-001': { attempts: 1, correct: 0, wrong: 1, recentResults: [0], lastAnsweredAt: now, nextReviewAt: now - 1 },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).nextReviewIn).toBeNull();
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

// ============================================================
// getStats: totalSkips
// ============================================================
describe('getStats / totalSkips', () => {
  const questions = [makeQuestion('Q-001', 'S3')];

  it('dailySkipLog がない場合は totalSkips=0', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.totalSkips).toBe(0);
  });

  it('dailySkipLog が空オブジェクトの場合は totalSkips=0', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {}, dailySkipLog: {} });
    expect(stats.totalSkips).toBe(0);
  });

  it('dailySkipLog の値が totalSkips に集計される', () => {
    const stats = getStats(questions, {
      questions: {},
      dailyLog: {},
      dailySkipLog: { '2026-03-29': 2, '2026-03-30': 3 },
    });
    expect(stats.totalSkips).toBe(5);
  });

  it('dailySkipLog に1日分のみ: totalSkips=1', () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = getStats(questions, {
      questions: {},
      dailyLog: {},
      dailySkipLog: { [today]: 1 },
    });
    expect(stats.totalSkips).toBe(1);
  });
});

// ============================================================
// getStats: bookmarkCount
// ============================================================
describe('getStats / bookmarkCount', () => {
  const questions = [
    makeQuestion('Q-001', 'S3'),
    makeQuestion('Q-002', 'EC2'),
    makeQuestion('Q-003', 'VPC'),
  ];

  it('ブックマークなしで bookmarkCount=0', () => {
    const stats = getStats(questions, { questions: {}, dailyLog: {} });
    expect(stats.bookmarkCount).toBe(0);
  });

  it('1問ブックマークで bookmarkCount=1', () => {
    const state = {
      questions: { 'Q-001': { bookmarked: true, attempts: 0, correct: 0, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 } },
      dailyLog: {},
    };
    expect(getStats(questions, state).bookmarkCount).toBe(1);
  });

  it('全問ブックマークで bookmarkCount=3', () => {
    const state = {
      questions: Object.fromEntries(
        questions.map(q => [q.id, { bookmarked: true, attempts: 0, correct: 0, wrong: 0, recentResults: [], lastAnsweredAt: 0, nextReviewAt: 0 }])
      ),
      dailyLog: {},
    };
    expect(getStats(questions, state).bookmarkCount).toBe(3);
  });

  it('bookmarked: false の問題は含まれない', () => {
    const state = {
      questions: {
        'Q-001': { bookmarked: false, attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: 0, nextReviewAt: 0 },
        'Q-002': { bookmarked: true, attempts: 1, correct: 1, wrong: 0, recentResults: [1], lastAnsweredAt: 0, nextReviewAt: 0 },
      },
      dailyLog: {},
    };
    expect(getStats(questions, state).bookmarkCount).toBe(1);
  });
});

// ============================================================
// getStats: weakCount
// ============================================================
describe('getStats / weakCount', () => {
  const questions = [makeQuestion('Q-001', 'S3'), makeQuestion('Q-002', 'EC2')];
  const now = Date.now();

  it('未回答問題は weakCount に含まれない', () => {
    expect(getStats(questions, { questions: {}, dailyLog: {} }).weakCount).toBe(0);
  });

  it('正答率60%未満で weakCount=1', () => {
    const state = {
      questions: { 'Q-001': { attempts: 5, correct: 2, wrong: 3, recentResults: [0], lastAnsweredAt: now, nextReviewAt: now } },
      dailyLog: {},
    };
    expect(getStats(questions, state).weakCount).toBe(1);
  });

  it('正答率ちょうど60%は弱点に含まれない（< 0.6）', () => {
    const state = {
      questions: { 'Q-001': { attempts: 5, correct: 3, wrong: 2, recentResults: [1], lastAnsweredAt: now, nextReviewAt: now } },
      dailyLog: {},
    };
    expect(getStats(questions, state).weakCount).toBe(0);
  });

  it('全問正答率0%で weakCount=2', () => {
    const state = {
      questions: Object.fromEntries(
        questions.map(q => [q.id, { attempts: 3, correct: 0, wrong: 3, recentResults: [0], lastAnsweredAt: now, nextReviewAt: now }])
      ),
      dailyLog: {},
    };
    expect(getStats(questions, state).weakCount).toBe(2);
  });
});

// ============================================================
// getStats: masteredCount 境界値
// ============================================================
describe('getStats / masteredCount 境界値', () => {
  const questions = [makeQuestion('Q-001', 'S3')];
  const now = Date.now();

  it('直近5回中4回正解はマスター外', () => {
    const state = {
      questions: { 'Q-001': { attempts: 5, correct: 4, wrong: 1, recentResults: [1, 1, 1, 1, 0], lastAnsweredAt: now, nextReviewAt: now } },
      dailyLog: {},
    };
    expect(getStats(questions, state).masteredCount).toBe(0);
  });

  it('直近5回全正解はマスター済み', () => {
    const state = {
      questions: { 'Q-001': { attempts: 6, correct: 5, wrong: 1, recentResults: [0, 1, 1, 1, 1, 1], lastAnsweredAt: now, nextReviewAt: now } },
      dailyLog: {},
    };
    // 直近5回（最後5件）が全て1 → マスター
    expect(getStats(questions, state).masteredCount).toBe(1);
  });

  it('recentResults が 4 件はマスター外', () => {
    const state = {
      questions: { 'Q-001': { attempts: 4, correct: 4, wrong: 0, recentResults: [1, 1, 1, 1], lastAnsweredAt: now, nextReviewAt: now } },
      dailyLog: {},
    };
    expect(getStats(questions, state).masteredCount).toBe(0);
  });
});

// ============================================================
// formatInterval
// ============================================================
describe('formatInterval', () => {
  it('過去または現在は「すぐ」', () => {
    expect(formatInterval(Date.now() - 1000)).toBe('すぐ');
  });

  it('30分後は「30分後」', () => {
    expect(formatInterval(Date.now() + 30 * 60_000)).toBe('30分後');
  });

  it('1時間後は「1時間後」', () => {
    expect(formatInterval(Date.now() + 60 * 60_000)).toBe('1時間後');
  });

  it('24時間後は「1日後」', () => {
    expect(formatInterval(Date.now() + 24 * 3_600_000)).toBe('1日後');
  });

  it('59分後は「59分後」（60分未満は分表示）', () => {
    expect(formatInterval(Date.now() + 59 * 60_000)).toBe('59分後');
  });
});

// ============================================================
// getTodayStats
// ============================================================
describe('getTodayStats', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('dailyLog なしで todayCount=0 streak=0', () => {
    const result = getTodayStats({ questions: {} });
    expect(result.todayCount).toBe(0);
    expect(result.streak).toBe(0);
  });

  it('今日10問回答で todayCount=10', () => {
    const result = getTodayStats({ dailyLog: { [today]: 10 }, questions: {} });
    expect(result.todayCount).toBe(10);
  });

  it('今日回答で streak=1', () => {
    const result = getTodayStats({ dailyLog: { [today]: 5 }, questions: {} });
    expect(result.streak).toBe(1);
  });

  it('今日正解5問・総回答10問で todayAccuracy=50', () => {
    const result = getTodayStats({
      dailyLog: { [today]: 10 },
      dailyCorrectLog: { [today]: 5 },
      questions: {},
    });
    expect(result.todayAccuracy).toBe(50);
  });

  it('今日未回答なら todayAccuracy=null', () => {
    const result = getTodayStats({ dailyLog: {}, questions: {} });
    expect(result.todayAccuracy).toBeNull();
  });
});

// ============================================================
// isAnswerCorrect 追加境界値
// ============================================================
describe('isAnswerCorrect 追加境界値', () => {
  it('選択なし（空配列）は不正解', () => {
    expect(isAnswerCorrect([], [0])).toBe(false);
  });

  it('正解が空で選択なし → true', () => {
    expect(isAnswerCorrect([], [])).toBe(true);
  });

  it('単一正解に複数選択 → false', () => {
    expect(isAnswerCorrect([0, 1], [0])).toBe(false);
  });
});

// ============================================================
// updateQuestionState: 初回回答（qState=null）
// ============================================================
describe('updateQuestionState / 初回回答', () => {
  it('正解時 attempts=1 correct=1', () => {
    const s = updateQuestionState(null, true, Date.now());
    expect(s.attempts).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.wrong).toBe(0);
  });

  it('不正解時 attempts=1 wrong=1', () => {
    const s = updateQuestionState(null, false, Date.now());
    expect(s.attempts).toBe(1);
    expect(s.correct).toBe(0);
    expect(s.wrong).toBe(1);
  });

  it('nextReviewAt は現在より未来', () => {
    const now = Date.now();
    const s = updateQuestionState(null, true, now);
    expect(s.nextReviewAt).toBeGreaterThan(now);
  });
});

// ============================================================
// calculateScore
// ============================================================
describe('calculateScore', () => {
  const now = Date.now();

  it('未回答問題は最優先スコア=10', () => {
    expect(calculateScore(null, now)).toBe(10);
    expect(calculateScore({ attempts: 0 }, now)).toBe(10);
  });

  it('全問正解・復習前: スコア低い（A=0, B=0, C=0）', () => {
    const s = { attempts: 5, correct: 5, recentResults: [1, 1, 1], nextReviewAt: now + 3_600_000 };
    expect(calculateScore(s, now)).toBe(0);
  });

  it('全問不正解・復習過ぎ: スコア高い（A=5, B=3, C=4）', () => {
    const s = { attempts: 5, correct: 0, recentResults: [0, 0, 0], nextReviewAt: now - 1 };
    expect(calculateScore(s, now)).toBe(12);
  });

  it('復習期限過ぎると B=3 加算', () => {
    const past = { attempts: 2, correct: 2, recentResults: [1], nextReviewAt: now - 1 };
    const future = { attempts: 2, correct: 2, recentResults: [1], nextReviewAt: now + 3_600_000 };
    expect(calculateScore(past, now) - calculateScore(future, now)).toBe(3);
  });
});

// ============================================================
// calculateScore 追加
// ============================================================
describe('calculateScore / recentResults空', () => {
  const now = Date.now();

  it('recentResults空で C=0', () => {
    const s = { attempts: 3, correct: 1, recentResults: [], nextReviewAt: now + 3_600_000 };
    const score = calculateScore(s, now);
    // A = (1-1/3)*5 ≈ 3.33, B=0, C=0
    expect(score).toBeCloseTo(10 / 3, 1);
  });
});

// ============================================================
// calculateScore / accuracy 境界値テスト（Sprint 44）
// ============================================================
describe('calculateScore / accuracy境界値', () => {
  const now = Date.now();
  const future = now + 3_600_000;

  it('正答率50%: A=2.5', () => {
    const s = { attempts: 4, correct: 2, recentResults: [], nextReviewAt: future };
    expect(calculateScore(s, now)).toBeCloseTo(2.5, 5);
  });

  it('正答率25%: A=3.75', () => {
    const s = { attempts: 4, correct: 1, recentResults: [], nextReviewAt: future };
    expect(calculateScore(s, now)).toBeCloseTo(3.75, 5);
  });

  it('正答率75%: A=1.25', () => {
    const s = { attempts: 4, correct: 3, recentResults: [], nextReviewAt: future };
    expect(calculateScore(s, now)).toBeCloseTo(1.25, 5);
  });

  it('attempts=1 correct=1: A=0 score=0（B=0,C=0）', () => {
    const s = { attempts: 1, correct: 1, recentResults: [1], nextReviewAt: future };
    expect(calculateScore(s, now)).toBe(0);
  });

  it('recentResults全誤答: C=4', () => {
    const s = { attempts: 3, correct: 3, recentResults: [0, 0, 0], nextReviewAt: future };
    // A=0, B=0, C=4
    expect(calculateScore(s, now)).toBe(4);
  });
});

// ============================================================
// getNextQuestion 基本動作
// ============================================================
describe('getNextQuestion', () => {
  const questions = [
    makeQuestion('Q-001', 'S3'),
    makeQuestion('Q-002', 'EC2'),
    makeQuestion('Q-003', 'VPC'),
  ];

  it('問題がある場合は null を返さない', () => {
    const q = getNextQuestion(questions, { questions: {} });
    expect(q).not.toBeNull();
    expect(q.id).toBeDefined();
  });

  it('問題リストが空なら null を返す', () => {
    expect(getNextQuestion([], { questions: {} })).toBeNull();
  });

  it('直前と同じ問題は避ける（代替が存在する場合）', () => {
    const results = [];
    for (let i = 0; i < 20; i++) {
      const q = getNextQuestion(questions, { questions: {} }, 'Q-001');
      results.push(q.id);
    }
    // 20回中少なくとも1回は Q-001 以外が来る
    expect(results.some(id => id !== 'Q-001')).toBe(true);
  });
});

// ============================================================
// getNextQuestion / 追加境界値テスト（Sprint 46）
// ============================================================
describe('getNextQuestion / 追加境界値', () => {
  const now = Date.now();

  it('問題1問のみ: lastQuestionIdと同じでも返す', () => {
    const q = [{ id: 'Q-001', text: 'test' }];
    const result = getNextQuestion(q, { questions: {} }, 'Q-001');
    expect(result).not.toBeNull();
    expect(result.id).toBe('Q-001');
  });

  it('高スコア問題が優先的に選ばれる（50回試行で多くの割合）', () => {
    // Q-001: 未回答(score=10), Q-002: 全正解(score≒0)
    const qs = [
      { id: 'Q-001', text: 'unanswered' },
      { id: 'Q-002', text: 'mastered' },
    ];
    const userState = {
      questions: {
        'Q-002': { attempts: 10, correct: 10, recentResults: [1,1,1,1,1], nextReviewAt: now + 999999 },
      }
    };
    let q001Count = 0;
    for (let i = 0; i < 50; i++) {
      if (getNextQuestion(qs, userState)?.id === 'Q-001') q001Count++;
    }
    // 上位20%（最低3問）から選ぶが2問しかないので両方候補、それでもQ-001が多め
    expect(q001Count).toBeGreaterThanOrEqual(20);
  });

  it('userState.questions がある場合は正常動作する', () => {
    const qs = [{ id: 'Q-001', text: 'test' }];
    const result = getNextQuestion(qs, { questions: { 'Q-001': { attempts: 1, correct: 1, recentResults: [1], nextReviewAt: now + 999 } } });
    expect(result).not.toBeNull();
  });

  it('全問スコアが同じならランダムに返す（10問・100回で偏りなし）', () => {
    const qs = Array.from({ length: 5 }, (_, i) => ({ id: `Q-${i}`, text: `q${i}` }));
    const counts = {};
    for (let i = 0; i < 100; i++) {
      const q = getNextQuestion(qs, { questions: {} });
      counts[q.id] = (counts[q.id] || 0) + 1;
    }
    // 少なくとも3種類以上の問題が選ばれている
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(3);
  });

  it('nullリストはnullを返す', () => {
    expect(getNextQuestion(null, { questions: {} })).toBeNull();
  });
});

// ============================================================
// getIntervalMs / 追加境界値テスト（Sprint 38）
// ============================================================
describe('getIntervalMs / 追加境界値', () => {
  const MINUTE = 60 * 1000;
  const HOUR   = 60 * MINUTE;
  const DAY    = 24 * HOUR;

  it('undefined は即出題（0ms）', () => {
    expect(getIntervalMs(undefined)).toBe(0);
  });

  it('要素1つ・正解 [1] → 1連続 → 10分', () => {
    expect(getIntervalMs([1])).toBe(10 * MINUTE);
  });

  it('要素1つ・不正解 [0] → 即出題（0ms）', () => {
    expect(getIntervalMs([0])).toBe(0);
  });

  it('長い履歴末尾に8連続正解 → 1ヶ月', () => {
    // 最初に2回不正解、続いて8回正解
    expect(getIntervalMs([0, 0, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(30 * DAY);
  });

  it('不正解でリセット後1連続 [1, 0, 1] → 10分', () => {
    expect(getIntervalMs([1, 0, 1])).toBe(10 * MINUTE);
  });
});
