import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { pointInPolygon } from '../../src/data/map/outlineGeometry';
import { lonLatToWorld } from '../../src/data/map/projection';
import outline from '../../src/data/map/japan-outline.json';
import castles from '../../src/data/scenarios/s1560/castles.json';
import districts from '../../src/data/scenarios/s1560/districts.json';
import roads from '../../src/data/scenarios/s1560/roads.json';
import clans from '../../src/data/scenarios/s1560/clans.json';
import { CHUGOKU_GEOGRAPHY as china } from '../../src/data/scenarios/s1560/batches/chugoku-geography';
import { CHUGOKU_CLANS } from '../../src/data/scenarios/s1560/batches/chugoku-clans';
import { SHIKOKU_GEOGRAPHY as batch } from '../../src/data/scenarios/s1560/batches/shikoku-geography';
import provenance from '../../src/data/scenarios/s1560/batches/shikoku-geography.sources.json';
import { checkWorld, loadRawScenario, parseScenario } from '../../tools/validate';
import { zCastlesFile, zDistrictsFile } from '../../src/data/schemas';

const stagedNodes = [...china.castles, ...china.districts, ...batch.castles, ...batch.districts];
const ids = new Set(stagedNodes.map((n) => n.id));
const nodes = [
  ...castles.filter((n) => !ids.has(n.id)),
  ...districts.filter((n) => !ids.has(n.id)),
  ...stagedNodes,
];
const stagedRoads = [...china.roads, ...batch.roads],
  roadIds = new Set(stagedRoads.map((r) => r.id));
const edges = [...roads.edges.filter((r) => !roadIds.has(r.id)), ...stagedRoads];
function stagedWorld() {
  const loaded = loadRawScenario('s1560');
  if (!loaded) throw new Error('Missing production scenario');
  expect(loaded.violations).toEqual([]);
  const parsed = parseScenario(loaded.raw);
  expect(parsed.violations).toEqual([]);
  return {
    ...parsed.world,
    castles: zCastlesFile.parse([
      ...castles.filter((n) => !ids.has(n.id)),
      ...china.castles,
      ...batch.castles,
    ]),
    districts: zDistrictsFile.parse([
      ...districts.filter((n) => !ids.has(n.id)),
      ...china.districts,
      ...batch.districts,
    ]),
  };
}

