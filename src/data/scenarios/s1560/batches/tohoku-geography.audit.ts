import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { BAL } from '../../../../core/balance';
import { checkWorld, loadRawScenario, parseScenario } from '../../../../../tools/validate';
import { KYUSHU_GEOGRAPHY } from './kyushu-geography';
import { KYUSHU_CLANS } from './kyushu-clans';
import { buildTohokuClans } from './tohoku-clans';
import { TOHOKU_GEOGRAPHY as batch } from './tohoku-geography';

/** Real national geography shadow, without fabricated officers or production activation. */
export function auditTohokuGeography() {
  const loaded = loadRawScenario('s1560');
  assert(loaded);
  const parsed = parseScenario(loaded.raw);
  assert.deepEqual(parsed.violations, []);
  const stages = [KYUSHU_GEOGRAPHY, batch];
  const castles = stages.flatMap((s) => s.castles),
    districts = stages.flatMap((s) => s.districts);
  const provinces = stages.flatMap((s) => s.provinces),
    roads = stages.flatMap((s) => s.roads);
  const clans = [...KYUSHU_CLANS.clans, ...buildTohokuClans(batch).clans];
  // Production is authoritative after activation: never replace its lords, pins or roads
  // with a staging copy. Before activation, append only genuinely absent stage IDs.
  function appendMissing<T extends { id: string }>(
    production: readonly T[],
    staged: readonly T[],
  ): T[] {
    const ids = new Set(production.map((item) => item.id));
    return [...production, ...staged.filter((item) => !ids.has(item.id))];
  }
  const world = {
    ...parsed.world,
    castles: appendMissing(parsed.world.castles, castles),
    districts: appendMissing(parsed.world.districts, districts),
    provinces: appendMissing(parsed.world.provinces, provinces),
    roads: appendMissing(parsed.world.roads, roads),
    clans: appendMissing(parsed.world.clans, clans),
  };
  for (const key of ['castles', 'districts', 'provinces', 'roads', 'clans'] as const) {
    assert.equal(new Set(world[key].map((item) => item.id)).size, world[key].length);
    for (const item of parsed.world[key])
      assert.deepEqual(
        world[key].find((merged) => merged.id === item.id),
        item,
      );
  }
  const violations = checkWorld(world);
  const deferredReferenceViolations = violations.filter((v) => v.check === 'V3');
  // Geography references must close; absent historical officers remain a separate roster gate.
  assert(deferredReferenceViolations.every((v) => /武將/.test(v.message)));
  const geometryChecks = new Set(['V2', 'V4', 'V5', 'V6', 'V10', 'V12', 'V13', 'V14']);
  assert.deepEqual(
    violations.filter(
      (v) =>
        geometryChecks.has(v.check) || (v.check === 'V15' && /outline|polygon/.test(v.message)),
    ),
    [],
  );
  assert.equal(world.provinces.length, 60);
  for (const [clan, count] of [
    ['date', 3],
    ['ashina', 3],
    ['mogami', 2],
    ['nanbu', 4],
    ['ando', 2],
  ] as const)
    assert.equal(batch.castles.filter((c) => c.ownerClanId === `clan.${clan}`).length, count);
  const nodes = [...world.castles, ...world.districts];
  for (const castle of batch.castles) {
    const ds = batch.districts.filter((d) => d.castleId === castle.id);
    const cap =
      (castle.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
      Math.floor(ds.reduce((s, d) => s + d.population, 0) * BAL.soldiersPerPop);
    assert(castle.soldiers >= cap * 0.4 && castle.soldiers <= cap * 0.7);
    for (const d of ds)
      assert(
        Math.hypot(d.pos.x - castle.pos.x, d.pos.y - castle.pos.y) >= 40 &&
          Math.hypot(d.pos.x - castle.pos.x, d.pos.y - castle.pos.y) <= 180,
      );
  }
  for (const d of batch.districts)
    for (const n of nodes)
      if (d.id !== n.id)
        assert(
          Math.hypot(d.pos.x - n.pos.x, d.pos.y - n.pos.y) >= 24,
          `Separation ${d.id}/${n.id}`,
        );
  const neighbors = new Map<string, string[]>();
  for (const r of world.roads) {
    neighbors.set(r.a, [...(neighbors.get(r.a) ?? []), r.b]);
    neighbors.set(r.b, [...(neighbors.get(r.b) ?? []), r.a]);
  }
  const seen = new Set<string>(),
    queue = [nodes[0]!.id];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(neighbors.get(id) ?? []));
  }
  assert.equal(seen.size, nodes.length);
  return {
    status: 'staged-B9-geography-pass',
    provinces: batch.provinces.length,
    castles: batch.castles.length,
    districts: batch.districts.length,
    koku: batch.districts.reduce((s, d) => s + d.kokudaka, 0),
    roads: batch.roads.length,
    mergedProvinces: world.provinces.length,
    mergedCastles: world.castles.length,
    mergedDistricts: world.districts.length,
    mergedKoku: world.districts.reduce((sum, district) => sum + district.kokudaka, 0),
    mergedNodes: nodes.length,
    connectedNodes: seen.size,
    productionPreserved: true,
    deferredReferenceViolations,
    acceptanceBoundary:
      'Geography only; missing staged officer references and national roster gates remain explicit.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(auditTohokuGeography(), null, 2));
