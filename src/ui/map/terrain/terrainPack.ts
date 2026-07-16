// 地形資料包裝（terrain pack）：把 `src/data/map/terrain.json`（扁平座標，經 zod 驗證）轉為
// `MapStaticData['terrain']` 所需之 `{x,y}` 點陣列形狀，供 `MapRenderer`／`terrainDraw` 消費。
//
// 規格：M6-V5 技術設計文件 §4.3（本檔逐字實作）、§VD6（由 UI 邊界填充，core 不 import terrain.json，
// 維持 core 純度／golden 不動）。呼叫端見 `src/ui/screens/MainScreen.tsx`（Slice D）之
// `staticData` useMemo：`{ ...selectMapStaticModel(game), terrain: buildTerrainPack() }`。
//
// 決定論：純函式、模組級快取——同一 process 內重複呼叫回傳同一參考（利於 React useMemo 之
// 依賴穩定性判定，避免每次 render 產生新物件觸發不必要重繪）。
// mountains／forests 已於 `tools/gen-assets.ts`（Slice A）烘焙進 relief／forest 紋理，不進本
// runtime pack；本檔僅轉出 rivers／lakes（`waterFeatures` 向量繪製所需）。

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
 * 扁平 `[x,y,...]` 轉為 `{x,y}[]`；mountains/forests 不進 runtime（relief/forest 已烘焙），
 * 僅 rivers/lakes 進（`waterFeatures` 向量繪製所需）。模組級快取：同輸入回傳同快取參考。
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
    rivers: file.rivers.map((r) => ({
      id: r.id,
      points: toPoints(r.points),
      widthClass: r.widthClass,
    })),
    lakes: file.lakes.map((l) => ({ id: l.id, polygon: toPoints(l.polygon) })),
  };
  return cached;
}
