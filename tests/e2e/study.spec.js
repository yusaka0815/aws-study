/**
 * study.spec.js
 * Playwright E2Eテスト
 * 実際のブラウザでアプリの動作を検証
 */

import { test, expect } from '@playwright/test';

// ============================================================
// ヘルパー
// ============================================================

/** 試験選択画面でSAAを選んで問題画面に移動 */
async function selectExam(page, examCode = 'SAA') {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.exam-card').filter({ hasText: examCode }).click();
  // 問題が読み込まれるまで待機
  await page.waitForSelector('#question-text:not(:empty)');
  await page.waitForFunction(
    () => document.getElementById('question-text')?.textContent !== '問題を読み込んでいます...'
  );
}

// ============================================================
// 起動・画面表示
// ============================================================
test.describe('起動・試験選択画面', () => {
  test('ページが正常に読み込まれる', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('AWS Certification Study');
  });

  test('試験選択画面が表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#screen-select')).toBeVisible();
    await expect(page.locator('#exam-list')).toBeVisible();
  });

  test('SAA・MLA の2試験が表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const cards = page.locator('.exam-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('SAA');
    await expect(cards.nth(1)).toContainText('MLA');
  });

  test('試験名が正しく表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.exam-card').nth(0)).toContainText('Solutions Architect');
    await expect(page.locator('.exam-card').nth(1)).toContainText('Machine Learning');
  });
});

// ============================================================
// 問題表示
// ============================================================
test.describe('問題表示（SAA）', () => {
  test.beforeEach(async ({ page }) => {
    await selectExam(page, 'SAA');
  });

  test('問題画面に切り替わる', async ({ page }) => {
    await expect(page.locator('#screen-study')).toBeVisible();
    await expect(page.locator('#screen-select')).not.toBeVisible();
  });

  test('問題文が表示される', async ({ page }) => {
    const questionText = page.locator('#question-text');
    await expect(questionText).toBeVisible();
    const text = await questionText.textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('4つの選択肢が表示される', async ({ page }) => {
    const choices = page.locator('.choice-btn');
    await expect(choices).toHaveCount(4);
  });

  test('カテゴリと難易度が表示される', async ({ page }) => {
    const meta = page.locator('#question-meta');
    await expect(meta).toBeVisible();
    const text = await meta.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('プログレスバーが表示される', async ({ page }) => {
    await expect(page.locator('.progress-bar-wrap')).toBeVisible();
    await expect(page.locator('#progress-text')).toBeVisible();
  });

  test('次へボタンは問題表示時は非表示', async ({ page }) => {
    await expect(page.locator('#next-btn')).toBeHidden();
  });

  test('解説エリアは問題表示時は非表示', async ({ page }) => {
    await expect(page.locator('#answer-area')).toBeHidden();
  });
});

// ============================================================
// 回答処理
// ============================================================
test.describe('回答処理', () => {
  test.beforeEach(async ({ page }) => {
    await selectExam(page, 'SAA');
  });

  test('選択肢をクリックすると正誤が表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#answer-area')).toBeVisible();
    await expect(page.locator('#answer-icon')).toBeVisible();
    const icon = await page.locator('#answer-icon').textContent();
    expect(['○', '×']).toContain(icon);
  });

  test('正解選択肢は緑、不正解選択肢は赤になる', async ({ page }) => {
    // どれかクリック後に正解ボタンが green クラスを持つことを確認
    await page.locator('.choice-btn').first().click();
    const correctBtn = page.locator('.choice-btn.correct');
    await expect(correctBtn).toHaveCount(1); // 正解は1つ
  });

  test('回答後は次へボタンが表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#next-btn')).toBeVisible();
  });

  test('回答後は解説ボタンが表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#explanation-toggle')).toBeVisible();
  });

  test('解説ボタンをクリックすると解説が展開される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await page.locator('#explanation-toggle').click();
    await expect(page.locator('#explanation-text')).toBeVisible();
    const text = await page.locator('#explanation-text').textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('解説を2回クリックすると閉じる', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await page.locator('#explanation-toggle').click();
    await expect(page.locator('#explanation-text')).toBeVisible();
    await page.locator('#explanation-toggle').click();
    await expect(page.locator('#explanation-text')).toBeHidden();
  });

  test('回答後は選択肢をクリックしても再判定されない', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    const iconBefore = await page.locator('#answer-icon').textContent();
    // 別の選択肢をクリック
    await page.locator('.choice-btn').nth(1).click();
    const iconAfter = await page.locator('#answer-icon').textContent();
    expect(iconAfter).toBe(iconBefore); // 変化しない
  });

  test('次へボタンで新しい問題が表示される', async ({ page }) => {
    const firstQuestion = await page.locator('#question-text').textContent();
    await page.locator('.choice-btn').first().click();
    await page.locator('#next-btn').click();
    await page.waitForFunction(
      () => document.getElementById('answer-area')?.classList.contains('hidden')
    );
    const secondQuestion = await page.locator('#question-text').textContent();
    // 問題が変わっている（同じ問題が連続して出ないことを確認）
    expect(secondQuestion).not.toBe(firstQuestion);
  });
});

