/**
 * ux-capture.js
 * アプリの主要画面をPlaywrightで操作・スクリーンショット撮影
 * 使い方: node scripts/ux-capture.js
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'ux-screenshots');
fs.mkdirSync(outDir, { recursive: true });

const execAsync = promisify(exec);

async function capture(page, name, desc) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`📸 ${name}: ${desc}`);
  return file;
}

async function waitForQuestion(page) {
  await page.waitForFunction(() => {
    const t = document.getElementById('question-text')?.textContent;
    return t && t !== '問題を読み込んでいます...' && t.length > 0;
  }, { timeout: 10000 });
  // 選択肢のフェードインアニメーション（最大 0.23 + 0.2 = 0.43s）が完了するまで待つ
  await page.waitForTimeout(500);
}

// ローカルサーバーを起動
let serverProc = null;
async function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = exec('npx serve src -p 3001 --no-clipboard', { cwd: path.join(__dirname, '..') });
    serverProc.stdout.on('data', (data) => {
      if (data.includes('3001') || data.includes('Accepting')) {
        setTimeout(resolve, 500);
      }
    });
    serverProc.stderr.on('data', () => {});
    setTimeout(resolve, 2000); // 最大2秒待つ
  });
}

(async () => {
  console.log('🚀 サーバー起動中...');
  await startServer();

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });

  // モバイルビュー（スマホユーザー想定）
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const mpage = await mobile.newPage();

  // デスクトップビュー
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const dpage = await desktop.newPage();

  try {
    // ── 1. 試験選択画面（モバイル）──
    await mpage.goto('http://localhost:3001/', { waitUntil: 'load' });
    await mpage.waitForSelector('.exam-card', { timeout: 10000 });
    await capture(mpage, '01_exam-select_mobile', '試験選択画面（モバイル）');

    // ── 2. 試験選択画面（デスクトップ）──
    await dpage.goto('http://localhost:3001/', { waitUntil: 'load' });
    await dpage.waitForSelector('.exam-card', { timeout: 10000 });
    await capture(dpage, '02_exam-select_desktop', '試験選択画面（デスクトップ）');

    // ── 3. CLF 問題画面（モバイル）──
    await mpage.locator('.exam-card').filter({ hasText: 'CLF' }).click();
    await waitForQuestion(mpage);
    await capture(mpage, '03_study_mobile_clf', 'CLF学習画面（モバイル）- 回答前');

    // ── 4. 正解して解説が表示された状態 ──
    const choiceBtns = mpage.locator('.choice-btn');
    const count = await choiceBtns.count();
    // 最初の選択肢をクリック（正解か不正解かはランダム）
    await choiceBtns.first().click();
    await mpage.waitForSelector('#answer-area:not(.hidden)', { timeout: 5000 });
    await capture(mpage, '04_study_mobile_answered', '回答後の結果画面（モバイル）');

    // ── 5. 解説を展開 ──
    const expToggle = mpage.locator('#explanation-toggle');
    if (await expToggle.isVisible()) {
      // すでに展開されていなければクリック
      const expText = mpage.locator('#explanation-text');
      const isHidden = await expText.evaluate(el => el.classList.contains('hidden') || getComputedStyle(el).display === 'none');
      if (isHidden) {
        await expToggle.click();
        await mpage.waitForTimeout(300);
      }
    }
    await capture(mpage, '05_study_mobile_explanation', '解説展開状態（モバイル）');

    // ── 6. 次の問題へ（2問目）──
    await mpage.locator('#next-btn').click();
    await mpage.waitForFunction(() => document.getElementById('answer-area')?.classList.contains('hidden'));
    await capture(mpage, '06_study_mobile_q2', '2問目（モバイル）');

    // ── 7. スキップ ──
    await mpage.locator('#btn-skip').click();
    await mpage.waitForSelector('#answer-area:not(.hidden)', { timeout: 5000 });
    await capture(mpage, '07_study_mobile_skipped', 'スキップ後（モバイル）');

    // ── 8. 試験選択に戻る ──
    await mpage.locator('#next-btn').click();
    await mpage.waitForFunction(() => document.getElementById('answer-area')?.classList.contains('hidden'));
    // 試験変更
    const changeBtn = mpage.locator('#btn-change-exam');
    if (await changeBtn.isVisible()) {
      await changeBtn.click();
      await mpage.waitForSelector('#screen-select.active', { timeout: 5000 });
      await capture(mpage, '08_exam-select-back_mobile', '試験選択に戻った状態（進捗あり）');
    }

    // ── 9. 設定画面 ──
    const settingsBtn = mpage.locator('#btn-settings-from-select');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
    } else {
      await mpage.locator('#btn-settings').click();
    }
    await mpage.waitForSelector('#screen-settings.active', { timeout: 5000 });
    await capture(mpage, '09_settings_mobile', '設定画面（モバイル）');

    // 設定画面をスクロール
    await mpage.locator('.settings-content').evaluate(el => el.scrollTop = 500);
    await mpage.waitForTimeout(200);
    await capture(mpage, '09b_settings_mobile_scrolled', '設定画面スクロール後');

    // 設定から戻る
    await mpage.locator('.screen.active .back-btn').click();
    await mpage.waitForTimeout(300);

    // ── 10. SAA を選択して統計画面確認 ──
    await mpage.locator('.exam-card').filter({ hasText: 'SAA' }).first().click();
    await waitForQuestion(mpage);
    // 数問答える
    for (let i = 0; i < 3; i++) {
      await mpage.locator('.choice-btn').first().click();
      await mpage.waitForSelector('#answer-area:not(.hidden)', { timeout: 5000 });
      await mpage.locator('#next-btn').click();
      await mpage.waitForFunction(() => document.getElementById('answer-area')?.classList.contains('hidden'));
    }
    // 統計ボタン
    await mpage.locator('#btn-stats').click();
    await mpage.waitForSelector('#screen-stats.active', { timeout: 5000 });
    await capture(mpage, '10_stats_mobile', '統計画面（モバイル）');

  } catch (err) {
    console.error('❌ エラー:', err.message);
    await capture(mpage, 'error-state', 'エラー発生時の状態').catch(() => {});
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  console.log(`\n✅ スクリーンショット保存先: ${outDir}`);
  console.log('📁 ファイル一覧:');
  fs.readdirSync(outDir).forEach(f => console.log(`   ${f}`));
})();
