import traceData from '../replay/cases/m6-reward-month-boundary-ai.tfulog.json';
import { afterEach, expect, it } from 'vitest';
import {
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildMiniState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/mini';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
it('matches the AI-executing monthly gift trace through actual production runOneDay', () => {
  const trace = traceData as CommandLogFile;
  const game = buildMiniState({ seed: trace.seed });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const counters: number[] = [];
  for (let tick = 1; tick <= trace.finalDay; tick++) {
    for (const entry of trace.entries.filter((entry) => entry.day === tick && !entry.authority))
      expect(dispatchCommand(entry.command)).toEqual({ ok: true });
    const events = runOneDay();
    expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    expect(validateState(game), `actual bridge day ${game.time.day}`).toEqual([]);
    if (tick >= 29) counters.push(game.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth!);
  }
  expect(counters).toEqual([50, 0, 50]);
  const construction = trace.entries.find(
    (entry) => entry.command.type === 'buildFacility',
  )!.command;
  if (construction.type !== 'buildFacility') throw new Error('Missing actual AI construction');
  expect(
    game.castles[construction.castleId]!.buildQueue.some(
      (order) => order.facilityTypeId === construction.facilityTypeId,
    ),
  ).toBe(true);
  expect(game.policies[CLAN_BETA]!.active).toContain('pol.meyasubako');
  expect(game.ai.pendingOrders).toEqual([]);
  expect(stateHash(game)).toBe(trace.finalHash);
  expect(exportCommandLog()).toEqual(trace);
});
