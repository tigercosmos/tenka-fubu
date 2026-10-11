import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { castleMaxSoldiers, garrisonFoodMonthly } from '../../src/core/domestic';
import type { FacilityTypeId, PolicyId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function fixture(population = 25_000) {
  const state = buildTinyState();
  const castle = state.castles[CASTLE_A1]!;
  for (const id of castle.districtIds) state.districts[id]!.population = 0;
  state.districts[castle.districtIds[0]!]!.population = population;
  state.policies[CLAN_ALPHA]!.active.push('pol.jokashuju' as PolicyId);
  return { state, castle };
}

describe('02 §5.1 / 05 §3.5 raw derived castle capacity', () => {
  it.each([25_000, 25_039])('floors owned population before policy for population %s', (pop) => {
    const { state, castle } = fixture(pop);
    const before = structuredClone(state);
    expect(castleMaxSoldiers(state, castle)).toBe(1687.5);
    expect(state).toEqual(before);
  });

  it('does not multiply the main/branch base or barracks bonus', () => {
    const { state, castle } = fixture();
    castle.facilities.push('fac.heisha' as FacilityTypeId);
    expect(castleMaxSoldiers(state, castle)).toBe(2187.5);
    castle.tier = 'branch';
    expect(castleMaxSoldiers(state, castle)).toBe(1687.5);
  });

  it('filters occupied districts before the population floor', () => {
    const { state, castle } = fixture();
    const occupied = state.districts[castle.districtIds[1]!]!;
    occupied.population = 100_039;
    occupied.ownerClanId = CLAN_BETA;
    expect(castleMaxSoldiers(state, castle)).toBe(1687.5);
  });

  it('keeps the ordinary non-policy formula integral', () => {
    const { state, castle } = fixture(25_039);
    state.policies[CLAN_ALPHA]!.active = [];
    expect(castleMaxSoldiers(state, castle)).toBe(1625);
  });

  it('keeps fractional derived excess for food consumption, not a rounded selector', () => {
    const { state, castle } = fixture();
    castle.soldiers = 1688;
    expect(garrisonFoodMonthly(state, castle)).toBe(
      (1688 + 0.5) * BAL.garrisonFoodPerSoldierMonthly,
    );
  });
});
