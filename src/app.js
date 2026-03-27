/**
 * app.js
 * アプリケーションメインコントローラー
 *
 * リファクタリング指針:
 * - イベントリスナーは責務ごとに setupStudyListeners / setupNavigationListeners / setupSettingsListeners に分割
 * - データ読み込みは loadExamData() として独立させテスト可能にする
 * - appState は実行時のみ存在するミュータブルな状態オブジェクト
 */

import { getNextQuestion, updateQuestionState, getStats } from './engine.js';
import { loadState, saveState, exportBackup, importBackup, resetState } from './storage.js';
import {
  showScreen, renderExamSelect, renderQuestion, renderResult,
  toggleExplanation, renderStats, showToast,
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
  },
  {
    examCode: 'AIF',
    examName: 'AWS Certified AI Practitioner',
    file: 'data/aif.json',
  },
  {
    examCode: 'SAA',
    examName: 'AWS Certified Solutions Architect - Associate',
    file: 'data/saa.json',
  },
  {
    examCode: 'MLA',
    examName: 'AWS Certified Machine Learning Engineer - Associate',
    file: 'data/mla.json',
  },
  {
    examCode: 'DVA',
    examName: 'AWS Certified Developer - Associate',
    file: 'data/dva.json',
  },
  {
    examCode: 'SOA',
    examName: 'AWS Certified SysOps Administrator - Associate',
    file: 'data/soa.json',
  },
  {
    examCode: 'DEA',
    examName: 'AWS Certified Data Engineer - Associate',
    file: 'data/dea.json',
  },
  {
    examCode: 'SAP',
    examName: 'AWS Certified Solutions Architect - Professional',
    file: 'data/sap.json',
  },
  {
    examCode: 'DOP',
    examName: 'AWS Certified DevOps Engineer - Professional',
    file: 'data/dop.json',
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
  previousScreen: 'screen-select', // 設定/統計から戻る際の遷移先
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
};

// ============================================================
// Service Worker 登録・PWA自動更新
// ============================================================
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    // 新しいSWがインストール済みになったらすぐ有効化させる
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 新バージョン検出: SKIP_WAITINGを送りcontrollerchangeを誘発
          newWorker.postMessage('SKIP_WAITING');
        }
      });
    });

    // SWが切り替わったら localStorage を保持したままリロード
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } catch (e) {
    console.warn('SW registration failed:', e);
  }
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

  try {
    appState.currentExam = await loadExamData(examMeta);
    appState.userState.currentExam = examCode;
    appState.lastQuestionId = null;
    saveState(appState.userState);

    document.getElementById('header-exam-name').textContent = examMeta.examName;
    showNextQuestion();
    showScreen('screen-study');
  } catch (e) {
    showToast('問題データの読み込みに失敗しました', 'error');
    console.error(e);
  }
}

// ============================================================
// 出題
// ============================================================
function showNextQuestion() {
  const { currentExam, userState, lastQuestionId } = appState;
  if (!currentExam) return;

  const q = getNextQuestion(currentExam.questions, userState, lastQuestionId);
  if (!q) {
    showToast('問題がありません', 'error');
    return;
  }

  appState.currentQuestion = q;
  appState.answered = false;

  const answeredCount = Object.values(userState.questions)
    .filter(s => s.attempts > 0).length;

  renderQuestion(q, answeredCount, currentExam.questions.length);
}

// ============================================================
// 回答処理
// ============================================================
function handleAnswer(selectedIndex) {
  if (appState.answered || !appState.currentQuestion) return;

  appState.answered = true;
  appState.lastQuestionId = appState.currentQuestion.id;

  const isCorrect = appState.currentQuestion.answers.includes(selectedIndex);
  const now = Date.now();
  const prev = appState.userState.questions[appState.currentQuestion.id] ?? { attempts: 0 };

  appState.userState.questions[appState.currentQuestion.id] =
    updateQuestionState(prev, isCorrect, now);
  saveState(appState.userState);

  if (settings.sound) {
    if (isCorrect) playCorrectSound();
    else playWrongSound();
  }

  renderResult(appState.currentQuestion, selectedIndex, isCorrect);
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
  showScreen('screen-stats');
}

// ============================================================
// イベントリスナー（責務ごとに分割）
// ============================================================

/** 問題画面の学習操作（選択肢・解説・次へ） */
function setupStudyListeners() {
  document.getElementById('choices-list').addEventListener('click', e => {
    const btn = e.target.closest('.choice-btn');
    if (btn && !appState.answered) handleAnswer(Number(btn.dataset.index));
  });

  document.getElementById('explanation-toggle').addEventListener('click', () => {
    if (appState.currentQuestion) toggleExplanation(appState.currentQuestion.explanation);
  });

  document.getElementById('next-btn').addEventListener('click', () => {
    showNextQuestion();
    document.getElementById('screen-study').scrollTop = 0;
    window.scrollTo(0, 0);
  });
}

/** 画面間ナビゲーション（試験変更・統計・設定・戻る） */
function setupNavigationListeners() {
  document.getElementById('btn-change-exam').addEventListener('click', () => {
    renderExamSelect(EXAM_LIST, selectExam);
    showScreen('screen-select');
  });

  document.getElementById('btn-stats').addEventListener('click', () => {
    appState.previousScreen = 'screen-study';
    showStatsScreen();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    appState.previousScreen = 'screen-study';
    showScreen('screen-settings');
  });

  document.getElementById('stats-back-btn').addEventListener('click', () => {
    showScreen(appState.previousScreen ?? 'screen-study');
  });

  document.getElementById('settings-back-btn').addEventListener('click', () => {
    showScreen(appState.previousScreen ?? 'screen-select');
  });

  document.getElementById('btn-settings-from-select').addEventListener('click', () => {
    appState.previousScreen = 'screen-select';
    showScreen('screen-settings');
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
}

// ============================================================
// 初期化
// ============================================================
async function init() {
  await registerServiceWorker();
  appState.userState = loadState();
  setupStudyListeners();
  setupNavigationListeners();
  setupSettingsListeners();
  renderExamSelect(EXAM_LIST, selectExam);
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
