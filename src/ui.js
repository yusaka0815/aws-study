/**
 * ui.js
 * DOM操作・画面描画
 */

// ============================================================
// 画面切替
// ============================================================

export function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('active', el.id === screenId);
  });
}

// ============================================================
// 試験選択画面
// ============================================================

export function renderExamSelect(exams, onSelect, progressMap = {}, todayStats = null, currentExamCode = null) {
  const container = document.getElementById('exam-list');
  container.innerHTML = '';

  // progressMap は { counts, accuracyMap, dueMap } 形式を想定
  const counts = progressMap.counts ?? progressMap;
  const accuracyMap = progressMap.accuracyMap ?? {};
  const dueMap = progressMap.dueMap ?? {};

  // 復習待ち数が多い順 → 進捗あり順 → 未開始（元の順序）
  const sorted = [...exams].sort((a, b) => {
    const dueA = dueMap[a.examCode] ?? 0;
    const dueB = dueMap[b.examCode] ?? 0;
    if (dueB !== dueA) return dueB - dueA;
    const cntA = counts[a.examCode] ?? 0;
    const cntB = counts[b.examCode] ?? 0;
    return cntB - cntA;
  });

  sorted.forEach(exam => {
    const answered = counts[exam.examCode] ?? 0;
    const total = exam.questionCount ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;
    const accuracy = accuracyMap[exam.examCode] ?? null;
    const due = dueMap[exam.examCode] ?? 0;

    // 正答率に応じたカラークラス
    let accuracyClass = '';
    if (accuracy !== null) {
      accuracyClass = accuracy >= 80 ? 'acc-good' : accuracy >= 60 ? 'acc-mid' : 'acc-bad';
    }

    const dueBadge = due > 0
      ? `<span class="due-badge">復習 ${due}</span>`
      : '';

    const isActive = exam.examCode === currentExamCode;

    const btn = document.createElement('button');
    btn.className = `exam-card${isActive ? ' exam-card-active' : ''}`;
    btn.dataset.exam = exam.examCode;
    btn.innerHTML = `
      <div class="exam-card-main">
        <span class="exam-code">${exam.examCode}</span>
        <span class="exam-name">${exam.examName}</span>
      </div>
      <div class="exam-card-meta">
        ${answered > 0
          ? `<div class="exam-card-badges">${dueBadge}<span class="exam-progress">${pct}%カバー<span class="exam-accuracy ${accuracyClass}"> ${accuracy}%正解</span></span></div>`
          : `<div class="exam-card-badges">${dueBadge}<span class="exam-arrow">→</span></div>`}
        ${answered > 0
          ? `<div class="exam-progress-bar"><div class="exam-progress-fill" style="width:${pct}%"></div></div>`
          : ''}
      </div>
    `;
    btn.addEventListener('click', () => onSelect(exam.examCode));
    container.appendChild(btn);
  });

  // 全体進捗サマリー
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const statsEl = document.getElementById('select-stats');
  const goalEl = document.getElementById('select-today-goal');
  const DAILY_GOAL = 30;

  if (statsEl) {
    if (todayStats && (todayStats.todayCount > 0 || todayStats.streak > 0)) {
      const streakText = todayStats.streak > 1 ? ` 🔥 ${todayStats.streak}日連続` : '';
      const totalText = total > 0 ? `　累計 ${total} 問` : '';
      statsEl.innerHTML = `今日 <strong>${todayStats.todayCount}</strong> 問${streakText}${totalText}`;
    } else if (total > 0) {
      statsEl.textContent = `累計 ${total} 問回答済み`;
    } else {
      statsEl.textContent = 'さあ、学習を始めよう！';
    }
  }

  // 前回の続きから: クイックアクセスボタン
  const resumeEl = document.getElementById('select-resume');
  if (resumeEl) {
    if (currentExamCode && counts[currentExamCode] > 0) {
      resumeEl.textContent = `▶ ${currentExamCode} の続きから`;
      resumeEl.dataset.exam = currentExamCode;
      resumeEl.classList.remove('hidden');
    } else {
      resumeEl.classList.add('hidden');
    }
  }

  if (goalEl && todayStats) {
    const cnt = todayStats.todayCount;
    const pct = Math.min(100, Math.round((cnt / DAILY_GOAL) * 100));
    if (cnt > 0) {
      const goalMsg = cnt >= DAILY_GOAL ? '目標達成！' : `目標まで ${DAILY_GOAL - cnt} 問`;
      goalEl.innerHTML = `
        <div class="today-goal-bar-bg">
          <div class="today-goal-bar ${cnt >= DAILY_GOAL ? 'today-goal-done' : ''}" style="width:${pct}%"></div>
        </div>
        <span class="today-goal-text">${goalMsg}</span>
      `;
      goalEl.classList.remove('hidden');
    } else {
      goalEl.classList.add('hidden');
    }
  }
}

