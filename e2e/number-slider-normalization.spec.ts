import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('native march numeric input normalizes above an unchanged controlled maximum on blur', async ({
  page,
}, info) => {
  // Debug supplies detached read-only evidence; all navigation and editing are native UI actions.
  await page.goto('/?debug=1&seed=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  expect(before.game.meta.seed).toBe(1);
  const player = before.game.clans[before.game.meta.playerClanId]!;
  const leader = before.game.officers[player.leaderId]!;
  await page.getByTestId('rail-home').click();
  await page.keyboard.press('F2');
  const march = page.getByRole('dialog', { name: '出陣編成', exact: true });
  await expect(march).toBeVisible();
  await march.getByRole('button', { name: `${leader.name} 統`, exact: false }).click();

  const range = march.getByRole('slider', { name: '兵數', exact: true });
  const numeric = range.locator('..').getByRole('spinbutton');
  const maximum = Number(await range.getAttribute('max'));
  const step = Number(await numeric.getAttribute('step'));
  expect(Number.isFinite(maximum)).toBe(true);
  expect(maximum).toBe(2365);
  expect(step).toBe(100);
  await range.focus();
  await page.keyboard.press('End');
  await expect(range).toHaveValue(String(maximum));
  expect(await range.evaluate((element: HTMLInputElement) => element.validity.stepMismatch)).toBe(
    false,
  );
  await expect(numeric).toHaveValue(String(maximum));
  const typed = String(maximum + step);
  await numeric.fill(typed);
  await expect(numeric).toHaveValue(typed);
  await expect(range).toHaveValue(String(maximum));
  await numeric.press('Tab');
  await expect(numeric).not.toBeFocused();
  await expect(numeric).toHaveValue(String(maximum));
  await expect(range).toHaveValue(String(maximum));
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: /項命令待下一日執行/ })).toHaveCount(0);
  const after = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  expect(after.game).toEqual(before.game);
  expect(after.game.rng).toEqual(before.game.rng);
  expect(after.log).toEqual(before.log);

  const path = info.outputPath('native-number-slider-normalization.json');
  await writeFile(
    path,
    JSON.stringify({ seed: 1, maximum, step, typed, normalized: maximum, before, after }, null, 2),
  );
  await info.attach('native-number-slider-normalization', {
    path,
    contentType: 'application/json',
  });
});
