import { describe, expect, it } from 'vitest';
import { evaluateHistoricalEventAcceptance } from '../../tools/ci/historical-event-acceptance';
import { invalidateFailedSimulationAcceptance } from '../../tools/ci/simulation-failures';
import { loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { dayToCalendar } from '../../src/core/systems/time';

// Synthetic observation fixtures exercise the checker, not actual campaign success.
function runs(count = 20, fires = 8) {
  const ids = loadS1560EventCatalog()
    .filter((event) => event.kind === 'historical')
    .map((event) => event.id);
  return Array.from({ length: count }, (_, seed) => ({
    seed,
    yearsSimulated: 25,
    historicalEventCount: fires,
    historicalEventCounts: Object.fromEntries(ids.slice(0, fires).map((id) => [id, 1])),
    monthlySamples: Array.from({ length: 301 }, (_, index) => {
      const day = 90 + index * 30;
      const calendar = dayToCalendar(day);
      return {
        day,
        year: calendar.year,
        month: calendar.month,
        clans: [
          {
            clanId: 'clan.fixture',
            kokudaka: 100,
            gold: 100,
            prestige: 100,
            soldiers: 10,
            castleCount: 1,
            alive: true,
          },
        ],
      };
    }),
  }));
}
describe('10-T6 historical-event observation acceptance', () => {
  it.each([20, 21])('accepts inclusive median eight and %s unique seeds', (count) => {
    expect(evaluateHistoricalEventAcceptance(runs(count), 25)).toMatchObject({
      status: 'pass',
      metrics: { medianHistoricalEventCount: 8 },
    });
  });
  it('fails seven and preserves the actual median', () => {
    expect(evaluateHistoricalEventAcceptance(runs(20, 7), 25)).toMatchObject({
      status: 'fail',
      metrics: { medianHistoricalEventCount: 7 },
    });
  });
  it('fails the even-distribution median seven-and-a-half', () => {
    const input = runs();
    for (let index = 0; index < 10; index++) input[index] = { ...runs(1, 7)[0]!, seed: index };
    expect(evaluateHistoricalEventAcceptance(input, 25)).toMatchObject({
      status: 'fail',
      metrics: { medianHistoricalEventCount: 7.5 },
    });
  });
  it('accepts explicit canonical zero counts without inventing fires', () => {
    const input = runs();
    const unused = loadS1560EventCatalog().filter((event) => event.kind === 'historical')[14]!.id;
    for (const run of input) run.historicalEventCounts[unused] = 0;
    expect(evaluateHistoricalEventAcceptance(input, 25)).toMatchObject({
      status: 'pass',
      metrics: { medianHistoricalEventCount: 8 },
    });
  });
  it('uses the distribution median rather than requiring every seed to fire eight', () => {
    const input = runs();
    input[0] = runs(1, 0)[0]!;
    expect(evaluateHistoricalEventAcceptance(input, 25).status).toBe('pass');
  });
  it.each([
    'duplicate',
    'invalid',
    'short',
    'missing-month',
    'shifted',
    'calendar',
    'total',
    'generic',
    'twice',
    'missing-map',
    'empty-clans',
    'changed-clans',
    'nonfinite-resource',
  ])('rejects incomplete or inconsistent %s evidence without a median claim', (fault) => {
    const input = runs();
    const first = input[0]!;
    if (fault === 'duplicate') first.seed = input[1]!.seed;
    if (fault === 'invalid') first.seed = NaN;
    if (fault === 'short') first.yearsSimulated = 24;
    if (fault === 'missing-month') first.monthlySamples.splice(5, 1);
    if (fault === 'shifted') first.monthlySamples[0]!.day = 0;
    if (fault === 'calendar') first.monthlySamples[2]!.month = 13;
    if (fault === 'empty-clans') first.monthlySamples[2]!.clans = [];
    if (fault === 'changed-clans') first.monthlySamples[2]!.clans[0]!.clanId = 'clan.other';
    if (fault === 'nonfinite-resource') first.monthlySamples[2]!.clans[0]!.gold = NaN;
    if (fault === 'total') first.historicalEventCount++;
    if (fault === 'generic') first.historicalEventCounts['evt.fake-generic'] = 1;
    if (fault === 'twice')
      first.historicalEventCounts[Object.keys(first.historicalEventCounts)[0]!] = 2;
    if (fault === 'missing-map')
      first.historicalEventCounts = null as unknown as Record<string, number>;
    expect(evaluateHistoricalEventAcceptance(input, 25)).toMatchObject({
      status: 'incomplete',
      metrics: { medianHistoricalEventCount: null },
    });
  });
  it('requires at least twenty seeds and the requested full window', () => {
    expect(evaluateHistoricalEventAcceptance(runs(19), 25).status).toBe('incomplete');
    expect(evaluateHistoricalEventAcceptance(runs(), 24).status).toBe('incomplete');
    expect(evaluateHistoricalEventAcceptance([], 25).metrics.medianHistoricalEventCount).toBeNull();
  });
  it('checks canonical catalog completeness, duplicate IDs and historical once semantics', () => {
    const catalog = loadS1560EventCatalog();
    for (const invalid of [
      catalog.slice(1),
      [...catalog, catalog[0]!],
      catalog.map((entry) => ({ ...entry, trigger: { ...entry.trigger, once: false } })),
    ])
      expect(evaluateHistoricalEventAcceptance(runs(), 25, invalid).status).toBe('incomplete');
  });
  it('preserves every failed seed and never passes completed survivors alone', () => {
    const original = evaluateHistoricalEventAcceptance(runs(), 25);
    const failures = [
      { seed: 99, phase: 'primary' as const, day: 450, error: 'original INV02' },
      { seed: 1, phase: 'repeat' as const, day: null, error: 'setup' },
    ];
    const before = structuredClone({ original, failures });
    expect(invalidateFailedSimulationAcceptance(original, failures)).toMatchObject({
      status: 'incomplete',
      reasons: [
        { code: 'primary-simulation-failed', seed: 99 },
        { code: 'repeat-simulation-failed', seed: 1 },
      ],
    });
    expect({ original, failures }).toEqual(before);
  });
  it('does not mutate observations or catalog', () => {
    const input = runs();
    const catalog = loadS1560EventCatalog();
    const before = structuredClone({ input, catalog });
    evaluateHistoricalEventAcceptance(input, 25, catalog);
    expect({ input, catalog }).toEqual(before);
  });
});
