import type { GameState, Report } from '@core/state/gameState';
import type { ReportId } from '@core/state/ids';
import { selectBudgetForecast } from '@core/state/selectors';
import { dayToCalendar, severityOf } from '@core/index';
import type { ClanMonthOpeningSettlement, MonthOpeningSettlement } from '@core/index';
import { REPORT_CATEGORIES } from './reportCenter';
import { renderReport, type ReportPresentationOptions } from './renderReport';

export interface MonthSummaryReportRow {
  readonly id: ReportId;
  readonly day: number;
  readonly text: string;
}

/** Transient opening-month presentation, not a historical monthly ledger. */
export interface MonthSummaryView {
  readonly key: string;
  readonly day: number;
  readonly year: number;
  readonly month: number;
  readonly settlement: ClanMonthOpeningSettlement | null;
  readonly foodStock: number;
  /** Current monthly consumption forecast: garrisons plus deployed armies, not a past delta. */
  readonly foodForecast: number;
  readonly domestic: readonly MonthSummaryReportRow[];
  readonly world: readonly MonthSummaryReportRow[];
  readonly reportsMayBeIncomplete: boolean;
}

function chronological(a: Readonly<Report>, b: Readonly<Report>): number {
  if (a.day !== b.day) return a.day - b.day;
  const aMatch = /^rep\.(\d+)$/u.exec(a.id),
    bMatch = /^rep\.(\d+)$/u.exec(b.id);
  const aNumber = aMatch === null ? null : Number(aMatch[1]);
  const bNumber = bMatch === null ? null : Number(bMatch[1]);
  const aSerial = aNumber !== null && Number.isSafeInteger(aNumber) ? aNumber : null;
  const bSerial = bNumber !== null && Number.isSafeInteger(bNumber) ? bNumber : null;
  if (aSerial !== null && bSerial !== null && aSerial !== bSerial) return aSerial - bSerial;
  if (aSerial !== null && bSerial === null) return -1;
  if (aSerial === null && bSerial !== null) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildMonthSummaryView(
  game: Readonly<GameState>,
  opening: Readonly<MonthOpeningSettlement>,
  options: ReportPresentationOptions = {},
): MonthSummaryView {
  const player = game.meta.playerClanId;
  const settlement = opening.clans.find((row) => row.clanId === player);
  const food = selectBudgetForecast(game, player);
  const domestic: MonthSummaryReportRow[] = [],
    world: MonthSummaryReportRow[] = [];
  const available = game.reports
    .filter((report) => {
      const calendar = dayToCalendar(report.day);
      return (
        report.day <= opening.day &&
        calendar.year === opening.year &&
        calendar.month === opening.month
      );
    })
    .slice()
    .sort(chronological);
  for (const report of available) {
    const event = report.event,
      category = REPORT_CATEGORIES[event.type];
    // Actual income and salary flows already have dedicated numeric rows; warnings about food or
    // revoked policies are still useful changes rather than duplicate financial totals.
    if (event.type === 'economy.income' || event.type === 'economy.upkeepUnpaid') continue;
    const local = event.clanIds.includes(player);
    const target =
      local && (category === 'domestic' || category === 'military' || category === 'personnel')
        ? domestic
        : !local &&
            (category === 'military' || category === 'diplomacy') &&
            severityOf(event, player) !== 'info'
          ? world
          : null;
    if (target === null) continue;
    const text = renderReport(event, game, player, options);
    if (text !== null) target.push(Object.freeze({ id: report.id, day: report.day, text }));
  }
  return Object.freeze({
    key: `${player}:${opening.day}`,
    day: opening.day,
    year: opening.year,
    month: opening.month,
    settlement: settlement === undefined ? null : Object.freeze({ ...settlement }),
    foodStock: food.foodStock,
    foodForecast: food.foodUpkeepMonthly,
    domestic: Object.freeze(domestic),
    world: Object.freeze(world),
    // Retention is bounded and historical reports may have been pruned; absence is not evidence
    // that no event occurred. No completeness claim can be derived from the surviving array.
    reportsMayBeIncomplete: true,
  });
}
