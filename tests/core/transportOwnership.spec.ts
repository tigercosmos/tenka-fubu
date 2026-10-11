import { describe, expect, it } from 'vitest';
import { transportDaily } from '../../src/core/systems/transport';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import type { TransportOrder } from '../../src/core/state/gameState';
import type { ArmyId, TransportId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState();
  const order: TransportOrder = {
    id: 'trans.ownership-test' as TransportId,
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A1,
    toCastleId: CASTLE_A2,
    soldiers: 50,
    food: 100,
    gold: 20,
    path: [CASTLE_A1, CASTLE_A2],
    pathCursor: 0,
    edgeCostDays: 1,
    edgeProgressDays: 0,
    returning: false,
  };
  state.transports[order.id] = order;
  return { state, order };
}
describe('transport ownership changes and arrival looting (05 §3.6)', () => {
  it('loots on the final movement node before depositing any cargo', () => {
    const { state, order } = fixture();
    const relation = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    relation.lastHostileDay = state.time.day;
    relation.pacts = [];
    const id = 'army.final-looter' as ArmyId;
    state.armies[id] = {
      id,
      clanId: CLAN_BETA,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 100,
      initialTroops: 100,
      food: 0,
      morale: 80,
      status: 'holding',
      mission: 'march',
      originCastleId: CASTLE_B1,
      targetNodeId: null,
      path: [CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_A2,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      battleId: null,
      siegeId: null,
      autoReturn: true,
      corpsId: null,
      pursuitEligibleArmyIds: [],
    };
    const castleBefore = structuredClone(state.castles[CASTLE_A2]);
    const gold = state.clans[CLAN_BETA]!.gold;
    const events = transportDaily(state);
    expect(events.map((e) => e.type)).toEqual(['transport.looted']);
    expect(events[0]).toMatchObject({
      nodeId: CASTLE_A2,
      ownerClanId: CLAN_ALPHA,
      gold: 20,
      soldiers: 50,
    });
    expect(state.castles[CASTLE_A2]).toEqual(castleBefore);
    expect(state.clans[CLAN_BETA]!.gold).toBe(gold + 20);
    expect(state.armies[id].food).toBe(100);
    expect(state.armies[id].soldiers).toBe(100);
    expect(state.transports[order.id]).toBeUndefined();
  });
  it('physically reverses to owned origin after destination capture, without foreign deposit or early gold refund', () => {
    const { state, order } = fixture();
    order.pathCursor = 1;
    order.edgeCostDays = 0; // This fixture starts at an actual node, not on an entered leg.
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    const foreign = structuredClone(state.castles[CASTLE_A2]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    expect(transportDaily(state)).toEqual([]);
    expect(order.returning).toBe(true);
    expect(order.pathCursor).toBe(1);
    expect(state.castles[CASTLE_A2]).toEqual(foreign);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
    for (let day = 0; day < 10 && state.transports[order.id]; day++) transportDaily(state);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 20);
    expect(state.castles[CASTLE_A2]).toEqual(foreign);
  });
  it('reroutes to a reachable owned castle when both endpoints are captured', () => {
    const { state, order } = fixture();
    order.pathCursor = 1;
    order.edgeCostDays = 0;
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    const before = state.castles[CASTLE_B1]!.food;
    transportDaily(state);
    expect(order.toCastleId).toBe(CASTLE_B1);
    expect(order.path).toEqual([CASTLE_A2, CASTLE_B1]);
    for (let day = 0; day < 10 && state.transports[order.id]; day++) transportDaily(state);
    expect(state.castles[CASTLE_B1]!.food).toBe(before + 100);
    expect(state.transports[order.id]).toBeUndefined();
  });
  it('holds unchanged cargo while no friendly route exists and resumes when ownership opens a route', () => {
    const { state, order } = fixture();
    order.edgeCostDays = 0;
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const waiting = structuredClone(order);
    for (let day = 0; day < 3; day++) expect(transportDaily(state)).toEqual([]);
    expect(order).toEqual(waiting);
    expect(order).toMatchObject({ pathCursor: 0, food: 100, gold: 20, soldiers: 50 });
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_ALPHA;
    for (let day = 0; day < 10 && state.transports[order.id]; day++) transportDaily(state);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 20);
  });
  it('destroys remnant cargo if the clan owns no remaining castle', () => {
    const { state, order } = fixture();
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    expect(transportDaily(state)).toEqual([]);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
  });
  it('rechecks captured origin for an already-recalled convoy', () => {
    const { state, order } = fixture();
    order.pathCursor = 1;
    order.edgeCostDays = 0;
    order.returning = true;
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    const food = state.castles[CASTLE_A1]!.food;
    const events = transportDaily(state);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'transport.arrived', toCastleId: CASTLE_A2 }),
    );
    expect(state.castles[CASTLE_A1]!.food).toBe(food);
  });
});
