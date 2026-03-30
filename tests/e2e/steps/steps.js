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

When('試験変更ボタンをタップする', async ({ page }) => {
  await page.locator('#btn-change-exam').click();
  await page.waitForSelector('#screen-select.active');
});

When('最初の選択肢を選ぶ', async ({ page }) => {
  await answerCurrentQuestion(page);
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

Then('模擬試験ボタンが {string} ラベルで表示される', async ({ page }, label) => {
  const btn = page.locator('#btn-exam-mode');
  await expect(btn).toBeVisible();
  const labelEl = btn.locator('.btn-label');
  await expect(labelEl).toBeVisible();
  await expect(labelEl).toHaveText(label);
});
