import { describe, expect, it } from 'vitest';
import { getTransportOrders } from '../../src/app/transportBridge';
import { applyRecallTransport, applyTransport } from '../../src/core/commands/domesticCommands';
import { transportDaily } from '../../src/core/systems/transport';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { CastleId, TransportId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState();
  applyTransport(state, {
    type: 'transport',
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A1,
    toCastleId: CASTLE_A2,
    soldiers: 10,
    food: 100,
    gold: 1,
  });
  const order = Object.values(state.transports)[0]!;
  return { state, order };
}

describe('detached active transport order views', () => {
  it('filters ownership/original source and sorts stable IDs, retaining captured-source owned orders', () => {
    const { state, order } = fixture();
    const other = {
      ...structuredClone(order),
      id: 'trans.000000' as TransportId,
      fromCastleId: CASTLE_A2,
    };
    state.transports[other.id] = other;
    const foreign = {
      ...structuredClone(order),
      id: 'trans.enemy' as TransportId,
      clanId: CLAN_BETA,
    };
    state.transports[foreign.id] = foreign;
    expect(getTransportOrders(state, CLAN_ALPHA).map((row) => row.id)).toEqual([
      other.id,
      order.id,
    ]);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    expect(getTransportOrders(state, CLAN_ALPHA, CASTLE_A1).map((row) => row.id)).toEqual([
      order.id,
    ]);
    expect(getTransportOrders(null, CLAN_ALPHA)).toEqual([]);
  });

  it('projects actual node, forward in-edge and recalled partial edge without a fictitious occupied node', () => {
    const { state, order } = fixture();
    expect(getTransportOrders(state, CLAN_ALPHA)[0]).toMatchObject({
      canRecall: true,
      returning: false,
      position: { kind: 'node', nodeId: CASTLE_A1 },
    });
    transportDaily(state);
    expect(getTransportOrders(state, CLAN_ALPHA)[0]!.position).toMatchObject({
      kind: 'edge',
      aNodeId: CASTLE_A1,
      bNodeId: CASTLE_A2,
    });
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    expect(order.edgeProgressDays).toBe(0);
    expect(getTransportOrders(state, CLAN_ALPHA)[0]).toMatchObject({
      canRecall: false,
      returning: true,
      position: { kind: 'edge', aNodeId: CASTLE_A2, bNodeId: CASTLE_A1 },
    });
    transportDaily(state);
    expect(getTransportOrders(state, CLAN_ALPHA)).toEqual([]);
  });

  it('uses ID fallbacks for missing endpoints and unknown for malformed physical pointers', () => {
    const { state, order } = fixture();
    order.toCastleId = 'castle.deleted' as CastleId;
    order.pathCursor = 100;
    expect(getTransportOrders(state, CLAN_ALPHA)[0]).toMatchObject({
      toName: 'castle.deleted',
      position: { kind: 'unknown' },
    });
    order.pathCursor = order.path.length - 1;
    order.edgeCostDays = 1;
    expect(getTransportOrders(state, CLAN_ALPHA)[0]!.position).toEqual({ kind: 'unknown' });
  });

  it('does not mutate state/RNG and returns independent snapshots refreshed after in-place changes', () => {
    const { state, order } = fixture();
    const before = canonicalStringify(state);
    const rows = getTransportOrders(state, CLAN_ALPHA);
    expect(rows[0]).toMatchObject({
      soldiers: 10,
      food: 100,
      gold: 1,
      fromName: state.castles[CASTLE_A1]!.name,
      toName: state.castles[CASTLE_A2]!.name,
    });
    (rows[0]!.position as { name: string }).name = 'changed';
    expect(canonicalStringify(state)).toBe(before);
    order.food = 50;
    state.castles[CASTLE_A1]!.name = 'fresh';
    expect(getTransportOrders(state, CLAN_ALPHA)[0]).toMatchObject({
      food: 50,
      fromName: 'fresh',
      position: { name: 'fresh' },
    });
    expect(rows[0]!.food).toBe(100);
    delete state.transports[order.id];
    expect(getTransportOrders(state, CLAN_ALPHA)).toEqual([]);
  });
});
