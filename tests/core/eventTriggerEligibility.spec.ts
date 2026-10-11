import { describe, expect, it } from 'vitest';
import {
  compareEventPriority,
  sortEventDefs,
  eventDateWindowContains,
  eventCheckDue,
  eventCooldownKey,
  isEventTriggerEligible,
} from '../../src/core/systems/events/triggerEligibility';
import type { EventBinding, EventDef, EventTargetKind } from '../../src/core/systems/events/types';
import type { ClanId, EventId } from '../../src/core/state/ids';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, CASTLE_A1 } from '../fixtures/tiny';

function definition(): EventDef {
  return {
    id: 'evt.fixture' as EventId,
    kind: 'generic',
    priority: 20,
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1561, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [{ kind: 'clanAlive', clanId: '$clan' }],
      probability: 1,
      once: false,
      cooldownDays: 30,
      cooldownKey: null,
    },
    ownerCandidates: ['$clan'],
    target: 'eachClan',
    cutscene: { title: 'Fixture', body: 'Fixture', monClanId: '$clan' },
    choices: [],
    effects: [],
  };
}
const binding: EventBinding = { clanId: CLAN_ALPHA, castleId: null, districtId: null };
function fixture(day = 0) {
  const state = buildTinyState();
  state.time = { day, ...dayToCalendar(day) };
  return state;
}

