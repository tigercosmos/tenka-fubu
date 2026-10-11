import { describe, expect, it } from 'vitest';
import { zCanonicalEventCondition, zEventFlagRef } from '../../src/data/schemas/eventConditions';
import { zCanonicalEffectOp } from '../../src/data/schemas/eventEffects';
import { zCanonicalEventDef, zEventTrigger } from '../../src/data/schemas/eventDefinitions';
import { eventDateWindowContains } from '../../src/core/systems/events/triggerEligibility';
import { validEventBinding } from '../../src/core/save/validateEvents';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import { buildTinyState } from '../fixtures/tiny';

function generic(): EventDef {
  return {
    id: 'evt.generic-schema' as EventId,
    kind: 'generic',
    priority: 1,
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
    effects: [
      {
        op: 'affectRegion',
        region: '$region',
        effects: [
          { op: 'scaleCastleDurability', pct: 20 },
          { op: 'addDistrictOrder', amount: -10 },
          { op: 'scalePopulation', pct: 2 },
        ],
      },
    ],
  };
}

describe('complete generic-event schema prerequisites', () => {
  it('allows an unbounded generic window without inventing a historical expiry', () => {
    const def = generic();
    expect(zCanonicalEventDef.parse(def)).toEqual(def);
    expect(eventDateWindowContains(def.trigger, 0)).toBe(true);
    expect(eventDateWindowContains(def.trigger, 360 * 200)).toBe(true);
    expect(eventDateWindowContains(def.trigger, NaN)).toBe(false);
    def.kind = 'historical';
    def.target = 'fixed';
    expect(zCanonicalEventDef.safeParse(def).success).toBe(false);
    def.trigger.from = { year: 1560, month: 1, day: 1 };
    def.trigger.to = { year: 1560, month: 12, day: 30 };
    expect(zCanonicalEventDef.safeParse(def).success).toBe(true);
  });
  it('preserves inclusive bounded sides and rejects reversed authored dates', () => {
    const trigger = generic().trigger;
    trigger.from = { year: 1560, month: 1, day: 2 };
    expect(eventDateWindowContains(trigger, 0)).toBe(false);
    expect(eventDateWindowContains(trigger, 1)).toBe(true);
    trigger.from = null;
    trigger.to = { year: 1560, month: 1, day: 2 };
    expect(eventDateWindowContains(trigger, 1)).toBe(true);
    expect(eventDateWindowContains(trigger, 2)).toBe(false);
    trigger.from = { year: 1561, month: 1, day: 1 };
    expect(zEventTrigger.safeParse(trigger).success).toBe(false);
  });
  it('accepts only literal keys or the explicit typed concatenation structure', () => {
    for (const key of [
      'literal.{year}.$clan',
      '__proto__',
      { prefix: 'harvest', year: 'current', clanId: '$clan' },
      { prefix: 'unlock.pol.nanban', clanId: 'clan.alpha' },
    ])
      expect(zEventFlagRef.safeParse(key).success).toBe(true);
    for (const key of [
      { prefix: '', clanId: '$clan' },
      { prefix: 'harvest', clanId: '$castle' },
      { prefix: 'harvest', clanId: '$clan', year: 1560 },
      { prefix: 'harvest', clanId: '$clan', execute: 'arbitrary' },
    ])
      expect(zEventFlagRef.safeParse(key).success).toBe(false);
    expect(
      zCanonicalEffectOp.safeParse({
        op: 'setFlag',
        key: { prefix: 'harvest', clanId: '$clan', year: 'current' },
        value: 120,
      }).success,
    ).toBe(true);
    expect(
      zCanonicalEventCondition.safeParse({
        kind: 'flag',
        key: { prefix: 'harvest', clanId: '$clan', year: 'current' },
        min: 120,
      }).success,
    ).toBe(true);
  });
  it('validates epidemic thresholds and percentages without coercing malformed data', () => {
    const condition = { kind: 'districtPopulationAtLeast', districtId: '$district', value: 5000 };
    expect(zCanonicalEventCondition.safeParse(condition).success).toBe(true);
    expect(zCanonicalEventCondition.safeParse({ ...condition, value: -1 }).success).toBe(false);
    const effect = { op: 'loseCastleSoldiersPct', castleId: '$castle', pct: 10 };
    expect(zCanonicalEffectOp.safeParse(effect).success).toBe(true);
    for (const pct of [-1, 101, NaN])
      expect(zCanonicalEffectOp.safeParse({ ...effect, pct }).success).toBe(false);
  });
  it('rejects arbitrary regional operations and malformed region identifiers', () => {
    const op = generic().effects[0]!;
    expect(zCanonicalEffectOp.safeParse(op).success).toBe(true);
    for (const region of ['nationwide', '$clan'])
      expect(zCanonicalEffectOp.safeParse({ ...op, region }).success).toBe(false);
    expect(
      zCanonicalEffectOp.safeParse({ ...op, effects: [{ op: 'addGold', amount: 1 }] }).success,
    ).toBe(false);
    expect(
      zCanonicalEffectOp.safeParse({ ...op, effects: [{ op: 'scalePopulation', pct: 101 }] })
        .success,
    ).toBe(false);
  });
  it('preserves old binding shapes and round-trips optional region in format3', () => {
    const legacy = { clanId: null, castleId: null, districtId: null };
    expect(validEventBinding(legacy)).toBe(true);
    expect(validEventBinding({ ...legacy, region: null })).toBe(true);
    expect(validEventBinding({ ...legacy, region: 'tokai' })).toBe(true);
    expect(validEventBinding({ ...legacy, region: 'nationwide' })).toBe(false);
    expect(validEventBinding({ ...legacy, region: 'tokai', extra: 1 })).toBe(false);
    const state = buildTinyState();
    state.events.pendingChoiceEventId = 'evt.region-choice' as EventId;
    state.events.pendingChoiceBinding = { ...legacy, region: 'tokai' };
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.saveFile.state.events.pendingChoiceBinding).toEqual(
      state.events.pendingChoiceBinding,
    );
  });
});
