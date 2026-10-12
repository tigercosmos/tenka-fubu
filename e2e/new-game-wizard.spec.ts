import { readFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

async function chooseScenarioAndOda(page: Page): Promise<void> {
  await page.getByTestId('title-newgame').click();
  await expect(
    page.getByRole('list', { name: '新遊戲步驟' }).locator('[aria-current="step"]'),
  ).toContainText('選擇劇本');
  await page.getByTestId('scenario-pick-s1560').click();
  await expect(page.getByTestId('screen-daimyo-select')).toBeVisible();
  await expect(page.getByTestId('daimyo-next')).toBeDisabled();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('daimyo-next').click();
  await expect(page.getByTestId('screen-difficulty-select')).toBeVisible();
}

async function readableInViewport(target: Locator, name: string, action = false): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, `${name} is rendered`).not.toBeNull();
  expect(box!.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(1280);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(720);
  if (action) {
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(32);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(32);
  }
}

async function captureStep(
  page: Page,
  info: TestInfo,
  scale: number,
  name: string,
  screen: Locator,
  action: Locator,
): Promise<void> {
  await expect(screen).toBeVisible();
  await readableInViewport(screen.getByRole('heading', { level: 1 }), `${name} heading`);
  await readableInViewport(screen.getByRole('list', { name: '新遊戲步驟' }), `${name} progress`);
  await readableInViewport(action, `${name} action`, true);
  await page.screenshot({ path: info.outputPath(`wizard-${scale}-${name}.png`) });
}

for (const scale of [1, 1.5]) {
  test(`four real steps retain choices and invalid seed text at scale ${scale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?debug=1&seed=42');
    if (scale === 1.5) {
      await page.getByTestId('title-settings').click();
      const settings = page.getByRole('dialog');
      const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
      await slider.press('End');
      await expect(slider).toHaveValue('1.5');
      await settings.getByRole('button', { name: '返回', exact: true }).click();
    }
    await page.getByTestId('title-newgame').click();
    const scenario = page.getByTestId('screen-scenario-select');
    await expect(scenario.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(
      page,
      info,
      scale,
      'scenario',
      scenario,
      page.getByTestId('scenario-pick-s1560'),
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('scenario-pick-s1560')).toBeFocused();
    await page.keyboard.press('Enter');
    const daimyo = page.getByTestId('screen-daimyo-select');
    await expect(daimyo.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByTestId('daimyo-next')).toBeDisabled();
    await page.getByTestId('clan-pick-clan.oda').click();
    await captureStep(page, info, scale, 'daimyo', daimyo, page.getByTestId('daimyo-next'));
    await page.getByTestId('daimyo-next').click();
    const difficulty = page.getByTestId('screen-difficulty-select');
    await expect(difficulty.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(
      page,
      info,
      scale,
      'difficulty',
      difficulty,
      page.getByTestId('difficulty-next'),
    );
    await expect(page.getByTestId('screen-strategy')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '中級' })).toBeChecked();
    await page.getByRole('radio', { name: '上級' }).check();
    await page.getByTestId('difficulty-back').click();
    await expect(page.getByTestId('clan-pick-clan.oda')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('daimyo-next').click();
    await expect(page.getByRole('radio', { name: '上級' })).toBeChecked();
    await page.getByTestId('difficulty-next').click();
    const seedScreen = page.getByTestId('screen-seed-select');
    await expect(seedScreen.getByRole('heading', { level: 1 })).toBeFocused();
    await captureStep(page, info, scale, 'seed', seedScreen, page.getByTestId('newgame-start'));
    const seed = page.getByTestId('newgame-seed');
    await expect(seed).toHaveValue('42');
    for (const invalid of ['', '-1', '1.5', 'NaN', '4294967296']) {
      await seed.fill(invalid);
      await expect(page.getByTestId('newgame-start')).toBeDisabled();
    }
    await page.getByTestId('seed-back').click();
    await page.getByTestId('difficulty-next').click();
    await expect(seed).toHaveValue('4294967296');
    await seed.fill('00042');
    await expect(page.getByTestId('newgame-start')).toBeEnabled();
    await seed.fill('4294967295');
    await expect(page.getByTestId('newgame-start')).toBeEnabled();
    await seed.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('newgame-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    const game = await page.evaluate(() => window.__tenka.debug.getState());
    expect(game.meta.playerClanId).toBe('clan.oda');
    expect(game.meta.difficulty).toBe('hard');
    expect(game.meta.seed).toBe(4294967295);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  });
}

test('the same selected clan, difficulty and seed start identical game state', async ({ page }) => {
  async function boot(): Promise<unknown> {
    await page.goto('/?debug=1&seed=0');
    await chooseScenarioAndOda(page);
    await page.getByRole('radio', { name: '初級' }).check();
    await page.getByTestId('difficulty-next').click();
    await expect(page.getByTestId('newgame-seed')).toHaveValue('0');
    await page.getByTestId('newgame-start').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    await expect(page.getByTestId('save-load-panel')).toHaveAttribute('aria-busy', 'false');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出目前進度', exact: true }).click();
    const path = await (await downloading).path();
    if (path === null) throw new Error('Expected canonical SaveFile download');
    const exported = JSON.parse(await readFile(path, 'utf8')) as { state: unknown };
    return exported.state;
  }
  expect(await boot()).toEqual(await boot());
});
