import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { beginSiege } from '../../src/core/systems/siege';
import { dieOfficer, officersSystem } from '../../src/core/systems/officers';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { applyStartKassen, validateStartKassen } from '../../src/core/systems/battle';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

describe('officer death shared army cleanup', () => {
  it('scheduled death dissolves a no-deputy siege army without leaving combat references', () => {
    const state = buildTinyState();
    const cmd = {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_BUSHO,
      deputyIds: [],
      soldiers: 200,
      food: 120,
      targetNodeId: CASTLE_B1,
    };
    expect(validateMarch(state, cmd)).toEqual({ ok: true });
    applyMarch(state, cmd, () => {});
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = CASTLE_B1;
    army.path = [CASTLE_B1];
    army.pathCursor = 0;
    army.status = 'holding';
    beginSiege(state, CASTLE_B1, army.id);
    state.officers[OFF_ALPHA_BUSHO]!.scheduledDeath = {
      year: state.time.year,
      month: state.time.month,
    };
    const events = officersSystem(state, new Set());
    expect(
      events.some(
        (event) =>
          event.type === 'officer.died' &&
          event.officerId === OFF_ALPHA_BUSHO &&
          event.cause === 'age',
      ),
    ).toBe(true);
    expect(state.armies[army.id]).toBeUndefined();
    expect(Object.values(state.sieges)).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('updates tactical units to the surviving deputy when the commander dies', () => {
    const state = buildTinyState();
    for (const [clanId, originCastleId, leaderId, deputyIds] of [
      [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_LORD, [OFF_ALPHA_BUSHO]],
      [CLAN_BETA, CASTLE_B1, OFF_BETA_LORD, []],
    ] as const) {
      const cmd = {
        type: 'march' as const,
        clanId,
        originCastleId,
        leaderId,
        deputyIds: [...deputyIds],
        soldiers: 1500,
        food: 1000,
        targetNodeId: CASTLE_A2,
      };
      expect(validateMarch(state, cmd)).toEqual({ ok: true });
      applyMarch(state, cmd, () => {});
    }
    const armies = Object.values(state.armies);
    for (const army of armies) {
      army.posNodeId = CASTLE_A2;
      army.path = [CASTLE_A2];
      army.pathCursor = 0;
      army.status = 'holding';
      army.edgeProgressDays = 0;
    }
    const alpha = armies.find((army) => army.clanId === CLAN_ALPHA)!,
      beta = armies.find((army) => army.clanId === CLAN_BETA)!;
    startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);
    const cmd = {
      type: 'startKassen' as const,
      clanId: CLAN_ALPHA,
      fieldCombatId: Object.values(state.fieldCombats)[0]!.id,
    };
    expect(validateStartKassen(state, cmd)).toEqual({ ok: true });
    applyStartKassen(state, cmd, () => {});
    const battle = Object.values(state.battles)[0]!,
      unit = battle.units.find((candidate) => candidate.armyId === alpha.id)!;
    expect(unit.generalId).toBe(OFF_ALPHA_LORD);
    dieOfficer(state, OFF_ALPHA_LORD, CASTLE_A2, true);
    expect(alpha.leaderId).toBe(OFF_ALPHA_BUSHO);
    expect(unit.generalId).toBe(OFF_ALPHA_BUSHO);
    // Deferred succession belongs to the caller, so check the tactical links rather than the leader invariant here.
    expect(state.officers[OFF_ALPHA_LORD]!.armyId).toBeNull();
    expect(state.officers[OFF_ALPHA_BUSHO]!.armyId).toBe(alpha.id);
  });
});