// ============================================================
// 問題画面
// ============================================================

/**
 * 問題を表示（回答前の状態）
 * @param {object} question
 * @param {number} questionIndex - 回答済み問題数
 * @param {number} totalQuestions
 * @param {boolean} weakOnly
 * @param {object|null} qState - この問題の過去の回答履歴
 * @param {number} dueCount - 今すぐ復習が必要な問題数
 */
export function renderQuestion(question, questionIndex, totalQuestions, weakOnly = false, qState = null, dueCount = 0) {
  // プログレスバー
  const pct = totalQuestions > 0 ? Math.round((questionIndex / totalQuestions) * 100) : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  const dueLabel = dueCount > 0 && !weakOnly ? ` (復習 ${dueCount})` : '';
  document.getElementById('progress-text').textContent = `${questionIndex} / ${totalQuestions}${dueLabel}`;

  // 苦手問題モードバナー
  const weakBanner = document.getElementById('weak-only-banner');
  if (weakBanner) weakBanner.classList.toggle('hidden', !weakOnly);

  // カテゴリ・難易度・問題タイプ・個人成績チップ
  const diffStars = '★'.repeat(question.difficulty) + '☆'.repeat(3 - question.difficulty);
  const typeTag = question.answers.length > 1
    ? `<span class="multi-badge">${question.answers.length}つ選択</span>`
    : '';

  let historyChip = '';
  if (qState && qState.attempts > 0) {
    const acc = Math.round((qState.correct / qState.attempts) * 100);
    const chipClass = acc >= 80 ? 'chip-good' : acc >= 60 ? 'chip-mid' : 'chip-bad';
    historyChip = `<span class="history-chip ${chipClass}">${qState.attempts}回 ${acc}%</span>`;
  }

  document.getElementById('question-meta').innerHTML =
    `<span>${question.category}  ${diffStars}</span>${typeTag}${historyChip}`;

  // 問題文
  document.getElementById('question-text').textContent = question.question;

  // 選択肢
  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const choicesEl = document.getElementById('choices-list');
  choicesEl.innerHTML = '';
  question.choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.index = idx;
    btn.innerHTML = `<span class="choice-label">${CHOICE_LABELS[idx] ?? idx + 1}</span><span class="choice-text">${choice}</span>`;
    choicesEl.appendChild(btn);
  });

  // 解説エリア・複数選択提出エリアを隠す・次へボタンをdisabledに
  document.getElementById('answer-area').classList.add('hidden');
  document.getElementById('next-btn').disabled = true;
  document.getElementById('explanation-toggle').classList.add('hidden');
  document.getElementById('explanation-text').classList.add('hidden');
  document.getElementById('multi-submit-area').classList.add('hidden');
  const nextReviewEl = document.getElementById('next-review');
  if (nextReviewEl) nextReviewEl.classList.add('hidden');
  const correctLabelsEl = document.getElementById('correct-labels');
  if (correctLabelsEl) correctLabelsEl.classList.add('hidden');

  // 複数選択問題の場合: ヒントと提出エリアを表示
  if (question.answers.length > 1) {
    document.getElementById('multi-count').textContent = '0';
    document.getElementById('multi-required').textContent = question.answers.length;
    document.getElementById('multi-submit-area').classList.remove('hidden');
  }

  // 問題カード・選択肢のアニメーションを再発動
  const card = document.querySelector('.question-card');
  card.classList.remove('entering');
  choicesEl.classList.remove('entering');
  void card.offsetHeight; // reflow を強制してアニメーションをリセット
  card.classList.add('entering');
  choicesEl.classList.add('entering');
}

/**
 * 回答後の結果を表示
 * @param {object} question
 * @param {number[]} selectedIndices - 選択したインデックスの配列（単一選択も配列で渡す）
 * @param {boolean} isCorrect
 * @param {number} [nextReviewAt] - 次回復習タイムスタンプ（ms）
 */
