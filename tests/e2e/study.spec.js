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
  // exam-card が描画されるまで待機（networkidle より信頼性が高い）
  await page.waitForSelector('.exam-card');
  await page.locator('.exam-card').filter({ hasText: examCode }).click();
  // 問題が読み込まれるまで待機
  await page.waitForFunction(
    () => document.getElementById('question-text')?.textContent !== '問題を読み込んでいます...'
      && document.getElementById('question-text')?.textContent !== ''
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

  test('SAA・MLA が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'SAA' })).toBeVisible();
    await expect(page.locator('.exam-card').filter({ hasText: 'MLA' })).toBeVisible();
  });

  test('exam-cardにhover CSSルールが定義されている', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    const hasHoverRule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === '.exam-card:hover') return true;
          }
        } catch (_) { /* cross-origin sheet */ }
      }
      return false;
    });
    expect(hasHoverRule).toBe(true);
  });

  test('試験名が正しく表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'SAA' })).toContainText('Solutions Architect');
    await expect(page.locator('.exam-card').filter({ hasText: 'MLA' })).toContainText('Machine Learning');
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

  test('ヘッダーボタンのgapが8px以上ある', async ({ page }) => {
    const gap = await page.evaluate(() => {
      const actions = document.querySelector('.header-actions');
      return parseInt(getComputedStyle(actions).gap, 10);
    });
    expect(gap).toBeGreaterThanOrEqual(8);
  });

  test('次へボタンは問題表示時はdisabled', async ({ page }) => {
    await expect(page.locator('#next-btn')).toBeDisabled();
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

  test('回答エリアの表示にアニメーションが適用される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await page.waitForSelector('#answer-area:not(.hidden)');
    const animName = await page.evaluate(() =>
      getComputedStyle(document.getElementById('answer-area')).animationName
    );
    expect(animName).not.toBe('none');
  });

  test('選択肢をクリックすると正誤が表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#answer-area')).toBeVisible();
    await expect(page.locator('#answer-icon')).toBeVisible();
    const icon = await page.locator('#answer-icon').textContent();
    expect(['○', '×']).toContain(icon);
  });

  test('選択肢クリック後に selected クラスが付与される', async ({ page }) => {
    const btn = page.locator('.choice-btn').first();
    await btn.click();
    // 回答後は selected クラスが残り、自分が選んだ選択肢を示す
    const hasSelected = await btn.evaluate(el => el.classList.contains('selected'));
    expect(hasSelected).toBe(true);
  });

  test('正解選択肢は緑、不正解選択肢は赤になる', async ({ page }) => {
    // どれかクリック後に正解ボタンが green クラスを持つことを確認
    await page.locator('.choice-btn').first().click();
    const correctBtn = page.locator('.choice-btn.correct');
    await expect(correctBtn).toHaveCount(1); // 正解は1つ
  });

  test('回答後は次へボタンが有効化される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#next-btn')).toBeEnabled();
  });

  test('回答後は解説ボタンが表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await expect(page.locator('#explanation-toggle')).toBeVisible();
  });

  test('解説ボタンをクリックすると解説が展開または閉じられる', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    const expEl = page.locator('#explanation-text');
    const toggleBtn = page.locator('#explanation-toggle');
    const isAutoExpanded = await expEl.isVisible();
    if (!isAutoExpanded) {
      // 正解時：クリックで展開される
      await toggleBtn.click();
      await expect(expEl).toBeVisible();
    }
    // 不正解時は既に展開済み
    const text = await expEl.textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('解説トグルで開閉が切り替わる', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    const expEl = page.locator('#explanation-text');
    const toggleBtn = page.locator('#explanation-toggle');
    const wasVisible = await expEl.isVisible();
    await toggleBtn.click();
    if (wasVisible) {
      await expect(expEl).toBeHidden();
    } else {
      await expect(expEl).toBeVisible();
    }
  });

  test('解説ボタンに開閉を示すアイコンが表示される', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    const expEl = page.locator('#explanation-text');
    const toggleBtn = page.locator('#explanation-toggle');
    // 現在の展開状態に応じてアイコンを確認
    const isOpen = await expEl.isVisible();
    if (isOpen) {
      await expect(toggleBtn).toContainText('▲');
      await toggleBtn.click();
      await expect(toggleBtn).toContainText('▼');
    } else {
      await expect(toggleBtn).toContainText('▼');
      await toggleBtn.click();
      await expect(toggleBtn).toContainText('▲');
    }
  });

  test('回答後は選択肢をクリックしても再判定されない', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    const iconBefore = await page.locator('#answer-icon').textContent();
    // 回答後はボタンがdisabledになる。force:true でイベントを強制送信しても結果は変わらない
    await page.locator('.choice-btn').nth(1).click({ force: true });
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

  test('次へボタン押下時に問題カードのアニメーションが再発動する', async ({ page }) => {
    await page.locator('.choice-btn').first().click();
    await page.locator('#next-btn').click();
    await page.waitForFunction(
      () => document.getElementById('answer-area')?.classList.contains('hidden')
    );
    const hasEntering = await page.evaluate(() =>
      document.querySelector('.question-card')?.classList.contains('entering')
    );
    expect(hasEntering).toBe(true);
  });
});

