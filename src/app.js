/**
 * app.js
 * アプリケーションメインコントローラー
 *
 * リファクタリング指針:
 * - イベントリスナーは責務ごとに setupStudyListeners / setupNavigationListeners / setupSettingsListeners に分割
 * - データ読み込みは loadExamData() として独立させテスト可能にする
 * - appState は実行時のみ存在するミュータブルな状態オブジェクト
 */

import { getNextQuestion, updateQuestionState, getStats, isAnswerCorrect, getTodayStats, formatInterval } from './engine.js';
import { loadState, saveState, exportBackup, importBackup, resetState } from './storage.js';
import {
  showScreen, renderExamSelect, renderQuestion, renderResult,
  updateMultiSelectUI, toggleExplanation, renderStats, showToast,
} from './ui.js';
import { playCorrectSound, playWrongSound } from './audio.js';
import { requestWakeLock, releaseWakeLock } from './wake-lock.js';

// ============================================================
// 定数（変更頻度が高い設定を一か所で管理）
// 新しい試験を追加するにはここにエントリを追加するだけでよい
// ============================================================
export const EXAM_LIST = [
  {
    examCode: 'CLF',
    examName: 'AWS Certified Cloud Practitioner',
    file: 'data/clf.json',
    questionCount: 160,
  },
  {
    examCode: 'AIF',
    examName: 'AWS Certified AI Practitioner',
    file: 'data/aif.json',
    questionCount: 160,
  },
  {
    examCode: 'SAA',
    examName: 'AWS Certified Solutions Architect - Associate',
    file: 'data/saa.json',
    questionCount: 160,
  },
  {
    examCode: 'MLA',
    examName: 'AWS Certified Machine Learning Engineer - Associate',
    file: 'data/mla.json',
    questionCount: 160,
  },
  {
    examCode: 'DVA',
    examName: 'AWS Certified Developer - Associate',
    file: 'data/dva.json',
    questionCount: 160,
  },
  {
    examCode: 'SOA',
    examName: 'AWS Certified SysOps Administrator - Associate',
    file: 'data/soa.json',
    questionCount: 160,
  },
  {
    examCode: 'DEA',
    examName: 'AWS Certified Data Engineer - Associate',
    file: 'data/dea.json',
    questionCount: 160,
  },
  {
    examCode: 'SAP',
    examName: 'AWS Certified Solutions Architect - Professional',
    file: 'data/sap.json',
    questionCount: 160,
  },
  {
    examCode: 'DOP',
    examName: 'AWS Certified DevOps Engineer - Professional',
    file: 'data/dop.json',
    questionCount: 160,
  },
];

// ============================================================
// アプリ状態（実行時のみ存在するミュータブルな状態）
// ============================================================
const appState = {
  userState: null,          // localStorageから読み込んだデータ
  currentExam: null,        // { examCode, examName, questions[] }
  currentQuestion: null,    // 現在表示中の問題
  lastQuestionId: null,     // 直前に出題した問題ID（連続出題防止用）
  answered: false,          // 現在の問題に回答済みか
  pendingSelections: new Set(), // 複数選択問題の選択中インデックス
  shuffleMap: null,         // number[] | null: 表示位置→元インデックスのマッピング
  sessionAnswered: 0,       // 今セッションで回答した問題数
  sessionCorrect: 0,        // 今セッションで正解した問題数
  sessionStreak: 0,         // 今セッションで連続正解した問題数
  sessionStartTime: null,   // セッション開始タイムスタンプ
  questionStartTime: null,  // 問題表示開始タイムスタンプ（回答時間計測用）
  categoryFilter: null,     // string | null: カテゴリ絞り込みフィルター
  bookmarkMode: false,      // boolean: ブックマーク問題のみ出題
  reviewMode: false,        // boolean: SRS復習待ち問題のみ出題
  _autoNextTimer: null,     // タイマーID（自動次へ）
  _autoNextCancelled: false,// 手動でキャンセルしたか
  // 模擬試験モード
  examMode: false,
  examQuestions: [],        // 今回の試験問題（ランダム選択済み）
  examIndex: 0,             // 現在の問題インデックス
  examCorrect: 0,           // 正解数
  examWrong: [],            // 不正解問題リスト
  examTimerInterval: null,  // タイマーintervalID
  examTimeLeft: 0,          // 残り秒数
};

// ============================================================
// 設定（localStorage永続化）
// ============================================================
function loadSetting(key, defaultValue) {
  const v = localStorage.getItem(`aws-study-${key}`);
  if (v === null) return defaultValue;
  if (typeof defaultValue === 'boolean') return v === 'true';
  if (typeof defaultValue === 'number') return Number(v) || defaultValue;
  return v; // string
}

function saveSetting(key, value) {
  localStorage.setItem(`aws-study-${key}`, value);
}

const VALID_FONT_SIZES = ['small', 'medium', 'large'];
const VALID_DAILY_GOALS = [10, 20, 30, 50];

const settings = {
  sound: loadSetting('sound', false),
  wakeLock: loadSetting('wake-lock', false),
  weakOnly: loadSetting('weak-only', false),
  autoNext: loadSetting('auto-next', false),
  dailyGoal: (() => { const v = loadSetting('daily-goal', 30); return VALID_DAILY_GOALS.includes(v) ? v : 30; })(),
  fontSize: (() => { const v = loadSetting('font-size', 'medium'); return VALID_FONT_SIZES.includes(v) ? v : 'medium'; })(),
};

// 文字サイズを即時反映
document.documentElement.dataset.fontSize = settings.fontSize;

// ============================================================
// Service Worker 登録・PWA自動更新
// ============================================================
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    // 既にwaiting状態のSWがあれば即座に有効化
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    }

    // 新しいSWがインストール中になったら完了次第有効化
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage('SKIP_WAITING');
        }
      });
    });

    // SWが切り替わったら自動リロード（localStorageは保持）
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    // SWのactivateから更新通知が届いた場合もリロード
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'SW_UPDATED') {
        window.location.reload();
      }
    });
  } catch (e) {
    console.warn('SW registration failed:', e);
  }
}

