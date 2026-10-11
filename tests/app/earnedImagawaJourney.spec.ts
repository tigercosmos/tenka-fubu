import { afterEach, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { earnImagawaJourney, MIURA, MIYOSHI_PLOT } from '../helpers/earnedImagawa';
import { resetBridgeForTests } from '../../src/app/bridge';
import { resetGameStoreForTests } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { getPlotSuccessRate } from '../../src/core/systems/plots';
import type { CmdStartPlot } from '../../src/core/commands/types';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('earns Imagawa rumor prerequisites and an actual poach through ordinary commands', async () => {
  const result = await earnImagawaJourney();
  const path = process.env.EARNED_IMAGAWA_PATH;
  if (path) {
    await writeFile(path, result.checkpointRaw);
    await writeFile(`${path}.evidence.json`, JSON.stringify(result));
  }
  expect(result.initial.meta.playerClanId).toBe('clan.miyoshi');
  expect(result.initial.meta.seed).toBe(42);
  expect(result.initial.clans[MIYOSHI_PLOT]!.gold).toBe(8900);
  expect(result.initial.officers[MIURA]!.loyalty).toBe(61);
  expect(result.checkpointState.time.day).toBe(240);
  const target = result.checkpointState.officers[MIURA]!;
  expect(target).toMatchObject({ clanId: 'clan.imagawa', loyalty: 25, status: 'serving' });
  const poach = result.submitted.find(
    (e) =>
      e.command.type === 'startPlot' &&
      e.command.kind === 'poach' &&
      e.command.targetOfficerId === target.id,
  )!;
  expect(poach).toMatchObject({
    day: 240,
    targetLoyalty: 25,
    command: { executorId: 'off.matsunaga-hisahide', investGold: 1000 },
  });
  const command = poach.command as CmdStartPlot;
  expect(getPlotSuccessRate(result.initial, command)).toBe(0);
  expect(poach.successRate).toBeGreaterThan(0);
  expect(
    result.events
      .flat()
      .filter(
        (e) =>
          e.type === 'plot.succeeded' &&
          e.kind === 'rumor' &&
          e.actorClanId === 'clan.miyoshi' &&
          e.targetOfficerId === target.id,
      )
      .map((e) => e.day),
  ).toEqual([120, 180, 240]);
  expect(result.events.flat()).toContainEqual(
    expect.objectContaining({
      type: 'plot.exposed',
      day: 270,
      kind: 'poach',
      targetOfficerId: 'off.yui-masanobu',
    }),
  );
  expect(result.events.flat()).toContainEqual(
    expect.objectContaining({
      type: 'officer.recruited',
      day: 300,
      source: 'poach',
      officerId: target.id,
      clanId: 'clan.miyoshi',
    }),
  );
  expect(result.state.officers[target.id]).toMatchObject({
    clanId: 'clan.miyoshi',
    status: 'serving',
    loyalty: 47,
  });
  expect(result.days.map((d) => d.day)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1));
  expect(result.referenceTail.map((s) => s.time.day)).toEqual(
    Array.from({ length: 60 }, (_, i) => i + 241),
  );
  expect(
    result.submitted.every((e) =>
      ['startPlot', 'resolveProposal', 'respondPact', 'resolveEventChoice'].includes(
        e.command.type,
      ),
    ),
  ).toBe(true);
  expect(validateState(result.state)).toEqual([]);
}, 120000);
