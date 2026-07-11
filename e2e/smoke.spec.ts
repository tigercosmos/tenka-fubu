// Playwright smoke（規格：plan/17-testing.md §3.8；5 條，不增不減）。
// M1-27：僅落地 P1（載入標題）；P2–P5 依 18-roadmap.md 各自里程碑到位時於本檔陸續補上
// （M1-20／M2-19 等相依任務完成前，對應斷言的 data-testid 尚不存在）。
import { test, expect } from './fixtures';

test.describe('Playwright smoke（17 §3.8）', () => {
  test('P1 載入標題：screen-title 可見，頁面含「天下布武」字樣，無 console error', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByText('天下布武')).toBeVisible();
  });
});
