/**
 * engine.js
 * 出題アルゴリズム・SRSエンジン
 */

/**
 * 連続正解数に基づく次回復習インターバル（ms）
 */
export function getIntervalMs(recentResults) {
  if (!recentResults || recentResults.length === 0) return 0;

  // 末尾から連続する正解数をカウント
  let consecutive = 0;
  for (let i = recentResults.length - 1; i >= 0; i--) {
    if (recentResults[i] === 1) consecutive++;
    else break;
  }

  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const intervals = [
    0,           // 0連続正解: 即出題
    10 * MINUTE, // 1連続正解: 10分後
    HOUR,        // 2連続正解: 1時間後
    6 * HOUR,    // 3連続正解: 6時間後
    DAY,         // 4連続正解: 1日後
    3 * DAY,     // 5連続正解以上: 3日後
  ];

  const idx = Math.min(consecutive, intervals.length - 1);
  return intervals[idx];
}

/**
 * 問題の優先スコアを計算（高いほど出題優先）
 * score = A（苦手度）+ B（忘却補正）+ C（最近の誤答率）
 */
export function calculateScore(qState, now) {
  // 未回答問題は最優先
  if (!qState || qState.attempts === 0) {
    return 10;
  }

  const { attempts, correct, recentResults, nextReviewAt } = qState;

  // A: 苦手度スコア（0〜5）
  const accuracy = correct / attempts;
  const weakness = 1 - accuracy;
  const A = weakness * 5;

  // B: 忘却補正（復習タイミングを過ぎていたら +3）
  const B = now >= nextReviewAt ? 3 : 0;

  // C: 最近の誤答率スコア（0〜4）
  const recentWrongRate = recentResults.length > 0
    ? recentResults.filter(r => r === 0).length / recentResults.length
    : 0;
  const C = recentWrongRate * 4;

  return A + B + C;
}

/**
 * 次に出題する問題を選択
 * 上位20%からランダム選択（偏らせたランダム）
 */
export function getNextQuestion(questions, userState, lastQuestionId = null) {
  if (!questions || questions.length === 0) return null;

  const now = Date.now();

  // 各問題にスコアを付与してスコア降順でソート
  const scored = questions
    .map(q => ({ question: q, score: calculateScore(userState.questions[q.id], now) }))
    .sort((a, b) => b.score - a.score);

  // 上位20%を候補に（最低3問、最大全問）
  const topCount = Math.max(3, Math.ceil(scored.length * 0.2));
  const candidates = scored.slice(0, Math.min(topCount, scored.length));

  // 直前と同じ問題を除外（代替がある場合のみ）
  const eligible = candidates.filter(c => c.question.id !== lastQuestionId);
  const pool = eligible.length > 0 ? eligible : candidates;

  // 候補からランダムに1問選択
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].question;
}

/**
 * 回答後に問題の状態を更新
 */
export function updateQuestionState(qState, isCorrect, now) {
  const result = isCorrect ? 1 : 0;

  // recentResults更新（最大10件、FIFO）
  const recentResults = [...(qState ? (qState.recentResults || []) : []), result];
  if (recentResults.length > 10) recentResults.shift();

  // 次回復習タイムスタンプ計算
  const interval = getIntervalMs(recentResults);

  return {
    attempts: (qState ? qState.attempts : 0) + 1,
    correct: (qState ? qState.correct : 0) + (isCorrect ? 1 : 0),
    wrong: (qState ? qState.wrong : 0) + (isCorrect ? 0 : 1),
    recentResults,
    lastAnsweredAt: now,
    nextReviewAt: now + interval,
  };
}

/**
 * 学習統計の計算
 */
export function getStats(questions, userState) {
  const total = questions.length;
  let answered = 0;
  let totalAttempts = 0;
  let totalCorrect = 0;
  const categoryStats = {};

  for (const q of questions) {
    const qState = userState.questions[q.id];

    // カテゴリ別集計
    if (!categoryStats[q.category]) {
      categoryStats[q.category] = { total: 0, answered: 0, correct: 0, attempts: 0 };
    }
    categoryStats[q.category].total++;

    if (qState && qState.attempts > 0) {
      answered++;
      totalAttempts += qState.attempts ?? 0;
      totalCorrect += qState.correct ?? 0;
      categoryStats[q.category].answered++;
      categoryStats[q.category].correct += qState.correct ?? 0;
      categoryStats[q.category].attempts += qState.attempts ?? 0;
    }
  }

  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // カテゴリ別正答率（降順でソート）
  const categoryList = Object.entries(categoryStats)
    .map(([name, stat]) => ({
      name,
      total: stat.total,
      answered: stat.answered,
      accuracy: stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null,
    }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));

  return {
    total,
    answered,
    unanswered: total - answered,
    totalAttempts,
    totalCorrect,
    accuracy,
    categoryList,
  };
}
