import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';

// Only post-ending strategy presentation is stubbed. This is not a wizard or
// full-national proof; the real scenario loader, bridge, events and App run.
vi.mock('../../src/ui/screens/MainScreen', () => ({
  MainScreen: () => <main data-testid="screen-strategy" />,
}));
import { App } from '../../src/app/App';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { t } from '../../src/i18n/zh-TW';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/commands/validate';
import { stateHash } from '../../src/core/state/serialize';
import { BAL } from '../../src/core/balance';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { RANK_VALUES } from '../../src/core/state/enums';
import type { ClanId, CastleId } from '../../src/core/state/ids';
import type { Command } from '../../src/core/commands/types';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
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
  copy.ai.intentLog = []; // Native codec excludes diagnostic history, not AI orders.
  return copy;
}

async function earnRegionalEnding(nativePending = false) {
  const clanId = 'clan.takeda' as ClanId;
  const bundle = await loadS1560Scenario();
  let game = buildGameStateFromScenario(bundle, {
    appVersion: '0.0.0',
    seed: 42,
    playerClanId: clanId,
    difficulty: 'normal',
    startDay: 0,
    regions: ['koshinetsu'],
  });
  const engine = await loadScenarioEventEngine(game.meta.scenarioId);
  setGame(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  store.getState().actions.setScreen('main');
  expect(Object.keys(game.clans).sort()).toEqual(['clan.nagao', 'clan.takeda']);
  expect(Object.keys(game.castles)).toHaveLength(9);
  expect(validateState(game)).toEqual([]);
  const history: GameEvent[][] = [];
  const commands: { day: number; command: Command }[] = [];
  const nativeRestore = () => {
    const before = structuredClone(game);
    const queued = structuredClone([...getQueuedPlayerCommands(game)]);
    const snapshot = captureSaveSnapshot(0);
    const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
    expect(game).toEqual(before);
    if (!decoded.ok) throw Error(decoded.code);
    expect(decoded.saveFile.pendingCommands).toEqual(queued);
    expect(persistent(decoded.saveFile.state)).toEqual(persistent(game));
    game = decoded.saveFile.state;
    setGame(game);
    initializeBridgeSession(game, decoded.saveFile.pendingCommands, {
      loaded: true,
      eventEngine: engine,
    });
    store.getState().actions.setScreen('main');
  };
  const submit = (command: Command) => {
    const hash = stateHash(game);
    expect(dispatchCommand(command), JSON.stringify(command)).toEqual({ ok: true });
    expect(stateHash(game)).toBe(hash);
    commands.push({ day: game.time.day, command: structuredClone(command) });
  };
  const day = () => {
    const events = runOneDay();
    expect(
      events.filter((event) => event.type === 'command.rejected'),
      `day${game.time.day}`,
    ).toEqual([]);
    expect(validateState(game), `day${game.time.day}`).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    history.push(events);
  };
  for (const castle of Object.values(game.castles).filter(
    (castle) => castle.ownerClanId === clanId && castle.lordId === null,
  )) {
    const candidate = Object.values(game.officers)
      .filter((officer) => officer.clanId === clanId && officer.id !== game.clans[clanId]!.leaderId)
      .sort((a, b) => b.ldr - a.ldr || a.id.localeCompare(b.id))
      .find(
        (officer) =>
          validateCommand(game, {
            type: 'appointLord',
            clanId,
            castleId: castle.id,
            officerId: officer.id,
          }).ok,
      );
    expect(candidate).toBeTruthy();
    submit({ type: 'appointLord', clanId, castleId: castle.id, officerId: candidate!.id });
    day();
  }
  const targets = [
    'castle.iiyama',
    'castle.kasugayama',
    'castle.tochio',
    'castle.sakado',
  ] as CastleId[];
  const deploy = (target: CastleId) => {
    for (const castle of Object.values(game.castles).filter(
      (castle) => castle.ownerClanId === clanId,
    )) {
      const leader = Object.values(game.officers)
        .filter(
          (officer) =>
            officer.clanId === clanId &&
            officer.status === 'serving' &&
            officer.hasComeOfAge &&
            officer.armyId === null &&
            officer.locationCastleId === castle.id,
        )
        .sort((a, b) => b.ldr - a.ldr || a.id.localeCompare(b.id))[0];
      if (!leader) continue;
      const cap =
        BAL.rankTroopCap[
          game.clans[clanId]!.leaderId === leader.id
            ? RANK_VALUES.length - 1
            : RANK_VALUES.indexOf(leader.rank)
        ]!;
      const soldiers = Math.min(castle.soldiers, cap);
      const cmd: Command = {
        type: 'march',
        clanId,
        originCastleId: castle.id,
        leaderId: leader.id,
        deputyIds: [],
        soldiers,
        food: Math.min(
          castle.food,
          Math.floor(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
        ),
        targetNodeId: target,
      };
      if (validateCommand(game, cmd).ok) submit(cmd);
    }
  };
  let targetIndex = 0;
  let returning = false;
  let nextDeployment = game.time.day + 90;
  deploy(targets[targetIndex]!);
  if (nativePending) {
    expect(getQueuedPlayerCommands(game)).toHaveLength(5);
    nativeRestore();
  }
  for (let tick = 0; tick < 900 && game.meta.gameOver === null; tick++) {
    if (game.events.pendingChoiceEventId !== null)
      submit({
        type: 'resolveEventChoice',
        clanId,
        eventId: game.events.pendingChoiceEventId,
        choiceIndex: 0,
      });
    if (game.castles[targets[targetIndex]!]!.ownerClanId === clanId) returning = true;
    const reservedDestinations = new Set<CastleId>();
    const capturedCastle = game.castles[targets[targetIndex]!]!;
    let reservedGarrison = capturedCastle.soldiers;
    for (const army of Object.values(game.armies).filter((army) => army.clanId === clanId)) {
      if (army.autoReturn)
        submit({ type: 'setAutoReturn', clanId, armyId: army.id, enabled: false });
      if (returning && army.status !== 'returning' && army.status !== 'routed') {
        if (
          army.status === 'holding' &&
          army.posNodeId === capturedCastle.id &&
          reservedGarrison < 1200
        ) {
          const soldiers = Math.min(
            250,
            Math.max(0, army.soldiers - BAL.minMarchTroops),
            1200 - reservedGarrison,
            castleMaxSoldiers(game, capturedCastle) - reservedGarrison,
          );
          const deposit: Command = {
            type: 'depositGarrison',
            clanId,
            armyId: army.id,
            castleId: capturedCastle.id,
            soldiers,
            food: 0,
          };
          if (validateCommand(game, deposit).ok) {
            submit(deposit);
            reservedGarrison += soldiers;
          }
        }
        const emptyOwned = Object.values(game.castles).find(
          (castle) =>
            castle.ownerClanId === clanId &&
            !reservedDestinations.has(castle.id) &&
            !Object.values(game.officers).some(
              (officer) =>
                officer.status === 'serving' &&
                officer.clanId === clanId &&
                officer.locationCastleId === castle.id,
            ),
        );
        const destinationCastleId = emptyOwned?.id ?? army.originCastleId;
        const cmd: Command = {
          type: 'returnArmyToCastle',
          clanId,
          armyId: army.id,
          destinationCastleId,
        };
        if (validateCommand(game, cmd).ok) {
          submit(cmd);
          reservedDestinations.add(destinationCastleId);
        }
      }
    }
    if (returning && !Object.values(game.armies).some((army) => army.clanId === clanId)) {
      targetIndex = targets.findIndex((id) => game.castles[id]!.ownerClanId !== clanId);
      if (targetIndex >= 0) {
        returning = false;
        deploy(targets[targetIndex]!);
        nextDeployment = game.time.day + 90;
      }
    }
    if (
      !returning &&
      game.time.day >= nextDeployment &&
      !Object.values(game.armies).some((army) => army.clanId === clanId)
    ) {
      deploy(targets[targetIndex]!);
      nextDeployment = game.time.day + 90;
    }
    for (const siege of Object.values(game.sieges).filter(
      (siege) => siege.attackerClanId === clanId && siege.mode !== 'encircle',
    )) {
      const cmd: Command = { type: 'setSiegeMode', clanId, siegeId: siege.id, mode: 'encircle' };
      if (validateCommand(game, cmd).ok) submit(cmd);
    }
    day();
  }
  expect(game.time.day).toBe(373);
  expect(game.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  expect(history).toHaveLength(373);
  const falls = history
    .flat()
    .filter(
      (event): event is Extract<GameEvent, { type: 'siege.ended' }> =>
        event.type === 'siege.ended' && event.fallen && event.newOwnerClanId === clanId,
    );
  expect(falls.map((event) => [event.castleId, event.day])).toEqual([
    ['castle.iiyama', 35],
    ['castle.kasugayama', 73],
    ['castle.tochio', 139],
    ['castle.sakado', 373],
  ]);
  expect(history.flat().filter((event) => event.type === 'game.victory')).toHaveLength(1);
  expect(Object.values(game.castles).every((castle) => castle.ownerClanId === clanId)).toBe(true);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  return { game, history, commands, nativeRestore };
}

it('earns actual two-clan s1560 regional unification and exactly repeats native-pending commands, events, RNG and state', async () => {
  const original = await earnRegionalEnding();
  reset();
  const resumed = await earnRegionalEnding(true);
  expect(resumed.commands).toEqual(original.commands);
  expect(resumed.history).toEqual(original.history);
  expect(persistent(resumed.game)).toEqual(persistent(original.game));
  expect(resumed.game.rng).toEqual(original.game.rng);
});

it('loads the earned regional ending into actual App and continues without a phantom day or repeated victory', async () => {
  const earned = await earnRegionalEnding(true);
  earned.nativeRestore();
  const game = store.getState().game!;
  const path = process.env.REGIONAL_EARNED_ENDING_SAVE_PATH;
  if (path) {
    const snapshot = captureSaveSnapshot(0);
    await writeFile(path, encodeSave(snapshot.state, 0, snapshot.pendingCommands), 'utf8');
  }
  uiStore.getState().actions.reset();
  store.getState().actions.setScreen('main');
  const before = structuredClone(game);
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
  expect(game).toEqual(before);
  expect(store.getState().session.speed).toBe('paused');
  expect(screen.getByText(t('ui.ending.statYears', { years: 1, months: 0 }))).toBeTruthy();
  expect(game.events.stats.maxCastles).toBe(8); // Monthly maximum precedes the final day373 capture.
  expect(screen.getByText(t('ui.ending.statMaxCastles', { count: 8 }))).toBeTruthy();
  expect(
    screen.getByText(
      t('ui.ending.statBattles', {
        fought: game.events.stats.battlesFought,
        won: game.events.stats.battlesWon,
      }),
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(t('ui.ending.statMaxKokudaka', { koku: game.events.stats.maxKokudaka })),
  ).toBeTruthy();
  const officers = Object.values(game.officers).filter(
    (officer) => officer.status === 'serving' && officer.clanId === game.meta.playerClanId,
  ).length;
  expect(screen.getByText(t('ui.ending.statOfficers', { count: officers }))).toBeTruthy();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(game).toEqual(before);
  expect(screen.getByTestId('screen-ending')).toBeTruthy();
  fireEvent.click(screen.getByTestId('ending-continue'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
  const acknowledged = structuredClone(before);
  acknowledged.meta.gameOver = null;
  acknowledged.events.flags['victory.ack.unification'] = 1;
  expect(game).toEqual(acknowledged);
  act(() => {
    const events = runOneDay();
    expect(
      events.filter((event) => event.type === 'game.victory' || event.type === 'command.rejected'),
    ).toEqual([]);
  });
  expect(game.time.day).toBe(374);
  expect(validateState(game)).toEqual([]);
});
