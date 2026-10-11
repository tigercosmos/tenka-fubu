import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRngStream } from '../../src/core/rng';
import type { GameState } from '../../src/core/state/gameState';
import type { EventId } from '../../src/core/state/ids';
import { createEventEngine, type EventEffectApplier } from '../../src/core/systems/events/engine';
import type { EventDef } from '../../src/core/systems/events/types';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

function definition(probability: number, target: EventDef['target'] = 'fixed'): EventDef {
  return {
    id: 'evt.probability-probe' as EventId,
    kind: 'generic',
    priority: 1,
    target,
    ownerCandidates: [CLAN_ALPHA],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: 'Probe', body: 'Probe', monClanId: null },
    effects: [],
    choices: [],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('event probability preflight probe', () => {
  it.each(['fixed', 'randomDistrict'] as const)(
    'does not clone the full state on a probability-zero %s miss, preserving actual draws',
    (target) => {
      const state = buildTinyState(),
        def = definition(0, target),
        expected = structuredClone(state),
        preflight = vi.fn(),
        apply = vi.fn(),
        emit = vi.fn();
      if (target === 'randomDistrict')
        createRngStream(expected.rng, 'event').pick(
          Object.values(expected.districts).sort((a, b) => a.id.localeCompare(b.id)),
        );
      expect(createRngStream(expected.rng, 'event').chance(0)).toBe(false);
      const engine = createEventEngine([def], apply, { preflight });
      const clone = vi.spyOn(globalThis, 'structuredClone');
      engine.run(state, emit);
      expect(clone).not.toHaveBeenCalled();
      expect(state).toEqual(expected);
      expect(preflight).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it.each([0.99, 1])(
    'preserves old staged probability/effect/weighted-choice RNG order on a %s hit',
    (probability) => {
      const state = buildTinyState();
      state.ai.allAi = true;
      // A deterministic event-stream value whose next probability draw succeeds.
      state.rng.event = 0;
      const def = definition(probability);
      def.effects = [{ op: 'setFlag', key: 'common', value: 1 }];
      def.choices = [
        {
          label: 'First',
          conditions: [],
          aiWeight: 1,
          effects: [{ op: 'setFlag', key: 'first', value: 1 }],
        },
        {
          label: 'Second',
          conditions: [],
          aiWeight: 3,
          effects: [{ op: 'setFlag', key: 'second', value: 1 }],
        },
      ];
      const apply: EventEffectApplier = (game, ops) => {
        for (const op of ops) {
          if (op.op !== 'setFlag' || typeof op.key !== 'string') throw new Error('Test effect');
          game.events.flags[op.key] = createRngStream(game.rng, 'event').nextInt(1, 100);
          createRngStream(game.rng, 'misc').next();
        }
      };
      // Reference the original stageFire order: full clone, chance, common effects, AI draw.
      const oldProbe = structuredClone(state);
      if (probability < 1)
        expect(createRngStream(oldProbe.rng, 'event').chance(probability)).toBe(true);
      apply(
        oldProbe,
        def.effects,
        { clanId: CLAN_ALPHA, castleId: null, districtId: null },
        () => {},
      );
      const draw = createRngStream(oldProbe.rng, 'event').nextInt(1, 4),
        selected = def.choices[draw <= 1 ? 0 : 1]!,
        reference = structuredClone(state),
        preflight = vi.fn();
      createEventEngine([def], apply).run(reference, () => {});
      const stagedStates: GameState[] = [];
      const stagedApply: EventEffectApplier = (game, ops, binding, emit) => {
        apply(game, ops, binding, emit);
        if (game !== state) stagedStates.push(structuredClone(game));
      };
      const engine = createEventEngine([def], stagedApply, { preflight });
      const clone = vi.spyOn(globalThis, 'structuredClone');
      engine.run(state, () => {});
      expect(clone.mock.calls.some(([input]) => input === state)).toBe(true);
      expect(stagedStates).toHaveLength(1);
      const staged = stagedStates[0]!;
      // stageFire advances the weighted choice after the common-effect probe snapshot.
      createRngStream(staged.rng, 'event').nextInt(1, 4);
      expect(staged).toEqual(oldProbe);
      expect(preflight.mock.calls[1]?.[1]).toEqual([...def.effects, ...selected.effects]);
      expect(state).toEqual(reference);
    },
  );

  it('rolls back random binding and probability draws when hit preflight rejects', () => {
    const state = buildTinyState();
    state.rng.event = 0;
    const before = structuredClone(state),
      def = definition(0.99, 'randomDistrict'),
      apply = vi.fn(),
      emit = vi.fn(),
      engine = createEventEngine([def], apply, {
        preflight: () => {
          throw new Error('Unsafe hit');
        },
      });
    expect(() => engine.run(state, emit)).toThrow('Unsafe hit');
    expect(state).toEqual(before);
    expect(apply).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