// ============================================================
// MLA試験
// ============================================================
test.describe('MLA試験', () => {
  test('MLA選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'MLA');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
  });

  test('試験変更でSAAに戻れる', async ({ page }) => {
    await selectExam(page, 'MLA');
    await page.locator('#btn-change-exam').click();
    await expect(page.locator('#screen-select')).toBeVisible();
    await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
    await page.waitForFunction(
      () => document.getElementById('question-text')?.textContent !== '問題を読み込んでいます...'
    );
    await expect(page.locator('#screen-study')).toBeVisible();
  });
});

// ============================================================
// 統計画面
// ============================================================
test.describe('統計画面', () => {
  test.beforeEach(async ({ page }) => {
    await selectExam(page, 'SAA');
  });

  test('📊ボタンで統計画面が開く', async ({ page }) => {
    await page.locator('#btn-stats').click();
    await expect(page.locator('#screen-stats')).toBeVisible();
  });

  test('統計画面に試験名が表示される', async ({ page }) => {
    await page.locator('#btn-stats').click();
    const examName = await page.locator('#stats-exam-name').textContent();
    expect(examName.length).toBeGreaterThan(0);
  });

  test('戻るボタンで問題画面に戻る', async ({ page }) => {
    await page.locator('#btn-stats').click();
    await expect(page.locator('#screen-stats')).toBeVisible();
    await page.locator('#stats-back-btn').click();
    await expect(page.locator('#screen-study')).toBeVisible();
  });

  test('1問回答後の統計に数値が反映される', async ({ page }) => {
    // 1問回答
    await page.locator('.choice-btn').first().click();
    // 統計を開く
    await page.locator('#btn-stats').click();
    const overview = page.locator('#stats-overview');
    await expect(overview).toBeVisible();
    // 総回答数が1以上
    const statValues = await page.locator('.stat-value').allTextContents();
    const totalAttempts = parseInt(statValues[2] || '0');
    expect(totalAttempts).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 設定画面
// ============================================================
test.describe('設定画面', () => {
  test.beforeEach(async ({ page }) => {
    await selectExam(page, 'SAA');
  });

  test('⚙️ボタンで設定画面が開く', async ({ page }) => {
    await page.locator('#btn-settings').click();
    await expect(page.locator('#screen-settings')).toBeVisible();
  });

  test('設定画面にバックアップ・リセット項目がある', async ({ page }) => {
    await page.locator('#btn-settings').click();
    await expect(page.locator('#btn-export')).toBeVisible();
    await expect(page.locator('#btn-import')).toBeVisible();
    await expect(page.locator('#btn-reset')).toBeVisible();
  });

  test('戻るボタンで問題画面に戻る', async ({ page }) => {
    await page.locator('#btn-settings').click();
    await page.locator('#settings-back-btn').click();
    await expect(page.locator('#screen-study')).toBeVisible();
  });

  test('試験選択画面の⚙️から設定を開いて戻ると選択画面に戻る', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('#btn-settings-from-select').click();
    await expect(page.locator('#screen-settings')).toBeVisible();
    await page.locator('#settings-back-btn').click();
    await expect(page.locator('#screen-select')).toBeVisible();
  });
});

// ============================================================
// データ永続性
// ============================================================
test.describe('データ永続性（localStorage）', () => {
  test('回答後にリロードしても進捗が保持される', async ({ page }) => {
    await selectExam(page, 'SAA');
    // 3問回答
    for (let i = 0; i < 3; i++) {
      await page.locator('.choice-btn').first().click();
      await page.locator('#next-btn').click();
      await page.waitForFunction(
        () => document.getElementById('answer-area')?.classList.contains('hidden')
      );
    }
    // ページリロード
    await page.reload();
    await page.waitForLoadState('networkidle');
    // 試験を再選択（localStorageは保持されているはず）
    await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
    await page.waitForFunction(
      () => document.getElementById('question-text')?.textContent !== '問題を読み込んでいます...'
    );
    // 統計を確認
    await page.locator('#btn-stats').click();
    const statValues = await page.locator('.stat-value').allTextContents();
    const totalAttempts = parseInt(statValues[2] || '0');
    expect(totalAttempts).toBeGreaterThanOrEqual(3);
  });
});
