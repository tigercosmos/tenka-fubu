import { describe, expect, it } from 'vitest';
import { transportDaily } from '../../src/core/systems/transport';
import { applyRecallTransport } from '../../src/core/commands/domesticCommands';
import type { TransportOrder } from '../../src/core/state/gameState';
import type { RoadEdgeId, TransportId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, DIST_A1X } from '../fixtures/tiny';

/** Synthetic fractional roads isolate canonical daily carryover, not historical geography. */
function fixture(costs: [number, number]) {
  const state = buildTinyState();
  const path = [CASTLE_A1, DIST_A1X, CASTLE_A2];
  state.roads = Object.fromEntries(
    costs.map((baseDays, index) => {
      const id = `road.carry${index}` as RoadEdgeId;
      return [id, { id, a: path[index]!, b: path[index + 1]!, baseDays, grade: 1, type: 'land' }];
    }),
  );
  const order: TransportOrder = {
    id: 'trans.carry' as TransportId,
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A1,
    toCastleId: CASTLE_A2,
    soldiers: 0,
    food: 1,
    gold: 0,
    path,
    pathCursor: 0,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    returning: false,
  };
  state.transports[order.id] = order;
  return { state, order };
}

describe('transport fractional daily carryover', () => {
  it('arrives in ceil(total edge days), preserving surplus into the next edge', () => {
    const { state, order } = fixture([0.6, 0.6]);
    expect(transportDaily(state)).toEqual([]);
    expect(order.pathCursor).toBe(1);
    expect(order.edgeProgressDays).toBeCloseTo(0.4);
    const events = transportDaily(state);
    expect(events.some((event) => event.type === 'transport.arrived')).toBe(true);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('checks uprising at an intermediate node before spending surplus on the next edge', () => {
    const { state, order } = fixture([0.2, 0.2]);
    state.districts[DIST_A1X]!.uprising = { startedOnDay: state.time.day, armySoldiers: 100 };
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(false);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('crosses two short edges and arrives within a single daily budget', () => {
    const { state, order } = fixture([0.2, 0.2]);
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('does not bank unused daily budget while the next edge is missing', () => {
    const { state, order } = fixture([0.6, 1.5]);
    const edge = state.roads['road.carry1' as RoadEdgeId]!;
    delete state.roads[edge.id];
    transportDaily(state);
    transportDaily(state);
    expect(order.edgeProgressDays).toBe(0);
    state.roads[edge.id] = edge;
    expect(transportDaily(state)).toEqual([]);
    expect(order.edgeProgressDays).toBe(1);
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
  });

  it('freezes entered edge cost even if its road changes before completion', () => {
    const { state, order } = fixture([1.5, 0.2]);
    transportDaily(state);
    state.roads['road.carry0' as RoadEdgeId]!.baseDays = 100;
    expect(order.edgeCostDays).toBe(1.5);
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
  });

  it('returns a recalled in-flight order across short prior edges within the remaining day budget', () => {
    const { state, order } = fixture([0.2, 2]);
    transportDaily(state);
    expect(order.edgeProgressDays).toBeCloseTo(0.8);
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    const events = transportDaily(state);
    expect(events.some((event) => event.type === 'transport.arrived')).toBe(true);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('does not loot at the synthetic never-reached forward cursor after a mid-edge recall', () => {
    const { state, order } = fixture([2, 0.2]);
    transportDaily(state);
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    expect(order.pathCursor).toBe(1);
    state.districts[DIST_A1X]!.uprising = { startedOnDay: state.time.day, armySoldiers: 100 };
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('still loots at a node actually visited on the reverse path', () => {
    const { state, order } = fixture([0.2, 2]);
    transportDaily(state);
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    state.districts[DIST_A1X]!.uprising = { startedOnDay: state.time.day, armySoldiers: 100 };
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(false);
    expect(state.transports[order.id]).toBeUndefined();
  });

  it('does not loot at the old source node while ordinarily partway along the next edge', () => {
    const { state, order } = fixture([0.2, 2]);
    transportDaily(state);
    expect(order.pathCursor).toBe(1);
    expect(order.edgeProgressDays).toBeCloseTo(0.8);
    state.districts[DIST_A1X]!.uprising = { startedOnDay: state.time.day, armySoldiers: 100 };
    expect(transportDaily(state)).toEqual([]);
    expect(state.transports[order.id]).toBe(order);
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(true);
  });
});
