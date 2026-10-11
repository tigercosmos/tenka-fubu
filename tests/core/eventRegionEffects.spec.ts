import { describe, expect, it, vi } from 'vitest';
import { REGION_VALUES, type Region } from '../../src/core/state/enums';
import { createRngStream } from '../../src/core/rng';
import { validateState } from '../../src/core/state/invariants';
import type { EventId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { createEventEngine } from '../../src/core/systems/events/engine';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { applyEventEffects, supportsEventEffects } from '../../src/core/systems/events/effects';
import {
  affectedRegionClanIds,
  resolveRegionRef,
} from '../../src/core/systems/events/regionEffects';
import type { EffectOp, EventBinding, EventDef } from '../../src/core/systems/events/types';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  DIST_A1X,
  DIST_A2Y,
  DIST_B1X,
  PROV_SURUGA,
} from '../fixtures/tiny';

const sortedRegions = [...REGION_VALUES].sort();
function earthquake(): Extract<EffectOp, { op: 'affectRegion' }> {
  return {
    op: 'affectRegion',
    region: '$region',
    effects: [
      { op: 'scaleCastleDurability', pct: 20 },
      { op: 'addDistrictOrder', amount: -10 },
      { op: 'scalePopulation', pct: 2 },
    ],
  };
}
function definition(): EventDef {
  return {
    id: 'evt.region-fixture' as EventId,
    kind: 'generic',
    priority: 18,
    target: 'randomRegionClan',
    ownerCandidates: [],
    trigger: {
      from: null,
      to: null,
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: false,
      cooldownDays: 720,
      cooldownKey: 'gen.jishin',
    },
    cutscene: { title: '大地震', body: '{regionName}地方發生大地震！', monClanId: null },
    choices: [],
    effects: [earthquake()],
  };
}
function stateForRegion(region: Region) {
  for (let seed = 0; seed < 256; seed += 1) {
    const state = buildTinyState({ seed });
    const expected = structuredClone(state.rng);
    if (createRngStream(expected, 'event').pick(sortedRegions) === region) return state;
  }
  throw new Error(`No deterministic fixture seed found for ${region}`);
}

