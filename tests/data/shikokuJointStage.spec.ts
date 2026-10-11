import { describe, expect, it } from 'vitest';
import { SHIKOKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/shikoku-geography';
import {
  SHIKOKU_CLANS as clans,
  SHIKOKU_EXISTING_CLAN_UPDATES as updates,
} from '../../src/data/scenarios/s1560/batches/shikoku-clans';
import chosokabe from '../../src/data/scenarios/s1560/batches/officers/shikoku-chosokabe.json';
import iyo from '../../src/data/scenarios/s1560/batches/officers/shikoku-iyo.json';
import ichijo from '../../src/data/scenarios/s1560/batches/officers/shikoku-ichijo.json';
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
  type ScenarioBundleData,
  type OfficerData,
  type ClanData,
  type CastleData,
} from '../../src/data/schemas';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
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
const stagedOfficers = [chosokabe, iyo, ichijo].flatMap(
  (file) => zOfficersFile.parse(file).officers,
);
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

async function stagedBundle(): Promise<ScenarioBundleData> {
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
    clans: replaceById(existing.clans, [...clans.clans, ...updates]),
    officers: existing.officers.map((group, index) =>
      index === REGION_VALUES.indexOf('shikoku') ? stagedOfficers : group,
    ),
    diplomacy: {
      pacts: existing.diplomacy.pacts,
      wars: existing.diplomacy.wars,
      sentiments: [
        ...existing.diplomacy.sentiments.map(
          (row) => clans.diplomacy.sentiments.find(({ a, b }) => a === row.a && b === row.b) ?? row,
        ),
        ...clans.diplomacy.sentiments.filter(
          ({ a, b }) => !existing.diplomacy.sentiments.some((row) => row.a === a && row.b === b),
        ),
      ],
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
      ...parsed.world.officerGroups.filter(({ fileRegion }) => fileRegion !== 'shikoku'),
      { fileRegion: 'shikoku', declaredRegion: 'shikoku', officers: stagedOfficers },
    ],
  };
}

describe('Shikoku joint nine-region production acceptance', () => {
  it('passes actual V1–V15 with all thirty-seven staged officers and canonical D27 closure', async () => {
    const world = await stagedWorld();
    expect(checkWorld(filterWorldByRegions(world, regions), { regions })).toEqual([]);
    expect(stagedOfficers).toHaveLength(37);
    const bundle = await stagedBundle();
    expect(bundle.provinces).toHaveLength(60);
    expect(bundle.castles).toHaveLength(121);
    expect(bundle.districts).toHaveLength(344);
    expect(bundle.clans).toHaveLength(41);
    const ids = bundle.officers.flat().map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(619);
    expect(bundle.districts.reduce((sum, district) => sum + district.kokudaka, 0)).toBe(17_994_000);
    const existing = await loadS1560Scenario();
    expect(S1560_LOADED_REGIONS).toEqual(regions);
    expect(existing).toEqual(bundle);
    const miyoshiIndex = existing.clans.findIndex(({ id }) => id === 'clan.miyoshi');
    expect(bundle.clans[miyoshiIndex]).toEqual(updates[0]);
    expect(bundle.officers[REGION_VALUES.indexOf('kinki')]).toEqual(
      existing.officers[REGION_VALUES.indexOf('kinki')],
    );
    expect(bundle.castles.filter(({ id }) => id === 'castle.oko')).toHaveLength(1);
    expect(replaceById(bundle.castles, zCastlesFile.parse(geography.castles))).toEqual(
      bundle.castles,
    );
    expect(bundle.clans.slice(0, existing.clans.length).map(({ id }) => id)).toEqual(
      existing.clans.map(({ id }) => id),
    );
  });

  it('keeps historical death1560, initial living leadership and existing delayed natural scheduling', async () => {
    const state = buildGameStateFromScenario(await stagedBundle(), {
      appVersion: 'b7-staged',
      seed: 42,
      playerClanId: 'clan.chosokabe' as ClanId,
      difficulty: 'normal',
    });
    expect(validateState(state)).toEqual([]);
    const officer = state.officers['off.chosokabe-kunichika' as OfficerId]!;
    expect(officer.deathYear).toBe(1560);
    expect(officer.status).toBe('serving');
    expect(officer.hasComeOfAge).toBe(true);
    expect(officer.scheduledDeath.year).toBeGreaterThanOrEqual(1561);
    expect(state.clans['clan.chosokabe' as ClanId]!.leaderId).toBe(officer.id);
  });

  it('limits the D27 exemption to its exact scenario, person, year and home-ownership closure', async () => {
    const world = await stagedWorld();
    const cases: readonly {
      label: string;
      worldId?: string;
      officer?: Partial<OfficerData>;
      clan?: Partial<ClanData>;
      castle?: Partial<CastleData>;
    }[] = [
      { label: 'different scenario', worldId: 's1561' },
      {
        label: 'different named person',
        officer: { id: 'off.not-kunichika' },
        clan: { leaderId: 'off.not-kunichika' },
        castle: { lordId: 'off.not-kunichika' },
      },
      { label: 'earlier death', officer: { deathYear: 1559 } },
      {
        label: 'different clan',
        officer: { clanId: 'clan.not-chosokabe' },
        clan: { id: 'clan.not-chosokabe' },
        castle: { ownerClanId: 'clan.not-chosokabe' },
      },
      { label: 'wrong home', clan: { homeCastleId: 'castle.nakamura' } },
      { label: 'wrong lord', castle: { lordId: null } },
      { label: 'wrong location', officer: { locationCastleId: 'castle.nakamura' } },
      { label: 'branch home', castle: { tier: 'branch' } },
      { label: 'foreign home owner', castle: { ownerClanId: 'clan.ichijo' } },
    ];
    expect(checkWorld(world, { regions }).filter(({ check }) => check === 'V8')).toEqual([]);
    for (const variant of cases) {
      const modified: ScenarioWorld = {
        ...world,
        id: variant.worldId ?? world.id,
        clans: world.clans.map((clan) =>
          clan.id === 'clan.chosokabe' ? { ...clan, ...variant.clan } : clan,
        ),
        castles: world.castles.map((castle) =>
          castle.id === 'castle.oko' ? { ...castle, ...variant.castle } : castle,
        ),
        officerGroups: world.officerGroups.map((group) => ({
          ...group,
          officers: group.officers.map((officer) =>
            officer.id === 'off.chosokabe-kunichika' ? { ...officer, ...variant.officer } : officer,
          ),
        })),
      };
      // Some negative variants intentionally violate reference closure too; pin the V8 guard separately.
      expect(
        checkWorld(modified, { regions }).filter(({ check }) => check === 'V8'),
        variant.label,
      ).toEqual([
        expect.objectContaining({
          severity: 'ERROR',
          ids: [variant.officer?.id ?? 'off.chosokabe-kunichika'],
        }),
      ]);
    }
  });

  it('repeats actual all-AI/event ticks and native codec midpoint continuation without rejected orders', async () => {
    const bundle = await stagedBundle();
    function initial() {
      const state = buildGameStateFromScenario(bundle, {
        appVersion: 'b7-staged',
        seed: 42,
        playerClanId: 'clan.oda' as ClanId,
        difficulty: 'normal',
      });
      state.ai.allAi = true;
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
        expect(validateState(state), `staged nine-region day${state.time.day}`).toEqual([]);
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
  }, 30_000);
});
