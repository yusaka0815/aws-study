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
  sessionAnswered: 0,       // 今セッションで回答した問題数
  sessionCorrect: 0,        // 今セッションで正解した問題数
};

// ============================================================
// 設定（localStorage永続化）
// ============================================================
function loadSetting(key, defaultValue) {
  const v = localStorage.getItem(`aws-study-${key}`);
  return v === null ? defaultValue : v === 'true';
}

function saveSetting(key, value) {
  localStorage.setItem(`aws-study-${key}`, value);
}

const settings = {
  sound: loadSetting('sound', false),
  wakeLock: loadSetting('wake-lock', false),
  weakOnly: loadSetting('weak-only', false),
};

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
  history.pushState({ screenId }, '');
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

  // セッションカウンターをリセット
  appState.sessionAnswered = 0;
  appState.sessionCorrect = 0;
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

  appState.pendingSelections = new Set();

  // 苦手問題モード: 正答率 < 60% または未回答の問題に絞る
  let pool = currentExam.questions;
  if (settings.weakOnly) {
    const weak = currentExam.questions.filter(q => {
      const s = userState.questions[q.id];
      if (!s || s.attempts === 0) return true; // 未回答は含める
      return (s.correct / s.attempts) < 0.6;
    });
    pool = weak.length > 0 ? weak : currentExam.questions; // 苦手問題ゼロなら全問
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
  renderQuestion(q, answeredCount, currentExam.questions.length, settings.weakOnly, qState, dueCount);
}

// ============================================================
// 回答処理
// ============================================================
function handleAnswer(selectedIndices) {
  if (appState.answered || !appState.currentQuestion) return;

  appState.answered = true;
  appState.lastQuestionId = appState.currentQuestion.id;

  const isCorrect = isAnswerCorrect(selectedIndices, appState.currentQuestion.answers);
  appState.sessionAnswered++;
  if (isCorrect) appState.sessionCorrect++;
  updateSessionBadge();
  const now = Date.now();
  const prev = appState.userState.questions[appState.currentQuestion.id] ?? { attempts: 0 };

  const updatedState = updateQuestionState(prev, isCorrect, now);
  appState.userState.questions[appState.currentQuestion.id] = updatedState;

  // デイリーログを更新
  const DAILY_GOAL = 30;
  const today = new Date().toISOString().slice(0, 10);
  appState.userState.dailyLog = appState.userState.dailyLog ?? {};
  const prevCount = appState.userState.dailyLog[today] ?? 0;
  appState.userState.dailyLog[today] = prevCount + 1;

  // 今日の目標達成トースト（ちょうど30問目に表示）
  if (prevCount + 1 === DAILY_GOAL) {
    setTimeout(() => showToast('🎉 今日の目標 30問 達成！', 'success'), 300);
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

  renderResult(appState.currentQuestion, selectedIndices, isCorrect, updatedState.nextReviewAt);

  // 回答エリアへスムーズスクロール（問題文が長い場合に結果が見えるように）
  setTimeout(() => {
    document.getElementById('answer-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
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
  el.textContent = `${appState.sessionAnswered}問 ${pct}%`;
  el.classList.remove('hidden');
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
  renderStats(appState.currentExam.examCode, appState.currentExam.examName, stats);
  navigateTo('screen-stats');
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
      updateMultiSelectUI(appState.pendingSelections.size, appState.currentQuestion.answers.length);
      // 1つ以上選択したら次へボタンを有効化
      document.getElementById('next-btn').disabled = appState.pendingSelections.size === 0;
    } else {
      // 単一選択: 即回答
      handleAnswer([idx]);
    }
  });

  document.getElementById('explanation-toggle').addEventListener('click', () => {
    if (appState.currentQuestion) toggleExplanation(appState.currentQuestion.explanation);
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
    showNextQuestion();
    document.getElementById('screen-study').scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

/** 画面間ナビゲーション（試験変更・統計・設定・戻る） */
function setupNavigationListeners() {
  document.getElementById('btn-change-exam').addEventListener('click', () => {
    renderHomeScreen();
    navigateTo('screen-select');
  });

  document.getElementById('btn-stats').addEventListener('click', showStatsScreen);

  document.getElementById('btn-settings').addEventListener('click', () => {
    navigateTo('screen-settings');
  });

  document.getElementById('stats-back-btn').addEventListener('click', () => history.back());

  document.getElementById('btn-resume-study').addEventListener('click', () => {
    history.back(); // 統計画面から問題画面に戻る
  });

  document.getElementById('btn-drill-weak').addEventListener('click', () => {
    settings.weakOnly = true;
    saveSetting('weak-only', true);
    document.getElementById('toggle-weak-only').checked = true;
    showToast('苦手問題モード ON', 'info');
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
    // 試験選択画面に戻る際は進捗バッジを最新状態に更新
    if (screenId === 'screen-select') {
      renderHomeScreen();
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
    }
  });
}

// ============================================================
// 試験別進捗マップ（ホーム画面表示用）
// ============================================================
function buildProgressMap() {
  const counts = {};
  const attempts = {};
  const correct = {};
  const due = {};
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
    }
  }
  const accuracyMap = {};
  for (const code of Object.keys(attempts)) {
    accuracyMap[code] = Math.round((correct[code] / attempts[code]) * 100);
  }
  return { counts, accuracyMap, dueMap: due };
}

// ============================================================
// ホーム画面の描画（試験一覧 + 今日の統計）
// ============================================================
function renderHomeScreen() {
  const pm = buildProgressMap();
  const ts = getTodayStats(appState.userState);
  const currentCode = appState.currentExam?.examCode ?? null;
  renderExamSelect(EXAM_LIST, selectExam, pm, ts, currentCode);
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