describe('deterministic regional event prerequisite', () => {
  it('picks all nine canonical regions in sorted order, without filtering unloaded regions or guessing clan bindings', () => {
    const apply = vi.fn(),
      def = definition();
    def.effects = [];
    const engine = createEventEngine([def], apply),
      seen = new Set<Region>();
    for (let seed = 0; seed < 128; seed += 1) {
      const state = buildTinyState({ seed }),
        expected = structuredClone(state.rng);
      const region = createRngStream(expected, 'event').pick(sortedRegions);
      engine.run(state, () => undefined);
      const binding = apply.mock.lastCall?.[2] as EventBinding;
      expect(binding).toEqual({ clanId: null, castleId: null, districtId: null, region });
      expect(state.rng).toEqual(expected);
      seen.add(region);
    }
    expect([...seen].sort()).toEqual(sortedRegions);
  });

  it('fans out only through castle Province region, including districts whose owner differs from their parent castle', () => {
    const state = buildTinyState();
    state.provinces[PROV_SURUGA]!.region = 'kinki';
    state.districts[DIST_A1X]!.ownerClanId = CLAN_BETA;
    const before = structuredClone(state),
      emit = vi.fn();
    const binding = { clanId: null, castleId: null, districtId: null, region: 'tokai' as const };
    expect(supportsEventEffects([earthquake()])).toBe(true);
    applyEventEffects(state, [earthquake()], binding, emit);
    for (const id of [CASTLE_A1, CASTLE_A2])
      expect(state.castles[id]!.durability).toBe(Math.floor(before.castles[id]!.durability * 0.8));
    for (const district of Object.values(state.districts).filter(
      (item) => item.castleId !== CASTLE_B1,
    )) {
      expect(district.publicOrder).toBe(before.districts[district.id]!.publicOrder - 10);
      expect(district.population).toBe(
        Math.floor(before.districts[district.id]!.population * 0.98),
      );
    }
    expect(state.castles[CASTLE_B1]).toEqual(before.castles[CASTLE_B1]);
    expect(state.districts[DIST_B1X]).toEqual(before.districts[DIST_B1X]);
    expect(affectedRegionClanIds(state, 'tokai')).toEqual([CLAN_ALPHA, CLAN_BETA]);
    expect(state.rng).toEqual(before.rng);
    expect(emit).not.toHaveBeenCalled();
    expect(validateState(state)).toEqual([]);
  });

  it('retains nested operation order, normal integer rounding and scalar bounds', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A1]!.durability = 3;
    state.districts[DIST_A1X]!.publicOrder = 5;
    state.districts[DIST_A2Y]!.population = 101;
    applyEventEffects(
      state,
      [
        {
          op: 'affectRegion',
          region: 'tokai',
          effects: [
            { op: 'scaleCastleDurability', pct: 50 },
            { op: 'scaleCastleDurability', pct: 50 },
            { op: 'addDistrictOrder', amount: -10 },
            { op: 'addDistrictOrder', amount: 3 },
            { op: 'scalePopulation', pct: 50 },
            { op: 'scalePopulation', pct: 50 },
          ],
        },
      ],
      null,
      vi.fn(),
    );
    expect(state.castles[CASTLE_A1]!.durability).toBe(0);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(3);
    expect(state.districts[DIST_A2Y]!.population).toBe(25);
  });

  it('skips absent region bindings, missing provinces and dead owners using normal no-op guards', () => {
    const state = buildTinyState(),
      before = structuredClone(state);
    applyEventEffects(
      state,
      [earthquake()],
      { clanId: null, castleId: null, districtId: null },
      vi.fn(),
    );
    expect(state).toEqual(before);
    expect(resolveRegionRef('$region', null)).toBeNull();
    expect(
      resolveRegionRef('$region', { clanId: null, castleId: null, districtId: null, region: null }),
    ).toBeNull();
    state.clans[CLAN_BETA]!.alive = false;
    applyEventEffects(state, [{ ...earthquake(), region: 'tokai' }], null, vi.fn());
    expect(state.castles[CASTLE_B1]).toEqual(before.castles[CASTLE_B1]);
    expect(state.districts[DIST_B1X]).toEqual(before.districts[DIST_B1X]);
    expect(affectedRegionClanIds(state, 'tokai')).toEqual([CLAN_ALPHA]);
    delete state.provinces[PROV_SURUGA];
    expect(affectedRegionClanIds(state, 'kinki')).toEqual([]);
  });

  it('emits exactly one canonical event.fired per affected living clan, sorted and deduplicated', () => {
    const state = stateForRegion('tokai'),
      events: GameEvent[] = [];
    createRuntimeEventEngine([definition()]).run(state, (event) => events.push(event));
    expect(events).toEqual(
      [CLAN_ALPHA, CLAN_BETA].map((clanId) => ({
        type: 'event.fired',
        day: state.time.day,
        clanIds: [clanId],
        eventId: definition().id,
        hasChoice: false,
      })),
    );
    expect(state.events.cooldownUntil['gen.jishin']).toBe(state.time.day + 720);
    expect(validateState(state)).toEqual([]);
  });

  it('consumes the canonical region draw and writes global cooldown even for an unloaded region, but emits no public firing', () => {
    const state = stateForRegion('kyushu'),
      expected = structuredClone(state.rng),
      emit = vi.fn();
    createRngStream(expected, 'event').pick(sortedRegions);
    const territories = structuredClone({ castles: state.castles, districts: state.districts });
    createRuntimeEventEngine([definition()]).run(state, emit);
    expect(emit).not.toHaveBeenCalled();
    expect(state.rng).toEqual(expected);
    expect({ castles: state.castles, districts: state.districts }).toEqual(territories);
    expect(state.events.cooldownUntil).toEqual({ 'gen.jishin': state.time.day + 720 });
  });

  it('checks global cooldown before any region binding or probability draw', () => {
    const state = stateForRegion('tokai'),
      def = definition();
    def.trigger.probability = 0.01;
    state.events.cooldownUntil['gen.jishin'] = state.time.day + 1;
    const before = structuredClone(state),
      emit = vi.fn();
    createRuntimeEventEngine([def]).run(state, emit);
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('rolls back the attempted region draw on selected preflight failure, without bookkeeping or effects', () => {
    const state = stateForRegion('tokai'),
      def = definition();
    def.effects.push({
      op: 'signPact',
      a: CLAN_ALPHA,
      b: CLAN_BETA,
      pact: 'alliance',
      months: Number.MAX_VALUE,
      vassalClanId: null,
    });
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() => createRuntimeEventEngine([def]).run(state, emit)).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('runs identically for reversed entity insertion order and never changes old-target bindings', () => {
    const a = stateForRegion('tokai'),
      b = structuredClone(a);
    b.castles = Object.fromEntries(Object.entries(b.castles).reverse());
    b.districts = Object.fromEntries(Object.entries(b.districts).reverse());
    const engine = createRuntimeEventEngine([definition()]);
    engine.run(a, () => undefined);
    engine.run(b, () => undefined);
    expect(b).toEqual(a);
    const def = definition();
    def.target = 'player';
    def.effects = [];
    const apply = vi.fn();
    createEventEngine([def], apply).run(buildTinyState(), () => undefined);
    expect(apply.mock.lastCall?.[2]).toEqual({
      clanId: CLAN_ALPHA,
      castleId: null,
      districtId: null,
    });
  });
});
