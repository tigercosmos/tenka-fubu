import { afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import {
  earnAzaiAllianceCheckpoint,
  persistentAllianceState,
  AZAI,
} from '../helpers/earnedAzaiAlliance';
import { resetBridgeForTests } from '../../src/app/bridge';
import { resetGameStoreForTests } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('generates the genuinely earned full-world day270 Azai alliance checkpoint', async () => {
  const result = await earnAzaiAllianceCheckpoint();
  expect(result.state.meta.scenarioId).toBe('s1560');
  expect(result.state.meta.playerClanId).toBe(AZAI);
  expect(Object.keys(result.state.clans).length).toBeGreaterThan(20);
  expect(result.payments.map((payment) => payment.workCost)).toEqual(Array(9).fill(20));
  expect(result.submitted.map(({ day, command }) => [day, command.type])).toEqual([
    [0, 'startDiploWork'],
    [30, 'resolveEventChoice'],
  ]);
  expect(result.log.entries.some((entry) => entry.authority?.kind === 'clan')).toBe(true);
  expect(
    result.log.entries.filter(
      (entry) => entry.command.type === 'startDiploWork' && entry.command.clanId === AZAI,
    ),
  ).toHaveLength(1);
  if (process.env.EARNED_AZAI_ALLIANCE_SAVE_PATH) {
    await writeFile(process.env.EARNED_AZAI_ALLIANCE_SAVE_PATH, result.raw);
    await writeFile(
      `${process.env.EARNED_AZAI_ALLIANCE_SAVE_PATH}.evidence.json`,
      JSON.stringify({
        payments: result.payments,
        submitted: result.submitted,
        authoredChoice: result.authoredChoice,
        log: result.log,
        events: result.events,
      }),
    );
  }
}, 15000);

it('repeats earned payments, natural AI commands, events, RNG and full persistent state through real pending native continuation', async () => {
  const baseline = await earnAzaiAllianceCheckpoint();
  const restored = await earnAzaiAllianceCheckpoint(true);
  expect(restored.events).toEqual(baseline.events);
  // The recorder truthfully marks native loads incomplete; a save is not a replay log.
  expect(baseline.log.truncated).toBe(false);
  expect(restored.log.truncated).toBe(true);
  expect(restored.log.incompleteReasons).toEqual(['loadedGame']);
  expect(restored.log.entries).toEqual(baseline.log.entries);
  expect(restored.log.finalHash).toBe(baseline.log.finalHash);
  expect(restored.log.finalDay).toBe(baseline.log.finalDay);
  expect(restored.payments).toEqual(baseline.payments);
  expect(restored.submitted).toEqual(baseline.submitted);
  expect(restored.state.rng).toEqual(baseline.state.rng);
  expect(persistentAllianceState(restored.state)).toEqual(persistentAllianceState(baseline.state));
}, 30000);
