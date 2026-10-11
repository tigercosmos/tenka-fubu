import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import {
  computeThreatCache,
  getThreatCache,
  invalidateThreatCaches,
} from '../../src/core/systems/ai/threat';
import {
  estCastlePower,
  estArmyPower,
  planMarchFromCastle,
  boundedTravelDays,
  travelDays,
  cachedTravelDays,
  nodesWithin,
} from '../../src/core/systems/ai/shared';
import { aiScenario, validatingSink } from '../helpers/aiScenario';
import { CLAN_ALPHA, CLAN_BETA, CASTLE_A1, CASTLE_A2, CASTLE_B1 } from '../fixtures/tiny';

describe('M7 power and border threats', () => {
  it('evicts threat and route estimates only when awe actually flips district ownership', () => {
    const { state } = aiScenario();
    const first = getThreatCache(state, CLAN_ALPHA);
    const event = {
      type: 'awe.triggered' as const,
      day: state.time.day,
      clanIds: [CLAN_ALPHA, CLAN_BETA],
      clanId: CLAN_ALPHA,
      level: 'large' as const,
      sourceBattleId: 'fc.test',
      flippedDistrictIds: [],
      affectedCastleIds: [],
    };
    travelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA);
    invalidateThreatCaches(state, [event]);
    expect(getThreatCache(state, CLAN_ALPHA)).toBe(first);
    expect(cachedTravelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA)).not.toBeNull();
    const district = state.districts[state.castles[CASTLE_B1]!.districtIds[0]!]!;
    district.ownerClanId = CLAN_ALPHA;
    invalidateThreatCaches(state, [{ ...event, flippedDistrictIds: [district.id] }]);
    expect(state.ai.clans[CLAN_ALPHA]!.threatCache).toBeNull();
    expect(cachedTravelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA)).toBeNull();
  });
  it('uses exact cheap power and relation multipliers without modifying sparse diplomacy', () => {
    const { state } = aiScenario(),
      castle = state.castles[CASTLE_B1]!;
    expect(estCastlePower(state, castle)).toBeCloseTo(
      (castle.soldiers *
        (1 + state.officers[castle.lordId!]!.ldr / BAL.aiPowerLdrDivisor) *
        castle.morale) /
        100,
    );
    const neutral = computeThreatCache(state, CLAN_ALPHA);
    expect(neutral.entries).toHaveLength(1);
    expect(neutral.entries[0]!.relationFactor).toBe(1);
    expect(Object.keys(state.diplomacy.rows)).toHaveLength(0);
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.lastHostileDay = state.time.day;
    expect(computeThreatCache(state, CLAN_ALPHA).entries[0]!.threat).toBeCloseTo(
      neutral.totalThreat * 1.5,
    );
    row.pacts.push({
      kind: 'ceasefire',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    expect(computeThreatCache(state, CLAN_ALPHA).entries[0]!.relationFactor).toBe(0.6);
    row.pacts[0]!.kind = 'alliance';
    expect(computeThreatCache(state, CLAN_ALPHA).entries[0]!.relationFactor).toBe(0.2);
  });
  it('includes enemy armies invading our territory and never adds our field armies to border defense', () => {
    const { state, scope } = aiScenario();
    const initial = computeThreatCache(state, CLAN_BETA);
    const command = planMarchFromCastle(state, scope, state.castles[CASTLE_A1]!, CASTLE_B1)!;
    const q = validatingSink(state);
    expect(q.sink.enqueue(command, { kind: 'clan', clanId: CLAN_ALPHA }).ok).toBe(true);
    q.flush();
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = CASTLE_B1;
    const invading = computeThreatCache(state, CLAN_BETA);
    const powerLoss =
      initial.entries[0]!.borderPowerEnemy -
      computeThreatCache({ ...state, armies: {} }, CLAN_BETA).entries[0]!.borderPowerEnemy;
    expect(invading.entries[0]!.borderPowerEnemy).toBeCloseTo(
      initial.entries[0]!.borderPowerEnemy - powerLoss + estArmyPower(state, army),
    );
    expect(invading.entries[0]!.borderPowerOurs).toBe(initial.entries[0]!.borderPowerOurs);
  });
  it('reuses cache through day10 and invalidates day11 or event before TTL', () => {
    const { state } = aiScenario();
    const first = getThreatCache(state, CLAN_ALPHA);
    state.time.day += BAL.aiThreatCacheDays;
    expect(getThreatCache(state, CLAN_ALPHA)).toBe(first);
    state.time.day++;
    expect(getThreatCache(state, CLAN_ALPHA)).not.toBe(first);
    invalidateThreatCaches(state, [
      {
        type: 'pact.signed',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        aClanId: CLAN_ALPHA,
        bClanId: CLAN_BETA,
        kind: 'alliance',
        endDay: null,
      },
    ]);
    expect(state.ai.clans[CLAN_ALPHA]!.threatCache).toBeNull();
    getThreatCache(state, CLAN_ALPHA);
    invalidateThreatCaches(state, [
      {
        type: 'siege.ended',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        siegeId: 'siege.test' as never,
        castleId: CASTLE_B1,
        fallen: true,
        newOwnerClanId: CLAN_ALPHA,
      },
    ]);
    expect(state.ai.clans[CLAN_ALPHA]!.threatCache).toBeNull();
  });
  it('bounded routing agrees with canonical routing and excludes out-of-budget destinations', () => {
    const { state } = aiScenario();
    const days = travelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA);
    expect(boundedTravelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, days)).toBe(days);
    expect(boundedTravelDays(state, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, days - 0.5)).toBe(Infinity);
    expect(nodesWithin(state, [CASTLE_A1], 0)).toEqual(new Set([CASTLE_A1]));
  });
});
