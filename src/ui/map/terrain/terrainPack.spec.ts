// `buildTerrainPack`（src/ui/map/terrain/terrainPack.ts）純函式測試。
// 規格：M6-V5 技術設計文件 §4.3、§8.1（terrainPack.spec 列）：flat→{x,y} 正確、快取同參考、
// asset id 常數、rivers/lakes 數量對映 terrain.json。

import { describe, expect, it } from 'vitest';
import terrainJson from '@data/map/terrain.json';
import { zTerrainFile } from '@data/schemas/terrain';
import { buildTerrainPack, TERRAIN_FOREST_ASSET_ID, TERRAIN_RELIEF_ASSET_ID } from './terrainPack';
import { VISUAL_ASSET_MANIFEST } from '@ui/assets/manifest';

describe('buildTerrainPack（M6-V5，設計 §4.3）', () => {
  it('selects the inspected Akaishi v3 candidate while retaining v1 and v2 manifest evidence', () => {
    expect(buildTerrainPack().mountainArtById?.['mt.akaishi']).toBe(
      'texture.terrain.mountain-akaishi-massif-v3',
    );
    expect(
      buildTerrainPack().mountainArtContentBounds?.['texture.terrain.mountain-akaishi-massif-v3'],
    ).toEqual({
      x: 142,
      y: 23,
      width: 787,
      height: 1495,
    });
    expect(
      VISUAL_ASSET_MANIFEST.find(
        (entry) => entry.id === 'texture.terrain.mountain-akaishi-massif-v3',
      ),
    ).toMatchObject({
      contentHash: 'b2eb8a4c72513e82391045620d3fbcf764ff3b23e951552995fda8e8480154a3',
      pixelSize: { width: 1024, height: 1536 },
    });
    for (const [version, hash] of [
      ['v1', 'db45455b3e18f432c3f79f413d9fd37876933a687be38ac46a31157ec080e220'],
      ['v2', '50b4093f27e9387090284241013fa7672c8b3288b2e9404a7af40aff854259bf'],
    ])
      expect(
        VISUAL_ASSET_MANIFEST.find(
          (entry) => entry.id === `texture.terrain.mountain-akaishi-massif-${version}`,
        )?.contentHash,
      ).toBe(hash);
  });
  it('replaces only Akaishi with v3 while retaining all other thirteen selections and fourteen canonical masses/ridges', () => {
    const pack = buildTerrainPack();
    const expected = {
      'mt.hida': 'texture.terrain.mountain-hida-massif-v2',
      'mt.ibuki': 'texture.terrain.mountain-foothills-v1',
      'mt.kiso': 'texture.terrain.mountain-kiso-massif-v1',
      'mt.kyushu-aso': 'texture.terrain.mountain-aso-massif-v1',
      'mt.suzuka': 'texture.terrain.mountain-vertical-v5',
      'mt.echigo': 'texture.terrain.mountain-echigo-massif-v1',
      'mt.chugoku': 'texture.terrain.mountain-chugoku-massif-v1',
      'mt.shikoku': 'texture.terrain.mountain-shikoku-massif-v1',
      'mt.kii': 'texture.terrain.mountain-kii-massif-v1',
      'mt.ou': 'texture.terrain.mountain-vertical-v4',
      'mt.tanba': 'texture.terrain.mountain-horizontal-v3',
      'mt.kanto': 'texture.terrain.mountain-horizontal-v3',
      'mt.hakone-fuji': 'texture.terrain.mountain-horizontal-v3',
    };
    for (const [id, asset] of Object.entries(expected))
      expect(
        pack.mountainArtById?.[id] ??
          pack.mountainArtVariants?.[id === 'mt.ou' ? 'vertical' : 'horizontal'],
      ).toBe(asset);
    const points = (flat: readonly number[]) =>
      Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2]!, y: flat[i * 2 + 1]! }));
    expect(pack.mountains).toEqual(
      zTerrainFile.parse(terrainJson).mountains.map((m) => ({
        id: m.id,
        tier: m.tier,
        mass: points(m.mass),
        ridges: m.ridges.map(points),
      })),
    );
    expect(pack.mountainArtById?.['mt.akaishi']).toBe('texture.terrain.mountain-akaishi-massif-v3');
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-akaishi-massif-v2']).toEqual({
      x: 143,
      y: 25,
      width: 791,
      height: 1497,
    });
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-akaishi-massif-v1']).toEqual({
      x: 204,
      y: 13,
      width: 623,
      height: 1511,
    });
  });
  it('adds the inspected Akaishi v2 manifest entry without removing the historical v1 entry', () => {
    expect(
      VISUAL_ASSET_MANIFEST.find(
        (entry) => entry.id === 'texture.terrain.mountain-akaishi-massif-v1',
      ),
    ).toMatchObject({
      contentHash: 'db45455b3e18f432c3f79f413d9fd37876933a687be38ac46a31157ec080e220',
      pixelSize: { width: 1024, height: 1536 },
    });
    expect(
      VISUAL_ASSET_MANIFEST.find(
        (entry) => entry.id === 'texture.terrain.mountain-akaishi-massif-v2',
      ),
    ).toMatchObject({
      runtimePath: 'assets/textures/terrain-mountain-akaishi-massif-v2.png',
      contentHash: '50b4093f27e9387090284241013fa7672c8b3288b2e9404a7af40aff854259bf',
      pixelSize: { width: 1024, height: 1536 },
    });
  });
  it('replaces only Kiso with its original connected massif, retaining thirteen actual asset selections', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtById?.['mt.kiso']).toBe('texture.terrain.mountain-kiso-massif-v1');
    const expected = {
      'mt.hida': 'texture.terrain.mountain-hida-massif-v2',
      'mt.ibuki': 'texture.terrain.mountain-foothills-v1',
      'mt.akaishi': 'texture.terrain.mountain-akaishi-massif-v3',
      'mt.kyushu-aso': 'texture.terrain.mountain-aso-massif-v1',
      'mt.suzuka': 'texture.terrain.mountain-vertical-v5',
      'mt.echigo': 'texture.terrain.mountain-echigo-massif-v1',
      'mt.chugoku': 'texture.terrain.mountain-chugoku-massif-v1',
      'mt.shikoku': 'texture.terrain.mountain-shikoku-massif-v1',
      'mt.kii': 'texture.terrain.mountain-kii-massif-v1',
      'mt.ou': 'texture.terrain.mountain-vertical-v4',
      'mt.tanba': 'texture.terrain.mountain-horizontal-v3',
      'mt.kanto': 'texture.terrain.mountain-horizontal-v3',
      'mt.hakone-fuji': 'texture.terrain.mountain-horizontal-v3',
    };
    for (const [id, assetId] of Object.entries(expected)) {
      const selected =
        pack.mountainArtById?.[id] ??
        pack.mountainArtVariants?.[id === 'mt.ou' ? 'vertical' : 'horizontal'];
      expect(selected, id).toBe(assetId);
    }
    expect(pack.mountains).toHaveLength(14);
  });
  it('binds Hida to its original portrait massif without changing the other thirteen selections', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtById?.['mt.hida']).toBe('texture.terrain.mountain-hida-massif-v2');
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-hida-massif-v2']).toEqual({
      x: 244,
      y: 77,
      width: 582,
      height: 1376,
    });
    expect(pack.mountains).toHaveLength(14);
    expect(pack.mountains?.find((mountain) => mountain.id === 'mt.hida')?.mass).toEqual(
      zTerrainFile
        .parse(terrainJson)
        .mountains.find((mountain) => mountain.id === 'mt.hida')!
        .mass.reduce<{ x: number; y: number }[]>((points, value, index, values) => {
          if (index % 2 === 0) points.push({ x: value, y: values[index + 1]! });
          return points;
        }, []),
    );
  });
  it('binds only Kii to its inspected original connected massif frame', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtById?.['mt.kii']).toBe('texture.terrain.mountain-kii-massif-v1');
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-kii-massif-v1']).toEqual({
      x: 43,
      y: 100,
      width: 1827,
      height: 677,
    });
  });
  it('binds Shikoku to a distinct original massif rather than the repeated horizontal default', () => {
    expect(buildTerrainPack().mountainArtById?.['mt.shikoku']).toBe(
      'texture.terrain.mountain-shikoku-massif-v1',
    );
  });
  it('binds only Chugoku to the inspected original wide massif frame', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtById?.['mt.chugoku']).toBe('texture.terrain.mountain-chugoku-massif-v1');
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-chugoku-massif-v1']).toEqual({
      x: 28,
      y: 152,
      width: 1862,
      height: 585,
    });
  });
  it('selects a portrait Echigo massif with its inspected alpha frame, preserving the other per-ID bindings', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtById?.['mt.echigo']).toBe('texture.terrain.mountain-echigo-massif-v1');
    expect(pack.mountainArtContentBounds?.['texture.terrain.mountain-echigo-massif-v1']).toEqual({
      x: 26,
      y: 20,
      width: 1047,
      height: 1407,
    });
    expect(
      Object.fromEntries(
        Object.entries(pack.mountainArtById ?? {}).filter(([id]) => id !== 'mt.echigo'),
      ),
    ).toEqual({
      'mt.ibuki': 'texture.terrain.mountain-foothills-v1',
      'mt.kiso': 'texture.terrain.mountain-kiso-massif-v1',
      'mt.akaishi': 'texture.terrain.mountain-akaishi-massif-v3',
      'mt.kyushu-aso': 'texture.terrain.mountain-aso-massif-v1',
      'mt.suzuka': 'texture.terrain.mountain-vertical-v5',
      'mt.chugoku': 'texture.terrain.mountain-chugoku-massif-v1',
      'mt.shikoku': 'texture.terrain.mountain-shikoku-massif-v1',
      'mt.kii': 'texture.terrain.mountain-kii-massif-v1',
      'mt.hida': 'texture.terrain.mountain-hida-massif-v2',
    });
  });
  it('asset id 常數符合 manifest 登錄之 id（Slice A）', () => {
    expect(TERRAIN_RELIEF_ASSET_ID).toBe('texture.terrain.relief@1x');
    expect(TERRAIN_FOREST_ASSET_ID).toBe('texture.terrain.forest@1x');
  });

  it('回傳之 reliefAssetId/forestAssetId 為上述常數', () => {
    const pack = buildTerrainPack();
    expect(pack.reliefAssetId).toBe(TERRAIN_RELIEF_ASSET_ID);
    expect(pack.forestAssetId).toBe(TERRAIN_FOREST_ASSET_ID);
  });

  it('adopts horizontal v3 and vertical v4, retaining both legacy content frames', () => {
    const pack = buildTerrainPack();
    expect(pack.mountainArtVariants).toEqual({
      horizontal: 'texture.terrain.mountain-horizontal-v3',
      vertical: 'texture.terrain.mountain-vertical-v4',
    });
    expect(pack.mountainArtContentBounds).toEqual({
      'texture.terrain.mountain-akaishi-massif-v3': { x: 142, y: 23, width: 787, height: 1495 },
      'texture.terrain.mountain-akaishi-massif-v2': { x: 143, y: 25, width: 791, height: 1497 },
      'texture.terrain.mountain-kiso-massif-v1': { x: 205, y: 34, width: 598, height: 1557 },
      'texture.terrain.mountain-hida-massif-v2': { x: 244, y: 77, width: 582, height: 1376 },
      'texture.terrain.mountain-kii-massif-v1': { x: 43, y: 100, width: 1827, height: 677 },
      'texture.terrain.mountain-shikoku-massif-v1': { x: 23, y: 122, width: 1926, height: 565 },
      'texture.terrain.mountain-chugoku-massif-v1': { x: 28, y: 152, width: 1862, height: 585 },
      'texture.terrain.mountain-echigo-massif-v1': { x: 26, y: 20, width: 1047, height: 1407 },
      'texture.terrain.mountain-akaishi-massif-v1': { x: 204, y: 13, width: 623, height: 1511 },
      'texture.terrain.mountain-aso-massif-v1': { x: 17, y: 125, width: 1230, height: 1025 },
      'texture.terrain.mountain-foothills-v1': { x: 57, y: 49, width: 851, height: 1554 },
      'texture.terrain.mountain-vertical-v5': { x: 248, y: 29, width: 482, height: 1570 },
      'texture.terrain.mountain-horizontal-v3': { x: 12, y: 213, width: 1752, height: 480 },
      'texture.terrain.mountain-vertical-v4': { x: 359, y: 48, width: 339, height: 1381 },
      'texture.terrain.mountain-horizontal-v2': { x: 48, y: 508, width: 1158, height: 272 },
      'texture.terrain.mountain-vertical-v2': { x: 235, y: 27, width: 576, height: 1498 },
    });
    expect(pack.mountainArtById).toEqual({
      'mt.hida': 'texture.terrain.mountain-hida-massif-v2',
      'mt.ibuki': 'texture.terrain.mountain-foothills-v1',
      'mt.kiso': 'texture.terrain.mountain-kiso-massif-v1',
      'mt.akaishi': 'texture.terrain.mountain-akaishi-massif-v3',
      'mt.kyushu-aso': 'texture.terrain.mountain-aso-massif-v1',
      'mt.suzuka': 'texture.terrain.mountain-vertical-v5',
      'mt.echigo': 'texture.terrain.mountain-echigo-massif-v1',
      'mt.chugoku': 'texture.terrain.mountain-chugoku-massif-v1',
      'mt.shikoku': 'texture.terrain.mountain-shikoku-massif-v1',
      'mt.kii': 'texture.terrain.mountain-kii-massif-v1',
    });
  });

  it('runtime contours and water counts match authored terrain.json', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    expect(pack.rivers).toHaveLength(file.rivers.length);
    expect(pack.lakes).toHaveLength(file.lakes.length);
    expect(pack.mountains).toHaveLength(file.mountains.length);
    expect(pack.forests).toHaveLength(file.forests.length);
    expect(pack.mountains?.[0]?.mass[0]).toEqual({
      x: file.mountains[0]!.mass[0],
      y: file.mountains[0]!.mass[1],
    });
  });

  it('changes Ibuki display art only, preserving every authored terrain point and ridge', () => {
    const file = zTerrainFile.parse(terrainJson);
    const pack = buildTerrainPack();
    const points = (flat: readonly number[]) =>
      Array.from({ length: flat.length / 2 }, (_, i) => ({
        x: flat[i * 2],
        y: flat[i * 2 + 1],
      }));
    expect(pack.mountains).toEqual(
      file.mountains.map((m) => ({
        id: m.id,
        tier: m.tier,
        mass: points(m.mass),
        ridges: m.ridges.map(points),
      })),
    );
    expect(pack.forests).toEqual(
      file.forests.map((f) => ({ id: f.id, polygon: points(f.polygon) })),
    );
    expect(pack.rivers).toEqual(
      file.rivers.map((r) => ({ id: r.id, widthClass: r.widthClass, points: points(r.points) })),
    );
    expect(pack.lakes).toEqual(file.lakes.map((l) => ({ id: l.id, polygon: points(l.polygon) })));
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