describe('pure event trigger eligibility (plan10 §5.1)', () => {
  it.each([-1, 0, 1, 29, 30, 31])(
    'includes both date endpoints but not adjacent days: %s',
    (offset) => {
      const trigger = definition().trigger;
      trigger.from = { year: 1560, month: 12, day: 30 };
      trigger.to = { year: 1561, month: 1, day: 30 };
      expect(eventDateWindowContains(trigger, calendarToDay(1560, 12, 30) + offset)).toBe(
        offset >= 0 && offset <= 30,
      );
    },
  );

  it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
    'gates month %s starts and harvest exactly',
    (month) => {
      const trigger = definition().trigger;
      const first = calendarToDay(1560, month, 1);
      expect(eventCheckDue(trigger, first)).toBe(true);
      expect(eventCheckDue(trigger, first + 1)).toBe(false);
      trigger.check = 'harvest';
      expect(eventCheckDue(trigger, first)).toBe(month === 9);
      expect(eventCheckDue(trigger, first + 1)).toBe(false);
      expect(eventCheckDue(trigger, first + 29)).toBe(false);
    },
  );

  it('matches subscribed hooks and includes monthly catch-up without consuming signals', () => {
    const trigger = definition().trigger;
    trigger.check = 'hook';
    trigger.hooks = ['castleFallen'];
    const signals = ['battleEnded', 'castleFallen'] as const;
    expect(eventCheckDue(trigger, 1, signals)).toBe(true);
    expect(eventCheckDue(trigger, 1, ['battleEnded'])).toBe(false);
    expect(eventCheckDue(trigger, 0)).toBe(true);
    expect(signals).toEqual(['battleEnded', 'castleFallen']);
    trigger.check = 'monthStart';
    expect(eventCheckDue(trigger, 1, signals)).toBe(false);
  });

  it.each(['eachClan', 'player', 'fixed', 'randomDistrict', 'randomRegionClan'] as const)(
    'uses canonical cooldown scope for %s',
    (target: EventTargetKind) => {
      const def = definition();
      def.target = target;
      def.trigger.cooldownKey = 'shared';
      expect(eventCooldownKey(def, binding)).toBe(
        ['eachClan', 'player'].includes(target) ? `shared.${CLAN_ALPHA}` : 'shared',
      );
      expect(eventCooldownKey(def, null)).toBe('shared');
      def.trigger.cooldownKey = null;
      expect(eventCooldownKey(def, binding)).toBe(
        ['eachClan', 'player'].includes(target) ? `${def.id}.${CLAN_ALPHA}` : def.id,
      );
    },
  );

  it('sorts a copy by descending priority and deterministic ID tie without altering catalog', () => {
    const defs = ['evt.z', 'evt.a', 'evt.b'].map((id, index) => ({
      ...definition(),
      id: id as EventId,
      priority: index === 2 ? 30 : 20,
    }));
    const before = structuredClone(defs);
    expect(sortEventDefs(defs).map((def) => def.id)).toEqual(['evt.b', 'evt.a', 'evt.z']);
    expect(defs).toEqual(before);
    expect(compareEventPriority(defs[0]!, defs[0]!)).toBe(0);
  });

  it('once presence includes day zero; repeatable events ignore fired records', () => {
    const state = fixture();
    const def = definition();
    state.events.fired[def.id] = 0;
    expect(isEventTriggerEligible(state, def, binding)).toBe(true);
    def.trigger.once = true;
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    delete state.events.fired[def.id];
    expect(isEventTriggerEligible(state, def, binding)).toBe(true);
  });

  it.each(['eachClan', 'player'] as const)(
    'rejects unresolved or invalid clan bindings for %s',
    (target) => {
      const state = fixture();
      const def = definition();
      def.target = target;
      def.trigger.conditions = [];
      expect(isEventTriggerEligible(state, def, null)).toBe(false);
      expect(isEventTriggerEligible(state, def, { ...binding, clanId: null })).toBe(false);
      expect(
        isEventTriggerEligible(state, def, { ...binding, clanId: 'clan.missing' as ClanId }),
      ).toBe(false);
      expect(isEventTriggerEligible(state, def, binding)).toBe(true);
      expect(isEventTriggerEligible(state, def, { ...binding, clanId: CLAN_BETA })).toBe(
        target === 'eachClan',
      );
      state.clans[CLAN_ALPHA]!.alive = false;
      expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    },
  );

  it('cooldown rejects before its boundary and permits equality without coupling clans', () => {
    const state = fixture(30);
    const def = definition();
    const key = eventCooldownKey(def, binding);
    state.events.cooldownUntil[key] = 31;
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    expect(isEventTriggerEligible(state, def, { ...binding, clanId: CLAN_BETA })).toBe(true);
    state.events.cooldownUntil[key] = 30;
    expect(isEventTriggerEligible(state, def, binding)).toBe(true);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'ignores inherited cooldown %s but respects an authored own value',
    (key) => {
      const state = fixture();
      const def = definition();
      def.target = 'fixed';
      def.trigger.cooldownKey = key;
      state.events.cooldownUntil = Object.create({ [key]: 999 }) as Record<string, number>;
      expect(isEventTriggerEligible(state, def, binding)).toBe(true);
      Object.defineProperty(state.events.cooldownUntil, key, { value: 999, enumerable: true });
      expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    },
  );

  it('evaluates real bound conditions without mutations or probability draws', () => {
    const state = fixture();
    const def = definition();
    def.trigger.conditions = [{ kind: 'castleOwner', castleId: '$castle', clanId: '$clan' }];
    const before = structuredClone(state);
    expect(isEventTriggerEligible(state, def, { ...binding, castleId: CASTLE_A1 })).toBe(true);
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    expect(
      isEventTriggerEligible(state, def, { ...binding, castleId: CASTLE_A1, clanId: CLAN_BETA }),
    ).toBe(false);
    def.trigger.probability = 0;
    expect(isEventTriggerEligible(state, def, { ...binding, castleId: CASTLE_A1 })).toBe(true);
    expect(state).toEqual(before);
  });

  it('rejects out-of-window, wrong-time and false-condition candidates silently', () => {
    const state = fixture(1);
    const def = definition();
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    state.time = { day: 720, ...dayToCalendar(720) };
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    state.time = { day: 0, ...dayToCalendar(0) };
    state.clans[CLAN_ALPHA]!.alive = false;
    const before = structuredClone(state);
    expect(isEventTriggerEligible(state, def, binding)).toBe(false);
    expect(state).toEqual(before);
  });
});
