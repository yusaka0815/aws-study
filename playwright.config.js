import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
