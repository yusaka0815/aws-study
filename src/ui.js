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

export function renderExamSelect(exams, onSelect) {
  const container = document.getElementById('exam-list');
  container.innerHTML = '';

  exams.forEach(exam => {
    const btn = document.createElement('button');
    btn.className = 'exam-card';
    btn.innerHTML = `
      <span class="exam-code">${exam.examCode}</span>
      <span class="exam-name">${exam.examName}</span>
      <span class="exam-arrow">→</span>
    `;
    btn.addEventListener('click', () => onSelect(exam.examCode));
    container.appendChild(btn);
  });
}

// ============================================================
// 問題画面
// ============================================================

/**
 * 問題を表示（回答前の状態）
 */
export function renderQuestion(question, questionIndex, totalQuestions) {
  // プログレスバー
  const pct = totalQuestions > 0 ? Math.round((questionIndex / totalQuestions) * 100) : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-text').textContent = `${questionIndex} / ${totalQuestions}`;

  // カテゴリ・難易度
  const diffStars = '★'.repeat(question.difficulty) + '☆'.repeat(3 - question.difficulty);
  document.getElementById('question-meta').textContent = `${question.category}  ${diffStars}`;

  // 問題文
  document.getElementById('question-text').textContent = question.question;

  // 選択肢
  const choicesEl = document.getElementById('choices-list');
  choicesEl.innerHTML = '';
  question.choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.index = idx;
    btn.textContent = choice;
    choicesEl.appendChild(btn);
  });

  // 解説エリアを隠す
  document.getElementById('answer-area').classList.add('hidden');
  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('explanation-toggle').classList.add('hidden');
  document.getElementById('explanation-text').classList.add('hidden');
}

/**
 * 回答後の結果を表示
 */
export function renderResult(question, selectedIndex, isCorrect) {
  const choicesEl = document.getElementById('choices-list');
  const buttons = choicesEl.querySelectorAll('.choice-btn');

  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (question.answers.includes(idx)) {
      btn.classList.add('correct');
    } else if (idx === selectedIndex && !isCorrect) {
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

  // 解説ボタンと次へボタンを表示
  document.getElementById('explanation-toggle').classList.remove('hidden');
  document.getElementById('next-btn').classList.remove('hidden');

  // 解説は折りたたんだ状態で表示
  document.getElementById('explanation-text').classList.add('hidden');
  document.getElementById('explanation-toggle').textContent = '解説を見る';
}

/**
 * 解説の表示/非表示トグル
 */
export function toggleExplanation(explanation) {
  const expEl = document.getElementById('explanation-text');
  const btn = document.getElementById('explanation-toggle');
  const isHidden = expEl.classList.contains('hidden');

  expEl.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? '解説を閉じる' : '解説を見る';

  if (isHidden) {
    expEl.textContent = explanation;
    // 解説が表示されたら少しスクロール
    setTimeout(() => expEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
}

// ============================================================
// 統計画面
// ============================================================

export function renderStats(examCode, examName, stats) {
  document.getElementById('stats-exam-name').textContent = examName;

  const overview = document.getElementById('stats-overview');
  overview.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.accuracy}<span class="stat-unit">%</span></div>
      <div class="stat-label">正答率</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.answered}<span class="stat-unit"> / ${stats.total}</span></div>
      <div class="stat-label">解答済み問題</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalAttempts}</div>
      <div class="stat-label">総回答数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.unanswered}</div>
      <div class="stat-label">未解答</div>
    </div>
  `;

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
      <div class="cat-sub">${cat.answered} / ${cat.total} 問回答</div>
    `;
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
