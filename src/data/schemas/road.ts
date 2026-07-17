// 街道邊（RoadEdge）zod schema。
// 規格：plan/14-scenario-data.md §4.12（roads.json；格式真相在 plan/04-map-and-movement.md
// §3.4.1，此檔收錄 zod 實作，供 M2-6／04-T3 的 MapGraph 建構直接消費）。
import { z } from 'zod';
import { ROAD_KIND_VALUES } from '../../core/state/enums';
import { RE, id, zName, zNodeId } from './common';

export const zRoadEdge = z.object({
  id: id(RE.road),
  a: zNodeId, // MapNodeId（城∪郡）
  b: zNodeId,
  type: z.enum(ROAD_KIND_VALUES),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3)]), // 海路一律 1
  baseDays: z.number().min(0.5).max(8).multipleOf(0.5),
  name: zName.optional(), // '東海道'（渲染用）
  waypoints: z.array(z.number().int()).optional(), // 偶數長度（validate.ts 檢）
  bridges: z.array(z.number().int()).optional(), // 橋面中心點扁平 [x,y,...]（偶數長度，validate.ts 檢）；顯示用（[M6-V6]）
});
export type RoadEdgeData = z.infer<typeof zRoadEdge>;

export const zRoadsFile = z.object({ version: z.literal(1), edges: z.array(zRoadEdge).min(1) });
export type RoadsFileData = z.infer<typeof zRoadsFile>;
