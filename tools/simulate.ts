import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  loadS1560Scenario,
  loadS1560EventCatalog,
  S1560_LOADED_REGIONS,
} from '../src/data/scenarios/s1560';
import { createRuntimeEventEngine } from '../src/core/systems/events/runtime';
import { DIFFICULTY_VALUES, type Difficulty } from '../src/core/state/enums';
import { buildGameStateFromScenario } from '../src/core/state/builder';
import { calendarToDay } from '../src/core/systems/time';
import { simulateAiGame, type SimulateRunSummary } from '../src/core/systems/ai/simulation';
import type { ClanId } from '../src/core/state/ids';
import type { GameState } from '../src/core/state/gameState';
import {
  aggregateTenYearSurvival,
  evaluateSimulationAcceptance,
  type SimulationAcceptance,
} from './ci/simulation-acceptance';
import { evaluateBalanceAcceptance, type BalanceAcceptance } from './ci/balance-acceptance';
import {
  evaluateHistoricalEventAcceptance,
  type HistoricalEventAcceptance,
} from './ci/historical-event-acceptance';
import {
  invalidateFailedSimulationAcceptance,
  recordSimulationFailure,
  type SimulationRunFailure,
} from './ci/simulation-failures';

export interface SimulateSummary {
  runs: SimulateRunSummary[];
  unificationRate: number | null;
  medianUnifiedYear: number | null;
  survivalRateByClan: Record<string, number>;
  loadedRegions: readonly string[];
  difficulty: Difficulty;
  medianHistoricalEventCount: number | null;
  survivalRateAtYear10: Record<string, number | null>;
  acceptance: SimulationAcceptance;
  balanceAcceptance: BalanceAcceptance;
  historicalAcceptance: HistoricalEventAcceptance;
  /** Independent runs with the same seed and difficulty; null means no repeat was requested. */
  repeatRuns: SimulateRunSummary[] | null;
  requestedSeeds: number[];
  failedRuns: SimulationRunFailure[];
}

export function parseSimulateOptions(args: readonly string[]) {
  const argumentsByName = new Map<string, string>();
  for (const argument of args) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (!match || argumentsByName.has(match[1]!))
      throw new Error(`Malformed or duplicate argument: ${argument}`);
    argumentsByName.set(match[1]!, match[2]!);
  }
  if (
    [...argumentsByName.keys()].some(
      (name) =>
        ![
          'seed',
          'seeds',
          'years',
          'difficulty',
          'output',
          'csv-output',
          'out',
          'monthly-output',
          'verify-repeat',
          'continue-on-error',
        ].includes(name),
    )
  )
    throw new Error('Usage: --seeds=N --years=N --difficulty=easy|normal|hard --output=PATH');
  const seeds = Number(argumentsByName.get('seeds') ?? 5),
    years = Number(argumentsByName.get('years') ?? 10);
  if (
    !Number.isInteger(seeds) ||
    seeds < 1 ||
    seeds > 1000 ||
    !Number.isFinite(years) ||
    years <= 0 ||
    years > 100
  )
    throw new Error('seeds: integer 1..1000; years: positive number <=100');
  const seedText = argumentsByName.get('seed');
  if (seedText !== undefined && argumentsByName.has('seeds'))
    throw new Error('seed and seeds are mutually exclusive');
  const seed = seedText === undefined ? undefined : Number(seedText);
  if (
    seed !== undefined &&
    (!seedText || !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)
  )
    throw new Error('seed: unsigned 32-bit integer');
  const difficulty = argumentsByName.get('difficulty') ?? 'normal';
  if (!DIFFICULTY_VALUES.some((value) => value === difficulty))
    throw new Error('difficulty: easy|normal|hard');
  const output = argumentsByName.get('output');
  if (argumentsByName.has('output') && !output) throw new Error('output: nonempty file path');
  if (argumentsByName.has('csv-output') && argumentsByName.has('out'))
    throw new Error('out and csv-output are aliases; provide only one');
  const csvOutput = argumentsByName.get('csv-output') ?? argumentsByName.get('out');
  if ((argumentsByName.has('csv-output') || argumentsByName.has('out')) && !csvOutput)
    throw new Error('csv-output: nonempty file path');
  const monthlyOutput = argumentsByName.get('monthly-output');
  if (argumentsByName.has('monthly-output') && !monthlyOutput)
    throw new Error('monthly-output: nonempty file path');
  const verifyRepeat = argumentsByName.get('verify-repeat');
  if (verifyRepeat !== undefined && verifyRepeat !== 'true' && verifyRepeat !== 'false')
    throw new Error('verify-repeat: true|false');
  const continueOnError = argumentsByName.get('continue-on-error');
  if (continueOnError !== undefined && continueOnError !== 'true' && continueOnError !== 'false')
    throw new Error('continue-on-error: true|false');
  if (continueOnError === 'true' && output === undefined)
    throw new Error('continue-on-error=true requires an explicit output path');
  return {
    seeds,
    years,
    difficulty: difficulty as Difficulty,
    ...(output === undefined ? {} : { output }),
    ...(csvOutput === undefined ? {} : { csvOutput }),
    ...(monthlyOutput === undefined ? {} : { monthlyOutput }),
    ...(seed === undefined ? {} : { seed }),
    ...(verifyRepeat === undefined ? {} : { verifyRepeat: verifyRepeat === 'true' }),
    ...(continueOnError === undefined ? {} : { continueOnError: continueOnError === 'true' }),
  };
}

