import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { BAL } from '../../../../core/balance';
import { checkWorld, loadRawScenario, parseScenario } from '../../../../../tools/validate';
import { zCastlesFile, zDistrictsFile, zRoadsFile } from '../../../schemas';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import existingRoads from '../roads.json';
import { SHIKOKU_GEOGRAPHY } from './shikoku-geography';
import { SHIKOKU_CLANS } from './shikoku-clans';
import { KYUSHU_CLANS } from './kyushu-clans';
import { KYUSHU_GEOGRAPHY as batch } from './kyushu-geography';

/** Geography-only acceptance; missing staged officers/clans are not silently manufactured. */
export function auditKyushuGeography() {
  assert.equal(batch.provinces.length, 9);
  assert.equal(batch.castles.length, 14);
  assert.equal(batch.districts.length, 40);
  assert.equal(
    batch.districts.reduce((s, d) => s + d.kokudaka, 0),
    1_800_000,
  );
  const stagedCastles = [...SHIKOKU_GEOGRAPHY.castles, ...batch.castles];
  const stagedDistricts = [...SHIKOKU_GEOGRAPHY.districts, ...batch.districts];
  const stagedIds = new Set([...stagedCastles, ...stagedDistricts].map((n) => n.id));
  const castles = zCastlesFile.parse([
    ...existingCastles.filter((n) => !stagedIds.has(n.id)),
    ...stagedCastles,
  ]);
  const districts = zDistrictsFile.parse([
    ...existingDistricts.filter((n) => !stagedIds.has(n.id)),
    ...stagedDistricts,
  ]);
  const nodes = [...castles, ...districts];
  const nodeIds = new Set(nodes.map((n) => n.id));
  assert.equal(nodeIds.size, nodes.length);
  const stagedRoads = [...SHIKOKU_GEOGRAPHY.roads, ...batch.roads];
  const stagedRoadIds = new Set(stagedRoads.map((r) => r.id));
  const roads = zRoadsFile.parse({
    version: 1,
    edges: [...existingRoads.edges.filter((r) => !stagedRoadIds.has(r.id)), ...stagedRoads],
  }).edges;
  const pairs = new Set<string>();
  const adjacency = new Map<string, { id: string; cost: number }[]>();
  for (const r of roads) {
    assert(nodeIds.has(r.a) && nodeIds.has(r.b), `Missing endpoint ${r.id}`);
    const pair = [r.a, r.b].sort().join('|');
    assert(!pairs.has(pair), `Duplicate edge ${r.id}`);
    pairs.add(pair);
    adjacency.set(r.a, [...(adjacency.get(r.a) ?? []), { id: r.b, cost: r.baseDays }]);
    adjacency.set(r.b, [...(adjacency.get(r.b) ?? []), { id: r.a, cost: r.baseDays }]);
    if (r.type === 'sea') {
      assert.equal(r.grade, 1);
      for (const id of [r.a, r.b])
        assert(districts.find((d) => d.id === id)?.isPort, `Non-port ${id}`);
    }
  }
  const seen = new Set<string>(),
    queue = [nodes[0]!.id];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(adjacency.get(id) ?? []).map((e) => e.id));
  }
  assert.equal(seen.size, nodes.length);
  const loaded = loadRawScenario('s1560');
  assert(loaded);
  assert.deepEqual(loaded.violations, []);
  const parsed = parseScenario(loaded.raw);
  assert.deepEqual(parsed.violations, []);
  const newProvinceIds = new Set(
    [...SHIKOKU_GEOGRAPHY.provinces, ...batch.provinces].map((p) => p.id),
  );
  const newClanIds = new Set([...SHIKOKU_CLANS.clans, ...KYUSHU_CLANS.clans].map((c) => c.id));
  const geographyViolations = checkWorld({
    ...parsed.world,
    castles,
    districts,
    roads,
    provinces: [
      ...parsed.world.provinces.filter((p) => !newProvinceIds.has(p.id)),
      ...SHIKOKU_GEOGRAPHY.provinces,
      ...batch.provinces,
    ],
    clans: [
      ...parsed.world.clans.filter((c) => !newClanIds.has(c.id)),
      ...SHIKOKU_CLANS.clans,
      ...KYUSHU_CLANS.clans,
    ],
  });
  assert.deepEqual(
    geographyViolations.filter((v) => v.check === 'V15' && /outline|polygon/.test(v.message)),
    [],
  );
  for (const [clan, count] of [
    ['otomo', 6],
    ['shimazu', 3],
    ['ryuzoji', 2],
    ['ito', 2],
    ['sagara', 1],
  ] as const)
    assert.equal(batch.castles.filter((c) => c.ownerClanId === `clan.${clan}`).length, count);
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
  for (const d of batch.districts)
    for (const n of nodes)
      if (d.id !== n.id)
        assert(
          Math.hypot(d.pos.x - n.pos.x, d.pos.y - n.pos.y) >= 24,
          `District separation ${d.id}/${n.id}`,
        );
  // Actual V12 checks both prescribed pins and every merged land/sea adjacency.
  assert.deepEqual(
    geographyViolations.filter((v) => v.check === 'V12'),
    [],
  );
  const distances = new Map<string, number>([['castle.funai', 0]]),
    unvisited = new Set(nodeIds);
  while (unvisited.size) {
    const id = [...unvisited].sort(
      (a, b) =>
        (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity) || a.localeCompare(b),
    )[0]!;
    const cost = distances.get(id) ?? Infinity;
    unvisited.delete(id);
    if (!Number.isFinite(cost)) break;
    for (const edge of adjacency.get(id) ?? [])
      if (cost + edge.cost < (distances.get(edge.id) ?? Infinity))
        distances.set(edge.id, cost + edge.cost);
  }
  const baseRouteDays = distances.get('castle.uchijo')!;
  assert(baseRouteDays >= 8 && baseRouteDays <= 14);
  const closeCastlePairs: string[][] = [];
  for (let i = 0; i < batch.castles.length; i++)
    for (let j = i + 1; j < batch.castles.length; j++) {
      const a = batch.castles[i]!,
        b = batch.castles[j]!;
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < 24)
        closeCastlePairs.push([a.id, b.id]);
    }
  return {
    status: 'staged-B8-geography-pass',
    provinces: 9,
    castles: 14,
    districts: 40,
    koku: 1_800_000,
    roads: batch.roads.length,
    mergedNodes: nodes.length,
    connectedNodes: seen.size,
    baseRouteDays,
    closeCastlePairs,
    acceptanceBoundary: 'Geography only; no production activation, roster closure or runtime proof',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(auditKyushuGeography(), null, 2));
