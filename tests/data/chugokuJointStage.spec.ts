import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHUGOKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/chugoku-geography';
import {
  CHUGOKU_CLANS as clans,
  CHUGOKU_EXISTING_CLAN_UPDATES as updates,
} from '../../src/data/scenarios/s1560/batches/chugoku-clans';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { zOfficersFile, zScenario, type ScenarioBundleData } from '../../src/data/schemas';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { advanceDay } from '../../src/core/systems';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { ClanId } from '../../src/core/state/ids';
import {
  checkWorld,
  filterWorldByRegions,
  loadRawScenario,
  parseScenario,
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
function replaceById<T extends { id: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] {
  const replacements = new Map(additions.map((row) => [row.id, row]));
  const existingIds = new Set(existing.map(({ id }) => id));
  return [
    ...existing.map((row) => replacements.get(row.id) ?? row),
    ...additions.filter(({ id }) => !existingIds.has(id)),
  ];
}
function roster() {
  return zOfficersFile.parse(
    JSON.parse(
      readFileSync(
        new URL('../../src/data/scenarios/s1560/batches/officers/chugoku.json', import.meta.url),
        'utf8',
      ),
    ),
  );
}
function replaceByPair<T extends { a: string; b: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] {
  const key = (row: T) => [row.a, row.b].sort().join('|');
  const replacements = new Map(additions.map((row) => [key(row), row]));
  const keys = new Set(existing.map(key));
  return [
    ...existing.map((row) => replacements.get(key(row)) ?? row),
    ...additions.filter((row) => !keys.has(key(row))),
  ];
}
async function stagedBundle(): Promise<ScenarioBundleData> {
  const existing = await loadS1560Scenario();
  const officers = existing.officers.map((group, index) =>
    index === REGION_VALUES.indexOf('chugoku') ? roster().officers : group,
  );
  return zScenario.parse({
    ...existing,
    provinces: replaceById(existing.provinces, geography.provinces),
    castles: replaceById(existing.castles, geography.castles),
    districts: replaceById(existing.districts, geography.districts),
    roads: replaceById(existing.roads, geography.roads),
    clans: replaceById(existing.clans, [...clans.clans, ...updates]),
    officers,
    diplomacy: {
      pacts: existing.diplomacy.pacts,
      wars: replaceByPair(existing.diplomacy.wars, clans.diplomacy.wars),
      sentiments: replaceByPair(existing.diplomacy.sentiments, clans.diplomacy.sentiments),
    },
  });
}

describe('production Chugoku joint nine-region acceptance', () => {
  it('passes V1–V15 on the actual joint payload with partial-region closure', async () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded?.violations).toEqual([]);
    if (!loaded) throw new Error('Missing production source');
    const parsed = parseScenario(loaded.raw);
    expect(parsed.violations).toEqual([]);
    expect(checkWorld(filterWorldByRegions(parsed.world, regions), { regions })).toEqual([]);
    const bundle = await loadS1560Scenario();
    expect(bundle).toEqual(await stagedBundle());
    const officers = roster();
    const world = {
      ...parsed.world,
      provinces: bundle.provinces,
      castles: bundle.castles,
      districts: bundle.districts,
      roads: bundle.roads,
      clans: bundle.clans,
      diplomacy: bundle.diplomacy,
      officerGroups: [
        ...parsed.world.officerGroups.filter(({ fileRegion }) => fileRegion !== 'chugoku'),
        {
          fileRegion: officers.region,
          declaredRegion: officers.region,
          officers: officers.officers,
        },
      ],
    };
    expect(checkWorld(filterWorldByRegions(world, regions), { regions })).toEqual([]);
    const subset = ['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku'] as const;
    expect(checkWorld(filterWorldByRegions(world, subset), { regions: subset })).toEqual([]);
  });

  it('closes every new clan and canonical Mori reference without duplicating Yamana', async () => {
    const bundle = await loadS1560Scenario();
    expect(bundle).toEqual(await stagedBundle());
    const state = buildGameStateFromScenario(bundle, {
      appVersion: 'b6-staged',
      seed: 42,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
    });
    expect(validateState(state)).toEqual([]);
    expect(bundle.provinces).toHaveLength(60);
    expect(bundle.castles).toHaveLength(121);
    expect(bundle.districts).toHaveLength(344);
    expect(bundle.clans).toHaveLength(41);
    expect(bundle.districts.reduce((sum, district) => sum + district.kokudaka, 0)).toBe(17_994_000);
    const ids = bundle.officers.flat().map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bundle.officers[REGION_VALUES.indexOf('chugoku')]).toHaveLength(69);
    expect(
      bundle.officers[REGION_VALUES.indexOf('chugoku')]!.some(
        ({ clanId }) => clanId === 'clan.yamana',
      ),
    ).toBe(false);
    expect(bundle.clans.filter(({ id }) => id === 'clan.yamana')).toHaveLength(1);
    expect(ids).toContain('off.mori-takamoto');
    expect(ids).toContain('off.mori-motonari');
    expect(ids).not.toContain('off.shiji-hiroyoshi');
  });

  it('repeats genuine production nine-region AI and event ticks with exact midpoint save continuation', async () => {
    const bundle = await loadS1560Scenario();
    function initial() {
      const state = buildGameStateFromScenario(bundle, {
        appVersion: 'b6-staged',
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
        expect(validateState(state), `nine-region day${state.time.day}`).toEqual([]);
      }
      return state;
    }
    const first = run(initial(), 60);
    const second = run(initial(), 60);
    expect(stateHash(second)).toBe(stateHash(first));
    expect(second.rng).toEqual(first.rng);
    const decoded = decodeSave(encodeSave(run(initial(), 30), 0));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(`Staged save rejected: ${decoded.code}`);
    const restored = run(decoded.saveFile.state, 30);
    expect(stateHash(restored)).toBe(stateHash(first));
    expect(restored.rng).toEqual(first.rng);
  }, 30_000);
});
