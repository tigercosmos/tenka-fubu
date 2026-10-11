import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KANTO_KOSHINETSU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/kanto-koshinetsu-geography';
import clansJson from '../../src/data/scenarios/s1560/batches/kanto-koshinetsu-clans.json';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { zClansFile, zOfficersFile } from '../../src/data/schemas';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import { computePath } from '../../src/core/systems/pathfinding';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { REGION_VALUES } from '../../src/core/state/enums';
import type { ClanId, MapNodeId } from '../../src/core/state/ids';
import {
  checkWorld,
  filterWorldByRegions,
  loadRawScenario,
  parseScenario,
} from '../../tools/validate';

const regions = ['tokai', 'kinki', 'kanto', 'koshinetsu'] as const;
const clans = zClansFile.parse(clansJson);
function roster(region: 'kanto' | 'koshinetsu') {
  const raw: unknown = JSON.parse(
    readFileSync(
      new URL(`../../src/data/scenarios/s1560/batches/officers/${region}.json`, import.meta.url),
      'utf8',
    ),
  );
  return zOfficersFile.parse(raw);
}

async function productionState() {
  return buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: 'b3-b4-validation',
    seed: 42,
    playerClanId: 'clan.oda' as ClanId,
    difficulty: 'normal',
    regions,
  });
}

describe('joint B3/B4 production batch acceptance', () => {
  it('integrates the reviewed batch payload exactly once without altering authoring data', async () => {
    const bundle = await loadS1560Scenario();
    for (const key of ['provinces', 'castles', 'districts', 'roads'] as const) {
      for (const entry of geography[key]) {
        expect(bundle[key].filter((row) => row.id === entry.id)).toEqual([entry]);
      }
    }
    for (const clan of clans.clans)
      expect(bundle.clans.filter((row) => row.id === clan.id)).toEqual([clan]);
    for (const region of ['kanto', 'koshinetsu'] as const)
      expect(bundle.officers[REGION_VALUES.indexOf(region)]).toEqual(roster(region).officers);
  });

  it('passes every static check against real existing content and the canonical event catalog', () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded).not.toBeNull();
    expect(loaded!.violations).toEqual([]);
    const parsed = parseScenario(loaded!.raw);
    expect(parsed.violations).toEqual([]);
    const world = filterWorldByRegions(parsed.world, regions);
    expect(checkWorld(world, { regions })).toEqual([]);
  });

  it('builds all seven new families without orphaned cross-region Nagao territory', async () => {
    const state = await productionState();
    expect(validateState(state)).toEqual([]);
    expect(Object.keys(state.castles)).toHaveLength(59);
    expect(Object.keys(state.districts)).toHaveLength(170);
    expect(Object.keys(state.provinces)).toHaveLength(26);
    expect(Object.keys(state.clans)).toHaveLength(20);
    expect(
      Object.values(state.castles).filter((castle) => castle.ownerClanId === 'clan.nagao'),
    ).toHaveLength(6);
    for (const castle of Object.values(state.castles))
      expect(castle.soldiers, castle.id).toBeLessThanOrEqual(castleMaxSoldiers(state, castle));
  });

  it('meets actual Odawara to Edo path timing without changing movement constants', async () => {
    const state = await productionState();
    const path = computePath(state, buildMapGraph(state.castles, state.districts, state.roads), {
      clanId: 'clan.hojo' as ClanId,
      from: 'castle.odawara' as MapNodeId,
      to: 'castle.edo' as MapNodeId,
      speedFactor: 1,
    });
    expect(path.found).toBe(true);
    expect(path.subjugateDays).toBe(0);
    expect(path.totalDays).toBeGreaterThanOrEqual(2);
    expect(path.totalDays).toBeLessThanOrEqual(4);
  });

  it('preserves deterministic autonomous orders and daily invariants across native save/load', async () => {
    async function run(reload: boolean) {
      let state = await productionState();
      const queue = new CommandQueue();
      const checkpoints: string[] = [];
      let applied = 0;
      for (let tick = 1; tick <= 60; tick += 1) {
        enqueuePendingAiOrders(state, queue);
        const result = advanceDay(state, queue.drain());
        applied += result.appliedCommands.length;
        expect(validateState(state), `tick ${tick}`).toEqual([]);
        expect(
          state.ai.intentLog.filter(
            (intent) => intent.day === state.time.day && intent.kind === 'error.invalidCommand',
          ),
          `tick ${tick}`,
        ).toEqual([]);
        checkpoints.push(stateHash(state));
        if (reload && tick === 30) {
          const decoded = decodeSave(encodeSave(state, 0));
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) throw new Error('Joint B3/B4 save rejected');
          state = decoded.saveFile.state;
          expect(stateHash(state)).toBe(checkpoints.at(-1));
        }
      }
      expect(applied).toBeGreaterThan(0);
      return checkpoints;
    }
    const direct = await run(false);
    expect(await run(false)).toEqual(direct);
    expect(await run(true)).toEqual(direct);
  });
});
