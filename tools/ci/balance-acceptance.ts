import type {
  SimulateRunSummary,
  SimulationMonthSample,
} from '../../src/core/systems/ai/simulation';
import { dayToCalendar } from '../../src/core/systems/time';

export interface BalanceAcceptance {
  specification: '15 §5.6';
  status: 'pass' | 'fail' | 'incomplete';
  metrics: {
    medianElapsedYearsToFirst2MKoku: number | null;
    odaSurvivalRateAtYear20: number | null;
    medianFinalAliveClans: number | null;
    repeatCsvEqual: boolean | null;
  };
  reasons: Array<{
    kind: 'fail' | 'incomplete';
    code: string;
    seed?: number;
    clanId?: string;
    day?: number;
  }>;
}
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Number.isFinite(value) ? value : null;
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null);
const finiteNonnegative = (value: number) => Number.isFinite(value) && value >= 0;

/** Read-only15 §5.6 observation evaluator, separate from18 §5.4 and timing gates. */
export function evaluateBalanceAcceptance(
  runs: readonly SimulateRunSummary[],
  requestedYears: number,
  repeatRuns?: readonly SimulateRunSummary[],
): BalanceAcceptance {
  const reasons: BalanceAcceptance['reasons'] = [];
  const add = (
    kind: 'fail' | 'incomplete',
    code: string,
    seed?: number,
    clanId?: string,
    day?: number,
  ) => {
    reasons.push({
      kind,
      code,
      ...(seed === undefined ? {} : { seed }),
      ...(clanId === undefined ? {} : { clanId }),
      ...(day === undefined ? {} : { day }),
    });
  };
  const identities = (input: readonly SimulateRunSummary[], repeat = false) => {
    const seeds = new Set<number>();
    for (const run of input) {
      if (
        !Number.isInteger(run.seed) ||
        run.seed < 0 ||
        run.seed > 0xffffffff ||
        seeds.has(run.seed)
      ) {
        add('incomplete', repeat ? 'invalid-repeat-seed' : 'invalid-or-duplicate-seed', run.seed);
        continue;
      }
      seeds.add(run.seed);
    }
    return seeds;
  };
  const seeds = identities(runs);
  const validSeedIdentity = !reasons.some((r) => r.code === 'invalid-or-duplicate-seed');
  if (seeds.size < 20) add('incomplete', 'fewer-than-20-unique-seeds');
  if (!Number.isFinite(requestedYears) || requestedYears < 20)
    add('incomplete', 'requested-window-under-20-years');
  const elapsed: number[] = [],
    alive: number[] = [],
    oda: boolean[] = [];
  const wide = new Map<number, string>();
  const requestedTicks = Math.ceil(requestedYears * 360);
  let initialCatalog: string | null = null;
  const validateSeries = (run: SimulateRunSummary, repeat = false): boolean => {
    const prefix = repeat ? 'repeat-' : '';
    const samples = run.monthlySamples;
    const observedTicks = Math.round(run.yearsSimulated * 360);
    if (
      !Number.isFinite(run.yearsSimulated) ||
      run.yearsSimulated < 20 ||
      !Number.isSafeInteger(observedTicks) ||
      observedTicks !== requestedTicks ||
      run.yearsSimulated !== observedTicks / 360 ||
      !Array.isArray(samples) ||
      samples.length < 2
    ) {
      add('incomplete', `${prefix}observation-window-missing`, run.seed);
      return false;
    }
    const initial = samples[0]!;
    //15 §5.6 fixes s1560, whose initial April1 is absolute day90.
    if (!record(initial) || initial.day !== 90) {
      add('incomplete', `${prefix}initial-month-missing`, run.seed);
      return false;
    }
    const endDay = initial.day + observedTicks;
    const expectedCount = Math.floor((endDay - initial.day) / 30) + 1;
    if (samples.length !== expectedCount) {
      add('incomplete', `${prefix}monthly-coverage-incomplete`, run.seed);
      return false;
    }
    let clanIds: string[] | null = null;
    let previous: SimulationMonthSample | undefined;
    const cells: unknown[] = [];
    for (const [i, sample] of samples.entries()) {
      if (!record(sample)) {
        add('incomplete', `${prefix}invalid-month`, run.seed);
        return false;
      }
      const calendar = dayToCalendar(sample.day);
      if (
        sample.day !== initial.day + i * 30 ||
        sample.year !== calendar.year ||
        sample.month !== calendar.month ||
        !Array.isArray(sample.clans) ||
        sample.clans.length === 0
      ) {
        add('incomplete', `${prefix}invalid-month`, run.seed, undefined, sample.day);
        return false;
      }
      if (sample.clans.some((c) => !record(c) || typeof c.clanId !== 'string' || !c.clanId)) {
        add(
          'incomplete',
          `${prefix}monthly-clan-identity-mismatch`,
          run.seed,
          undefined,
          sample.day,
        );
        return false;
      }
      const sorted = [...sample.clans].sort((a, b) => a.clanId.localeCompare(b.clanId));
      const ids = sorted.map((c) => c.clanId);
      if (
        ids.some((id) => typeof id !== 'string' || !id) ||
        new Set(ids).size !== ids.length ||
        (clanIds !== null && JSON.stringify(ids) !== JSON.stringify(clanIds))
      ) {
        add(
          'incomplete',
          `${prefix}monthly-clan-identity-mismatch`,
          run.seed,
          undefined,
          sample.day,
        );
        return false;
      }
      clanIds ??= ids;
      if (i === 0) {
        const catalog = JSON.stringify(ids);
        if (initialCatalog !== null && initialCatalog !== catalog) {
          add('incomplete', `${prefix}initial-clan-catalog-mismatch`, run.seed);
          return false;
        }
        initialCatalog ??= catalog;
      }
      for (const clan of sorted) {
        if (
          typeof clan.kokudaka !== 'number' ||
          typeof clan.gold !== 'number' ||
          typeof clan.alive !== 'boolean'
        ) {
          add('incomplete', `${prefix}invalid-monthly-value`, run.seed, clan.clanId, sample.day);
          return false;
        }
        if (!Number.isFinite(clan.kokudaka) || !Number.isFinite(clan.gold))
          add('fail', `${prefix}nonfinite-monthly-resource`, run.seed, clan.clanId, sample.day);
        if (clan.kokudaka < 0 || clan.gold < 0)
          add('fail', `${prefix}negative-monthly-resource`, run.seed, clan.clanId, sample.day);
        const before = previous?.clans.find((c) => c.clanId === clan.clanId);
        if (before && (clan.kokudaka > before.kokudaka * 2 || clan.gold > before.gold * 2))
          add(
            'fail',
            `${prefix}monthly-resource-more-than-double`,
            run.seed,
            clan.clanId,
            sample.day,
          );
      }
      cells.push([sample.year, sample.month, sorted.map((c) => [c.clanId, String(c.kokudaka)])]);
      previous = sample;
    }
    if (!repeat) wide.set(run.seed, JSON.stringify(cells));
    return true;
  };
  for (const run of runs) {
    if (!validateSeries(run)) continue;
    const first = run.monthlySamples[0]!,
      last = run.monthlySamples.at(-1)!;
    const stats = run.clanStats;
    if (
      !Array.isArray(stats) ||
      stats.some((c) => !record(c) || typeof c.clanId !== 'string' || !c.clanId) ||
      new Set(stats.map((c) => c.clanId)).size !== stats.length ||
      JSON.stringify(stats.map((c) => c.clanId).sort()) !==
        JSON.stringify(last.clans.map((c) => c.clanId).sort()) ||
      stats.some((c) => typeof c.survived !== 'boolean' || !finiteNonnegative(c.kokudaka)) ||
      (last.day === first.day + requestedTicks &&
        stats.some((c) => {
          const sampled = last.clans.find((s) => s.clanId === c.clanId)!;
          //Final clanStats koku is floored; monthly observations retain fractions.
          return c.survived !== sampled.alive || c.kokudaka !== Math.floor(sampled.kokudaka);
        }))
    ) {
      add('incomplete', 'final-clan-observation-inconsistent', run.seed);
    } else {
      const actual = stats.filter((c) => c.survived).length;
      if (run.survivingClans !== actual)
        add('incomplete', 'final-alive-aggregate-inconsistent', run.seed);
      else alive.push(actual);
    }
    const checkpoint = run.monthlySamples.find((s) => s.day === first.day + 20 * 360);
    const odaSample = checkpoint?.clans.find((c) => c.clanId === 'clan.oda');
    if (
      !record(run.survivalAtYear20) ||
      !Object.hasOwn(run.survivalAtYear20, 'clan.oda') ||
      typeof run.survivalAtYear20['clan.oda'] !== 'boolean' ||
      !odaSample ||
      odaSample.alive !== run.survivalAtYear20['clan.oda']
    )
      add('incomplete', 'oda-twenty-year-checkpoint-unobserved', run.seed);
    else oda.push(odaSample.alive);
    const day = run.first2MKokuDay,
      years = run.elapsedYearsToFirst2MKoku;
    const sampledHit = run.monthlySamples.find((s) => s.clans.some((c) => c.kokudaka >= 2_000_000));
    if (day === null && years === null && run.yearOfFirst2MKoku === null && !sampledHit) {
      elapsed.push(Infinity);
    } else if (
      !Number.isInteger(day) ||
      day === null ||
      day < first.day ||
      day > first.day + requestedTicks ||
      years === null ||
      !finiteNonnegative(years) ||
      years !== (day - first.day) / 360 ||
      run.yearOfFirst2MKoku !== dayToCalendar(day).year ||
      (sampledHit !== undefined && day > sampledHit.day) ||
      run.monthlySamples.some((s) => s.day < day && s.clans.some((c) => c.kokudaka >= 2_000_000))
    ) {
      add('incomplete', 'first-two-million-observation-inconsistent', run.seed);
    } else {
      elapsed.push(years);
    }
  }
  let repeatCsvEqual: boolean | null = null;
  if (!repeatRuns) add('incomplete', 'independent-repeat-unobserved');
  else {
    const repeatSeeds = identities(repeatRuns, true);
    let complete =
      validSeedIdentity &&
      !reasons.some((r) => r.code === 'invalid-repeat-seed') &&
      repeatRuns.length === runs.length &&
      repeatSeeds.size === seeds.size &&
      [...seeds].every((s) => repeatSeeds.has(s));
    if (!complete) add('incomplete', 'repeat-seed-set-mismatch');
    let equal = true;
    for (const run of repeatRuns) {
      if (!validateSeries(run, true) || !wide.has(run.seed)) {
        complete = false;
        continue;
      }
      const csv = JSON.stringify(
        run.monthlySamples.map((s) => [
          s.year,
          s.month,
          [...s.clans]
            .sort((a, b) => a.clanId.localeCompare(b.clanId))
            .map((c) => [c.clanId, String(c.kokudaka)]),
        ]),
      );
      if (csv !== wide.get(run.seed)) {
        equal = false;
        add('fail', 'repeat-wide-csv-mismatch', run.seed);
      }
    }
    if (complete && wide.size > 0) repeatCsvEqual = equal;
  }
  const medianElapsedYearsToFirst2MKoku =
    validSeedIdentity && elapsed.length === runs.length ? median(elapsed) : null;
  if (
    validSeedIdentity &&
    elapsed.length === runs.length &&
    runs.length &&
    medianElapsedYearsToFirst2MKoku === null
  )
    add('fail', 'convergence-median-right-censored');
  const odaSurvivalRateAtYear20 =
    validSeedIdentity && oda.length === runs.length && runs.length
      ? oda.filter(Boolean).length / runs.length
      : null;
  const medianFinalAliveClans =
    validSeedIdentity && alive.length === runs.length ? median(alive) : null;
  if (
    medianElapsedYearsToFirst2MKoku !== null &&
    (medianElapsedYearsToFirst2MKoku < 12 || medianElapsedYearsToFirst2MKoku > 20)
  )
    add('fail', 'convergence-median-outside-twelve-to-twenty');
  if (odaSurvivalRateAtYear20 !== null && odaSurvivalRateAtYear20 <= 0.4)
    add('fail', 'oda-survival-not-strictly-over-forty-percent');
  if (medianFinalAliveClans !== null && medianFinalAliveClans < 3)
    add('fail', 'final-alive-median-under-three');
  return {
    specification: '15 §5.6',
    status: reasons.some((r) => r.kind === 'incomplete')
      ? 'incomplete'
      : reasons.length
        ? 'fail'
        : 'pass',
    metrics: {
      medianElapsedYearsToFirst2MKoku,
      odaSurvivalRateAtYear20,
      medianFinalAliveClans,
      repeatCsvEqual,
    },
    reasons,
  };
}
