import { describe, expect, it } from 'vitest';
import { applyRecallTransport } from '../../src/core/commands/domesticCommands';
import { transportDaily } from '../../src/core/systems/transport';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import type { Army, RoadEdge, TransportOrder } from '../../src/core/state/gameState';
import type { ArmyId, PolicyId, RoadEdgeId, TransportId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

// Controlled real node/edge graph, not a complete capture simulation: ownership
// changes isolate05§3.6's physical transport contract from battle/succession systems.
function fixture() {
  const state = buildTinyState();
  const edge = (id: string, a: RoadEdge['a'], b: RoadEdge['b'], baseDays: number): RoadEdge => ({
    id: id as RoadEdgeId,
    a,
    b,
    type: 'land',
    grade: 1,
    baseDays,
  });
  const long = edge('road.physical-long', CASTLE_A1, CASTLE_A2, 4);
  const fromOrigin = edge('road.physical-origin-refuge', CASTLE_A1, CASTLE_B1, 1);
  const fromTarget = edge('road.physical-target-refuge', CASTLE_A2, CASTLE_B1, 1);
  const districtLeaves = Object.fromEntries(
    Object.entries(state.roads).filter(
      ([, road]) => String(road.a).startsWith('dist.') || String(road.b).startsWith('dist.'),
    ),
  );
  state.roads = {
    ...districtLeaves,
    [long.id]: long,
    [fromOrigin.id]: fromOrigin,
    [fromTarget.id]: fromTarget,
  };
  const order: TransportOrder = {
    id: 'trans.physical' as TransportId,
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A1,
    toCastleId: CASTLE_A2,
    soldiers: 50,
    food: 100,
    gold: 0,
    path: [CASTLE_A1, CASTLE_A2],
    pathCursor: 0,
    edgeProgressDays: 2,
    edgeCostDays: 4,
    returning: false,
  };
  state.transports[order.id] = order;
  return { state, order, long, fromOrigin, fromTarget };
}

function enemyArmy(node: Army['posNodeId']): Army {
  return {
    id: 'army.physical-looter' as ArmyId,
    clanId: CLAN_BETA,
    leaderId: OFF_BETA_LORD,
    deputyIds: [],
    soldiers: 100,
    initialTroops: 100,
    food: 0,
    morale: 80,
    status: 'holding',
    mission: 'march',
    originCastleId: CASTLE_A2,
    targetNodeId: null,
    path: [node],
    pathCursor: 0,
    posNodeId: node,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    battleId: null,
    siegeId: null,
    autoReturn: true,
    corpsId: null,
    pursuitEligibleArmyIds: [],
  };
}

describe('physical transport ownership reroutes (05§3.6,04§3.7,02 progress accumulator)', () => {
  it('clears an unspent next-edge cost on node-boundary recall and traverses the previous edge at its full cost', () => {
    const { state, order } = fixture();
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    order.toCastleId = CASTLE_B1;
    order.path = [CASTLE_A1, CASTLE_A2, CASTLE_B1];
    order.pathCursor = 1;
    order.edgeProgressDays = 0;
    order.edgeCostDays = 1; // Unspent A2→B1 edge, not the four-day A2→A1 edge.
    const source = structuredClone(state.castles[CASTLE_A1]);
    const rng = structuredClone(state.rng);
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    expect(order).toMatchObject({
      returning: true,
      pathCursor: 1,
      edgeCostDays: 0,
      edgeProgressDays: 0,
    });
    for (let day = 1; day <= 3; day += 1) {
      expect(transportDaily(state)).toEqual([]);
      expect(order).toMatchObject({ pathCursor: 1, edgeCostDays: 4, edgeProgressDays: day });
      expect(state.castles[CASTLE_A1]).toEqual(source);
    }
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_A1, food: 100, soldiers: 50 },
    ]);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.rng).toEqual(rng);
  });

  it('takes the actual two elapsed-edge days to return after destination capture, without a free arrival', () => {
    const { state, order } = fixture();
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    const source = structuredClone(state.castles[CASTLE_A1]);
    const rng = structuredClone(state.rng);
    expect(transportDaily(state)).toEqual([]);
    expect(state.transports[order.id]).toBe(order);
    expect(order).toMatchObject({
      returning: true,
      pathCursor: 1,
      edgeCostDays: 2,
      edgeProgressDays: 1,
    });
    expect(state.castles[CASTLE_A1]).toEqual(source);
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_A1, food: 100, soldiers: 50 },
    ]);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.castles[CASTLE_A1]!.food).toBe(source!.food + 100);
    expect(state.rng).toEqual(rng);
  });

  it('finishes a recalled partial leg before rerouting from the actually visited node after origin capture', () => {
    const { state, order } = fixture();
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    // Cursor1 is a partial-reversal representation, not physical occupancy of A2.
    expect(order).toMatchObject({
      returning: true,
      pathCursor: 1,
      edgeCostDays: 2,
      edgeProgressDays: 0,
    });
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    const refuge = structuredClone(state.castles[CASTLE_B1]);
    expect(transportDaily(state)).toEqual([]);
    expect(order.path).toEqual([CASTLE_A1, CASTLE_A2]);
    expect(order).toMatchObject({
      returning: true,
      pathCursor: 1,
      edgeCostDays: 2,
      edgeProgressDays: 1,
    });
    expect(state.castles[CASTLE_B1]).toEqual(refuge);
    expect(transportDaily(state)).toEqual([]);
    expect(order.path).toEqual([CASTLE_A1, CASTLE_B1]);
    expect(order.path[order.pathCursor]).toBe(CASTLE_A1);
    expect(state.castles[CASTLE_B1]).toEqual(refuge);
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_B1, food: 100 },
    ]);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('continues its entered forward leg when both endpoints fall, then reroutes only at actual arrival', () => {
    const { state, order } = fixture();
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    const refuge = structuredClone(state.castles[CASTLE_B1]);
    expect(transportDaily(state)).toEqual([]);
    expect(order).toMatchObject({
      returning: false,
      pathCursor: 0,
      edgeCostDays: 4,
      edgeProgressDays: 3,
    });
    expect(state.castles[CASTLE_B1]).toEqual(refuge);
    expect(transportDaily(state)).toEqual([]);
    expect(order.path).toEqual([CASTLE_A2, CASTLE_B1]);
    expect(order.path[order.pathCursor]).toBe(CASTLE_A2);
    expect(state.castles[CASTLE_B1]).toEqual(refuge);
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_B1 },
    ]);
  });

  it('preserves the frozen entered cost through road/policy changes', () => {
    const { state, order, long } = fixture();
    long.grade = 3;
    state.policies[CLAN_ALPHA]!.active.push('pol.tenmasei' as PolicyId);
    expect(transportDaily(state)).toEqual([]);
    expect(order).toMatchObject({ edgeCostDays: 4, edgeProgressDays: 3 });
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_A2 },
    ]);
  });

  it('waits without destroying cargo or resetting entered progress while its edge is absent', () => {
    const { state, order, long } = fixture();
    delete state.roads[long.id];
    const before = structuredClone(state);
    expect(transportDaily(state)).toEqual([]);
    expect(state).toEqual(before);
    state.roads[long.id] = long;
    expect(transportDaily(state)).toEqual([]);
    expect(order).toMatchObject({ edgeCostDays: 4, edgeProgressDays: 3 });
  });

  it('does not loot at the synthetic reversal cursor but does loot at a genuinely reached node', () => {
    const { state, order } = fixture();
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.lastHostileDay = state.time.day;
    row.pacts = [];
    const army = enemyArmy(CASTLE_A2);
    state.armies[army.id] = army;
    expect(transportDaily(state)).toEqual([]);
    expect(state.transports[order.id]).toBe(order);
    army.posNodeId = CASTLE_A1;
    army.path = [CASTLE_A1];
    const sourceFood = state.castles[CASTLE_A1]!.food;
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.looted', nodeId: CASTLE_A1, food: 100 },
    ]);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.castles[CASTLE_A1]!.food).toBe(sourceFood);
    expect(army.food).toBe(100);
  });

  it('holds cargo at an actually reached node when no friendly route exists, and retries when restored', () => {
    const { state, order, fromOrigin } = fixture();
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    order.edgeProgressDays = 0;
    order.edgeCostDays = 0;
    delete state.roads[fromOrigin.id];
    // The graph remains connected through foreign A2, which is not a legal
    // transit castle. Missing reachability is not a malformed disconnected map.
    const before = structuredClone(order);
    expect(transportDaily(state)).toEqual([]);
    expect(order).toEqual(before);
    state.roads[fromOrigin.id] = fromOrigin;
    expect(transportDaily(state)).toMatchObject([
      { type: 'transport.arrived', toCastleId: CASTLE_B1 },
    ]);
  });
});
