import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import type { GameState, RoadEdge } from '../../src/core/state/gameState';
import type { RoadEdgeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

// Synthetic valid campaign graph; army positions/statuses are produced only by
// centrally validated commands and complete daily ticks, not injected fixtures.
function transit(carryDays = 30) {
  const state = buildTinyState();
  const leaves = Object.entries(state.roads).filter(
    ([, edge]) => String(edge.a).startsWith('dist.') || String(edge.b).startsWith('dist.'),
  );
  const road = (id: string, a: RoadEdge['a'], b: RoadEdge['b']): RoadEdge => ({
    id: id as RoadEdgeId,
    a,
    b,
    type: 'land',
    grade: 1,
    baseDays: 10,
  });
  const first = road('road.auto-return-transit', CASTLE_A1, CASTLE_B1);
  const second = road('road.auto-return-target', CASTLE_B1, CASTLE_A2);
  state.roads = { ...Object.fromEntries(leaves), [first.id]: first, [second.id]: second };
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.pacts = [
    { kind: 'alliance', startDay: state.time.day, endDay: state.time.day + 1, vassalClanId: null },
  ];
  state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  const food = Math.ceil(100 * BAL.fieldFoodPerSoldierDaily * carryDays);
  state.castles[CASTLE_A1]!.food = food;
  expect(validateState(state)).toEqual([]);
  const result = tick(state, {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food,
    targetNodeId: CASTLE_A2,
  });
  expect(result.events.some((event) => event.type === 'army.departed')).toBe(true);
  const army = Object.values(state.armies)[0]!;
  expect(army.path).toEqual([CASTLE_A1, CASTLE_B1, CASTLE_A2]);
  expect(army.edgeProgressDays).toBeGreaterThan(0);
  return { state, army };
}

function tick(state: GameState, command?: Command) {
  if (command) expect(validateCommand(state, command)).toEqual({ ok: true });
  const result = advanceDay(
    state,
    command
      ? [
          {
            seq: state.meta.lastAppliedCmdSeq + 1,
            issuedDay: state.time.day,
            command,
          },
        ]
      : [],
  );
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}

describe('07 §3.13 auto-return requires completed physical target arrival', () => {
  it('does not call an owned target complete when expiring transit blocks an entered leg', () => {
    const { state, army } = transit();
    const blocked = tick(state);
    expect(blocked.events.some((event) => event.type === 'pact.expired')).toBe(true);
    expect(blocked.events.some((event) => event.type === 'army.blocked')).toBe(true);
    expect(army.status).toBe('holding');
    expect(army.posNodeId).toBe(CASTLE_A1);
    expect(army.edgeProgressDays).toBeGreaterThan(0);
    expect(state.castles[CASTLE_A2]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(army.food / Math.ceil(army.soldiers * BAL.fieldFoodPerSoldierDaily)).toBeGreaterThan(
      BAL.autoReturnFoodDays,
    );
    const before = { progress: army.edgeProgressDays, cost: army.edgeCostDays };
    const next = tick(state);
    expect(state.armies[army.id]).toBe(army);
    expect(army.status).toBe('holding');
    expect(army.mission).toBe('march');
    expect(army.targetNodeId).toBe(CASTLE_A2);
    expect({ progress: army.edgeProgressDays, cost: army.edgeCostDays }).toEqual(before);
    expect(next.events.some((event) => event.type === 'army.returned')).toBe(false);
  });

  it('still returns a blocked army when its actual food threshold is reached', () => {
    const { state, army } = transit(BAL.minCarryDays);
    tick(state);
    tick(state);
    expect(army.mission).toBe('return');
    expect(army.status === 'returning' || state.armies[army.id] === undefined).toBe(true);
  });

  it('does not return a blocked army when the player disables auto-return', () => {
    const { state, army } = transit(BAL.minCarryDays);
    tick(state, { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: false });
    tick(state);
    expect(state.armies[army.id]).toBe(army);
    expect(army.autoReturn).toBe(false);
    expect(army.status).toBe('holding');
    expect(army.mission).toBe('march');
  });

  it('still auto-returns after genuine arrival at an already-owned district target', () => {
    const state = buildTinyState();
    const arrival = tick(state, {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 60,
      targetNodeId: DIST_A1X,
    });
    const army = Object.values(state.armies)[0]!;
    expect(
      arrival.events.some((event) => event.type === 'army.arrived' && event.nodeId === DIST_A1X),
    ).toBe(true);
    expect(army.posNodeId).toBe(DIST_A1X);
    expect(army.edgeProgressDays).toBe(0);
    expect(army.mission).toBe('return');
    for (let i = 0; i < 10 && state.armies[army.id]; i++) tick(state);
    expect(state.armies[army.id]).toBeUndefined();
  });

  it('recognizes genuine holding completion when auto-return is enabled after arrival', () => {
    const state = buildTinyState();
    const edge = Object.values(state.roads).find(
      (road) => road.a === CASTLE_A1 && road.b === DIST_A1X,
    )!;
    edge.baseDays = 3;
    tick(state, {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 60,
      targetNodeId: DIST_A1X,
    });
    const army = Object.values(state.armies)[0]!;
    tick(state, { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: false });
    for (let i = 0; i < 10 && army.status !== 'holding'; i++) tick(state);
    expect(army.posNodeId).toBe(DIST_A1X);
    expect(army.edgeProgressDays).toBe(0);
    expect(army.status).toBe('holding');
    tick(state, { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: true });
    expect(army.mission).toBe('return');
  });
});
