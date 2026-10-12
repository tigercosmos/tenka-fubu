import { completeNewGameWizard } from './new-game-wizard';
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function startPausedGame(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('screen-too-small')).toHaveCount(0);
}

async function backgroundFocus(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function mode(page: Page): Promise<string> {
  return page.evaluate(() => window.__tenka.debug.getMapDiagnostics().analysisMode);
}

async function settledCameraFrame(page: Page): Promise<string> {
  const frame = page.getByTestId('minimap-frame');
  const pixels = () => frame.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
  let previous = await pixels();
  let stableSamples = 0;
  for (let sample = 0; sample < 30; sample++) {
    await page.waitForTimeout(75);
    const current = await pixels();
    stableSamples = current === previous ? stableSamples + 1 : 0;
    if (stableSamples >= 3) return current;
    previous = current;
  }
  throw new Error('Minimap camera frame did not settle');
}

function frameHash(frame: string): string {
  return createHash('sha256').update(frame).digest('hex');
}

test('minimum viewport map modes keep Tab navigation and input/modal ownership', async ({
  page,
}) => {
  await startPausedGame(page);
  await backgroundFocus(page);
  await page.keyboard.press('Tab');
  await expect.poll(() => mode(page)).toBe('faction');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => mode(page)).toBe('faction');
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await backgroundFocus(page);
  await page.keyboard.press('Alt+1');
  await expect.poll(() => mode(page)).toBe('none');
  for (const [key, expected] of [
    ['1', 'faction'],
    ['2', 'supply'],
    ['3', 'roadCapacity'],
    ['4', 'terrainAdvantage'],
    ['5', 'castleDefense'],
  ] as const) {
    await page.keyboard.press(`Alt+${key}`);
    await expect.poll(() => mode(page)).toBe(expected);
  }
  await page.keyboard.press('Alt+5');
  await expect.poll(() => mode(page)).toBe('none');

  await page.keyboard.press('F4');
  const list = page.getByTestId('officer-list');
  await expect(list).toBeVisible();
  const search = list.locator('input[type="search"]');
  await search.focus();
  await page.keyboard.press('m');
  await page.keyboard.press('1');
  await page.keyboard.press('Alt+2');
  await expect(search).toHaveValue('m1');
  await expect.poll(() => mode(page)).toBe('none');
  await expect(page.getByTestId('minimap')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);

  await backgroundFocus(page);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Alt+3');
  await page.keyboard.press('F7');
  await page.keyboard.press('2');
  await expect(menu).toBeVisible();
  await expect.poll(() => mode(page)).toBe('none');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
});

test('minimum viewport rail, report, camera, Home and M keys work from Main', async ({ page }) => {
  await startPausedGame(page);
  const game = await page.evaluate(() => window.__tenka.debug.getState());
  const homeCastleId = game.clans[game.meta.playerClanId]!.homeCastleId;
  await backgroundFocus(page);
  await page.keyboard.press('Home');
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection))
    .toEqual({ kind: 'node', id: homeCastleId });
  await page.keyboard.press('m');
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(page.getByTestId('minimap')).toBeVisible();

  for (const [key, rail] of [
    ['F1', 'rail-domestic'],
    ['F3', 'rail-diplomacy'],
    ['F4', 'rail-officers'],
    ['F5', 'rail-policy'],
    ['F6', 'rail-corps'],
    ['F7', 'rail-taimei'],
  ] as const) {
    await backgroundFocus(page);
    await page.keyboard.press(key);
    await expect(page.getByTestId(rail)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(rail)).toHaveAttribute('aria-pressed', 'false');
  }
  await backgroundFocus(page);
  await page.keyboard.press('F2');
  await expect(page.getByTestId('march-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('march-modal')).toHaveCount(0);
  await backgroundFocus(page);
  await page.keyboard.press('r');
  await expect(page.getByTestId('reports-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('reports-panel')).toHaveCount(0);

  await backgroundFocus(page);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection))
    .toBeNull();
  await page.keyboard.press('F4');
  await page
    .getByTestId('officer-list')
    .locator('tbody tr')
    .filter({ hasText: '織田信長' })
    .click();
  const trait = page.getByTestId('officer-detail').locator('span[tabindex="0"]').first();
  await trait.focus();
  await expect(trait).toBeFocused();
  await page.keyboard.press('m');
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection))
    .toEqual({ kind: 'node', id: homeCastleId });
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(game);
});

for (const [label, keys] of [
  ['WASD', ['w', 'a', 's', 'd']],
  ['arrows', ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']],
] as const) {
  test(`minimum viewport ${label} keys move the settled camera`, async ({ page }, testInfo) => {
    await startPausedGame(page);
    const game = await page.evaluate(() => window.__tenka.debug.getState());
    await backgroundFocus(page);
    await page.keyboard.press('Home');
    const observations = [];
    for (const key of keys) {
      const before = await settledCameraFrame(page);
      await page.keyboard.down(key);
      await page.waitForTimeout(150);
      await page.keyboard.up(key);
      const after = await settledCameraFrame(page);
      expect(after, `Camera movement for ${key}`).not.toBe(before);
      observations.push({ key, before: frameHash(before), after: frameHash(after) });
    }
    await testInfo.attach('settled-camera-inputs', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(game);
  });
}

test('minimum viewport keyboard and native wheel zoom change settled camera frames', async ({
  page,
}, testInfo) => {
  await startPausedGame(page);
  const game = await page.evaluate(() => window.__tenka.debug.getState());
  await backgroundFocus(page);
  await page.keyboard.press('Home');
  const observations = [];
  for (const key of ['+', '-']) {
    const before = await settledCameraFrame(page);
    await page.keyboard.press(key);
    const after = await settledCameraFrame(page);
    expect(after, `Keyboard zoom for ${key}`).not.toBe(before);
    observations.push({ key, before: frameHash(before), after: frameHash(after) });
  }
  const canvas = page.getByTestId('map-canvas-host').locator('canvas');
  await canvas.hover({ position: { x: 400, y: 300 } });
  const beforeWheel = await settledCameraFrame(page);
  await page.mouse.wheel(0, -150);
  const afterWheel = await settledCameraFrame(page);
  expect(afterWheel, 'Native wheel zoom').not.toBe(beforeWheel);
  observations.push({ key: 'wheel', before: frameHash(beforeWheel), after: frameHash(afterWheel) });
  await testInfo.attach('settled-camera-inputs', {
    body: JSON.stringify(observations, null, 2),
    contentType: 'application/json',
  });
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(game);
});

test('minimum viewport speed, quick save/load, and danger Enter keep focus priority', async ({
  page,
}) => {
  await startPausedGame(page);
  await backgroundFocus(page);
  for (const [key, speed] of [
    ['1', 'speed-1'],
    ['2', 'speed-2'],
    ['3', 'speed-5'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(page.getByTestId(speed)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status').filter({ hasText: '已快速存檔' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
  const savedDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  await page.keyboard.press('1');
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
    .toBeGreaterThan(savedDay);
  await page.keyboard.press('Space');
  const dirtyDay = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(true);
  await page.keyboard.press('F9');
  const confirmation = page.getByRole('dialog').last();
  await expect(confirmation).toContainText('尚有未存檔的進度');
  await page.keyboard.press('2');
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await confirmation.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(dirtyDay);
  await backgroundFocus(page);
  await page.keyboard.press('F9');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '確定', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day))
    .toBe(savedDay);
});
