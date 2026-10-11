import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCommand } from '../../src/core/commands/apply';
import type { Command } from '../../src/core/commands/types';
import type { AttackPlan, GameState } from '../../src/core/state/gameState';
import type { CorpsId, FacilityTypeId } from '../../src/core/state/ids';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { planMarchFromCastle } from '../../src/core/systems/ai/shared';
import { aiScenario } from '../helpers/aiScenario';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
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
const corpsId = 'corps.bookkeeping' as CorpsId;
function plan(state: GameState): AttackPlan {
  return {
    id: 'plan.bookkeeping',
    abortReason: null,
    ownerCorpsId: corpsId,
    targetCastleId: CASTLE_A2,
    targetClanId: CLAN_ALPHA,
    sourceLeaderIds: { [CASTLE_A1]: OFF_ALPHA_LORD },
    stagingRetainedTroops: 100,
    stagingCastleId: CASTLE_A1,
    sourceCastleIds: [CASTLE_A1],
    stage: 'consolidate',
    armyIds: Object.values(state.armies).map((army) => army.id),
    startedDay: state.time.day,
    stageEnteredDay: state.time.day,
    plannedTroops: 100,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('AI sink explicit authority bookkeeping mode', () => {
  it('retains default full public-shadow refresh for unrelated clans', () => {
    const state = buildTinyState(),
      { sink, shadow } = createAiCommandSink(state);
    state.ai.clans[CLAN_ALPHA]!.nextPlanSeq += 10;
    sink.canEnqueue!(build, authority);
    expect(shadow.ai.clans).toEqual(state.ai.clans);
    expect(shadow.ai.clans[CLAN_ALPHA]).not.toBe(state.ai.clans[CLAN_ALPHA]);
  });

  it('clones one detached authority entry instead of the whole map per check and enqueue', () => {
    const state = buildTinyState();
    const full = createAiCommandSink(state),
      scoped = createAiCommandSink(state, { bookkeeping: 'authority' });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    full.sink.canEnqueue!(build, authority);
    full.sink.enqueue(build, authority);
    expect(clone.mock.calls.filter(([input]) => input === state.ai.clans)).toHaveLength(2);
    clone.mockClear();
    scoped.sink.canEnqueue!(build, authority);
    scoped.sink.enqueue(build, authority);
    expect(clone.mock.calls.filter(([input]) => input === state.ai.clans)).toHaveLength(0);
    expect(clone.mock.calls.filter(([input]) => input === state.ai.clans[CLAN_BETA])).toHaveLength(
      2,
    );
    expect(scoped.shadow.ai.clans[CLAN_BETA]).not.toBe(state.ai.clans[CLAN_BETA]);
    expect(scoped.shadow.ai.clans[CLAN_BETA]!.attackPlans).not.toBe(
      state.ai.clans[CLAN_BETA]!.attackPlans,
    );
  });

  it.each(['full', 'authority'] as const)(
    'preserves shared resource reservations and duplicate checks (%s)',
    (bookkeeping) => {
      const state = buildTinyState();
      state.clans[CLAN_BETA]!.gold = 400;
      const before = structuredClone(state),
        q = createAiCommandSink(state, { bookkeeping });
      expect(q.sink.enqueue(build, authority).ok).toBe(true);
      expect(q.sink.canEnqueue!(build, authority).ok).toBe(false);
      expect(q.sink.enqueue(build, authority).ok).toBe(false);
      expect(
        q.sink.enqueue({ ...build, facilityTypeId: 'fac.heisha' as FacilityTypeId }, authority).ok,
      ).toBe(false);
      expect(q.orders).toHaveLength(1);
      expect(q.shadow.clans[CLAN_BETA]!.gold).toBe(200);
      expect(state.clans).toEqual(before.clans);
      expect(state.castles).toEqual(before.castles);
      expect(state.rng).toEqual(before.rng);
    },
  );

  it('refreshes newly transitioned consolidation plans, including deletion', () => {
    const { state, scope } = aiScenario();
    const march = planMarchFromCastle(state, scope, state.castles[CASTLE_A1]!, CASTLE_B1)!;
    applyCommand(state, march, () => {}, { kind: 'clan', clanId: CLAN_ALPHA });
    const army = Object.values(state.armies)[0]!;
    army.status = 'holding';
    army.posNodeId = CASTLE_A2;
    army.corpsId = corpsId;
    state.castles[CASTLE_A2]!.soldiers = 0;
    state.castles[CASTLE_A2]!.food = 0;
    state.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      directive: 'advance',
      targetNodeId: CASTLE_B1,
      gold: 0,
      createdDay: state.time.day,
    };
    const q = createAiCommandSink(state, { bookkeeping: 'authority' }),
      corpsAuthority = { kind: 'corps' as const, clanId: CLAN_ALPHA, corpsId },
      command: Command = {
        type: 'depositGarrison',
        clanId: CLAN_ALPHA,
        armyId: army.id,
        castleId: CASTLE_A2,
        soldiers: 100,
        food: 10,
      };
    expect(q.sink.canEnqueue!(command, corpsAuthority).ok).toBe(false);
    state.ai.clans[CLAN_ALPHA]!.attackPlans.push(plan(state));
    expect(q.sink.canEnqueue!(command, corpsAuthority).ok).toBe(true);
    delete state.ai.clans[CLAN_ALPHA];
    expect(q.sink.canEnqueue!(command, corpsAuthority).ok).toBe(false);
    expect(q.shadow.ai.clans[CLAN_ALPHA]).toBeUndefined();
  });

  it('uses command clan for player authority and does not refresh unrelated internal bookkeeping', () => {
    const state = buildTinyState(),
      q = createAiCommandSink(state, { bookkeeping: 'authority' });
    state.ai.clans[CLAN_ALPHA]!.nextPlanSeq += 1;
    state.ai.clans[CLAN_BETA]!.nextPlanSeq += 1;
    q.sink.canEnqueue!(
      { type: 'setConscriptPolicy', clanId: CLAN_ALPHA, castleId: CASTLE_A1, policy: 'mid' },
      { kind: 'player' },
    );
    expect(q.shadow.ai.clans[CLAN_ALPHA]).toEqual(state.ai.clans[CLAN_ALPHA]);
    expect(q.shadow.ai.clans[CLAN_BETA]!.nextPlanSeq).toBe(
      state.ai.clans[CLAN_BETA]!.nextPlanSeq - 1,
    );
  });

  it('keeps indirect foreign corps cleanup detached from live bookkeeping', () => {
    const state = buildTinyState(),
      captive = state.officers[OFF_BETA_BUSHO]!;
    // Controlled cleanup fixture: a captured officer still has foreign corps bookkeeping.
    captive.status = 'captive';
    captive.capturedByClanId = CLAN_ALPHA;
    captive.locationCastleId = CASTLE_A1;
    state.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_BETA,
      corpsLeaderId: captive.id,
      directive: 'hold',
      targetNodeId: null,
      gold: 50,
      createdDay: state.time.day,
    };
    state.ai.clans[CLAN_BETA]!.attackPlans.push(plan(state));
    const before = structuredClone(state),
      q = createAiCommandSink(state, { bookkeeping: 'authority' });
    expect(
      q.sink.enqueue(
        {
          type: 'handleCaptive',
          clanId: CLAN_ALPHA,
          officerId: captive.id,
          action: 'release',
          executorId: null,
        },
        { kind: 'player' },
      ).ok,
    ).toBe(true);
    expect(q.shadow.corps[corpsId]).toBeUndefined();
    expect(q.shadow.ai.clans[CLAN_BETA]!.attackPlans).toEqual([]);
    expect(state).toEqual(before);
  });

  it('returns identical orders, RNG, and resource state in full and authority modes', () => {
    const initial = buildTinyState();
    initial.clans[CLAN_BETA]!.gold = 400;
    initial.clans[CLAN_ALPHA]!.gold = 50_000;
    const captive = initial.officers[OFF_BETA_BUSHO]!;
    captive.status = 'captive';
    captive.capturedByClanId = CLAN_ALPHA;
    captive.locationCastleId = CASTLE_A1;
    const run = (bookkeeping: 'full' | 'authority') => {
      const state = structuredClone(initial),
        q = createAiCommandSink(state, { bookkeeping });
      state.ai.clans[CLAN_BETA]!.nextPlanSeq++;
      q.sink.canEnqueue!(build, authority);
      q.sink.enqueue(build, authority);
      q.sink.enqueue(build, authority);
      expect(
        q.sink.enqueue(
          {
            type: 'handleCaptive',
            clanId: CLAN_ALPHA,
            officerId: captive.id,
            action: 'recruit',
            executorId: null,
          },
          { kind: 'player' },
        ).ok,
      ).toBe(true);
      expect(q.shadow.rng.misc).not.toBe(initial.rng.misc);
      expect(state.rng).toEqual(initial.rng);
      return { orders: q.orders, shadow: q.shadow, live: state };
    };
    expect(run('authority')).toEqual(run('full'));
  });
});
