import { describe, expect, it } from 'vitest';
import { monthlyUprising } from '../../src/core/systems/uprising';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { stateHash } from '../../src/core/state/serialize';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { militaryMovementSystem } from '../../src/core/systems/military';
import type { FacilityTypeId, PolicyId, RoadEdgeId, TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function fixture(order = 81, intelligence = 80) {
  const state = buildTinyState();
  for (const castle of Object.values(state.castles)) {
    castle.lordId = null;
    castle.conscriptPolicy = 'mid';
    castle.facilities = [];
  }
  for (const district of Object.values(state.districts)) {
    district.publicOrder = 100;
    district.stewardId = null;
  }
  const castle = state.castles[CASTLE_A1]!;
  castle.lordId = OFF_ALPHA_LORD;
  state.officers[OFF_ALPHA_LORD]!.int = intelligence;
  const district = state.districts[DIST_A1X]!;
  district.publicOrder = order;
  return { state, castle, district };
}

function settle(f: ReturnType<typeof fixture>, expected: number) {
  expect(validateState(f.state)).toEqual([]);
  const before = structuredClone(f.state);
  expect(monthlyUprising(f.state)).toEqual([]);
  expect(f.district.publicOrder).toBe(expected);
  expect(f.state.rng).toEqual(before.rng);
  for (const district of Object.values(before.districts))
    district.publicOrder = f.state.districts[district.id]!.publicOrder;
  expect(f.state).toEqual(before);
  expect(validateState(f.state)).toEqual([]);
}

describe('05 positive-component security damping and 02 integer writes', () => {
  it('halves positive four before subtracting high conscription two', () => {
    const f = fixture();
    f.castle.conscriptPolicy = 'high';
    f.castle.facilities = ['fac.jisha' as FacilityTypeId];
    settle(f, 81);
  });
  it('halves positive administration even when siege makes the net delta negative', () => {
    const f = fixture();
    const source = f.state.castles[CASTLE_B1]!;
    source.soldiers = 5000;
    source.food = 20000;
    const roadId = 'road.siege-direct' as RoadEdgeId;
    f.state.roads[roadId] = {
      id: roadId,
      a: CASTLE_B1,
      b: CASTLE_A1,
      type: 'land',
      grade: 1,
      baseDays: 1,
    };
    const cmd = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 3000,
      food: 3600,
      targetNodeId: CASTLE_A1,
    };
    expect(validateCommand(f.state, cmd)).toEqual({ ok: true });
    applyCommand(f.state, cmd, () => {});
    for (let i = 0; i < 30 && Object.keys(f.state.sieges).length === 0; i++)
      militaryMovementSystem(f.state);
    expect(Object.values(f.state.sieges)[0]?.castleId).toBe(CASTLE_A1);
    settle(f, 79);
  });
  it('rounds an odd positive half only when writing public order', () => {
    const f = fixture(81, 1);
    f.castle.conscriptPolicy = 'low';
    settle(f, 82);
  });
  it('does not damp at the exact 80 threshold', () => {
    const f = fixture(80);
    f.castle.conscriptPolicy = 'high';
    f.castle.facilities = ['fac.jisha' as FacilityTypeId];
    settle(f, 82);
  });
  it('removes the heinobunri penalty before damping policy positives', () => {
    const f = fixture();
    f.castle.conscriptPolicy = 'high';
    f.state.policies[CLAN_ALPHA]!.active = ['pol.heinobunri', 'pol.meyasubako'] as PolicyId[];
    settle(f, 83);
  });
  it('uses the steward rather than castle lord for intelligence and the signed trait hook', () => {
    const f = fixture(81, 120);
    f.district.stewardId = OFF_ALPHA_BUSHO;
    const steward = f.state.officers[OFF_ALPHA_BUSHO]!;
    steward.int = 40;
    steward.traits = ['trait.jinsei' as TraitId];
    settle(f, 82);
  });
  it('clamps the rounded final value at 100', () => {
    const f = fixture(100);
    f.castle.facilities = ['fac.jisha' as FacilityTypeId];
    settle(f, 100);
  });
  it('continues native saves identically without fractional integer-field writes', () => {
    const f = fixture(81, 1);
    f.castle.conscriptPolicy = 'low';
    const loaded = decodeSave(encodeSave(f.state, 1751808000000));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.code);
    for (let month = 0; month < 6; month++) {
      expect(monthlyUprising(loaded.saveFile.state)).toEqual(monthlyUprising(f.state));
      expect(validateState(f.state)).toEqual([]);
      expect(validateState(loaded.saveFile.state)).toEqual([]);
      expect(stateHash(loaded.saveFile.state)).toBe(stateHash(f.state));
    }
    expect(f.district.publicOrder).toBe(87);
  });
});
