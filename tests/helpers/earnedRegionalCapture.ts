import assert from 'node:assert/strict';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { BAL } from '../../src/core/balance';
import { RANK_VALUES } from '../../src/core/state/enums';
import type { ClanId, CastleId, OfficerId } from '../../src/core/state/ids';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import {
  captureSaveSnapshot,
  dispatchCommand,
  exportCommandLog,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';

export const TAKEDA = 'clan.takeda' as ClanId;
export const IIYAMA = 'castle.iiyama' as CastleId;
export const TOMONOBU = 'off.saito-tomonobu' as OfficerId;
export const REGIONAL_CAPTURE_RELEASE: Command = {
  type: 'handleCaptive',
  clanId: TAKEDA,
  officerId: TOMONOBU,
  action: 'release',
  executorId: null,
};
export function persistentCaptureState(game: GameState): GameState {
  const copy = structuredClone(game);
  copy.ai.intentLog = []; // The actual native codec omits diagnostic history only.
  return copy;
}

/** CPU-earned supported two-clan s1560 prefix, not a native siege or national campaign. */
export async function earnRegionalCapture(nativePending = false) {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  let game = buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: '0.0.0',
    seed: 42,
    playerClanId: TAKEDA,
    difficulty: 'normal',
    startDay: 0,
    regions: ['koshinetsu'],
  });
  const engine = await loadScenarioEventEngine(game.meta.scenarioId);
  setGame(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  store.getState().actions.setScreen('main');
  assert.deepEqual(Object.keys(game.clans).sort(), ['clan.nagao', TAKEDA]);
  assert.equal(Object.keys(game.castles).length, 9);
  const commands: { day: number; command: Command }[] = [];
  const events: GameEvent[][] = [];
  const appliedCommands: {
    day: number;
    entries: ReturnType<typeof exportCommandLog>['entries'];
  }[] = [];
  const submit = (command: Command) => {
    assert.deepEqual(validateCommand(game, command, undefined, { eventEngine: engine }), {
      ok: true,
    });
    const hash = stateHash(game);
    assert.deepEqual(dispatchCommand(command), { ok: true });
    assert.equal(stateHash(game), hash);
    commands.push({ day: game.time.day, command: structuredClone(command) });
  };
  const day = () => {
    const before = game.time.day;
    const emitted = runOneDay();
    assert.equal(game.time.day, before + 1);
    assert.equal(game.meta.gameOver, null);
    assert.deepEqual(
      emitted.filter((event) => event.type === 'command.rejected'),
      [],
    );
    assert.deepEqual(validateState(game), []);
    assert.equal(store.getState().session.fatalError, null);
    events.push(emitted);
    const log = exportCommandLog();
    appliedCommands.push({
      day: game.time.day,
      entries: log.entries
        .filter((entry) => entry.day === log.finalDay)
        .map((entry) => ({ ...entry, day: game.time.day })),
    });
  };
  // Identical legal prefix to the existing earned regional ending journey.
  for (const castle of Object.values(game.castles).filter(
    (c) => c.ownerClanId === TAKEDA && c.lordId === null,
  )) {
    const officer = Object.values(game.officers)
      .filter((o) => o.clanId === TAKEDA && o.id !== game.clans[TAKEDA]!.leaderId)
      .sort((a, b) => b.ldr - a.ldr || a.id.localeCompare(b.id))
      .find(
        (o) =>
          validateCommand(game, {
            type: 'appointLord',
            clanId: TAKEDA,
            castleId: castle.id,
            officerId: o.id,
          }).ok,
      );
    assert.ok(officer);
    submit({ type: 'appointLord', clanId: TAKEDA, castleId: castle.id, officerId: officer.id });
    day();
  }
  for (const castle of Object.values(game.castles).filter((c) => c.ownerClanId === TAKEDA)) {
    const officer = Object.values(game.officers)
      .filter(
        (o) =>
          o.clanId === TAKEDA &&
          o.status === 'serving' &&
          o.hasComeOfAge &&
          o.armyId === null &&
          o.locationCastleId === castle.id,
      )
      .sort((a, b) => b.ldr - a.ldr || a.id.localeCompare(b.id))[0];
    if (!officer) continue;
    const cap =
      BAL.rankTroopCap[
        game.clans[TAKEDA]!.leaderId === officer.id
          ? RANK_VALUES.length - 1
          : RANK_VALUES.indexOf(officer.rank)
      ]!;
    const soldiers = Math.min(castle.soldiers, cap);
    const command: Command = {
      type: 'march',
      clanId: TAKEDA,
      originCastleId: castle.id,
      leaderId: officer.id,
      deputyIds: [],
      soldiers,
      food: Math.min(
        castle.food,
        Math.floor(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
      ),
      targetNodeId: IIYAMA,
    };
    if (validateCommand(game, command).ok) submit(command);
  }
  assert.equal(getQueuedPlayerCommands(game).length, 5);
  if (nativePending) {
    const snapshot = captureSaveSnapshot(0);
    const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
    assert.ok(decoded.ok);
    assert.deepEqual(decoded.saveFile.state, persistentCaptureState(game));
    assert.deepEqual(decoded.saveFile.pendingCommands, getQueuedPlayerCommands(game));
    game = decoded.saveFile.state;
    setGame(game);
    initializeBridgeSession(game, decoded.saveFile.pendingCommands, {
      loaded: true,
      eventEngine: engine,
    });
  }
  while (game.time.day < 35) {
    if (game.events.pendingChoiceEventId !== null) {
      // This exact known authored owner is resolved through its legal queued choice.
      assert.equal(game.events.pendingChoiceEventId, 'evt.teppo-denrai');
      submit({
        type: 'resolveEventChoice',
        clanId: TAKEDA,
        eventId: game.events.pendingChoiceEventId,
        choiceIndex: 0,
      });
    }
    for (const army of Object.values(game.armies).filter(
      (a) => a.clanId === TAKEDA && a.autoReturn,
    ))
      submit({ type: 'setAutoReturn', clanId: TAKEDA, armyId: army.id, enabled: false });
    for (const siege of Object.values(game.sieges).filter(
      (s) => s.attackerClanId === TAKEDA && s.mode !== 'encircle',
    )) {
      const command: Command = {
        type: 'setSiegeMode',
        clanId: TAKEDA,
        siegeId: siege.id,
        mode: 'encircle',
      };
      if (validateCommand(game, command).ok) submit(command);
    }
    day();
  }
  const captures = events.at(-1)!.filter((event) => event.type === 'officer.captured');
  assert.deepEqual(
    captures.map((event) => event.officerId).sort(),
    ['off.nagao-masakage', TOMONOBU, 'off.yamaura-kunikiyo'].sort(),
  );
  assert.equal(game.castles[IIYAMA]!.ownerClanId, TAKEDA);
  assert.equal(game.officers[TOMONOBU]!.status, 'captive');
  assert.equal(game.officers[TOMONOBU]!.capturedByClanId, TAKEDA);
  assert.deepEqual(validateCommand(game, REGIONAL_CAPTURE_RELEASE), { ok: true });
  assert.deepEqual(getQueuedPlayerCommands(game), []);
  const snapshot = captureSaveSnapshot(0);
  const raw = encodeSave(snapshot.state, 0, snapshot.pendingCommands);
  const decoded = decodeSave(raw);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.saveFile.state, persistentCaptureState(game));
  return {
    state: structuredClone(game),
    save: decoded.saveFile,
    raw,
    commands,
    events,
    captures,
    appliedCommands,
    log: exportCommandLog(),
  };
}
