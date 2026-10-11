import { describe, expect, it } from 'vitest';
import { KYUSHU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/kyushu-geography';
import { KYUSHU_CLANS as clans } from '../../src/data/scenarios/s1560/batches/kyushu-clans';
import shimazu from '../../src/data/scenarios/s1560/batches/officers/kyushu-shimazu.json';
import otomo from '../../src/data/scenarios/s1560/batches/officers/kyushu-otomo.json';
import west from '../../src/data/scenarios/s1560/batches/officers/kyushu-west.json';
import {
  loadS1560Scenario,
  loadS1560EventCatalog,
  S1560_LOADED_REGIONS,
} from '../../src/data/scenarios/s1560';
import {
  zOfficersFile,
  zProvincesFile,
  zCastlesFile,
  zDistrictsFile,
  zRoadsFile,
  zScenario,
} from '../../src/data/schemas';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { ClanId } from '../../src/core/state/ids';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { advanceDay } from '../../src/core/systems';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import {
  checkWorld,
  filterWorldByRegions,
  loadRawScenario,
  parseScenario,
  type ScenarioWorld,
} from '../../tools/validate';

const regions = [
  'tokai',
  'kinki',
  'kanto',
  'koshinetsu',
  'hokuriku',
  'chugoku',
  'shikoku',
  'kyushu',
  'tohoku',
] as const;
const stagedOfficers = [shimazu, otomo, west].flatMap((file) => zOfficersFile.parse(file).officers);

function replaceById<T extends { id: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] {
  const replacement = new Map(additions.map((row) => [row.id, row]));
  const ids = new Set(existing.map(({ id }) => id));
  return [
    ...existing.map((row) => replacement.get(row.id) ?? row),
    ...additions.filter(({ id }) => !ids.has(id)),
  ];
}

async function stagedBundle() {
  const existing = await loadS1560Scenario();
  return zScenario.parse({
    ...existing,
    provinces: replaceById(
      existing.provinces,
      zProvincesFile.parse({ version: 1, provinces: geography.provinces }).provinces,
    ),
    castles: replaceById(existing.castles, zCastlesFile.parse(geography.castles)),
    districts: replaceById(existing.districts, zDistrictsFile.parse(geography.districts)),
    roads: replaceById(
      existing.roads,
      zRoadsFile.parse({ version: 1, edges: geography.roads }).edges,
    ),
    clans: replaceById(existing.clans, clans.clans),
    officers: existing.officers.map((group, index) =>
      index === REGION_VALUES.indexOf('kyushu') ? stagedOfficers : group,
    ),
    diplomacy: {
      pacts: existing.diplomacy.pacts,
      wars: existing.diplomacy.wars,
      sentiments: existing.diplomacy.sentiments,
    },
  });
}

async function stagedWorld(): Promise<ScenarioWorld> {
  const loaded = loadRawScenario('s1560');
  expect(loaded?.violations).toEqual([]);
  if (!loaded) throw new Error('Missing production scenario');
  const parsed = parseScenario(loaded.raw);
  expect(parsed.violations).toEqual([]);
  const bundle = await stagedBundle();
  return {
    ...parsed.world,
    provinces: bundle.provinces,
    castles: bundle.castles,
    districts: bundle.districts,
    roads: bundle.roads,
    clans: bundle.clans,
    diplomacy: bundle.diplomacy,
    officerGroups: [
      ...parsed.world.officerGroups.filter(({ fileRegion }) => fileRegion !== 'kyushu'),
      { fileRegion: 'kyushu', declaredRegion: 'kyushu', officers: stagedOfficers },
    ],
  };
}

describe('Kyushu joint nine-region production acceptance', () => {
  it('passes actual V1–V15 with all76 distinct staged officers and matching production', async () => {
    const bundle = await stagedBundle();
    const world = await stagedWorld();
    expect(checkWorld(filterWorldByRegions(world, regions), { regions })).toEqual([]);
    expect(stagedOfficers).toHaveLength(76);
    expect(bundle.provinces).toHaveLength(60);
    expect(bundle.castles).toHaveLength(121);
    expect(bundle.districts).toHaveLength(344);
    expect(bundle.clans).toHaveLength(41);
    expect(bundle.roads).toHaveLength(495);
    expect(bundle.districts.reduce((sum, district) => sum + district.kokudaka, 0)).toBe(17_994_000);
    const officers = bundle.officers.flat();
    expect(officers).toHaveLength(619);
    expect(new Set(officers.map(({ id }) => id)).size).toBe(officers.length);
    expect(officers.some(({ id }) => id === 'off.ogawa-nobuyasu')).toBe(false);
    expect(officers.some(({ id }) => id === 'off.ogawa-nobutoshi')).toBe(true);
    const existing = await loadS1560Scenario();
    expect(S1560_LOADED_REGIONS).toEqual(regions);
    expect(existing.castles).toHaveLength(121);
    expect(existing).toEqual(bundle);
    expect(existing.officers[REGION_VALUES.indexOf('kyushu')]).toEqual(stagedOfficers);
    expect(bundle.officers.slice(0, 7)).toEqual(existing.officers.slice(0, 7));
  });

  it.each(['normal', 'hard'] as const)(
    'repeats actual all-AI/event ticks and native codec continuation (%s)',
    async (difficulty) => {
      const bundle = await stagedBundle();
      function initial() {
        const state = buildGameStateFromScenario(bundle, {
          appVersion: 'b8-staged',
          seed: 42,
          playerClanId: 'clan.oda' as ClanId,
          difficulty,
        });
        state.ai.allAi = true;
        expect(validateState(state)).toEqual([]);
        return state;
      }
      function run(state: ReturnType<typeof initial>, days: number) {
        const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
        const engine = createRuntimeEventEngine(loadS1560EventCatalog());
        for (let day = 0; day < days; day++) {
          enqueuePendingAiOrders(state, queue);
          const result = advanceDay(state, queue.drain(), { eventEngine: engine });
          expect(result.events.filter(({ type }) => type === 'command.rejected')).toEqual([]);
          expect(state.ai.intentLog.filter(({ kind }) => kind === 'error.invalidCommand')).toEqual(
            [],
          );
          expect(
            validateState(state),
            `staged nine-region ${difficulty} day${state.time.day}`,
          ).toEqual([]);
        }
        return state;
      }
      const first = run(initial(), 60);
      const repeated = run(initial(), 60);
      expect(stateHash(repeated)).toBe(stateHash(first));
      expect(repeated.rng).toEqual(first.rng);
      const midpoint = run(initial(), 30);
      const decoded = decodeSave(encodeSave(midpoint, 0));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(`Staged save rejected: ${decoded.code}`);
      expect(stateHash(decoded.saveFile.state)).toBe(stateHash(midpoint));
      const resumed = run(decoded.saveFile.state, 30);
      expect(stateHash(resumed)).toBe(stateHash(first));
      expect(resumed.rng).toEqual(first.rng);
      expect(first.ai.intentLog.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
