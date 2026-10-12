import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('native crest click, Enter and Space select the real owned home without gameplay changes', async ({
  page,
}, info) => {
  // Debug is used only for detached read-only core/log evidence, never for navigation or orders.
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
  const clan = before.game.clans[before.game.meta.playerClanId]!;
  const home = before.game.castles[clan.homeCastleId]!;
  expect(home.ownerClanId).toBe(clan.id);
  const title = `${home.name}（${before.game.provinces[home.provinceId]!.name}）`;
  const crest = page.getByTestId('rail-home');
  await expect(crest).toBeEnabled();
  await expect(crest).toHaveAttribute('type', 'button');

  const assertHomeAndPurity = async () => {
    // This title and its close control belong to the actual selected-castle ContextPanel.
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    await expect(page.getByTestId('context-transport')).toBeVisible();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status').filter({ hasText: /項命令待下一日執行/ })).toHaveCount(0);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      game: window.__tenka.debug.getState(),
      log: window.__tenka.debug.exportCommandLog(),
    }));
    expect(after.game).toEqual(before.game);
    expect(after.game.rng).toEqual(before.game.rng);
    expect(after.log).toEqual(before.log);
  };
  const closeContext = async () => {
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  };

  await crest.click();
  await assertHomeAndPurity();
  await closeContext();
  await crest.focus();
  await expect(crest).toBeFocused();
  await page.keyboard.press('Enter');
  await assertHomeAndPurity();
  await closeContext();
  await crest.focus();
  await expect(crest).toBeFocused();
  await page.keyboard.press('Space');
  await assertHomeAndPurity();

  const path = info.outputPath('native-crest-home.json');
  await writeFile(
    path,
    JSON.stringify(
      {
        seed: 1,
        homeCastleId: home.id,
        contextTitle: title,
        nativeActivations: ['click', 'Enter', 'Space'],
        paused: true,
        coreAndRngUnchanged: true,
        commandLogUnchanged: true,
        pendingCommandHudAbsent: true,
        scope:
          'actual-native-context-selection/no-camera-coordinate-or-private-queue-snapshot-claim',
      },
      null,
      2,
    ),
  );
  await info.attach('native-crest-home', { path, contentType: 'application/json' });
});
