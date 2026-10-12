import { completeNewGameWizard } from './new-game-wizard';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function newGame(page: Page): Promise<void> {
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
}

test('title preferences persist on reload and configure only the next session speed', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-settings').click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('radio', { name: '×5', exact: true }).check();
  await settings.getByRole('radio', { name: '僅重大', exact: true }).check();
  await settings.getByRole('radio', { name: '低', exact: true }).check();
  await settings.getByRole('switch', { name: '地圖特效', exact: true }).uncheck();
  await settings.getByRole('switch', { name: '外交來使', exact: true }).uncheck();
  const scale = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await scale.press('Home');
  for (let step = 0; step < 9; step++) await scale.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe('20px');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontSize))
    .toBe('17.5px');
  await page.reload();
  await page.getByTestId('title-settings').click();
  await expect(settings.getByRole('radio', { name: '×5', exact: true })).toBeChecked();
  await expect(settings.getByRole('radio', { name: '低', exact: true })).toBeChecked();
  await expect(settings.getByRole('switch', { name: '外交來使', exact: true })).not.toBeChecked();
  await expect(settings.getByRole('switch', { name: '地圖特效', exact: true })).not.toBeChecked();
  await expect(settings.getByRole('slider', { name: '介面縮放', exact: true })).toHaveValue('1.25');
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await newGame(page);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-5')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('speed-pause').click();
});

test('system settings retain their owned pause, preserve the map viewport and confirm leaving', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await newGame(page);
  const canvas = page.getByTestId('map-canvas-host').locator('canvas');
  await expect(canvas).toBeVisible();
  const viewport = await canvas.boundingBox();
  await page.getByTestId('speed-2').click();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('speed-5')).toBeDisabled();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('radio', { name: '×5', exact: true }).check();
  await settings.getByRole('slider', { name: '介面縮放', exact: true }).press('End');
  await expect.poll(() => canvas.boundingBox()).toEqual(viewport);
  await page.keyboard.press('3');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('speed-pause').click();
  await page.evaluate(() => window.__tenka.debug.stepDays(1));
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '回到標題', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByRole('button', { name: '回到標題', exact: true }).first().click();
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.getByTestId('screen-title')).toBeVisible();
});

test('disabled arrival preferences cannot suppress mandatory proposal decisions', async ({
  page,
}) => {
  await page.goto('/?debug=1');
  await page.getByTestId('title-settings').click();
  await page.getByRole('switch', { name: '具申送達', exact: true }).uncheck();
  await page.getByRole('switch', { name: '月初', exact: true }).uncheck();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.evaluate(() => window.__tenka.debug.startM6Flow());
  await expect(page.getByTestId('proposal-inbox')).toBeVisible();
  for (const key of ['1', '2', '3']) await page.keyboard.press(key);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('speed-5')).toBeDisabled();
  await expect(page.getByTestId('proposal-inbox')).toBeVisible();
});