describe('staged seven-region Shikoku geography, not production closure', () => {
  it('has all prescribed quotas and preserves Miyoshi as branches only', () => {
    expect(batch.provinces).toHaveLength(4);
    expect(batch.castles).toHaveLength(8);
    expect(batch.districts).toHaveLength(22);
    expect(batch.districts.reduce((s, d) => s + d.kokudaka, 0)).toBe(950_000);
    for (const [id, count] of [
      ['miyoshi', 3],
      ['chosokabe', 1],
      ['ichijo', 1],
      ['kono', 2],
      ['saionji', 1],
    ] as const)
      expect(batch.castles.filter((c) => c.ownerClanId === `clan.${id}`)).toHaveLength(count);
    expect(
      batch.castles
        .filter((c) => c.ownerClanId === 'clan.miyoshi')
        .every((c) => c.tier === 'branch' && c.lordId === null),
    ).toBe(true);
  });
  it('passes actual V15 with the unchanged canonical tolerance and retains the real Kurushima pin', () => {
    // V15 roster/region quotas are a separate joint-world acceptance gate.
    expect(
      checkWorld(stagedWorld()).filter(
        (v) => v.check === 'V15' && /outline|polygon/.test(v.message),
      ),
    ).toEqual([]);
    const outside = stagedNodes
      .filter((n) => !outline.polygons.some((p) => pointInPolygon(n.pos.x, n.pos.y, p.points)))
      .map((n) => n.id);
    expect(outside.every((id) => id === 'castle.kurushima')).toBe(true);
    expect(batch.castles.find((c) => c.id === 'castle.kurushima')?.pos).toEqual(
      lonLatToWorld(132.97, 34.12),
    );
    for (const n of [...batch.castles, ...batch.districts])
      for (const other of nodes)
        if (n.id !== other.id)
          expect(Math.hypot(n.pos.x - other.pos.x, n.pos.y - other.pos.y)).toBeGreaterThanOrEqual(
            24,
          );
    for (const c of batch.castles) {
      const ds = batch.districts.filter((d) => d.castleId === c.id);
      const cap =
        (c.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
        Math.floor(ds.reduce((s, d) => s + d.population, 0) * BAL.soldiersPerPop);
      expect(c.soldiers).toBeGreaterThanOrEqual(cap * 0.4);
      expect(c.soldiers).toBeLessThanOrEqual(cap * 0.7);
      expect(c.food).toBeLessThanOrEqual(
        c.tier === 'main' ? BAL.castleFoodCapMain : BAL.castleFoodCapBranch,
      );
      for (const d of ds) {
        const r = Math.hypot(c.pos.x - d.pos.x, c.pos.y - d.pos.y);
        expect(r).toBeGreaterThanOrEqual(40);
        expect(r).toBeLessThanOrEqual(180);
      }
    }
    expect(provenance.coordinateMethod).toContain('6.548');
    expect(provenance.coordinateMethod).toContain('tolerance of8world units');
  });
  it('rejects points beyond 8 wu while accepting the inclusive boundary in actual V15', () => {
    const world = stagedWorld();
    const castle = world.castles.find((c) => c.id === 'castle.kurushima')!;
    // Synthetic square isolates the canonical distance test, not a proposed coastline.
    const outlineProbe = {
      ...world,
      castles: [{ ...castle, pos: { x: 108, y: 50 } }],
      districts: [],
      outline: {
        version: 1 as const,
        source: 'handcrafted' as const,
        polygons: [{ id: 'shikoku', points: [0, 0, 100, 0, 100, 100, 0, 100] }],
      },
    };
    const outside = (x: number) =>
      checkWorld({ ...outlineProbe, castles: [{ ...castle, pos: { x, y: 50 } }] }).filter(
        (v) => v.check === 'V15' && v.ids.includes(castle.id),
      );
    expect(outside(108)).toEqual([]);
    expect(outside(108.001)).toHaveLength(1);
    expect(outside(200)).toHaveLength(1);
  });
  it('connects actual staged endpoints and uses exact canonical sea seam costs', () => {
    const nodeIds = new Set(nodes.map((n) => n.id));
    expect(nodeIds.size).toBe(nodes.length);
    const pairs = new Set<string>(),
      adj = new Map<string, string[]>();
    for (const r of edges) {
      expect(nodeIds.has(r.a) && nodeIds.has(r.b)).toBe(true);
      const pair = [r.a, r.b].sort().join('|');
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      adj.set(r.a, [...(adj.get(r.a) ?? []), r.b]);
      adj.set(r.b, [...(adj.get(r.b) ?? []), r.a]);
      if (r.type === 'sea')
        for (const id of [r.a, r.b])
          expect(
            [...districts, ...china.districts, ...batch.districts].find((d) => d.id === id)?.isPort,
          ).toBe(true);
    }
    const seen = new Set<string>(),
      q = [nodes[0]!.id];
    for (let i = 0; i < q.length; i++) {
      const id = q[i]!;
      if (seen.has(id)) continue;
      seen.add(id);
      q.push(...(adj.get(id) ?? []));
    }
    expect(seen.size).toBe(nodes.length);
    for (const [a, b, cost] of [
      ['dist.awa-itano-muya', 'dist.kii-nagusa', 2],
      ['dist.iyo-ochi-kurushima', 'dist.aki-sato', 2],
      ['dist.sanuki-kagawa', 'dist.bizen-kojima', 1.5],
    ] as const)
      expect(batch.roads.find((r) => r.a === a && r.b === b)).toMatchObject({
        type: 'sea',
        grade: 1,
        baseDays: cost,
      });
    expect(
      batch.roads.some((r) =>
        [r.a, r.b].some((id) => id.includes('bungo-') || id.includes('buzen-')),
      ),
    ).toBe(false);
  });
  it('matches canonical colors across new roads and records every real castle site', () => {
    const colors = new Map(
      [...clans.clans, ...CHUGOKU_CLANS.clans].map((c) => [c.id, c.colorIndex]),
    );
    for (const [id, index] of [
      ['chosokabe', 6],
      ['kono', 21],
      ['saionji', 32],
      ['ichijo', 36],
    ] as const)
      colors.set(`clan.${id}`, index);
    const owners = new Map(
      [...castles, ...china.castles, ...batch.castles].map((c) => [c.id, c.ownerClanId]),
    );
    for (const d of [...districts, ...china.districts, ...batch.districts])
      owners.set(d.id, owners.get(d.castleId)!);
    for (const r of batch.roads) {
      const a = owners.get(r.a)!,
        b = owners.get(r.b)!;
      if (a === b) continue;
      const d = Math.abs(colors.get(a)! - colors.get(b)!);
      expect(Math.min(d, 40 - d)).toBeGreaterThanOrEqual(BAL.dataClanColorMinRing);
    }
    for (const c of batch.castles)
      expect(
        provenance.sources.some((s) => s.castleId === c.id && s.url.startsWith('https://')),
      ).toBe(true);
  });
});