/** Long-form monthly data; retained dead clans have explicit rows rather than disappearing. */
export function simulationMonthlyCsv(runs: readonly SimulateRunSummary[]): string {
  const rows = ['seed,day,year,month,clanId,kokudaka,castleCount,soldiers,gold,prestige,alive'];
  for (const run of runs)
    for (const sample of run.monthlySamples)
      for (const clan of sample.clans)
        rows.push(
          [
            run.seed,
            sample.day,
            sample.year,
            sample.month,
            clan.clanId,
            clan.kokudaka,
            clan.castleCount,
            clan.soldiers,
            clan.gold,
            clan.prestige,
            clan.alive,
          ].join(','),
        );
  return rows.join('\n') + '\n';
}

/** Plan15 §5.6: one row per observed year/month, one koku column per clan. */
export function simulationCsv(runs: readonly SimulateRunSummary[]): string {
  const clanIds = [
    ...new Set(
      runs.flatMap((run) =>
        run.monthlySamples.flatMap((sample) => sample.clans.map((clan) => clan.clanId)),
      ),
    ),
  ].sort();
  const rows = [['seed', 'year', 'month', ...clanIds].join(',')];
  for (const run of runs)
    for (const sample of run.monthlySamples) {
      const values = new Map(sample.clans.map((clan) => [clan.clanId, clan.kokudaka]));
      rows.push(
        [run.seed, sample.year, sample.month, ...clanIds.map((id) => values.get(id) ?? '')].join(
          ',',
        ),
      );
    }
  return rows.join('\n') + '\n';
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

async function main(): Promise<void> {
  const {
    seeds,
    seed: singleSeed,
    years,
    difficulty,
    output,
    csvOutput,
    monthlyOutput,
    verifyRepeat,
    continueOnError,
  } = parseSimulateOptions(process.argv.slice(2));
  const scenario = await loadS1560Scenario();
  const playerClanId = (scenario.clans.find((clan) => clan.id === 'clan.oda')?.id ??
    scenario.clans[0]!.id) as ClanId;
  const runs: SimulateRunSummary[] = [];
  const repeatRuns: SimulateRunSummary[] | null = verifyRepeat ? [] : null;
  const failedRuns: SimulationRunFailure[] = [];
  const requestedSeeds =
    singleSeed === undefined
      ? Array.from({ length: seeds }, (_, index) => index + 1)
      : [singleSeed];
  for (const seed of requestedSeeds) {
    const createState = () =>
      buildGameStateFromScenario(scenario, {
        appVersion: 'simulate',
        seed,
        playerClanId,
        difficulty,
        startDay: calendarToDay(1560, 4, 1),
      });
    let phase: SimulationRunFailure['phase'] = 'primary';
    let state: GameState | null = null;
    try {
      state = createState();
      const run = simulateAiGame(state, years, () => performance.now(), {
        eventEngine: createRuntimeEventEngine(loadS1560EventCatalog()),
        stopOnUnification: false,
      });
      runs.push(run);
      process.stderr.write(
        `seed=${seed} phase=primary years=${run.yearsSimulated} rejects=${run.hardRejections} invalid=${run.invalidDecisionCount} historical=${run.historicalEventCount}\n`,
      );
      if (repeatRuns !== null) {
        phase = 'repeat';
        state = null;
        state = createState();
        repeatRuns.push(
          simulateAiGame(state, years, () => 0, {
            eventEngine: createRuntimeEventEngine(loadS1560EventCatalog()),
            stopOnUnification: false,
          }),
        );
        process.stderr.write(`seed=${seed} phase=repeat complete\n`);
      }
    } catch (error: unknown) {
      if (!continueOnError) throw error;
      const failure = recordSimulationFailure(seed, phase, state?.time.day ?? null, error);
      failedRuns.push(failure);
      process.stderr.write(JSON.stringify(failure) + '\n');
    }
  }
  const unifiedYears = runs
    .flatMap((run) => (run.unifiedYear === null ? [] : [run.unifiedYear]))
    .sort((a, b) => a - b);
  const summary: SimulateSummary = {
    runs,
    unificationRate: runs.length ? unifiedYears.length / runs.length : null,
    medianUnifiedYear: median(unifiedYears),
    medianHistoricalEventCount: median(runs.map((run) => run.historicalEventCount)),
    difficulty,
    survivalRateByClan: Object.fromEntries(
      [...new Set(runs.flatMap((run) => run.clanStats.map((clan) => clan.clanId)))]
        .sort()
        .map((clanId) => [
          clanId,
          runs.filter((run) => run.clanStats.find((entry) => entry.clanId === clanId)?.survived)
            .length / runs.length,
        ]),
    ),
    loadedRegions: S1560_LOADED_REGIONS,
    survivalRateAtYear10: aggregateTenYearSurvival(
      runs,
      [...new Set(runs.flatMap((run) => run.clanStats.map((clan) => clan.clanId)))].sort(),
    ),
    acceptance: invalidateFailedSimulationAcceptance(
      evaluateSimulationAcceptance(runs, years),
      failedRuns,
    ),
    balanceAcceptance: invalidateFailedSimulationAcceptance(
      evaluateBalanceAcceptance(runs, years, repeatRuns ?? undefined),
      failedRuns,
    ),
    historicalAcceptance: invalidateFailedSimulationAcceptance(
      evaluateHistoricalEventAcceptance(runs, years),
      failedRuns,
    ),
    repeatRuns,
    requestedSeeds,
    failedRuns,
  };
  const report = JSON.stringify(summary, null, 2) + '\n';
  writeFileSync(
    output ?? fileURLToPath(new URL('../tests/perf/simulate-report.json', import.meta.url)),
    report,
  );
  if (csvOutput !== undefined) writeFileSync(csvOutput, simulationCsv(runs));
  if (monthlyOutput !== undefined) writeFileSync(monthlyOutput, simulationMonthlyCsv(runs));
  process.stdout.write(report);
  if (failedRuns.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
