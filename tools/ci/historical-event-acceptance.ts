import type { SimulateRunSummary } from '../../src/core/systems/ai/simulation';
import { dayToCalendar } from '../../src/core/systems/time';
import { loadS1560EventCatalog } from '../../src/data/scenarios/s1560';

type Observation = Pick<
  SimulateRunSummary,
  'seed' | 'yearsSimulated' | 'historicalEventCount' | 'historicalEventCounts' | 'monthlySamples'
>;
type CatalogEntry = { id: string; kind: string; trigger: { once: boolean } };
export interface HistoricalEventAcceptance {
  specification: '10-T6';
  status: 'pass' | 'fail' | 'incomplete';
  runCount: number;
  uniqueSeedCount: number;
  metrics: { medianHistoricalEventCount: number | null };
  reasons: Array<{ kind: 'fail' | 'incomplete'; code: string; seed?: number }>;
}

/** Validate reported observations, not campaign provenance or gameplay correctness.
 * Full s1560 April1,1560–April1,1585 observations are required; early victories
 * and failed runs cannot substitute for the unobserved remainder.
 */
export function evaluateHistoricalEventAcceptance(
  runs: readonly Observation[],
  requestedYears: number,
  catalog: readonly CatalogEntry[] = loadS1560EventCatalog(),
): HistoricalEventAcceptance {
  const reasons: HistoricalEventAcceptance['reasons'] = [];
  const incomplete = (code: string, seed?: number) =>
    reasons.push({ kind: 'incomplete', code, ...(seed === undefined ? {} : { seed }) });
  const historical = new Set<string>();
  const ids = new Set<string>();
  for (const definition of catalog) {
    if (!definition.id || ids.has(definition.id)) incomplete('invalid-event-catalog');
    ids.add(definition.id);
    if (definition.kind === 'historical') {
      historical.add(definition.id);
      if (definition.trigger.once !== true) incomplete('historical-catalog-not-once');
    }
  }
  if (historical.size !== 15) incomplete('historical-catalog-not-fifteen');
  if (requestedYears !== 25) incomplete('requested-window-not-25-years');
  const seeds = new Set<number>();
  const counts: number[] = [];
  for (const run of runs) {
    const before = reasons.length;
    if (!Number.isInteger(run.seed) || run.seed < 0 || run.seed > 0xffffffff || seeds.has(run.seed))
      incomplete('invalid-or-duplicate-seed', run.seed);
    else seeds.add(run.seed);
    const samples = run.monthlySamples;
    if (run.yearsSimulated !== 25 || !Array.isArray(samples) || samples.length !== 301)
      incomplete('observation-window-not-25-years', run.seed);
    else {
      let clanIds: string | null = null;
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];
        const day = 90 + index * 30;
        const calendar = dayToCalendar(day);
        if (
          !sample ||
          sample.day !== day ||
          sample.year !== calendar.year ||
          sample.month !== calendar.month
        ) {
          incomplete('monthly-observation-not-contiguous', run.seed);
          break;
        }
        if (
          !Array.isArray(sample.clans) ||
          !sample.clans.length ||
          sample.clans.some(
            (clan) =>
              !clan ||
              typeof clan.clanId !== 'string' ||
              !clan.clanId ||
              typeof clan.alive !== 'boolean' ||
              [clan.kokudaka, clan.gold, clan.prestige, clan.soldiers, clan.castleCount].some(
                (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0,
              ),
          )
        ) {
          incomplete('monthly-clan-observation-invalid', run.seed);
          break;
        }
        const ids = sample.clans.map((clan) => clan.clanId).sort();
        const signature = JSON.stringify(ids);
        if (new Set(ids).size !== ids.length || (clanIds !== null && signature !== clanIds)) {
          incomplete('monthly-clan-catalog-inconsistent', run.seed);
          break;
        }
        clanIds = signature;
      }
    }
    const map: unknown = run.historicalEventCounts;
    if (
      map === null ||
      typeof map !== 'object' ||
      Array.isArray(map) ||
      ![null, Object.prototype].includes(Object.getPrototypeOf(map) as object | null)
    ) {
      incomplete('historical-counts-missing', run.seed);
    } else {
      let sum = 0;
      for (const [id, count] of Object.entries(map)) {
        if (!historical.has(id) || (count !== 0 && count !== 1))
          incomplete('invalid-historical-event-count', run.seed);
        else sum += count;
      }
      if (
        !Number.isSafeInteger(run.historicalEventCount) ||
        run.historicalEventCount < 0 ||
        run.historicalEventCount !== sum
      )
        incomplete('historical-total-inconsistent', run.seed);
    }
    if (before === reasons.length) counts.push(run.historicalEventCount);
  }
  if (seeds.size < 20) incomplete('fewer-than-20-unique-seeds');
  let medianHistoricalEventCount: number | null = null;
  if (!reasons.length && counts.length) {
    const sorted = [...counts].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    medianHistoricalEventCount =
      sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
    if (medianHistoricalEventCount < 8)
      reasons.push({ kind: 'fail', code: 'historical-event-median-under-eight' });
  }
  return {
    specification: '10-T6',
    status: reasons.some((reason) => reason.kind === 'incomplete')
      ? 'incomplete'
      : reasons.length
        ? 'fail'
        : 'pass',
    runCount: runs.length,
    uniqueSeedCount: seeds.size,
    metrics: { medianHistoricalEventCount },
    reasons,
  };
}
