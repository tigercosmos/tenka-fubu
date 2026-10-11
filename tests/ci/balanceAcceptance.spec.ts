import { describe, expect, it } from 'vitest';
import { evaluateBalanceAcceptance } from '../../tools/ci/balance-acceptance';
import type { SimulateRunSummary } from '../../src/core/systems/ai/simulation';
import { dayToCalendar } from '../../src/core/systems/time';
import { simulationCsv } from '../../tools/simulate';

/** Synthetic observation reports test evaluator boundaries, not historical gameplay. */
function runs(elapsed = 15): SimulateRunSummary[] {
  return Array.from({ length: 20 }, (_, n) => {
    const start = 90;
    const monthlySamples = Array.from({ length: 241 }, (_, i) => {
      const day = start + i * 30;
      const calendar = dayToCalendar(day);
      return {
        day,
        year: calendar.year,
        month: calendar.month,
        clans: ['clan.oda', 'clan.a', 'clan.b', 'clan.c'].map((clanId) => ({
          clanId,
          kokudaka: Math.min(2_000_000, 100_000 + (1_900_000 * i) / (elapsed * 12)),
          gold: 1000,
          castleCount: 1,
          soldiers: 1000,
          prestige: 100,
          alive: clanId !== 'clan.oda' || i < 240 || n < 9,
        })),
      };
    });
    const final = monthlySamples.at(-1)!;
    return {
      seed: n + 1,
      yearsSimulated: 20,
      unifiedByClanId: null,
      unifiedYear: null,
      clanStats: final.clans.map((c) => ({
        clanId: c.clanId,
        survived: c.alive,
        castleCount: c.castleCount,
        kokudaka: c.kokudaka,
        peakKokudaka: c.kokudaka,
        destroyedYear: c.alive ? null : 1580,
      })),
      totalBattles: 0,
      totalSieges: 0,
      avgTickMs: 10,
      hardRejections: 0,
      invalidDecisionCount: 0,
      survivalAtYear10: {},
      survivalAtYear20: { 'clan.oda': n < 9 },
      historicalEventCount: 0,
      historicalEventCounts: {},
      monthlySamples,
      yearOfFirst2MKoku: dayToCalendar(start + elapsed * 360).year,
      first2MKokuDay: start + elapsed * 360,
      elapsedYearsToFirst2MKoku: elapsed,
      survivingClans: final.clans.filter((c) => c.alive).length,
      maxClanKokudaka: 2_000_000,
      top3: [],
      odaSurvivedYears: n < 9 ? 20 : 19.99,
    };
  });
}
const evaluate = (input = runs(), repeat = structuredClone(input)) =>
  evaluateBalanceAcceptance(input, 20, repeat);
