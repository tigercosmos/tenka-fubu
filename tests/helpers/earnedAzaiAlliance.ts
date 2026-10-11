import assert from 'node:assert/strict';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/commands/validate';
import { stateHash } from '../../src/core/state/serialize';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { getTrust, getSentiment } from '../../src/core/systems/diplomacyCommon';
import { evaluateProposal } from '../../src/core/systems/diplomacyEval';
import { monthlyDiplomacyWorkCost } from '../../src/core/systems/court';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import {
  captureSaveSnapshot,
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  getQueuedPlayerCommands,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { monthSummaryStore } from '../../src/app/monthSummaryFlow';
import { uiStore } from '../../src/ui/hooks/uiStore';

export const AZAI = 'clan.azai' as ClanId;
export const ASAKURA = 'clan.asakura' as ClanId;
export const NAGAMASA = 'off.azai-nagamasa' as OfficerId;
export const ALLIANCE_COMMAND: Command = {
  type: 'proposePact',
  clanId: AZAI,
  targetClanId: ASAKURA,
  kind: 'proposeAlliance',
  reinforceAgainstClanId: null,
};

export function persistentAllianceState(game: GameState): GameState {
  const clone = structuredClone(game);
  // Native saves omit only the diagnostic AI intent history, not pending AI orders.
  clone.ai.intentLog = [];
  return clone;
}

/** Full production world, seed42. CPU normal driver prerequisites, NOT native UI input. */
export async function earnAzaiAllianceCheckpoint(nativePending = false) {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  let game = buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: '0.0.0',
    seed: 42,
    playerClanId: AZAI,
    difficulty: 'normal',
    startDay: 0,
  });
  const engine = await loadScenarioEventEngine(game.meta.scenarioId);
  const catalog = loadS1560EventCatalog();
  setGame(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  store.getState().actions.setScreen('main');
  const submitted: { day: number; command: Command }[] = [];
  const events: GameEvent[][] = [];
  const payments: {
    day: number;
    goldBeforeDiplomacy: number;
    workCost: number;
    goldBeforeEconomy: number;
    goldAfterEconomy: number;
    income: number;
    expenses: number;
    trustBefore: number;
    trustAfter: number;
  }[] = [];
  function submit(command: Command) {
    assert.deepEqual(validateCommand(game, command, undefined, { eventEngine: engine }), {
      ok: true,
    });
    const before = stateHash(game);
    assert.deepEqual(dispatchCommand(command), { ok: true });
    assert.equal(stateHash(game), before);
    submitted.push({ day: game.time.day, command: structuredClone(command) });
  }
  submit({ type: 'startDiploWork', clanId: AZAI, target: ASAKURA, executorId: NAGAMASA });
  if (nativePending) {
    const before = structuredClone(game);
    const snapshot = captureSaveSnapshot(0);
    assert.equal(snapshot.pendingCommands.length, 1);
    const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
    if (!decoded.ok) throw Error(decoded.code);
    assert.deepEqual(game, before);
    assert.deepEqual(
      persistentAllianceState(decoded.saveFile.state),
      persistentAllianceState(game),
    );
    assert.deepEqual(decoded.saveFile.pendingCommands, snapshot.pendingCommands);
    game = decoded.saveFile.state;
    setGame(game);
    initializeBridgeSession(game, decoded.saveFile.pendingCommands, {
      loaded: true,
      eventEngine: engine,
    });
    store.getState().actions.setScreen('main');
  }
  for (let tick = 0; tick < 270; tick++) {
    if (game.events.pendingChoiceEventId !== null) {
      assert.equal(game.time.day, 30);
      assert.equal(game.events.pendingChoiceEventId, 'evt.teppo-denrai');
      assert.ok(catalog.find((event) => event.id === 'evt.teppo-denrai')?.choices[0]);
      submit({
        type: 'resolveEventChoice',
        clanId: AZAI,
        eventId: game.events.pendingChoiceEventId,
        choiceIndex: 0,
      });
    }
    assert.equal(game.meta.gameOver, null);
    assert.equal(
      Object.values(game.officers).some(
        (officer) => officer.status === 'captive' && officer.capturedByClanId === AZAI,
      ),
      false,
    );
    const gold = game.clans[AZAI]!.gold;
    const trust = getTrust(game, AZAI, ASAKURA);
    const mission = game.diplomacy.missions.find(
      (m) => m.fromClanId === AZAI && m.target === ASAKURA,
    );
    const cost = mission ? monthlyDiplomacyWorkCost(game, mission) : 0;
    const emitted = runOneDay();
    assert.equal(game.time.day, tick + 1);
    assert.deepEqual(
      emitted.filter((event) => event.type === 'command.rejected'),
      [],
    );
    assert.deepEqual(validateState(game), []);
    assert.equal(store.getState().session.fatalError, null);
    events.push(structuredClone(emitted));
    if (game.time.dayOfMonth === 1) {
      const summary = monthSummaryStore.getState().view;
      assert.equal(summary?.day, game.time.day);
      assert.ok(summary?.settlement);
      const settlement = summary.settlement;
      assert.equal(cost, 20);
      assert.equal(settlement.goldBefore, gold - cost);
      assert.equal(settlement.goldAfter, game.clans[AZAI]!.gold);
      const expenses = settlement.tributePaid + settlement.salaryPaid + settlement.policyPaid;
      assert.equal(
        settlement.goldAfter - settlement.goldBefore,
        settlement.incomeGold + settlement.tributeReceived - expenses,
      );
      assert.ok(getTrust(game, AZAI, ASAKURA) > trust);
      payments.push({
        day: game.time.day,
        goldBeforeDiplomacy: gold,
        workCost: cost,
        goldBeforeEconomy: settlement.goldBefore,
        goldAfterEconomy: settlement.goldAfter,
        income: settlement.incomeGold + settlement.tributeReceived,
        expenses,
        trustBefore: trust,
        trustAfter: getTrust(game, AZAI, ASAKURA),
      });
    }
  }
  assert.equal(getTrust(game, AZAI, ASAKURA), 60.60960000000001);
  assert.equal(getSentiment(game, ASAKURA, AZAI), 71);
  assert.equal(payments.length, 9);
  assert.equal(evaluateProposal(game, AZAI, ASAKURA, 'proposeAlliance'), 89.63379348668977);
  assert.deepEqual(validateCommand(game, ALLIANCE_COMMAND), { ok: true });
  assert.deepEqual(getQueuedPlayerCommands(game), []);
  const before = structuredClone(game);
  const snapshot = captureSaveSnapshot(0);
  const raw = encodeSave(snapshot.state, 0, snapshot.pendingCommands);
  const decoded = decodeSave(raw);
  if (!decoded.ok) throw Error(decoded.code);
  assert.deepEqual(game, before);
  assert.deepEqual(decoded.saveFile.state, persistentAllianceState(game));
  assert.deepEqual(decoded.saveFile.pendingCommands, []);
  return {
    state: structuredClone(game),
    raw,
    save: decoded.saveFile,
    events,
    submitted,
    payments,
    log: structuredClone(exportCommandLog()),
    authoredChoice: structuredClone(
      catalog.find((event) => event.id === 'evt.teppo-denrai')!.choices[0],
    ),
  };
}
