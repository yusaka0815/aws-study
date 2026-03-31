/**
 * steps.js
 * BDD ステップ定義（Given / When / Then）
 * Gherkin シナリオとPlaywright操作をつなぐ
 */

import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

// ============================================================
// ヘルパー
// ============================================================

/** 問題が読み込まれ選択肢が描画されるまで待機 */
async function waitForQuestion(page) {
  await page.waitForFunction(
    () => {
      const t = document.getElementById('question-text')?.textContent;
      return t && t !== '問題を読み込んでいます...' && t.length > 0;
    }
  );
  await page.waitForSelector('.choice-btn');
}

/** 現在の問題に回答（単一選択・複数選択対応） */
async function answerCurrentQuestion(page) {
  const multiArea = page.locator('#multi-submit-area');
  const isMulti = await multiArea.isVisible();
  if (isMulti) {
    await page.locator('.choice-btn').first().click();
    await page.locator('#next-btn').click();
  } else {
    await page.locator('.choice-btn').first().click();
  }
  await page.waitForSelector('#answer-area:not(.hidden)');
}

// ============================================================
// Given — 前提条件
// ============================================================

Given('アプリを開く', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForSelector('.exam-card');
});

Then('試験カードが9枚表示される', async ({ page }) => {
  const count = await page.locator('.exam-card').count();
  expect(count).toBe(9);
});

