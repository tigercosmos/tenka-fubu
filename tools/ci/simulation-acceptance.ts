import type { SimulateRunSummary } from '../../src/core/systems/ai/simulation';

export const TEN_YEAR_SURVIVAL_CLANS = [
  'clan.takeda',
  'clan.mori',
  'clan.hojo',
  'clan.shimazu',
  'clan.imagawa',
] as const;
export interface SimulationAcceptanceReason {
  kind: 'incomplete' | 'fail';
  code: string;
  seed?: number;
  clanId?: string;
}
export interface SimulationAcceptance {
  specification: '18 §5.4';
  status: 'pass' | 'fail' | 'incomplete';
  requestedYears: number;
  runCount: number;
  uniqueSeedCount: number;
  metrics: {
    unificationRate: number | null;
    medianUnifiedYear: number | null;
    odaSurvivalRateAtYear25: number | null;
    survivalRateAtYear10: Record<string, number | null>;
    meanAvgTickMs: number | null;
  };
  reasons: SimulationAcceptanceReason[];
}
function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function isCheckpointRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function validLifetime(
  clan: SimulateRunSummary['clanStats'][number],
  maximumDeathYear = 1585,
): boolean {
  return (
    typeof clan.survived === 'boolean' &&
    (clan.survived
      ? clan.destroyedYear === null
      : Number.isInteger(clan.destroyedYear) &&
        clan.destroyedYear !== null &&
        clan.destroyedYear >= 1560 &&
        clan.destroyedYear <= maximumDeathYear)
  );
}

function validTenYearObservation(run: SimulateRunSummary, clanId: string): boolean {
  const matches = run.clanStats.filter((clan) => clan.clanId === clanId);
  if (
    !Number.isFinite(run.yearsSimulated) ||
    run.yearsSimulated < 10 ||
    matches.length !== 1 ||
    !isCheckpointRecord(run.survivalAtYear10) ||
    !Object.hasOwn(run.survivalAtYear10, clanId) ||
    typeof run.survivalAtYear10[clanId] !== 'boolean'
  )
    return false;
  const clan = matches[0]!;
  // The general CLI permits longer observation windows; the fixed25-year gate
  // applies its1585 upper bound separately, not to this shared aggregation.
  if (!validLifetime(clan, Infinity)) return false;
  const observed = run.survivalAtYear10[clanId];
  if (clan.survived) return observed === true; // No resurrection in the simulation contract.
  // The checkpoint is April1,1570. Calendar-year-only death data cannot resolve1570's order.
  if (clan.destroyedYear! < 1570) return observed === false;
  if (clan.destroyedYear! > 1570) return observed === true;
  return true;
}

/** Only observed checkpoints count; missing values are not observations of death. */
export function aggregateTenYearSurvival(
  runs: readonly SimulateRunSummary[],
  clanIds: readonly string[],
): Record<string, number | null> {
  return Object.fromEntries(
    clanIds.map((clanId) => {
      const observed = runs.length > 0 && runs.every((run) => validTenYearObservation(run, clanId));
      return [
        clanId,
        observed
          ? runs.filter((run) => run.survivalAtYear10[clanId] === true).length / runs.length
          : null,
      ];
    }),
  );
}

/**
 * Recompute18 §5.4 from run observations, never from precomputed summary rates.
 * This is not15 §5.6, a replay/legality proof, or a timing benchmark.
 * Short unified runs cannot establish future survival: the current run schema
 * has no authenticated terminal-victory field. The CLI observes the full window.
 */
