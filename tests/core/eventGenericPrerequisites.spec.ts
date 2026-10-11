import { describe, expect, it } from 'vitest';
import { resolveEventFlagKey } from '../../src/core/systems/events/flagKeys';
import { evalCond } from '../../src/core/systems/events/conditions';
import { applyScalarEffects } from '../../src/core/systems/events/scalarEffects';
import { eventConditionReason } from '../../src/app/events/eventViewModel';
import type { ClanId, DistrictId, CastleId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, CASTLE_A1, DIST_A1X } from '../fixtures/tiny';

describe('typed generic event prerequisites', () => {
  const binding = { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: DIST_A1X };
  it('expands only structured keys with live concrete clan/year; literal keys remain opaque', () => {
    const state = buildTinyState();
    const before = structuredClone(state);
    expect(
      resolveEventFlagKey({ prefix: 'harvest', clanId: '$clan', year: 'current' }, state, binding),
    ).toBe(`harvest.${state.time.year}.${CLAN_ALPHA}`);
    expect(
      resolveEventFlagKey({ prefix: 'unlock.pol.nanban', clanId: CLAN_BETA }, state, binding),
    ).toBe(`unlock.pol.nanban.${CLAN_BETA}`);
    expect(resolveEventFlagKey('harvest.{year}.$clan', state, binding)).toBe(
      'harvest.{year}.$clan',
    );
    expect(state).toEqual(before);
    for (const clanId of ['$clan', 'clan.missing' as ClanId] as const)
      expect(resolveEventFlagKey({ prefix: 'flag', clanId }, state, null)).toBeNull();
    state.clans[CLAN_ALPHA]!.alive = false;
    expect(resolveEventFlagKey({ prefix: 'flag', clanId: '$clan' }, state, binding)).toBeNull();
  });
  it('writes structured flags and reads matching predicates without leaking into another clan/year', () => {
    const state = buildTinyState();
    const key = { prefix: 'harvest', clanId: '$clan' as const, year: 'current' as const };
    applyScalarEffects(state, [{ op: 'setFlag', key, value: 120 }], binding, () => {});
    expect(evalCond({ kind: 'flag', key, min: 120 }, state, binding)).toBe(true);
    expect(evalCond({ kind: 'flag', key, min: 1 }, state, { ...binding, clanId: CLAN_BETA })).toBe(
      false,
    );
    state.time.year += 1;
    expect(evalCond({ kind: 'flag', key, min: 1 }, state, binding)).toBe(false);
    const before = structuredClone(state);
    applyScalarEffects(state, [{ op: 'setFlag', key, value: 100 }], null, () => {});
    expect(evalCond({ kind: 'flag', key, min: 0 }, state, null)).toBe(false);
    expect(state).toEqual(before);
  });
  it('preserves safe own literal prototype keys, without modifying record prototype', () => {
    const state = buildTinyState();
    const prototype: unknown = Object.getPrototypeOf(state.events.flags);
    for (const key of ['__proto__', 'constructor', 'toString']) {
      applyScalarEffects(state, [{ op: 'setFlag', key, value: 1 }], binding, () => {});
      expect(Object.hasOwn(state.events.flags, key)).toBe(true);
      expect(evalCond({ kind: 'flag', key, min: 1 }, state)).toBe(true);
    }
    expect(Object.getPrototypeOf(state.events.flags)).toBe(prototype);
  });
  it('evaluates the epidemic population threshold exactly and produces concrete localized hint', () => {
    const state = buildTinyState();
    const condition = {
      kind: 'districtPopulationAtLeast' as const,
      districtId: '$district' as const,
      value: 5000,
    };
    state.districts[DIST_A1X]!.population = 4999;
    const before = structuredClone(state);
    expect(evalCond(condition, state, binding)).toBe(false);
    expect(eventConditionReason(condition, binding, state, { getDef: () => undefined })).toBe(
      `「${state.districts[DIST_A1X]!.name}」人口至少5,000`,
    );
    expect(state).toEqual(before);
    state.districts[DIST_A1X]!.population = 5000;
    expect(evalCond(condition, state, binding)).toBe(true);
    expect(evalCond(condition, state, null)).toBe(false);
    expect(
      evalCond({ ...condition, districtId: 'dist.missing' as DistrictId }, state, binding),
    ).toBe(false);
    state.clans[CLAN_ALPHA]!.alive = false;
    expect(evalCond(condition, state, binding)).toBe(false);
  });
  it('subtracts floor(loss) instead of flooring survivors and never affects other castles', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A1]!.soldiers = 11;
    const other = Object.values(state.castles).find((castle) => castle.id !== CASTLE_A1)!;
    const beforeOther = structuredClone(other);
    applyScalarEffects(
      state,
      [{ op: 'loseCastleSoldiersPct', castleId: '$castle', pct: 10 }],
      binding,
      () => {},
    );
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(10);
    expect(other).toEqual(beforeOther);
    const before = structuredClone(state);
    for (const castleId of ['$castle', 'castle.missing' as CastleId] as const)
      applyScalarEffects(
        state,
        [{ op: 'loseCastleSoldiersPct', castleId, pct: 10 }],
        null,
        () => {},
      );
    expect(state).toEqual(before);
    for (const pct of [-1, 101, NaN, Infinity])
      applyScalarEffects(
        state,
        [{ op: 'loseCastleSoldiersPct', castleId: CASTLE_A1, pct }],
        binding,
        () => {},
      );
    expect(state).toEqual(before);
    applyScalarEffects(
      state,
      [{ op: 'loseCastleSoldiersPct', castleId: CASTLE_A1, pct: 100 }],
      binding,
      () => {},
    );
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(0);
  });
});
