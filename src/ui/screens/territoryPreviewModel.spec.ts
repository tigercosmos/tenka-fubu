import { describe, expect, it } from 'vitest';
import { loadS1560Scenario } from '@data/scenarios/s1560';
import { buildDaimyoTerritoryData, clanAtTerritoryCell } from './territoryPreviewModel';

describe('new-game national territory preview', () => {
  it('maps every selectable clan to visible raster territory through its actual castle owner', async () => {
    const bundle = await loadS1560Scenario();
    const preview = buildDaimyoTerritoryData(bundle);
    const castleOwner = new Map(bundle.castles.map((castle) => [castle.id, castle.ownerClanId]));
    const districtOwner = new Map(
      bundle.districts.map((district) => [district.id, castleOwner.get(district.castleId)]),
    );
    const coverage = new Map<string, number>();
    const { grid } = preview;
    for (let index = 0; index < grid.nearestDistrict.length; index += 1) {
      const districtIndex = grid.nearestDistrict[index];
      if (districtIndex === undefined || districtIndex === 0xffff) continue;
      const districtId = grid.districtIds[districtIndex];
      const expected = districtOwner.get(districtId ?? '');
      expect(expected, `district ${districtId} has a castle owner`).toBeDefined();
      const x = index % grid.size;
      const y = Math.floor(index / grid.size);
      if (index % 257 === 0) expect(clanAtTerritoryCell(preview, x, y)).toBe(expected);
      coverage.set(expected!, (coverage.get(expected!) ?? 0) + 1);
    }
    expect(bundle.clans).toHaveLength(41);
    for (const clan of bundle.clans)
      expect(coverage.get(clan.id) ?? 0, `${clan.id} has selectable map area`).toBeGreaterThan(0);
    expect(clanAtTerritoryCell(preview, 0, 0)).toBeNull();
    expect(clanAtTerritoryCell(preview, -1, 10)).toBeNull();
    expect(clanAtTerritoryCell(preview, grid.size, 10)).toBeNull();
  });
});
