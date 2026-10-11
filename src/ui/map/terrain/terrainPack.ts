// 地形資料包裝（terrain pack）：把 `src/data/map/terrain.json`（扁平座標，經 zod 驗證）轉為
// `MapStaticData['terrain']` 所需之 `{x,y}` 點陣列形狀，供 `MapRenderer`／`terrainDraw` 消費。
//
// 規格：M6-V5 技術設計文件 §4.3（本檔逐字實作）、§VD6（由 UI 邊界填充，core 不 import terrain.json，
// 維持 core 純度／golden 不動）。呼叫端見 `src/ui/screens/MainScreen.tsx`（Slice D）之
// `staticData` useMemo：`{ ...selectMapStaticModel(game), terrain: buildTerrainPack() }`。
//
// 決定論：純函式、模組級快取——同一 process 內重複呼叫回傳同一參考（利於 React useMemo 之
// 依賴穩定性判定，避免每次 render 產生新物件觸發不必要重繪）。
// mountains／forests 同時提供 runtime 2.5D relief；烘焙底圖仍保留，避免改動地理/資產格式。

import type { MapStaticData } from '../mapViewTypes';
import terrainJson from '@data/map/terrain.json';
import { zTerrainFile } from '@data/schemas/terrain';

/** relief 烘焙紋理資產 id（`src/ui/assets/manifest.ts` 登錄，Slice A 產出）。 */
export const TERRAIN_RELIEF_ASSET_ID = 'texture.terrain.relief@1x';
/** forest 烘焙紋理資產 id（`src/ui/assets/manifest.ts` 登錄，Slice A 產出）。 */
export const TERRAIN_FOREST_ASSET_ID = 'texture.terrain.forest@1x';

export type TerrainPack = NonNullable<MapStaticData['terrain']>;

let cached: TerrainPack | null = null;

/**
 * 讀 `terrain.json`（zod 解析）＋ manifest 資產 id → `MapStaticData['terrain']` 形狀。
 * 扁平 `[x,y,...]` 轉為 `{x,y}[]`；靜態向量供水系及 2.5D 地形使用。
 * 模組級快取：同輸入回傳同快取參考。
 */
export function buildTerrainPack(): TerrainPack {
  if (cached !== null) return cached;
  const file = zTerrainFile.parse(terrainJson);
  const toPoints = (flat: readonly number[]): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
    return out;
  };
  cached = {
    reliefAssetId: TERRAIN_RELIEF_ASSET_ID,
    forestAssetId: TERRAIN_FOREST_ASSET_ID,
    mountainArtAssetId: 'texture.terrain.mountain-woodland-v1',
    mountainMaterialAssetId: 'texture.terrain.woodland-material-v1',
    mountainArtVariants: {
      horizontal: 'texture.terrain.mountain-horizontal-v3',
      vertical: 'texture.terrain.mountain-vertical-v4',
    },
    mountainArtById: {
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
    },
    mountainArtContentBounds: {
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
    },
    forestArtAssetId: 'texture.terrain.forest-canopy-v1',
    groundArtAssetId: 'texture.terrain.ground-grass-v1',
    fieldMaterialAssetId: 'texture.terrain.lowland-field-material-v1',
    mountains: file.mountains.map((m) => ({
      id: m.id,
      tier: m.tier,
      mass: toPoints(m.mass),
      ridges: m.ridges.map(toPoints),
    })),
    forests: file.forests.map((f) => ({ id: f.id, polygon: toPoints(f.polygon) })),
    rivers: file.rivers.map((r) => ({
      id: r.id,
      points: toPoints(r.points),
      widthClass: r.widthClass,
    })),
    lakes: file.lakes.map((l) => ({ id: l.id, polygon: toPoints(l.polygon) })),
  };
  return cached;
}
