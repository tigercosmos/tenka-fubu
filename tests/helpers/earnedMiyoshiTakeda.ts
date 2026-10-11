import assert from 'node:assert/strict';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/commands/validate';
import { stateHash } from '../../src/core/state/serialize';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { getTrust, getSentiment } from '../../src/core/systems/diplomacyCommon';
import { clanPower, evaluateProposal } from '../../src/core/systems/diplomacyEval';
import { monthlyDiplomacyWorkCost } from '../../src/core/systems/court';
import { effectiveStat } from '../../src/core/systems/officers';
import type { Command } from '../../src/core/commands/types';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import type { ClanId, OfficerId, PolicyId } from '../../src/core/state/ids';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import {
  dispatchCommand,
  initializeBridgeSession,
  runOneDay,
  exportCommandLog,
  resetBridgeForTests,
  getQueuedPlayerCommands,
} from '../../src/app/bridge';
import { setGame, store, resetGameStoreForTests } from '../../src/app/store';
import { monthSummaryStore } from '../../src/app/monthSummaryFlow';
import { uiStore } from '../../src/ui/hooks/uiStore';

export const MIYOSHI = 'clan.miyoshi' as ClanId;
export const TAKEDA = 'clan.takeda' as ClanId;
export const NAGAYOSHI = 'off.miyoshi-nagayoshi' as OfficerId;

/** Save codec intentionally omits only diagnostic AI intent history. */
export function persistentMiyoshiState(state: GameState): GameState {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
}

/** CPU normal-command preparation; the later public save import/UI tail is native. */
export async function earnMiyoshiTakedaCheckpoint() {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  const game = buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: '0.0.0',
    seed: 42,
    playerClanId: MIYOSHI,
    difficulty: 'normal',
    startDay: 0,
  });
  const engine = await loadScenarioEventEngine(game.meta.scenarioId);
  const catalog = loadS1560EventCatalog();
  const initial = structuredClone(game);
  setGame(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  store.getState().actions.setScreen('main');
  const submitted: { day: number; command: Command }[] = [];
  const events: GameEvent[][] = [];
  const dailyHashes: { day: number; hash: string }[] = [];
  const months: {
    day: number;
    workCost: number;
    goldBefore: number;
    goldBeforeEconomy: number;
    goldAfter: number;
    trustBefore: number;
    trustAfter: number;
    score: number;
    state: GameState;
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
  assert.equal(game.clans[MIYOSHI]!.courtRank, 'ju4ge');
  assert.equal(game.clans[MIYOSHI]!.shogunateTitle, 'shobanshu');
  assert.equal(effectiveStat(game.officers[NAGAYOSHI]!, 'pol'), 92);
  submit({ type: 'enactPolicy', clanId: MIYOSHI, policyId: 'pol.enkokinko' as PolicyId });
  submit({ type: 'startDiploWork', clanId: MIYOSHI, target: TAKEDA, executorId: NAGAYOSHI });
  for (let tick = 0; tick < 300; tick++) {
    const eventId = game.events.pendingChoiceEventId;
    if (eventId !== null) {
      const authored = catalog.find((event) => event.id === eventId);
      assert.ok(authored);
      const command = authored.choices
        .map((_, choiceIndex): Command => ({
          type: 'resolveEventChoice',
          clanId: MIYOSHI,
          eventId,
          choiceIndex,
        }))
        .find((command) => validateCommand(game, command, undefined, { eventEngine: engine }).ok);
      assert.ok(command);
      submit(command);
    }
    // Actual arrivals are answered, never allowed to expire behind a skipped native owner.
    for (const envoy of game.diplomacy.pendingProposals.filter((p) => p.toClanId === MIYOSHI))
      submit({ type: 'respondPact', clanId: MIYOSHI, proposalId: envoy.id, accept: false });
    for (const proposal of Object.values(game.proposals).filter(
      (p) => p.clanId === MIYOSHI && p.status === 'pending',
    ))
      submit({ type: 'resolveProposal', clanId: MIYOSHI, proposalId: proposal.id, accept: false });
    const goldBefore = game.clans[MIYOSHI]!.gold;
    const trustBefore = getTrust(game, MIYOSHI, TAKEDA);
    const mission = game.diplomacy.missions.find(
      (m) => m.fromClanId === MIYOSHI && m.target === TAKEDA,
    );
    const workCost = mission ? monthlyDiplomacyWorkCost(game, mission) : 0;
    const emitted = runOneDay();
    events.push(structuredClone(emitted));
    assert.equal(game.time.day, tick + 1);
    assert.deepEqual(validateState(game), []);
    assert.equal(store.getState().session.fatalError, null);
    assert.deepEqual(
      emitted.filter((event) => event.type === 'command.rejected'),
      [],
    );
    dailyHashes.push({ day: game.time.day, hash: stateHash(game) });
    if (game.time.dayOfMonth === 1) {
      const settlement = monthSummaryStore.getState().view?.settlement;
      assert.ok(settlement);
      assert.equal(workCost, 16);
      assert.equal(settlement.goldBefore, goldBefore - workCost);
      assert.equal(settlement.goldAfter, game.clans[MIYOSHI]!.gold);
      months.push({
        day: game.time.day,
        workCost,
        goldBefore,
        goldBeforeEconomy: settlement.goldBefore,
        goldAfter: game.clans[MIYOSHI]!.gold,
        trustBefore,
        trustAfter: getTrust(game, MIYOSHI, TAKEDA),
        score: evaluateProposal(game, MIYOSHI, TAKEDA, 'proposeAlliance'),
        state: structuredClone(game),
      });
    }
  }
  assert.equal(game.time.day, 300);
  assert.equal(getSentiment(game, TAKEDA, MIYOSHI), 0);
  assert.equal(getTrust(game, MIYOSHI, TAKEDA), 78.10000000000001);
  assert.ok(clanPower(game, MIYOSHI) > clanPower(game, TAKEDA));
  assert.deepEqual(getQueuedPlayerCommands(game), []);
  const raw = encodeSave(game, 0);
  const decoded = decodeSave(raw);
  if (!decoded.ok) throw new Error(decoded.code);
  assert.deepEqual(persistentMiyoshiState(decoded.saveFile.state), persistentMiyoshiState(game));
  assert.deepEqual(decoded.saveFile.pendingCommands, []);
  return {
    initial,
    state: structuredClone(game),
    raw,
    submitted,
    events,
    dailyHashes,
    months,
    log: exportCommandLog(),
  };
}
