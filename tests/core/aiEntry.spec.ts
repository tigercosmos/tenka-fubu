import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import type { AiIntent, GameState } from '../../src/core/state/gameState';
import { createAiCommandSink, runAiSystems, warmAiCaches } from '../../src/core/systems/ai';
import { enrollDueCouncils, runScheduledCouncilTick } from '../../src/core/systems/ai/scheduler';
import { cachedTravelDays } from '../../src/core/systems/ai/shared';
import { computeThreatCache } from '../../src/core/systems/ai/threat';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function manyClans(count: number): GameState {
  const state = buildTinyState();
  for (let i = 0; i < count; i++) {
    const id = `clan.test-${String(i).padStart(3, '0')}` as ClanId;
    state.clans[id] = { ...state.clans[CLAN_BETA]!, id };
    state.ai.clans[id] = {
      ...state.ai.clans[CLAN_BETA]!,
      clanId: id,
      councilOffset: 0,
      pendingPhases: [],
      attackPlans: [],
    };
  }
  state.clans[CLAN_BETA]!.alive = false;
  return state;
}

describe('M7 fair council scheduler and isolated entry sink', () => {
  it('executes one phase per owner/day under cap4 and rotates FIFO rather than starving late IDs', () => {
    const state = manyClans(41),
      seen: string[] = [];
    enrollDueCouncils(state);
    expect(state.ai.councilJobs).toHaveLength(41);
    for (let day = 0; day < 11; day++) {
      state.time.day++;
      const owners = new Set<string>();
      const count = runScheduledCouncilTick(state, (job, phase) => {
        expect(owners.has(job.clanId)).toBe(false);
        owners.add(job.clanId);
        if (phase === 'threat') seen.push(job.clanId);
      });
      expect(count).toBeLessThanOrEqual(BAL.aiCouncilMaxPerTick);
    }
    expect(new Set(seen).size).toBe(41);
    expect(seen).toEqual([...seen].sort());
    expect(state.ai.councilJobs.length).toBeGreaterThan(0);
  });
  it('coalesces repeated and next-month requests while a council remains in flight', () => {
    const state = manyClans(41);
    enrollDueCouncils(state);
    enrollDueCouncils(state);
    expect(state.ai.councilJobs).toHaveLength(41);
    state.time.day += 30;
    enrollDueCouncils(state);
    expect(state.ai.councilJobs).toHaveLength(41);
    expect(
      Object.values(state.ai.lastCouncilEnrollment).every((day) => day === state.time.day),
    ).toBe(true);
    for (let day = 0; day < 50; day++) {
      state.time.day++;
      runScheduledCouncilTick(state, () => {});
    }
    expect(state.ai.councilJobs).toHaveLength(0);
  });
  it('continues exact FIFO phases after cloning/reloading the persisted scheduler state', () => {
    const state = manyClans(9);
    enrollDueCouncils(state);
    runScheduledCouncilTick(state, () => {});
    const reloaded = structuredClone(state),
      uninterrupted: string[] = [],
      resumed: string[] = [];
    for (let day = 0; day < 12; day++) {
      state.time.day++;
      reloaded.time.day++;
      runScheduledCouncilTick(state, (job, phase) => uninterrupted.push(`${job.clanId}:${phase}`));
      runScheduledCouncilTick(reloaded, (job, phase) => resumed.push(`${job.clanId}:${phase}`));
    }
    expect(resumed).toEqual(uninterrupted);
    expect(reloaded.ai).toEqual(state.ai);
  });
  it('hard extra councils contain only threat/military and never accelerate multiple phases in one day', () => {
    const state = buildTinyState();
    state.meta.difficulty = 'hard';
    state.ai.clans[CLAN_BETA]!.councilOffset = 0;
    enrollDueCouncils(state);
    const phases: string[] = [];
    for (let day = 0; day < 4; day++) {
      state.time.day++;
      runScheduledCouncilTick(state, (_job, phase) => phases.push(phase));
    }
    expect(phases).toEqual(['threat', 'military', 'domestic', 'diplomacy']);
    state.time.dayOfMonth = 16;
    state.time.day += 11;
    enrollDueCouncils(state);
    expect(state.ai.councilJobs[0]?.phases).toEqual(['threat', 'military']);
  });
  it('one shared shadow enforces funds, construction slots and duplicate orders without gameplay mutation', () => {
    const state = buildTinyState();
    state.clans[CLAN_BETA]!.gold = 400;
    const before = JSON.stringify({
      clans: state.clans,
      castles: state.castles,
      officers: state.officers,
      rng: state.rng,
    });
    const { sink, orders, shadow } = createAiCommandSink(state),
      authority = { kind: 'clan' as const, clanId: CLAN_BETA };
    expect(
      sink.enqueue(
        {
          type: 'buildFacility',
          clanId: CLAN_BETA,
          castleId: CASTLE_B1,
          facilityTypeId: 'fac.ichi' as never,
        },
        authority,
      ).ok,
    ).toBe(true);
    expect(
      sink.enqueue(
        {
          type: 'buildFacility',
          clanId: CLAN_BETA,
          castleId: CASTLE_B1,
          facilityTypeId: 'fac.ichi' as never,
        },
        authority,
      ).ok,
    ).toBe(false);
    expect(
      sink.enqueue(
        {
          type: 'buildFacility',
          clanId: CLAN_BETA,
          castleId: CASTLE_B1,
          facilityTypeId: 'fac.heisha' as never,
        },
        authority,
      ).ok,
    ).toBe(false);
    expect(orders).toHaveLength(1);
    expect(shadow.clans[CLAN_BETA]!.gold).toBe(200);
    expect(
      JSON.stringify({
        clans: state.clans,
        castles: state.castles,
        officers: state.officers,
        rng: state.rng,
      }),
    ).toBe(before);
  });
  it('preflights against reserved shadow without gameplay, RNG, intent or order side effects', () => {
    const state = buildTinyState();
    state.clans[CLAN_BETA]!.gold = 400;
    const { sink, shadow, orders } = createAiCommandSink(state);
    const command = {
        type: 'buildFacility' as const,
        clanId: CLAN_BETA,
        castleId: CASTLE_B1,
        facilityTypeId: 'fac.ichi' as never,
      },
      authority = { kind: 'clan' as const, clanId: CLAN_BETA };
    const before = JSON.stringify(state),
      shadowBefore = JSON.stringify(shadow);
    expect(sink.canEnqueue?.(command, authority).ok).toBe(true);
    expect(sink.canEnqueue?.(command, authority).ok).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(shadow)).toBe(shadowBefore);
    expect(orders).toHaveLength(0);
    expect(sink.enqueue(command, authority).ok).toBe(true);
    const logBefore = structuredClone(state.ai.intentLog),
      rngBefore = structuredClone(shadow.rng);
    expect(sink.canEnqueue?.(command, authority).ok).toBe(false);
    expect(state.ai.intentLog).toEqual(logBefore);
    expect(shadow.rng).toEqual(rngBefore);
    expect(orders).toHaveLength(1);
  });
  it('reserves persisted orders before new decisions and preserves real RNG even for random recruitment', () => {
    const state = buildTinyState();
    state.clans[CLAN_BETA]!.gold = 400;
    state.ai.pendingOrders.push({
      command: {
        type: 'buildFacility',
        clanId: CLAN_BETA,
        castleId: CASTLE_B1,
        facilityTypeId: 'fac.ichi' as never,
      },
      authority: { kind: 'clan', clanId: CLAN_BETA },
    });
    const roninId = 'off.test-ronin' as OfficerId;
    state.officers[roninId] = {
      ...state.officers[OFF_BETA_BUSHO]!,
      id: roninId,
      status: 'ronin',
      clanId: null,
      armyId: null,
    };
    const rng = structuredClone(state.rng),
      { sink, orders } = createAiCommandSink(state);
    expect(
      sink.enqueue(
        {
          type: 'buildFacility',
          clanId: CLAN_BETA,
          castleId: CASTLE_B1,
          facilityTypeId: 'fac.heisha' as never,
        },
        { kind: 'clan', clanId: CLAN_BETA },
      ).ok,
    ).toBe(false);
    expect(
      sink.enqueue(
        { type: 'recruitRonin', clanId: CLAN_BETA, officerId: roninId, executorId: OFF_BETA_LORD },
        { kind: 'clan', clanId: CLAN_BETA },
      ).ok,
    ).toBe(true);
    expect(state.rng).toEqual(rng);
    expect(state.officers[roninId].status).toBe('ronin');
    expect(orders).toHaveLength(1);
    expect(state.ai.pendingOrders).toHaveLength(1);
  });
  it('warms transient defensive distances after load even with fresh persisted threat cache', () => {
    const original = buildTinyState();
    original.ai.clans[CLAN_BETA]!.threatCache = computeThreatCache(original, CLAN_BETA);
    const loaded = structuredClone(original);
    expect(cachedTravelDays(loaded, CASTLE_B1, DIST_B1X, CLAN_BETA)).toBeNull();
    warmAiCaches(loaded, [
      {
        type: 'army.enteredTerritory',
        armyId: 'army.fake' as never,
        nodeId: DIST_B1X,
        clanId: CLAN_ALPHA,
        ownerClanId: CLAN_BETA,
      },
    ]);
    expect(cachedTravelDays(loaded, CASTLE_B1, DIST_B1X, CLAN_BETA)).not.toBeNull();
    expect(loaded.ai.clans[CLAN_BETA]!.threatCache?.computedDay).toBe(original.time.day);
  });
  it('bounds and copies intent history and does not use wall time to determine issued orders', () => {
    const state = buildTinyState(),
      { sink } = createAiCommandSink(state);
    const intent: AiIntent = {
      day: state.time.day,
      clanId: CLAN_BETA,
      layer: 'council',
      kind: 'test',
      detail: { value: 1 },
      scores: null,
      commands: [],
    };
    for (let i = 0; i < BAL.aiIntentLogSize + 3; i++) sink.record(intent);
    intent.detail.value = 9;
    expect(state.ai.intentLog).toHaveLength(BAL.aiIntentLogSize);
    expect(state.ai.intentLog[0]?.detail.value).toBe(1);
    const first = buildTinyState(),
      second = structuredClone(first);
    first.ai.clans[CLAN_BETA]!.councilOffset = 0;
    second.ai.clans[CLAN_BETA]!.councilOffset = 0;
    let time = 0;
    const a = runAiSystems(first, [], { now: () => 0 }),
      b = runAiSystems(second, [], { now: () => (time += 1_000_000) });
    expect(a.orders).toEqual(b.orders);
    expect(first.ai).toEqual(second.ai);
    expect(a.elapsedMs).not.toBe(b.elapsedMs);
    expect(first.castles[CASTLE_A2]).toEqual(second.castles[CASTLE_A2]);
  });
});