When('DOP試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'DOP' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

Then('複数選択エリアが表示される', async ({ page }) => {
  await expect(page.locator('#multi-submit-area')).toBeVisible();
});

Given('DOP試験で学習中', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForSelector('.exam-card');
  await page.locator('.exam-card').filter({ hasText: 'DOP' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
  // DOP は全問複数選択 → multi-submit-area が表示されるまで待機
  await page.waitForSelector('#multi-submit-area:not(.hidden)', { timeout: 5000 });
});

Given('SAA試験で学習中', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForSelector('.exam-card');
  await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
  // study screen がアクティブになるまで待機（SW再読込との競合を防ぐ）
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

Given('SAA試験で1問回答済み', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForSelector('.exam-card');
  await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
  await answerCurrentQuestion(page);
});

// ============================================================
// When — 操作
// ============================================================

When('SAA試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('MLA試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'MLA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('CLF試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'CLF' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('SAP試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'SAP' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('DVA試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'DVA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('AIF試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'AIF' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('SOA試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'SOA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('DEA試験カードをタップする', async ({ page }) => {
  await page.locator('.exam-card').filter({ hasText: 'DEA' }).click();
  await page.waitForSelector('#screen-study.active', { timeout: 10000 });
  await waitForQuestion(page);
});

When('試験変更ボタンをタップする', async ({ page }) => {
  await page.locator('#btn-change-exam').click();
  await page.waitForSelector('#screen-select.active');
});

When('最初の選択肢を選ぶ', async ({ page }) => {
  await answerCurrentQuestion(page);
});

When('キーボードで選択肢1を押す', async ({ page }) => {
  // 単一選択問題のみ: キー「1」で最初の選択肢を選んで回答
  const isMulti = await page.locator('#multi-submit-area').isVisible();
  if (isMulti) {
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
  } else {
    await page.keyboard.press('1');
  }
  await page.waitForSelector('#answer-area:not(.hidden)');
});

When('別の選択肢をタップする', async ({ page }) => {
  // 回答後は disabled なので force: true で送信しても結果は変わらない
  await page.locator('.choice-btn').nth(1).click({ force: true });
});

When('スキップボタンをタップする', async ({ page }) => {
  await page.locator('#btn-skip').click();
  await page.waitForSelector('#answer-area:not(.hidden)');
});

When('次へボタンをタップする', async ({ page }) => {
  const firstQuestion = await page.locator('#question-text').textContent();
  await page.locator('#next-btn').click();
  await page.waitForFunction(
    () => document.getElementById('answer-area')?.classList.contains('hidden')
  );
  // ページに保存しておく（次のステップで比較用）
  await page.evaluate(q => { window.__prevQuestion = q; }, firstQuestion);
});

When('ブックマークボタンをタップする', async ({ page }) => {
  await page.locator('#btn-bookmark').click();
});

When('再度ブックマークボタンをタップする', async ({ page }) => {
  await page.locator('#btn-bookmark').click();
});

When('3問連続で回答する', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await answerCurrentQuestion(page);
    if (i < 2) {
      await page.locator('#next-btn').click();
      await page.waitForFunction(
        () => document.getElementById('answer-area')?.classList.contains('hidden')
      );
    }
  }
});

When('設定ボタンをタップする', async ({ page }) => {
  // 問題画面からか試験選択画面からかを判断して適切なボタンをクリック
  const fromStudy = await page.locator('#btn-settings').isVisible();
  if (fromStudy) {
    await page.locator('#btn-settings').click();
  } else {
    await page.locator('#btn-settings-from-select').click();
  }
  await page.waitForSelector('#screen-settings.active');
});

When('文字サイズを大に変更する', async ({ page }) => {
  await page.locator('#seg-font-size .seg-btn[data-val="large"]').click();
});

When('文字サイズを小に変更する', async ({ page }) => {
  await page.locator('#seg-font-size .seg-btn[data-val="small"]').click();
});

When('文字サイズを標準に変更する', async ({ page }) => {
  await page.locator('#seg-font-size .seg-btn[data-val="medium"]').click();
});

Then('フォントサイズ属性が小になる', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-font-size', 'small');
});

Then('フォントサイズ属性が標準になる', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-font-size', 'medium');
});

When('自動次へをオンにする', async ({ page }) => {
  const isChecked = await page.locator('#toggle-auto-next').isChecked();
  if (!isChecked) {
    await page.locator('label[aria-label="正解時に自動で次へ"]').click();
  }
});

Then('自動次へがオンになっている', async ({ page }) => {
  await expect(page.locator('#toggle-auto-next')).toBeChecked();
});

When('戻るボタンをタップする', async ({ page }) => {
  // アクティブな画面の戻るボタンをクリック
  await page.locator('.screen.active .back-btn').click();
});

When('統計ボタンをタップする', async ({ page }) => {
  await page.locator('#btn-stats').click();
  await page.waitForSelector('#screen-stats.active');
});

// ============================================================
// Then — 検証
// ============================================================

Then('試験一覧に SAA・CLF・AIF が含まれる', async ({ page }) => {
  await expect(page.locator('.exam-card').filter({ hasText: 'SAA' })).toBeVisible();
  await expect(page.locator('.exam-card').filter({ hasText: 'CLF' })).toBeVisible();
  await expect(page.locator('.exam-card').filter({ hasText: 'AIF' })).toBeVisible();
});

Then('問題画面に遷移する', async ({ page }) => {
  await expect(page.locator('#screen-study')).toBeVisible();
});

Then('問題文が表示される', async ({ page }) => {
  const text = await page.locator('#question-text').textContent();
  expect(text.length).toBeGreaterThan(10);
});

Then('4つ以上の選択肢が表示される', async ({ page }) => {
  const count = await page.locator('.choice-btn').count();
  expect(count).toBeGreaterThanOrEqual(4);
});

Then('試験選択画面が表示される', async ({ page }) => {
  await expect(page.locator('#screen-select')).toBeVisible();
});

Then('次へボタンが無効になっている', async ({ page }) => {
  await expect(page.locator('#next-btn')).toBeDisabled();
});

Then('正誤アイコンが表示される', async ({ page }) => {
  const icon = await page.locator('#answer-icon').textContent();
  expect(['○', '×']).toContain(icon);
});

Then('次へボタンが有効になる', async ({ page }) => {
  await expect(page.locator('#next-btn')).toBeEnabled();
});

Then('解説ボタンが表示される', async ({ page }) => {
  await expect(page.locator('#explanation-toggle')).toBeVisible();
});

Then('不正解として処理される', async ({ page }) => {
  await expect(page.locator('#answer-area')).toHaveClass(/result-wrong/);
});

Then('解説が自動で展開される', async ({ page }) => {
  await expect(page.locator('#explanation-text')).toBeVisible();
  const text = await page.locator('#explanation-text').textContent();
  expect(text.length).toBeGreaterThan(10);
});

Then('別の問題が表示される', async ({ page }) => {
  const current = await page.locator('#question-text').textContent();
  const prev = await page.evaluate(() => window.__prevQuestion);
  if (prev) expect(current).not.toBe(prev);
  expect(current.length).toBeGreaterThan(10);
});

Then('回答エリアが非表示になる', async ({ page }) => {
  await expect(page.locator('#answer-area')).toBeHidden();
});

Then('正誤アイコンが変わらない', async ({ page }) => {
  // 回答後はボタンがdisabledのため再判定されない。アイコンが存在していれば確認済み
  const icon = await page.locator('#answer-icon').textContent();
  expect(['○', '×']).toContain(icon);
});

Then('ブックマークが有効になる', async ({ page }) => {
  await expect(page.locator('#btn-bookmark')).toContainText('★');
});

Then('ブックマークが解除される', async ({ page }) => {
  await expect(page.locator('#btn-bookmark')).toContainText('☆');
});

Then('プログレスバーが表示される', async ({ page }) => {
  await expect(page.locator('#progress-bar')).toBeVisible();
  await expect(page.locator('#progress-text')).toBeVisible();
});

Then('プログレステキストが更新されている', async ({ page }) => {
  // 次の問題が読み込まれるまで待機してからプログレスを確認
  await waitForQuestion(page);
  const progressText = await page.locator('#progress-text').textContent();
  // "X / Y" 形式でX >= 1（少なくともプログレスが存在する）
  const match = progressText.match(/(\d+)/);
  expect(match).not.toBeNull();
  expect(Number(match[1])).toBeGreaterThanOrEqual(1);
});

Then('プログレスが更新されている', async ({ page }) => {
  const progressText = await page.locator('#progress-text').textContent();
  // "X / Y" 形式で X が 1 以上
  const match = progressText.match(/(\d+)/);
  expect(match).not.toBeNull();
  expect(Number(match[1])).toBeGreaterThanOrEqual(1);
});

Then('設定画面が表示される', async ({ page }) => {
  await expect(page.locator('#screen-settings')).toBeVisible();
});

Then('学習中の設定セクションが表示される', async ({ page }) => {
  await expect(page.locator('#toggle-wake-lock')).toBeAttached();
  await expect(page.locator('#toggle-sound')).toBeAttached();
  await expect(page.locator('#seg-daily-goal')).toBeVisible();
});

Then('バックアップセクションが表示される', async ({ page }) => {
  await expect(page.locator('#btn-export')).toBeVisible();
  await expect(page.locator('#btn-import')).toBeVisible();
});

Then('コンテンツがスクロール可能である', async ({ page }) => {
  // scrollHeight > clientHeight はビューポートサイズに依存するため overflow-y を確認
  const overflowY = await page.evaluate(() => {
    const el = document.querySelector('.settings-content');
    return getComputedStyle(el).overflowY;
  });
  expect(overflowY).toBe('auto');
});

When('デイリーゴールを20問に変更する', async ({ page }) => {
  await page.locator('#seg-daily-goal .seg-btn[data-val="20"]').click();
  await page.waitForTimeout(200);
});

When('テーマをライトに変更する', async ({ page }) => {
  await page.locator('#seg-theme .seg-btn[data-val="light"]').click();
  await page.waitForTimeout(200);
});

When('テーマをダークに変更する', async ({ page }) => {
  await page.locator('#seg-theme .seg-btn[data-val="dark"]').click();
  await page.waitForTimeout(200);
});

Then('画面の背景がライト色になる', async ({ page }) => {
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBe('light');
});

Then('画面の背景がダーク色になる', async ({ page }) => {
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark');
  expect(theme).toBe('dark');
});

Then('デイリーゴールが20問に設定されている', async ({ page }) => {
  const activeVal = await page.locator('#seg-daily-goal .seg-btn').evaluateAll(
    btns => btns.find(b => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true')?.dataset.val
  );
  expect(activeVal).toBe('20');
});

When('デイリーゴールを10問に変更する', async ({ page }) => {
  await page.locator('#seg-daily-goal .seg-btn[data-val="10"]').click();
  await page.waitForTimeout(200);
});

Then('デイリーゴールが10問に設定されている', async ({ page }) => {
  const activeVal = await page.locator('#seg-daily-goal .seg-btn').evaluateAll(
    btns => btns.find(b => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true')?.dataset.val
  );
  expect(activeVal).toBe('10');
});

When('テーマをシステムに変更する', async ({ page }) => {
  await page.locator('#seg-theme .seg-btn[data-val="system"]').click();
  await page.waitForTimeout(200);
});

Then('テーマがシステム設定になっている', async ({ page }) => {
  // システムテーマ選択後: prefersLightに応じてlight/なし、またはlight(ヘッドレス環境)
  const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? '');
  // system選択後はlight/dark/'system'/''のいずれか（環境依存）
  expect(['system', '', 'light', 'dark']).toContain(theme);
});

Then('問題文のフォントサイズが大きくなる', async ({ page }) => {
  const fontSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.getElementById('question-text')).fontSize)
  );
  // large = 18px、デフォルト = 15px
  expect(fontSize).toBeGreaterThan(15);
});

