import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { validateState } from '../../src/core/state/invariants';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, ClanId, OfficerId } from '../../src/core/state/ids';
import { dieOfficer } from '../../src/core/systems/officers';
import { beginSiege } from '../../src/core/systems/siege';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
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
  // Controlled actual-node arrival isolates extinction, not movement or conquest.
  army.posNodeId = targetNodeId;
  army.path = [targetNodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  beginSiege(state, targetNodeId, army.id);
  expect(army.status).toBe('sieging');
  expect(army.siegeId).not.toBeNull();
  expect(validateState(state)).toEqual([]);
  return army;
}

function ownership(state: GameState) {
  return {
    castles: Object.values(state.castles).map((castle) => [castle.id, castle.ownerClanId]),
    districts: Object.values(state.districts).map((district) => [
      district.id,
      district.ownerClanId,
    ]),
  };
}

describe('extinction removes siege references to deleted clan armies', () => {
  it.each([1, 2])('ends an emptied siege after deleting %i non-heir commander armies', (count) => {
    const state = buildTinyState();
    expect(state.officers[OFF_BETA_BUSHO]!.kinship).not.toBe('kin');
    expect(state.officers[OFF_BETA_TAISHO]!.kinship).not.toBe('kin');
    const armies = [OFF_BETA_BUSHO, OFF_BETA_TAISHO]
      .slice(0, count)
      .map((leaderId) => deploySiege(state, CLAN_BETA, CASTLE_B1, leaderId, CASTLE_A2));
    const siegeId = armies[0]!.siegeId!;
    expect(state.sieges[siegeId]!.attackerArmyIds).toEqual(armies.map((army) => army.id));
    const beforeOwnership = ownership(state);
    const events = dieOfficer(state, OFF_BETA_LORD, CASTLE_B1, false, 'age');
    expect(
      events.some((event) => event.type === 'clan.destroyed' && event.clanId === CLAN_BETA),
    ).toBe(true);
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    for (const army of armies) expect(state.armies[army.id]).toBeUndefined();
    // The unresolved no-heir territory rule is not changed or concealed by this regression.
    expect(ownership(state)).toEqual(beforeOwnership);
    const violations = validateState(state);
    expect(violations.filter((violation) => violation.inv !== 'INV-13').map((v) => v.inv)).toEqual(
      expect.arrayContaining(['INV-02', 'INV-22']),
    );
    expect(violations.every((v) => ['INV-02', 'INV-22', 'INV-13'].includes(v.inv))).toBe(true);
    expect(violations.filter((violation) => violation.inv === 'INV-13')).toEqual([]);
    //02 §4.10 requires at least one attacker; an empty siege cannot remain live.
    expect(state.sieges[siegeId]).toBeUndefined();
  });

  it('preserves a different clan’s legitimate siege while removing the extinct clan’s siege', () => {
    const state = buildTinyState();
    const extinctArmy = deploySiege(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO, CASTLE_A2);
    const survivor = deploySiege(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    const survivorBefore = structuredClone(survivor);
    const survivorSiegeBefore = structuredClone(state.sieges[survivor.siegeId!]);
    const beforeOwnership = ownership(state);
    dieOfficer(state, OFF_BETA_LORD, CASTLE_B1, false, 'age');
    expect(state.armies[extinctArmy.id]).toBeUndefined();
    expect(state.armies[survivor.id]).toEqual(survivorBefore);
    expect(state.sieges[survivor.siegeId!]).toEqual(survivorSiegeBefore);
    expect(ownership(state)).toEqual(beforeOwnership);
    const violations = validateState(state);
    expect(violations.filter((v) => v.inv !== 'INV-13').map((v) => v.inv)).toEqual(
      expect.arrayContaining(['INV-02', 'INV-22']),
    );
    expect(violations.every((v) => ['INV-02', 'INV-22', 'INV-13'].includes(v.inv))).toBe(true);
    expect(violations.filter((violation) => violation.inv === 'INV-13')).toEqual([]);
    expect(state.sieges[extinctArmy.siegeId!]).toBeUndefined();
  });
});
