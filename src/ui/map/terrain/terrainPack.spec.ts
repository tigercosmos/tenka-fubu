// `buildTerrainPack`（src/ui/map/terrain/terrainPack.ts）純函式測試。
// 規格：M6-V5 技術設計文件 §4.3、§8.1（terrainPack.spec 列）：flat→{x,y} 正確、快取同參考、
// asset id 常數、rivers/lakes 數量對映 terrain.json。

import { describe, expect, it } from 'vitest';
import terrainJson from '@data/map/terrain.json';
import { zTerrainFile } from '@data/schemas/terrain';
import { buildTerrainPack, TERRAIN_FOREST_ASSET_ID, TERRAIN_RELIEF_ASSET_ID } from './terrainPack';

describe('buildTerrainPack（M6-V5，設計 §4.3）', () => {
  it('asset id 常數符合 manifest 登錄之 id（Slice A）', () => {
    expect(TERRAIN_RELIEF_ASSET_ID).toBe('texture.terrain.relief@1x');
    expect(TERRAIN_FOREST_ASSET_ID).toBe('texture.terrain.forest@1x');
  });

  it('回傳之 reliefAssetId/forestAssetId 為上述常數', () => {
    const pack = buildTerrainPack();
    expect(pack.reliefAssetId).toBe(TERRAIN_RELIEF_ASSET_ID);
    expect(pack.forestAssetId).toBe(TERRAIN_FOREST_ASSET_ID);
  });

  it('rivers/lakes 數量對映 terrain.json（mountains/forests 不進 runtime）', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    expect(pack.rivers).toHaveLength(file.rivers.length);
    expect(pack.lakes).toHaveLength(file.lakes.length);
    // mountains/forests 已烘焙進紋理，pack 形狀本無此欄位（型別即不含）。
    expect('mountains' in pack).toBe(false);
    expect('forests' in pack).toBe(false);
  });

  it('扁平 [x0,y0,...] 正確轉為 {x,y}[]（保序、逐點對應）', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    const firstRiverFlat = file.rivers[0]!.points;
    const firstRiverPoints = pack.rivers[0]!.points;
    expect(firstRiverPoints).toHaveLength(firstRiverFlat.length / 2);
    for (let i = 0; i < firstRiverPoints.length; i += 1) {
      expect(firstRiverPoints[i]).toEqual({
        x: firstRiverFlat[i * 2],
        y: firstRiverFlat[i * 2 + 1],
      });
    }
    const firstLakeFlat = file.lakes[0]!.polygon;
    const firstLakePoints = pack.lakes[0]!.polygon;
    expect(firstLakePoints).toHaveLength(firstLakeFlat.length / 2);
    expect(firstLakePoints[0]).toEqual({ x: firstLakeFlat[0], y: firstLakeFlat[1] });
  });

  it('widthClass 逐河對映 terrain.json（未被轉換過程更動）', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    const byId = new Map(file.rivers.map((r) => [r.id, r.widthClass]));
    for (const r of pack.rivers) {
      expect(r.widthClass).toBe(byId.get(r.id));
    }
  });

  it('id 逐湖對映 terrain.json', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    expect(pack.lakes.map((l) => l.id).sort()).toEqual(file.lakes.map((l) => l.id).sort());
  });

  it('重複呼叫回傳同一快取參考（React useMemo 依賴穩定性）', () => {
    const a = buildTerrainPack();
    const b = buildTerrainPack();
    expect(a).toBe(b);
    expect(a.rivers).toBe(b.rivers);
    expect(a.lakes).toBe(b.lakes);
  });
});