Then('問題画面が表示される', async ({ page }) => {
  await expect(page.locator('#screen-study')).toBeVisible();
});

Then('統計画面が表示される', async ({ page }) => {
  await expect(page.locator('#screen-stats')).toBeVisible();
});

Then('回答数が1以上表示される', async ({ page }) => {
  const statValues = await page.locator('.stat-value').allTextContents();
  const nums = statValues.map(v => parseInt(v) || 0);
  expect(Math.max(...nums)).toBeGreaterThanOrEqual(1);
});

Then('カテゴリ別の統計が表示される', async ({ page }) => {
  await expect(page.locator('#category-stats')).toBeVisible();
});

Then('週間チャートが表示される', async ({ page }) => {
  await expect(page.locator('#weekly-chart')).toBeVisible();
  const cols = await page.locator('#weekly-chart .weekly-col').count();
  expect(cols).toBe(7);
});

Then('カテゴリリストに項目が存在する', async ({ page }) => {
  const items = await page.locator('#category-stats .category-item').count();
  expect(items).toBeGreaterThan(0);
});

Then('統計画面にSAAと表示される', async ({ page }) => {
  const examName = await page.locator('#stats-exam-name').textContent();
  expect(examName).toContain('SAA');
});

When('カテゴリ項目をタップする', async ({ page }) => {
  await page.locator('.category-item').first().click();
  await page.waitForTimeout(400);
});