// ============================================================
// 画面遷移（History API でブラウザバック対応）
// ============================================================

function navigateTo(screenId) {
  if (history.state?.screenId === screenId) {
    history.replaceState({ screenId }, '');
  } else {
    history.pushState({ screenId }, '');
  }
  showScreen(screenId);
}

// ============================================================
// データ読み込み（テスト可能な独立した関数として分離）
// ============================================================
export async function loadExamData(examMeta) {
  const resp = await fetch(examMeta.file);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${examMeta.file}`);
  const data = await resp.json();
  return {
    examCode: data.examCode,
    examName: data.examName,
    questions: data.questions,
  };
}

// ============================================================
// 試験選択
// ============================================================
async function selectExam(examCode) {
  const examMeta = EXAM_LIST.find(e => e.examCode === examCode);
  if (!examMeta) return;

  // セッションカウンターとフィルターをリセット
  appState.sessionAnswered = 0;
  appState.sessionCorrect = 0;
  appState.sessionStreak = 0;
  appState.sessionStartTime = Date.now();
  appState.categoryFilter = null;
  appState.bookmarkMode = false;
  appState.reviewMode = false;
  // 模擬試験モードをリセット
  if (appState.examMode) {
    appState.examMode = false;
    if (appState.examTimerInterval) {
      clearInterval(appState.examTimerInterval);
      appState.examTimerInterval = null;
    }
    document.getElementById('exam-mode-timer')?.classList.add('hidden');
  }
  updateSessionBadge();

  // 即座に画面遷移（ローディング感を排除）
  document.getElementById('header-exam-name').textContent = examMeta.examName;
  document.getElementById('question-text').textContent = '問題を読み込んでいます...';
  document.getElementById('choices-list').innerHTML = '';
  document.getElementById('answer-area').classList.add('hidden');
  document.getElementById('next-btn').disabled = true;
  navigateTo('screen-study');

  try {
    appState.currentExam = await loadExamData(examMeta);
    appState.userState.currentExam = examCode;
    appState.lastQuestionId = null;
    saveState(appState.userState);
    showNextQuestion();
  } catch (e) {
    console.error(e);
    showToast('読み込み失敗。接続を確認してホームに戻ります...', 'error');
    setTimeout(() => {
      renderHomeScreen();
      navigateTo('screen-select');
    }, 1800);
  }
}

// ============================================================
// 出題
// ============================================================
function showNextQuestion() {
  const { currentExam, userState, lastQuestionId } = appState;
  if (!currentExam) return;

  // 自動次へタイマーをキャンセル
  if (appState._autoNextTimer) {
    clearInterval(appState._autoNextTimer);
    appState._autoNextTimer = null;
  }

  appState.pendingSelections = new Set();

  // ===== 模擬試験モード =====
  if (appState.examMode) {
    if (appState.examIndex >= appState.examQuestions.length) {
      endExamMode(false);
      return;
    }
    const q = appState.examQuestions[appState.examIndex];
    appState.currentQuestion = q;
    appState.answered = false;
    const qNum = appState.examIndex + 1;
    const total = appState.examQuestions.length;
    const qState = userState.questions[q.id] ?? null;
    // バナーをすべて隠す
    document.getElementById('category-banner')?.classList.add('hidden');
    document.getElementById('bookmark-mode-banner')?.classList.add('hidden');
    document.getElementById('weak-only-banner')?.classList.add('hidden');
    document.getElementById('review-mode-banner')?.classList.add('hidden');
    appState.shuffleMap = renderQuestion(q, qNum - 1, total, false, qState, 0);
    appState.questionStartTime = Date.now();
    // プログレステキストを上書き（試験用）
    document.getElementById('progress-text').textContent = `問 ${qNum} / ${total}`;
    // 模擬試験ではスキップ不可
    document.getElementById('skip-btn-wrap')?.classList.add('hidden');
    return;
  }

  // ===== 通常学習モード =====
  // カテゴリフィルター
  let pool = currentExam.questions;
  if (appState.categoryFilter) {
    const filtered = pool.filter(q => q.category === appState.categoryFilter);
    pool = filtered.length > 0 ? filtered : pool; // 一致なしはフォールバック
  }

  // 苦手問題モード: 正答率 < 60% または未回答の問題に絞る
  let weakPoolCount = 0;
  if (settings.weakOnly) {
    const weak = pool.filter(q => {
      const s = userState.questions[q.id];
      if (!s || s.attempts === 0) return true; // 未回答は含める
      return (s.correct / s.attempts) < 0.6;
    });
    weakPoolCount = weak.length;
    pool = weak.length > 0 ? weak : pool; // 苦手問題ゼロなら現在のプールを維持
  }

  // ブックマークモード: ブックマーク済み問題のみ
  if (appState.bookmarkMode) {
    const bookmarked = pool.filter(q => userState.questions[q.id]?.bookmarked);
    pool = bookmarked.length > 0 ? bookmarked : pool;
  }

  // 復習モード: SRS復習待ち問題（nextReviewAt <= now）のみ
  if (appState.reviewMode) {
    const nowTs = Date.now();
    const due = pool.filter(q => {
      const s = userState.questions[q.id];
      return s && s.attempts > 0 && s.nextReviewAt <= nowTs;
    });
    pool = due.length > 0 ? due : pool;
  }

  // カテゴリバナーを更新
  const catBanner = document.getElementById('category-banner');
  const catBannerName = document.getElementById('category-banner-name');
  if (catBanner && catBannerName) {
    if (appState.categoryFilter) {
      const catTotal = currentExam.questions.filter(q => q.category === appState.categoryFilter).length;
      catBannerName.textContent = `${appState.categoryFilter} (${catTotal}問)`;
    } else {
      catBannerName.textContent = '';
    }
    catBanner.classList.toggle('hidden', !appState.categoryFilter);
  }

  // ブックマークモードバナーを更新
  document.getElementById('bookmark-mode-banner')?.classList.toggle('hidden', !appState.bookmarkMode);

  // 復習モードバナーを更新
  const revBanner = document.getElementById('review-mode-banner');
  const revCountEl = document.getElementById('review-mode-count');
  if (revBanner && revCountEl) {
    if (appState.reviewMode) {
      const nowTs = Date.now();
      const dueRemaining = currentExam.questions.filter(q => {
        const s = userState.questions[q.id];
        return s && s.attempts > 0 && s.nextReviewAt <= nowTs;
      }).length;
      if (dueRemaining === 0) {
        // 全復習完了: 自動解除
        appState.reviewMode = false;
        revBanner.classList.add('hidden');
        setTimeout(() => showToast('🎉 復習完了！次の問題へどうぞ', 'success'), 100);
      } else {
        revCountEl.textContent = `復習モード (${dueRemaining}問)`;
        revBanner.classList.remove('hidden');
      }
    } else {
      revBanner.classList.add('hidden');
    }
  }

  const q = getNextQuestion(pool, userState, lastQuestionId);
  if (!q) {
    showToast('問題がありません', 'error');
    return;
  }

  appState.currentQuestion = q;
  appState.answered = false;

  const answeredCount = currentExam.questions.filter(q => {
    const s = userState.questions[q.id];
    return s && s.attempts > 0;
  }).length;

  const qState = userState.questions[q.id] ?? null;
  const now = Date.now();
  const dueCount = pool.filter(pq => {
    const s = userState.questions[pq.id];
    return s && s.attempts > 0 && s.nextReviewAt <= now;
  }).length;
  appState.shuffleMap = renderQuestion(q, answeredCount, currentExam.questions.length, settings.weakOnly, qState, dueCount);
  appState.questionStartTime = Date.now();

  // 苦手モードバナーに問題数を追加表示
  if (settings.weakOnly && weakPoolCount > 0) {
    const wb = document.getElementById('weak-only-banner');
    if (wb) wb.textContent = `🎯 苦手問題モード (${weakPoolCount}問)`;
  }
}

// ============================================================
// 回答処理
// ============================================================
function handleAnswer(selectedIndices) {
  if (appState.answered || !appState.currentQuestion) return;

  appState.answered = true;
  appState.lastQuestionId = appState.currentQuestion.id;

  // 回答時間を計測
  const elapsedMs = appState.questionStartTime ? Date.now() - appState.questionStartTime : null;
  appState.questionStartTime = null;

  // シャッフルされた表示インデックスを元のインデックスに変換
  const originalIndices = appState.shuffleMap
    ? selectedIndices.map(i => appState.shuffleMap[i])
    : selectedIndices;
  const isCorrect = isAnswerCorrect(originalIndices, appState.currentQuestion.answers);

  // 模擬試験モード: 正解数とインデックスのみ追跡、SRS更新なし
  if (appState.examMode) {
    if (isCorrect) {
      appState.examCorrect++;
    } else {
      appState.examWrong.push(appState.currentQuestion);
    }
    appState.examIndex++;
    renderResult(appState.currentQuestion, selectedIndices, isCorrect, null, appState.shuffleMap, elapsedMs);
    setTimeout(() => {
      document.getElementById('answer-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    if (settings.sound) { isCorrect ? playCorrectSound() : playWrongSound(); }
    return;
  }

  appState.sessionAnswered++;
  if (isCorrect) {
    appState.sessionCorrect++;
    appState.sessionStreak++;
    const HOT_STREAKS = [5, 10, 15, 20];
    if (HOT_STREAKS.includes(appState.sessionStreak)) {
      setTimeout(() => showToast(`🔥 ${appState.sessionStreak}問連続正解！`, 'success'), 500);
    }
  } else {
    appState.sessionStreak = 0;
  }
  updateSessionBadge();
  const now = Date.now();
  const prev = appState.userState.questions[appState.currentQuestion.id] ?? { attempts: 0 };

  const updatedState = updateQuestionState(prev, isCorrect, now);
  // ブックマーク状態を保持（updateQuestionState は SRS フィールドのみ返す）
  if (prev.bookmarked) updatedState.bookmarked = true;
  appState.userState.questions[appState.currentQuestion.id] = updatedState;

  // マスター達成チェック（直近5回全正解の初達成時のみ通知）
  const wasMastered = prev.recentResults && prev.recentResults.length >= 5
    && prev.recentResults.slice(-5).every(r => r === 1);
  const isMastered = updatedState.recentResults.length >= 5
    && updatedState.recentResults.slice(-5).every(r => r === 1);
  if (!wasMastered && isMastered) {
    setTimeout(() => showToast('⭐ マスター達成！', 'success'), 600);
  }

  // デイリーログを更新
  const today = new Date().toISOString().slice(0, 10);
  appState.userState.dailyLog = appState.userState.dailyLog ?? {};
  const prevCount = appState.userState.dailyLog[today] ?? 0;
  appState.userState.dailyLog[today] = prevCount + 1;
  if (isCorrect) {
    appState.userState.dailyCorrectLog = appState.userState.dailyCorrectLog ?? {};
    appState.userState.dailyCorrectLog[today] = (appState.userState.dailyCorrectLog[today] ?? 0) + 1;
  }

  // 今日の目標達成トースト（目標数に達したタイミングで表示）
  if (prevCount + 1 === settings.dailyGoal) {
    setTimeout(() => showToast(`🎉 今日の目標 ${settings.dailyGoal}問 達成！`, 'success'), 300);
  }

  // 通算マイルストーン（全日合計）
  const totalEver = Object.values(appState.userState.dailyLog).reduce((s, n) => s + n, 0);
  const MILESTONES = [10, 50, 100, 300, 500, 1000, 2000, 5000];
  if (MILESTONES.includes(totalEver)) {
    setTimeout(() => showToast(`🎊 通算 ${totalEver} 問達成！`, 'success'), 400);
  }

  saveState(appState.userState);

  if (settings.sound) {
    if (isCorrect) playCorrectSound();
    else playWrongSound();
  }

  // バイブレーションフィードバック（対応デバイスのみ）
  if (navigator.vibrate) {
    navigator.vibrate(isCorrect ? 40 : [60, 30, 60]);
  }

  renderResult(appState.currentQuestion, selectedIndices, isCorrect, updatedState.nextReviewAt, appState.shuffleMap, elapsedMs);

  // 回答エリアへスムーズスクロール（問題文が長い場合に結果が見えるように）
  setTimeout(() => {
    document.getElementById('answer-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);

  // 自動次へ: 正解時のみ、1.5秒後に自動進行
  if (isCorrect && settings.autoNext) {
    const nextBtn = document.getElementById('next-btn');
    const AUTO_NEXT_MS = 1500;
    const start = Date.now();
    appState._autoNextTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.ceil((AUTO_NEXT_MS - elapsed) / 1000);
      if (nextBtn && !appState._autoNextCancelled) {
        nextBtn.textContent = `次の問題へ → (${remaining})`;
      }
      if (elapsed >= AUTO_NEXT_MS) {
        clearInterval(appState._autoNextTimer);
        if (!appState._autoNextCancelled) {
          showNextQuestion();
          document.querySelector('.study-content')?.scrollTo(0, 0);
          window.scrollTo(0, 0);
        }
      }
    }, 100);
    appState._autoNextCancelled = false;
  }
}

// ============================================================
// セッションバッジ（ヘッダー右上の今日の回答数表示）
// ============================================================
function updateSessionBadge() {
  const el = document.getElementById('session-badge');
  if (!el) return;
  if (appState.sessionAnswered === 0) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  const pct = Math.round((appState.sessionCorrect / appState.sessionAnswered) * 100);
  let timeStr = '';
  if (appState.sessionStartTime) {
    const elapsed = Math.floor((Date.now() - appState.sessionStartTime) / 60_000);
    if (elapsed > 0) timeStr = ` · ${elapsed}分`;
  }
  el.textContent = `${appState.sessionAnswered}問 ${pct}%${timeStr}`;
  el.classList.remove('hidden', 'badge-good', 'badge-mid', 'badge-bad');
  el.classList.add(pct >= 80 ? 'badge-good' : pct >= 60 ? 'badge-mid' : 'badge-bad');
}

// ============================================================
// 統計画面表示
// ============================================================
function showStatsScreen() {
  if (!appState.currentExam) {
    showToast('先に試験を選択してください', 'error');
    return;
  }
  const stats = getStats(appState.currentExam.questions, appState.userState);
  const { streak } = getTodayStats(appState.userState);
  renderStats(appState.currentExam.examCode, appState.currentExam.examName, { ...stats, streak }, (category) => {
    appState.categoryFilter = category;
    appState._triggerNextQuestion = true;
    showToast(`📂 ${category} モード`, 'info');
    history.back(); // 統計画面から問題画面に戻る
  });

  // 模擬試験履歴（現在の試験コードのみ絞り込み）
  const examCode = appState.currentExam.examCode;
  const examHistoryRecords = (appState.userState.examHistory ?? [])
    .filter(r => r.examCode === examCode)
    .slice(-10)  // 最新10件
    .reverse();  // 新しい順

  const historySection = document.getElementById('exam-history-section');
  const historyList = document.getElementById('exam-history-list');
  if (historySection && historyList) {
    if (examHistoryRecords.length > 0) {
      historySection.classList.remove('hidden');
      historyList.innerHTML = examHistoryRecords.map(r => {
        const d = new Date(r.date);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const cls = r.passed ? 'exam-hist-pass' : 'exam-hist-fail';
        const wrongStr = r.wrong != null ? ` ×${r.wrong}` : '';
        const verdict = r.passed ? '✓' : '✗';
        const timeUpStr = r.timeUp && r.answered != null && r.answered < r.total ? ` (${r.answered}問回答)` : '';
        return `<div class="exam-hist-item">
          <span class="exam-hist-date">${dateStr}</span>
          <span class="exam-hist-detail">${r.correct}/${r.total}問${wrongStr}${timeUpStr}</span>
          <span class="exam-hist-pct ${cls}">${verdict} ${r.pct}%</span>
        </div>`;
      }).join('');
    } else {
      historySection.classList.add('hidden');
    }
  }

  navigateTo('screen-stats');
}

// ============================================================
// 模擬試験モード
// ============================================================

function showExamModeModal() {
  if (!appState.currentExam) {
    showToast('先に試験を選択してください', 'error');
    return;
  }
  const overlay = document.getElementById('exam-modal-overlay');
  const content = document.getElementById('exam-modal-content');

  // 試験中: 継続 or 終了を選べるメニューを表示
  if (appState.examMode) {
    const answered = appState.examIndex;
    const total = appState.examQuestions.length;
    const min = Math.floor(appState.examTimeLeft / 60).toString().padStart(2, '0');
    const sec = (appState.examTimeLeft % 60).toString().padStart(2, '0');
    content.innerHTML = `
      <h3>📝 試験中 (問${answered}/${total})</h3>
      <p style="margin-bottom:8px;">残り時間: ${min}:${sec}</p>
      <div class="exam-modal-actions">
        <button class="btn-primary" id="exam-modal-resume">試験を続ける</button>
        <button class="btn-secondary" id="exam-modal-end" style="color:var(--danger);border-color:var(--danger);">終了して結果を見る</button>
      </div>
    `;
    overlay.classList.remove('hidden');
    document.getElementById('exam-modal-resume').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
    document.getElementById('exam-modal-end').addEventListener('click', () => {
      overlay.classList.add('hidden');
      endExamMode(false);
    });
    return;
  }

  let selectedCount = 20;
  const options = [10, 20, 30, 65];

  function renderStart() {
    const timeMins = selectedCount * 2;
    content.innerHTML = `
      <h3>📝 模擬試験モード</h3>
      <p>実際の試験を想定したランダム出題です。SRS記録は更新されません。</p>
      <div class="exam-modal-count-row">
        ${options.map(n => `<button class="exam-count-btn${n === selectedCount ? ' selected' : ''}" data-count="${n}">${n}問</button>`).join('')}
      </div>
      <p style="margin-bottom:8px;font-size:13px;">目安時間: ${timeMins}分　合格ライン: 72%</p>
      <div class="exam-modal-actions">
        <button class="btn-primary" id="exam-modal-start">開始する</button>
        <button class="btn-secondary" id="exam-modal-cancel" style="color:var(--text-secondary);background:transparent;border-color:var(--border);">キャンセル</button>
      </div>
    `;

    content.querySelectorAll('.exam-count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCount = Number(btn.dataset.count);
        renderStart();
      });
    });
    document.getElementById('exam-modal-start').addEventListener('click', () => {
      overlay.classList.add('hidden');
      startExamMode(selectedCount);
    });
    document.getElementById('exam-modal-cancel').addEventListener('click', () => {
      overlay.classList.add('hidden');
    });
  }

  renderStart();
  overlay.classList.remove('hidden');
}

function startExamMode(count) {
  const questions = appState.currentExam.questions;
  // ランダムシャッフルして最初のcountを使用
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  appState.examMode = true;
  appState.examQuestions = shuffled.slice(0, Math.min(count, shuffled.length));
  appState.examIndex = 0;
  appState.examCorrect = 0;
  appState.examWrong = [];
  appState.examTimeLeft = count * 2 * 60; // 2分/問
  appState._examTotalTime = appState.examTimeLeft;

  // セッションバッジを隠してタイマーとタイムバーを表示
  document.getElementById('session-badge').classList.add('hidden');
  const timerEl = document.getElementById('exam-mode-timer');
  timerEl.classList.remove('hidden');
  const timeBarEl = document.getElementById('exam-time-bar');
  if (timeBarEl) { timeBarEl.classList.remove('hidden'); timeBarEl.style.width = '100%'; }

  appState.examTimerInterval = setInterval(() => {
    appState.examTimeLeft--;
    updateExamTimer();
    if (appState.examTimeLeft <= 0) {
      endExamMode(true); // 時間切れ
    }
  }, 1000);

  updateExamTimer();
  showToast(`📝 模擬試験開始！ ${appState.examQuestions.length}問`, 'info');
  showNextQuestion();
}

function updateExamTimer() {
  const timerEl = document.getElementById('exam-mode-timer');
  if (!timerEl) return;
  const left = Math.max(0, appState.examTimeLeft);
  const min = Math.floor(left / 60).toString().padStart(2, '0');
  const sec = (left % 60).toString().padStart(2, '0');
  timerEl.textContent = `⏱ ${min}:${sec}`;
  const isUrgent = left <= 60;
  timerEl.classList.toggle('urgent', isUrgent);
  // タイムバー更新
  const timeBarEl = document.getElementById('exam-time-bar');
  if (timeBarEl && appState._examTotalTime > 0) {
    const pct = Math.round((left / appState._examTotalTime) * 100);
    timeBarEl.style.width = `${pct}%`;
    timeBarEl.classList.toggle('urgent', isUrgent);
  }
}

function endExamMode(timeUp = false) {
  if (!appState.examMode) return;
  appState.examMode = false;

  if (appState.examTimerInterval) {
    clearInterval(appState.examTimerInterval);
    appState.examTimerInterval = null;
  }

  // タイマー・タイムバー非表示・バッジ復元
  document.getElementById('exam-mode-timer').classList.add('hidden');
  document.getElementById('exam-time-bar')?.classList.add('hidden');
  updateSessionBadge();

  const total = appState.examQuestions.length;
  const correct = appState.examCorrect;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const passed = pct >= 72;

  // 試験履歴を保存（total は試験全問数で統一、pct も同じベースで計算済み）
  if (!timeUp || appState.examIndex > 0) {
    appState.userState.examHistory = appState.userState.examHistory ?? [];
    appState.userState.examHistory.push({
      date: new Date().toISOString(),
      examCode: appState.currentExam?.examCode ?? '?',
      total,  // 試験全問数（pct の分母と一致させる）
      answered: appState.examIndex, // 実際に回答した問題数（timeUp 時は total 未満）
      correct,
      wrong: appState.examWrong.length,
      pct,
      passed,
      timeUp,
    });
    // 最新50件まで保持
    if (appState.userState.examHistory.length > 50) {
      appState.userState.examHistory = appState.userState.examHistory.slice(-50);
    }
    saveState(appState.userState);
  }

  const overlay = document.getElementById('exam-modal-overlay');
  const content = document.getElementById('exam-modal-content');
  const wrongCount = appState.examWrong.length;
  const wrongBtn = wrongCount > 0
    ? `<button class="btn-secondary" id="exam-result-retry">× 間違えた ${wrongCount} 問を再挑戦</button>`
    : '';

  // カテゴリ別正誤集計（回答済みのみ）
  const wrongIds = new Set(appState.examWrong.map(q => q.id));
  const catStats = {};
  for (let i = 0; i < appState.examIndex; i++) {
    const q = appState.examQuestions[i];
    if (!catStats[q.category]) catStats[q.category] = { correct: 0, wrong: 0 };
    if (wrongIds.has(q.id)) catStats[q.category].wrong++;
    else catStats[q.category].correct++;
  }
  const catRows = Object.entries(catStats)
    .map(([name, s]) => ({ name, correct: s.correct, total: s.correct + s.wrong, pct: Math.round(s.correct / (s.correct + s.wrong) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .map(c => `<div class="exam-cat-row">
      <span class="exam-cat-name">${c.name}</span>
      <span class="exam-cat-pct ${c.pct >= 72 ? 'acc-good' : 'acc-bad'}">${c.correct}/${c.total}　${c.pct}%</span>
    </div>`).join('');
  const catSection = catRows
    ? `<div class="exam-cat-breakdown">${catRows}</div>`
    : '';

  content.innerHTML = `
    <h3>📝 試験結果</h3>
    ${timeUp ? '<p style="color:var(--danger);font-weight:700;">⏰ 時間切れ</p>' : ''}
    <div class="exam-modal-result">
      <div class="exam-result-score ${passed ? 'pass' : 'fail'}">${pct}%</div>
      <div class="exam-result-verdict ${passed ? 'pass' : 'fail'}">${passed ? '✓ 合格ライン達成' : '✗ 不合格'}</div>
      <div class="exam-result-detail">${correct} / ${total} 問正解　合格ライン: 72%</div>
    </div>
    ${catSection}
    <div class="exam-modal-actions">
      <button class="btn-primary" id="exam-result-close">学習を続ける</button>
      ${wrongBtn}
    </div>
  `;
  overlay.classList.remove('hidden');
  document.getElementById('exam-result-close').addEventListener('click', () => {
    overlay.classList.add('hidden');
    showNextQuestion(); // 通常学習に戻る
  });
  document.getElementById('exam-result-retry')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    // 不正解問題でミニ試験を再開
    const wrongQs = appState.examWrong;
    appState.examMode = true;
    appState.examQuestions = wrongQs;
    appState.examIndex = 0;
    appState.examCorrect = 0;
    appState.examWrong = [];
    appState.examTimeLeft = wrongQs.length * 2 * 60;
    document.getElementById('session-badge').classList.add('hidden');
    document.getElementById('exam-mode-timer').classList.remove('hidden');
    appState.examTimerInterval = setInterval(() => {
      appState.examTimeLeft--;
      updateExamTimer();
      if (appState.examTimeLeft <= 0) endExamMode(true);
    }, 1000);
    updateExamTimer();
    showToast(`📝 復習試験開始！ ${wrongQs.length}問`, 'info');
    showNextQuestion();
  });
}

// ============================================================
// イベントリスナー（責務ごとに分割）
// ============================================================

/** 問題画面の学習操作（選択肢・解説・次へ） */
function setupStudyListeners() {
  document.getElementById('choices-list').addEventListener('click', e => {
    const btn = e.target.closest('.choice-btn');
    if (!btn || appState.answered) return;
    const idx = Number(btn.dataset.index);

    if (appState.currentQuestion?.answers.length > 1) {
      // 複数選択: トグル選択
      if (appState.pendingSelections.has(idx)) {
        appState.pendingSelections.delete(idx);
        btn.classList.remove('pending-selected');
      } else {
        appState.pendingSelections.add(idx);
        btn.classList.add('pending-selected');
      }
      const sel = appState.pendingSelections.size;
      const req = appState.currentQuestion.answers.length;
      updateMultiSelectUI(sel, req);
      const nextBtn = document.getElementById('next-btn');
      nextBtn.disabled = sel === 0;
      nextBtn.textContent = sel > 0 ? `回答を提出する (${sel}/${req}) →` : '次の問題へ →';
    } else {
      // 単一選択: 即回答
      handleAnswer([idx]);
    }
  });

  document.getElementById('btn-skip').addEventListener('click', () => {
    // わからない: 空の選択で回答 = 不正解扱い・正解を即表示（通常モードのみ）
    if (appState.answered || appState.examMode) return;
    handleAnswer([]);
  });

  document.getElementById('explanation-toggle').addEventListener('click', () => {
    if (appState.currentQuestion) toggleExplanation(appState.currentQuestion.explanation);
  });

  document.getElementById('btn-bookmark').addEventListener('click', () => {
    if (!appState.currentQuestion) return;
    const id = appState.currentQuestion.id;
    const qState = appState.userState.questions[id] ?? { attempts: 0 };
    qState.bookmarked = !qState.bookmarked;
    appState.userState.questions[id] = qState;
    saveState(appState.userState);
    const btn = document.getElementById('btn-bookmark');
    btn.textContent = qState.bookmarked ? '★' : '☆';
    btn.classList.toggle('bookmarked', qState.bookmarked);
    showToast(qState.bookmarked ? 'ブックマークしました' : 'ブックマーク解除', 'info');
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    // 複数選択問題・未回答: 次へボタンが提出ボタンを兼ねる
    if (!appState.answered && appState.currentQuestion?.answers.length > 1) {
      if (appState.pendingSelections.size > 0) {
        handleAnswer([...appState.pendingSelections]);
      }
      return;
    }
    // 回答済み（または単一選択回答後）: 次の問題へ
    if (!appState.answered) return;
    // 自動次へタイマーをキャンセルして即進行
    appState._autoNextCancelled = true;
    showNextQuestion();
    // study-content が独自スクロールコンテナになったので両方リセット
    document.querySelector('.study-content')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
}

/** 画面間ナビゲーション（試験変更・統計・設定・戻る） */
function setupNavigationListeners() {
  document.getElementById('btn-exam-mode').addEventListener('click', showExamModeModal);

  // 模擬試験モーダルの背景クリックで閉じる（試験中でない場合）
  document.getElementById('exam-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && !appState.examMode) {
      e.currentTarget.classList.add('hidden');
    }
  });

  document.getElementById('btn-change-exam').addEventListener('click', () => {
    renderHomeScreen();
    navigateTo('screen-select');
  });

  document.getElementById('btn-stats').addEventListener('click', showStatsScreen);

  document.getElementById('btn-settings').addEventListener('click', () => {
    navigateTo('screen-settings');
  });

  document.getElementById('stats-back-btn').addEventListener('click', () => history.back());

  document.getElementById('btn-reset-exam').addEventListener('click', () => {
    const code = appState.currentExam?.examCode;
    if (!code) return;
    if (!confirm(`${code} の全回答履歴・模擬試験履歴を削除します。\nこの操作は取り消せません。よろしいですか？`)) return;
    const prefix = `${code}-`;
    for (const key of Object.keys(appState.userState.questions)) {
      if (key.startsWith(prefix)) delete appState.userState.questions[key];
    }
    appState.userState.examHistory = (appState.userState.examHistory ?? []).filter(r => r.examCode !== code);
    saveState(appState.userState);
    showToast(`${code} をリセットしました`, 'success');
    showStatsScreen(); // 統計画面を再描画
  });

  document.getElementById('btn-resume-study').addEventListener('click', () => {
    history.back(); // 統計画面から問題画面に戻る
  });

  document.getElementById('btn-drill-weak').addEventListener('click', () => {
    settings.weakOnly = true;
    saveSetting('weak-only', true);
    document.getElementById('toggle-weak-only').checked = true;
    appState.bookmarkMode = false;
    showToast('苦手問題モード ON', 'info');
    appState._triggerNextQuestion = true;
    history.back(); // 統計画面から問題画面に戻る
  });

  document.getElementById('btn-drill-bookmark').addEventListener('click', () => {
    appState.bookmarkMode = true;
    showToast('★ ブックマークモード ON', 'info');
    appState._triggerNextQuestion = true;
    history.back(); // 統計画面から問題画面に戻る
  });

  document.getElementById('settings-back-btn').addEventListener('click', () => history.back());

  document.getElementById('btn-settings-from-select').addEventListener('click', () => {
    navigateTo('screen-settings');
  });

  // クイック再開ボタン
  document.getElementById('select-resume').addEventListener('click', e => {
    const code = e.currentTarget.dataset.exam;
    if (code) selectExam(code);
  });

  // カテゴリフィルター解除ボタン
  document.getElementById('btn-clear-category').addEventListener('click', () => {
    appState.categoryFilter = null;
    showToast('カテゴリフィルター解除', 'info');
    showNextQuestion();
  });

  // 復習モード解除ボタン
  document.getElementById('btn-clear-review').addEventListener('click', () => {
    appState.reviewMode = false;
    showToast('復習モード解除', 'info');
    showNextQuestion();
  });

  // 復習待ちドリルボタン（統計画面から）
  document.getElementById('btn-drill-due').addEventListener('click', () => {
    appState.reviewMode = true;
    appState._triggerNextQuestion = true;
    showToast('📋 復習モード ON', 'info');
    history.back();
  });

  // ロゴタップ → ホーム画面
  document.querySelectorAll('.app-logo').forEach(el => {
    el.addEventListener('click', () => {
      renderHomeScreen();
      navigateTo('screen-select');
    });
  });

  // ブラウザバック（スワイプ・ハードウェアバック）対応
  window.addEventListener('popstate', e => {
    const screenId = e.state?.screenId ?? 'screen-select';
    showScreen(screenId);
    if (screenId === 'screen-select') {
      // 試験選択画面に戻る際は進捗バッジを最新状態に更新
      renderHomeScreen();
    } else if (screenId === 'screen-study' && appState.currentExam && appState._triggerNextQuestion) {
      // カテゴリ絞り込みなどで次の問題を即座に出題
      appState._triggerNextQuestion = false;
      showNextQuestion();
    }
  });
}

/** 設定画面の操作（バックアップ・インポート・リセット・トグル） */
function setupSettingsListeners() {
  // スリープ防止トグル
  const toggleWakeLock = document.getElementById('toggle-wake-lock');
  toggleWakeLock.checked = settings.wakeLock;
  toggleWakeLock.addEventListener('change', async () => {
    settings.wakeLock = toggleWakeLock.checked;
    saveSetting('wake-lock', settings.wakeLock);
    if (settings.wakeLock) {
      await requestWakeLock();
    } else {
      await releaseWakeLock();
    }
  });

  // 効果音トグル
  const toggleSound = document.getElementById('toggle-sound');
  toggleSound.checked = settings.sound;
  toggleSound.addEventListener('change', () => {
    settings.sound = toggleSound.checked;
    saveSetting('sound', settings.sound);
  });

  // 苦手問題モードトグル
  const toggleWeakOnly = document.getElementById('toggle-weak-only');
  toggleWeakOnly.checked = settings.weakOnly;
  toggleWeakOnly.addEventListener('change', () => {
    settings.weakOnly = toggleWeakOnly.checked;
    saveSetting('weak-only', settings.weakOnly);
    const msg = settings.weakOnly ? '苦手問題モード ON' : '苦手問題モード OFF';
    showToast(msg, 'info');
  });

  // 自動次へトグル
  const toggleAutoNext = document.getElementById('toggle-auto-next');
  toggleAutoNext.checked = settings.autoNext;
  toggleAutoNext.addEventListener('change', () => {
    settings.autoNext = toggleAutoNext.checked;
    saveSetting('auto-next', settings.autoNext);
    showToast(settings.autoNext ? '自動次へ ON' : '自動次へ OFF', 'info');
  });

  // 1日の目標問題数セグメント
  function setupSeg(containerId, currentVal, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.seg-btn').forEach(btn => {
      if (btn.dataset.val === String(currentVal)) btn.classList.add('active');
      btn.addEventListener('click', () => {
        container.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.val);
      });
    });
  }

  setupSeg('seg-daily-goal', settings.dailyGoal, val => {
    settings.dailyGoal = Number(val);
    saveSetting('daily-goal', val);
    showToast(`目標: ${val}問/日`, 'info');
  });

  setupSeg('seg-font-size', settings.fontSize, val => {
    settings.fontSize = val;
    saveSetting('font-size', val);
    document.documentElement.dataset.fontSize = val;
    showToast('文字サイズを変更しました', 'info');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    exportBackup(appState.userState);
    showToast('バックアップをダウンロードしました', 'success');
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const newState = importBackup(text);
      if (!confirm('現在の学習データをバックアップで上書きします。よろしいですか？')) return;
      appState.userState = newState;
      saveState(newState);
      showToast('インポートが完了しました', 'success');
    } catch (err) {
      showToast(`インポート失敗: ${err.message}`, 'error');
    }
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('全ての学習履歴を削除します。この操作は取り消せません。\n本当にリセットしますか？')) return;
    appState.userState = resetState();
    showToast('学習データをリセットしました', 'success');
  });

  document.getElementById('btn-force-update').addEventListener('click', async () => {
    if (!confirm('アプリを強制更新します。\nキャッシュをクリアして最新版を再読み込みします。')) return;
    try {
      // Service Worker を全解除
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      // キャッシュを全削除
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  });
}

/** キーボードショートカット（デスクトップ・スタディ画面のみ有効） */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', e => {
    // 入力欄フォーカス中は無効
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    // 問題画面以外は無効
    if (!document.getElementById('screen-study').classList.contains('active')) return;

    const key = e.key;

    // 1〜5: 選択肢を選ぶ / トグル
    if (/^[1-5]$/.test(key)) {
      const idx = Number(key) - 1;
      const btn = document.querySelector(`#choices-list .choice-btn[data-index="${idx}"]`);
      if (btn && !appState.answered) btn.click();
      return;
    }

    // Enter / Space: 次へボタンを押す
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      const nextBtn = document.getElementById('next-btn');
      if (!nextBtn.disabled) nextBtn.click();
      return;
    }

    // E: 解説のトグル（回答済みの場合のみ）
    if ((key === 'e' || key === 'E') && appState.answered) {
      const toggleBtn = document.getElementById('explanation-toggle');
      if (!toggleBtn.classList.contains('hidden')) toggleBtn.click();
      return;
    }

    // S: 統計画面を開く
    if (key === 's' || key === 'S') {
      showStatsScreen();
      return;
    }

    // B: ブックマークトグル
    if (key === 'b' || key === 'B') {
      document.getElementById('btn-bookmark')?.click();
      return;
    }

    // M: 模擬試験モーダルを開く
    if (key === 'm' || key === 'M') {
      document.getElementById('btn-exam-mode')?.click();
      return;
    }

    // R: 復習モード（SRS復習待ちのみ）のON/OFF
    if (key === 'r' || key === 'R') {
      if (!appState.currentExam) return;
      appState.reviewMode = !appState.reviewMode;
      if (appState.reviewMode) {
        const nowTs = Date.now();
        const dueCount = appState.currentExam.questions.filter(q => {
          const s = appState.userState.questions[q.id];
          return s && s.attempts > 0 && s.nextReviewAt <= nowTs;
        }).length;
        if (dueCount === 0) {
          appState.reviewMode = false;
          showToast('復習待ち問題はありません', 'info');
          return;
        }
        showToast(`📋 復習モード ON (${dueCount}問)`, 'info');
      } else {
        showToast('復習モード OFF', 'info');
      }
      showNextQuestion();
      return;
    }

    // Escape: アクティブなフィルター・モードを全解除
    if (key === 'Escape') {
      const hasFilter = appState.categoryFilter || appState.reviewMode || appState.bookmarkMode;
      if (hasFilter) {
        appState.categoryFilter = null;
        appState.reviewMode = false;
        appState.bookmarkMode = false;
        showToast('フィルター解除', 'info');
        showNextQuestion();
      }
    }
  });
}

