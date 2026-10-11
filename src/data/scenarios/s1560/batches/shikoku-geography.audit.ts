import assert from 'node:assert/strict';
import { BAL } from '../../../../core/balance';
import { checkWorld, loadRawScenario, parseScenario } from '../../../../../tools/validate';
import { zCastlesFile, zDistrictsFile } from '../../../schemas';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import existingRoads from '../roads.json';
import { SHIKOKU_GEOGRAPHY as batch } from './shikoku-geography';
import { CHUGOKU_GEOGRAPHY } from './chugoku-geography';
const baseIds = new Set(
  [...CHUGOKU_GEOGRAPHY.castles, ...CHUGOKU_GEOGRAPHY.districts].map((n) => n.id),
);
const baseCastles = [
  ...existingCastles.filter((n) => !baseIds.has(n.id)),
  ...CHUGOKU_GEOGRAPHY.castles,
];
const baseDistricts = [
  ...existingDistricts.filter((n) => !baseIds.has(n.id)),
  ...CHUGOKU_GEOGRAPHY.districts,
];
const baseRoadIds = new Set(CHUGOKU_GEOGRAPHY.roads.map((r) => r.id));
const baseRoads = [
  ...existingRoads.edges.filter((r) => !baseRoadIds.has(r.id)),
  ...CHUGOKU_GEOGRAPHY.roads,
];

// Geography-only merge audit; complete scenario/roster closure is a separate gate.
assert.equal(batch.provinces.length, 4);
assert.equal(batch.castles.length, 8);
assert.equal(batch.districts.length, 22);
assert.equal(
  batch.districts.reduce((s, d) => s + d.kokudaka, 0),
  950_000,
);
for (const [clan, count] of [
  ['miyoshi', 3],
  ['chosokabe', 1],
  ['ichijo', 1],
  ['kono', 2],
  ['saionji', 1],
] as const)
  assert.equal(batch.castles.filter((c) => c.ownerClanId === `clan.${clan}`).length, count);
const batchIds = new Set([...batch.castles, ...batch.districts].map((n) => n.id));
const nodes = [
  ...baseCastles.filter((n) => !batchIds.has(n.id)),
  ...baseDistricts.filter((n) => !batchIds.has(n.id)),
  ...batch.castles,
  ...batch.districts,
];
const ids = new Set<string>();
for (const n of nodes) {
  assert(!ids.has(n.id), `Duplicate node ${n.id}`);
  ids.add(n.id);
}
const loaded = loadRawScenario('s1560');
assert(loaded);
assert.equal(loaded.violations.length, 0);
const parsed = parseScenario(loaded.raw);
assert.equal(parsed.violations.length, 0);
const outlineViolations = checkWorld({
  ...parsed.world,
  castles: zCastlesFile.parse([
    ...baseCastles.filter((n) => !batchIds.has(n.id)),
    ...batch.castles,
  ]),
  districts: zDistrictsFile.parse([
    ...baseDistricts.filter((n) => !batchIds.has(n.id)),
    ...batch.districts,
  ]),
  // V15 also checks region/roster quotas, outside this geography-only outline gate.
}).filter((v) => v.check === 'V15' && /outline|polygon/.test(v.message));
assert.deepEqual(outlineViolations, []);
for (const n of [...batch.castles, ...batch.districts]) {
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
const roads = [...baseRoads.filter((r) => !batchRoadIds.has(r.id)), ...batch.roads],
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
      assert([...baseDistricts, ...batch.districts].find((d) => d.id === id)?.isPort);
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
    (r) => r.a === 'dist.awa-itano-muya' && r.b === 'dist.kii-nagusa' && r.baseDays === 2,
  ),
);
assert(
  batch.roads.some(
    (r) => r.a === 'dist.iyo-ochi-kurushima' && r.b === 'dist.aki-sato' && r.baseDays === 2,
  ),
);
assert(
  batch.roads.some(
    (r) => r.a === 'dist.sanuki-kagawa' && r.b === 'dist.bizen-kojima' && r.baseDays === 1.5,
  ),
);
console.log(
  JSON.stringify(
    {
      status: 'staged-B7-geography-pass',
      outlineAcceptance: 'Actual checkWorld V15 passes canonical 8 wu boundary tolerance',
      representationBoundary:
        'Kurushima real island pin is 6.548 wu outside the coarse polygon, within canonical tolerance; no contour or coordinate change',
      provinces: 4,
      castles: 8,
      districts: 22,
      koku: 950_000,
      roads: batch.roads.length,
      mergedNodes: nodes.length,
      connectedNodes: seen.size,
    },
    null,
    2,
  ),
);