export function evaluateSimulationAcceptance(
  runs: readonly SimulateRunSummary[],
  requestedYears: number,
): SimulationAcceptance {
  const reasons: SimulationAcceptanceReason[] = [];
  const incomplete = (code: string, seed?: number, clanId?: string) => {
    reasons.push({
      kind: 'incomplete',
      code,
      ...(seed === undefined ? {} : { seed }),
      ...(clanId === undefined ? {} : { clanId }),
    });
  };
  if (requestedYears !== 25) incomplete('requested-window-not-25-years');
  const seeds = new Set<number>();
  let validSeedIdentity = true;
  for (const run of runs) {
    if (!Number.isInteger(run.seed) || run.seed < 0 || run.seed > 0xffff_ffff) {
      incomplete('invalid-seed', run.seed);
      validSeedIdentity = false;
    } else if (seeds.has(run.seed)) {
      incomplete('duplicate-seed', run.seed);
      validSeedIdentity = false;
    } else seeds.add(run.seed);
  }
  if (seeds.size < 20) incomplete('fewer-than-20-unique-seeds');
  let validUnification = true;
  for (const run of runs) {
    if (!Number.isFinite(run.yearsSimulated) || run.yearsSimulated !== 25)
      incomplete(
        run.yearsSimulated < 25 && run.unifiedByClanId !== null
          ? 'early-unification-survival-unobserved'
          : 'observation-window-not-25-years',
        run.seed,
      );
    const clanIds = new Set<string>();
    for (const clan of run.clanStats) {
      if (clanIds.has(clan.clanId)) incomplete('duplicate-clan', run.seed, clan.clanId);
      clanIds.add(clan.clanId);
      if (!validLifetime(clan)) incomplete('invalid-clan-lifetime', run.seed, clan.clanId);
      if (
        isCheckpointRecord(run.survivalAtYear10) &&
        Object.hasOwn(run.survivalAtYear10, clan.clanId) &&
        !validTenYearObservation(run, clan.clanId)
      )
        incomplete('inconsistent-ten-year-survival', run.seed, clan.clanId);
    }
    for (const clanId of ['clan.oda', ...TEN_YEAR_SURVIVAL_CLANS]) {
      const matches = run.clanStats.filter((clan) => clan.clanId === clanId);
      if (matches.length !== 1 || typeof matches[0]?.survived !== 'boolean')
        incomplete('missing-or-invalid-clan-survival', run.seed, clanId);
    }
    const hasWinner = typeof run.unifiedByClanId === 'string' && run.unifiedByClanId.length > 0;
    const noVictory = run.unifiedByClanId === null && run.unifiedYear === null;
    const winners = run.clanStats.filter((clan) => clan.clanId === run.unifiedByClanId);
    const validVictory =
      hasWinner &&
      Number.isInteger(run.unifiedYear) &&
      // This gate is specifically18's1560–1585 s1560 window, not a generic scenario gate.
      run.unifiedYear !== null &&
      run.unifiedYear >= 1560 &&
      run.unifiedYear <= 1585 &&
      winners.length === 1 &&
      (winners[0]!.destroyedYear === null || run.unifiedYear <= winners[0]!.destroyedYear);
    if (!noVictory && !validVictory) {
      incomplete('invalid-unification-observation', run.seed);
      validUnification = false;
    }
    if (!Number.isFinite(run.avgTickMs) || run.avgTickMs < 0)
      incomplete('invalid-tick-timing', run.seed);
  }
  const observedTenYear = aggregateTenYearSurvival(runs, TEN_YEAR_SURVIVAL_CLANS);
  for (const clanId of TEN_YEAR_SURVIVAL_CLANS)
    if (observedTenYear[clanId] === null)
      incomplete('ten-year-survival-unobserved', undefined, clanId);
  const survivalRateAtYear10 = validSeedIdentity
    ? observedTenYear
    : Object.fromEntries(TEN_YEAR_SURVIVAL_CLANS.map((id) => [id, null]));
  const observed25 =
    runs.length > 0 &&
    validSeedIdentity &&
    runs.every(
      (run) =>
        run.yearsSimulated === 25 &&
        run.clanStats.filter((clan) => clan.clanId === 'clan.oda').length === 1 &&
        validLifetime(run.clanStats.find((clan) => clan.clanId === 'clan.oda')!),
    );
  const odaSurvivalRateAtYear25 = observed25
    ? runs.filter((run) => run.clanStats.find((clan) => clan.clanId === 'clan.oda')!.survived)
        .length / runs.length
    : null;
  const unifiedYears = runs.flatMap((run) => (run.unifiedYear === null ? [] : [run.unifiedYear]));
  const unificationRate =
    runs.length && validSeedIdentity && validUnification ? unifiedYears.length / runs.length : null;
  const medianUnifiedYear = validSeedIdentity && validUnification ? median(unifiedYears) : null;
  const meanAvgTickMs =
    runs.length &&
    validSeedIdentity &&
    runs.every((run) => Number.isFinite(run.avgTickMs) && run.avgTickMs >= 0)
      ? runs.reduce((sum, run) => sum + run.avgTickMs / runs.length, 0)
      : null;
  const fail = (code: string, condition: boolean, clanId?: string) => {
    if (condition)
      reasons.push({ kind: 'fail', code, ...(clanId === undefined ? {} : { clanId }) });
  };
  fail('unification-rate-below-half', unificationRate !== null && unificationRate < 0.5);
  fail(
    'median-unification-year-out-of-range',
    validUnification &&
      validSeedIdentity &&
      (medianUnifiedYear === null || medianUnifiedYear < 1575 || medianUnifiedYear > 1585),
  );
  fail(
    'oda-25-year-survival-below-60-percent',
    odaSurvivalRateAtYear25 !== null && odaSurvivalRateAtYear25 < 0.6,
  );
  for (const clanId of TEN_YEAR_SURVIVAL_CLANS) {
    const rate = survivalRateAtYear10[clanId];
    fail(
      'ten-year-survival-below-70-percent',
      rate !== null && rate !== undefined && rate < 0.7,
      clanId,
    );
  }
  fail('mean-tick-time-not-below-8ms', meanAvgTickMs !== null && meanAvgTickMs >= 8);
  return {
    specification: '18 §5.4',
    status: reasons.some((reason) => reason.kind === 'incomplete')
      ? 'incomplete'
      : reasons.length
        ? 'fail'
        : 'pass',
    requestedYears,
    runCount: runs.length,
    uniqueSeedCount: seeds.size,
    metrics: {
      unificationRate,
      medianUnifiedYear,
      odaSurvivalRateAtYear25,
      survivalRateAtYear10,
      meanAvgTickMs,
    },
    reasons,
  };
}
