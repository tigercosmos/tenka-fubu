import { afterEach, expect, it } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { monthSummaryStore } from '../../src/app/monthSummaryFlow';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { buildMiniState, CASTLE_B2, CLAN_ALPHA, CLAN_BETA, DIST_B2X } from '../fixtures/mini';
import sourceJson from '../replay/cases/m6-rakuichi-income-ownership.tfulog.json';
import { uiStore } from '../../src/ui/hooks/uiStore';

const source = sourceJson as CommandLogFile;
function reset() {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
}
afterEach(reset);
function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = []; // Only the diagnostic history intentionally omitted by the codec.
  return copy;
}

/** Actual bridge queues three player inputs and enqueues natural AI itself.
 * This is the production month-summary source, not a DOM/native-browser journey.
 */
function driver(native = false) {
  let game = buildMiniState({ seed: source.seed });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const events: GameEvent[][] = [];
  const summaries: Array<{
    day: number;
    income: number;
    goldAfter: number;
    actualGold: number;
    districtOwner: string;
    castleOwner: string;
  }> = [];
  const unsubscribe = monthSummaryStore.subscribe((current, previous) => {
    const view = current.view;
    if (!view || view === previous.view) return;
    expect(current.game).toBe(game);
    expect(view.settlement).not.toBeNull();
    summaries.push({
      day: view.day,
      income: view.settlement!.incomeGold,
      goldAfter: view.settlement!.goldAfter,
      actualGold: game.clans[CLAN_ALPHA]!.gold,
      districtOwner: game.districts[DIST_B2X]!.ownerClanId,
      castleOwner: game.castles[CASTLE_B2]!.ownerClanId,
    });
  });
  try {
    for (let tick = 1; tick <= source.finalDay; tick++) {
      for (const entry of source.entries.filter((e) => e.day === tick && !e.authority)) {
        expect(dispatchCommand(structuredClone(entry.command))).toEqual({ ok: true });
      }
      if (native && tick === 1) {
        const before = structuredClone(game);
        const snapshot = captureSaveSnapshot(0);
        expect(snapshot.pendingCommands).toEqual(
          source.entries.filter((e) => !e.authority).map((e) => e.command),
        );
        const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
        expect(game).toEqual(before);
        if (!decoded.ok) throw Error(decoded.code);
        expect(decoded.saveFile.pendingCommands).toEqual(snapshot.pendingCommands);
        expect(persistent(decoded.saveFile.state)).toEqual(persistent(game));
        game = decoded.saveFile.state;
        setGame(game);
        initializeBridgeSession(game, decoded.saveFile.pendingCommands, { loaded: true });
        store.getState().actions.setScreen('main');
      }
      const emitted = runOneDay();
      expect(
        emitted.filter((e) => e.type === 'command.rejected'),
        `tick ${tick}`,
      ).toEqual([]);
      events.push(emitted);
      expect(store.getState().session.fatalError).toBeNull();
      expect(validateState(game), `day ${game.time.day}`).toEqual([]);
    }
  } finally {
    unsubscribe();
  }
  return { game, events, summaries, log: exportCommandLog() };
}

it('actual runOneDay records all natural AI and publishes earned split-ownership income to the month summary', () => {
  const actual = driver();
  expect(actual.log).toEqual(source);
  expect(actual.log.truncated).toBe(false);
  expect(actual.events.flat()).toContainEqual(
    expect.objectContaining({
      type: 'district.subjugated',
      day: 97,
      districtId: DIST_B2X,
      toClanId: CLAN_ALPHA,
    }),
  );
  expect(actual.events.flat()).toContainEqual(
    expect.objectContaining({
      type: 'economy.income',
      day: 120,
      clanId: CLAN_ALPHA,
      gold: 188,
    }),
  );
  expect(actual.summaries).toHaveLength(1);
  expect(actual.summaries[0]).toMatchObject({
    day: 120,
    income: 188,
    districtOwner: CLAN_ALPHA,
    castleOwner: CLAN_BETA,
  });
  expect(actual.summaries[0]!.actualGold).toBe(actual.summaries[0]!.goldAfter);
});

it('the actual three queued player inputs survive native load, with persistent state/RNG/events/month presentation equal', () => {
  const original = driver();
  reset();
  const restored = driver(true);
  expect(persistent(restored.game)).toEqual(persistent(original.game));
  expect(restored.game.rng).toEqual(original.game.rng);
  expect(restored.events).toEqual(original.events);
  expect(restored.summaries).toEqual(original.summaries);
  expect(restored.log.entries).toEqual(source.entries);
  expect(restored.log.finalHash).toBe(source.finalHash);
  // A loaded production session remains honestly truncated, even at this initial pending checkpoint.
  expect(restored.log.truncated).toBe(true);
  expect(restored.log.incompleteReasons).toContain('loadedGame');
});
