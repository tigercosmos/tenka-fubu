import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';

// Only the strategy presentation after Continue is stubbed, not App or EndingScreen.
// This is an unchanged mini production-driver journey, not a national/browser proof.
vi.mock('../../src/ui/screens/MainScreen', () => ({
  MainScreen: () => <main data-testid="screen-strategy" />,
}));

import { App } from '../../src/app/App';
import {
  captureSaveSnapshot,
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import {
  buildMiniState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CASTLE_B2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO_B,
  OFF_ALPHA_TAISHO_A,
} from '../fixtures/mini';
import { BAL } from '../../src/core/balance';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { stateHash } from '../../src/core/state/serialize';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { Command } from '../../src/core/commands/types';
import { t } from '../../src/i18n/zh-TW';
import route from '../replay/cases/m4-military-siege-fall.tfulog.json';

function reset() {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
}
beforeEach(() => {
  reset();
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
});
afterEach(() => {
  reset();
  vi.restoreAllMocks();
});

function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = []; // Diagnostic history is deliberately absent from native saves.
  return copy;
}

function nativeRestore(game: GameState) {
  const before = structuredClone(game);
  const pending = [...getQueuedPlayerCommands(game)];
  const snapshot = captureSaveSnapshot(0);
  const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
  expect(game).toEqual(before);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.code);
  expect(decoded.saveFile.pendingCommands).toEqual(pending);
  expect(persistent(decoded.saveFile.state)).toEqual(persistent(game));
  setGame(decoded.saveFile.state);
  initializeBridgeSession(decoded.saveFile.state, decoded.saveFile.pendingCommands, {
    loaded: true,
  });
  store.getState().actions.setScreen('main');
  return decoded.saveFile.state;
}

