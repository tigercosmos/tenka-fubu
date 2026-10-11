import { describe, expect, it } from 'vitest';
import { CommandQueue, applyCommands } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { selectMapViewModel, selectMiniMapModel } from '../../src/core/state/selectors';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { planArmyReroute } from '../../src/core/systems/armyReroute';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  DIST_A2X,
  OFF_ALPHA_LORD,
  CLAN_BETA,
  OFF_BETA_TAISHO,
  DIST_A1X,
  DIST_A1Y,
  DIST_B1X,
} from '../fixtures/tiny';

// Controlled valid graph costs, but army position is generated ONLY by real
// validated commands and two complete daily ticks; no midpoint state injection.
function midpoint() {
  const state = buildTinyState();
  const edge = Object.values(state.roads).find(
    (road) => road.a === CASTLE_A1 && road.b === CASTLE_A2,
  )!;
  edge.baseDays = 4;
  edge.grade = 1;
  expect(validateState(state)).toEqual([]);
  const command: Command = {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 120,
    targetNodeId: CASTLE_B1,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue();
  queue.enqueue(command, state.time.day);
  const first = advanceDay(state, queue.drain());
  expect(first.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  advanceDay(state, []);
  const army = Object.values(state.armies)[0]!;
  expect(army).toMatchObject({
    posNodeId: CASTLE_A1,
    pathCursor: 0,
    edgeCostDays: 4,
    edgeProgressDays: 2,
  });
  expect(validateState(state)).toEqual([]);
  return { state, armyId: army.id };
}

function tickCommand(state: GameState, command: Command) {
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}

function decodeMidpoint(state: GameState, pending: Command[] = []) {
  const decoded = decodeSave(encodeSave(state, 42, pending));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  expect(decoded.saveFile.state).toEqual(state);
  expect(decoded.saveFile.pendingCommands).toEqual(pending);
  expect(validateState(decoded.saveFile.state)).toEqual([]);
  return decoded.saveFile;
}

describe('army physical reroutes from an actual saved four-day midpoint', () => {
  it('pure shortest reroute preserves the midpoint and chooses forward on equal endpoint costs', () => {
    const { state, armyId } = midpoint();
    const before = structuredClone(state);
    expect(planArmyReroute(state, state.armies[armyId]!, CASTLE_A2)).toMatchObject({
      nodes: [CASTLE_A1, CASTLE_A2],
      progress: 2,
      cost: 4,
      reversingEnd: null,
      totalDays: 2,
    });
    expect(planArmyReroute(state, state.armies[armyId]!, CASTLE_A1)).toMatchObject({
      nodes: [CASTLE_A1],
      progress: 2,
      cost: 4,
      reversingEnd: CASTLE_A2,
      totalDays: 2,
    });
    // A destination connected equally to both endpoints isolates the tie policy.
    state.roads['road.tie' as keyof typeof state.roads] = {
      id: 'road.tie' as keyof typeof state.roads,
      a: CASTLE_A1,
      b: DIST_A2X,
      type: 'land',
      grade: 1,
      baseDays: 1,
    };
    expect(planArmyReroute(state, state.armies[armyId]!, DIST_A2X)?.reversingEnd).toBeNull();
    delete state.roads['road.tie' as keyof typeof state.roads];
    expect(state).toEqual(before);
  });

  it('re-retargeting a reverse midpoint retains physical position, new heading, and entered cost', () => {
    const { state, armyId } = midpoint();
    tickCommand(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId });
    const reverse = state.armies[armyId]!;
    expect(reverse).toMatchObject({
      reversingEdgeEndNodeId: CASTLE_A2,
      edgeProgressDays: 0.75,
      edgeCostDays: 4,
    });
    const physicalBefore = selectMiniMapModel(state).armies[0];
    const reverseView = selectMapViewModel(state).armies.find((army) => army.id === armyId)!;
    expect(reverseView).toMatchObject({
      fromNode: CASTLE_A2,
      toNode: CASTLE_A1,
      edgeT: 1 - 0.75 / 4,
    });
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const command: Command = {
      type: 'setArmyTarget',
      clanId: CLAN_ALPHA,
      armyId,
      targetNodeId: DIST_A2X,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
    applyCommands(state, queue.drain(), () => {});
    expect(selectMiniMapModel(state).armies[0]).toEqual(physicalBefore);
    expect(reverse.reversingEdgeEndNodeId).toBeUndefined();
    expect(reverse.edgeProgressDays).toBe(0.75);
    expect(reverse.edgeCostDays).toBe(4);
    expect(selectMapViewModel(state).armies[0]).toMatchObject({
      fromNode: CASTLE_A1,
      toNode: CASTLE_A2,
      edgeT: 0.75 / 4,
    });
    expect(validateState(state)).toEqual([]);
  });

  it('does not refill cargo from the recorded castle while physically on its entered edge', () => {
    const { state, armyId } = midpoint();
    // Cargo adjustment isolates the refill rule, not the actual generated position.
    state.armies[armyId]!.food = 30;
    const sourceFood = state.castles[CASTLE_A1]!.food;
    militaryMovementSystem(state);
    expect(state.armies[armyId]!.food).toBe(28);
    expect(state.castles[CASTLE_A1]!.food).toBe(sourceFood);
    expect(validateState(state)).toEqual([]);
  });

  it('directed return conserves entered cost across road changes, returns actual remaining cargo exactly once', () => {
    const { state, armyId } = midpoint();
    const army = state.armies[armyId]!;
    const food = army.food,
      troops = army.soldiers;
    const castleFood = state.castles[CASTLE_A1]!.food,
      castleTroops = state.castles[CASTLE_A1]!.soldiers;
    const edge = Object.values(state.roads).find(
      (road) => road.a === CASTLE_A1 && road.b === CASTLE_A2,
    )!;
    edge.grade = 3;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const command: Command = {
      type: 'returnArmyToCastle',
      clanId: CLAN_ALPHA,
      armyId,
      destinationCastleId: CASTLE_A1,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
    applyCommands(state, queue.drain(), () => {});
    expect(army.edgeCostDays).toBe(4);
    const first = militaryMovementSystem(state);
    expect(first.filter((event) => event.type === 'army.returned')).toEqual([]);
    expect(army.edgeCostDays).toBe(4);
    expect(state.castles[CASTLE_A1]!.food).toBe(castleFood);
    const second = militaryMovementSystem(state);
    expect(second.filter((event) => event.type === 'army.returned')).toHaveLength(1);
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(castleTroops + troops);
    expect(state.castles[CASTLE_A1]!.food).toBe(castleFood + food - 4);
    expect(militaryMovementSystem(state).filter((event) => event.type === 'army.returned')).toEqual(
      [],
    );
    expect(validateState(state)).toEqual([]);
  });

  it('serializes actual reverse movement, accepts legacy omission, rejects malformed reverse endpoint fields', () => {
    const { state, armyId } = midpoint();
    expect(decodeMidpoint(state).state.armies[armyId]!.reversingEdgeEndNodeId).toBeUndefined();
    tickCommand(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId });
    const restored = decodeMidpoint(state).state;
    expect(restored.armies[armyId]!.reversingEdgeEndNodeId).toBe(CASTLE_A2);
    expect(advanceDay(restored, []).events).toEqual(advanceDay(state, []).events);
    expect(restored).toEqual(state);
    for (const bad of [42, {}, [], 'castle.missing', CASTLE_A1, DIST_B1X]) {
      const { state: invalid, armyId: invalidId } = midpoint();
      const raw = JSON.parse(encodeSave(invalid, 42)) as { state: GameState };
      Object.assign(raw.state.armies[invalidId]!, { reversingEdgeEndNodeId: bad });
      expect(decodeSave(JSON.stringify(raw))).toMatchObject({ ok: false, code: 'corrupt' });
    }
  });

  it.each([false, true])(
    'does not apply node-bucket pursuit to a routed army physically outside that node (reverse=%s)',
    (reverse) => {
      const { state, armyId } = midpoint();
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      if (reverse) {
        queue.enqueue({ type: 'recallArmy', clanId: CLAN_ALPHA, armyId }, state.time.day);
        applyCommands(state, queue.drain(), () => {});
      }
      const routed = state.armies[armyId]!;
      // A controlled prior-victory eligibility/status fixture, not a simulated victory.
      routed.status = 'routed';
      const roadId = 'road.pursuit-arrival' as keyof typeof state.roads;
      state.roads[roadId] = {
        id: roadId,
        a: CASTLE_B1,
        b: CASTLE_A1,
        type: 'land',
        grade: 1,
        baseDays: 0.5,
      };
      applyEventEffects(state, [{ op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA }], null, () => {});
      const command: Command = {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_B1,
        leaderId: OFF_BETA_TAISHO,
        deputyIds: [],
        soldiers: 100,
        food: 120,
        targetNodeId: CASTLE_A1,
      };
      expect(validateCommand(state, command)).toEqual({ ok: true });
      queue.enqueue(command, state.time.day);
      applyCommands(state, queue.drain(), () => {});
      const winner = Object.values(state.armies).find((army) => army.id !== armyId)!;
      winner.pursuitEligibleArmyIds = [armyId];
      expect(validateState(state)).toEqual([]);
      const rng = structuredClone(state.rng);
      militaryMovementSystem(state);
      expect(routed.edgeProgressDays).toBe(reverse ? 0.75 : 3.25);
      expect(routed.soldiers).toBe(92); // Only canonical daily rout attrition, no phantom-node pursuit.
      expect(winner.posNodeId).toBe(CASTLE_A1);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('detects an actual partial reverse crossing without visiting the original unvisited endpoint', () => {
    const { state, armyId } = midpoint();
    // Controlled coherent castle capture sets up opposing departure authority;
    // BOTH armies' positions still come exclusively from real march/movement commands.
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A1]!.lordId = OFF_BETA_TAISHO;
    state.districts[DIST_A1X]!.ownerClanId = CLAN_BETA;
    state.districts[DIST_A1Y]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.tier = 'main';
    state.clans[CLAN_ALPHA]!.homeCastleId = CASTLE_A2;
    state.officers[OFF_BETA_TAISHO]!.locationCastleId = CASTLE_A1;
    applyEventEffects(state, [{ op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA }], null, () => {});
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const commands: Command[] = [
      { type: 'setArmyTarget', clanId: CLAN_ALPHA, armyId, targetNodeId: CASTLE_A1 },
      {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_BETA_TAISHO,
        deputyIds: [],
        soldiers: 100,
        food: 120,
        targetNodeId: CASTLE_A2,
      },
    ];
    expect(validateState(state)).toEqual([]);
    for (const command of commands) {
      expect(validateCommand(state, command)).toEqual({ ok: true });
      queue.enqueue(command, state.time.day);
    }
    const events: unknown[] = [];
    applyCommands(state, queue.drain(), (event) => events.push(event));
    expect(state.armies[armyId]!.reversingEdgeEndNodeId).toBe(CASTLE_A2);
    const moved = militaryMovementSystem(state);
    expect(moved.filter((event) => event.type === 'battle.started')).toHaveLength(1);
    expect(moved.filter((event) => event.type === 'army.arrived')).toEqual([]);
    expect(state.armies[armyId]!.reversingEdgeEndNodeId).toBeUndefined();
    expect(state.armies[armyId]!.status).toBe('engaged');
    expect(validateState(state)).toEqual([]);
  });
  it('retargeting beyond the entered edge conserves two paid days instead of restarting that edge', () => {
    const { state, armyId } = midpoint();
    const result = tickCommand(state, {
      type: 'setArmyTarget',
      clanId: CLAN_ALPHA,
      armyId,
      targetNodeId: DIST_A2X,
    });
    expect(result.events.filter((event) => event.type === 'army.returned')).toEqual([]);
    expect(state.armies[armyId]?.posNodeId).toBe(CASTLE_A1);
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
    // Four total real daily movement budgets reach A2, even though the tail changed.
    expect(state.armies[armyId]?.posNodeId).toBe(CASTLE_A2);
  });

  it('recall cannot deposit troops/cargo at the last recorded origin while physically mid-edge', () => {
    const { state, armyId } = midpoint();
    const troopsBefore = state.castles[CASTLE_A1]!.soldiers;
    const result = tickCommand(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId });
    expect(result.events.filter((event) => event.type === 'army.returned')).toEqual([]);
    expect(state.armies[armyId]).toBeDefined();
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(troopsBefore);
    // Retreat speed1.25 needs two actual ticks to traverse the two paid days back.
    const returned = advanceDay(state, []);
    expect(returned.events.filter((event) => event.type === 'army.returned')).toHaveLength(1);
    expect(state.armies[armyId]).toBeUndefined();
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(troopsBefore + 100);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['recallArmy', 'setArmyTarget'] as const)(
    'genuine midpoint+pending %s save roundtrip continues identically and conserves physical distance',
    (type) => {
      const { state, armyId } = midpoint();
      const command: Command =
        type === 'recallArmy'
          ? { type, clanId: CLAN_ALPHA, armyId }
          : { type, clanId: CLAN_ALPHA, armyId, targetNodeId: DIST_A2X };
      const loaded = decodeMidpoint(state, [command]);
      const events = tickCommand(state, command).events;
      const restoredEvents = tickCommand(loaded.state, loaded.pendingCommands[0]!).events;
      expect(restoredEvents).toEqual(events);
      expect(loaded.state).toEqual(state);
      expect(state.armies[armyId]).toBeDefined();
      advanceDay(state, []);
      advanceDay(loaded.state, []);
      expect(loaded.state).toEqual(state);
      expect(validateState(state)).toEqual([]);
      if (type === 'recallArmy') expect(state.armies[armyId]).toBeUndefined();
      else expect(state.armies[armyId]?.posNodeId).toBe(CASTLE_A2);
    },
  );
});
