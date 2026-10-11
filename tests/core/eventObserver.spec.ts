import { describe, expect, it, vi } from 'vitest';
import { createEventEngine, type EventFiredListener } from '../../src/core/systems/events/engine';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';
import { createRngStream } from '../../src/core/rng';
import { REGION_VALUES } from '../../src/core/state/enums';

export function observedDef(): EventDef {
  return {
    id: 'evt.observed' as EventId,
    kind: 'generic',
    priority: 1,
    target: 'player',
    ownerCandidates: ['$clan'],
    trigger: {
      from: null,
      to: null,
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: '觀測事件', body: '{clan}的事件。', monClanId: '$clan' },
    choices: [],
    effects: [{ op: 'addGold', clanId: '$clan', amount: 7 }],
  };
}

describe('event fire observers', () => {
  it('captures actual binding and recipients AFTER common effects, without additional RNG or core changes', () => {
    const state = buildTinyState(),
      control = structuredClone(state);
    const engine = createRuntimeEventEngine([observedDef()]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const listener = vi.fn<EventFiredListener>((notice, current) => {
      expect(current).toBe(state);
      expect(current.clans[CLAN_ALPHA]!.gold).toBe(gold + 7);
      expect(notice.binding).toEqual({ clanId: CLAN_ALPHA, castleId: null, districtId: null });
      expect(notice.clanIds).toEqual([CLAN_ALPHA]);
      expect(Object.isFrozen(notice.binding)).toBe(true);
    });
    engine.subscribeFired(listener);
    engine.run(state, () => undefined);
    createRuntimeEventEngine([observedDef()]).run(control, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state).toEqual(control);
  });
  it('isolates throwing observers and registration disposal without changing core results', () => {
    const state = buildTinyState(),
      control = structuredClone(state);
    const engine = createRuntimeEventEngine([observedDef()]),
      listener = vi.fn<EventFiredListener>();
    engine.subscribeFired(() => {
      throw new Error('View unavailable');
    });
    const dispose = engine.subscribeFired(listener);
    engine.subscribeFired(listener);
    dispose();
    dispose();
    engine.run(state, () => undefined);
    createRuntimeEventEngine([observedDef()]).run(control, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state).toEqual(control);
  });
  it('does not notify failed preflight, probability misses, cooldowns, or empty affected regions', () => {
    const listener = vi.fn(),
      state = buildTinyState();
    const fail = createEventEngine([observedDef()], () => undefined, {
      preflight: () => {
        throw new Error('Unsupported');
      },
    });
    fail.subscribeFired(listener);
    expect(() => fail.run(state, () => undefined)).toThrow('Unsupported');
    const miss = observedDef();
    miss.trigger.probability = 0;
    const engine = createRuntimeEventEngine([miss]);
    engine.subscribeFired(listener);
    engine.run(state, () => undefined);
    expect(listener).not.toHaveBeenCalled();
    const once = createRuntimeEventEngine([observedDef()]);
    once.subscribeFired(listener);
    once.run(state, () => undefined);
    once.run(state, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('notifies after AI choice effects, or after the mandatory player choice binding is installed', () => {
    const def = observedDef();
    def.choices = [
      {
        label: '選項',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'addGold', clanId: '$clan', amount: 11 }],
      },
    ];
    const state = buildTinyState();
    state.ai.allAi = true;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const engine = createRuntimeEventEngine([def]);
    const listener = vi.fn<EventFiredListener>((_, current) => {
      expect(current.clans[CLAN_ALPHA]!.gold).toBe(gold + 18);
      expect(current.events.pendingChoiceEventId).toBeNull();
    });
    engine.subscribeFired(listener);
    engine.run(state, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    const player = buildTinyState(),
      pending = createRuntimeEventEngine([def]);
    const pendingListener = vi.fn<EventFiredListener>((notice, current) => {
      expect(current.events.pendingChoiceEventId).toBe(def.id);
      expect(current.events.pendingChoiceBinding).toEqual(notice.binding);
    });
    pending.subscribeFired(pendingListener);
    pending.run(player, () => undefined);
    expect(pendingListener).toHaveBeenCalledTimes(1);
  });
  it('coalesces regional recipients into one actual-binding notice and skips empty regions', () => {
    const def = observedDef();
    def.target = 'randomRegionClan';
    def.ownerCandidates = [];
    def.effects = [];
    def.cutscene.monClanId = null;
    const state = buildTinyState();
    const rng = structuredClone(state.rng);
    const region = createRngStream(rng, 'event').pick([...REGION_VALUES].sort());
    for (const province of Object.values(state.provinces)) province.region = region;
    const engine = createRuntimeEventEngine([def]),
      listener = vi.fn<EventFiredListener>();
    engine.subscribeFired(listener);
    engine.run(state, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].clanIds).toEqual([CLAN_ALPHA, CLAN_BETA]);
    expect(listener.mock.calls[0]![0].binding).toEqual({
      clanId: null,
      castleId: null,
      districtId: null,
      region,
    });
    const empty = buildTinyState();
    empty.provinces = {};
    const emptyEngine = createRuntimeEventEngine([def]);
    emptyEngine.subscribeFired(listener);
    emptyEngine.run(empty, () => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
