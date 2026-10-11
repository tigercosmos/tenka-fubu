import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRustPathfinding,
  installRustPathfinding,
  isRustPathfindingReady,
  rustPathfindingQueryCount,
  rustPathfindingTopologyBuildCount,
  rustPathfindingImports,
} from '../../src/core/acceleration/pathfindingKernel';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '../../src/core/state/ids';
import { computePath, computePathReference } from '../../src/core/systems/pathfinding';
import { buildMiniState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/mini';
import { buildFullState } from '../helpers/fullState';

beforeEach(async () => {
  const { instance } = await WebAssembly.instantiate(
    readFileSync(new URL('../../public/wasm/tenka_engine.wasm', import.meta.url)),
    rustPathfindingImports(),
  );
  installRustPathfinding(instance.exports);
});
afterEach(clearRustPathfinding);

describe('compiled Rust pathfinding production hook', () => {
  it('validates the ABI and retains a reference fallback without a backend', () => {
    expect(isRustPathfindingReady()).toBe(true);
    expect(() => installRustPathfinding({})).toThrow('Unsupported Rust pathfinding ABI');
    clearRustPathfinding();
    const state = buildMiniState();
    const graph = buildMapGraph(state.castles, state.districts, state.roads);
    const [from, to] = [...graph.nodes.keys()];
    const query = { clanId: CLAN_ALPHA, from: from!, to: to!, speedFactor: 1 };
    expect(computePath(state, graph, query)).toEqual(computePathReference(state, graph, query));
    expect(rustPathfindingQueryCount()).toBe(0);
  });

  it('matches every miniature route, dual sea mode, speed and faction without changing state', () => {
    const state = buildMiniState();
    const before = structuredClone(state);
    const graph = buildMapGraph(state.castles, state.districts, state.roads);
    const ids = [...graph.nodes.keys()];
    let count = 0;
    for (const clanId of [CLAN_ALPHA, CLAN_BETA])
      for (const speedFactor of [0.7, 1, 1.3])
        for (const from of ids)
          for (const to of ids) {
            const query = { clanId, from, to, speedFactor };
            expect(computePath(state, graph, query), JSON.stringify(query)).toEqual(
              computePathReference(state, graph, query),
            );
            count++;
          }
    expect(rustPathfindingQueryCount()).toBe(count);
    expect(state).toEqual(before);
  });

  it('uses current ownership, diplomacy and time with cached topology', () => {
    const state = buildMiniState();
    const graph = buildMapGraph(state.castles, state.districts, state.roads);
    const ids = [...graph.nodes.keys()];
    for (let step = 0; step < 4; step++) {
      state.time.day += 30;
      for (const district of Object.values(state.districts))
        if (step === 1 || step === 3) district.ownerClanId = CLAN_ALPHA;
      for (const row of Object.values(state.diplomacy.rows)) {
        row.pacts =
          step === 2
            ? [{ kind: 'ceasefire', startDay: 0, endDay: state.time.day + 1, vassalClanId: null }]
            : [];
        row.lastHostileDay = step === 3 ? state.time.day : null;
      }
      for (const from of ids)
        for (const to of ids) {
          const query = { clanId: CLAN_ALPHA, from, to, speedFactor: 1.1 };
          expect(computePath(state, graph, query)).toEqual(
            computePathReference(state, graph, query),
          );
        }
    }
  });

  it('reuses exact topology across daily cloned states and rebuilds when road costs change', () => {
    let state = buildMiniState();
    const ids = [...buildMapGraph(state.castles, state.districts, state.roads).nodes.keys()];
    for (let day = 0; day < 60; day++) {
      state = structuredClone(state);
      state.time.day++;
      const graph = buildMapGraph(state.castles, state.districts, state.roads);
      const query = { clanId: CLAN_ALPHA, from: ids[0]!, to: ids[1]!, speedFactor: 1 };
      expect(computePath(state, graph, query)).toEqual(computePathReference(state, graph, query));
    }
    expect(rustPathfindingTopologyBuildCount()).toBe(1);
    const first = Object.values(state.roads)[0]!;
    first.baseDays += 0.5;
    const graph = buildMapGraph(state.castles, state.districts, state.roads);
    const query = { clanId: CLAN_ALPHA, from: ids[0]!, to: ids[1]!, speedFactor: 1 };
    expect(computePath(state, graph, query)).toEqual(computePathReference(state, graph, query));
    expect(rustPathfindingTopologyBuildCount()).toBe(2);
  });

  it('rejects topology equivalence for rebuilt grade, edge membership and adjacency order changes', () => {
    const state = buildMiniState();
    const base = buildMapGraph(state.castles, state.districts, state.roads);
    const ids = [...base.nodes.keys()];
    const query = { clanId: CLAN_ALPHA, from: ids[0]!, to: ids[1]!, speedFactor: 1 };
    const [edgeId, edge] = [...base.edges][0]!;
    const changedGrade = { ...base, edges: new Map(base.edges) };
    changedGrade.edges.set(edgeId, { ...edge, grade: edge.grade === 1 ? 2 : 1 });
    const removed = { ...base, edges: new Map(base.edges) };
    removed.edges.delete(edgeId);
    const addedId = 'road.wasm-extra' as RoadEdgeId;
    const added = { ...base, edges: new Map(base.edges), adjacency: new Map(base.adjacency) };
    added.edges.set(addedId, { ...edge, id: addedId, baseDays: 0.5 });
    for (const id of [edge.a, edge.b])
      added.adjacency.set(id, [addedId, ...(base.adjacency.get(id) ?? [])]);
    const reordered = { ...base, adjacency: new Map(base.adjacency) };
    const junction = [...base.adjacency].find(([, edges]) => edges.length > 1)!;
    reordered.adjacency.set(junction[0], [...junction[1]].reverse());
    for (const variant of [changedGrade, removed, added, reordered]) {
      computePath(state, base, query);
      const builds = rustPathfindingTopologyBuildCount();
      expect(computePath(state, variant, query)).toEqual(
        computePathReference(state, variant, query),
      );
      expect(rustPathfindingTopologyBuildCount()).toBe(builds + 1);
    }
  });

  it('matches 512 actual national routes exactly including rejected paths and all returned cost fields', async () => {
    const state = await buildFullState({ allAi: true });
    const graph = buildMapGraph(state.castles, state.districts, state.roads);
    const ids = [...graph.nodes.keys()].sort();
    let found = 0;
    for (let i = 0; i < 512; i++) {
      const from = ids[(i * 37) % ids.length]!;
      const owner = (id: typeof from) =>
        (state.castles[id as CastleId] ?? state.districts[id as DistrictId])!.ownerClanId;
      const clanId = owner(from);
      const candidates = ids.filter((id) => owner(id) === clanId);
      const query = {
        clanId,
        from,
        to:
          i < 256
            ? ids[(i * 97 + 23) % ids.length]!
            : candidates[(i * 97 + 23) % candidates.length]!,
        speedFactor: [0.8, 1, 1.3][i % 3]!,
      };
      const result = computePath(state, graph, query);
      if (result.found) found++;
      expect(result, JSON.stringify(query)).toEqual(computePathReference(state, graph, query));
    }
    expect(found).toBeGreaterThan(200);
    expect(found).toBeLessThan(512);
    expect(rustPathfindingQueryCount()).toBe(512);
  });
});