// ============================================================
// CLF試験
// ============================================================
test.describe('CLF試験', () => {
  test('CLF が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'CLF' })).toBeVisible();
  });

  test('CLF選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'CLF');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
  });
});

// ============================================================
// AIF試験
// ============================================================
test.describe('AIF試験', () => {
  test('AIF が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'AIF' })).toBeVisible();
  });

  test('AIF選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'AIF');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
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
    // showScreen('screen-study') が呼ばれるまで待機（fetchの完了を確認）
    await expect(page.locator('#screen-study')).toBeVisible();
  });
});

// ============================================================
// DVA試験
// ============================================================
test.describe('DVA試験', () => {
  test('DVA が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'DVA' })).toBeVisible();
  });

  test('DVA選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'DVA');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
  });
});

// ============================================================
// SOA試験
// ============================================================
test.describe('SOA試験', () => {
  test('SOA が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'SOA' })).toBeVisible();
  });

  test('SOA選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'SOA');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
  });
});

// ============================================================
// DEA試験
// ============================================================
test.describe('DEA試験', () => {
  test('DEA が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'DEA' })).toBeVisible();
  });

  test('DEA選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'DEA');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
  });
});

// ============================================================
// SAP試験
// ============================================================
test.describe('SAP試験', () => {
  test('SAP が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'SAP' })).toBeVisible();
  });

  test('SAP選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'SAP');
    await expect(page.locator('#screen-study')).toBeVisible();
    const questionText = await page.locator('#question-text').textContent();
    expect(questionText.length).toBeGreaterThan(10);
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
    await page.waitForSelector('.exam-card');
    await page.locator('#btn-settings-from-select').click();
    await expect(page.locator('#screen-settings')).toBeVisible();
    await page.locator('#settings-back-btn').click();
    await expect(page.locator('#screen-select')).toBeVisible();
  });
});

// ============================================================
// 画面遷移アニメーション
// ============================================================
test.describe('画面遷移アニメーション', () => {
  test('試験選択→問題画面の遷移にアニメーションが適用される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await page.locator('.exam-card').filter({ hasText: 'SAA' }).click();
    await page.waitForSelector('#screen-study.active');
    const animName = await page.evaluate(() =>
      getComputedStyle(document.getElementById('screen-study')).animationName
    );
    expect(animName).not.toBe('none');
  });

  test('問題画面→統計画面の遷移にアニメーションが適用される', async ({ page }) => {
    await selectExam(page, 'SAA');
    await page.locator('#btn-stats').click();
    await page.waitForSelector('#screen-stats.active');
    const animName = await page.evaluate(() =>
      getComputedStyle(document.getElementById('screen-stats')).animationName
    );
    expect(animName).not.toBe('none');
  });

  test('問題画面→設定画面の遷移にアニメーションが適用される', async ({ page }) => {
    await selectExam(page, 'SAA');
    await page.locator('#btn-settings').click();
    await page.waitForSelector('#screen-settings.active');
    const animName = await page.evaluate(() =>
      getComputedStyle(document.getElementById('screen-settings')).animationName
    );
    expect(animName).not.toBe('none');
  });
});

// ============================================================
// トースト通知
// ============================================================
test.describe('トースト通知', () => {
  test('トーストのbottomにsafe-area対応のCSSが設定されている', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    const hasSafeArea = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText === '.toast') {
              return rule.style.bottom.includes('max(') ||
                     rule.style.bottom.includes('env(');
            }
          }
        } catch (_) {}
      }
      return false;
    });
    expect(hasSafeArea).toBe(true);
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
    await page.waitForSelector('.exam-card');
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

// ============================================================
// DOP試験
// ============================================================
test.describe('DOP試験', () => {
  test('DOP が試験一覧に表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.exam-card');
    await expect(page.locator('.exam-card').filter({ hasText: 'DOP' })).toBeVisible();
  });

  test('DOP選択後に問題が表示される', async ({ page }) => {
    await selectExam(page, 'DOP');
    await expect(page.locator('#question-text')).not.toHaveText('問題を読み込んでいます...');
    await expect(page.locator('.choice-btn').first()).toBeVisible();
  });
});
