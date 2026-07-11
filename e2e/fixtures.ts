// Playwright smoke 共用前置（規格：plan/17-testing.md §3.8 開頭：
// 「共用前置：監聽 console 的 error 與 pageerror，出現即該條失敗」）。
// 每條 smoke（P1…）一律 import 本檔的 `test`／`expect`，而非直接用 '@playwright/test'，
// 以確保此前置對全部案例一致生效（不得每條各自重複接線）。
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ consoleErrorGuard: void }>({
  consoleErrorGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          problems.push(`[console.error] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => {
        problems.push(`[pageerror] ${err.message}`);
      });

      await use();

      expect(problems, `偵測到 console error／pageerror：\n${problems.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
