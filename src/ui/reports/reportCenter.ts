import { UI } from '../uiConstants';
import type { GameEvent, GameEventType } from '@core/state/events';
import type { GameState, Report } from '@core/state/gameState';
import type { CastleId, DistrictId, MapNodeId, ReportId } from '@core/state/ids';
import { dayToCalendar, severityOf } from '@core/index';
import { renderReport, type ReportPresentationOptions } from './renderReport';
type Severity = ReturnType<typeof severityOf>;

export type ReportCategory =
  'domestic' | 'military' | 'diplomacy' | 'personnel' | 'event' | 'system';
export interface ReportMonth {
  year: number;
  month: number;
}
export interface ReportCenterFilters {
  /** Omitted means all; an explicitly empty selection means no categories. */
  categories?: readonly ReportCategory[];
  importantOnly?: boolean;
  startMonth?: Readonly<ReportMonth> | null;
  endMonth?: Readonly<ReportMonth> | null;
}
export type ReportDestination = Readonly<{ nodeId: MapNodeId; x: number; y: number }>;
export type ReportCenterRow = Readonly<{
  id: ReportId;
  day: number;
  category: ReportCategory;
  severity: Severity;
  text: string;
  destination: ReportDestination | null;
}>;
export interface ReportCenterResult {
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
  readonly rows: readonly ReportCenterRow[];
}

/** Explicit coverage: new GameEvent variants require an intentional domain assignment. */
export const REPORT_CATEGORIES = Object.freeze({
  'battle.started': 'military',
  'battle.kassenAvailable': 'military',
  'battle.ended': 'military',
  'awe.triggered': 'military',
  'siege.started': 'military',
  'siege.relief': 'military',
  'siege.ended': 'military',
  'district.subjugated': 'military',
  'army.departed': 'military',
  'army.arrived': 'military',
  'army.returned': 'military',
  'army.blocked': 'military',
  'army.starving': 'military',
  'army.routed': 'military',
  'economy.income': 'domestic',
  'economy.harvest': 'domestic',
  'economy.granaryOverflow': 'domestic',
  'economy.upkeepUnpaid': 'domestic',
  'economy.foodShortage': 'domestic',
  'facility.completed': 'domestic',
  'policy.enacted': 'domestic',
  'policy.revoked': 'domestic',
  'policy.autoRevoked': 'domestic',
  'conscript.completed': 'domestic',
  'transport.arrived': 'domestic',
  'transport.looted': 'domestic',
  'uprising.started': 'domestic',
  'uprising.ended': 'domestic',
  'officer.died': 'personnel',
  'officer.comingOfAge': 'personnel',
  'officer.promoted': 'personnel',
  'officer.loyaltyLow': 'personnel',
  'officer.defected': 'personnel',
  'officer.recruited': 'personnel',
  'officer.recruitFailed': 'personnel',
  'officer.captured': 'personnel',
  'officer.released': 'personnel',
  'officer.executed': 'personnel',
  'clan.succession': 'personnel',
  'proposal.submitted': 'personnel',
  'proposal.resolved': 'personnel',
  'proposal.expired': 'personnel',
  'pact.signed': 'diplomacy',
  'pact.expired': 'diplomacy',
  'pact.broken': 'diplomacy',
  'diplo.refused': 'diplomacy',
  'diplo.reinforceAgreed': 'diplomacy',
  'diplo.envoyArrived': 'diplomacy',
  'diplo.workStopped': 'diplomacy',
  'court.rankGranted': 'diplomacy',
  'court.mediationResult': 'diplomacy',
  'shogunate.titleGranted': 'diplomacy',
  'shogunate.nominated': 'diplomacy',
  'shogunate.patronLost': 'diplomacy',
  'shogunate.collapsed': 'diplomacy',
  'plot.succeeded': 'diplomacy',
  'plot.failed': 'diplomacy',
  'plot.exposed': 'diplomacy',
  'plot.betrayalActivated': 'diplomacy',
  'event.fired': 'event',
  'taimei.invoked': 'event',
  'taimei.expired': 'event',
  'clan.destroyed': 'system',
  'victory.tenkabitoProgress': 'system',
  'game.victory': 'system',
  'game.defeat': 'system',
  'command.rejected': 'system',
  'time.monthStart': 'system',
  'time.seasonStart': 'system',
} satisfies Record<GameEventType, ReportCategory>);

