import assert from 'node:assert/strict';
import { BAL } from '../../../../core/balance';
import { buildMapGraph } from '../../../../core/state/mapGraph';
import type { CastleNodeInput, DistrictNodeInput } from '../../../../core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId, ClanId } from '../../../../core/state/ids';
import type { RoadEdge } from '../../../../core/state/gameState';
import { computePath, type PathfindingState } from '../../../../core/systems/pathfinding';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import existingRoads from '../roads.json';
import { KANTO_KOSHINETSU_GEOGRAPHY as batch } from './kanto-koshinetsu-geography';

// Independent batch geography checks: this is not a complete scenario/roster validation.
const batchCastleIds = new Set(batch.castles.map((castle) => castle.id));
const batchDistrictIds = new Set(batch.districts.map((district) => district.id));
const batchRoadIds = new Set(batch.roads.map((road) => road.id));
const castles = [
  ...existingCastles.filter((castle) => !batchCastleIds.has(castle.id)),
  ...batch.castles,
];
const districts = [
  ...existingDistricts.filter((district) => !batchDistrictIds.has(district.id)),
  ...batch.districts,
];
const roads = [...existingRoads.edges.filter((road) => !batchRoadIds.has(road.id)), ...batch.roads];
const nodeIds = new Set<string>();
const positions = new Set<string>();
for (const node of [...castles, ...districts]) {
  assert(!nodeIds.has(node.id), `Duplicate node ID: ${node.id}`);
  nodeIds.add(node.id);
  const position = `${node.pos.x},${node.pos.y}`;
  assert(!positions.has(position), `Duplicate position: ${node.id}`);
  positions.add(position);
}
const pairs = new Set<string>();
for (const road of roads) {
  const pair = [road.a, road.b].sort().join('|');
  assert(!pairs.has(pair), `Duplicate undirected road: ${road.id}`);
  pairs.add(pair);
  assert(nodeIds.has(road.a) && nodeIds.has(road.b));
  if (road.type === 'sea') {
    assert(districts.find((district) => district.id === road.a)?.isPort);
    assert(districts.find((district) => district.id === road.b)?.isPort);
  }
}
for (const castle of batch.castles) {
  const owned = batch.districts.filter((district) => district.castleId === castle.id);
  assert.equal(owned.length, 3);
  const cap =
    (castle.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
    Math.floor(owned.reduce((sum, district) => sum + district.population, 0) * BAL.soldiersPerPop);
  assert(castle.soldiers <= cap);
  assert(castle.food <= (castle.tier === 'main' ? BAL.castleFoodCapMain : BAL.castleFoodCapBranch));
  for (const district of owned) {
    const distance = Math.hypot(district.pos.x - castle.pos.x, district.pos.y - castle.pos.y);
    assert(distance >= 40 && distance <= 180, `${district.id}: parent distance ${distance}`);
    assert(district.kokudaka <= district.kokudakaCap);
    assert(district.population <= district.populationCap);
  }
}
const summary = batch.provinces.reduce<
  Record<string, { castles: number; districts: number; koku: number; provinces: number }>
>((result, province) => {
  const row = (result[province.region] ??= { castles: 0, districts: 0, koku: 0, provinces: 0 });
  row.provinces++;
  const provinceCastles = batch.castles.filter((castle) => castle.provinceId === province.id);
  row.castles += provinceCastles.length;
  for (const district of batch.districts.filter((district) =>
    provinceCastles.some((castle) => castle.id === district.castleId),
  )) {
    row.districts++;
    row.koku += district.kokudaka;
  }
  return result;
}, {});
assert.deepEqual(summary.kanto, { castles: 16, districts: 48, koku: 2_750_000, provinces: 8 });
assert.deepEqual(summary.koshinetsu, { castles: 9, districts: 27, koku: 1_550_000, provinces: 3 });
const graph = buildMapGraph(
  Object.fromEntries(
    castles.map((castle) => [
      castle.id,
      {
        id: castle.id as CastleId,
        pos: castle.pos,
      },
    ]),
  ) satisfies Record<CastleId, CastleNodeInput>,
  Object.fromEntries(
    districts.map((district) => [
      district.id,
      {
        id: district.id as DistrictId,
        castleId: district.castleId as CastleId,
        pos: district.pos,
        isPort: district.isPort ?? false,
      },
    ]),
  ) satisfies Record<DistrictId, DistrictNodeInput>,
  Object.fromEntries(roads.map((road) => [road.id, road])) as Record<RoadEdgeId, RoadEdge>,
);
// Only the read-only pathfinding projection is constructed here; no fake complete GameState.
const pathState = {
  castles: Object.fromEntries(castles.map((castle) => [castle.id, castle])),
  districts: Object.fromEntries(
    districts.map((district) => [
      district.id,
      {
        ...district,
        ownerClanId: castles.find((castle) => castle.id === district.castleId)?.ownerClanId,
      },
    ]),
  ),
  diplomacy: { rows: {} },
  time: { day: 0 },
} as unknown as PathfindingState;
const route = computePath(pathState, graph, {
  clanId: 'clan.hojo' as ClanId,
  from: 'castle.odawara' as CastleId,
  to: 'castle.edo' as CastleId,
  speedFactor: 1,
});
assert(route.found);
assert(route.travelDays >= 2 && route.travelDays <= 4, `Odawara/Edo route: ${route.travelDays}`);
assert.deepEqual(
  computePath(pathState, graph, {
    clanId: 'clan.hojo' as ClanId,
    from: 'castle.odawara' as CastleId,
    to: 'castle.edo' as CastleId,
    speedFactor: 1,
  }),
  route,
);
console.log(
  JSON.stringify(
    {
      status: 'batch-geography-only-pass',
      summary,
      mergedNodes: graph.nodes.size,
      mergedRoads: graph.edges.size,
      odawaraEdo: route,
    },
    null,
    2,
  ),
);
