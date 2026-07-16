// 地形向量原始資料 zod schema（規格：plan/04-map-and-movement.md §3.10.1–§3.10.3；
// M6-V5 技術設計文件 §4.1；T15 部分落地）。
//
// 純 schema、無副作用：同時供 tools/gen-assets.ts（Node，烘焙 relief／forest 紋理）與
// src/ui/map/terrain/terrainPack.ts（瀏覽器，河湖向量）共用 import。座標為 4096×4096 世界
// 空間整數（投影公式見 src/data/map/projection.ts）；扁平陣列 [x0,y0,x1,y1,...]。

import { z } from 'zod';

const zCoord = z.number().int().min(0).max(4096);
/** 扁平多邊形 [x0,y0,...]：偶數長度、≥3 點（≥6 數）。 */
const zFlatPolygon = z.array(zCoord).refine((a) => a.length % 2 === 0 && a.length >= 6, {
  message: '多邊形須為偶數長度且至少 3 點',
});
/** 扁平折線 [x0,y0,...]：偶數長度、≥2 點（≥4 數）。 */
const zFlatPolyline = z.array(zCoord).refine((a) => a.length % 2 === 0 && a.length >= 4, {
  message: '折線須為偶數長度且至少 2 點',
});

export const zTerrainMountain = z.object({
  id: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  mass: zFlatPolygon,
  ridges: z.array(zFlatPolyline).min(0),
});
export const zTerrainForest = z.object({ id: z.string().min(1), polygon: zFlatPolygon });
export const zTerrainRiver = z.object({
  id: z.string().min(1),
  points: zFlatPolyline, // 上游→下游（末點為河口）
  widthClass: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export const zTerrainLake = z.object({ id: z.string().min(1), polygon: zFlatPolygon });

export const zTerrainFile = z.object({
  version: z.literal(1),
  mountains: z.array(zTerrainMountain),
  forests: z.array(zTerrainForest),
  rivers: z.array(zTerrainRiver),
  lakes: z.array(zTerrainLake),
});
export type TerrainFile = z.infer<typeof zTerrainFile>;