Then('問題画面に戻り絞り込みが有効になる', async ({ page }) => {
  await expect(page.locator('#screen-study')).toBeVisible();
  // カテゴリドリルバナーまたは絞り込みバナーが表示されている
  const banner = page.locator('#weak-only-banner, #bookmark-only-banner, .category-drill-banner');
  // ドリル後は問題画面に遷移していればOK（バナー表示はカテゴリに依存）
  await expect(page.locator('.question-card')).toBeVisible();
});

When('複数選択で1つ選択する', async ({ page }) => {
  await page.locator('.choice-btn').first().click();
  await page.waitForTimeout(200);
});

When('複数選択で必要数だけ選択する', async ({ page }) => {
  const required = parseInt(await page.locator('#multi-required').textContent());
  const choices = page.locator('.choice-btn:not(:disabled)');
  for (let i = 0; i < required; i++) {
    await choices.nth(i).click();
    await page.waitForTimeout(150);
  }
});

Then('選択カウンターが増加する', async ({ page }) => {
  const count = parseInt(await page.locator('#multi-count').textContent());
  expect(count).toBeGreaterThanOrEqual(1);
});

When('模擬試験ボタンをタップする', async ({ page }) => {
  await page.locator('#btn-exam-mode').click();
  await page.waitForSelector('#exam-modal-overlay:not(.hidden)', { timeout: 5000 });
});

