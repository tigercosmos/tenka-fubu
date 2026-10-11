import { describe, expect, it } from 'vitest';
import {
  TOHOKU_GEOGRAPHY as batch,
  TOHOKU_CASTLE_SITES,
} from '../../src/data/scenarios/s1560/batches/tohoku-geography';
import { auditTohokuGeography } from '../../src/data/scenarios/s1560/batches/tohoku-geography.audit';
import { buildTohokuClans } from '../../src/data/scenarios/s1560/batches/tohoku-clans';
import provenance from '../../src/data/scenarios/s1560/batches/tohoku-geography.sources.json';
import { lonLatToWorld } from '../../src/data/map/projection';
import { zCastlesFile, zDistrictsFile, zProvincesFile, zRoadsFile } from '../../src/data/schemas';

describe('Tohoku geography and complete production reference closure', () => {
  it('has the prescribed14 castles40 districts6 provinces and2.1M koku with actual derived clan resources', () => {
    expect(zCastlesFile.parse(batch.castles)).toEqual(batch.castles);
    expect(zDistrictsFile.parse(batch.districts)).toEqual(batch.districts);
    expect(zProvincesFile.parse({ version: 1, provinces: batch.provinces }).provinces).toEqual(
      batch.provinces,
    );
    expect(zRoadsFile.parse({ version: 1, edges: batch.roads }).edges).toEqual(batch.roads);
    expect(batch.castles).toHaveLength(14);
    expect(batch.districts).toHaveLength(40);
    expect(batch.provinces.map((p) => p.id).sort()).toEqual([
      'prov.iwashiro',
      'prov.mutsu',
      'prov.rikuchu',
      'prov.rikuzen',
      'prov.ugo',
      'prov.uzen',
    ]);
    expect(batch.districts.reduce((s, d) => s + d.kokudaka, 0)).toBe(2_100_000);
    for (const clan of buildTohokuClans(batch).clans) {
      const owned = new Set(
        batch.castles.filter((c) => c.ownerClanId === clan.id).map((c) => c.id),
      );
      const koku = batch.districts
        .filter((d) => owned.has(d.castleId))
        .reduce((s, d) => s + d.kokudaka, 0);
      expect(clan.gold).toBe(Math.round(koku / 200 / 100) * 100);
    }
    expect(batch.castles.filter((c) => c.tier === 'main')).toHaveLength(5);
    expect(batch.castles.filter((c) => c.tier === 'branch').every((c) => c.lordId === null)).toBe(
      true,
    );
  });
  it('checks actual national shadow connectivity, unchanged outline, caps and every land/sea palette adjacency', () => {
    const audit = auditTohokuGeography();
    expect(audit).toMatchObject({
      status: 'staged-B9-geography-pass',
      mergedProvinces: 60,
      mergedCastles: 121,
      mergedDistricts: 344,
      mergedKoku: 17_994_000,
      productionPreserved: true,
      koku: 2_100_000,
    });
    expect(audit.connectedNodes).toBe(audit.mergedNodes);
    expect(audit.deferredReferenceViolations).toEqual([]);
  });
  it('preserves exact projected pins and canonical land grades and northern shipping chain', () => {
    for (const site of TOHOKU_CASTLE_SITES)
      expect(batch.castles.find((c) => c.id === `castle.${site[0]}`)?.pos).toEqual(
        lonLatToWorld(site[4], site[5]),
      );
    for (const [a, b, grade, type] of [
      ['dist.shimotsuke-kawachi', 'dist.iwashiro-shirakawa', 2, 'land'],
      ['dist.echigo-iwafune', 'dist.uzen-okitama', 1, 'land'],
      ['dist.echigo-kubiki-naoetsu', 'dist.ugo-akita-tsuchizaki', 1, 'sea'],
      ['dist.ugo-akita-tsuchizaki', 'dist.mutsu-tsugaru-tosaminato', 1, 'sea'],
    ] as const)
      expect(batch.roads.find((r) => r.a === a && r.b === b)).toMatchObject({ grade, type });
    expect(
      batch.districts
        .filter((d) => d.isPort)
        .map((d) => d.id)
        .sort(),
    ).toEqual(['dist.mutsu-tsugaru-tosaminato', 'dist.ugo-akita-tsuchizaki']);
  });
  it('records all14 institutional site sources without claiming prescribed ownership is verified1560history', () => {
    expect(new Set(provenance.sources.map((s) => s.castleId)).size).toBe(14);
    for (const c of batch.castles) {
      const source = provenance.sources.find((s) => s.castleId === c.id);
      expect(source).toBeDefined();
      expect(source?.url).toMatch(/^https:\/\//);
      expect(source?.boundary.length).toBeGreaterThan(0);
    }
    expect(provenance.sources.find((s) => s.castleId === 'castle.namo')?.supports).toContain(
      'Osaki',
    );
    expect(provenance.sources.find((s) => s.castleId === 'castle.hanamaki')?.supports).toContain(
      'Hienuki',
    );
    expect(provenance.sources.find((s) => s.castleId === 'castle.kozukata')?.boundary).toContain(
      '1597',
    );
  });
});
