import { describe, expect, it } from 'vitest';
import { lonLatToWorld } from '../../src/data/map/projection';
import { zCastlesFile, zDistrictsFile, zProvincesFile, zRoadsFile } from '../../src/data/schemas';
import {
  KYUSHU_GEOGRAPHY as batch,
  KYUSHU_CASTLE_SITES,
  KYUSHU_DISTRICT_SITES,
} from '../../src/data/scenarios/s1560/batches/kyushu-geography';
import { auditKyushuGeography } from '../../src/data/scenarios/s1560/batches/kyushu-geography.audit';
import provenance from '../../src/data/scenarios/s1560/batches/kyushu-geography.sources.json';
import { checkWorld, loadRawScenario, parseScenario } from '../../tools/validate';
import { KYUSHU_CLANS } from '../../src/data/scenarios/s1560/batches/kyushu-clans';

describe('staged Kyushu geography, not production or roster closure', () => {
  it('has exactly nine prescribed provinces, fourteen castles and forty districts at1.8M koku', () => {
    expect(zCastlesFile.parse(batch.castles)).toEqual(batch.castles);
    expect(zDistrictsFile.parse(batch.districts)).toEqual(batch.districts);
    expect(zProvincesFile.parse({ version: 1, provinces: batch.provinces }).provinces).toEqual(
      batch.provinces,
    );
    expect(zRoadsFile.parse({ version: 1, edges: batch.roads }).edges).toEqual(batch.roads);
    expect(batch.provinces.map((p) => p.id).sort()).toEqual(
      ['bungo', 'buzen', 'chikugo', 'chikuzen', 'higo', 'hizen', 'hyuga', 'osumi', 'satsuma']
        .map((p) => `prov.${p}`)
        .sort(),
    );
    expect(batch.provinces.every((p) => p.region === 'kyushu')).toBe(true);
    expect(batch.castles).toHaveLength(14);
    expect(batch.districts).toHaveLength(40);
    expect(batch.districts.reduce((s, d) => s + d.kokudaka, 0)).toBe(1_800_000);
    expect(new Set(batch.castles.map((c) => c.provinceId)).size).toBe(9);
    expect(batch.castles.filter((c) => c.tier === 'main')).toHaveLength(5);
    expect(batch.castles.filter((c) => c.tier === 'branch').every((c) => c.lordId === null)).toBe(
      true,
    );
  });
  it('passes actual unchanged V15, shared soldier caps, port checks, color distances and merged connectivity', () => {
    expect(auditKyushuGeography()).toMatchObject({
      status: 'staged-B8-geography-pass',
      provinces: 9,
      castles: 14,
      districts: 40,
      koku: 1_800_000,
    });
    const audit = auditKyushuGeography();
    expect(audit.connectedNodes).toBe(audit.mergedNodes);
    expect(audit.baseRouteDays).toBeGreaterThanOrEqual(8);
    expect(audit.baseRouteDays).toBeLessThanOrEqual(14);
    expect(audit.acceptanceBoundary).toContain('Geography only');
  });
  it('preserves real approximate castle pins, including close pairs rather than moving them', () => {
    for (const site of KYUSHU_CASTLE_SITES)
      expect(batch.castles.find((c) => c.id === `castle.${site[0]}`)?.pos).toEqual(
        lonLatToWorld(site[4], site[5]),
      );
    expect(auditKyushuGeography().closeCastlePairs).toContainEqual([
      'castle.tonokori',
      'castle.sadowara',
    ]);
    expect(auditKyushuGeography().closeCastlePairs).toContainEqual([
      'castle.muranaka',
      'castle.hasuike',
    ]);
    expect(batch.castles.find((c) => c.id === 'castle.shimizu')).toMatchObject({
      provinceId: 'prov.osumi',
      ownerClanId: 'clan.shimazu',
    });
    expect(provenance.shimizuDecision).toContain('not Kagoshima');
  });
  it('uses canonical sea seams and the required northern shipping chain with actual existing ports', () => {
    for (const [a, b, cost] of [
      ['dist.nagato-toyoura', 'dist.buzen-kiku-moji', 0.5],
      ['dist.bungo-amabe-saganoseki', 'dist.iyo-uwa-sadamisaki', 2],
      ['dist.suo-kumage-kaminoseki', 'dist.buzen-kiku-moji', 2],
      ['dist.buzen-kiku-moji', 'dist.chikuzen-naka-hakata', 2],
    ] as const)
      expect(batch.roads.find((r) => r.a === a && r.b === b)).toMatchObject({
        type: 'sea',
        grade: 1,
        baseDays: cost,
      });
    const hyuga = new Set([
      ...batch.castles.filter((c) => c.provinceId === 'prov.hyuga').map((c) => c.id),
      ...batch.districts
        .filter((d) => ['castle.tonokori', 'castle.sadowara'].includes(d.castleId))
        .map((d) => d.id),
    ]);
    const hitoyoshi = new Set([
      'castle.hitoyoshi',
      ...batch.districts.filter((d) => d.castleId === 'castle.hitoyoshi').map((d) => d.id),
    ]);
    expect(
      batch.roads.some(
        (r) => (hitoyoshi.has(r.a) && hyuga.has(r.b)) || (hyuga.has(r.a) && hitoyoshi.has(r.b)),
      ),
    ).toBe(false);
  });
  it('rejects the former Otomo34/Saionji32 sea adjacency through actual V12', () => {
    const loaded = loadRawScenario('s1560');
    if (!loaded) throw new Error('Missing production scenario');
    const { world } = parseScenario(loaded.raw);
    const violations = checkWorld({
      ...world,
      castles: [...world.castles, ...batch.castles],
      districts: [...world.districts, ...batch.districts],
      roads: [...world.roads, ...batch.roads],
      provinces: [...world.provinces, ...batch.provinces],
      clans: [
        ...world.clans,
        ...KYUSHU_CLANS.clans.map((clan) =>
          clan.id === 'clan.otomo' ? { ...clan, colorIndex: 34 } : clan,
        ),
      ],
    });
    expect(violations).toContainEqual({
      severity: 'ERROR',
      check: 'V12',
      message: '相鄰勢力 clan.otomo(34)／clan.saionji(32) 色環距 2 < 4',
      ids: ['clan.otomo', 'clan.saionji'],
    });
  });
  it('records every named castle source and separates documentary facts from authored1560 abstraction', () => {
    expect(new Set(provenance.sources.map((s) => s.castleId)).size).toBe(14);
    for (const c of batch.castles) {
      const evidence = provenance.sources.find((s) => s.castleId === c.id);
      expect(evidence).toBeDefined();
      if (!evidence) throw new Error(c.id);
      expect(evidence.url).toMatch(/^https:\/\//);
      expect(evidence.classification.length).toBeGreaterThan(0);
      expect(evidence.supports.length).toBeGreaterThan(0);
    }
    expect(provenance.scope).toContain('Production activation');
    expect(provenance.ownershipMethod).toContain('1562–1563');
    expect(provenance.ownershipMethod).toContain('1602');
    expect(provenance.coordinateMethod).toContain('not survey');
    expect(KYUSHU_DISTRICT_SITES).toHaveLength(40);
  });
});
