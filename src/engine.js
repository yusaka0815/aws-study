/**
 * engine.js
 * 出題アルゴリズム・SRSエンジン
 */

/** localStorageの破損データ（NaN・undefined・null）をゼロに変換 */
const safeInt = v => Number.isFinite(v) ? v : 0;

// ============================================================
// SRS インターバル定数
// ============================================================
const MINUTE = 60 * 1000;
const HOUR   = 60 * MINUTE;
const DAY    = 24 * HOUR;

/** SRS復習インターバルテーブル（連続正解数→待機時間ms） */
export const SRS_INTERVALS = [
  0,           // 0連続正解: 即出題
  10 * MINUTE, // 1連続正解: 10分後
  HOUR,        // 2連続正解: 1時間後
  6 * HOUR,    // 3連続正解: 6時間後
  DAY,         // 4連続正解: 1日後
  3 * DAY,     // 5連続正解以上: 3日後
];

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

  const intervals = SRS_INTERVALS;

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
    attempts: safeInt(qState ? qState.attempts : 0) + 1,
    correct: safeInt(qState ? qState.correct : 0) + (isCorrect ? 1 : 0),
    wrong: safeInt(qState ? qState.wrong : 0) + (isCorrect ? 0 : 1),
    recentResults,
    lastAnsweredAt: now,
    nextReviewAt: now + interval,
  };
}

/**
 * 今日の学習統計とストリーク
 */
export function getTodayStats(userState) {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = userState.dailyLog?.[today] ?? 0;

  // 連続学習日数（今日から遡る）
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const dateStr = d.toISOString().slice(0, 10);
    if ((userState.dailyLog?.[dateStr] ?? 0) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // 昨日時点のストリーク（今日未回答の場合に「危機」を表示するため）
  let prevStreak = 0;
  if (todayCount === 0) {
    const d2 = new Date();
    d2.setDate(d2.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const dateStr = d2.toISOString().slice(0, 10);
      if ((userState.dailyLog?.[dateStr] ?? 0) > 0) {
        prevStreak++;
        d2.setDate(d2.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return { todayCount, streak, prevStreak };
}

/**
 * 次回復習時間を人間が読みやすい文字列に変換
 */
export function formatInterval(nextReviewAt) {
  const ms = nextReviewAt - Date.now();
  if (ms <= 0) return 'すぐ';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}分後`;
  const hr = Math.round(ms / 3_600_000);
  if (hr < 24) return `${hr}時間後`;
  const days = Math.round(ms / 86_400_000);
  return `${days}日後`;
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

  const now = Date.now();

  for (const q of questions) {
    const qState = userState.questions[q.id];

    // カテゴリ別集計
    if (!categoryStats[q.category]) {
      categoryStats[q.category] = { total: 0, answered: 0, correct: 0, attempts: 0, due: 0 };
    }
    categoryStats[q.category].total++;

    if (qState && safeInt(qState.attempts) > 0) {
      answered++;
      totalAttempts += safeInt(qState.attempts);
      totalCorrect += safeInt(qState.correct);
      categoryStats[q.category].answered++;
      categoryStats[q.category].correct += safeInt(qState.correct);
      categoryStats[q.category].attempts += safeInt(qState.attempts);
      if (qState.nextReviewAt <= now) {
        categoryStats[q.category].due++;
      }
    }
  }

  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // カテゴリ別正答率（正答率昇順でソート）
  const categoryList = Object.entries(categoryStats)
    .map(([name, stat]) => ({
      name,
      total: stat.total,
      answered: stat.answered,
      due: stat.due,
      accuracy: stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null,
    }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));

  // 苦手問題数（正答率 < 60%）
  const weakCount = questions.filter(q => {
    const s = userState.questions[q.id];
    if (!s || safeInt(s.attempts) === 0) return false;
    return (safeInt(s.correct) / safeInt(s.attempts)) < 0.6;
  }).length;

  // SRS 復習待ち問題数（nextReviewAt が現在以前）
  const dueCount = questions.filter(q => {
    const s = userState.questions[q.id];
    return s && safeInt(s.attempts) > 0 && s.nextReviewAt <= now;
  }).length;

  // マスター済み問題数（直近5回が全て正解）
  const masteredCount = questions.filter(q => {
    const s = userState.questions[q.id];
    if (!s || safeInt(s.attempts) === 0) return false;
    const recent = s.recentResults ?? [];
    return recent.length >= 5 && recent.slice(-5).every(r => r === 1);
  }).length;

  // ブックマーク済み問題数
  const bookmarkCount = questions.filter(q => userState.questions[q.id]?.bookmarked).length;

  // よく間違える問題 Top5（3回以上回答・正答率 60% 未満）
  const worstQuestions = questions
    .filter(q => {
      const s = userState.questions[q.id];
      return s && safeInt(s.attempts) >= 3;
    })
    .map(q => {
      const s = userState.questions[q.id];
      const acc = Math.round((safeInt(s.correct) / safeInt(s.attempts)) * 100);
      return { id: q.id, text: q.question, category: q.category, accuracy: acc, attempts: safeInt(s.attempts) };
    })
    .filter(q => q.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // 過去7日の回答数（週間チャート用）
  const weeklyLog = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = i === 0 ? '今日' : `${d.getMonth() + 1}/${d.getDate()}`;
    weeklyLog.push({ date: dateStr, count: userState.dailyLog?.[dateStr] ?? 0, label });
  }

  // 過去35日のアクティビティ（カレンダーヒートマップ用）
  const calendarData = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    calendarData.push({ date: dateStr, count: userState.dailyLog?.[dateStr] ?? 0, isToday: i === 0 });
  }
  const activeDays = calendarData.filter(d => d.count > 0).length;

  // 予測スコア: 全問題のうち直近の回答が正解だった割合（未回答=不正解として換算）
  const lastCorrectCount = questions.filter(q => {
    const s = userState.questions[q.id];
    return s && (s.recentResults?.length ?? 0) > 0 && s.recentResults.at(-1) === 1;
  }).length;
  const predictedScore = total > 0 ? Math.round((lastCorrectCount / total) * 100) : 0;

  return {
    total,
    answered,
    unanswered: total - answered,
    totalAttempts,
    totalCorrect,
    accuracy,
    weakCount,
    dueCount,
    masteredCount,
    bookmarkCount,
    categoryList,
    weeklyLog,
    calendarData,
    activeDays,
    worstQuestions,
    predictedScore,
    lastCorrectCount,
  };
}

/**
 * 回答の正誤判定（単一・複数選択共通）
 * 選択した全インデックスが正解インデックスと完全一致する場合のみ正解
 * @param {number[]} selectedIndices - ユーザーが選択したインデックス配列
 * @param {number[]} correctAnswers  - 正解インデックス配列
 * @returns {boolean}
 */
export function isAnswerCorrect(selectedIndices, correctAnswers) {
  if (selectedIndices.length !== correctAnswers.length) return false;
  const selectedSet = new Set(selectedIndices);
  return correctAnswers.every(i => selectedSet.has(i));
}
