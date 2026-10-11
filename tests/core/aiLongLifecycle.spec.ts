import { describe, expect, it } from 'vitest';
import { releaseOfficerAssignments } from '../../src/core/systems/officers';
import { validateState } from '../../src/core/state/invariants';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { advanceDay } from '../../src/core/systems';
import { calendarToDay } from '../../src/core/systems/time';
import { loadS1560Scenario, S1560_LOADED_REGIONS } from '../../src/data/scenarios/s1560';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import type { ClanId, OfficerId, CastleId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

describe('M7 long officer and army lifecycle', () => {
  it('does not appoint a returned incumbent lord to a second castle during release', () => {
    const state = buildTinyState();
    const incumbent = state.officers[OFF_ALPHA_TAISHO]!;
    incumbent.locationCastleId = CASTLE_A1;
    incumbent.rank = 'shukuro';
    expect(validateState(state)).toEqual([]);
    releaseOfficerAssignments(state, OFF_ALPHA_LORD);
    expect(state.castles[CASTLE_A2]!.lordId).toBe(OFF_ALPHA_TAISHO);
    expect(state.castles[CASTLE_A1]!.lordId).toBe(OFF_ALPHA_BUSHO);
    expect(validateState(state)).toEqual([]);
  });

  it('replays the explicit two-region seed1 regression through Yoshitatsu death without duplicating Yoshimichi lordship', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      appVersion: 'simulate',
      seed: 1,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      startDay: calendarToDay(1560, 4, 1),
      // Preserve the original regression's world. Adding real neighboring clans changes AI orders.
      regions: ['tokai', 'kinki'],
    });
    state.ai.allAi = true;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const yoshimichi = 'off.inaba-yoshimichi' as OfficerId,
      ogaki = 'castle.ogaki' as CastleId,
      inabayama = 'castle.inabayama' as CastleId;
    let returnedDay: number | null = null,
      deathDay: number | null = null;
    while (state.time.day < 1261) {
      enqueuePendingAiOrders(state, queue);
      const result = advanceDay(state, queue.drain());
      for (const event of result.events) {
        if (
          event.type === 'army.returned' &&
          event.leaderId === yoshimichi &&
          event.castleId === inabayama
        )
          returnedDay ??= event.day;
        if (event.type === 'officer.died' && event.officerId === 'off.saito-yoshitatsu')
          deathDay = event.day;
      }
      expect(validateState(state), `seed1 day${state.time.day}`).toEqual([]);
      expect(
        result.events.filter((e) => e.type === 'command.rejected'),
        `hardreject day${state.time.day}`,
      ).toEqual([]);
      expect(
        state.ai.intentLog.filter((i) => i.kind === 'error.invalidCommand'),
        `sinkreject day${state.time.day}`,
      ).toEqual([]);
    }
    expect(returnedDay).toBe(111);
    expect(deathDay).toBe(1260);
    expect(state.castles[ogaki]!.lordId).toBe(yoshimichi);
    expect(state.castles[inabayama]!.lordId).not.toBe(yoshimichi);
    expect(Object.values(state.castles).filter((c) => c.lordId === yoshimichi)).toHaveLength(1);
  }, 30000);

  it('keeps the stationary incumbent unique through actual four-region autonomous campaigns and succession', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      appVersion: 'simulate',
      seed: 1,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      startDay: calendarToDay(1560, 4, 1),
      regions: ['tokai', 'kinki', 'kanto', 'koshinetsu'],
    });
    expect(new Set(Object.values(state.provinces).map((province) => province.region))).toEqual(
      new Set(['tokai', 'kinki', 'kanto', 'koshinetsu']),
    );
    state.ai.allAi = true;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const yoshimichi = 'off.inaba-yoshimichi' as OfficerId;
    const easternClans = new Set([
      'clan.hojo',
      'clan.satomi',
      'clan.satake',
      'clan.utsunomiya',
      'clan.yuki',
      'clan.takeda',
      'clan.nagao',
    ]);
    let deathDay: number | null = null;
    let easternDepartures = 0;
    let yoshimichiDepartures = 0;
    let otherArmyReturns = 0;
    let reachedFukashi = false;
    let returnedYoshimichi = false;
    while (state.time.day < 1261) {
      enqueuePendingAiOrders(state, queue);
      const result = advanceDay(state, queue.drain());
      for (const event of result.events) {
        if (event.type === 'army.departed' && easternClans.has(event.clanId)) easternDepartures++;
        if (event.type === 'army.departed' && event.leaderId === yoshimichi) yoshimichiDepartures++;
        if (event.type === 'army.arrived' && event.nodeId === 'castle.fukashi')
          reachedFukashi = true;
        if (event.type === 'army.returned' && event.leaderId === yoshimichi)
          returnedYoshimichi = true;
        if (event.type === 'army.returned' && event.leaderId !== yoshimichi) otherArmyReturns++;
        if (event.type === 'officer.died' && event.officerId === 'off.saito-yoshitatsu')
          deathDay = event.day;
      }
      expect(validateState(state), `four-region seed1 day${state.time.day}`).toEqual([]);
      expect(
        result.events.filter((event) => event.type === 'command.rejected'),
        `four-region hardreject day${state.time.day}`,
      ).toEqual([]);
      expect(
        state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand'),
        `four-region sinkreject day${state.time.day}`,
      ).toEqual([]);
      expect(
        Object.values(state.castles).filter((castle) => castle.lordId === yoshimichi).length,
        `four-region Yoshimichi lordship day${state.time.day}`,
      ).toBeLessThanOrEqual(1);
    }
    // The expanded world genuinely participates; it is not a filtered or idle replacement test.
    expect(easternDepartures).toBeGreaterThan(0);
    expect(reachedFukashi).toBe(true);
    // Current four-region orders never deploy this incumbent. The two-region
    // regression above separately retains the exact earned return on day111.
    expect(yoshimichiDepartures).toBe(0);
    expect(returnedYoshimichi).toBe(false);
    expect(otherArmyReturns).toBeGreaterThan(0);
    expect(deathDay).toBe(1260);
    expect(state.castles['castle.ogaki' as CastleId]!.lordId).toBe(yoshimichi);
    expect(state.castles['castle.inabayama' as CastleId]!.lordId).not.toBe(yoshimichi);
    expect(
      Object.values(state.castles).filter((castle) => castle.lordId === yoshimichi),
    ).toHaveLength(1);
  }, 30000);
  it('keeps every lord assignment unique through genuine five-region autonomous campaigns', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      appVersion: 'five-region-lifecycle',
      seed: 1,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      startDay: calendarToDay(1560, 4, 1),
      regions: ['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku'],
    });
    expect(new Set(Object.values(state.provinces).map((province) => province.region))).toEqual(
      new Set(['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku']),
    );
    state.ai.allAi = true;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const northernClans = new Set(['clan.asakura', 'clan.hatakeyama', 'clan.jinbo']);
    const northernOrders = new Map([...northernClans].map((clanId) => [clanId, 0]));
    let arrivals = 0;
    let successions = 0;
    for (let tick = 0; tick < 720; tick++) {
      enqueuePendingAiOrders(state, queue);
      const result = advanceDay(state, queue.drain());
      for (const { command } of result.appliedCommands) {
        if (
          'clanId' in command &&
          typeof command.clanId === 'string' &&
          northernClans.has(command.clanId)
        )
          northernOrders.set(command.clanId, northernOrders.get(command.clanId)! + 1);
      }
      expect(validateState(state), `five-region day${state.time.day}`).toEqual([]);
      expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand')).toEqual(
        [],
      );
      const lords = Object.values(state.castles).flatMap((castle) =>
        castle.lordId === null ? [] : [castle.lordId],
      );
      expect(new Set(lords).size, `unique lords day${state.time.day}`).toBe(lords.length);
      for (const event of result.events) {
        if (event.type === 'army.arrived') arrivals++;
        if (event.type === 'clan.succession') successions++;
      }
    }
    for (const [clanId, count] of northernOrders) expect(count, clanId).toBeGreaterThan(0);
    expect(arrivals).toBeGreaterThan(0);
    expect(successions).toBeGreaterThan(0);
  }, 30000);

  it.each([
    {
      label: 'B6 fixed-region regression',
      regions: ['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku', 'chugoku'] as const,
    },
    { label: 'current production', regions: S1560_LOADED_REGIONS },
  ])(
    'keeps $label event campaigns legal through720days and succession',
    async ({ label, regions }) => {
      const state = buildGameStateFromScenario(await loadS1560Scenario(), {
        appVersion: 'production-lifecycle',
        seed: 1,
        playerClanId: 'clan.oda' as ClanId,
        difficulty: 'normal',
        startDay: calendarToDay(1560, 4, 1),
        regions,
      });
      expect(new Set(Object.values(state.provinces).map((province) => province.region))).toEqual(
        new Set(regions),
      );
      const engine = await loadScenarioEventEngine(state.meta.scenarioId);
      state.ai.allAi = true;
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      const participatingClans = new Set([
        'clan.mori',
        'clan.amago',
        'clan.uragami',
        'clan.akamatsu',
        'clan.yamana',
      ]);
      const orders = new Map([...participatingClans].map((clanId) => [clanId, 0]));
      let arrivals = 0;
      let successions = 0;
      let firedEvents = 0;
      for (let tick = 0; tick < 720; tick++) {
        enqueuePendingAiOrders(state, queue);
        const result = advanceDay(state, queue.drain(), { eventEngine: engine });
        for (const { command } of result.appliedCommands) {
          if (
            'clanId' in command &&
            typeof command.clanId === 'string' &&
            participatingClans.has(command.clanId)
          )
            orders.set(command.clanId, orders.get(command.clanId)! + 1);
        }
        expect(validateState(state), `${label} day${state.time.day}`).toEqual([]);
        expect(
          result.events.filter((event) => event.type === 'command.rejected'),
          `${label} hardreject day${state.time.day}`,
        ).toEqual([]);
        expect(
          state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand'),
          `${label} sinkreject day${state.time.day}`,
        ).toEqual([]);
        const lords = Object.values(state.castles).flatMap((castle) =>
          castle.lordId === null ? [] : [castle.lordId],
        );
        expect(new Set(lords).size, `${label} unique lords day${state.time.day}`).toBe(
          lords.length,
        );
        for (const event of result.events) {
          if (event.type === 'army.arrived') arrivals++;
          if (event.type === 'clan.succession') successions++;
          if (event.type === 'event.fired') firedEvents++;
        }
      }
      for (const [clanId, count] of orders) expect(count, clanId).toBeGreaterThan(0);
      expect(arrivals).toBeGreaterThan(0);
      expect(successions).toBeGreaterThan(0);
      expect(firedEvents).toBeGreaterThan(0);
    },
    30000,
  );
});
