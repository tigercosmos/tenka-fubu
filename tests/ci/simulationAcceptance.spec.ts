import { describe, expect, it } from 'vitest';
import type { SimulateRunSummary } from '../../src/core/systems/ai/simulation';
import {
  aggregateTenYearSurvival,
  evaluateSimulationAcceptance,
} from '../../tools/ci/simulation-acceptance';

const targets = ['clan.takeda', 'clan.mori', 'clan.hojo', 'clan.shimazu', 'clan.imagawa'];
function run(seed: number): SimulateRunSummary {
  return {
    seed,
    yearsSimulated: 25,
    unifiedByClanId: seed <= 10 ? 'clan.oda' : null,
    unifiedYear: seed <= 10 ? 1575 : null,
    clanStats: ['clan.oda', ...targets].map((clanId) => ({
      clanId,
      survived: clanId === 'clan.oda' ? seed <= 12 : seed <= 14,
      castleCount: (clanId === 'clan.oda' ? seed <= 12 : seed <= 14) ? 1 : 0,
      kokudaka: (clanId === 'clan.oda' ? seed <= 12 : seed <= 14) ? 1 : 0,
      peakKokudaka: 1,
      destroyedYear: (clanId === 'clan.oda' ? seed <= 12 : seed <= 14) ? null : 1568,
    })),
    totalBattles: 0,
    totalSieges: 0,
    avgTickMs: 7.999,
    hardRejections: 0,
    invalidDecisionCount: 0,
    survivalAtYear10: Object.fromEntries(targets.map((id) => [id, seed <= 14])),
    historicalEventCount: 0,
    historicalEventCounts: {},
    monthlySamples: [],
    yearOfFirst2MKoku: null,
    first2MKokuDay: null,
    elapsedYearsToFirst2MKoku: null,
    survivalAtYear20: {},
    survivingClans: 6,
    maxClanKokudaka: 1,
    top3: [],
    odaSurvivedYears: 25,
  };
}
function runs() {
  return Array.from({ length: 20 }, (_, i) => run(i + 1));
}

