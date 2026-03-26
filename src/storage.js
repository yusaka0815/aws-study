/**
 * storage.js
 * localStorage管理・バックアップ/復元
 */

const STORAGE_KEY = 'aws-study-state-v1';
const STATE_VERSION = 1;

/**
 * 初期状態を生成
 */
export function createInitialState() {
  return {
    version: STATE_VERSION,
    currentExam: null,
    questions: {},
  };
}

/**
 * localStorage から状態を読み込む
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();

    const parsed = JSON.parse(raw);

    // バージョン確認（将来の移行用）
    if (!parsed || typeof parsed !== 'object') return createInitialState();
    if (parsed.version !== STATE_VERSION) return createInitialState();

    // 必須フィールドの保証
    return {
      version: parsed.version || STATE_VERSION,
      currentExam: parsed.currentExam || null,
      questions: parsed.questions || {},
    };
  } catch {
    return createInitialState();
  }
}

/**
 * localStorage に状態を保存
 */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * JSONファイルとしてバックアップをダウンロード
 */
export function exportBackup(state) {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const filename = `aws-study-backup-${dateStr}.json`;

  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * バックアップJSONを検証してインポート
 * 成功時: インポートされた state を返す
 * 失敗時: Error をスロー
 */
export function importBackup(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('JSONの解析に失敗しました。ファイルが壊れている可能性があります。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('無効なバックアップファイルです。');
  }
  if (parsed.version !== STATE_VERSION) {
    throw new Error(`バージョンが一致しません（期待: ${STATE_VERSION}、実際: ${parsed.version}）。`);
  }
  if (typeof parsed.questions !== 'object') {
    throw new Error('問題データの形式が不正です。');
  }

  // 安全な状態オブジェクトを構築（XSS対策：そのまま使わない）
  const safeState = {
    version: STATE_VERSION,
    currentExam: typeof parsed.currentExam === 'string' ? parsed.currentExam : null,
    questions: {},
  };

  for (const [qId, qData] of Object.entries(parsed.questions)) {
    if (typeof qId !== 'string' || !qData || typeof qData !== 'object') continue;

    safeState.questions[qId] = {
      attempts: Number(qData.attempts) || 0,
      correct: Number(qData.correct) || 0,
      wrong: Number(qData.wrong) || 0,
      recentResults: Array.isArray(qData.recentResults)
        ? qData.recentResults.filter(r => r === 0 || r === 1).slice(-10)
        : [],
      lastAnsweredAt: Number(qData.lastAnsweredAt) || 0,
      nextReviewAt: Number(qData.nextReviewAt) || 0,
    };
  }

  return safeState;
}

/**
 * 全データをリセット（確認済みの場合のみ呼ぶ）
 */
export function resetState() {
  const fresh = createInitialState();
  saveState(fresh);
  return fresh;
}