function destination(state: Readonly<GameState>, event: GameEvent): ReportDestination | null {
  let nodeId: MapNodeId | null = null;
  switch (event.type) {
    case 'battle.started':
    case 'battle.ended':
    case 'army.arrived':
    case 'army.blocked':
    case 'army.routed':
    case 'transport.looted':
      nodeId = event.nodeId;
      break;
    case 'officer.died':
      nodeId = event.nodeId;
      break;
    case 'army.departed':
      nodeId = event.originCastleId;
      break;
    case 'army.returned':
    case 'siege.started':
    case 'siege.relief':
    case 'siege.ended':
    case 'economy.foodShortage':
    case 'economy.granaryOverflow':
    case 'facility.completed':
    case 'conscript.completed':
    case 'plot.betrayalActivated':
      nodeId = event.castleId;
      break;
    case 'district.subjugated':
    case 'uprising.started':
    case 'uprising.ended':
      nodeId = event.districtId;
      break;
    case 'transport.arrived':
      nodeId = event.toCastleId;
      break;
    case 'plot.succeeded':
    case 'plot.failed':
    case 'plot.exposed':
      nodeId = event.targetCastleId;
      break;
    // No single snapshot location: never infer a historical destination from a living army/officer,
    // transient battle/proposal, a clan's present home, or an ambiguous multi-location awe.
    default:
      return null;
  }
  if (nodeId === null) return null;
  const node = state.castles[nodeId as CastleId] ?? state.districts[nodeId as DistrictId];
  if (!node || !Number.isFinite(node.pos.x) || !Number.isFinite(node.pos.y)) return null;
  return Object.freeze({ nodeId, x: node.pos.x, y: node.pos.y });
}
function monthIndex(period: Readonly<ReportMonth>): number | null {
  if (
    !Number.isSafeInteger(period.year) ||
    !Number.isInteger(period.month) ||
    period.month < 1 ||
    period.month > 12
  )
    return null;
  const value = period.year * 12 + period.month - 1;
  return Number.isSafeInteger(value) ? value : null;
}
function serial(id: ReportId): number | null {
  const match = /^rep\.(\d+)$/u.exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}
function newestFirst(a: Readonly<Report>, b: Readonly<Report>): number {
  if (a.day !== b.day) return b.day - a.day;
  const aSerial = serial(a.id),
    bSerial = serial(b.id);
  if (aSerial !== null && bSerial !== null && aSerial !== bSerial) return bSerial - aSerial;
  // Canonical numeric IDs form one group; a lexical fallback must not create comparator cycles.
  if (aSerial !== null && bSerial === null) return -1;
  if (aSerial === null && bSerial !== null) return 1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Retained reports only: rendering, filtering and paging never mark read or modify GameState. */
export function selectReportCenter(
  state: Readonly<GameState>,
  filters: ReportCenterFilters = {},
  requestedPage = 1,
  presentation: ReportPresentationOptions = {},
): ReportCenterResult {
  const start = filters.startMonth == null ? null : monthIndex(filters.startMonth);
  const end = filters.endMonth == null ? null : monthIndex(filters.endMonth);
  const validRange =
    (filters.startMonth == null || start !== null) &&
    (filters.endMonth == null || end !== null) &&
    (start === null || end === null || start <= end);
  const categories = filters.categories === undefined ? null : new Set(filters.categories);
  const filtered = validRange
    ? state.reports
        .filter((report) => {
          const category = REPORT_CATEGORIES[report.event.type];
          if (categories !== null && !categories.has(category)) return false;
          if (filters.importantOnly && severityOf(report.event, state.meta.playerClanId) === 'info')
            return false;
          const calendar = dayToCalendar(report.day),
            month = calendar.year * 12 + calendar.month - 1;
          return (start === null || month >= start) && (end === null || month <= end);
        })
        .slice()
        .sort(newestFirst)
        .flatMap((report) => {
          const text = renderReport(report.event, state, state.meta.playerClanId, presentation);
          return text === null
            ? []
            : [
                Object.freeze({
                  id: report.id,
                  day: report.day,
                  category: REPORT_CATEGORIES[report.event.type],
                  severity: severityOf(report.event, state.meta.playerClanId),
                  text,
                  destination: destination(state, report.event),
                }),
              ];
        })
    : [];
  const total = filtered.length,
    pageCount = Math.max(1, Math.ceil(total / UI.uiReportPageSize));
  const finitePage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.max(1, Math.min(pageCount, finitePage));
  return Object.freeze({
    total,
    page,
    pageCount,
    rows: Object.freeze(
      filtered.slice((page - 1) * UI.uiReportPageSize, page * UI.uiReportPageSize),
    ),
  });
}
