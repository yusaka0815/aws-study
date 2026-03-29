import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// BDD: Gherkin feature ファイルから自動生成されるテストディレクトリ
const bddDir = defineBddConfig({
  features: 'tests/e2e/features/**/*.feature',
  steps: 'tests/e2e/steps/**/*.js',
});

export default defineConfig({
  timeout: 30_000,
  retries: process.env.CI ? 2 : 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['line'],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // テスト開始前に src/ をローカルサーバーで配信
  webServer: {
    command: 'npx serve src -p 3000 --no-clipboard',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    // ── 既存のリグレッション・技術テスト（study.spec.js）──
    {
      name: 'chromium',
      testDir: './tests/e2e',
      testMatch: '*.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      testDir: './tests/e2e',
      testMatch: '*.spec.js',
      use: { ...devices['Pixel 7'] },
    },

    // ── BDD ユーザージャーニーテスト（*.feature）──
    {
      name: 'bdd-chromium',
      testDir: bddDir,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'bdd-mobile',
      testDir: bddDir,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
