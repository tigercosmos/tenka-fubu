import { describe, expect, it } from 'vitest';
import {
  applyRecallTransport,
  applyTransport,
  validateRecallTransport,
  validateTransport,
} from '../../src/core/commands/domesticCommands';
import { transportDaily } from '../../src/core/systems/transport';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
} from '../fixtures/tiny';

/** Controlled ownership transitions; paths/recall encoding come only from production functions. */
describe('recalling a production fallback transport route', () => {
  it('routes an accepted legacy singleton physical node to its owned destination rather than depositing remotely', () => {
    const state = buildTinyState();
    const send = {
      type: 'transport' as const,
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      food: 100,
      gold: 20,
    };
    applyTransport(state, send);
    const order = Object.values(state.transports)[0]!;
    // An accepted legacy physical-node representation, not an issued route shape claim.
    order.path = [CASTLE_A1];
    expect(validateState(state)).toEqual([]);
    const food = state.castles[CASTLE_A2]!.food;
    const events = transportDaily(state);
    expect(events.some((event) => event.type === 'transport.arrived')).toBe(false);
    expect(state.transports[order.id]).toBe(order);
    expect(state.castles[CASTLE_A2]!.food).toBe(food);
    expect(order.path).toEqual([CASTLE_A1, CASTLE_A2]);
    expect(transportDaily(state)).toContainEqual(
      expect.objectContaining({ type: 'transport.arrived', toCastleId: CASTLE_A2 }),
    );
  });
  it('does not deposit at the original castle while physically at a different fallback path terminal', () => {
    const state = buildTinyState();
    const send = {
      type: 'transport' as const,
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      food: 100,
      gold: 20,
    };
    expect(validateTransport(state, send)).toEqual({ ok: true });
    applyTransport(state, send);
    const order = Object.values(state.transports)[0]!;
    transportDaily(state); // Actual halfway point on A1 -> A2 (two days).
    expect(order.edgeProgressDays).toBe(1);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    transportDaily(state); // Finish the existing leg, then production fallback from actual A2.
    expect(order.path).toEqual([CASTLE_A2, CASTLE_B1]);
    expect(order.fromCastleId).toBe(CASTLE_A1);
    expect(order.toCastleId).toBe(CASTLE_B1);
    expect(order.pathCursor).toBe(0);
    expect(order.edgeCostDays).toBe(0);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_ALPHA;
    const recall = { type: 'recallTransport' as const, clanId: CLAN_ALPHA, transportId: order.id };
    expect(validateRecallTransport(state, recall)).toEqual({ ok: true });
    applyRecallTransport(state, recall);
    const originFood = state.castles[CASTLE_A1]!.food;
    const clanGold = state.clans[CLAN_ALPHA]!.gold;
    const events = transportDaily(state);
    expect(events.some((event) => event.type === 'transport.arrived')).toBe(false);
    expect(state.transports[order.id]).toBe(order);
    expect(state.castles[CASTLE_A1]!.food).toBe(originFood);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(clanGold);
    // Existing actual A2 -> A1 road takes two days, never an immediate A1 refund/deposit.
    expect(transportDaily(state)).toContainEqual(
      expect.objectContaining({ type: 'transport.arrived', toCastleId: CASTLE_A1 }),
    );
  });
});