// ============================================================
// スワイプジェスチャー（モバイル）
// ============================================================
function setupSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;

  const studyContent = document.querySelector('.study-content');
  if (!studyContent) return;

  studyContent.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  studyContent.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // 横スワイプ（縦移動が横移動の半分未満）かつ一定距離以上
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    // 左スワイプ = 次の問題（回答済みのみ）
    if (dx < 0 && appState.answered) {
      appState._autoNextCancelled = true;
      showNextQuestion();
      studyContent.scrollTo(0, 0);
    }

    // 右スワイプ = ブックマークトグル（距離80px以上で誤操作防止）
    if (dx > 80 && appState.currentQuestion) {
      document.getElementById('btn-bookmark')?.click();
    }
  }, { passive: true });
}

// ============================================================
// 試験別進捗マップ（ホーム画面表示用）
// ============================================================
function buildProgressMap() {
  const counts = {};
  const attempts = {};
  const correct = {};
  const due = {};
  const lastStudied = {};
  const lastCorrect = {}; // 直近回答が正解の問題数（予測スコア用）
  const mastered = {};    // マスター済み問題数（直近5回全正解）
  const now = Date.now();
  for (const [id, state] of Object.entries(appState.userState?.questions ?? {})) {
    if (state.attempts > 0) {
      const prefix = id.split('-')[0];
      counts[prefix] = (counts[prefix] || 0) + 1;
      attempts[prefix] = (attempts[prefix] || 0) + state.attempts;
      correct[prefix] = (correct[prefix] || 0) + state.correct;
      if (state.nextReviewAt <= now) {
        due[prefix] = (due[prefix] || 0) + 1;
      }
      if (state.lastAnsweredAt > (lastStudied[prefix] || 0)) {
        lastStudied[prefix] = state.lastAnsweredAt;
      }
      // マスター判定（直近5回全正解）
      const recent = state.recentResults ?? [];
      if (recent.length >= 5 && recent.slice(-5).every(r => r === 1)) {
        mastered[prefix] = (mastered[prefix] || 0) + 1;
      }
    }
    // 直近回答の正誤（attempts=0の未回答問題も対象: 未回答=不正解として換算）
    if ((state.recentResults?.length ?? 0) > 0 && state.recentResults.at(-1) === 1) {
      const prefix = id.split('-')[0];
      lastCorrect[prefix] = (lastCorrect[prefix] || 0) + 1;
    }
  }
  const accuracyMap = {};
  for (const code of Object.keys(attempts)) {
    accuracyMap[code] = Math.round((correct[code] / attempts[code]) * 100);
  }
  // 予測スコア: 直近正解数 / 試験全問数
  const predictedMap = {};
  for (const exam of EXAM_LIST) {
    const lc = lastCorrect[exam.examCode] ?? 0;
    if (exam.questionCount > 0) {
      predictedMap[exam.examCode] = Math.round((lc / exam.questionCount) * 100);
    }
  }
  return { counts, accuracyMap, dueMap: due, lastStudied, predictedMap, masteredMap: mastered };
}

// ============================================================
// ホーム画面の描画（試験一覧 + 今日の統計）
// ============================================================
function renderHomeScreen() {
  const pm = buildProgressMap();
  const ts = getTodayStats(appState.userState);
  // userState.currentExam を使い、アプリ再起動後も「続きから」ボタンを表示する
  const currentCode = appState.currentExam?.examCode ?? appState.userState.currentExam ?? null;
  renderExamSelect(EXAM_LIST, selectExam, pm, ts, currentCode, settings.dailyGoal);
}

// ============================================================
// 初期化
// ============================================================
async function init() {
  history.replaceState({ screenId: 'screen-select' }, '');
  await registerServiceWorker();
  appState.userState = loadState();
  setupStudyListeners();
  setupNavigationListeners();
  setupSettingsListeners();
  setupKeyboardShortcuts();
  setupSwipeGestures();
  renderHomeScreen();
  showScreen('screen-select');

  // スリープ防止: 設定が有効なら起動時に取得、ページ再表示時に再取得
  if (settings.wakeLock) await requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.wakeLock) {
      requestWakeLock();
    }
  });
}

init();
