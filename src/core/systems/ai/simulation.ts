import type { GameState } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import { CommandQueue, enqueuePendingAiOrders } from '../../commands/queue';
import { validateState } from '../../state/invariants';
import { advanceDay } from '../index';
import { dayToCalendar } from '../time';
import { dominionClanIds } from '../victory';
import type { EventEngine } from '../events/engine';

export interface SimulationOptions {
  eventEngine?: EventEngine;
  /** Full historical observation needs the entire requested window, even after unification. */
  stopOnUnification?: boolean;
}

export interface SimulationMonthSample {
  day: number;
  year: number;
  month: number;
  clans: Array<{
    clanId: string;
    kokudaka: number;
    castleCount: number;
    /** Current persistent castle garrisons, armies and transport escorts; no tactical duplicate. */
    soldiers: number;
    /** Clan treasury only, excluding separate corps wallets. */
    gold: number;
    prestige: number;
    alive: boolean;
  }>;
}

/** Detached measurements only: no effects, RNG draws or cache writes. */
export function observeSimulationState(state: Readonly<GameState>): SimulationMonthSample {
  const clans = Object.values(state.clans)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((clan) => ({
      clanId: clan.id,
      kokudaka: 0,
      castleCount: 0,
      soldiers: 0,
      gold: clan.gold,
      prestige: clan.prestige,
      alive: clan.alive,
    }));
  const byId = new Map(clans.map((clan) => [clan.clanId, clan]));
  for (const district of Object.values(state.districts)) {
    const clan = byId.get(district.ownerClanId);
    if (clan) clan.kokudaka += district.kokudaka;
  }
  for (const castle of Object.values(state.castles)) {
    const clan = byId.get(castle.ownerClanId);
    if (clan) {
      clan.castleCount++;
      clan.soldiers += castle.soldiers;
    }
  }
  for (const army of Object.values(state.armies)) {
    const clan = byId.get(army.clanId);
    if (clan) clan.soldiers += army.soldiers;
  }
  for (const transport of Object.values(state.transports)) {
    const clan = byId.get(transport.clanId);
    if (clan) clan.soldiers += transport.soldiers;
  }
  return { day: state.time.day, year: state.time.year, month: state.time.month, clans };
}

export interface SimulateRunSummary {
  seed: number;
  yearsSimulated: number;
  unifiedByClanId: string | null;
  unifiedYear: number | null;
  clanStats: Array<{
    clanId: string;
    survived: boolean;
    castleCount: number;
    kokudaka: number;
    peakKokudaka: number;
    destroyedYear: number | null;
  }>;
  totalBattles: number;
  totalSieges: number;
  avgTickMs: number;
  hardRejections: number;
  invalidDecisionCount: number;
  survivalAtYear10: Record<string, boolean>;
  historicalEventCount: number;
  historicalEventCounts: Record<string, number>;
  monthlySamples: SimulationMonthSample[];
  /** Absolute calendar year, not elapsed simulation years. */
  yearOfFirst2MKoku: number | null;
  first2MKokuDay: number | null;
  elapsedYearsToFirst2MKoku: number | null;
  survivalAtYear20: Record<string, boolean>;
  survivingClans: number;
  maxClanKokudaka: number;
  top3: Array<{ clanId: string; kokudaka: number }>;
  odaSurvivedYears: number | null;
}