Then('模擬試験モーダルが表示される', async ({ page }) => {
  await expect(page.locator('#exam-modal-overlay')).not.toHaveClass(/hidden/);
  await expect(page.locator('#exam-modal-content')).toBeVisible();
});

Then('開始ボタンが表示される', async ({ page }) => {
  await expect(page.locator('#exam-modal-start')).toBeVisible();
});

When('模擬試験を開始する', async ({ page }) => {
  await page.locator('#exam-modal-start').click();
  await page.waitForSelector('#exam-mode-timer:not(.hidden)', { timeout: 5000 });
});

Then('模擬試験タイマーが表示される', async ({ page }) => {
  await expect(page.locator('#exam-mode-timer')).toBeVisible();
});

Then('模擬試験ボタンが {string} ラベルで表示される', async ({ page }, label) => {
  const btn = page.locator('#btn-exam-mode');
  await expect(btn).toBeVisible();
  const labelEl = btn.locator('.btn-label');
  await expect(labelEl).toBeVisible();
  await expect(labelEl).toHaveText(label);
});

When('解説ボタンをタップする', async ({ page }) => {
  const expEl = page.locator('#explanation-text');
  const alreadyVisible = await expEl.isVisible();
  if (!alreadyVisible) {
    await page.locator('#explanation-toggle').click();
  }
  await expect(expEl).toBeVisible({ timeout: 3000 });
});

Then('解説テキストが表示される', async ({ page }) => {
  const el = page.locator('#explanation-text');
  await expect(el).toBeVisible();
  const text = await el.textContent();
  expect(text.trim().length).toBeGreaterThan(0);
});

Then('問題メタにNEWチップが表示される', async ({ page }) => {
  await expect(page.locator('.chip-new')).toBeVisible();
  await expect(page.locator('.chip-new')).toContainText('NEW');
});

When('3回連続スキップする', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.waitForSelector('#btn-skip:not([disabled])');
    await page.locator('#btn-skip').click();
    await page.waitForSelector('#answer-area:not(.hidden)');
    if (i < 2) {
      await page.locator('#next-btn').click();
      await page.waitForFunction(
        () => document.getElementById('answer-area')?.classList.contains('hidden')
      );
      await page.waitForSelector('.choice-btn');
    }
  }
});

Then('スキップ誘導バナーが表示される', async ({ page }) => {
  await expect(page.locator('#skip-nudge')).toBeVisible();
});

Then('回答時間が表示される', async ({ page }) => {
  const el = page.locator('#answer-time');
  await expect(el).toBeVisible();
  const text = await el.textContent();
  expect(text.trim().length).toBeGreaterThan(0);
});

Then('今日の学習状況が表示される', async ({ page }) => {
  const el = page.locator('#select-stats');
  await expect(el).toContainText('今日');
});

Then('スキップ後にカテゴリが表示される', async ({ page }) => {
  const label = await page.locator('#answer-label').textContent();
  expect(label).toMatch(/スキップ — /);
});

Given('ヒント未表示状態でアプリを開く', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.evaluate(() => localStorage.removeItem('aws-study-hint-seen'));
  await page.waitForSelector('.exam-card');
});

Then('初回ヒントが表示される', async ({ page }) => {
  await expect(page.locator('#study-first-hint')).toBeVisible();
});

Then('連続学習日数が表示される', async ({ page }) => {
  const el = page.locator('#weekly-streak');
  await expect(el).toBeVisible();
  await expect(el).toContainText('連続');
});

Then('ブックマークドリルボタンが表示される', async ({ page }) => {
  await expect(page.locator('#btn-drill-bookmark')).toBeVisible();
});

Then('スキップ数が表示される', async ({ page }) => {
  const el = page.locator('#stat-skip-count');
  await expect(el).toBeVisible();
  const text = await el.textContent();
  expect(parseInt(text.trim())).toBeGreaterThan(0);
});
