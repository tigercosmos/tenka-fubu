import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { validateAppointLord } from '../src/core/commands/domesticCommands';
import { RANK_VALUES } from '../src/core/state/enums';
import { validateState } from '../src/core/state/invariants';
import { test, expect } from './fixtures';

test('native castle-local lord appointment queues while paused and applies on the next ordinary day', async ({
  page,
}, info) => {
  // Debug is detached read-only evidence. Navigation and command submission use native controls.
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
  expect(validateState(before.game)).toEqual([]);
  const clanId = before.game.meta.playerClanId;
  const castle = before.game.castles[before.game.clans[clanId]!.homeCastleId]!;
  expect(castle.ownerClanId).toBe(clanId);
  expect(castle.corpsId).toBeNull();
  const candidate = Object.values(before.game.officers)
    .filter(
      (officer) =>
        officer.id !== castle.lordId &&
        officer.status === 'serving' &&
        officer.clanId === clanId &&
        officer.locationCastleId === castle.id &&
        officer.armyId === null &&
        RANK_VALUES.indexOf(officer.rank) >= RANK_VALUES.indexOf('samurai-taisho'),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  expect(
    candidate,
    'Actual Oda home has a different eligible resident lord candidate',
  ).toBeDefined();
  if (!candidate) throw new Error('No actual eligible Oda home resident');
  const command = {
    type: 'appointLord' as const,
    clanId,
    castleId: castle.id,
    officerId: candidate.id,
  };
  expect(validateAppointLord(before.game, command)).toEqual({ ok: true });

  await page.getByTestId('rail-home').click();
  await page.keyboard.press('F1');
  const panel = page.getByTestId('castle-panel');
  await expect(panel).toBeVisible();
  const overview = panel.getByRole('tab', { name: '概要', exact: true });
  await overview.click();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: '城主', exact: true }).click();
  const chooser = panel.getByRole('combobox', { name: '城主', exact: true });
  await expect(chooser.getByRole('option', { name: candidate.name, exact: true })).toHaveCount(1);
  await chooser.selectOption(candidate.id);
  await panel.getByRole('button', { name: '任命城主', exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '1項命令待下一日執行' })).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const queued = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  expect(queued.game).toEqual(before.game);
  expect(queued.game.rng).toEqual(before.game.rng);
  expect(queued.log).toEqual(before.log);

  await page.getByTestId('speed-1').click();
  await expect
    .poll(
      () => page.evaluate((id) => window.__tenka.debug.getState().castles[id]!.lordId, castle.id),
      { intervals: [50] },
    )
    .toBe(candidate.id);
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const applied = await page.evaluate(() => ({
    game: window.__tenka.debug.getState(),
    log: window.__tenka.debug.exportCommandLog(),
  }));
  expect(applied.game.time.day).toBeGreaterThan(before.game.time.day);
  expect(applied.game.castles[castle.id]!.lordId).toBe(candidate.id);
  expect(applied.game.officers[candidate.id]!.clanId).toBe(clanId);
  expect(applied.game.officers[candidate.id]!.locationCastleId).toBe(castle.id);
  expect(validateState(applied.game)).toEqual([]);
  const appointments = applied.log.entries.filter((entry) => entry.command.type === 'appointLord');
  expect(appointments).toHaveLength(1);
  expect(appointments[0]!.command).toEqual(command);

  const path = info.outputPath('native-castle-lord-appointment.json');
  await writeFile(path, JSON.stringify({ seed: 1, command, before, queued, applied }, null, 2));
  await info.attach('native-castle-lord-appointment', { path, contentType: 'application/json' });
});