/** Same pending-order/command seam as the app, without rendering, clocks or browser APIs. */
export function simulateAiGame(
  state: GameState,
  years: number,
  now: () => number = () => 0,
  options: SimulationOptions = {},
): SimulateRunSummary {
  if (!Number.isFinite(years) || years <= 0) throw new Error('Simulation years must be positive');
  state.ai.allAi = true;
  const startDay = state.time.day;
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const peaks = new Map<ClanId, number>();
  const survivalAtYear10: Record<string, boolean> = {};
  const survivalAtYear20: Record<string, boolean> = {};
  const monthlySamples: SimulationMonthSample[] = [];
  let yearOfFirst2MKoku: number | null = null;
  let first2MKokuDay: number | null = null;
  const historicalEventCounts = new Map<string, number>();
  const unsubscribe = options.eventEngine?.subscribeFired(({ def }) => {
    if (def.kind === 'historical')
      historicalEventCounts.set(def.id, (historicalEventCounts.get(def.id) ?? 0) + 1);
  });
  let ticks = 0,
    elapsed = 0,
    totalBattles = 0,
    totalSieges = 0,
    hardRejections = 0,
    invalidDecisionCount = 0;
  let unifiedByClanId: ClanId | null = null;
  let unifiedYear: number | null = null;
  const snapshot = (): SimulationMonthSample => {
    const sample = observeSimulationState(state);
    for (const clan of sample.clans)
      peaks.set(
        clan.clanId as ClanId,
        Math.max(peaks.get(clan.clanId as ClanId) ?? 0, clan.kokudaka),
      );
    if (yearOfFirst2MKoku === null && sample.clans.some((clan) => clan.kokudaka >= 2_000_000)) {
      yearOfFirst2MKoku = sample.year;
      first2MKokuDay = sample.day;
    }
    if (state.time.dayOfMonth === 1) monthlySamples.push(sample);
    return sample;
  };
  snapshot();
  try {
    for (; ticks < Math.ceil(years * 360);) {
      enqueuePendingAiOrders(state, queue);
      const start = now();
      const result = advanceDay(
        state,
        queue.drain(),
        options.eventEngine ? { eventEngine: options.eventEngine } : undefined,
      );
      elapsed += Math.max(0, now() - start);
      ticks++;
      totalBattles += result.events.filter((event) => event.type === 'battle.started').length;
      totalSieges += result.events.filter((event) => event.type === 'siege.started').length;
      hardRejections += result.events.filter((event) => event.type === 'command.rejected').length;
      invalidDecisionCount += state.ai.intentLog.filter(
        (intent) => intent.day === state.time.day && intent.kind === 'error.invalidCommand',
      ).length;
      const violations = validateState(state);
      if (violations.length)
        throw new Error(
          `Simulation seed=${state.meta.seed} day=${state.time.day}: ${JSON.stringify(violations)}`,
        );
      snapshot();
      if (ticks === 3600)
        for (const clan of Object.values(state.clans)) survivalAtYear10[clan.id] = clan.alive;
      if (ticks === 7200)
        for (const clan of Object.values(state.clans)) survivalAtYear20[clan.id] = clan.alive;
      const castles = Object.values(state.castles);
      for (const clan of Object.values(state.clans).sort((a, b) => a.id.localeCompare(b.id))) {
        if (unifiedByClanId !== null) break;
        if (!clan.alive) continue;
        const dominion = dominionClanIds(state, clan.id);
        if (castles.length > 0 && castles.every((castle) => dominion.has(castle.ownerClanId))) {
          unifiedByClanId = clan.id;
          unifiedYear = state.time.year;
          break;
        }
      }
      if (unifiedByClanId !== null && options.stopOnUnification !== false) break;
    }
  } finally {
    unsubscribe?.();
  }
  const final = observeSimulationState(state);
  const top3 = final.clans
    .map(({ clanId, kokudaka }) => ({ clanId, kokudaka }))
    .sort(
      (a, b) => b.kokudaka - a.kokudaka || (a.clanId < b.clanId ? -1 : a.clanId > b.clanId ? 1 : 0),
    )
    .slice(0, 3);
  return {
    seed: state.meta.seed,
    yearsSimulated: ticks / 360,
    unifiedByClanId,
    unifiedYear,
    clanStats: Object.values(state.clans)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((clan) => ({
        clanId: clan.id,
        survived: clan.alive,
        castleCount: Object.values(state.castles).filter((castle) => castle.ownerClanId === clan.id)
          .length,
        kokudaka: Math.floor(
          Object.values(state.districts)
            .filter((district) => district.ownerClanId === clan.id)
            .reduce((sum, district) => sum + district.kokudaka, 0),
        ),
        peakKokudaka: Math.floor(peaks.get(clan.id) ?? 0),
        destroyedYear: clan.destroyedDay === null ? null : dayToCalendar(clan.destroyedDay).year,
      })),
    totalBattles,
    totalSieges,
    avgTickMs: ticks === 0 ? 0 : elapsed / ticks,
    hardRejections,
    invalidDecisionCount,
    survivalAtYear10,
    survivalAtYear20,
    monthlySamples,
    yearOfFirst2MKoku,
    first2MKokuDay,
    elapsedYearsToFirst2MKoku: first2MKokuDay === null ? null : (first2MKokuDay - startDay) / 360,
    survivingClans: final.clans.filter((clan) => clan.alive).length,
    maxClanKokudaka: Math.max(0, ...final.clans.map((clan) => clan.kokudaka)),
    top3,
    odaSurvivedYears:
      state.clans['clan.oda' as ClanId] === undefined
        ? null
        : Math.min(
            ticks,
            Math.max(
              0,
              (state.clans['clan.oda' as ClanId]!.destroyedDay ?? state.time.day) - startDay,
            ),
          ) / 360,
    historicalEventCount: [...historicalEventCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    ),
    historicalEventCounts: Object.fromEntries(
      [...historicalEventCounts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  };
}
