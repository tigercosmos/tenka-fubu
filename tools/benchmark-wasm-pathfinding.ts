import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  installRustPathfinding,
  clearRustPathfinding,
  rustPathfindingImports,
} from '../src/core/acceleration/pathfindingKernel';
import { computePath, computePathReference } from '../src/core/systems/pathfinding';
import type { CastleId, DistrictId, MapNodeId } from '../src/core/state/ids';
import { buildMapGraph } from '../src/core/state/mapGraph';
import { buildFullState } from '../tests/helpers/fullState';
async function main() {
  const state = await buildFullState({ allAi: true });
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  const ids = [...graph.nodes.keys()].sort();
  const { instance } = await WebAssembly.instantiate(
    readFileSync(new URL('../public/wasm/tenka_engine.wasm', import.meta.url)),
    rustPathfindingImports(),
  );
  installRustPathfinding(instance.exports);
  const owner = (id: MapNodeId) =>
    (state.castles[id as CastleId] ?? state.districts[id as DistrictId])!.ownerClanId;
  const groups = new Map<string, typeof ids>();
  for (const id of ids) {
    const group = groups.get(owner(id)) ?? [];
    group.push(id);
    groups.set(owner(id), group);
  }
  const queries = Array.from({ length: 512 }, (_, i) => {
    const from = ids[(i * 37) % ids.length]!;
    const clanId = owner(from);
    const candidates = groups.get(clanId)!;
    return {
      clanId,
      from,
      to: candidates[(i * 97 + 23) % candidates.length]!,
      speedFactor: [0.8, 1, 1.3][i % 3]!,
    };
  });
  for (const q of queries) {
    const a = computePathReference(state, graph, q),
      b = computePath(state, graph, q);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('parity');
  }
  for (let warm = 0; warm < 5; warm++)
    for (const q of queries) {
      computePathReference(state, graph, q);
      computePath(state, graph, q);
    }
  const rows = [];
  let checksum = 0;
  for (let round = 0; round < 20; round++)
    for (const name of round % 2 ? ['wasm', 'js'] : ['js', 'wasm']) {
      const start = performance.now();
      for (let rep = 0; rep < 8; rep++)
        for (const q of queries) {
          const result =
            name === 'js' ? computePathReference(state, graph, q) : computePath(state, graph, q);
          checksum += result.nodes.length;
        }
      rows.push({ round, backend: name, queries: 4096, ms: performance.now() - start });
    }
  const out = {
    host: process.platform,
    arch: process.arch,
    node: process.version,
    nodes: ids.length,
    edges: graph.edges.size,
    checksum,
    found: queries.filter((q) => computePathReference(state, graph, q).found).length,
    rows,
  };
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  clearRustPathfinding();
}
void main();
