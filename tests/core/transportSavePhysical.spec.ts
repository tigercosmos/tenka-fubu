import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { TransportOrder } from '../../src/core/state/gameState';
import type { GameState } from '../../src/core/state/gameState';
import { applyRecallTransport } from '../../src/core/commands/domesticCommands';
import { transportDaily } from '../../src/core/systems/transport';
import { advanceOneDay } from '../../src/core/systems/time';
import type { TransportId, RoadEdgeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
} from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState();
  const edgeId = 'road.physical' as RoadEdgeId;
  state.roads[edgeId] = {
    id: edgeId,
    a: DIST_A1X,
    b: CASTLE_A2,
    grade: 1,
    baseDays: 2,
    type: 'land',
  };
  const order: TransportOrder = {
    id: 'trans.000001' as TransportId,
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A1,
    toCastleId: CASTLE_A2,
    soldiers: 0,
    food: 100,
    gold: 0,
    path: [CASTLE_A1, DIST_A1X, CASTLE_A2],
    pathCursor: 0,
    edgeProgressDays: 0.25,
    edgeCostDays: 2,
    returning: false,
  };
  state.transports[order.id] = order;
  return { state, order };
}
describe('persisted transport physical legs', () => {
  it.each([
    { path: ['castle.nonexistent'], pathCursor: 0, edgeProgressDays: 0, edgeCostDays: 0 },
    { fromCastleId: 'castle.nonexistent' },
    { toCastleId: 'castle.nonexistent' },
  ])('rejects missing physical nodes and endpoint references: %j', (fields) => {
    const { state, order } = fixture();
    Object.assign(order, fields);
    expect(validateState(state).some((failure) => failure.inv === 'INV-12')).toBe(true);
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
  it('preserves valid fallback paths starting at the actual current node rather than the original source', () => {
    const { state, order } = fixture();
    order.path = [DIST_A1X, CASTLE_A2];
    order.pathCursor = 0;
    expect(validateState(state)).toEqual([]);
    expect(decodeSave(encodeSave(state, 123)).ok).toBe(true);
  });
  function continueRoundtrip(state: GameState, order: TransportOrder, expectedArrivalDays: number) {
    expect(validateState(state)).toEqual([]);
    const loaded = decodeSave(encodeSave(state, 123));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('Valid transport continuation fixture failed to decode');
    const restored = loaded.saveFile.state;
    expect(restored.transports[order.id]).toEqual(order);
    for (let day = 1; day <= expectedArrivalDays; day += 1) {
      advanceOneDay(state.time);
      advanceOneDay(restored.time);
      const originalEvents = transportDaily(state),
        restoredEvents = transportDaily(restored);
      expect(restoredEvents).toEqual(originalEvents);
      expect(restored).toEqual(state);
      expect(validateState(state)).toEqual([]);
      expect(validateState(restored)).toEqual([]);
      expect(originalEvents.some((event) => event.type === 'transport.arrived')).toBe(
        day === expectedArrivalDays,
      );
    }
    expect(state.transports[order.id]).toBeUndefined();
  }
  it('continues an actual production partial recall identically after a zero-progress positive-cost save', () => {
    const { state, order } = fixture();
    order.pathCursor = 1;
    order.edgeProgressDays = 1.5;
    order.edgeCostDays = 2;
    applyRecallTransport(state, {
      type: 'recallTransport',
      clanId: CLAN_ALPHA,
      transportId: order.id,
    });
    expect(order.returning).toBe(true);
    expect(order.edgeProgressDays).toBe(0);
    expect(order.edgeCostDays).toBe(1.5);
    // 1.5 paid days back to the prior district + its actual 1-day road to the original castle.
    continueRoundtrip(state, order, 3);
  });
  it('continues production automatic reversal after a controlled valid destination ownership change without wiping distance', () => {
    const { state, order } = fixture();
    order.pathCursor = 1;
    order.edgeProgressDays = 1.5;
    order.edgeCostDays = 2;
    // Controlled ownership fixture, not a claim to exercise battle capture: release assignments
    // and relocate serving officers so all canonical ownership/location invariants remain valid.
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.lordId = null;
    for (const districtId of state.castles[CASTLE_A2]!.districtIds) {
      state.districts[districtId]!.ownerClanId = CLAN_BETA;
      state.districts[districtId]!.stewardId = null;
    }
    for (const officer of Object.values(state.officers))
      if (officer.locationCastleId === CASTLE_A2) officer.locationCastleId = CASTLE_A1;
    expect(validateState(state)).toEqual([]);
    advanceOneDay(state.time);
    expect(transportDaily(state).some((event) => event.type === 'transport.arrived')).toBe(false);
    expect(order.returning).toBe(true);
    expect(order.edgeCostDays).toBe(1.5);
    expect(order.edgeProgressDays).toBe(1);
    // The remaining half day on the frozen reverse leg plus one road still needs two days.
    continueRoundtrip(state, order, 2);
  });
  it('preserves a canonical pending recall command alongside a forward partial physical leg', () => {
    const { state, order } = fixture();
    const pending = [
      { type: 'recallTransport' as const, clanId: CLAN_ALPHA, transportId: order.id },
    ];
    const loaded = decodeSave(encodeSave(state, 123, pending));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.saveFile.pendingCommands).toEqual(pending);
      expect(loaded.saveFile.state.transports[order.id]).toEqual(order);
    }
  });
  it.each([
    { returning: false, pathCursor: 0, edgeProgressDays: 0.25, edgeCostDays: 2 },
    { returning: true, pathCursor: 1, edgeProgressDays: 0, edgeCostDays: 0.25 },
    { returning: true, pathCursor: 1, edgeProgressDays: 0.1, edgeCostDays: 0.25 },
    { returning: true, pathCursor: 0, edgeProgressDays: 0, edgeCostDays: 0 },
    { returning: false, pathCursor: 2, edgeProgressDays: 0, edgeCostDays: 0 },
  ])('preserves valid forward, partial recall and terminal node fields: %j', (fields) => {
    const { state, order } = fixture();
    Object.assign(order, fields);
    expect(validateState(state)).toEqual([]);
    const loaded = decodeSave(encodeSave(state, 123));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.saveFile.state.transports[order.id]).toEqual(order);
  });
  it.each([
    { pathCursor: 2 },
    { returning: true, pathCursor: 0 },
    { returning: 'false' },
    { returning: 1 },
    { returning: null },
    { pathCursor: 0.5 },
    { pathCursor: '0' },
    { pathCursor: NaN },
    { pathCursor: Infinity },
    { pathCursor: -1 },
    { edgeCostDays: NaN },
    { edgeCostDays: Infinity },
    { edgeCostDays: '2' },
    { edgeCostDays: null },
    { edgeCostDays: -1 },
    { edgeProgressDays: NaN },
    { edgeProgressDays: Infinity },
    { edgeProgressDays: '0.25' },
    { edgeProgressDays: null },
    { edgeProgressDays: -0.1 },
  ])('rejects malformed physical fields directly and through JSON codec: %j', (fields) => {
    const { state, order } = fixture();
    Object.assign(order, fields);
    expect(validateState(state).some((failure) => failure.inv === 'INV-12')).toBe(true);
    // JSON turns nonfinite numbers into null; both must be rejected, not coerced into valid progress.
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
});
