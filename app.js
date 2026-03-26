/**
 * app.js
 * アプリケーションメインコントローラー
 */

import { getNextQuestion, updateQuestionState, getStats } from './engine.js';
import { loadState, saveState, exportBackup, importBackup, resetState } from './storage.js';
import {
  showScreen, renderExamSelect, renderQuestion, renderResult,
  toggleExplanation, renderStats, showToast
} from './ui.js';

// ============================================================
// 利用可能な試験一覧
// ============================================================
const EXAM_LIST = [
  { examCode: 'SAA', examName: 'AWS Certified Solutions Architect - Associate', file: 'data/saa.json' },
  { examCode: 'MLA', examName: 'AWS Certified Machine Learning Engineer - Associate', file: 'data/mla.json' },
];

// ============================================================
// アプリ状態
// ============================================================
let appState = {
  userState: null,      // localStorage のデータ
  currentExam: null,    // { examCode, examName, questions[] }
  currentQuestion: null,
  lastQuestionId: null,
  answered: false,
  questionsAnsweredToday: 0,
  previousScreen: 'screen-select', // 設定/統計から戻る先
};

// ============================================================
// 初期化
// ============================================================
async function init() {
  // Service Worker 登録
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // ユーザー状態をロード
  appState.userState = loadState();

  // イベントリスナーをセット
  setupEventListeners();

  // 前回の試験があれば試験選択画面を表示、なければ選択画面へ
  renderExamSelect(EXAM_LIST, selectExam);
  showScreen('screen-select');
}

// ============================================================
// 試験選択
// ============================================================
async function selectExam(examCode) {
  const examMeta = EXAM_LIST.find(e => e.examCode === examCode);
  if (!examMeta) return;

  try {
    const resp = await fetch(examMeta.file);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    appState.currentExam = {
      examCode: data.examCode,
      examName: data.examName,
      questions: data.questions,
    };

    appState.userState.currentExam = examCode;
    saveState(appState.userState);

    // ヘッダーに試験名を表示
    document.getElementById('header-exam-name').textContent = examMeta.examName;

    appState.lastQuestionId = null;
    appState.questionsAnsweredToday = 0;

    showNextQuestion();
    showScreen('screen-study');
  } catch (e) {
    showToast('問題データの読み込みに失敗しました', 'error');
    console.error(e);
  }
}

// ============================================================
// 出題ロジック
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

  // 解答済み数を進捗として使用
  const answeredCount = Object.values(userState.questions)
    .filter(s => s.attempts > 0).length;

  renderQuestion(q, answeredCount, currentExam.questions.length);
}

// ============================================================
// 回答処理
// ============================================================
function handleAnswer(selectedIndex) {
  if (appState.answered) return;

  const { currentQuestion, userState } = appState;
  if (!currentQuestion) return;

  appState.answered = true;
  appState.lastQuestionId = currentQuestion.id;

  const isCorrect = currentQuestion.answers.includes(selectedIndex);

  // 状態を更新
  const now = Date.now();
  const prevState = userState.questions[currentQuestion.id] || { attempts: 0 };
  userState.questions[currentQuestion.id] = updateQuestionState(prevState, isCorrect, now);
  saveState(userState);

  appState.questionsAnsweredToday++;

  renderResult(currentQuestion, selectedIndex, isCorrect);
}

// ============================================================
// イベントリスナー設定
// ============================================================
function setupEventListeners() {
  // 選択肢クリック（委譲）
  document.getElementById('choices-list').addEventListener('click', e => {
    const btn = e.target.closest('.choice-btn');
    if (!btn || appState.answered) return;
    handleAnswer(Number(btn.dataset.index));
  });

  // 解説トグル
  document.getElementById('explanation-toggle').addEventListener('click', () => {
    if (!appState.currentQuestion) return;
    toggleExplanation(appState.currentQuestion.explanation);
  });

  // 次へボタン
  document.getElementById('next-btn').addEventListener('click', () => {
    showNextQuestion();
    // 画面トップにスクロール
    document.getElementById('screen-study').scrollTop = 0;
    window.scrollTo(0, 0);
  });

  // 試験変更ボタン
  document.getElementById('btn-change-exam').addEventListener('click', () => {
    renderExamSelect(EXAM_LIST, selectExam);
    showScreen('screen-select');
  });

  // 統計ボタン
  document.getElementById('btn-stats').addEventListener('click', () => {
    appState.previousScreen = 'screen-study';
    showStatsScreen();
  });

  // 設定ボタン（学習画面から）
  document.getElementById('btn-settings').addEventListener('click', () => {
    appState.previousScreen = 'screen-study';
    showScreen('screen-settings');
  });

  // 統計画面の戻るボタン
  document.getElementById('stats-back-btn').addEventListener('click', () => {
    showScreen(appState.previousScreen || 'screen-study');
  });

  // 設定画面の戻るボタン
  document.getElementById('settings-back-btn').addEventListener('click', () => {
    showScreen(appState.previousScreen || 'screen-select');
  });

  // バックアップエクスポート
  document.getElementById('btn-export').addEventListener('click', () => {
    exportBackup(appState.userState);
    showToast('バックアップをダウンロードしました', 'success');
  });

  // バックアップインポート
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // リセット

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

  // データリセット
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('全ての学習履歴を削除します。この操作は取り消せません。\n本当にリセットしますか？')) return;
    appState.userState = resetState();
    showToast('学習データをリセットしました', 'success');
  });

  // 試験選択画面の設定ボタン
  document.getElementById('btn-settings-from-select').addEventListener('click', () => {
    appState.previousScreen = 'screen-select';
    showScreen('screen-settings');
  });
}

// ============================================================
// 統計画面
// ============================================================
function showStatsScreen() {
  const { currentExam, userState } = appState;
  if (!currentExam) {
    showToast('先に試験を選択してください', 'error');
    return;
  }

  const stats = getStats(currentExam.questions, userState);
  renderStats(currentExam.examCode, currentExam.examName, stats);
  showScreen('screen-stats');
}

// ============================================================
// 起動
// ============================================================
init();
