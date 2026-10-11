import { describe, expect, it } from 'vitest';
import {
  applyMarch,
  applySetAutoReturn,
  validateMarch,
  validateSetAutoReturn,
} from '../../src/core/commands/march';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, ClanId, OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { gatherKassenParticipants } from '../../src/core/systems/battle';
import { militaryMovementSystem } from '../../src/core/systems/military';
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
} from '../fixtures/tiny';

function deployAtReliefNode(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
) {
  const command = {
    type: 'march' as const,
    clanId,
    originCastleId,
    leaderId,
    deputyIds: [],
    soldiers: 1500,
    food: 900,
    targetNodeId: CASTLE_A2,
  };
  expect(validateMarch(state, command)).toEqual({ ok: true });
  const previous = new Set(Object.keys(state.armies));
  applyMarch(state, command, () => {});
  const army = Object.values(state.armies).find((candidate) => !previous.has(candidate.id))!;
  // Controlled actual-node arrival; the production movement system detects relief below.
  army.posNodeId = CASTLE_A2;
  army.path = [CASTLE_A2];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  expect(validateState(state)).toEqual([]);
  return army;
}

describe('tactical capture cannot select an interrupted siege contingent', () => {
  it('excludes the engaged siege army while retaining a legitimate relief participant', () => {
    const state = buildTinyState();
    const besieger = deployAtReliefNode(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO);
    beginSiege(state, CASTLE_A2, besieger.id);
    const siegeId = besieger.siegeId!;
    expect(state.sieges[siegeId]!.interrupted).toBe(false);
    const relief = deployAtReliefNode(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO);
    const holdRelief = {
      type: 'setAutoReturn' as const,
      clanId: CLAN_ALPHA,
      armyId: relief.id,
      enabled: false,
    };
    expect(validateSetAutoReturn(state, holdRelief)).toEqual({ ok: true });
    applySetAutoReturn(state, holdRelief);
    const events = militaryMovementSystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'siege.relief', siegeId, castleId: CASTLE_A2 }),
    );
    expect(state.sieges[siegeId]!.interrupted).toBe(true);
    expect(besieger.status).toBe('engaged');
    expect(besieger.siegeId).toBe(siegeId);
    expect(relief.status).toBe('engaged');
    expect(relief.siegeId).toBeNull();
    const combat = Object.values(state.fieldCombats)[0]!;
    expect([...combat.sideA.armyIds, ...combat.sideB.armyIds]).toEqual(
      expect.arrayContaining([besieger.id, relief.id]),
    );
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state);
    const participants = gatherKassenParticipants(state, combat, CLAN_BETA, CLAN_ALPHA);
    expect(participants.attacker).toEqual([]);
    expect(participants.defender.map((army) => army.id)).toEqual([relief.id]);
    expect(state).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });
});
