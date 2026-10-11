import assert from 'node:assert/strict';
import { BAL } from '../../../../core/balance';
import { pointInPolygon } from '../../../map/outlineGeometry';
import outline from '../../../map/japan-outline.json';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import existingRoads from '../roads.json';
import { HOKURIKU_GEOGRAPHY as batch } from './hokuriku-geography';

// Geography-only merge audit; complete scenario/roster closure is a separate gate.
assert.equal(batch.provinces.length, 4);
assert.equal(batch.castles.length, 10);
assert.equal(batch.districts.length, 28);
assert.equal(
  batch.districts.reduce((s, d) => s + d.kokudaka, 0),
  1_350_000,
);
for (const [clan, count] of [
  ['asakura', 4],
  ['hatakeyama', 2],
  ['jinbo', 2],
  ['honganji', 2],
] as const)
  assert.equal(batch.castles.filter((c) => c.ownerClanId === `clan.${clan}`).length, count);
const batchIds = new Set([...batch.castles, ...batch.districts].map((n) => n.id));
const nodes = [
  ...existingCastles.filter((n) => !batchIds.has(n.id)),
  ...existingDistricts.filter((n) => !batchIds.has(n.id)),
  ...batch.castles,
  ...batch.districts,
];
const ids = new Set<string>();
for (const n of nodes) {
  assert(!ids.has(n.id), `Duplicate node ${n.id}`);
  ids.add(n.id);
}
for (const n of [...batch.castles, ...batch.districts]) {
  assert(
    outline.polygons.some((p) => pointInPolygon(n.pos.x, n.pos.y, p.points)),
    `Outside outline ${n.id}`,
  );
  for (const other of nodes)
    if (other.id !== n.id)
      assert(
        Math.hypot(n.pos.x - other.pos.x, n.pos.y - other.pos.y) >= 24,
        `Node separation ${n.id}/${other.id}`,
      );
}
for (const c of batch.castles) {
  const ds = batch.districts.filter((d) => d.castleId === c.id);
  assert(ds.length >= 2 && ds.length <= 4);
  const cap =
    (c.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
    Math.floor(ds.reduce((s, d) => s + d.population, 0) * BAL.soldiersPerPop);
  assert(c.soldiers >= cap * 0.4 && c.soldiers <= cap * 0.7);
  assert(c.food <= (c.tier === 'main' ? BAL.castleFoodCapMain : BAL.castleFoodCapBranch));
  for (const d of ds) {
    const distance = Math.hypot(c.pos.x - d.pos.x, c.pos.y - d.pos.y);
    assert(distance >= 40 && distance <= 180);
  }
}
const batchRoadIds = new Set(batch.roads.map((r) => r.id));
const roads = [...existingRoads.edges.filter((r) => !batchRoadIds.has(r.id)), ...batch.roads],
  pairs = new Set<string>();
const adjacency = new Map<string, string[]>();
for (const r of roads) {
  assert(ids.has(r.a) && ids.has(r.b));
  const pair = [r.a, r.b].sort().join('|');
  assert(!pairs.has(pair), `Duplicate road ${r.id}`);
  pairs.add(pair);
  adjacency.set(r.a, [...(adjacency.get(r.a) ?? []), r.b]);
  adjacency.set(r.b, [...(adjacency.get(r.b) ?? []), r.a]);
  if (r.type === 'sea')
    for (const id of [r.a, r.b])
      assert([...existingDistricts, ...batch.districts].find((d) => d.id === id)?.isPort);
}
const seen = new Set<string>(),
  queue = [nodes[0]!.id];
for (let i = 0; i < queue.length; i++) {
  const id = queue[i]!;
  if (seen.has(id)) continue;
  seen.add(id);
  queue.push(...(adjacency.get(id) ?? []));
}
assert.equal(seen.size, nodes.length);
assert(
  batch.roads.some(
    (r) => r.a === 'dist.echizen-tsuruga' && r.b === 'dist.omi-shiga' && r.grade === 2,
  ),
);
assert(
  batch.roads.some(
    (r) => r.a === 'dist.etchu-niikawa' && r.b === 'dist.echigo-kubiki-itoigawa' && r.grade === 1,
  ),
);
assert(!batch.roads.some((r) => [r.a, r.b].some((id) => id.includes('shinano'))));
console.log(
  JSON.stringify(
    {
      status: 'staged-B5-geography-pass',
      provinces: 4,
      castles: 10,
      districts: 28,
      koku: 1_350_000,
      roads: batch.roads.length,
      mergedNodes: nodes.length,
      connectedNodes: seen.size,
    },
    null,
    2,
  ),
);
