import { describe, expect, it } from 'vitest';
import { buildMonthSummaryView } from '../../src/ui/reports/monthSummary';
import { renderReport } from '../../src/ui/reports/renderReport';
import { economySystem } from '../../src/core/systems/economy';
import type { MonthOpeningSettlement } from '../../src/core/systems/monthOpeningSettlement';
import { BAL } from '../../src/core/balance';
import { garrisonFoodMonthly } from '../../src/core/domestic';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState, Report } from '../../src/core/state/gameState';
import type { ArmyId, CorpsId, ReportId, SiegeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function opening(state: GameState): MonthOpeningSettlement {
  let result: MonthOpeningSettlement | undefined;
  economySystem(state, (snapshot) => {
    result = snapshot;
  });
  if (result === undefined) throw new Error('fixture must be at month opening');
  return result;
}
function report(id: number, event: GameEvent): Report {
  return { id: `rep.${id}` as ReportId, day: event.day, event, read: false };
}
function departure(day: number): GameEvent {
  return {
    type: 'army.departed',
    day,
    clanIds: [CLAN_ALPHA],
    clanId: CLAN_ALPHA,
    armyId: 'army.deleted' as ArmyId,
    leaderId: OFF_ALPHA_LORD,
    originCastleId: CASTLE_A1,
    targetNodeId: CASTLE_B1,
  };
}

describe('pure month-opening summary projection', () => {
  it('copies actual partial salary paid, not salary due or a fabricated full-month delta', () => {
    const game = buildTinyState();
    for (const district of Object.values(game.districts)) district.commerce = 0;
    game.clans[CLAN_ALPHA]!.gold = 2;
    const snapshot = opening(game),
      view = buildMonthSummaryView(game, snapshot);
    expect(view.settlement).toEqual(snapshot.clans.find((row) => row.clanId === CLAN_ALPHA));
    expect(view.settlement?.salaryPaid).toBe(2);
    expect(view.settlement!.salaryDue).toBeGreaterThan(view.settlement!.salaryPaid);
    expect(view.settlement!.goldAfter).toBe(0);
    expect(view.reportsMayBeIncomplete).toBe(true);
  });

  it('preserves separate corps and tribute flows without adding either twice to wallet income', () => {
    const game = buildTinyState(),
      id = 'corps.summary' as CorpsId;
    game.corps[id] = {
      id,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_TAISHO,
      directive: 'hold',
      targetNodeId: null,
      gold: 0,
      createdDay: game.time.day,
    };
    game.castles[CASTLE_A2]!.corpsId = id;
    ensureDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'vassal',
      startDay: game.time.day,
      endDay: null,
      vassalClanId: CLAN_BETA,
    });
    const view = buildMonthSummaryView(game, opening(game)),
      row = view.settlement!;
    expect(row.retainedCorpsGold).toBeGreaterThan(0);
    expect(row.tributeReceived).toBeGreaterThan(0);
    expect(row.goldAfter - row.goldBefore).toBe(
      row.incomeGold + row.tributeReceived - row.tributePaid - row.salaryPaid - row.policyPaid,
    );
    expect(row.goldAfter).toBe(game.clans[CLAN_ALPHA]!.gold);
  });

  it('returns a missing player settlement as null instead of inventing zero actual flows', () => {
    const game = buildTinyState(),
      snapshot = opening(game);
    const view = buildMonthSummaryView(game, {
      ...snapshot,
      clans: snapshot.clans.filter((row) => row.clanId !== CLAN_ALPHA),
    });
    expect(view.settlement).toBeNull();
    expect(view.foodStock).toBeGreaterThan(0);
  });

  it('forecasts current owned garrison plus deployed army consumption and excludes carried food from castle stock', () => {
    const game = buildTinyState(),
      snapshot = opening(game);
    const command = {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_BUSHO,
      deputyIds: [],
      soldiers: 200,
      food: Math.ceil(200 * BAL.fieldFoodPerSoldierDaily * 30),
      targetNodeId: CASTLE_A2,
    };
    expect(validateMarch(game, command).ok).toBe(true);
    applyMarch(game, command, () => {});
    const view = buildMonthSummaryView(game, snapshot);
    const owned = Object.values(game.castles).filter((castle) => castle.ownerClanId === CLAN_ALPHA);
    const garrisons = owned.reduce((sum, castle) => sum + garrisonFoodMonthly(game, castle), 0);
    expect(view.foodStock).toBe(owned.reduce((sum, castle) => sum + castle.food, 0));
    expect(view.foodForecast).toBe(
      garrisons + command.soldiers * BAL.fieldFoodPerSoldierDaily * 30,
    );
    expect(view.foodForecast).toBeGreaterThan(garrisons);
  });

  it('groups available incoming-month retained reports by relevance, category and canonical severity chronologically', () => {
    const game = buildTinyState(),
      snapshot = opening(game),
      day = snapshot.day;
    const events: GameEvent[] = [
      departure(day),
      {
        type: 'officer.promoted',
        day,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        officerId: OFF_ALPHA_BUSHO,
        newRank: 'busho',
      },
      {
        type: 'siege.started',
        day,
        clanIds: [CLAN_BETA],
        attackerClanId: CLAN_BETA,
        castleId: CASTLE_B1,
        siegeId: 'siege.other' as SiegeId,
      },
      {
        type: 'court.mediationResult',
        day,
        clanIds: [CLAN_BETA],
        clanId: CLAN_BETA,
        targetClanId: CLAN_BETA,
        success: false,
        ceasefireMonths: 0,
      },
      {
        type: 'economy.income',
        day,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        gold: 99,
        foodByCastle: {},
      },
      {
        type: 'economy.upkeepUnpaid',
        day,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        payeeIds: [],
      },
      {
        type: 'pact.signed',
        day,
        clanIds: [CLAN_BETA],
        aClanId: CLAN_BETA,
        bClanId: CLAN_BETA,
        kind: 'alliance',
        endDay: day + 30,
      },
      departure(day - 1),
      departure(day + 1),
      {
        type: 'officer.promoted',
        day,
        clanIds: [CLAN_BETA],
        clanId: CLAN_BETA,
        officerId: OFF_ALPHA_BUSHO,
        newRank: 'busho',
      },
    ];
    // Synthetic reporting-only fixtures test category/severity selection, not valid historical diplomacy.
    game.reports = events
      .map((event, index) => report(index === 0 ? 2 : index === 1 ? 10 : index + 20, event))
      .reverse();
    const view = buildMonthSummaryView(game, snapshot);
    expect(view.domestic.map((row) => row.id)).toEqual(['rep.2', 'rep.10']);
    expect(view.world.map((row) => row.id)).toEqual(['rep.22', 'rep.23']);
    for (const row of [...view.domestic, ...view.world]) {
      expect(row.text).toBe(
        renderReport(game.reports.find((item) => item.id === row.id)!.event, game),
      );
    }
  });

  it('does not surface covert foreign plot reports', () => {
    const game = buildTinyState(),
      snapshot = opening(game);
    game.reports = [
      report(1, {
        type: 'plot.failed',
        day: snapshot.day,
        clanIds: [],
        actorClanId: CLAN_BETA,
        targetClanId: CLAN_BETA,
        targetCastleId: null,
        targetOfficerId: null,
        kind: 'poach',
      }),
    ];
    expect(buildMonthSummaryView(game, snapshot).world).toEqual([]);
  });

  it('sorts by ascending date before sequence and excludes the previous month', () => {
    const game = buildTinyState(),
      snapshot = opening(game);
    game.reports = [
      report(1, departure(snapshot.day + 1)),
      report(100, departure(snapshot.day)),
      report(200, departure(snapshot.day - 1)),
    ];
    // Presentation-only later capture probes chronological ordering; normal month opening is day 1.
    const view = buildMonthSummaryView(game, { ...snapshot, day: snapshot.day + 1 });
    expect(view.domestic.map((row) => row.id)).toEqual(['rep.100', 'rep.1']);
  });

  it('is detached and never writes read flags, settlement input, canonical state or RNG', () => {
    const game = buildTinyState(),
      snapshot = opening(game);
    game.reports = [report(2, departure(snapshot.day))];
    const stateBefore = canonicalStringify(game),
      openingBefore = structuredClone(snapshot);
    const view = buildMonthSummaryView(game, snapshot);
    expect(canonicalStringify(game)).toBe(stateBefore);
    expect(snapshot).toEqual(openingBefore);
    expect(view.settlement).not.toBe(snapshot.clans[0]);
    expect(Object.isFrozen(view.domestic)).toBe(true);
    expect(Object.isFrozen(view.settlement)).toBe(true);
    const originalText = view.domestic[0]!.text;
    (snapshot.clans[0] as unknown as { goldAfter: number }).goldAfter = -1;
    game.reports[0]!.read = true;
    game.clans[CLAN_ALPHA]!.name = '改名';
    expect(view.settlement!.goldAfter).toBe(openingBefore.clans[0]!.goldAfter);
    expect(view.domestic[0]!.text).toBe(originalText);
    expect(view.key).toBe(`${CLAN_ALPHA}:${snapshot.day}`);
  });
});
