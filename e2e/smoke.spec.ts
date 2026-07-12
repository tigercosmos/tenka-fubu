// Playwright smoke（規格：plan/17-testing.md §3.8；5 條，不增不減）。
// M1-27：僅落地 P1（載入標題）；M2-20：補上 P2（開新局選織田，18-roadmap.md M2-20）。
// P3–P5 依 18-roadmap.md 各自里程碑到位時於本檔陸續補上（相依任務完成前，對應斷言的
// data-testid 尚不存在）。
import { test, expect } from './fixtures';

test.describe('Playwright smoke（17 §3.8）', () => {
  test('P1 載入標題：screen-title 可見，頁面含「天下布武」字樣，無 console error', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByText('天下布武')).toBeVisible();
  });

  test('P2 開新局選織田：screen-strategy 可見，hud-date 顯示 s1560 開局日期（1560年），無 console error', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await page.getByTestId('newgame-start').click();

    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByTestId('hud-date')).toContainText('1560年');
  });
});