export function renderResult(question, selectedIndices, isCorrect, nextReviewAt) {
  const choicesEl = document.getElementById('choices-list');
  const buttons = choicesEl.querySelectorAll('.choice-btn');

  // 複数選択提出エリアを隠す
  document.getElementById('multi-submit-area').classList.add('hidden');

  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    btn.classList.remove('pending-selected');
    if (selectedIndices.includes(idx)) {
      btn.classList.add('selected');
    }
    if (question.answers.includes(idx)) {
      btn.classList.add('correct');
    } else if (selectedIndices.includes(idx)) {
      // 選択したが正解ではない選択肢を赤表示
      btn.classList.add('wrong');
    }
  });

  // 正誤バナー
  const answerArea = document.getElementById('answer-area');
  answerArea.classList.remove('hidden', 'result-correct', 'result-wrong');
  answerArea.classList.add(isCorrect ? 'result-correct' : 'result-wrong');

  const answerIcon = document.getElementById('answer-icon');
  const answerLabel = document.getElementById('answer-label');
  answerIcon.textContent = isCorrect ? '○' : '×';
  answerLabel.textContent = isCorrect ? '正解！' : '不正解';

  // 次回復習時間
  const nextReviewEl = document.getElementById('next-review');
  if (nextReviewEl && nextReviewAt != null) {
    const ms = nextReviewAt - Date.now();
    const label = ms <= 0 ? 'すぐ再出題' : (() => {
      const min = Math.round(ms / 60_000);
      if (min < 60) return `${min}分後に復習`;
      const hr = Math.round(ms / 3_600_000);
      if (hr < 24) return `${hr}時間後に復習`;
      return `${Math.round(ms / 86_400_000)}日後に復習`;
    })();
    nextReviewEl.textContent = label;
    nextReviewEl.classList.remove('hidden');
  }

  // 解説ボタンと次へボタンを表示・有効化
  document.getElementById('explanation-toggle').classList.remove('hidden');
  document.getElementById('next-btn').disabled = false;

  // 複数選択・不正解時: 正解の選択肢を明示
  const correctLabels = document.getElementById('correct-labels');
  if (correctLabels) {
    if (!isCorrect) {
      const LABELS = ['A', 'B', 'C', 'D', 'E'];
      const labelStr = question.answers.map(i => LABELS[i] ?? (i + 1)).join('・');
      correctLabels.textContent = `正解: ${labelStr}`;
      correctLabels.classList.remove('hidden');
    } else {
      correctLabels.classList.add('hidden');
    }
  }

  const expEl = document.getElementById('explanation-text');
  const toggleBtn = document.getElementById('explanation-toggle');

  if (!isCorrect) {
    // 不正解時：解説を自動展開
    expEl.textContent = question.explanation;
    expEl.classList.remove('hidden');
    toggleBtn.textContent = '▲ 解説を閉じる';
  } else {
    // 正解時：解説は折りたたんだ状態
    expEl.classList.add('hidden');
    toggleBtn.textContent = '▼ 解説を見る';
  }
}

/**
 * 複数選択: 選択数と提出ボタンの状態を更新
 * @param {number} selectedCount - 現在の選択数
 * @param {number} requiredCount - 必要選択数
 */
export function updateMultiSelectUI(selectedCount, requiredCount) {
  document.getElementById('multi-count').textContent = selectedCount;
  document.getElementById('multi-required').textContent = requiredCount;
  const area = document.getElementById('multi-submit-area');
  // 必要数ちょうど選択したとき「提出可能」スタイルを適用
  area?.classList.toggle('multi-ready', selectedCount === requiredCount);
}

/**
 * 解説の表示/非表示トグル
 */
