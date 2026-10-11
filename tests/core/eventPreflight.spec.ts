import { describe, expect, it, vi } from 'vitest';
import { createEventEngine, type EventEffectApplier } from '../../src/core/systems/events/engine';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId, TaimeiId } from '../../src/core/state/ids';
import { createRngStream } from '../../src/core/rng';
import { resolveEventFlagKey } from '../../src/core/systems/events/flagKeys';
import { validateState } from '../../src/core/state/invariants';
import { applyMarch } from '../../src/core/commands/march';
import type { EffectOp } from '../../src/core/systems/events/types';
import type { GameState } from '../../src/core/state/gameState';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_ALPHA_BUSHO,
  CASTLE_A1,
  CASTLE_B1,
  DIST_B1Y,
} from '../fixtures/tiny';

function definition(): EventDef {
  return {
    id: 'evt.preflight' as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
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
    cutscene: { title: 'Preflight', body: 'Preflight', monClanId: null },
    effects: [],
    choices: [],
  };
}
function command(def: EventDef, choiceIndex = 0) {
  return { type: 'resolveEventChoice' as const, clanId: CLAN_ALPHA, eventId: def.id, choiceIndex };
}
function conflictingPact(state: GameState): EffectOp {
  return {
    op: 'signPact',
    a: state.meta.playerClanId,
    b: CLAN_BETA,
    pact: 'alliance',
    months: Number.MAX_VALUE,
    vassalClanId: null,
  };
}

