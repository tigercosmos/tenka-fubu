// Playwright 設定（規格：plan/01-architecture.md §3.7.6 canonical 範例；
// 補充項見 plan/17-testing.md §3.8 前置：僅 chromium、每條逾時 60 秒、全套 < 5 分鐘、
// trace on failure（17 §3.11.1／T10））。
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout: 5 * 60_000, // 17 §3.8：全套 < 5 分鐘
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure', // 17 §3.11.1／T10：trace on failure
  },
  // 17 §3.9.3：M6-V2 視覺回歸 gate（`e2e/visual.spec.ts`）toHaveScreenshot 門檻——
  // 100 changed pixels catches thin-road regressions that the old 1% allowance missed.
  // animations:'disabled' 讓 CSS transition／animation 定格,避免截圖時序閃動。
  expect: {
    toHaveScreenshot: { maxDiffPixels: 100, threshold: 0.15, animations: 'disabled' },
  },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Full Chromium's new headless mode can use the reference GPU without opening a window.
        ...(process.env.VISUAL_GPU === '1'
          ? {
              channel: 'chromium',
              headless: true,
              launchOptions: {
                headless: true,
                ...(process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {}),
              },
            }
          : {}),
      },
    },
  ], // 00 §1.5：僅 chromium
});
