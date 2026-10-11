import { describe, expect, it, vi } from 'vitest';
import { createEventEngine, type EventEffectApplier } from '../../src/core/systems/events/engine';
import { applyScalarEffects, isScalarEffectOp } from '../../src/core/systems/events/scalarEffects';
import type { EventDef, EventHookSignal } from '../../src/core/systems/events/types';
import type { CmdResolveEventChoice } from '../../src/core/commands/types';
import type { EventId, TaimeiId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { createRngStream } from '../../src/core/rng';
import { dayToCalendar } from '../../src/core/systems/time';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function def(id = 'evt.fixture'): EventDef {
  return {
    id: id as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    ownerCandidates: [],
    cutscene: { title: 'Fixture', body: 'Fixture', monClanId: null },
    choices: [],
    effects: [{ op: 'setFlag', key: id, value: 1 }],
  };
}
const scalar: EventEffectApplier = (state, ops, binding, emit) => {
  for (const op of ops) {
    if (!isScalarEffectOp(op)) throw new Error('Test adapter only supports scalar fixtures');
    applyScalarEffects(state, [op], binding, emit);
  }
};
function fixture(day = 0) {
  const state = buildTinyState();
  state.time = { day, ...dayToCalendar(day) };
  state.events.pendingChoiceBinding = null;
  state.events.hookSignals = [];
  return state;
}
function choiceDef(owner = CLAN_ALPHA) {
  const d = def();
  d.ownerCandidates = [owner];
  d.choices = [
    { label: 'A', conditions: [], effects: [{ op: 'setFlag', key: 'A', value: 1 }], aiWeight: 3 },
    { label: 'B', conditions: [], effects: [{ op: 'setFlag', key: 'B', value: 1 }], aiWeight: 1 },
  ];
  return d;
}
function command(eventId = 'evt.fixture', choiceIndex = 0): CmdResolveEventChoice {
  return {
    type: 'resolveEventChoice',
    clanId: CLAN_ALPHA,
    eventId: eventId as EventId,
    choiceIndex,
  };
}
function hook(kind: EventHookSignal['kind'] = 'battleEnded'): EventHookSignal {
  return {
    kind,
    day: 0,
    clanIds: [CLAN_ALPHA, CLAN_BETA],
    castleId: null,
    officerId: null,
    winnerClanId: CLAN_ALPHA,
    playerInvolved: true,
  };
}

describe('injected deterministic event runtime (plan10)', () => {
  it('snapshots and freezes catalog; priority/id ordering is stable and fires once at day zero', () => {
    const a = def('evt.a'),
      z = def('evt.z'),
      high = def('evt.high');
    high.priority = 30;
    const defs = [z, a, high];
    const engine = createEventEngine(defs, scalar);
    a.effects.length = 0;
    high.priority = 0;
    defs.length = 0;
    const state = fixture();
    const events: GameEvent[] = [];
    const beforeRng = { ...state.rng };
    engine.run(state, (e) => events.push(e));
    expect(events.map((e) => (e.type === 'event.fired' ? e.eventId : e.type))).toEqual([
      'evt.high',
      'evt.a',
      'evt.z',
    ]);
    expect(state.events.flags['evt.a']).toBe(1);
    engine.run(state, (e) => events.push(e));
    expect(events).toHaveLength(3);
    expect(state.rng).toEqual(beforeRng);
    expect(Object.isFrozen(engine.getDef('evt.a' as EventId)?.effects)).toBe(true);
    expect(engine.getDef('evt.missing' as EventId)).toBeUndefined();
  });

  it('rejects duplicate IDs before any run', () => {
    expect(() => createEventEngine([def(), def()], scalar)).toThrow('Duplicate event id');
  });

  it('date/check/once/cooldown/condition gates consume no RNG and record no false firing', () => {
    const state = fixture(1);
    const future = def('evt.future');
    if (future.trigger.from === null) throw new Error('This fixture needs a lower date bound');
    future.trigger.from.year = 1561;
    const wrongTime = def('evt.time'),
      once = def('evt.once'),
      cooled = def('evt.cool'),
      impossible = def('evt.false');
    for (const d of [once, cooled, impossible]) {
      d.trigger.check = 'hook';
      d.trigger.hooks = ['castleFallen'];
    }
    state.events.hookSignals = [hook('castleFallen')];
    state.events.fired[once.id] = 0;
    state.events.cooldownUntil[cooled.id] = 10;
    impossible.trigger.conditions = [
      { kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: Number.MAX_SAFE_INTEGER },
    ];
    const before = { ...state.rng };
    const emit = vi.fn();
    createEventEngine([future, wrongTime, once, cooled, impossible], scalar).run(state, emit);
    expect(emit).not.toHaveBeenCalled();
    expect(state.rng).toEqual(before);
    expect(state.events.fired).toEqual({ [once.id]: 0 });
    expect(state.events.flags).toEqual({});
  });

  it('probability zero draws exactly once, records nothing, and other RNG streams stay unchanged', () => {
    const state = fixture();
    const d = def();
    d.trigger.probability = 0;
    const expected = { ...state.rng };
    createRngStream(expected, 'event').chance(0);
    createEventEngine([d], scalar).run(state, vi.fn());
    expect(state.rng).toEqual(expected);
    expect(state.events.fired).toEqual({});
  });

  it('harvest gates at 9/1 and hook events catch up at month start without a signal', () => {
    const state = fixture();
    const harvest = def('evt.harvest'),
      catchup = def('evt.catchup');
    harvest.trigger.check = 'harvest';
    catchup.trigger.check = 'hook';
    catchup.trigger.hooks = ['castleFallen'];
    const engine = createEventEngine([harvest, catchup], scalar);
    engine.run(state, vi.fn());
    expect(state.events.flags['evt.catchup']).toBe(1);
    expect(state.events.flags['evt.harvest']).toBeUndefined();
    state.time = { day: 240, ...dayToCalendar(240) };
    engine.run(state, vi.fn());
    expect(state.events.flags['evt.harvest']).toBe(1);
  });

  it('writes magic cooldown keys as own data without mutating prototypes', () => {
    const state = fixture();
    const d = def();
    d.trigger.once = false;
    d.trigger.cooldownKey = '__proto__';
    d.trigger.cooldownDays = 30;
    const prototype: unknown = Object.getPrototypeOf(state.events.cooldownUntil);
    createEventEngine([d], scalar).run(state, vi.fn());
    expect(Object.hasOwn(state.events.cooldownUntil, '__proto__')).toBe(true);
    expect(state.events.cooldownUntil.__proto__).toBe(30);
    expect(Object.getPrototypeOf(state.events.cooldownUntil)).toBe(prototype);
  });

  it('per-clan bindings sort IDs, independent cooldowns share a group, equality permits firing', () => {
    const state = fixture();
    const d = def();
    d.kind = 'generic';
    d.target = 'eachClan';
    d.trigger.once = false;
    d.trigger.cooldownDays = 30;
    d.trigger.cooldownKey = 'group';
    const adapter = vi.fn(scalar);
    const engine = createEventEngine([d], adapter);
    engine.run(state, vi.fn());
    const clans = Object.keys(state.clans).sort();
    expect(adapter.mock.calls.map((c) => c[2].clanId)).toEqual(clans);
    expect(state.events.cooldownUntil).toEqual(
      Object.fromEntries(clans.map((id) => [`group.${id}`, 30])),
    );
    engine.run(state, vi.fn());
    expect(adapter).toHaveBeenCalledTimes(clans.length);
    state.time = { day: 30, ...dayToCalendar(30) };
    engine.run(state, vi.fn());
    expect(adapter).toHaveBeenCalledTimes(clans.length * 2);
  });

  it('random district consumes exactly one sorted candidate draw; global cooldown blocks picking', () => {
    const state = fixture();
    const d = def();
    d.target = 'randomDistrict';
    d.kind = 'generic';
    d.trigger.once = false;
    d.trigger.cooldownDays = 30;
    const expected = { ...state.rng };
    const district = createRngStream(expected, 'event').pick(
      Object.values(state.districts).sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    const apply = vi.fn(scalar);
    const engine = createEventEngine([d], apply);
    engine.run(state, vi.fn());
    expect(apply.mock.calls[0]?.[2]).toEqual({
      clanId: district.ownerClanId,
      castleId: district.castleId,
      districtId: district.id,
    });
    expect(state.rng).toEqual(expected);
    engine.run(state, vi.fn());
    expect(state.rng).toEqual(expected);
    expect(apply).toHaveBeenCalledOnce();
  });

  it('player binding and fixed owner prioritize living player over earlier AI candidate', () => {
    const state = fixture();
    const d = choiceDef(CLAN_BETA);
    d.ownerCandidates.push(CLAN_ALPHA);
    createEventEngine([d], scalar).run(state, vi.fn());
    expect(state.events.pendingChoiceBinding?.clanId).toBe(CLAN_ALPHA);
    const other = fixture();
    const player = def();
    player.kind = 'generic';
    player.target = 'player';
    const adapter = vi.fn(scalar);
    createEventEngine([player], adapter).run(other, vi.fn());
    expect(adapter.mock.calls[0]?.[2].clanId).toBe(CLAN_ALPHA);
  });

  it('common effects run once, only one player choice blocks later candidates, and resolve is idempotent', () => {
    const state = fixture();
    const first = choiceDef(),
      later = def('evt.later');
    later.priority = 10;
    const adapter = vi.fn(scalar);
    const engine = createEventEngine([later, first], adapter);
    const before = { ...state.rng };
    engine.run(state, vi.fn());
    expect(state.events.pendingChoiceEventId).toBe(first.id);
    expect(state.events.flags['evt.later']).toBeUndefined();
    expect(state.rng).toEqual(before);
    expect(adapter).toHaveBeenCalledOnce();
    engine.resolveChoice(state, command(), vi.fn());
    expect(state.events.flags.A).toBe(1);
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.events.pendingChoiceBinding).toBeNull();
    expect(adapter).toHaveBeenCalledTimes(2);
    engine.resolveChoice(state, command(), vi.fn());
    expect(adapter).toHaveBeenCalledTimes(2);
    engine.run(state, vi.fn());
    expect(state.events.flags['evt.later']).toBe(1);
  });

  it('weighted AI uses exactly one event draw and matches seeded weighted choice', () => {
    const state = fixture();
    const d = choiceDef(CLAN_BETA);
    const expected = { ...state.rng };
    const draw = createRngStream(expected, 'event').nextInt(1, 4);
    createEventEngine([d], scalar).run(state, vi.fn());
    expect(state.events.flags[draw <= 3 ? 'A' : 'B']).toBe(1);
    expect(state.rng).toEqual(expected);
    expect(state.events.pendingChoiceEventId).toBeNull();
  });

  it('serialized pending choice and binding resolve identically without replaying common effects', () => {
    const continuous = fixture();
    const d = choiceDef();
    d.effects = [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 100 }];
    const engine = createEventEngine([d], scalar);
    engine.run(continuous, vi.fn());
    const restored = JSON.parse(JSON.stringify(continuous)) as typeof continuous;
    const restarted = createEventEngine([d], scalar);
    engine.resolveChoice(continuous, command(), vi.fn());
    restarted.resolveChoice(restored, command(), vi.fn());
    expect(restored).toEqual(continuous);
  });

  it('all-AI player routes weighted choices to AI rather than creating a blocking choice', () => {
    const state = fixture();
    state.ai.allAi = true;
    createEventEngine([choiceDef()], scalar).run(state, vi.fn());
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.events.flags.A === 1 || state.events.flags.B === 1).toBe(true);
  });

  it.each([false, true])(
    'zero eligible weights choose first eligible/no choice without RNG: none=%s',
    (none) => {
      const state = fixture();
      const d = choiceDef(CLAN_BETA);
      const before = { ...state.rng };
      d.choices.forEach((choice) => {
        choice.aiWeight = 0;
      });
      d.choices[0]!.conditions = [
        { kind: 'clanGoldAtLeast', clanId: CLAN_BETA, value: Number.MAX_SAFE_INTEGER },
      ];
      if (none) d.choices[1]!.conditions = d.choices[0]!.conditions;
      createEventEngine([d], scalar).run(state, vi.fn());
      expect(state.events.flags.B).toBe(none ? undefined : 1);
      expect(state.rng).toEqual(before);
      expect(state.events.flags['evt.fixture']).toBe(1);
    },
  );

  it('late invalidated player choice falls back by AI weights without applying common effects twice', () => {
    const state = fixture();
    const d = choiceDef();
    d.effects = [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 100 }];
    d.choices[0]!.conditions = [{ kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: 50 }];
    const engine = createEventEngine([d], scalar);
    engine.run(state, vi.fn());
    state.clans[CLAN_ALPHA]!.gold = 0;
    expect(engine.validateChoice(state, command())).toEqual({ ok: true });
    const expected = { ...state.rng };
    createRngStream(expected, 'event').nextInt(1, 1);
    engine.resolveChoice(state, command(), vi.fn());
    expect(state.events.flags.B).toBe(1);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    expect(state.rng).toEqual(expected);
  });

  it.each([-1, 2, 0.5, NaN, Infinity])(
    'rejects bad choice index %s without state/RNG mutation',
    (index) => {
      const state = fixture();
      const engine = createEventEngine([choiceDef()], scalar);
      engine.run(state, vi.fn());
      const before = structuredClone(state);
      expect(engine.validateChoice(state, command('evt.fixture', index)).ok).toBe(false);
      engine.resolveChoice(state, command('evt.fixture', index), vi.fn());
      expect(state).toEqual(before);
    },
  );

  it('rejects non-player and mismatching event; legacy fixed null binding resolves but generic null cannot guess', () => {
    const state = fixture();
    const engine = createEventEngine([choiceDef()], scalar);
    engine.run(state, vi.fn());
    expect(engine.validateChoice(state, { ...command(), clanId: CLAN_BETA })).toMatchObject({
      ok: false,
      reasonKey: 'cmd.reject.notOwner',
    });
    expect(engine.validateChoice(state, command('evt.unknown')).ok).toBe(false);
    state.events.pendingChoiceBinding = null;
    expect(engine.validateChoice(state, command()).ok).toBe(true);
    engine.resolveChoice(state, command(), vi.fn());
    expect(state.events.flags.A).toBe(1);
    const generic = choiceDef();
    generic.kind = 'generic';
    generic.target = 'player';
    state.events.pendingChoiceEventId = generic.id;
    expect(createEventEngine([generic], scalar).validateChoice(state, command()).ok).toBe(false);
  });

  it('consumes hook statistics once, retains newly emitted hooks for next run, and hooks permit nonmonthly events', () => {
    const state = fixture(1);
    state.events.hookSignals = [hook()];
    const d = def();
    d.trigger.check = 'hook';
    d.trigger.hooks = ['battleEnded'];
    const apply: EventEffectApplier = (...args) => {
      scalar(...args);
      args[0].events.hookSignals.push(hook('leaderDied'));
    };
    const engine = createEventEngine([d], apply);
    engine.run(state, vi.fn());
    expect(state.events.stats).toMatchObject({ battlesFought: 1, battlesWon: 1 });
    expect(state.events.hookSignals.map((s) => s.kind)).toEqual(['leaderDied']);
    engine.run(state, vi.fn());
    expect(state.events.stats.battlesFought).toBe(1);
    expect(state.events.hookSignals).toEqual([]);
  });

  it('expires taimei and consumes stats even while pending; harvest flag cleanup waits until after pending guard', () => {
    const state = fixture(630);
    const engine = createEventEngine([], scalar);
    const events: GameEvent[] = [];
    state.events.pendingChoiceEventId = 'evt.pending' as EventId;
    state.events.hookSignals = [hook()];
    state.events.flags = {
      'harvest.1560.clan.alpha': 120,
      'harvest.1561.clan.alpha': 70,
      unrelated: 1,
    };
    state.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = 'taimei.teppeki' as TaimeiId;
    state.clans[CLAN_ALPHA]!.taimei.activeUntilDay = 629;
    engine.run(state, (e) => events.push(e));
    expect(events[0]?.type).toBe('taimei.expired');
    expect(state.events.stats.battlesFought).toBe(1);
    expect(state.events.flags['harvest.1560.clan.alpha']).toBe(120);
    state.events.pendingChoiceEventId = null;
    engine.run(state, (e) => events.push(e));
    expect(state.events.flags).toEqual({ 'harvest.1561.clan.alpha': 70, unrelated: 1 });
    expect(events).toHaveLength(1);
  });
});