function earnEnding(restorePending = false) {
  let game = buildMiniState({ seed: 42 });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const history: GameEvent[][] = [];
  const submit = (command: Command) => {
    const before = stateHash(game);
    expect(dispatchCommand(command)).toEqual({ ok: true });
    expect(stateHash(game)).toBe(before);
  };
  const day = () => {
    const events = runOneDay(); // Production bridge enqueues ALL naturally generated AI orders.
    expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    history.push(events);
  };
  for (let tick = 1; tick <= 62; tick++) {
    for (const entry of route.entries.filter((entry) => entry.day === tick))
      submit(structuredClone(entry.command) as Command);
    if (restorePending && tick === 1) {
      expect(getQueuedPlayerCommands(game)).toHaveLength(2);
      game = nativeRestore(game);
    }
    day();
  }
  expect(game.time.day).toBe(152);
  expect(game.castles[CASTLE_B2]!.ownerClanId).toBe(CLAN_ALPHA);
  // The surviving holding army makes a legal attack that genuinely routs.
  // Recovery uses normal monthly recruitment, not resource or officer injection.
  for (const army of Object.values(game.armies).filter(
    (army) => army.clanId === CLAN_ALPHA && army.status === 'holding',
  ))
    submit({ type: 'setArmyTarget', clanId: CLAN_ALPHA, armyId: army.id, targetNodeId: CASTLE_B1 });
  for (let tick = 63; tick <= 250; tick++) day();
  submit({
    type: 'transport',
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_B2,
    toCastleId: CASTLE_A1,
    soldiers: 1000,
    food: 0,
    gold: 0,
  });
  for (let tick = 251; tick <= 270; tick++) day();
  expect(game.castles[CASTLE_A1]!.soldiers).toBe(1773);
  submit({
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_TAISHO_B,
    deputyIds: [],
    soldiers: 1773,
    food: 6000,
    targetNodeId: CASTLE_B1,
  });
  submit({
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A2,
    leaderId: OFF_ALPHA_TAISHO_A,
    deputyIds: [],
    soldiers: 1200,
    food: 3600,
    targetNodeId: CASTLE_B1,
  });
  for (let tick = 271; tick <= 450 && game.meta.gameOver === null; tick++) {
    day();
    for (const siege of Object.values(game.sieges)) {
      const troops = siege.attackerArmyIds.reduce(
        (sum, id) => sum + (game.armies[id]?.soldiers ?? 0),
        0,
      );
      if (
        siege.attackerClanId === CLAN_ALPHA &&
        siege.mode !== 'encircle' &&
        troops >= game.castles[siege.castleId]!.soldiers * BAL.encircleRatio
      )
        submit({ type: 'setSiegeMode', clanId: CLAN_ALPHA, siegeId: siege.id, mode: 'encircle' });
    }
  }
  expect(game.time.day).toBe(419);
  expect(game.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  expect(game.clans[CLAN_BETA]!.alive).toBe(false);
  expect(Object.values(game.castles).every((castle) => castle.ownerClanId === CLAN_ALPHA)).toBe(
    true,
  );
  expect(history.flat().filter((event) => event.type === 'game.victory')).toHaveLength(1);
  expect(history.at(-1)).toContainEqual(
    expect.objectContaining({ type: 'siege.ended', castleId: CASTLE_B1, fallen: true }),
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  return { game, history };
}

it('earns unchanged mini42 unification and repeats every event/RNG/state through actual pending native continuation', () => {
  const original = earnEnding();
  reset();
  const resumed = earnEnding(true);
  expect(resumed.history).toEqual(original.history);
  expect(persistent(resumed.game)).toEqual(persistent(original.game));
  expect(resumed.game.rng).toEqual(original.game.rng);
});

it('loads the earned ending into actual App statistics and continues without a phantom day or repeated victory', async () => {
  const earned = earnEnding(true);
  const game = nativeRestore(earned.game);
  const artifactPath = process.env.EARNED_ENDING_SAVE_PATH;
  if (artifactPath) {
    const snapshot = captureSaveSnapshot(0);
    await writeFile(artifactPath, encodeSave(snapshot.state, 0, snapshot.pendingCommands), 'utf8');
  }
  // Presentation cleanup only; App detects the native-loaded authoritative ending.
  uiStore.getState().actions.reset();
  store.getState().actions.setScreen('main');
  const before = structuredClone(game);
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
  expect(store.getState().session.speed).toBe('paused');
  expect(game).toEqual(before);
  expect(screen.getByText(t('ui.ending.statYears', { years: 1, months: 1 }))).toBeTruthy();
  expect(
    screen.getByText(
      t('ui.ending.statBattles', {
        fought: game.events.stats.battlesFought,
        won: game.events.stats.battlesWon,
      }),
    ),
  ).toBeTruthy();
  // 10 §3.8.5 explicitly samples maximum holdings on month-opening ticks.
  // The final fourth castle falls on day419, after the latest monthly sample.
  expect(game.events.stats.maxCastles).toBe(3);
  expect(screen.getByText(t('ui.ending.statMaxCastles', { count: 3 }))).toBeTruthy();
  expect(
    screen.getByText(t('ui.ending.statMaxKokudaka', { koku: game.events.stats.maxKokudaka })),
  ).toBeTruthy();
  const officers = Object.values(game.officers).filter(
    (officer) => officer.status === 'serving' && officer.clanId === CLAN_ALPHA,
  ).length;
  expect(screen.getByText(t('ui.ending.statOfficers', { count: officers }))).toBeTruthy();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.getByTestId('screen-ending')).toBeTruthy();
  expect(game).toEqual(before);
  fireEvent.click(screen.getByTestId('ending-continue'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
  expect(game.meta.gameOver).toBeNull();
  expect(game.events.flags['victory.ack.unification']).toBe(1);
  expect(game.time).toEqual(before.time);
  expect(game.rng).toEqual(before.rng);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  act(() => {
    const events = runOneDay();
    expect(
      events.filter((event) => event.type === 'game.victory' || event.type === 'command.rejected'),
    ).toEqual([]);
  });
  expect(game.time.day).toBe(420);
  expect(validateState(game)).toEqual([]);
});

it('returns the genuinely earned ending to title without advancing or acknowledging the campaign', async () => {
  const { game } = earnEnding();
  uiStore.getState().actions.reset();
  store.getState().actions.setScreen('main');
  const before = structuredClone(game);
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
  fireEvent.click(screen.getByTestId('ending-title'));
  await waitFor(() => expect(screen.getByTestId('title-newgame')).toBeTruthy());
  expect(store.getState().game).toBeNull();
  expect(game).toEqual(before);
  expect(game.events.flags['victory.ack.unification']).toBeUndefined();
});
