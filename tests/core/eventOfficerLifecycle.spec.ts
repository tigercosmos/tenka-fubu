import { describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch } from '../../src/core/commands/march';
import { applyTransport } from '../../src/core/commands/domesticCommands';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import type { CorpsId, OfficerId } from '../../src/core/state/ids';
import { applyEventEffects, supportsEventEffects } from '../../src/core/systems/events/effects';
import { applyOfficerTransferEvent } from '../../src/core/systems/events/officerLifecycle';
import { beginSiege } from '../../src/core/systems/siege';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { applyStartKassen } from '../../src/core/systems/battle';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function marching(departingDeputy = false) {
  const state = buildTinyState();
  applyMarch(
    state,
    {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: departingDeputy ? OFF_ALPHA_LORD : OFF_ALPHA_BUSHO,
      deputyIds: departingDeputy ? [OFF_ALPHA_BUSHO] : [OFF_ALPHA_LORD],
      soldiers: 100,
      food: 100,
      targetNodeId: CASTLE_B1,
    },
    () => undefined,
  );
  return { state, army: Object.values(state.armies)[0]! };
}

describe('authoritative event officer lifecycle', () => {
  it.each([false, true])(
    'returns all original troops before explicit transfer (departing deputy=%s)',
    (deputy) => {
      const { state, army } = marching(deputy);
      const soldiers = state.castles[CASTLE_A1]!.soldiers;
      const food = state.castles[CASTLE_A1]!.food;
      const rng = { ...state.rng };
      const events: GameEvent[] = [];
      applyOfficerTransferEvent(state, OFF_ALPHA_BUSHO, CLAN_BETA, CASTLE_B1, (e) =>
        events.push(e),
      );
      expect(state.armies[army.id]).toBeUndefined();
      expect(state.castles[CASTLE_A1]!.soldiers).toBe(soldiers + 100);
      expect(state.castles[CASTLE_A1]!.food).toBe(food + 100);
      expect(state.officers[OFF_ALPHA_LORD]!.locationCastleId).toBe(CASTLE_A1);
      expect(state.castles[CASTLE_A1]!.lordId).toBe(OFF_ALPHA_LORD);
      expect(state.officers[OFF_ALPHA_BUSHO]).toMatchObject({
        clanId: CLAN_BETA,
        status: 'serving',
        locationCastleId: CASTLE_B1,
        armyId: null,
        loyalty: BAL.evtTransferLoyalty,
      });
      expect(events.map((e) => e.type)).toEqual(['army.returned', 'officer.defected']);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('returns to the nearest original castle and removes actual siege references', () => {
    const { state, army } = marching();
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.status = 'holding';
    beginSiege(state, CASTLE_B1, army.id);
    const soldiers = state.castles[CASTLE_A2]!.soldiers;
    applyEventEffects(state, [{ op: 'makeRonin', officerId: OFF_ALPHA_BUSHO }], null, vi.fn());
    expect(state.castles[CASTLE_A2]!.soldiers).toBe(soldiers + 100);
    expect(state.officers[OFF_ALPHA_BUSHO]).toMatchObject({
      status: 'ronin',
      clanId: null,
      locationCastleId: CASTLE_A2,
      armyId: null,
    });
    expect(state.sieges).toEqual({});
    expect(validateState(state)).toEqual([]);
  });

  it('clears offices, led corps, work and betrayal marks without changing other officers', () => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.rank = 'karo';
    state.districts[DIST_A1X]!.stewardId = officer.id;
    const id = 'corps.event' as CorpsId;
    state.corps[id] = {
      id,
      clanId: CLAN_ALPHA,
      corpsLeaderId: officer.id,
      directive: 'hold',
      targetNodeId: null,
      gold: 10,
      createdDay: state.time.day,
    };
    state.castles[CASTLE_A2]!.corpsId = id;
    state.castles[CASTLE_A2]!.betrayalReadyTargetLordId = officer.id;
    state.castles[CASTLE_A2]!.betrayalReadyClanId = CLAN_BETA;
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: CLAN_BETA,
      officerId: officer.id,
      startDay: state.time.day,
    });
    const other = structuredClone(state.officers[OFF_ALPHA_LORD]);
    applyEventEffects(state, [{ op: 'makeRonin', officerId: officer.id }], null, vi.fn());
    expect(state.corps[id]).toBeUndefined();
    expect(state.castles[CASTLE_A2]!.corpsId).toBeNull();
    expect(state.castles[CASTLE_A2]!.lordId).not.toBe(officer.id);
    expect(state.castles[CASTLE_A2]!.betrayalReadyClanId).toBeNull();
    expect(state.districts[DIST_A1X]!.stewardId).toBeNull();
    expect(state.diplomacy.missions).toEqual([]);
    expect(state.officers[OFF_ALPHA_LORD]).toEqual(other);
    expect(validateState(state)).toEqual([]);
  });

  it.each([false, true])(
    'scrubs field/tactical/pursuit references (active battle=%s)',
    (tactical) => {
      const { state, army } = marching();
      applyMarch(
        state,
        {
          type: 'march',
          clanId: CLAN_BETA,
          originCastleId: CASTLE_B1,
          leaderId: OFF_BETA_TAISHO,
          deputyIds: [],
          soldiers: 100,
          food: 100,
          targetNodeId: CASTLE_A1,
        },
        () => undefined,
      );
      const other = Object.values(state.armies).find((item) => item.id !== army.id)!;
      for (const item of [army, other]) {
        item.posNodeId = CASTLE_A1;
        item.path = [CASTLE_A1];
        item.pathCursor = 0;
        item.edgeProgressDays = 0;
        item.edgeCostDays = 0;
        item.status = 'holding';
      }
      startFieldCombat(state, CASTLE_A1, [army.id], [other.id]);
      const combat = Object.values(state.fieldCombats)[0]!;
      if (tactical)
        applyStartKassen(
          state,
          {
            type: 'startKassen',
            clanId: CLAN_ALPHA,
            fieldCombatId: combat.id,
          },
          () => undefined,
        );
      other.pursuitEligibleArmyIds = [army.id];
      applyEventEffects(state, [{ op: 'makeRonin', officerId: OFF_ALPHA_BUSHO }], null, vi.fn());
      expect(other.pursuitEligibleArmyIds).toEqual([]);
      expect(
        Object.values(state.battles)
          .flatMap((battle) => battle.units)
          .some((unit) => unit.armyId === army.id),
      ).toBe(false);
      expect(
        Object.values(state.fieldCombats).flatMap((field) => [
          ...field.sideA.armyIds,
          ...field.sideB.armyIds,
        ]),
      ).not.toContain(army.id);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('preserves independent transport cargo and queued ownership', () => {
    const state = buildTinyState();
    applyTransport(state, {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 20,
      gold: 10,
      food: 20,
    });
    const before = structuredClone(state.transports);
    applyOfficerTransferEvent(state, OFF_ALPHA_BUSHO, CLAN_BETA, CASTLE_B1, vi.fn());
    expect(state.transports).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });

  it('requires an explicit owned transfer destination before any troop mutation', () => {
    const { state } = marching();
    const before = structuredClone(state);
    const emit = vi.fn();
    expect(() =>
      applyOfficerTransferEvent(state, OFF_ALPHA_BUSHO, CLAN_BETA, CASTLE_A1, emit),
    ).toThrow('owned destination castle');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
    expect(
      supportsEventEffects([
        { op: 'transferOfficer', officerId: OFF_ALPHA_BUSHO, toClanId: CLAN_BETA },
      ]),
    ).toBe(false);
  });

  it('rejects explicit transfer of a living clan leader without a fake death/succession', () => {
    const { state } = marching();
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() =>
      applyOfficerTransferEvent(state, OFF_ALPHA_LORD, CLAN_BETA, CASTLE_B1, emit),
    ).toThrow('living clan leader');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('recruits a ronin truthfully and treats missing/dead references as no-ops', () => {
    const state = buildTinyState();
    state.officers[OFF_ALPHA_BUSHO]!.status = 'ronin';
    state.officers[OFF_ALPHA_BUSHO]!.clanId = null;
    const emit = vi.fn();
    applyOfficerTransferEvent(state, OFF_ALPHA_BUSHO, CLAN_BETA, CASTLE_B1, emit);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'officer.recruited', source: 'ronin' }),
    );
    const before = structuredClone(state);
    emit.mockClear();
    applyOfficerTransferEvent(state, 'off.missing' as OfficerId, CLAN_BETA, CASTLE_B1, emit);
    applyEventEffects(
      state,
      [{ op: 'makeRonin', officerId: 'off.missing' as OfficerId }],
      null,
      emit,
    );
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('protects the living leader while preserving preceding effects', () => {
    const state = buildTinyState();
    const before = structuredClone(state);
    const emit = vi.fn();
    applyEventEffects(
      state,
      [
        { op: 'addGold', clanId: CLAN_ALPHA, amount: 100 },
        { op: 'renameOfficer', officerId: OFF_ALPHA_BUSHO, name: 'Changed' },
        { op: 'makeRonin', officerId: OFF_ALPHA_LORD },
      ],
      null,
      emit,
    );
    expect(state.officers[OFF_ALPHA_LORD]).toEqual(before.officers[OFF_ALPHA_LORD]);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold + 100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips missing original refuges without losing troops or preceding gold effects', () => {
    const { state } = marching();
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    const before = structuredClone(state),
      emit = vi.fn();
    applyEventEffects(
      state,
      [
        { op: 'addGold', clanId: CLAN_ALPHA, amount: 100 },
        { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO },
      ],
      null,
      emit,
    );
    expect(state.armies).toEqual(before.armies);
    expect(state.officers).toEqual(before.officers);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold + 100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('protects the actual new leader after ordered death succession', () => {
    const state = buildTinyState();
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    const emit = vi.fn();
    applyEventEffects(
      state,
      [
        { op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'age' },
        { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO },
      ],
      null,
      emit,
    );
    expect(state.officers[OFF_ALPHA_LORD]!.status).toBe('dead');
    expect(state.officers[OFF_ALPHA_BUSHO]!.status).toBe('serving');
    expect(state.clans[CLAN_ALPHA]!.leaderId).toBe(OFF_ALPHA_BUSHO);
    expect(validateState(state)).toEqual([]);
  });

  it('allows departure of an officer killed earlier as a defensive no-op', () => {
    const state = buildTinyState();
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    applyEventEffects(
      state,
      [
        { op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'age' },
        { op: 'makeRonin', officerId: OFF_ALPHA_LORD },
      ],
      null,
      vi.fn(),
    );
    expect(state.officers[OFF_ALPHA_LORD]!.status).toBe('dead');
    expect(state.clans[CLAN_ALPHA]!.leaderId).toBe(OFF_ALPHA_BUSHO);
    expect(validateState(state)).toEqual([]);
  });
});
