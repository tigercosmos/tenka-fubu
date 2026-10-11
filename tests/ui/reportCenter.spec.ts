import { describe, expect, it } from 'vitest';
import { UI } from '../../src/ui/uiConstants';
import type { GameEvent } from '../../src/core/state/events';
import type { Report } from '../../src/core/state/gameState';
import type {
  ArmyId,
  EventId,
  MapNodeId,
  ReportId,
  SiegeId,
  TaimeiId,
} from '../../src/core/state/ids';
import { calendarToDay } from '../../src/core/systems/time';
import { renderReport } from '../../src/ui/reports/renderReport';
import { REPORT_CATEGORIES, selectReportCenter } from '../../src/ui/reports/reportCenter';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  DIST_A1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function report(id: number | string, event: GameEvent, read = false): Report {
  return { id: `rep.${id}` as ReportId, day: event.day, event, read };
}
function rejected(day: number): GameEvent {
  return {
    type: 'command.rejected',
    day,
    clanIds: [CLAN_ALPHA],
    commandType: 'march',
    reasonKey: 'cmd.reject.notOwner',
    params: {},
  };
}
function departed(day: number): GameEvent {
  return {
    type: 'army.departed',
    day,
    clanIds: [CLAN_ALPHA],
    armyId: 'army.deleted' as ArmyId,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    targetNodeId: CASTLE_A2,
    leaderId: OFF_ALPHA_LORD,
  };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('pure retained report-center selector', () => {
  it('renders all six domains using the authoritative report renderer and injected catalog titles', () => {
    const state = buildTinyState(),
      base = { day: 90, clanIds: [CLAN_ALPHA] };
    const events: GameEvent[] = [
      { ...base, type: 'economy.income', clanId: CLAN_ALPHA, gold: 10, foodByCastle: {} },
      departed(90),
      {
        ...base,
        type: 'pact.signed',
        aClanId: CLAN_ALPHA,
        bClanId: CLAN_BETA,
        kind: 'alliance',
        endDay: 180,
      },
      {
        ...base,
        type: 'officer.promoted',
        officerId: OFF_ALPHA_LORD,
        clanId: CLAN_ALPHA,
        newRank: 'busho',
      },
      {
        ...base,
        type: 'taimei.invoked',
        clanId: CLAN_ALPHA,
        taimeiId: 'taimei.teppeki' as TaimeiId,
      },
      rejected(90),
    ];
    state.reports = events.map((event, index) => report(index, event));
    const before = structuredClone(state),
      result = selectReportCenter(state);
    expect(result.total).toBe(6);
    expect(new Set(result.rows.map((row) => row.category))).toEqual(
      new Set(['domestic', 'military', 'diplomacy', 'personnel', 'event', 'system']),
    );
    for (const row of result.rows) {
      const source = state.reports.find((item) => item.id === row.id)!;
      expect(row.text).toBe(renderReport(source.event, state));
    }
    const eventId = 'evt.catalog-title' as EventId;
    state.reports = [report(7, { ...base, type: 'event.fired', eventId, hasChoice: false })];
    const injected = selectReportCenter(state, {}, 1, {
      eventTitle: (id) => (id === eventId ? '目錄中的史實標題' : undefined),
    });
    expect(injected.rows[0]!.text).toContain('目錄中的史實標題');
    expect(injected.rows[0]!.text).not.toContain(eventId);
    expect(selectReportCenter(state).rows[0]!.text).toContain(eventId);
    state.reports = before.reports;
    expect(state).toEqual(before);
  });
  it('explicitly maps every domain including disambiguated clans, proposals, plots and taimei', () => {
    expect(new Set(Object.values(REPORT_CATEGORIES))).toEqual(
      new Set(['domestic', 'military', 'diplomacy', 'personnel', 'event', 'system']),
    );
    expect(REPORT_CATEGORIES['economy.income']).toBe('domestic');
    expect(REPORT_CATEGORIES['transport.looted']).toBe('domestic');
    expect(REPORT_CATEGORIES['district.subjugated']).toBe('military');
    expect(REPORT_CATEGORIES['army.returned']).toBe('military');
    expect(REPORT_CATEGORIES['pact.broken']).toBe('diplomacy');
    expect(REPORT_CATEGORIES['court.mediationResult']).toBe('diplomacy');
    expect(REPORT_CATEGORIES['plot.succeeded']).toBe('diplomacy');
    expect(REPORT_CATEGORIES['clan.succession']).toBe('personnel');
    expect(REPORT_CATEGORIES['proposal.submitted']).toBe('personnel');
    expect(REPORT_CATEGORIES['officer.died']).toBe('personnel');
    expect(REPORT_CATEGORIES['taimei.invoked']).toBe('event');
    expect(REPORT_CATEGORIES['event.fired']).toBe('event');
    expect(REPORT_CATEGORIES['clan.destroyed']).toBe('system');
    expect(REPORT_CATEGORIES['time.monthStart']).toBe('system');
    expect(REPORT_CATEGORIES['command.rejected']).toBe('system');
    expect(Object.isFrozen(REPORT_CATEGORIES)).toBe(true);
  });
  it('suppresses renderer-null events before totals/pagination and never edits retained reports or read flags', () => {
    const state = buildTinyState();
    state.reports = [
      report(1, departed(90), true),
      report(2, rejected(91)),
      report(3, {
        type: 'conscript.completed',
        day: 92,
        clanIds: [CLAN_ALPHA],
        castleId: CASTLE_A1,
        soldiers: 100,
      }),
    ];
    const before = structuredClone(state);
    freeze(state);
    const result = selectReportCenter(state);
    expect(result.total).toBe(2);
    expect(result.rows.map((row) => row.id)).toEqual(['rep.2', 'rep.1']);
    expect(result.rows[1]!.text).toBe(renderReport(state.reports[0]!.event, state));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
    expect(state).toEqual(before);
  });
  it('filters exact category selections and warning-or-critical importance using current player perspective', () => {
    const state = buildTinyState();
    state.reports = [
      report(1, departed(90)),
      report(2, rejected(91)),
      report(3, {
        type: 'siege.started',
        day: 92,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        siegeId: 'siege.removed' as SiegeId,
        castleId: CASTLE_A1,
        attackerClanId: CLAN_BETA,
      }),
    ];
    expect(
      selectReportCenter(state, { importantOnly: true }).rows.map((row) => row.severity),
    ).toEqual(['critical', 'warning']);
    expect(
      selectReportCenter(state, { categories: ['military'] }).rows.map((row) => row.id),
    ).toEqual(['rep.3', 'rep.1']);
    expect(
      selectReportCenter(state, { categories: ['military'], importantOnly: true }).rows.map(
        (row) => row.id,
      ),
    ).toEqual(['rep.3']);
    expect(selectReportCenter(state, { categories: [] }).total).toBe(0);
  });
  it('includes the entire selected start/end months across a year boundary and handles one-sided limits', () => {
    const state = buildTinyState();
    const dates = [
      [1560, 11, 30],
      [1560, 12, 1],
      [1560, 12, 30],
      [1561, 1, 1],
      [1561, 1, 30],
      [1561, 2, 1],
    ] as const;
    state.reports = dates.map(([year, month, day], index) =>
      report(index, rejected(calendarToDay(year, month, day))),
    );
    const filters = { startMonth: { year: 1560, month: 12 }, endMonth: { year: 1561, month: 1 } };
    expect(selectReportCenter(state, filters).rows.map((row) => row.id)).toEqual([
      'rep.4',
      'rep.3',
      'rep.2',
      'rep.1',
    ]);
    expect(selectReportCenter(state, { startMonth: filters.startMonth }).total).toBe(5);
    expect(selectReportCenter(state, { endMonth: filters.endMonth }).total).toBe(5);
    expect(
      selectReportCenter(state, { startMonth: filters.endMonth, endMonth: filters.startMonth })
        .total,
    ).toBe(0);
    expect(selectReportCenter(state, { startMonth: { year: 1560, month: 0 } }).total).toBe(0);
    expect(selectReportCenter(state, { endMonth: { year: NaN, month: 1 } }).total).toBe(0);
  });
  it('orders newest day first then numeric report sequence, independently of input order and decimal ID width', () => {
    const state = buildTinyState();
    state.reports = [
      report(9, rejected(90)),
      report(1000000, rejected(90)),
      report(999999, rejected(90)),
      report('legacy-a', rejected(89)),
      report('legacy-z', rejected(89)),
      report(1, rejected(91)),
    ];
    expect(selectReportCenter(state).rows.map((row) => row.id)).toEqual([
      'rep.1',
      'rep.1000000',
      'rep.999999',
      'rep.9',
      'rep.legacy-z',
      'rep.legacy-a',
    ]);
    const expected = selectReportCenter(state);
    state.reports.reverse();
    expect(selectReportCenter(state)).toEqual(expected);
    state.reports = [
      report('2a', rejected(90)),
      report(9, rejected(90)),
      report(1000000, rejected(90)),
    ];
    const ids = ['rep.1000000', 'rep.9', 'rep.2a'];
    expect(selectReportCenter(state).rows.map((row) => row.id)).toEqual(ids);
    state.reports.reverse();
    expect(selectReportCenter(state).rows.map((row) => row.id)).toEqual(ids);
  });
  it('pages by the canonical size and clamps empty, negative, excessive, fractional and nonfinite requests', () => {
    const state = buildTinyState();
    const count = 2 * UI.uiReportPageSize + 3;
    state.reports = Array.from({ length: count }, (_, index) => report(index, rejected(index)));
    expect(selectReportCenter(state).rows).toHaveLength(UI.uiReportPageSize);
    expect(selectReportCenter(state, {}, 2).rows).toHaveLength(UI.uiReportPageSize);
    expect(selectReportCenter(state, {}, 3)).toMatchObject({ total: count, page: 3, pageCount: 3 });
    expect(selectReportCenter(state, {}, 999).rows).toHaveLength(3);
    expect(selectReportCenter(state, {}, -1).page).toBe(1);
    expect(selectReportCenter(state, {}, 2.8).page).toBe(2);
    expect(selectReportCenter(state, {}, NaN).page).toBe(1);
    expect(selectReportCenter(state, {}, Infinity).page).toBe(1);
    state.reports = [];
    expect(selectReportCenter(state, {}, 9)).toEqual({ total: 0, page: 1, pageCount: 1, rows: [] });
  });
  it('resolves exact snapshot castle/district/node coordinates even after transient armies/battles disappear', () => {
    const state = buildTinyState();
    state.reports = [
      report(1, departed(90)),
      report(2, {
        type: 'district.subjugated',
        day: 91,
        clanIds: [CLAN_ALPHA],
        districtId: DIST_A1X,
        fromClanId: CLAN_BETA,
        toClanId: CLAN_ALPHA,
        armyId: 'army.removed' as ArmyId,
        leaderId: OFF_ALPHA_LORD,
      }),
      report(3, {
        type: 'battle.ended',
        day: 92,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        battleId: 'fc.removed',
        winnerClanId: CLAN_ALPHA,
        aweLevel: 'none',
        attackerLosses: 100,
        defenderLosses: 100,
        nodeId: CASTLE_A2,
        attackerClanId: CLAN_ALPHA,
        defenderClanId: CLAN_BETA,
      }),
    ];
    const rows = selectReportCenter(state).rows;
    expect(rows.map((row) => row.destination)).toEqual([
      { nodeId: CASTLE_A2, ...state.castles[CASTLE_A2]!.pos },
      { nodeId: DIST_A1X, ...state.districts[DIST_A1X]!.pos },
      { nodeId: CASTLE_A1, ...state.castles[CASTLE_A1]!.pos },
    ]);
    expect(Object.isFrozen(rows[0]!.destination)).toBe(true);
  });
  it('never guesses historical destinations from current army/officer/battle locations, missing IDs, or ambiguous awe', () => {
    const state = buildTinyState();
    state.reports = [
      report(1, {
        type: 'army.starving',
        day: 90,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        armyId: 'army.missing' as ArmyId,
        leaderId: OFF_ALPHA_LORD,
      }),
      report(2, {
        type: 'battle.kassenAvailable',
        day: 91,
        clanIds: [CLAN_ALPHA],
        battleId: 'battle.removed',
      }),
      report(3, {
        type: 'army.arrived',
        day: 92,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        armyId: 'army.removed' as ArmyId,
        leaderId: OFF_ALPHA_LORD,
        nodeId: 'castle.missing' as MapNodeId,
      }),
      report(4, {
        type: 'awe.triggered',
        day: 93,
        clanIds: [CLAN_ALPHA],
        sourceBattleId: 'battle.current',
        clanId: CLAN_ALPHA,
        level: 'large',
        flippedDistrictIds: [DIST_A1X],
        affectedCastleIds: [CASTLE_A1, CASTLE_A2],
      }),
    ];
    expect(selectReportCenter(state).rows.every((row) => row.destination === null)).toBe(true);
  });
});
