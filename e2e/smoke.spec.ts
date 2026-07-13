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

  test('P3 推進 3 個月：x5 到月份 +3，暫停後日期不再前進', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await page.getByTestId('newgame-start').click();

    const initialDate = await page.getByTestId('hud-date').textContent();
    const initialMatch = initialDate?.match(/(\d+)年(\d+)月/);
    expect(initialMatch).not.toBeNull();
    const initialMonthIndex = Number(initialMatch?.[1]) * 12 + Number(initialMatch?.[2]) - 1;
    const targetMonthIndex = initialMonthIndex + 3;

    await page.getByTestId('speed-5').click();
    await expect
      .poll(
        async () => {
          // 月初自動暫停是既有契約；月摘要尚未在 M3 掛 UI，smoke 直接恢復 ×5 繼續觀察三個月。
          if ((await page.getByTestId('speed-pause').getAttribute('aria-pressed')) === 'true') {
            await page.getByTestId('speed-5').click();
          }
          const text = await page.getByTestId('hud-date').textContent();
          const match = text?.match(/(\d+)年(\d+)月/);
          return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : -1;
        },
        { timeout: 120_000 },
      )
      .toBeGreaterThanOrEqual(targetMonthIndex);
    await expect(page.getByTestId('error-boundary')).toHaveCount(0);

    await page.getByTestId('speed-pause').click();
    const pausedDate = await page.getByTestId('hud-date').textContent();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('hud-date')).toHaveText(pausedDate ?? '');
  });

  test('P5 直達合戰畫面：debug-battle-01 可載入並撤退回策略畫面', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.evaluate(() => {
      const debugWindow = window as unknown as {
        __tenka: { debug: { startBattle(layoutId: string): void } };
      };
      debugWindow.__tenka.debug.startBattle('debug-battle-01');
    });

    await expect(page.getByTestId('screen-battle')).toBeVisible();
    await page.getByTestId('battle-retreat').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
  });
});