describe('18 §5.4 simulation acceptance (not the separate15 criteria)', () => {
  it('recomputes all inclusive boundaries from actual run records without mutating them', () => {
    const input = runs();
    const before = JSON.stringify(input);
    const result = evaluateSimulationAcceptance(input, 25);
    expect(result.status).toBe('pass');
    expect(result.reasons).toEqual([]);
    expect(result.metrics).toMatchObject({
      unificationRate: 0.5,
      medianUnifiedYear: 1575,
      odaSurvivalRateAtYear25: 0.6,
      survivalRateAtYear10: Object.fromEntries(targets.map((id) => [id, 0.7])),
    });
    expect(JSON.stringify(input)).toBe(before);
    input.forEach((r) => {
      if (r.unifiedYear !== null) r.unifiedYear = 1585;
    });
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('pass');
  });
  it.each(['unification', 'year', 'oda', 'ten-year', 'perf'])(
    'fails below/over the %s boundary',
    (kind) => {
      const input = runs();
      if (kind === 'unification') {
        input[0]!.unifiedByClanId = null;
        input[0]!.unifiedYear = null;
      }
      if (kind === 'year')
        input.forEach((r) => {
          if (r.unifiedYear !== null) r.unifiedYear = 1574;
        });
      if (kind === 'oda') {
        input[0]!.clanStats[0]!.survived = false;
        input[0]!.clanStats[0]!.destroyedYear = 1580;
      }
      if (kind === 'ten-year') {
        input[0]!.survivalAtYear10['clan.mori'] = false;
        const mori = input[0]!.clanStats.find((c) => c.clanId === 'clan.mori')!;
        mori.survived = false;
        mori.destroyedYear = 1568;
      }
      if (kind === 'perf')
        input.forEach((r) => {
          r.avgTickMs = 8;
        });
      expect(evaluateSimulationAcceptance(input, 25).status).toBe('fail');
    },
  );
  it.each([NaN, Infinity, -1])('does not pass nonfinite/negative timing %s', (value) => {
    const input = runs();
    input[0]!.avgTickMs = value;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
    expect(evaluateSimulationAcceptance(input, 25).metrics.meanAvgTickMs).toBeNull();
  });
  it('requires25 requested years and20 unique seeds, without weighting duplicates', () => {
    expect(evaluateSimulationAcceptance(runs().slice(0, 19), 25).status).toBe('incomplete');
    const input = runs();
    input[19]!.seed = input[0]!.seed;
    expect(evaluateSimulationAcceptance(input, 25).reasons.map((r) => r.code)).toContain(
      'duplicate-seed',
    );
    expect(evaluateSimulationAcceptance(runs(), 10).status).toBe('incomplete');
  });
  it('rejects incomplete survival evidence rather than counting missing data as death', () => {
    const input = runs();
    delete input[0]!.survivalAtYear10['clan.mori'];
    input[1]!.clanStats = input[1]!.clanStats.filter((c) => c.clanId !== 'clan.oda');
    const result = evaluateSimulationAcceptance(input, 25);
    expect(result.status).toBe('incomplete');
    expect(result.metrics.survivalRateAtYear10['clan.mori']).toBeNull();
    expect(result.metrics.odaSurvivalRateAtYear25).toBeNull();
  });
  it('never extrapolates early unification into ten/25-year survival', () => {
    const input = runs();
    input[0]!.yearsSimulated = 9;
    input[0]!.survivalAtYear10 = {};
    const result = evaluateSimulationAcceptance(input, 25);
    expect(result.status).toBe('incomplete');
    expect(result.reasons.map((r) => r.code)).toContain('early-unification-survival-unobserved');
    expect(result.metrics.odaSurvivalRateAtYear25).toBeNull();
  });
  it('requires consistent unification facts and exactly25 observed years', () => {
    const input = runs();
    input[0]!.unifiedYear = null;
    input[1]!.yearsSimulated = 26;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
    input[0]!.unifiedYear = 1575;
    input[1]!.yearsSimulated = 25;
    input[0]!.clanStats.push({ ...input[0]!.clanStats[0]! });
    expect(evaluateSimulationAcceptance(input, 25).reasons.map((r) => r.code)).toContain(
      'duplicate-clan',
    );
  });
  it('aggregates only own, actually observed ten-year values for the additive CLI summary', () => {
    const input = runs();
    expect(aggregateTenYearSurvival(input, ['clan.mori', 'clan.absent'])).toEqual({
      'clan.mori': 0.7,
      'clan.absent': null,
    });
    input[0]!.yearsSimulated = 9;
    expect(aggregateTenYearSurvival(input, ['clan.mori'])).toEqual({ 'clan.mori': null });
    input[0]!.yearsSimulated = 25;
    input[0]!.survivalAtYear10 = Object.create({ 'clan.mori': true }) as Record<string, boolean>;
    expect(aggregateTenYearSurvival(input, ['clan.mori'])).toEqual({ 'clan.mori': null });
  });
  it('rejects malformed seed identities and empty workloads deterministically', () => {
    const input = runs();
    input[0]!.seed = NaN;
    const result = evaluateSimulationAcceptance(input, 25);
    expect(result.status).toBe('incomplete');
    expect(result.metrics.unificationRate).toBeNull();
    expect(evaluateSimulationAcceptance([], 25).status).toBe('incomplete');
    expect(evaluateSimulationAcceptance(runs(), NaN).status).toBe('incomplete');
  });
  it('rejects impossible future victory years even when their median is within the target band', () => {
    const input = runs();
    input.slice(0, 5).forEach((r) => {
      r.unifiedYear = 1570;
    });
    input.slice(5, 10).forEach((r) => {
      r.unifiedYear = 1590;
    });
    const result = evaluateSimulationAcceptance(input, 25);
    expect(result.status).toBe('incomplete');
    expect(result.reasons.map((r) => r.code)).toContain('invalid-unification-observation');
    input[0]!.unifiedYear = 1559;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
  });
  it.each([undefined, null, [], true])(
    'marks malformed/missing checkpoint map %s incomplete without throwing',
    (checkpoint) => {
      const input = runs();
      input[0]!.survivalAtYear10 = checkpoint as unknown as Record<string, boolean>;
      expect(() => evaluateSimulationAcceptance(input, 25)).not.toThrow();
      expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
      expect(aggregateTenYearSurvival(input, ['clan.mori'])).toEqual({ 'clan.mori': null });
    },
  );
  it.each([
    'survivor-death',
    'dead-null',
    'dead-future',
    'pre-ten-alive',
    'post-ten-dead',
    'resurrection',
  ])('rejects contradictory lifetime %s observations', (kind) => {
    const input = runs();
    const mori = input[0]!.clanStats.find((c) => c.clanId === 'clan.mori')!;
    if (kind === 'survivor-death') mori.destroyedYear = 1580;
    if (kind === 'dead-null') mori.survived = false;
    if (kind === 'dead-future') {
      mori.survived = false;
      mori.destroyedYear = 1590;
    }
    if (kind === 'pre-ten-alive') {
      mori.survived = false;
      mori.destroyedYear = 1569;
    }
    if (kind === 'post-ten-dead') {
      mori.survived = false;
      mori.destroyedYear = 1571;
      input[0]!.survivalAtYear10['clan.mori'] = false;
    }
    if (kind === 'resurrection') input[0]!.survivalAtYear10['clan.mori'] = false;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
  });
  it.each([true, false])(
    'allows either ten-year observation for a death in ambiguous calendar1570: %s',
    (observed) => {
      const input = runs();
      const mori = input[0]!.clanStats.find((c) => c.clanId === 'clan.mori')!;
      mori.survived = false;
      mori.destroyedYear = 1570;
      input[0]!.survivalAtYear10['clan.mori'] = observed;
      expect(
        evaluateSimulationAcceptance(input, 25).reasons.some((r) => r.kind === 'incomplete'),
      ).toBe(false);
    },
  );
  it('retains general CLI ten-year observations beyond the fixed25-year acceptance window', () => {
    const input = runs();
    input.forEach((r) => {
      r.yearsSimulated = 30;
    });
    const mori = input[0]!.clanStats.find((c) => c.clanId === 'clan.mori')!;
    mori.survived = false;
    mori.destroyedYear = 1588;
    expect(aggregateTenYearSurvival([input[0]!], ['clan.mori'])).toEqual({ 'clan.mori': 1 });
    expect(evaluateSimulationAcceptance(input, 30).status).toBe('incomplete');
  });
  it('rejects victory after the winner ceased to exist, without requiring final survival', () => {
    const input = runs();
    input[14]!.unifiedByClanId = 'clan.mori';
    input[14]!.unifiedYear = 1575;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('incomplete');
    const winner = input[14]!.clanStats.find((c) => c.clanId === 'clan.mori')!;
    winner.destroyedYear = 1575;
    input[14]!.survivalAtYear10['clan.mori'] = true;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('pass');
    winner.destroyedYear = 1580;
    expect(evaluateSimulationAcceptance(input, 25).status).toBe('pass');
  });
});