export function toggleExplanation(explanation) {
  const expEl = document.getElementById('explanation-text');
  const btn = document.getElementById('explanation-toggle');
  const isHidden = expEl.classList.contains('hidden');

  expEl.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? '▲ 解説を閉じる' : '▼ 解説を見る';

  if (isHidden) {
    expEl.textContent = explanation;
    // 解説が表示されたら少しスクロール
    setTimeout(() => expEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
}

// ============================================================
// 統計画面
// ============================================================

export function renderStats(examCode, examName, stats, onDrillCategory = null) {
  const nameEl = document.getElementById('stats-exam-name');
  nameEl.innerHTML = `<span class="exam-code" data-exam-badge="${examCode}">${examCode}</span> ${examName}`;

  const coverage = stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0;

  const overview = document.getElementById('stats-overview');
  overview.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.accuracy}<span class="stat-unit">%</span></div>
      <div class="stat-label">正答率</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${coverage}<span class="stat-unit">%</span></div>
      <div class="stat-label">カバー率 (${stats.answered}/${stats.total})</div>
    </div>
    <div class="stat-card ${stats.dueCount > 0 ? 'stat-card-due' : ''}">
      <div class="stat-value">${stats.dueCount}</div>
      <div class="stat-label">復習待ち</div>
    </div>
    <div class="stat-card ${stats.weakCount > 0 ? 'stat-card-warn' : ''}">
      <div class="stat-value">${stats.weakCount}</div>
      <div class="stat-label">苦手問題数</div>
    </div>
    <div class="stat-card stat-card-master">
      <div class="stat-value">${stats.masteredCount}</div>
      <div class="stat-label">マスター済み</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalAttempts}</div>
      <div class="stat-label">総回答数</div>
    </div>
  `;

  // 週間チャート
  const weeklyEl = document.getElementById('weekly-chart');
  if (weeklyEl && stats.weeklyLog) {
    const maxCount = Math.max(...stats.weeklyLog.map(d => d.count), 1);
    weeklyEl.innerHTML = stats.weeklyLog.map(day => {
      const barH = Math.round((day.count / maxCount) * 100);
      const isToday = day.label === '今日';
      return `
        <div class="weekly-col">
          <div class="weekly-bar-wrap">
            <div class="weekly-bar ${isToday ? 'weekly-bar-today' : ''}" style="height:${barH}%"></div>
          </div>
          <div class="weekly-count">${day.count > 0 ? day.count : ''}</div>
          <div class="weekly-label ${isToday ? 'weekly-label-today' : ''}">${day.label}</div>
        </div>
      `;
    }).join('');
  }

  // 苦手問題ドリルボタン
  const drillBtn = document.getElementById('btn-drill-weak');
  if (drillBtn) {
    if (stats.weakCount > 0) {
      drillBtn.textContent = `苦手 ${stats.weakCount} 問を集中練習`;
      drillBtn.classList.remove('hidden');
    } else {
      drillBtn.classList.add('hidden');
    }
  }

  // よく間違える問題 Top5
  const worstEl = document.getElementById('worst-questions');
  if (worstEl) {
    if (stats.worstQuestions && stats.worstQuestions.length > 0) {
      worstEl.innerHTML = stats.worstQuestions.map(q => `
        <div class="worst-item">
          <div class="worst-meta">
            <span class="worst-category">${q.category}</span>
            <span class="worst-accuracy acc-bad">${q.accuracy}% (${q.attempts}回)</span>
          </div>
          <div class="worst-text">${q.text}</div>
        </div>
      `).join('');
      worstEl.previousElementSibling?.classList.remove('hidden');
    } else {
      worstEl.innerHTML = '';
      worstEl.previousElementSibling?.classList.add('hidden');
    }
  }

  // カテゴリ別
  const catList = document.getElementById('category-stats');
  catList.innerHTML = '';

  if (stats.categoryList.length === 0) {
    catList.innerHTML = '<p class="empty-msg">まだ回答データがありません</p>';
    return;
  }

  stats.categoryList.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-item';

    const accuracy = cat.accuracy !== null ? cat.accuracy : null;
    const barWidth = accuracy !== null ? accuracy : 0;
    const barClass = accuracy === null ? 'bar-neutral' : accuracy >= 80 ? 'bar-good' : accuracy >= 60 ? 'bar-mid' : 'bar-bad';
    const accuracyText = accuracy !== null ? `${accuracy}%` : '未回答';

    item.innerHTML = `
      <div class="cat-header">
        <span class="cat-name">${cat.name}</span>
        <span class="cat-accuracy ${barClass.replace('bar-', 'acc-')}">${accuracyText}</span>
      </div>
      <div class="cat-bar-bg">
        <div class="cat-bar ${barClass}" style="width: ${barWidth}%"></div>
      </div>
      <div class="cat-sub">${cat.answered} / ${cat.total} 問回答　<span class="cat-drill-hint">タップして絞り込み →</span></div>
    `;

    if (onDrillCategory) {
      item.addEventListener('click', () => onDrillCategory(cat.name));
    }

    catList.appendChild(item);
  });
}

// ============================================================
// トースト通知
// ============================================================

export function showToast(message, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
