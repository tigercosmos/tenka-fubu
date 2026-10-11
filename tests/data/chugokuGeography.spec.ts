import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { pointInPolygon } from '../../src/data/map/outlineGeometry';
import { lonLatToWorld } from '../../src/data/map/projection';
import outline from '../../src/data/map/japan-outline.json';
import existingCastles from '../../src/data/scenarios/s1560/castles.json';
import existingDistricts from '../../src/data/scenarios/s1560/districts.json';
import existingRoads from '../../src/data/scenarios/s1560/roads.json';
import existingClans from '../../src/data/scenarios/s1560/clans.json';
import {
  CHUGOKU_CLANS,
  CHUGOKU_EXISTING_CLAN_UPDATES,
} from '../../src/data/scenarios/s1560/batches/chugoku-clans';
import { CHUGOKU_GEOGRAPHY as batch } from '../../src/data/scenarios/s1560/batches/chugoku-geography';
import provenance from '../../src/data/scenarios/s1560/batches/chugoku-geography.sources.json';
import { checkWorld, loadRawScenario, parseScenario } from '../../tools/validate';

const batchNodeIds = new Set([...batch.castles, ...batch.districts].map((n) => n.id));
const mergedNodes = [
  ...existingCastles.filter((n) => !batchNodeIds.has(n.id)),
  ...existingDistricts.filter((n) => !batchNodeIds.has(n.id)),
  ...batch.castles,
  ...batch.districts,
];
const batchRoadIds = new Set(batch.roads.map((r) => r.id));
const mergedRoads = [...existingRoads.edges.filter((r) => !batchRoadIds.has(r.id)), ...batch.roads];

