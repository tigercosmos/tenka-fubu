import assert from 'node:assert/strict';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/commands/validate';
import { stateHash } from '../../src/core/state/serialize';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import type { Command, CmdStartPlot } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { getPlotSuccessRate } from '../../src/core/systems/plots';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import {
  dispatchCommand,
  initializeBridgeSession,
  runOneDay,
  exportCommandLog,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { setGame, store, resetGameStoreForTests } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';

export const MIURA = 'off.miura-masatoshi' as OfficerId;
export const MIYOSHI_PLOT = 'clan.miyoshi' as ClanId;

export async function earnImagawaJourney() {
  const seed = 42;
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  const actor = 'clan.miyoshi' as ClanId,
    enemy = 'clan.imagawa' as ClanId;
  let game = buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: '0.0.0',
    seed,
    playerClanId: actor,
    difficulty: 'normal',
    startDay: 0,
  });
  const engine = await loadScenarioEventEngine('s1560');
  const catalog = loadS1560EventCatalog();
  setGame(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  store.getState().actions.setScreen('main');
  const initial = structuredClone(game),
    submitted: {
      day: number;
      command: Command;
      targetLoyalty: number | null;
      successRate: number | null;
    }[] = [],
    events: GameEvent[][] = [],
    days: { day: number; hash: string }[] = [],
    months: GameState[] = [];
  let checkpointRaw = '',
    checkpointState: GameState | null = null;
  const referenceTail: GameState[] = [];
  const pairs = [
    ['off.matsunaga-hisahide', 'off.miura-masatoshi'],
    ['off.miyoshi-nagayoshi', 'off.ichinomiya-muneyoshi'],
    ['off.shinohara-nagafusa', 'off.yui-masanobu'],
  ].map(([executor, target]) => [executor as OfficerId, target as OfficerId] as const);
  function submit(command: Command) {
    assert.equal(validateCommand(game, command, undefined, { eventEngine: engine }).ok, true);
    const h = stateHash(game);
    assert.equal(dispatchCommand(command).ok, true);
    assert.equal(stateHash(game), h);
    submitted.push({
      day: game.time.day,
      command: structuredClone(command),
      targetLoyalty:
        command.type === 'startPlot' && command.targetOfficerId
          ? game.officers[command.targetOfficerId]!.loyalty
          : null,
      successRate: command.type === 'startPlot' ? getPlotSuccessRate(game, command) : null,
    });
  }
  for (let tick = 0; tick < 300; tick++) {
    const id = game.events.pendingChoiceEventId;
    if (id !== null) {
      const a = catalog.find((e) => e.id === id)!;
      const c = a.choices
        .map((_, choiceIndex): Command => ({
          type: 'resolveEventChoice',
          clanId: actor,
          eventId: id,
          choiceIndex,
        }))
        .find((c) => validateCommand(game, c, undefined, { eventEngine: engine }).ok);
      assert.ok(c);
      submit(c);
    }
    for (const p of game.diplomacy.pendingProposals.filter((p) => p.toClanId === actor))
      submit({ type: 'respondPact', clanId: actor, proposalId: p.id, accept: false });
    for (const p of Object.values(game.proposals).filter(
      (p) => p.clanId === actor && p.status === 'pending',
    ))
      submit({ type: 'resolveProposal', clanId: actor, proposalId: p.id, accept: false });
    for (const [executor, targetId] of pairs) {
      const target = game.officers[targetId]!;
      if (target.clanId !== enemy || target.status !== 'serving') continue;
      if (game.diplomacy.plots.some((p) => p.officerId === executor)) continue;
      const command: CmdStartPlot = {
        type: 'startPlot',
        clanId: actor,
        executorId: executor,
        targetClanId: enemy,
        targetOfficerId: targetId,
        targetCastleId: null,
        kind: target.loyalty < 30 ? 'poach' : 'rumor',
        investGold: target.loyalty < 30 ? 1000 : 0,
      };
      if (validateCommand(game, command).ok) submit(command);
    }
    const emitted = runOneDay();
    events.push(structuredClone(emitted));
    days.push({ day: game.time.day, hash: stateHash(game) });
    assert.equal(game.time.day, tick + 1);
    assert.deepEqual(validateState(game), []);
    assert.equal(store.getState().session.fatalError, null);
    assert.deepEqual(
      emitted.filter((e) => e.type === 'command.rejected'),
      [],
    );
    if (game.time.day % 30 === 0) months.push(structuredClone(game));
    if (game.time.day === 240) {
      checkpointRaw = encodeSave(game, 0);
      const decoded = decodeSave(checkpointRaw);
      if (!decoded.ok) throw new Error(decoded.code);
      const persistent = structuredClone(game);
      persistent.ai.intentLog = [];
      assert.deepEqual(decoded.saveFile.state, persistent);
      assert.deepEqual(decoded.saveFile.pendingCommands, []);
      checkpointState = structuredClone(decoded.saveFile.state);
      // The CPU control continues from the same public-codec checkpoint used by native import.
      game = decoded.saveFile.state;
      setGame(game);
      initializeBridgeSession(game, [], { eventEngine: engine });
    } else if (game.time.day > 240) {
      const persistent = structuredClone(game);
      persistent.ai.intentLog = [];
      referenceTail.push(persistent);
    }
  }
  assert.ok(checkpointState);
  assert.equal(game.time.day, 300);
  assert.equal(game.officers[MIURA]!.clanId, actor);
  assert.ok(
    events
      .flat()
      .some(
        (e) =>
          e.type === 'officer.recruited' &&
          e.source === 'poach' &&
          e.officerId === 'off.miura-masatoshi',
      ),
  );
  return {
    initial,
    checkpointRaw,
    checkpointState,
    state: structuredClone(game),
    submitted,
    events,
    days,
    months,
    referenceTail,
    log: exportCommandLog(),
  };
}
