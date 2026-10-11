import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const minimum = { width: 1280, height: 720 };
async function newGame(page: Page) {
  await page.setViewportSize(minimum);
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
}
async function backgroundFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
async function state(page: Page) {
  return page.evaluate(() => window.__tenka.debug.getState());
}
async function scale(page: Page) {
  return page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-scale'));
}
async function quickBlob(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'keyval-store'))
      return null;
    return new Promise<string | null>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction('keyval', 'readonly');
        const request = transaction.objectStore('keyval').get('tf.save.quick:1.blob');
        request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
        transaction.oncomplete = () => db.close();
        transaction.onabort = () => db.close();
      };
    });
  });
}

test('independent width/height minimum gates freeze real strategy and block background input', async ({
  page,
}, testInfo) => {
  await newGame(page);
  const initialScale = await scale(page);
  const gear = (await page.getByRole('button', { name: '系統選單', exact: true }).boundingBox())!;
  for (const viewport of [
    { width: 1279, height: 720 },
    { width: 1280, height: 719 },
  ]) {
    const day = (await state(page)).time.day;
    await page.getByTestId('speed-5').click();
    await expect.poll(async () => (await state(page)).time.day).toBeGreaterThan(day);
    await page.setViewportSize(viewport);
    const overlay = page.getByTestId('viewport-too-small');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('role', 'alertdialog');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');
    await expect(overlay).toBeFocused();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page
        .getByTestId('screen-strategy')
        .evaluate((node) => node.closest('[inert]') !== null),
    ).toBe(true);
    const frozen = await state(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('1');
    await page.keyboard.press('F1');
    await page.keyboard.press('F7');
    await page.keyboard.press('Control+s');
    await page.keyboard.press('F9');
    await page.mouse.click(gear.x + gear.width / 2, gear.y + gear.height / 2);
    await page.waitForTimeout(500);
    expect(await state(page)).toEqual(frozen); // Includes RNG, command sequence and all core fields.
    await expect(page.locator('[data-ui-dialog]')).toHaveCount(0);
    await expect(page.getByTestId('taimei-panel')).toHaveCount(0);
    await expect(page.getByTestId('castle-panel')).toHaveCount(0);
    expect(await quickBlob(page)).toBeNull();
    await page.screenshot({
      path: testInfo.outputPath(`too-small-${viewport.width}-${viewport.height}.png`),
    });
    await page.setViewportSize(minimum);
    await expect(overlay).toHaveCount(0);
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(250);
    expect(await state(page)).toEqual(frozen);
    expect(await scale(page)).toBe(initialScale);
  }
});

test('initial undersized skip-title x5 boot cannot start the day loop', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1279, height: 720 });
  await page.goto('/?debug=1&skipTitle=1&speed=x5&scenario=s1560');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('viewport-too-small')).toBeFocused();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const frozen = await state(page);
  await page.waitForTimeout(500);
  expect(await state(page)).toEqual(frozen);
  await page.setViewportSize(minimum);
  await expect(page.getByTestId('viewport-too-small')).toHaveCount(0);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await state(page)).toEqual(frozen);
  await page.screenshot({ path: testInfo.outputPath('initial-too-small-recovered.png') });
});

test('owned settings and nested confirmation survive resize without losing input focus or identity', async ({
  page,
}, testInfo) => {
  await newGame(page);
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const settings = page.getByTestId('settings-panel');
  const settingsIdentity = await settings.elementHandle();
  const slider = settings.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press('ArrowRight');
  const selectedScale = await scale(page);
  const frozen = await state(page);
  await page.setViewportSize({ width: 1280, height: 719 });
  await expect(page.getByTestId('viewport-too-small')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui-dialog]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.setViewportSize(minimum);
  await expect(slider).toBeFocused();
  expect(
    await settingsIdentity!.evaluate(
      (node) => node === document.querySelector('[data-testid="settings-panel"]'),
    ),
  ).toBe(true);
  expect(await scale(page)).toBe(selectedScale);
  await settings.getByRole('button', { name: '回復預設值', exact: true }).click();
  const confirmation = page.getByRole('dialog').last();
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  const confirmationIdentity = await confirmation.elementHandle();
  await page.setViewportSize({ width: 1279, height: 720 });
  await expect(page.getByTestId('viewport-too-small')).toBeFocused();
  await expect(page.locator('[data-ui-dialog]')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.setViewportSize(minimum);
  expect(await confirmationIdentity!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(confirmation.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect(await scale(page)).toBe(selectedScale);
  expect(await state(page)).toEqual(frozen);
  await page.screenshot({ path: testInfo.outputPath('settings-resize-preserved.png') });
});

test('battle viewport freeze and Escape SystemMenu preserve battle authority and disable save/load', async ({
  page,
}, testInfo) => {
  await newGame(page);
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const battle = page.getByTestId('screen-battle');
  await expect(battle).toBeVisible();
  await backgroundFocus(page);
  const initial = await state(page);
  const battleId = Object.keys(initial.battles)[0]!;
  const tickBefore = Object.values(initial.battles)[0]!.tick;
  await page.keyboard.press('2');
  await expect(battle.getByRole('button', { name: '二倍速', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => Object.values((await state(page)).battles)[0]!.tick)
    .toBeGreaterThan(tickBefore);
  await page.setViewportSize({ width: 1279, height: 720 });
  await expect(page.getByTestId('viewport-too-small')).toBeFocused();
  await expect(
    battle.getByRole('button', { name: '暫停', exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const frozen = await state(page);
  await page.keyboard.press('2');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect(await state(page)).toEqual(frozen);
  await page.setViewportSize(minimum);
  await expect(page.getByTestId('viewport-too-small')).toHaveCount(0);
  await expect(battle.getByRole('button', { name: '暫停', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(250);
  expect(await state(page)).toEqual(frozen);
  await backgroundFocus(page);
  await page.keyboard.press('Space');
  await expect(battle.getByRole('button', { name: '二倍速', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Space');
  await expect(battle.getByRole('button', { name: '暫停', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const stable = await state(page);
  const quickBefore = await quickBlob(page);
  expect(
    await page.evaluate(() =>
      ['Control+s', 'Meta+s', 'F9'].map((key) => {
        const event = new KeyboardEvent('keydown', {
          key: key === 'F9' ? key : 's',
          ctrlKey: key === 'Control+s',
          metaKey: key === 'Meta+s',
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ),
  ).toEqual([true, true, true]);
  await page.keyboard.press('Control+s');
  await page.keyboard.press('F9');
  await expect(page.locator('[data-ui-dialog]')).toHaveCount(0);
  expect(await quickBlob(page)).toBe(quickBefore);
  expect(await state(page)).toEqual(stable);
  await page.keyboard.press('Escape');
  let menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  for (const name of ['存檔', '讀檔']) {
    const action = menu.getByRole('button', { name, exact: true });
    await expect(action).toBeDisabled();
    const description = await action.getAttribute('aria-describedby');
    expect(description).not.toBeNull();
    await expect(page.locator(`#${description!}`)).not.toBeEmpty();
  }
  await menu.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await backgroundFocus(page);
  await page.keyboard.press('Escape');
  await page
    .getByRole('dialog', { name: '系統選單', exact: true })
    .getByRole('button', { name: '回到標題', exact: true })
    .click();
  const confirmation = page.getByRole('dialog', { name: '回到標題', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(battle).toBeVisible();
  expect(await state(page)).toEqual(stable);
  expect((await state(page)).battles[battleId as keyof typeof stable.battles]!.result).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('battle-system-menu.png') });
});