describe('staged B6 Chugoku geography (not full scenario closure)', () => {
  it('keeps canonical palettes separated across every new inter-clan road', () => {
    const colors = new Map(
      [...existingClans.clans, ...CHUGOKU_CLANS.clans, ...CHUGOKU_EXISTING_CLAN_UPDATES].map(
        (c) => [c.id, c.colorIndex],
      ),
    );
    const owners = new Map(
      [...existingCastles, ...batch.castles].map((c) => [c.id, c.ownerClanId]),
    );
    for (const d of [...existingDistricts, ...batch.districts])
      owners.set(d.id, owners.get(d.castleId)!);
    for (const r of batch.roads) {
      const a = owners.get(r.a)!,
        b = owners.get(r.b)!;
      if (a === b) continue;
      expect(colors.has(a) && colors.has(b)).toBe(true);
      const delta = Math.abs(colors.get(a)! - colors.get(b)!);
      expect(Math.min(delta, 40 - delta)).toBeGreaterThanOrEqual(BAL.dataClanColorMinRing);
    }
  });
  it('has the exact canonical provincial, castle, district and koku quotas', () => {
    expect(batch.provinces).toHaveLength(11);
    expect(batch.castles).toHaveLength(16);
    expect(batch.districts).toHaveLength(44);
    expect(batch.districts.reduce((s, d) => s + d.kokudaka, 0)).toBe(2_150_000);
    for (const [clan, count] of [
      ['mori', 7],
      ['amago', 4],
      ['yamana', 1],
      ['uragami', 2],
      ['akamatsu', 2],
    ] as const)
      expect(batch.castles.filter((c) => c.ownerClanId === `clan.${clan}`)).toHaveLength(count);
    expect(batch.castles.find((c) => c.ownerClanId === 'clan.yamana')?.tier).toBe('branch');
  });
  it('fits the actual outline, advisory construction separation, district radius and canonical capacity', () => {
    const nodes = mergedNodes;
    const closePairs = new Set<string>();
    // plan14 D18: 24wu is advisory, not V13. The frozen B6 marker and later
    // real Kokura site are retained; all other B6 construction pairs still meet24wu.
    for (const n of [...batch.castles, ...batch.districts]) {
      expect(outline.polygons.some((p) => pointInPolygon(n.pos.x, n.pos.y, p.points))).toBe(true);
      expect(Number.isInteger(n.pos.x) && Number.isInteger(n.pos.y)).toBe(true);
      for (const other of nodes)
        if (other.id !== n.id) {
          const distance = Math.hypot(n.pos.x - other.pos.x, n.pos.y - other.pos.y);
          expect(distance).toBeGreaterThan(0);
          if (distance < 24) closePairs.add([n.id, other.id].sort().join('|'));
        }
    }
    expect([...closePairs].sort()).toEqual(['castle.kokura|dist.nagato-toyoura']);
    const toyoura = batch.districts.find((d) => d.id === 'dist.nagato-toyoura')!;
    const kokura = existingCastles.find((c) => c.id === 'castle.kokura')!;
    expect(toyoura.pos).toEqual({ x: 564, y: 3189 });
    expect(kokura.pos).toEqual(lonLatToWorld(130.87, 33.88));
    expect((toyoura.pos.x - kokura.pos.x) ** 2 + (toyoura.pos.y - kokura.pos.y) ** 2).toBe(85);
    expect(new Set(nodes.map((n) => `${n.pos.x},${n.pos.y}`)).size).toBe(nodes.length);
    for (const district of batch.districts)
      expect(district.pos).toEqual(existingDistricts.find((d) => d.id === district.id)!.pos);
    for (const c of batch.castles) {
      const ds = batch.districts.filter((d) => d.castleId === c.id);
      expect(ds.length).toBeGreaterThanOrEqual(2);
      const cap =
        (c.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
        Math.floor(ds.reduce((s, d) => s + d.population, 0) * BAL.soldiersPerPop);
      expect(c.soldiers).toBeGreaterThanOrEqual(cap * 0.4);
      expect(c.soldiers).toBeLessThanOrEqual(cap * 0.7);
      expect(c.food).toBeLessThanOrEqual(
        c.tier === 'main' ? BAL.castleFoodCapMain : BAL.castleFoodCapBranch,
      );
      for (const d of ds) {
        const distance = Math.hypot(c.pos.x - d.pos.x, c.pos.y - d.pos.y);
        expect(distance).toBeGreaterThanOrEqual(40);
        expect(distance).toBeLessThanOrEqual(180);
      }
    }
    for (const [id, lon, lat] of [
      ['yoshida-koriyama', 132.7, 34.67],
      ['gassan-toda', 133.24, 35.38],
    ] as const) {
      const c = batch.castles.find((c) => c.id === `castle.${id}`)!;
      const anchor = lonLatToWorld(lon, lat);
      expect(Math.hypot(c.pos.x - anchor.x, c.pos.y - anchor.y)).toBeLessThanOrEqual(
        BAL.dataAnchorTolerance,
      );
    }
  });
  it('still rejects exact coordinate overlap under actual V13, including the documented close pair', () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded).not.toBeNull();
    const parsed = parseScenario(loaded!.raw);
    expect(parsed.violations).toEqual([]);
    expect(checkWorld(parsed.world).filter((v) => v.check === 'V13')).toEqual([]);
    const overlapping = structuredClone(parsed.world);
    const toyoura = overlapping.districts.find((d) => d.id === 'dist.nagato-toyoura')!;
    const kokura = overlapping.castles.find((c) => c.id === 'castle.kokura')!;
    kokura.pos = { ...toyoura.pos };
    expect(checkWorld(overlapping).some((v) => v.check === 'V13' && v.severity === 'ERROR')).toBe(
      true,
    );
  });
  it('joins all loaded nodes with unique real endpoints and port-only sea edges', () => {
    const nodes = mergedNodes;
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(nodes.length);
    const adjacent = new Map<string, string[]>(),
      pairs = new Set<string>();
    for (const edge of mergedRoads) {
      expect(ids.has(edge.a) && ids.has(edge.b)).toBe(true);
      const pair = [edge.a, edge.b].sort().join('|');
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      adjacent.set(edge.a, [...(adjacent.get(edge.a) ?? []), edge.b]);
      adjacent.set(edge.b, [...(adjacent.get(edge.b) ?? []), edge.a]);
      if (edge.type === 'sea')
        for (const id of [edge.a, edge.b])
          expect([...existingDistricts, ...batch.districts].find((d) => d.id === id)?.isPort).toBe(
            true,
          );
    }
    const seen = new Set<string>(),
      queue = [nodes[0]!.id];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(adjacent.get(id) ?? []));
    }
    expect(seen.size).toBe(nodes.length);
    expect(
      batch.roads.some(
        (r) => r.a === 'dist.harima-shikama' && r.b === 'dist.settsu-nishinari' && r.grade === 3,
      ),
    ).toBe(true);
    expect(
      batch.roads.some(
        (r) => r.a === 'dist.inaba-keta' && r.b === 'dist.tajima-keta' && r.grade === 2,
      ),
    ).toBe(true);
  });
  it('records each castle source and explicitly separates scenario ownership from dates', () => {
    for (const c of batch.castles)
      expect(
        provenance.sources.some(
          (s) => 'castleId' in s && s.castleId === c.id && s.url.startsWith('https://'),
        ),
      ).toBe(true);
    expect(provenance.ownershipMethod).toContain('1561');
    expect(
      provenance.sources.find((s) => 'castleId' in s && s.castleId === 'castle.yonago')?.supports,
    ).toContain('1591');
    expect(
      provenance.sources.find((s) => 'castleId' in s && s.castleId === 'castle.tatsuno')?.supports,
    ).toContain('Keirozan');
  });
});
