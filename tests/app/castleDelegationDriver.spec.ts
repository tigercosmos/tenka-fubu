import { afterEach, expect, it } from 'vitest';
import {
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
  captureSaveSnapshot,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { buildMiniState, CASTLE_A2 } from '../fixtures/mini';
import { uiStore } from '../../src/ui/hooks/uiStore';
import sourceJson from '../replay/cases/m6-castle-delegation-cycle.tfulog.json';

const source = sourceJson as CommandLogFile;
afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function driver(native = false) {
  let game = buildMiniState({ seed: source.seed });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const events = [];
  for (let tick = 1; tick <= source.finalDay; tick++) {
    for (const entry of source.entries.filter((e) => e.day === tick && !e.authority))
      expect(dispatchCommand(structuredClone(entry.command))).toEqual({ ok: true });
    if (native && [31, 32].includes(tick)) {
      const snapshot = captureSaveSnapshot(0);
      const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
      if (!decoded.ok) throw Error(decoded.code);
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(game.ai.pendingOrders);
      expect(decoded.saveFile.pendingCommands).toHaveLength(tick === 32 ? 1 : 0);
      game = decoded.saveFile.state;
      setGame(game);
      initializeBridgeSession(game, decoded.saveFile.pendingCommands, { loaded: true });
      store.getState().actions.setScreen('main');
    }
    events.push(runOneDay());
    expect(store.getState().session.fatalError).toBeNull();
    expect(validateState(game), `day ${game.time.day}`).toEqual([]);
  }
  return { game, events, log: exportCommandLog() };
}
it('actual production runOneDay exports the complete accepted delegation trace and native continuation agrees', () => {
  const original = driver();
  expect(original.log).toEqual(source);
  expect(original.game.castles[CASTLE_A2]!.directControl).toBe(true);
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  const restored = driver(true);
  const persistent = (game: typeof original.game) => {
    const clone = structuredClone(game);
    clone.ai.intentLog = [];
    return clone;
  };
  expect(persistent(restored.game)).toEqual(persistent(original.game));
  expect(restored.events).toEqual(original.events);
  expect(restored.game.rng).toEqual(original.game.rng);
  // Loaded-session export honestly remains truncated; it is not a new full replay oracle.
  expect(restored.log.truncated).toBe(true);
});
