import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, ClanId, OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { beginSiege, siegeSystem } from '../../src/core/systems/siege';
import { militaryMovementSystem } from '../../src/core/systems/military';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function deploySiege(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
  targetNodeId: CastleId,
) {
  const command = {
    type: 'march' as const,
    clanId,
    originCastleId,
    leaderId,
    deputyIds: [],
    soldiers: 200,
    food: 120,
    targetNodeId,
  };
  expect(validateMarch(state, command)).toEqual({ ok: true });
  const previous = new Set(Object.keys(state.armies));
  applyMarch(state, command, () => {});
  const army = Object.values(state.armies).find((candidate) => !previous.has(candidate.id))!;
  // Controlled actual-node arrival isolates capture cleanup from movement.
  army.posNodeId = targetNodeId;
  army.path = [targetNodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  expect(beginSiege(state, targetNodeId, army.id).map((event) => event.type)).toEqual([
    'siege.started',
  ]);
  expect(validateState(state)).toEqual([]);
  return army;
}

describe('other extinction paths reconcile siege memberships', () => {
  it('zero-castle disband removes another army’s siege after a controlled ownership transition', () => {
    const state = buildTinyState();
    const siegeArmy = deploySiege(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO, CASTLE_A2);
    const siegeId = siegeArmy.siegeId!;
    const command = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_TAISHO,
      deputyIds: [],
      soldiers: 200,
      food: 120,
      targetNodeId: CASTLE_A2,
    };
    expect(validateMarch(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => {});
    const disbanded = Object.values(state.armies).find((army) => army.id !== siegeArmy.id)!;
    expect(validateState(state)).toEqual([]);
    // This controlled transient models loss of the final castle before military cleanup.
    // It intentionally violates only the alive clan's home ownership (INV09), not siege links.
    const castle = state.castles[CASTLE_B1]!;
    castle.ownerClanId = CLAN_ALPHA;
    castle.tier = 'branch';
    castle.lordId = null;
    for (const id of castle.districtIds) state.districts[id]!.ownerClanId = CLAN_ALPHA;
    disbanded.status = 'routed';
    disbanded.soldiers = 0;
    expect(validateState(state).map((violation) => violation.inv)).toEqual(['INV-09', 'INV-09']);
    const events = militaryMovementSystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'clan.destroyed', clanId: CLAN_BETA }),
    );
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(state.armies[disbanded.id]).toBeUndefined();
    expect(state.armies[siegeArmy.id]).toBeUndefined();
    expect(state.sieges[siegeId]).toBeUndefined();
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(validateState(state)).toEqual([]);
  });

  it('last-castle capture absorbs a clan without leaving its earlier-processed siege dangling', () => {
    const state = buildTinyState();
    const defenderArmy = deploySiege(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO, CASTLE_A2);
    const defenderSiegeId = defenderArmy.siegeId!;
    const conqueror = deploySiege(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    // The doomed clan's siege executes first, so a later siege iteration cannot mask stale IDs.
    expect(defenderSiegeId < conqueror.siegeId!).toBe(true);
    state.castles[CASTLE_B1]!.soldiers = 0;
    expect(validateState(state)).toEqual([]);
    const events = siegeSystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'clan.destroyed', clanId: CLAN_BETA }),
    );
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(Object.values(state.castles).some((castle) => castle.ownerClanId === CLAN_BETA)).toBe(
      false,
    );
    expect(
      Object.values(state.districts).some((district) => district.ownerClanId === CLAN_BETA),
    ).toBe(false);
    expect(state.armies[defenderArmy.id]).toBeUndefined();
    expect(state.armies[conqueror.id]).toBeDefined();
    expect(validateState(state)).toEqual([]);
    expect(state.sieges[defenderSiegeId]).toBeUndefined();
  });
});
