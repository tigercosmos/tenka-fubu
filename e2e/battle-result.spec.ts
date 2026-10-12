import { test, expect } from './fixtures';
import { BAL } from '../src/core/balance';

test('core-generated tactical result owns focus and cannot be dismissed without acknowledgement', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const screen = page.getByTestId('screen-battle');
  await expect(screen).toBeVisible();
  const initial = await page.evaluate(() => {
    const battle = Object.values(window.__tenka.debug.getState().battles)[0]!;
    return { id: battle.id, tick: battle.tick, result: battle.result };
  });
  expect(initial.result).toBeNull();
  // Real UI orders and live tactical clock: no injected winner, altered state or synthetic codec.
  await screen.getByRole('button', { name: /^全軍委任：/ }).click();
  await screen.getByRole('button', { name: '五倍速 ×5', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => window.__tenka.debug.getState().battles[id]?.result != null,
          initial.id,
        ),
      { timeout: 35_000, intervals: [160, 320, 640] },
    )
    .toBe(true);
  const dialog = page.getByRole('dialog', { name: /^合戰(勝利|敗北)$/ });
  await expect(dialog).toBeVisible();
  const acknowledge = dialog.getByRole('button', { name: '返回策略畫面', exact: true });
  await expect(acknowledge).toBeFocused();
  await expect(screen).toHaveAttribute('inert', '');
  await expect(
    screen.getByRole('button', { name: '一倍速 ×1', exact: true, includeHidden: true }),
  ).toBeDisabled();
  const resolved = await page.evaluate(() => window.__tenka.debug.getState());
  expect(resolved.battles[initial.id]!.tick).toBeGreaterThan(initial.tick);
  expect(resolved.battles[initial.id]!.tick).toBeLessThanOrEqual(BAL.kassenMaxTicks);
  await info.attach('actual-core-generated-result', {
    body: JSON.stringify(resolved.battles[initial.id], null, 2),
    contentType: 'application/json',
  });

  for (const key of ['Tab', 'Shift+Tab', 'Escape']) {
    await page.keyboard.press(key);
    await expect(dialog).toBeVisible();
    await expect(acknowledge).toBeFocused();
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(resolved);
  }
  // Do not send Space to the focused acknowledgement button: native Space intentionally activates it.
  await dialog.focus();
  for (const key of ['1', '2', '3', 'Space']) {
    await page.keyboard.press(key);
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(resolved);
  }
  // Native pointer hits the actual backdrop outside the centered Dialog.
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  const focusContained = await dialog.evaluate((element) =>
    element.contains(document.activeElement),
  );
  expect(focusContained).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(resolved);
  const path = info.outputPath('resolved-modal.png');
  await page.screenshot({ path });
  await info.attach('resolved-modal', { path, contentType: 'image/png' });
  // Only this explicit production acknowledgement path removes the completed battle.
  await acknowledge.click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      (id) => window.__tenka.debug.getState().battles[id] === undefined,
      initial.id,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__tenka.debug.getState().rng)).toEqual(resolved.rng);
});

test('an existing SystemMenu owner hands a real completed battle to its mandatory result', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const screen = page.getByTestId('screen-battle');
  await expect(screen).toBeVisible();
  const id = await page.evaluate(
    () => Object.values(window.__tenka.debug.getState().battles)[0]!.id,
  );
  await screen.getByRole('button', { name: /^全軍委任：/ }).click();
  await screen.getByRole('button', { name: '五倍速 ×5', exact: true }).click();
  // Release native button focus, then open the ordinary owner through its real Escape route.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: '系統選單', exact: true });
  await expect(menu).toBeVisible();
  const result = page.getByRole('dialog', { name: /^合戰(勝利|敗北)$/ });
  await expect(result).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          (battleId) => window.__tenka.debug.getState().battles[battleId]?.result != null,
          id,
        ),
      { timeout: 35_000, intervals: [160, 320, 640] },
    )
    .toBe(true);
  await expect(menu).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(result).toHaveCount(0);
  const completed = await page.evaluate(() => window.__tenka.debug.getState());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(completed);
  await menu.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(result).toBeVisible();
  const acknowledge = result.getByRole('button', { name: '返回策略畫面', exact: true });
  await expect(acknowledge).toBeFocused();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(completed);
  await acknowledge.click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  expect(
    await page.evaluate(
      (battleId) => window.__tenka.debug.getState().battles[battleId] === undefined,
      id,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__tenka.debug.getState().rng)).toEqual(completed.rng);
});
