/**
 * user-test.js
 * ペルソナ別ユーザーテスト: Playwright Headless Chrome で実際のアプリを操作し
 * UXフィードバックを収集する。
 *
 * Usage: node scripts/user-test.js [persona_index]
 * Output: scripts/ux-feedback-{timestamp}.json
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PERSONAS = [
  {
    id: 'A1',
    name: '田中美咲（30代・継続モチベーション）',
    device: 'mobile',
    viewport: { width: 390, height: 844 },
    behavior: {
      targetExam: 'CLF',
      answerCorrectRate: 0.55,   // 55%正答率（初学者）
      skipRate: 0.15,            // 15%でスキップ
      goToStats: true,
      checkSettings: false,
      examMode: false,
      sessionLength: 10,          // 10問解く
    },
    expectations: [
      'SRSが動いている実感',
      '次回復習タイミングの可視化',
      '今日の目標達成感',
    ],
  },
  {
    id: 'B1',
    name: '佐藤健一（エンジニア・信頼性重視）',
    device: 'desktop',
    viewport: { width: 1280, height: 900 },
    behavior: {
      targetExam: 'SAA',
      answerCorrectRate: 0.75,
      skipRate: 0.05,
      goToStats: true,
      checkSettings: true,
      examMode: true,
      sessionLength: 15,
    },
    expectations: [
      'カテゴリドリルの使いやすさ',
      '統計情報の正確性',
      '模擬試験モードの品質',
    ],
  },
  {
    id: 'C1',
    name: '山田蓮（就活学生・初回体験）',
    device: 'mobile',
    viewport: { width: 390, height: 844 },
    behavior: {
      targetExam: 'CLF',
      answerCorrectRate: 0.45,
      skipRate: 0.25,
      goToStats: false,
      checkSettings: false,
      examMode: false,
      sessionLength: 7,
    },
    expectations: [
      '初回の使い方理解',
      '選択肢の視認性',
      '正解後のフィードバック',
    ],
  },
  {
    id: 'A2',
    name: '田中美咲（2回目）・カテゴリドリル利用',
    device: 'mobile',
    viewport: { width: 390, height: 844 },
    behavior: {
      targetExam: 'MLA',
      answerCorrectRate: 0.60,
      skipRate: 0.10,
      goToStats: true,
      drillCategory: true,
      checkSettings: false,
      examMode: false,
      sessionLength: 12,
    },
    expectations: [
      'カテゴリ別の習熟度可視化',
      '苦手問題への誘導',
    ],
  },
  {
    id: 'B2',
    name: '佐藤健一（2回目）・統計詳細確認',
    device: 'desktop',
    viewport: { width: 1440, height: 900 },
    behavior: {
      targetExam: 'DVA',
      answerCorrectRate: 0.80,
      skipRate: 0.03,
      goToStats: true,
      checkSettings: true,
      examMode: false,
      sessionLength: 20,
    },
    expectations: [
      'カテゴリ分布の適切さ',
      '予測スコアの信頼性',
      'バックアップ機能',
    ],
  },
  {
    id: 'C2',
    name: '山田蓮（2回目）・複数選択問題',
    device: 'mobile',
    viewport: { width: 393, height: 852 },
    behavior: {
      targetExam: 'SAA',
      answerCorrectRate: 0.50,
      skipRate: 0.20,
      goToStats: false,
      checkSettings: false,
      examMode: false,
      sessionLength: 8,
    },
    expectations: [
      '複数選択問題のUI明確さ',
      '解説の分かりやすさ',
    ],
  },
  {
    id: 'D1',
    name: '新ペルソナ：中村拓（40代・受験直前）',
    device: 'desktop',
    viewport: { width: 1366, height: 768 },
    behavior: {
      targetExam: 'SAA',
      answerCorrectRate: 0.70,
      skipRate: 0.05,
      goToStats: true,
      checkSettings: false,
      examMode: true,
      sessionLength: 10,
    },
    expectations: [
      '模擬試験の完成度',
      '弱点分野の特定',
    ],
  },
  {
    id: 'E1',
    name: '新ペルソナ：鈴木花（25代・独学初心者）',
    device: 'mobile',
    viewport: { width: 375, height: 667 },
    behavior: {
      targetExam: 'AIF',
      answerCorrectRate: 0.40,
      skipRate: 0.30,
      goToStats: false,
      checkSettings: false,
      examMode: false,
      sessionLength: 5,
    },
    expectations: [
      '難易度感の適切さ',
      'スキップ後の体験',
    ],
  },
  {
    id: 'B3',
    name: '佐藤健一（3回目）・DOP模擬試験',
    device: 'desktop',
    viewport: { width: 1280, height: 800 },
    behavior: {
      targetExam: 'SAA',
      answerCorrectRate: 0.82,
      skipRate: 0.02,
      goToStats: true,
      checkSettings: false,
      examMode: false,
      sessionLength: 8,
    },
    expectations: [
      'カテゴリ整合性（CI/CD・IaC・監視）',
      'タイマーのUX',
    ],
  },
  {
    id: 'A3',
    name: '田中美咲（3回目）・連続学習',
    device: 'mobile',
    viewport: { width: 390, height: 844 },
    behavior: {
      targetExam: 'SOA',
      answerCorrectRate: 0.65,
      skipRate: 0.08,
      goToStats: true,
      drillCategory: true,
      checkSettings: false,
      examMode: false,
      sessionLength: 15,
    },
    expectations: [
      'SRS復習タイミングの見える化',
      '連続学習日数表示',
    ],
  },
];

async function runPersonaTest(persona, index) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: persona.viewport,
    userAgent: persona.device === 'mobile'
      ? 'Mozilla/5.0 (Linux; Android 12; Pixel 7) AppleWebKit/537.36'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  const observations = [];
  const errors = [];
  const timings = {};

  // エラーキャプチャ
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  try {
    // ── 1. アプリ起動 ──
    const t0 = Date.now();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    timings.pageLoad = Date.now() - t0;

    // スクリーンショット: トップ画面
    await page.screenshot({ path: `scripts/screenshots/persona-${persona.id}-01-top.png`, fullPage: false }).catch(() => {});

    // ── 2. 試験選択 ──
    const examCards = await page.locator('.exam-card').count();
    observations.push({ step: 'exam-selection', examCount: examCards, note: `${examCards}試験が表示される` });

    // 対象試験を探してクリック
    const examCard = page.locator('.exam-card').filter({ hasText: persona.behavior.targetExam }).first();
    const examCardCount = await examCard.count();
    if (examCardCount > 0) {
      await examCard.click();
      await page.waitForTimeout(500);
    } else {
      // 最初の試験を選択
      await page.locator('.exam-card').first().click();
      await page.waitForTimeout(500);
    }

    // 試験選択後の「始める」ボタン
    const startBtn = page.locator('.exam-start-btn, #start-btn, button').filter({ hasText: /始める|スタート|学習開始/ }).first();
    if (await startBtn.count() > 0) {
      await startBtn.click();
      await page.waitForTimeout(500);
    }

    // ── 3. 学習セッション ──
    const questionTexts = [];
    for (let q = 0; q < persona.behavior.sessionLength; q++) {
      // 問題文確認
      const questionEl = page.locator('#question-text, .question-text').first();
      const qCount = await questionEl.count();
      if (qCount === 0) break;

      const questionText = await questionEl.textContent().catch(() => '');
      questionTexts.push(questionText.slice(0, 50));

      // スキップするか回答するか
      const shouldSkip = Math.random() < persona.behavior.skipRate;
      if (shouldSkip) {
        const skipBtn = page.locator('#btn-skip, .btn-skip').first();
        if (await skipBtn.isVisible().catch(() => false)) {
          await skipBtn.click();
          await page.waitForTimeout(400);
          observations.push({ step: `q${q+1}`, action: 'skip' });
        }
      } else {
        // 選択肢から回答
        const choices = page.locator('.choice-btn:not(:disabled)');
        const choiceCount = await choices.count();
        if (choiceCount > 0) {
          const isMulti = await page.locator('#multi-submit-area').isVisible().catch(() => false);
          const correctRate = persona.behavior.answerCorrectRate;

          if (isMulti) {
            // 複数選択: required count を取得
            const required = parseInt(await page.locator('#multi-required').textContent().catch(() => '2'));
            const toSelect = Math.min(required, choiceCount);
            for (let i = 0; i < toSelect; i++) {
              await choices.nth(i).click().catch(() => {});
              await page.waitForTimeout(100);
            }
            const submitBtn = page.locator('#multi-submit-btn');
            if (await submitBtn.isEnabled().catch(() => false)) {
              await submitBtn.click();
              await page.waitForTimeout(400);
            }
          } else {
            // 単一選択
            const idx = Math.random() < correctRate ? 0 : Math.min(1, choiceCount - 1);
            await choices.nth(idx).click().catch(() => {});
            await page.waitForTimeout(400);
          }
          observations.push({ step: `q${q+1}`, action: 'answered', choiceCount });
        }
      }

      // 解説トグル（30%で開く）
      if (Math.random() < 0.3) {
        const expToggle = page.locator('#explanation-toggle');
        if (await expToggle.isVisible().catch(() => false)) {
          await expToggle.click();
          await page.waitForTimeout(200);
        }
      }

      // 次へ
      const nextBtn = page.locator('#next-btn, .next-btn').first();
      if (await nextBtn.isEnabled().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // スクリーンショット: 問題画面
    await page.screenshot({ path: `scripts/screenshots/persona-${persona.id}-02-study.png`, fullPage: false }).catch(() => {});

    // ── 4. 統計画面 ──
    if (persona.behavior.goToStats) {
      // #btn-stats は aria-label="統計" の📊ボタン（直接IDで指定）
      const statsBtn = page.locator('#btn-stats');
      if (await statsBtn.count() > 0 && await statsBtn.isVisible().catch(() => false)) {
        await statsBtn.click();
        await page.waitForSelector('#screen-stats.active', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `scripts/screenshots/persona-${persona.id}-03-stats.png`, fullPage: false }).catch(() => {});

        const categoryItems = await page.locator('#category-stats .category-item').count();
        observations.push({ step: 'stats', categoryCount: categoryItems, note: `${categoryItems}カテゴリ表示` });

        // カテゴリドリル（カテゴリが表示されている場合のみ実施）
        if (persona.behavior.drillCategory && categoryItems > 0) {
          await page.locator('#category-stats .category-item').first().click().catch(() => {});
          await page.waitForTimeout(400);
          observations.push({ step: 'category-drill', action: 'clicked' });
        }

        // 統計画面から問題画面に戻る
        const backBtn = page.locator('#stats-back-btn, #btn-resume-study');
        if (await backBtn.first().isVisible().catch(() => false)) {
          await backBtn.first().click();
          await page.waitForTimeout(300);
        }
      }
    }

    // ── 5. 設定画面 ──
    if (persona.behavior.checkSettings) {
      const settingsBtn = page.locator('[data-screen="settings"], #nav-settings, button').filter({ hasText: /設定|Settings/ }).first();
      if (await settingsBtn.count() > 0) {
        await settingsBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `scripts/screenshots/persona-${persona.id}-04-settings.png`, fullPage: false }).catch(() => {});
        observations.push({ step: 'settings', note: '設定画面到達' });
      }
    }

    // ── 6. 模擬試験モード ──
    if (persona.behavior.examMode) {
      // 試験選択に戻る
      const homeBtn = page.locator('[data-screen="home"], #nav-home, button').filter({ hasText: /ホーム|試験選択|Home/ }).first();
      if (await homeBtn.count() > 0) {
        await homeBtn.click();
        await page.waitForTimeout(400);
      }

      // 模擬試験ボタン（Sprint1でラベル追加: "#btn-exam-mode" → 📝 + "模試" テキスト）
      const examBtn = page.locator('#btn-exam-mode');
      if (await examBtn.isVisible().catch(() => false)) {
        await examBtn.click();
        await page.waitForTimeout(400);
        // モーダルが出た場合は開始ボタンをクリック
        const modalStart = page.locator('.exam-modal button').filter({ hasText: /開始|Start/ }).first();
        if (await modalStart.isVisible().catch(() => false)) {
          await modalStart.click();
          await page.waitForTimeout(400);
          observations.push({ step: 'exam-mode', note: '模擬試験開始' });
        } else {
          observations.push({ step: 'exam-mode', note: '模擬試験ボタンクリック成功（モーダル未表示）' });
        }
      }
    }

  } catch (err) {
    errors.push(`テスト中エラー: ${err.message}`);
  }

  // ── UI観察: アクセシビリティ・パフォーマンス観点 ──
  const uiChecks = {};
  try {
    uiChecks.hasProgressBar = await page.locator('.progress-bar-bg, .progress-bar').count() > 0;
    uiChecks.hasNextReview = await page.locator('#next-review').count() > 0;
    uiChecks.hasCategoryList = await page.locator('.category-item, .cat-row').count() > 0;
    uiChecks.pageTitle = await page.title();
    uiChecks.questionCardVisible = await page.locator('.question-card').isVisible().catch(() => false);
  } catch (_) {}

  await browser.close();

  return {
    persona: { id: persona.id, name: persona.name, device: persona.device },
    timings,
    observations,
    errors,
    uiChecks,
    expectations: persona.expectations,
    feedback: generateFeedback(persona, observations, errors, timings, uiChecks),
  };
}

function generateFeedback(persona, observations, errors, timings, uiChecks) {
  const feedback = [];

  // ページロード時間チェック
  if (timings.pageLoad > 2000) {
    feedback.push({ severity: 'high', category: 'performance', message: `初回ロードが ${timings.pageLoad}ms かかった。3G環境では厳しい。` });
  } else if (timings.pageLoad > 1000) {
    feedback.push({ severity: 'medium', category: 'performance', message: `ロード ${timings.pageLoad}ms。改善の余地あり。` });
  } else {
    feedback.push({ severity: 'positive', category: 'performance', message: `ロード ${timings.pageLoad}ms。快適。` });
  }

  // エラーチェック
  if (errors.length > 0) {
    errors.forEach(e => feedback.push({ severity: 'critical', category: 'error', message: e }));
  }

  // スキップ行動
  const skipCount = observations.filter(o => o.action === 'skip').length;
  if (skipCount > 3) {
    feedback.push({ severity: 'medium', category: 'ux', message: `${skipCount}回スキップした。問題が難しすぎるか、答えを見る導線が使いやすすぎる可能性。` });
  }

  // 統計到達
  const statsObs = observations.find(o => o.step === 'stats');
  if (statsObs && statsObs.categoryCount === 0) {
    feedback.push({ severity: 'medium', category: 'ux', message: 'カテゴリリストが統計画面に表示されなかった。' });
  }

  // ペルソナ固有フィードバック
  if (persona.id.startsWith('C')) {
    feedback.push({ severity: 'info', category: 'onboarding', message: '初回ヒント（study-first-hint）の表示タイミングが適切か要確認。localStorage初期状態でテスト必要。' });
  }

  if (persona.behavior.examMode) {
    const examObs = observations.find(o => o.step === 'exam-mode');
    if (!examObs) {
      feedback.push({ severity: 'medium', category: 'exam-mode', message: '模擬試験ボタンが見つからなかった or 操作に失敗。導線を確認。' });
    }
  }

  if (persona.device === 'mobile') {
    feedback.push({ severity: 'info', category: 'mobile', message: 'モバイル viewport でのタップ領域・フォントサイズを目視確認するためのスクリーンショットを保存。' });
  }

  // カテゴリドリル
  const drillObs = observations.find(o => o.step === 'category-drill');
  if (persona.behavior.drillCategory && !drillObs) {
    feedback.push({ severity: 'medium', category: 'category-drill', message: 'カテゴリドリルのタップが機能しなかった可能性。' });
  }

  return feedback;
}

async function checkServer(url = 'http://localhost:3000') {
  return new Promise(resolve => {
    const http = require('http');
    const req = http.get(url, res => { res.destroy(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  // サーバー疎通確認
  const serverReady = await checkServer();
  if (!serverReady) {
    console.error('\n⚠️  localhost:3000 に接続できません。');
    console.error('   先に静的サーバーを起動してください:');
    console.error('   npx serve src -p 3000 --no-clipboard\n');
    process.exit(1);
  }

  // screenshotディレクトリ確保
  const ssDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const results = [];
  console.log(`\n${'='.repeat(60)}`);
  console.log('ユーザーテスト開始: 10ペルソナ × Headless Chrome');
  console.log('='.repeat(60));

  for (let i = 0; i < PERSONAS.length; i++) {
    const persona = PERSONAS[i];
    console.log(`\n[${i+1}/10] ${persona.name} (${persona.device})`);
    try {
      const result = await runPersonaTest(persona, i);
      results.push(result);
      const critical = result.feedback.filter(f => f.severity === 'critical').length;
      const high = result.feedback.filter(f => f.severity === 'high').length;
      const positive = result.feedback.filter(f => f.severity === 'positive').length;
      console.log(`  → フィードバック: ${result.feedback.length}件 (critical:${critical} high:${high} positive:${positive})`);
      if (result.errors.length > 0) console.log(`  → エラー: ${result.errors.join('; ')}`);
    } catch (err) {
      console.error(`  → 失敗: ${err.message}`);
      results.push({ persona: { id: persona.id, name: persona.name }, error: err.message });
    }
  }

  // 結果保存
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(__dirname, `ux-feedback-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n結果保存: ${outPath}`);

  // サマリー
  console.log('\n── フィードバック サマリー ──');
  const allFeedback = results.flatMap(r => r.feedback || []);
  const byCategory = {};
  allFeedback.forEach(f => {
    byCategory[f.category] = byCategory[f.category] || [];
    byCategory[f.category].push(f);
  });
  Object.entries(byCategory).forEach(([cat, items]) => {
    const critical = items.filter(i => i.severity === 'critical').length;
    const high = items.filter(i => i.severity === 'high').length;
    console.log(`  ${cat}: ${items.length}件 (critical:${critical} high:${high})`);
  });

  return outPath;
}

main().then(outPath => {
  console.log('\nユーザーテスト完了');
  process.exit(0);
}).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
