import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRustPathfinding,
  installRustPathfinding,
  isRustPathfindingReady,
  rustPathfindingQueryCount,
  rustPathfindingImports,
} from '../../src/core/acceleration/pathfindingKernel';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { CastleId, DistrictId } from '../../src/core/state/ids';
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
