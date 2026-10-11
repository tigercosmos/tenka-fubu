import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiCommandSink, runAiSystems } from '../../src/core/systems/ai';
import * as reactive from '../../src/core/systems/ai/reactive';
import * as attackPlan from '../../src/core/systems/ai/attackPlan';
import * as corps from '../../src/core/systems/ai/corps';
import * as scheduler from '../../src/core/systems/ai/scheduler';
import * as validation from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import type { Command } from '../../src/core/commands/types';
import type { AiSink } from '../../src/core/systems/ai/types';
import type { GameState } from '../../src/core/state/gameState';
import type { CorpsId, FacilityTypeId } from '../../src/core/state/ids';
import { aiScenario } from '../helpers/aiScenario';
import { BAL } from '../../src/core/balance';
import { planMarchFromCastle } from '../../src/core/systems/ai/shared';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_B1,
  CASTLE_A1,
  CASTLE_A2,
  OFF_ALPHA_LORD,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
const build: Command = {
  type: 'buildFacility',
  clanId: CLAN_BETA,
  castleId: CASTLE_B1,
  facilityTypeId: 'fac.ichi' as FacilityTypeId,
};
function state() {
  const game = buildTinyState();
  game.ai.allAi = true;
  game.clans[CLAN_BETA]!.gold = 400;
  return game;
}
function filledLog(game: GameState): void {
  game.ai.intentLog = Array.from({ length: BAL.aiIntentLogSize }, (_, index) => ({
    day: index,
    clanId: CLAN_BETA,
    layer: 'reactive',
    kind: 'hold',
    detail: { index },
    scores: [{ label: 'original', value: index }],
    commands: [{ ...build }],
  }));
}
function isMeaningfulAiCloneInput(input: unknown, game: GameState): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    'clans' in input &&
    input.clans === game.ai.clans &&
    'intentLog' in input &&
    Array.isArray(input.intentLog) &&
    input.intentLog.length === 0
  );
}
type WorldCloneInput = { castles: GameState['castles']; ai: unknown };
function isWorldCloneInput(input: unknown, game: GameState): input is WorldCloneInput {
  return (
    typeof input === 'object' &&
    input !== null &&
    'castles' in input &&
    input.castles === game.castles &&
    'ai' in input
  );
}
beforeEach(() => {
  vi.spyOn(attackPlan, 'attackPlansDailyTick').mockImplementation(() => {});
  vi.spyOn(corps, 'runCorpsDailyTick').mockImplementation(() => {});
  vi.spyOn(scheduler, 'enrollDueCouncils').mockImplementation(() => {});
  vi.spyOn(scheduler, 'runScheduledCouncilTick').mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('private lazy AI decision reservation sink', () => {
  it('does not deep-clone diagnostic records when nobody observes the private shadow log', () => {
    const game = state();
    filledLog(game);
    const first = game.ai.intentLog[0]!;
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((_live, _events, sink) => {
      expect(sink.canEnqueue!(build, authority).ok).toBe(true);
      expect(sink.enqueue(build, authority).ok).toBe(true);
    });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(runAiSystems(game).orders).toHaveLength(1);
    expect(clone.mock.calls.some(([input]) => input === game.ai)).toBe(false);
    expect(clone.mock.calls.some(([input]) => Array.isArray(input) && input.includes(first))).toBe(
      false,
    );
    expect(
      clone.mock.calls.filter(([input]) => isMeaningfulAiCloneInput(input, game)),
    ).toHaveLength(1);
    expect(game.ai.intentLog[0]).toBe(first);
  });

  it('captures all 1024 entry records before live append/trim and owns the shadow records on first read', () => {
    const game = state();
    filledLog(game);
    const entryLog = structuredClone(game.ai.intentLog);
    const validate = validation.validateCommand;
    let shadowSeen: GameState | null = null;
    vi.spyOn(validation, 'validateCommand').mockImplementation(
      (shadow, command, context, options) => {
        shadowSeen = shadow;
        const descriptor = Object.getOwnPropertyDescriptor(shadow.ai, 'intentLog');
        expect(typeof descriptor?.get).toBe('function');
        expect(Object.keys(shadow.ai)).toContain('intentLog');
        expect(shadow.ai.intentLog).toEqual(entryLog);
        expect(Object.getOwnPropertyDescriptor(shadow.ai, 'intentLog')).toMatchObject({
          writable: true,
          enumerable: true,
          configurable: true,
        });
        shadow.ai.intentLog[1]!.detail.index = -1;
        shadow.ai.intentLog[1]!.scores![0]!.value = -1;
        shadow.ai.intentLog[1]!.commands[0]!.clanId = CLAN_ALPHA;
        expect(game.ai.intentLog[0]!.detail.index).toBe(1);
        expect(game.ai.intentLog[0]!.scores![0]!.value).toBe(1);
        expect(game.ai.intentLog[0]!.commands[0]!.clanId).toBe(CLAN_BETA);
        return validate(shadow, command, context, options);
      },
    );
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((live, _events, sink) => {
      sink.record({
        day: live.time.day,
        clanId: CLAN_BETA,
        layer: 'reactive',
        kind: 'new-entry',
        detail: {},
        scores: null,
        commands: [],
      });
      expect(live.ai.intentLog).toHaveLength(1024);
      expect(live.ai.intentLog[0]!.detail.index).toBe(1);
      expect(sink.canEnqueue!(build, authority).ok).toBe(true);
    });
    runAiSystems(game);
    expect(shadowSeen).not.toBeNull();
    expect(game.ai.intentLog.at(-1)!.kind).toBe('new-entry');
  });

  it('does not clone the whole world on a record-only day', () => {
    const game = state(),
      before = structuredClone(game);
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((live, _events, sink) => {
      live.ai.clans[CLAN_BETA]!.nextPlanSeq++;
      sink.record({
        day: live.time.day,
        clanId: CLAN_BETA,
        layer: 'reactive',
        kind: 'hold',
        detail: {},
        scores: null,
        commands: [],
      });
    });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    expect(runAiSystems(game).orders).toEqual([]);
    expect(clone.mock.calls.filter(([input]) => input === game)).toHaveLength(0);
    expect(clone.mock.calls.filter(([input]) => isWorldCloneInput(input, game))).toHaveLength(0);
    expect(
      clone.mock.calls.filter(([input]) => isMeaningfulAiCloneInput(input, game)),
    ).toHaveLength(1);
    expect(game.clans).toEqual(before.clans);
    expect(game.castles).toEqual(before.castles);
    expect(game.rng).toEqual(before.rng);
  });

  it('materializes once on the first check and keeps one shared resource reservation', () => {
    const game = state(),
      before = structuredClone(game);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((_live, _events, sink) => {
      expect(clone.mock.calls.filter(([input]) => input === game)).toHaveLength(0);
      expect(sink.canEnqueue!(build, authority).ok).toBe(true);
      expect(sink.enqueue(build, authority).ok).toBe(true);
      expect(sink.canEnqueue!(build, authority).ok).toBe(false);
      expect(sink.enqueue(build, authority).ok).toBe(false);
      expect(
        sink.enqueue({ ...build, facilityTypeId: 'fac.heisha' as FacilityTypeId }, authority).ok,
      ).toBe(false);
    });
    expect(runAiSystems(game).orders).toHaveLength(1);
    expect(clone.mock.calls.filter(([input]) => isWorldCloneInput(input, game))).toHaveLength(1);
    expect(game.clans).toEqual(before.clans);
    expect(game.castles).toEqual(before.castles);
    expect(game.rng).toEqual(before.rng);
  });

  it('does not reclone discarded AI during materialization and preserves the entire validator state', () => {
    const game = state();
    filledLog(game);
    const expected = structuredClone(game);
    const actualValidate = validation.validateCommand;
    let validatorState: GameState | null = null;
    vi.spyOn(validation, 'validateCommand').mockImplementation(
      (shadow, command, context, options) => {
        validatorState = structuredClone(shadow);
        return actualValidate(shadow, command, context, options);
      },
    );
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((_live, _events, sink) => {
      expect(sink.canEnqueue!(build, authority).ok).toBe(true);
    });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    runAiSystems(game);
    const materializationInputs = clone.mock.calls
      .map(([input]) => input)
      .filter((input): input is WorldCloneInput => isWorldCloneInput(input, game));
    expect(materializationInputs).toHaveLength(1);
    const materialization = materializationInputs[0];
    if (!materialization) throw new Error('Expected a world materialization clone');
    expect(materialization.ai).toBeNull();
    expect(
      clone.mock.calls.filter(([input]) => isMeaningfulAiCloneInput(input, game)),
    ).toHaveLength(1);
    expect(validatorState).toEqual(expected);
    expect(game).toEqual(expected);
  });

  it('keeps persisted-order replay eager before any decision mutation', () => {
    const game = state();
    game.ai.pendingOrders.push({ command: build, authority });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((live, _events, sink) => {
      expect(clone.mock.calls.filter(([input]) => input === game)).toHaveLength(1);
      live.ai.clans[CLAN_BETA]!.attackPlans = [];
      expect(sink.canEnqueue!(build, authority).ok).toBe(false);
    });
    expect(runAiSystems(game).orders).toEqual([]);
    expect(game.castles[CASTLE_B1]!.buildQueue).toEqual([]);
    expect(game.clans[CLAN_BETA]!.gold).toBe(400);
  });

  it('does not change the eager public API in either bookkeeping mode', () => {
    for (const bookkeeping of ['full', 'authority'] as const) {
      const game = state(),
        clone = vi.spyOn(globalThis, 'structuredClone');
      const q = createAiCommandSink(game, { bookkeeping });
      expect(clone.mock.calls.filter(([input]) => input === game)).toHaveLength(1);
      expect(q.shadow).toEqual(game);
      expect(q.shadow).not.toBe(game);
      clone.mockRestore();
    }
  });

  it('refreshes current consolidation authority after restoring initial AI on materialization', () => {
    const { state: game, scope } = aiScenario();
    game.ai.allAi = true;
    const march = planMarchFromCastle(game, scope, game.castles[CASTLE_A1]!, CASTLE_B1)!;
    applyCommand(game, march, () => {}, { kind: 'clan', clanId: CLAN_ALPHA });
    const army = Object.values(game.armies)[0]!,
      corpsId = 'corps.lazy-consolidate' as CorpsId;
    army.status = 'holding';
    army.posNodeId = CASTLE_A2;
    army.corpsId = corpsId;
    game.castles[CASTLE_A2]!.soldiers = 0;
    game.castles[CASTLE_A2]!.food = 0;
    game.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      directive: 'advance',
      targetNodeId: CASTLE_B1,
      gold: 0,
      createdDay: game.time.day,
    };
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((live, _events, sink) => {
      live.ai.clans[CLAN_ALPHA]!.attackPlans.push({
        id: 'plan.lazy-consolidate',
        ownerCorpsId: corpsId,
        abortReason: null,
        targetCastleId: CASTLE_A2,
        targetClanId: CLAN_ALPHA,
        sourceLeaderIds: { [CASTLE_A1]: OFF_ALPHA_LORD },
        stagingRetainedTroops: 100,
        stagingCastleId: CASTLE_A1,
        sourceCastleIds: [CASTLE_A1],
        stage: 'consolidate',
        armyIds: [army.id],
        startedDay: live.time.day,
        stageEnteredDay: live.time.day,
        plannedTroops: 100,
      });
      const command: Command = {
          type: 'depositGarrison',
          clanId: CLAN_ALPHA,
          armyId: army.id,
          castleId: CASTLE_A2,
          soldiers: 100,
          food: 10,
        },
        context = { kind: 'corps' as const, clanId: CLAN_ALPHA, corpsId };
      expect(sink.canEnqueue!(command, context).ok).toBe(true);
      delete live.ai.clans[CLAN_ALPHA];
      expect(sink.canEnqueue!(command, context).ok).toBe(false);
    });
    expect(runAiSystems(game).orders).toEqual([]);
  });

  it('matches the frozen eager reference, including captured entry AI/RNG and random commands', () => {
    const initial = state();
    filledLog(initial);
    initial.clans[CLAN_ALPHA]!.gold = 50_000;
    const captive = initial.officers[OFF_BETA_BUSHO]!;
    captive.status = 'captive';
    captive.capturedByClanId = CLAN_ALPHA;
    captive.locationCastleId = CASTLE_A1;
    const foreignCorpsId = 'corps.lazy-foreign' as CorpsId;
    initial.corps[foreignCorpsId] = {
      id: foreignCorpsId,
      clanId: CLAN_BETA,
      corpsLeaderId: captive.id,
      directive: 'hold',
      targetNodeId: null,
      gold: 50,
      createdDay: initial.time.day,
    };
    initial.ai.clans[CLAN_BETA]!.attackPlans.push({
      id: 'plan.lazy-foreign',
      ownerCorpsId: foreignCorpsId,
      abortReason: null,
      targetCastleId: CASTLE_A1,
      targetClanId: CLAN_ALPHA,
      sourceLeaderIds: { [CASTLE_B1]: captive.id },
      stagingRetainedTroops: 100,
      stagingCastleId: CASTLE_B1,
      sourceCastleIds: [CASTLE_B1],
      stage: 'consolidate',
      armyIds: [],
      startedDay: initial.time.day,
      stageEnteredDay: initial.time.day,
      plannedTroops: 100,
    });
    const decide = (live: GameState, sink: AiSink) => {
      // Synthetic bookkeeping changes model late scheduling; RNG mutation is defensive coverage,
      // not a claim that today's decision modules consume RNG.
      live.ai.clans[CLAN_ALPHA]!.nextPlanSeq += 10;
      live.ai.clans[CLAN_BETA]!.nextPlanSeq += 2;
      live.rng.misc += 1;
      sink.record({
        day: live.time.day,
        clanId: CLAN_BETA,
        layer: 'reactive',
        kind: 'hold',
        detail: {},
        scores: null,
        commands: [],
      });
      sink.canEnqueue!(build, authority);
      sink.enqueue(build, authority);
      sink.enqueue(build, authority);
      sink.enqueue(
        {
          type: 'handleCaptive',
          clanId: CLAN_ALPHA,
          officerId: captive.id,
          action: 'recruit',
          executorId: null,
        },
        { kind: 'player' },
      );
      // If random recruitment failed, release still exercises foreign cleanup; if it succeeded,
      // transferOfficer has already performed that same cleanup.
      sink.enqueue(
        {
          type: 'handleCaptive',
          clanId: CLAN_ALPHA,
          officerId: captive.id,
          action: 'release',
          executorId: null,
        },
        { kind: 'player' },
      );
    };
    const reference = structuredClone(initial),
      eager = createAiCommandSink(reference, { bookkeeping: 'authority' });
    const actualValidate = validation.validateCommand,
      eagerProbes: GameState[] = [],
      lazyProbes: GameState[] = [];
    let probes = eagerProbes;
    vi.spyOn(validation, 'validateCommand').mockImplementation(
      (shadow, command, context, options) => {
        probes.push(structuredClone(shadow));
        return actualValidate(shadow, command, context, options);
      },
    );
    decide(reference, eager.sink);
    probes = lazyProbes;
    const game = structuredClone(initial);
    vi.spyOn(reactive, 'runReactiveAi').mockImplementation((live, _events, sink) =>
      decide(live, sink),
    );
    const lazy = runAiSystems(game);
    expect(lazy.orders).toEqual(eager.orders);
    expect(lazyProbes).toEqual(eagerProbes);
    expect(game).toEqual(reference);
    const eagerApplied = structuredClone(initial),
      lazyApplied = structuredClone(initial);
    for (const order of eager.orders)
      applyCommand(eagerApplied, order.command, () => {}, order.authority);
    for (const order of lazy.orders)
      applyCommand(lazyApplied, order.command, () => {}, order.authority);
    expect(lazyApplied).toEqual(eagerApplied);
    expect(lazyApplied.corps[foreignCorpsId]).toBeUndefined();
    expect(game.corps[foreignCorpsId]).toEqual(initial.corps[foreignCorpsId]);
  });
});