describe('15 §5.6 balance acceptance from actual observation fields', () => {
  it.each([
    [NaN, Infinity],
    [Infinity, -Infinity],
    [-Infinity, NaN],
  ])('distinguishes literal nonfinite CSV cells %s versus %s', (primary, repeated) => {
    const input = runs();
    input[0]!.monthlySamples[200]!.clans[0]!.kokudaka = primary;
    const repeat = structuredClone(input);
    repeat[0]!.monthlySamples[200]!.clans[0]!.kokudaka = repeated;
    expect(simulationCsv(input)).not.toBe(simulationCsv(repeat));
    const result = evaluate(input, repeat);
    expect(result.status).toBe('fail');
    expect(result.metrics.repeatCsvEqual).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])(
    'reports equal literal CSV cells %s while still failing resource validity',
    (value) => {
      const input = runs();
      input[0]!.monthlySamples[200]!.clans[0]!.kokudaka = value;
      const repeat = structuredClone(input);
      expect(simulationCsv(input)).toBe(simulationCsv(repeat));
      const result = evaluate(input, repeat);
      expect(result.status).toBe('fail');
      expect(result.metrics.repeatCsvEqual).toBe(true);
      expect(result.reasons).toContainEqual(
        expect.objectContaining({ kind: 'fail', code: 'nonfinite-monthly-resource' }),
      );
    },
  );

  it('reports no repeat evidence when neither batch has any completed run', () => {
    const result = evaluateBalanceAcceptance([], 25, []);
    expect(result.status).toBe('incomplete');
    expect(result.metrics.repeatCsvEqual).toBeNull();
  });

  it.each([12, 15, 20])(
    'accepts inclusive convergence boundary %i with forty-five-percent Oda survival',
    (years) => {
      const result = evaluate(runs(years));
      expect(result.status).toBe('pass');
      expect(result.specification).toBe('15 §5.6');
      expect(result.metrics).toEqual({
        medianElapsedYearsToFirst2MKoku: years,
        odaSurvivalRateAtYear20: 0.45,
        medianFinalAliveClans: 3,
        repeatCsvEqual: true,
      });
    },
  );
  it('does not mutate observations', () => {
    const input = runs(),
      repeat = structuredClone(input),
      before = JSON.stringify([input, repeat]);
    evaluate(input, repeat);
    expect(JSON.stringify([input, repeat])).toBe(before);
  });
  it('does not confuse fractional final state with the earlier last monthly snapshot', () => {
    const input = runs();
    for (const run of input) {
      run.yearsSimulated = Math.ceil(20.01 * 360) / 360;
      run.clanStats[1]!.kokudaka += 1;
    }
    expect(evaluateBalanceAcceptance(input, 20.01, structuredClone(input)).status).toBe('pass');
  });
  it('observations must match the requested window rather than a later final period', () => {
    const input = runs();
    for (const run of input) run.yearsSimulated = 21;
    expect(evaluate(input).status).toBe('incomplete');
  });
  it('repeat observations also cannot extend beyond the requested final period', () => {
    const input = runs(),
      repeat = structuredClone(input);
    repeat[0]!.yearsSimulated = 21;
    expect(evaluate(input, repeat).status).toBe('incomplete');
  });
  it('all primary seeds must observe the same initial clan catalog without hardcoded count', () => {
    const input = runs();
    for (const sample of input[0]!.monthlySamples) sample.clans[3]!.clanId = 'clan.other';
    input[0]!.clanStats[3]!.clanId = 'clan.other';
    expect(evaluate(input).status).toBe('incomplete');
  });
  it('fractional requested years use the producer exact completed-tick observation', () => {
    const input = runs();
    for (const run of input) run.yearsSimulated = 7201 / 360;
    expect(evaluateBalanceAcceptance(input, 20.001, structuredClone(input)).status).toBe('pass');
  });
  it('accepts a coherent daily nonmonthly threshold without pretending monthly sampling observed that exact day', () => {
    const input = runs();
    for (const run of input) {
      run.first2MKokuDay! -= 1;
      run.elapsedYearsToFirst2MKoku = (run.first2MKokuDay! - 90) / 360;
    }
    expect(evaluate(input).status).toBe('pass');
  });
  it('fails forty-percent equality using the exact twenty-year checkpoint', () => {
    const input = runs();
    input[8]!.survivalAtYear20['clan.oda'] = false;
    input[8]!.monthlySamples.at(-1)!.clans[0]!.alive = false;
    input[8]!.clanStats[0]!.survived = false;
    input[8]!.clanStats[0]!.destroyedYear = 1580;
    input[8]!.survivingClans = 3;
    expect(evaluate(input).status).toBe('fail');
  });
  it('never treats null convergence as a successful observation', () => {
    const input = runs();
    for (const run of input) {
      run.first2MKokuDay = run.yearOfFirst2MKoku = run.elapsedYearsToFirst2MKoku = null;
      for (const sample of run.monthlySamples) for (const c of sample.clans) c.kokudaka = 100_000;
      for (const c of run.clanStats) c.kokudaka = 100_000;
    }
    expect(evaluate(input).status).toBe('fail');
    expect(evaluate(input).metrics.medianElapsedYearsToFirst2MKoku).toBeNull();
  });
  it.each([
    'duplicate',
    'short',
    'missing-month',
    'calendar',
    'clan-set',
    'missing-value',
    'checkpoint',
    'aggregate',
    'first-day',
  ] as const)('rejects incomplete or inconsistent %s evidence', (fault) => {
    const input = runs(),
      run = input[0]!;
    if (fault === 'duplicate') run.seed = input[1]!.seed;
    if (fault === 'short') run.yearsSimulated = 19;
    if (fault === 'missing-month') run.monthlySamples.splice(10, 1);
    if (fault === 'calendar') run.monthlySamples[10]!.month = 13;
    if (fault === 'clan-set') run.monthlySamples[10]!.clans.pop();
    if (fault === 'missing-value')
      run.monthlySamples[10]!.clans[0]!.gold = undefined as unknown as number;
    if (fault === 'checkpoint') run.survivalAtYear20 = {};
    if (fault === 'aggregate') run.survivingClans = 99;
    if (fault === 'first-day') run.first2MKokuDay!++;
    expect(evaluate(input).status).toBe('incomplete');
  });
  it.each([2, 2.001])('gold jump %s uses a strict over-two-times boundary', (multiplier) => {
    const input = runs();
    input[0]!.monthlySamples[1]!.clans[0]!.gold = 1000 * multiplier;
    expect(evaluate(input).status).toBe(multiplier === 2 ? 'pass' : 'fail');
  });
  it.each([NaN, Infinity, -Infinity])(
    'observed nonfinite resource %s fails criterion4',
    (value) => {
      const input = runs();
      input[0]!.monthlySamples[10]!.clans[0]!.gold = value;
      expect(evaluate(input).status).toBe('fail');
    },
  );
  it('includes a censored seed in the median without requiring every seed to converge', () => {
    const input = runs(),
      run = input[0]!;
    run.first2MKokuDay = run.yearOfFirst2MKoku = run.elapsedYearsToFirst2MKoku = null;
    for (const sample of run.monthlySamples) for (const c of sample.clans) c.kokudaka = 100_000;
    for (const c of run.clanStats) c.kokudaka = 100_000;
    expect(evaluate(input).status).toBe('pass');
    expect(evaluate(input).metrics.medianElapsedYearsToFirst2MKoku).toBe(15);
  });
  it('crosschecks floored final stats against fractional monthly koku', () => {
    const input = runs();
    for (const run of input) for (const c of run.monthlySamples.at(-1)!.clans) c.kokudaka += 0.5;
    expect(evaluate(input).status).toBe('pass');
  });
  it('a shifted series cannot replace the actual initial s1560 snapshot', () => {
    const input = runs();
    for (const run of input)
      for (const s of run.monthlySamples) {
        s.day += 30;
        Object.assign(s, dayToCalendar(s.day));
      }
    expect(evaluate(input).status).toBe('incomplete');
  });
  it('flags literal zero-to-positive resource growth without a hidden exemption', () => {
    const input = runs();
    input[0]!.monthlySamples[0]!.clans[0]!.gold = 0;
    expect(evaluate(input).status).toBe('fail');
  });
  it('negative resources fail; missing repeat remains incomplete', () => {
    const input = runs();
    input[0]!.monthlySamples[1]!.clans[0]!.gold = -1;
    expect(evaluate(input).status).toBe('fail');
    expect(evaluateBalanceAcceptance(runs(), 20).status).toBe('incomplete');
  });
  it('compares sorted wide CSV cells only, not elapsed wall time or presentation metadata', () => {
    const input = runs(),
      repeat = structuredClone(input).reverse();
    for (const run of repeat) {
      run.avgTickMs = 999;
      for (const s of run.monthlySamples) {
        s.clans.reverse();
        for (const c of s.clans) c.gold += 1;
      }
    }
    expect(evaluate(input, repeat).status).toBe('pass');
    repeat[0]!.monthlySamples[1]!.clans[0]!.kokudaka++;
    expect(evaluate(input, repeat).metrics.repeatCsvEqual).toBe(false);
    expect(evaluate(input, repeat).status).toBe('fail');
  });
  it('missing or duplicate repeat seeds cannot establish deterministic coverage', () => {
    const input = runs(),
      repeat = structuredClone(input);
    repeat.pop();
    expect(evaluate(input, repeat).status).toBe('incomplete');
    expect(evaluateBalanceAcceptance(input.slice(0, 19), 20, input.slice(0, 19)).status).toBe(
      'incomplete',
    );
    expect(evaluateBalanceAcceptance(input, 19, input).status).toBe('incomplete');
  });
  it.each([null, 42])(
    'invalid monthly clan identity %s returns incomplete rather than throwing',
    (id) => {
      const input = runs();
      input[0]!.monthlySamples[10]!.clans[0]!.clanId = id as unknown as string;
      expect(() => evaluate(input)).not.toThrow();
      expect(evaluate(input).status).toBe('incomplete');
    },
  );
  it('duplicate seed identities do not produce weighted aggregate metrics', () => {
    const input = runs();
    input[0]!.seed = input[1]!.seed;
    expect(evaluate(input).metrics).toEqual({
      medianElapsedYearsToFirst2MKoku: null,
      odaSurvivalRateAtYear20: null,
      medianFinalAliveClans: null,
      repeatCsvEqual: null,
    });
  });
});
