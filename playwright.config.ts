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
  // maxDiffPixelRatio 只吸收跨平台反鋸齒／字型 hinting 微差,不得放寬到掩蓋真實回歸；
  // animations:'disabled' 讓 CSS transition／animation 定格,避免截圖時序閃動。
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }], // 00 §1.5：僅 chromium
});