describe('stateful event preflight before committed firing', () => {
  it.each([true, false])(
    'rejects an overflowing pact before once/cooldown bookkeeping (once=%s)',
    (once) => {
      const state = buildTinyState(),
        def = definition();
      def.trigger.once = once;
      def.trigger.cooldownDays = once ? 0 : 30;
      def.effects = [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 50 }, conflictingPact(state)];
      const before = structuredClone(state),
        emit = vi.fn();
      expect(() => createRuntimeEventEngine([def]).run(state, emit)).toThrow('duration overflow');
      expect(state).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('rejects a selected overflowing AI pact without committing preceding common succession', () => {
    const state = buildTinyState(),
      def = definition();
    state.ai.allAi = true;
    state.officers[OFF_ALPHA_TAISHO]!.kinship = 'kin';
    def.effects = [{ op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'age' }];
    def.choices = [
      {
        label: 'Depart new heir',
        conditions: [],
        aiWeight: 1,
        effects: [conflictingPact(state)],
      },
    ];
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() => createRuntimeEventEngine([def]).run(state, emit)).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
    expect(validateState(state)).toEqual([]);
  });

  it('does not reject an unselected or ineligible statefully unsupported AI choice', () => {
    const state = buildTinyState(),
      def = definition();
    state.ai.allAi = true;
    def.choices = [
      {
        label: 'Safe',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'setFlag', key: 'safe', value: 1 }],
      },
      {
        label: 'Zero weight',
        conditions: [],
        aiWeight: 0,
        effects: [conflictingPact(state)],
      },
      {
        label: 'Ineligible',
        conditions: [{ kind: 'flag', key: 'missing', min: 1 }],
        aiWeight: 100,
        effects: [conflictingPact(state)],
      },
    ];
    createRuntimeEventEngine([def]).run(state, () => undefined);
    expect(state.events.flags.safe).toBe(1);
    expect(state.officers[OFF_ALPHA_LORD]!.status).toBe('serving');
    expect(validateState(state)).toEqual([]);
  });

  it('fires player common effects but refuses an unsafe selected resolution without reapplying common', () => {
    const state = buildTinyState(),
      def = definition();
    def.effects = [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 20 }];
    def.choices = [
      {
        label: 'Leader departs',
        conditions: [],
        aiWeight: 1,
        effects: [conflictingPact(state)],
      },
    ];
    const engine = createRuntimeEventEngine([def]);
    engine.run(state, () => undefined);
    expect(state.events.pendingChoiceEventId).toBe(def.id);
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() => engine.resolveChoice(state, command(def), emit)).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('stages stale-choice fallback RNG and preserves the pending choice on unsafe fallback', () => {
    const state = buildTinyState(),
      def = definition();
    state.events.flags.allowed = 1;
    def.effects = [{ op: 'setFlag', key: 'common-once', value: 1 }];
    def.choices = [
      {
        label: 'Initially safe',
        conditions: [{ kind: 'flag', key: 'allowed', min: 1 }],
        aiWeight: 0,
        effects: [],
      },
      {
        label: 'Fallback',
        conditions: [],
        aiWeight: 1,
        effects: [conflictingPact(state)],
      },
    ];
    const engine = createRuntimeEventEngine([def]);
    engine.run(state, () => undefined);
    state.events.flags.allowed = 0;
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() => engine.resolveChoice(state, command(def), emit)).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('restores random-district binding RNG when the subsequent common preflight fails', () => {
    const state = buildTinyState(),
      def = definition();
    def.kind = 'generic';
    def.target = 'randomDistrict';
    def.trigger.probability = 0.99;
    def.effects = [conflictingPact(state)];
    const before = structuredClone(state),
      emit = vi.fn();
    expect(() => createRuntimeEventEngine([def]).run(state, emit)).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips no-refuge departure in an invariant-valid connected enemy hinterland', () => {
    const state = buildTinyState(),
      def = definition();
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 100,
        food: 100,
        targetNodeId: CASTLE_B1,
      },
      () => undefined,
    );
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = DIST_B1Y;
    army.path = [DIST_B1Y];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
    expect(validateState(state)).toEqual([]);
    def.effects = [
      { op: 'addGold', clanId: CLAN_ALPHA, amount: 50 },
      { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO },
    ];
    const before = structuredClone(state),
      emit = vi.fn();
    createRuntimeEventEngine([def]).run(state, emit);
    expect(state.armies).toEqual(before.armies);
    expect(state.officers).toEqual(before.officers);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold + 50);
    expect(emit.mock.calls.map(([event]) => (event as { type: string }).type)).toEqual([
      'event.fired',
    ]);
    expect(validateState(state)).toEqual([]);
  });

  it('does not roll back earlier legitimate events, hook statistics or expired taimei', () => {
    const state = buildTinyState(),
      safe = definition(),
      unsafe = definition();
    state.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = 'taimei.fixture' as TaimeiId;
    state.clans[CLAN_ALPHA]!.taimei.activeUntilDay = state.time.day - 1;
    state.events.hookSignals = [
      {
        kind: 'battleEnded',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        castleId: null,
        officerId: null,
        winnerClanId: CLAN_ALPHA,
        playerInvolved: true,
      },
    ];
    safe.id = 'evt.first' as EventId;
    safe.priority = 30;
    safe.effects = [{ op: 'setFlag', key: 'first', value: 1 }];
    unsafe.effects = [conflictingPact(state)];
    const expected = structuredClone(state);
    createRuntimeEventEngine([safe]).run(expected, () => undefined);
    const emit = vi.fn();
    expect(() => createRuntimeEventEngine([unsafe, safe]).run(state, emit)).toThrow(
      'duration overflow',
    );
    expect(state).toEqual(expected);
    expect(emit.mock.calls.map(([event]) => (event as { type: string }).type)).toEqual([
      'taimei.expired',
      'event.fired',
    ]);
  });

  it('keeps original probability/common/weighted-choice draw ordering for a generic injected RNG effect', () => {
    const def = definition();
    def.trigger.probability = 0.99;
    def.effects = [{ op: 'setFlag', key: 'common-rng', value: 0 }];
    def.choices = [1, 2].map((value) => ({
      label: String(value),
      conditions: [],
      aiWeight: 1,
      effects: [{ op: 'setFlag' as const, key: 'choice-rng', value }],
    }));
    const apply: EventEffectApplier = (state, ops, binding) => {
      for (const op of ops)
        if (op.op === 'setFlag') {
          const key = resolveEventFlagKey(op.key, state, binding);
          if (key !== null)
            state.events.flags[key] =
              op.value + createRngStream(state.rng, 'event').nextInt(1, 100);
        }
    };
    const a = buildTinyState();
    a.ai.allAi = true;
    const b = structuredClone(a);
    createEventEngine([def], apply).run(a, () => undefined);
    createEventEngine([def], apply, { preflight: () => undefined }).run(b, () => undefined);
    expect(b).toEqual(a);
    expect(b.events.flags['choice-rng']).toBeDefined();
  });

  it('commits a legitimate failed probability attempt without checking unchosen effects', () => {
    const state = buildTinyState(),
      def = definition();
    def.trigger.probability = 0;
    def.effects = [{ op: 'makeRonin', officerId: OFF_ALPHA_LORD }];
    const expected = structuredClone(state);
    createRngStream(expected.rng, 'event').chance(0);
    createRuntimeEventEngine([def]).run(state, () => undefined);
    expect(state).toEqual(expected);
  });
});
