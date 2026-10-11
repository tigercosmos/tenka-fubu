import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import type { GameState } from '../../src/core/state/gameState';
import type { OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { dieOfficer, officersSystem } from '../../src/core/systems/officers';
import { beginSiege } from '../../src/core/systems/siege';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import { applyMakeRoninEvent } from '../../src/core/systems/events/officerLifecycle';
import type { GameEvent } from '../../src/core/state/events';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_BETA,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function deploy(state: GameState, leaderId: OfficerId, deputyIds: OfficerId[] = []) {
  const command = {
    type: 'march' as const,
    clanId: CLAN_BETA,
    originCastleId: CASTLE_B1,
    leaderId,
    deputyIds,
    soldiers: 200,
    food: 120,
    targetNodeId: CASTLE_A2,
  };
  expect(validateMarch(state, command)).toEqual({ ok: true });
  const existing = new Set(Object.keys(state.armies));
  applyMarch(state, command, () => {});
  const army = Object.values(state.armies).find((candidate) => !existing.has(candidate.id))!;
  // Controlled real-node arrival tests death cleanup, not movement or siege damage.
  army.posNodeId = CASTLE_A2;
  army.path = [CASTLE_A2];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  beginSiege(state, CASTLE_A2, army.id);
  expect(validateState(state)).toEqual([]);
  return army;
}

describe('ordinary commander death siege-ended reporting', () => {
  it('propagates the siege end through natural scheduled death', () => {
    const state = buildTinyState();
    const army = deploy(state, OFF_BETA_BUSHO);
    const siegeId = army.siegeId!;
    state.officers[OFF_BETA_BUSHO]!.scheduledDeath = {
      year: state.time.year,
      month: state.time.month,
    };
    const events = officersSystem(state, new Set());
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([
      expect.objectContaining({ siegeId, castleId: CASTLE_A2, fallen: false }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'officer.died', officerId: OFF_BETA_BUSHO, cause: 'age' }),
    );
    expect(state.clans[CLAN_BETA]!.alive).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('propagates the siege end through an actual scripted kill effect', () => {
    const state = buildTinyState();
    const army = deploy(state, OFF_BETA_BUSHO);
    const siegeId = army.siegeId!;
    const events: GameEvent[] = [];
    applyEventEffects(
      state,
      [{ op: 'killOfficer', officerId: OFF_BETA_BUSHO, cause: 'battle' }],
      null,
      (event) => events.push(event),
    );
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([
      expect.objectContaining({ siegeId, castleId: CASTLE_A2, fallen: false }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'officer.died', officerId: OFF_BETA_BUSHO, cause: 'battle' }),
    );
    expect(state.clans[CLAN_BETA]!.alive).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('emits the departure siege end only once when makeRonin repatriates the whole army', () => {
    const state = buildTinyState();
    const army = deploy(state, OFF_BETA_BUSHO);
    const siegeId = army.siegeId!;
    const events: GameEvent[] = [];
    applyMakeRoninEvent(state, OFF_BETA_BUSHO, (event) => events.push(event));
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([
      expect.objectContaining({ siegeId, castleId: CASTLE_A2, fallen: false }),
    ]);
    expect(state.officers[OFF_BETA_BUSHO]!.status).toBe('ronin');
    expect(state.armies[army.id]).toBeUndefined();
    expect(state.sieges[siegeId]).toBeUndefined();
    expect(validateState(state)).toEqual([]);
  });

  it('emits exactly one unfallen siege-ended event when the final attacker disappears', () => {
    const state = buildTinyState();
    const army = deploy(state, OFF_BETA_BUSHO);
    const siegeId = army.siegeId!;
    const events = dieOfficer(state, OFF_BETA_BUSHO, CASTLE_A2);
    expect(state.clans[CLAN_BETA]!.alive).toBe(true);
    expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_LORD);
    expect(state.armies[army.id]).toBeUndefined();
    expect(state.sieges[siegeId]).toBeUndefined();
    expect(validateState(state)).toEqual([]);
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([
      {
        type: 'siege.ended',
        day: state.time.day,
        clanIds: [CLAN_BETA],
        siegeId,
        castleId: CASTLE_A2,
        fallen: false,
        newOwnerClanId: null,
      },
    ]);
  });

  it('keeps the siege with another legitimate attacker and emits no end', () => {
    const state = buildTinyState();
    const departing = deploy(state, OFF_BETA_BUSHO);
    const survivor = deploy(state, OFF_BETA_TAISHO);
    const siegeId = departing.siegeId!;
    expect(survivor.siegeId).toBe(siegeId);
    const events = dieOfficer(state, OFF_BETA_BUSHO, CASTLE_A2);
    expect(state.armies[departing.id]).toBeUndefined();
    expect(state.sieges[siegeId]!.attackerArmyIds).toEqual([survivor.id]);
    expect(state.armies[survivor.id]!.status).toBe('sieging');
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('promotes the real deputy without removing the army or ending its siege', () => {
    const state = buildTinyState();
    const army = deploy(state, OFF_BETA_BUSHO, [OFF_BETA_TAISHO]);
    const siegeId = army.siegeId!;
    const events = dieOfficer(state, OFF_BETA_BUSHO, CASTLE_A2);
    expect(state.armies[army.id]!.leaderId).toBe(OFF_BETA_TAISHO);
    expect(state.officers[OFF_BETA_TAISHO]!.armyId).toBe(army.id);
    expect(state.sieges[siegeId]!.attackerArmyIds).toEqual([army.id]);
    expect(state.armies[army.id]!.status).toBe('sieging');
    expect(events.filter((event) => event.type === 'siege.ended')).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });
});
