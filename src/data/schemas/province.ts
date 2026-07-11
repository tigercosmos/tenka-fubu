// 國（Province）zod schema。
// 規格：plan/14-scenario-data.md §4.2（provinces.json）。
import { z } from 'zod';
import { RE, id, zPos, zName, REGION_VALUES } from './common';

/** 國（02 §4.7 Province 靜態全欄位）。 */
export const zProvince = z.object({
  id: id(RE.prov), // 'prov.owari'
  name: zName, // '尾張'
  region: z.enum(REGION_VALUES), // 9 地方分區（製作批次＋UI 篩選）
  labelPos: zPos, // 國名標籤座標（成員城質心）
});
export type ProvinceData = z.infer<typeof zProvince>;

export const zProvincesFile = z.object({
  version: z.literal(1),
  provinces: z.array(zProvince).min(1),
});
export type ProvincesFileData = z.infer<typeof zProvincesFile>;
