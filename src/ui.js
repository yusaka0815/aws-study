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

function fmtLastStudied(ts) {
  if (!ts) return null;
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 2) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(ms / 3_600_000);
  if (hr < 24) return `${hr}時間前`;
  const days = Math.floor(ms / 86_400_000);
  if (days === 1) return '昨日';
  if (days < 7) return `${days}日前`;
  return `${Math.floor(days / 7)}週間前`;
}

export function renderExamSelect(exams, onSelect, progressMap = {}, todayStats = null, currentExamCode = null, dailyGoal = 30) {
  const container = document.getElementById('exam-list');
  container.innerHTML = '';

  // progressMap は { counts, accuracyMap, dueMap, lastStudied, predictedMap } 形式を想定
  const counts = progressMap.counts ?? progressMap;
  const accuracyMap = progressMap.accuracyMap ?? {};
  const dueMap = progressMap.dueMap ?? {};
  const lastStudiedMap = progressMap.lastStudied ?? {};
  const predictedMap = progressMap.predictedMap ?? {};

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
    const predicted = predictedMap[exam.examCode] ?? null;
    const due = dueMap[exam.examCode] ?? 0;
    const lastAt = lastStudiedMap[exam.examCode] ?? 0;
    const lastText = lastAt ? fmtLastStudied(lastAt) : null;

    // 予測スコア（またはフォールバックで正答率）に応じたカラークラス
    const displayScore = predicted !== null ? predicted : accuracy;
    let scoreClass = '';
    if (displayScore !== null) {
      scoreClass = displayScore >= 72 ? 'acc-good' : displayScore >= 50 ? 'acc-mid' : 'acc-bad';
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
        ${lastText ? `<span class="exam-last-studied">${lastText}</span>` : ''}
      </div>
      <div class="exam-card-meta">
        ${answered > 0
          ? `<div class="exam-card-badges">${dueBadge}<span class="exam-progress">${pct}%カバー<span class="exam-accuracy ${scoreClass}"> 予測${displayScore}%</span></span></div>`
          : `<div class="exam-card-badges">${dueBadge}<span class="exam-new-label">はじめる →</span></div>`}
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
  const DAILY_GOAL = dailyGoal;

  if (statsEl) {
    if (todayStats && todayStats.todayCount > 0) {
      const accStr = todayStats.todayAccuracy != null ? ` ${todayStats.todayAccuracy}%正解` : '';
      const streakText = todayStats.streak > 1 ? ` 🔥 ${todayStats.streak}日連続` : '';
      const totalText = total > 0 ? `　累計 ${total} 問` : '';
      statsEl.innerHTML = `今日 <strong>${todayStats.todayCount}</strong> 問${accStr}${streakText}${totalText}`;
    } else if (todayStats?.prevStreak > 0) {
      statsEl.innerHTML = `<span class="streak-risk">⚠️ ${todayStats.prevStreak}日連続が途切れそう！今日まだ0問</span>`;
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
    const lastResult = qState.recentResults?.at(-1);
    const lastIcon = lastResult === 1 ? ' ✓' : lastResult === 0 ? ' ✗' : '';
    const recent = qState.recentResults ?? [];
    const isNemesis = recent.length >= 3 && recent.slice(-3).every(r => r === 0);
    historyChip = isNemesis
      ? `<span class="history-chip chip-nemesis">🔥 ${qState.attempts}回 ${acc}%</span>`
      : `<span class="history-chip ${chipClass}">${qState.attempts}回 ${acc}%${lastIcon}</span>`;
  } else {
    historyChip = `<span class="history-chip chip-new">NEW</span>`;
  }

  document.getElementById('question-meta').innerHTML =
    `<span>${question.category}  ${diffStars}</span>${typeTag}<span class="question-id">${question.id}</span>${historyChip}`;

  // ブックマークボタン
  const bookmarkBtn = document.getElementById('btn-bookmark');
  if (bookmarkBtn) {
    const isBookmarked = !!(qState?.bookmarked);
    bookmarkBtn.textContent = isBookmarked ? '★' : '☆';
    bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
  }

  // 問題文
  document.getElementById('question-text').textContent = question.question;

  // 選択肢（シャッフルして表示順 → 元インデックスのマッピングを返す）
  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const choicesEl = document.getElementById('choices-list');
  choicesEl.innerHTML = '';

  // Fisher-Yates shuffle: shuffleMap[displayPos] = originalIdx
  const shuffleMap = question.choices.map((_, i) => i);
  for (let i = shuffleMap.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleMap[i], shuffleMap[j]] = [shuffleMap[j], shuffleMap[i]];
  }

  shuffleMap.forEach((originalIdx, displayPos) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.dataset.index = displayPos;
    btn.innerHTML = `<span class="choice-label">${CHOICE_LABELS[displayPos] ?? displayPos + 1}</span><span class="choice-text">${question.choices[originalIdx]}</span>`;
    choicesEl.appendChild(btn);
  });

  // 解説エリア・複数選択提出エリアを隠す・次へボタンをdisabledに
  document.getElementById('answer-area').classList.add('hidden');
  const nextBtnEl = document.getElementById('next-btn');
  nextBtnEl.disabled = true;
  nextBtnEl.textContent = '次の問題へ →';
  document.getElementById('explanation-toggle').classList.add('hidden');
  document.getElementById('explanation-text').classList.add('hidden');
  document.getElementById('multi-submit-area').classList.add('hidden');
  const nextReviewEl = document.getElementById('next-review');
  if (nextReviewEl) nextReviewEl.classList.add('hidden');
  const correctLabelsEl = document.getElementById('correct-labels');
  if (correctLabelsEl) correctLabelsEl.classList.add('hidden');
  document.getElementById('answer-time')?.classList.add('hidden');

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

  return shuffleMap;
}

