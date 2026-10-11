import { describe, expect, it } from 'vitest';
import { simulateAiGame, observeSimulationState } from '../../src/core/systems/ai/simulation';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId, EventId } from '../../src/core/state/ids';
import type { EventDef } from '../../src/core/systems/events/types';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import {
  median,
  parseSimulateOptions,
  simulationCsv,
  simulationMonthlyCsv,
} from '../../tools/simulate';
import { dayToCalendar } from '../../src/core/systems/time';

function definition(kind: EventDef['kind']): EventDef {
  return {
    id: `evt.sim-${kind}` as EventId,
    kind,
    priority: 1,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
    cutscene: { title: 'Fixture', body: 'Fixture', monClanId: null },
    trigger: {
      from: null,
      to: null,
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    effects: [],
    choices: [
      {
        label: 'A',
        conditions: [],
        aiWeight: 3,
        effects: [{ op: 'setFlag', key: `selected.${kind}.A`, value: 1 }],
      },
      {
        label: 'B',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'setFlag', key: `selected.${kind}.B`, value: 1 }],
      },
    ],
  };
}

describe('long-run simulator actual event coverage', () => {
  it('counts historical fires only and uses weighted AI choice for the selected human clan', () => {
    const state = buildTinyState();
    const before = structuredClone(state.rng.event);
    const summary = simulateAiGame(state, 30 / 360, undefined, {
      eventEngine: createRuntimeEventEngine([definition('historical'), definition('generic')]),
      stopOnUnification: false,
    });
    expect(summary.historicalEventCount).toBe(1);
    expect(summary.historicalEventCounts).toEqual({ 'evt.sim-historical': 1 });
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.rng.event).not.toEqual(before);
    expect(
      Object.keys(state.events.flags).filter((key) => key.startsWith('selected.')),
    ).toHaveLength(2);
  });

  it('preserves lightweight no-engine fixtures', () => {
    // Use the genuine unchanged tiny fixture for no-engine legacy behavior.
    const normal = simulateAiGame(buildTinyState(), 1 / 360);
    expect(normal.historicalEventCount).toBe(0);
    expect(normal.historicalEventCounts).toEqual({});
    expect(normal.odaSurvivedYears).toBeNull();
  });

  it('samples actual month-start resources without mutating state or retaining aliases', () => {
    const state = buildTinyState();
    const hash = stateHash(state);
    const initial = observeSimulationState(state);
    expect(stateHash(state)).toBe(hash);
    const result = simulateAiGame(state, 30 / 360, undefined, { stopOnUnification: false });
    expect(result.monthlySamples.map((sample) => sample.day)).toEqual([
      initial.day,
      initial.day + 30,
    ]);
    expect(result.monthlySamples[0]).toEqual(initial);
    expect(result.monthlySamples.at(-1)).toEqual(observeSimulationState(state));
    for (const sample of result.monthlySamples)
      expect(sample.clans.map((clan) => clan.clanId)).toEqual(
        [...sample.clans.map((clan) => clan.clanId)].sort(),
      );
    const current = observeSimulationState(state);
    expect(result.survivingClans).toBe(current.clans.filter((clan) => clan.alive).length);
    expect(result.maxClanKokudaka).toBe(Math.max(...current.clans.map((clan) => clan.kokudaka)));
    expect(result.top3).toEqual(
      current.clans
        .map(({ clanId, kokudaka }) => ({ clanId, kokudaka }))
        .sort((a, b) => b.kokudaka - a.kokudaka || a.clanId.localeCompare(b.clanId))
        .slice(0, 3),
    );
    const csv = simulationMonthlyCsv([result]);
    expect(csv).toContain(
      'seed,day,year,month,clanId,kokudaka,castleCount,soldiers,gold,prestige,alive',
    );
    expect(csv.split('\n')).toHaveLength(
      2 + result.monthlySamples.flatMap((sample) => sample.clans).length,
    );
    const wide = simulationCsv([result]).trim().split('\n');
    const ids = current.clans.map((clan) => clan.clanId).sort();
    expect(wide[0]).toBe(['seed', 'year', 'month', ...ids].join(','));
    expect(wide).toHaveLength(1 + result.monthlySamples.length);
    for (const [index, sample] of result.monthlySamples.entries())
      expect(wide[index + 1]).toBe(
        [
          result.seed,
          sample.year,
          sample.month,
          ...ids.map((id) => sample.clans.find((clan) => clan.clanId === id)!.kokudaka),
        ].join(','),
      );
    state.clans[CLAN_ALPHA]!.gold += 1;
    expect(result.monthlySamples.at(-1)).toEqual(current);
  });

  it('records the actual first threshold calendar year without waiting for month sampling', () => {
    const state = buildTinyState();
    const day = 1439;
    state.time = { day, ...dayToCalendar(day) };
    const district = Object.values(state.districts)[0]!;
    district.kokudaka = 2_000_000;
    district.kokudakaCap = 2_000_000;
    expect(validateState(state)).toEqual([]);
    const result = simulateAiGame(state, 1 / 360, undefined, { stopOnUnification: false });
    expect(result.yearOfFirst2MKoku).toBe(1563);
    expect(result.first2MKokuDay).toBe(day);
    expect(result.elapsedYearsToFirst2MKoku).toBe(0);
    expect(result.monthlySamples[0]?.year).toBe(1564);
  });

  it('records distinct ten- and twenty-year observation checkpoints from real ticks', () => {
    const game = buildTinyState();
    const start = game.time.day;
    const result = simulateAiGame(game, 20, undefined, { stopOnUnification: false });
    expect(game.time.day).toBe(start + 7200);
    expect(Object.keys(result.survivalAtYear10).sort()).toEqual(Object.keys(game.clans).sort());
    expect(result.survivalAtYear20).toEqual(
      Object.fromEntries(Object.values(game.clans).map((clan) => [clan.id, clan.alive])),
    );
    expect(result.monthlySamples).toHaveLength(241);
  });

  it('keeps the first unification year while observing later historical events', () => {
    function state() {
      const game = buildTinyState();
      ensureDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA).pacts.push({
        kind: 'vassal',
        startDay: 0,
        endDay: null,
        vassalClanId: CLAN_BETA,
      });
      expect(validateState(game)).toEqual([]);
      return game;
    }
    const early = simulateAiGame(state(), 30 / 360);
    expect(early.yearsSimulated).toBe(1 / 360);
    const game = state();
    const full = simulateAiGame(game, 30 / 360, undefined, {
      eventEngine: createRuntimeEventEngine([definition('historical')]),
      stopOnUnification: false,
    });
    expect(full.yearsSimulated).toBe(30 / 360);
    expect(full.unifiedYear).toBe(early.unifiedYear);
    expect(full.historicalEventCount).toBe(1);
    expect(validateState(game)).toEqual([]);
  });

  it('runs genuine unmodified production catalog events reproducibly with no pending human choice', async () => {
    const bundle = await loadS1560Scenario();
    function run() {
      const state = buildGameStateFromScenario(bundle, {
        appVersion: 'sim-event-test',
        seed: 42,
        playerClanId: 'clan.oda' as ClanId,
        difficulty: 'normal',
      });
      const result = simulateAiGame(state, 120 / 360, undefined, {
        eventEngine: createRuntimeEventEngine(loadS1560EventCatalog()),
        stopOnUnification: false,
      });
      expect(result.historicalEventCount).toBeGreaterThan(0);
      expect(result.historicalEventCounts['evt.okehazama']).toBe(1);
      expect(result.hardRejections).toBe(0);
      expect(result.invalidDecisionCount).toBe(0);
      const oda = state.clans['clan.oda' as ClanId]!;
      expect(result.odaSurvivedYears).toBe(
        Math.min(120, Math.max(0, oda.destroyedDay ?? state.time.day)) / 360,
      );
      expect(state.events.pendingChoiceEventId).toBeNull();
      expect(validateState(state)).toEqual([]);
      return { result, hash: stateHash(state), rng: state.rng };
    }
    expect(run()).toEqual(run());
  });

  it('validates native difficulty options and computes even/odd medians without changing inputs', () => {
    expect(parseSimulateOptions([])).toEqual({ seeds: 5, years: 10, difficulty: 'normal' });
    expect(parseSimulateOptions(['--seeds=20', '--years=25', '--difficulty=hard'])).toEqual({
      seeds: 20,
      years: 25,
      difficulty: 'hard',
    });
    expect(() => parseSimulateOptions(['--difficulty=impossible'])).toThrow();
    expect(
      parseSimulateOptions(['--output=/tmp/tenka-simulator-production-smoke.json']).output,
    ).toBe('/tmp/tenka-simulator-production-smoke.json');
    expect(() => parseSimulateOptions(['--output='])).toThrow();
    expect(parseSimulateOptions(['--csv-output=/tmp/sim.csv']).csvOutput).toBe('/tmp/sim.csv');
    expect(() => parseSimulateOptions(['--csv-output='])).toThrow();
    expect(parseSimulateOptions(['--seed=42']).seed).toBe(42);
    expect(parseSimulateOptions(['--out=/tmp/wide.csv']).csvOutput).toBe('/tmp/wide.csv');
    expect(parseSimulateOptions(['--monthly-output=/tmp/detail.csv']).monthlyOutput).toBe(
      '/tmp/detail.csv',
    );
    for (const args of [
      ['--seed=42', '--seeds=1'],
      ['--seed=42=oops'],
      ['--seeds=1=oops'],
      ['--years=2=oops'],
      ['years=2'],
      ['--seed'],
      ['--years=2', '--years=3'],
      ['--unknown=1'],
      ['--out=a', '--csv-output=b'],
      ['--monthly-output='],
    ])
      expect(() => parseSimulateOptions(args), args.join(' ')).toThrow();
    expect(median([5, 1, 3])).toBe(3);
    const values = [4, 1, 3, 2];
    expect(median(values)).toBe(2.5);
    expect(values).toEqual([4, 1, 3, 2]);
    expect(median([])).toBeNull();
  });
});
