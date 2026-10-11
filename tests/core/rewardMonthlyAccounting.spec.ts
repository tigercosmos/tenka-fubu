import { describe, expect, it } from 'vitest';
import { CommandQueue, applyCommands } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from '../../src/core/systems/officers';
import { advanceDay } from '../../src/core/systems';
import { calendarToDay } from '../../src/core/systems/time';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, OFF_ALPHA_BUSHO } from '../fixtures/tiny';

function fixture(known: number | null = 0) {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth = known;
  expect(validateState(state)).toEqual([]);
  return state;
}

function reward(tier: 'small' | 'medium' | 'large' = 'small') {
  return { type: 'rewardOfficer' as const, clanId: CLAN_ALPHA, officerId: OFF_ALPHA_BUSHO, tier };
}

describe('actual monthly reward gold accounting', () => {
  it.each([0, 123, null])('counts only settled costs with prior accounting %s', (known) => {
    const state = fixture(known);
    const before = structuredClone(state);
    const queue = new CommandQueue();
    const small = reward();
    const medium = reward('medium');
    expect(validateCommand(state, small)).toEqual({ ok: true });
    expect(validateCommand(state, medium)).toEqual({ ok: true });
    queue.enqueue(small, state.time.day);
    queue.enqueue(medium, state.time.day);
    expect(state).toEqual(before);
    const expected = structuredClone(state);
    const officer = expected.officers[OFF_ALPHA_BUSHO]!;
    for (const tier of ['small', 'medium'] as const) {
      expected.clans[CLAN_ALPHA]!.gold -= rewardOfficerCost(tier);
      officer.loyalty = Math.min(100, officer.loyalty + rewardOfficerLoyaltyGain(officer, tier));
      officer.rewardGiftsThisYear += 1;
    }
    expected.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth =
      known === null ? null : known + rewardOfficerCost('small') + rewardOfficerCost('medium');
    expected.meta.lastAppliedCmdSeq = 2;
    const events: GameEvent[] = [];
    expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toHaveLength(2);
    expect(state).toEqual(expected);
    expect(state.rng).toEqual(before.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('does not account a rejected queued reward or change unrelated state', () => {
    const state = fixture(123);
    state.clans[CLAN_ALPHA]!.gold = 0;
    const before = structuredClone(state);
    expect(validateCommand(state, reward()).ok).toBe(false);
    const queue = new CommandQueue();
    queue.enqueue(reward(), state.time.day);
    expect(state).toEqual(before);
    const events: GameEvent[] = [];
    expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toEqual([]);
    const expected = structuredClone(before);
    expected.meta.lastAppliedCmdSeq = 1;
    expect(state).toEqual(expected);
    expect(events.some((event) => event.type === 'command.rejected')).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('keeps the known total through an ordinary actual day', () => {
    const state = fixture(123);
    const queue = new CommandQueue();
    queue.enqueue(reward(), state.time.day);
    const result = advanceDay(state, queue.drain());
    expect(result.appliedCommands).toHaveLength(1);
    expect(result.events.some((event) => event.type === 'time.monthStart')).toBe(false);
    expect(state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth).toBe(
      123 + rewardOfficerCost('small'),
    );
    expect(state.clans[CLAN_BETA]!.rewardGoldSpentThisMonth).toBe(0);
    expect(validateState(state)).toEqual([]);
  });

  it('does not treat a deferred month-start report as a new calendar boundary', () => {
    const state = fixture(123);
    state.clans[CLAN_BETA]!.rewardGoldSpentThisMonth = null;
    state.meta.deferredEvents.push({
      type: 'time.monthStart',
      day: state.time.day,
      clanIds: [],
      year: state.time.year,
      month: state.time.month,
    });
    expect(validateState(state)).toEqual([]);
    const result = advanceDay(state, []);
    expect(result.events.some((event) => event.type === 'time.monthStart')).toBe(true);
    expect(state.time.dayOfMonth).toBe(2);
    expect(state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth).toBe(123);
    expect(state.clans[CLAN_BETA]!.rewardGoldSpentThisMonth).toBeNull();
    expect(state.meta.deferredEvents).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it.each([4, 12])(
    'settles old-month commands before resetting every clan at month %s boundary',
    (month) => {
      const state = fixture(123);
      state.clans[CLAN_BETA]!.rewardGoldSpentThisMonth = null;
      state.time = {
        ...state.time,
        day: calendarToDay(1560, month, 30),
        year: 1560,
        month,
        dayOfMonth: 30,
      };
      expect(validateState(state)).toEqual([]);
      const queue = new CommandQueue();
      queue.enqueue(reward(), state.time.day);
      let calls = 0;
      let afterCommands: number | null | undefined;
      let afterTime: (number | null)[] = [];
      // Observe real step boundaries through the existing clock port; constant zero is not a benchmark.
      const result = advanceDay(state, queue.drain(), {
        now: () => {
          calls += 1;
          if (calls === 3) afterCommands = state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth;
          if (calls === 5)
            afterTime = Object.values(state.clans).map((clan) => clan.rewardGoldSpentThisMonth);
          return 0;
        },
      });
      expect(result.appliedCommands).toHaveLength(1);
      expect(afterCommands).toBe(123 + rewardOfficerCost('small'));
      expect(afterTime).toEqual([0, 0]);
      expect(Object.values(state.clans).every((clan) => clan.rewardGoldSpentThisMonth === 0)).toBe(
        true,
      );
      expect(result.events.some((event) => event.type === 'time.monthStart')).toBe(true);
      expect(state.time.dayOfMonth).toBe(1);
      expect(state.time.year).toBe(month === 12 ? 1561 : 1560);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('resets both known and legacy-unknown totals at an actual month opening without rewards', () => {
    const state = fixture(123);
    state.clans[CLAN_BETA]!.rewardGoldSpentThisMonth = null;
    state.time = {
      ...state.time,
      day: calendarToDay(1560, 4, 30),
      year: 1560,
      month: 4,
      dayOfMonth: 30,
    };
    expect(validateState(state)).toEqual([]);
    advanceDay(state, []);
    expect(Object.values(state.clans).map((clan) => clan.rewardGoldSpentThisMonth)).toEqual([0, 0]);
    expect(validateState(state)).toEqual([]);
  });
});