/**
 * 回答後の結果を表示
 * @param {object} question
 * @param {number[]} selectedIndices - 選択したインデックスの配列（単一選択も配列で渡す）
 * @param {boolean} isCorrect
 * @param {number} [nextReviewAt] - 次回復習タイムスタンプ（ms）
 */
export function renderResult(question, selectedIndices, isCorrect, nextReviewAt, shuffleMap = null, elapsedMs = null) {
  const choicesEl = document.getElementById('choices-list');
  const buttons = choicesEl.querySelectorAll('.choice-btn');

  // 複数選択提出エリアを隠す
  document.getElementById('multi-submit-area').classList.add('hidden');

  buttons.forEach((btn, displayPos) => {
    btn.disabled = true;
    btn.classList.remove('pending-selected');
    const originalIdx = shuffleMap ? shuffleMap[displayPos] : displayPos;
    if (selectedIndices.includes(displayPos)) {
      btn.classList.add('selected');
    }
    if (question.answers.includes(originalIdx)) {
      btn.classList.add('correct');
    } else if (selectedIndices.includes(displayPos)) {
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
  // 回答時間表示
  const answerTimeEl = document.getElementById('answer-time');
  if (answerTimeEl) {
    if (elapsedMs != null) {
      const elapsedSec = Math.round(elapsedMs / 1000);
      const timeText = elapsedSec < 1 ? '< 1秒' : `${elapsedSec}秒`;
      const isSlow = elapsedSec >= 15;
      answerTimeEl.textContent = isSlow ? `⚡ ${timeText}` : timeText;
      answerTimeEl.className = `answer-time${isSlow ? ' answer-time-slow' : ''}`;
      answerTimeEl.classList.remove('hidden');
    } else {
      answerTimeEl.classList.add('hidden');
    }
  }

  const correctLabels = document.getElementById('correct-labels');
  if (correctLabels) {
    if (!isCorrect) {
      const LABELS = ['A', 'B', 'C', 'D', 'E'];
      // シャッフル後の表示位置でラベルを示す
      const originalToDisplay = shuffleMap
        ? Object.fromEntries(shuffleMap.map((origIdx, dispPos) => [origIdx, dispPos]))
        : null;
      const labelStr = question.answers
        .map(origIdx => {
          const dispPos = originalToDisplay ? (originalToDisplay[origIdx] ?? origIdx) : origIdx;
          return LABELS[dispPos] ?? (dispPos + 1);
        })
        .sort()
        .join('・');
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
    setExplanationContent(expEl, question.explanation);
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
 * 解説テキストをセットし、クリップボードコピーボタンを追加
 */
function setExplanationContent(expEl, explanation) {
  expEl.textContent = explanation;
  if (navigator.clipboard) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'explanation-copy-btn';
    copyBtn.textContent = '📋';
    copyBtn.title = 'クリップボードにコピー';
    copyBtn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(explanation);
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
      } catch { /* clipboard API 非対応 */ }
    });
    expEl.appendChild(copyBtn);
  }
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
    setExplanationContent(expEl, explanation);
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

  // 予測スコア（直近の回答ベースの合格確率バー）
  const readinessEl = document.getElementById('stats-readiness');
  if (readinessEl && stats.answered > 0 && stats.predictedScore != null) {
    const score = stats.predictedScore;
    const passed = score >= 72;
    const levelClass = score >= 80 ? 'readiness-high' : score >= 72 ? 'readiness-mid' : score >= 50 ? 'readiness-low' : 'readiness-start';
    const msg = score >= 80
      ? '合格圏内！この調子を維持しましょう'
      : score >= 72
        ? '合格ライン達成！さらに伸ばしましょう'
        : score >= 50
          ? `あと ${72 - score}% で合格ライン (72%)`
          : '学習を続けると実力がついてきます';
    readinessEl.innerHTML = `
      <div class="readiness-header">
        <span class="readiness-title">予測スコア</span>
        <span class="readiness-score ${levelClass}">${score}% ${passed ? '✓' : ''}</span>
      </div>
      <div class="readiness-bar-bg">
        <div class="readiness-bar ${levelClass}" style="width:${score}%"></div>
        <div class="readiness-pass-line" title="合格ライン 72%"></div>
      </div>
      <div class="readiness-msg ${levelClass}">${msg}</div>
    `;
    readinessEl.className = 'stats-readiness';
  } else if (readinessEl) {
    readinessEl.innerHTML = '';
  }

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
    <div class="stat-card ${stats.bookmarkCount > 0 ? 'stat-card-bookmark' : ''}">
      <div class="stat-value">${stats.bookmarkCount ?? 0}</div>
      <div class="stat-label">ブックマーク</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalAttempts}</div>
      <div class="stat-label">総回答数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.activeDays ?? 0}<span class="stat-unit">/35日</span></div>
      <div class="stat-label">学習日数</div>
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

  // ストリーク表示
  const streakEl = document.getElementById('weekly-streak');
  if (streakEl) {
    if (stats.streak > 0) {
      streakEl.textContent = `🔥 ${stats.streak}日連続学習中！`;
      streakEl.classList.remove('hidden');
    } else {
      streakEl.classList.add('hidden');
    }
  }

  // 35日間アクティビティカレンダー
  const calEl = document.getElementById('activity-calendar');
  if (calEl && Array.isArray(stats.calendarData)) {
    calEl.innerHTML = stats.calendarData.map(({ date, count, isToday }) => {
      const intensity = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4;
      return `<div class="cal-cell cal-int-${intensity}${isToday ? ' cal-today' : ''}" title="${date}: ${count}問"></div>`;
    }).join('');
  }

  // 復習待ちドリルボタン
  const dueDrillBtn = document.getElementById('btn-drill-due');
  if (dueDrillBtn) {
    if (stats.dueCount > 0) {
      dueDrillBtn.textContent = `📋 復習待ち ${stats.dueCount} 問を練習`;
      dueDrillBtn.classList.remove('hidden');
    } else {
      dueDrillBtn.classList.add('hidden');
    }
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

  // ブックマークドリルボタン
  const bookmarkDrillBtn = document.getElementById('btn-drill-bookmark');
  if (bookmarkDrillBtn) {
    if ((stats.bookmarkCount ?? 0) > 0) {
      bookmarkDrillBtn.textContent = `★ ブックマーク ${stats.bookmarkCount} 問を練習`;
      bookmarkDrillBtn.classList.remove('hidden');
    } else {
      bookmarkDrillBtn.classList.add('hidden');
    }
  }

  // よく間違える問題 Top5
  const worstEl = document.getElementById('worst-questions');
  if (worstEl) {
    if (stats.worstQuestions && stats.worstQuestions.length > 0) {
      worstEl.innerHTML = stats.worstQuestions.map(q => `
        <div class="worst-item${onDrillCategory ? ' worst-item-drill' : ''}" data-cat="${q.category}">
          <div class="worst-meta">
            <span class="worst-category">${q.category}</span>
            <span class="worst-accuracy acc-bad">${q.accuracy}% (${q.attempts}回)</span>
          </div>
          <div class="worst-text">${q.text}</div>
          ${onDrillCategory ? '<div class="worst-drill-hint">タップしてカテゴリを絞り込み →</div>' : ''}
        </div>
      `).join('');
      if (onDrillCategory) {
        worstEl.querySelectorAll('.worst-item-drill').forEach(item => {
          item.addEventListener('click', () => onDrillCategory(item.dataset.cat));
        });
      }
      worstEl.previousElementSibling?.classList.remove('hidden');
    } else {
      worstEl.innerHTML = '';
      worstEl.previousElementSibling?.classList.add('hidden');
    }
  }

  // カテゴリ別（ソートタブ付き）
  const catList = document.getElementById('category-stats');
  const sortTabsEl = document.getElementById('category-sort-tabs');

  if (stats.categoryList.length === 0) {
    catList.innerHTML = '<p class="empty-msg">まだ回答データがありません</p>';
    if (sortTabsEl) sortTabsEl.innerHTML = '';
    return;
  }

  let catSortMode = 'accuracy';

  function renderCategoryList() {
    const sorted = [...stats.categoryList].sort((a, b) => {
      if (catSortMode === 'coverage') {
        const cA = a.total > 0 ? a.answered / a.total : 0;
        const cB = b.total > 0 ? b.answered / b.total : 0;
        return cA - cB;
      }
      if (catSortMode === 'due') return (b.due ?? 0) - (a.due ?? 0);
      // accuracy: null（未回答）を末尾に
      return (a.accuracy ?? 101) - (b.accuracy ?? 101);
    });

    catList.innerHTML = '';
    sorted.forEach(cat => {
      const accuracy = cat.accuracy !== null ? cat.accuracy : null;
      const barWidth = accuracy !== null ? accuracy : 0;
      const barClass = accuracy === null ? 'bar-neutral' : accuracy >= 80 ? 'bar-good' : accuracy >= 60 ? 'bar-mid' : 'bar-bad';
      const accuracyText = accuracy !== null ? `${accuracy}%` : '未回答';
      const coveragePct = cat.total > 0 ? Math.round((cat.answered / cat.total) * 100) : 0;
      const allMastered = accuracy === 100 && cat.answered === cat.total && cat.total > 0;

      const item = document.createElement('div');
      item.className = `category-item${allMastered ? ' cat-perfect' : ''}`;

      item.innerHTML = `
        <div class="cat-header">
          <span class="cat-name">${cat.name}${allMastered ? ' ⭐' : ''}</span>
          <span class="cat-accuracy ${barClass.replace('bar-', 'acc-')}">${accuracyText}</span>
        </div>
        <div class="cat-bar-bg">
          <div class="cat-bar ${barClass}" style="width: ${barWidth}%"></div>
        </div>
        <div class="cat-sub">${cat.answered} / ${cat.total} 問回答 (${coveragePct}%カバー)${cat.due > 0 ? `　<span class="due-badge">復習 ${cat.due}</span>` : ''}　<span class="cat-drill-hint">タップして絞り込み →</span></div>
      `;

      if (onDrillCategory) {
        item.addEventListener('click', () => onDrillCategory(cat.name));
      }

      catList.appendChild(item);
    });
  }

  if (sortTabsEl) {
    const SORT_LABELS = { accuracy: '正答率', coverage: 'カバー率', due: '復習待ち' };
    function renderSortTabs() {
      sortTabsEl.innerHTML = Object.entries(SORT_LABELS).map(([key, label]) =>
        `<button class="sort-tab${catSortMode === key ? ' active' : ''}" data-sort="${key}">${label}</button>`
      ).join('');
      sortTabsEl.querySelectorAll('.sort-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          catSortMode = btn.dataset.sort;
          renderSortTabs();
          renderCategoryList();
        });
      });
    }
    renderSortTabs();
  }

  renderCategoryList();
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
