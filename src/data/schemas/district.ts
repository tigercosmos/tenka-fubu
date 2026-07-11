// 郡（District）zod schema。
// 規格：plan/14-scenario-data.md §4.4（districts.json）。
//
// 【勘誤】14 §4.4 原文 `developFocus` 寫 `z.enum(['agri', 'commerce', 'security'])`；
// 第三值與 02 §3.3／05 §3.2.2 定案之 `DevelopFocus = 'agri' | 'commerce' | 'barracks'`
// （E-07：`security`→`barracks`）不一致，屬 02 已修正、14 未同步更新之殘留誤字。
// 依 00>02>15>系統>UI 優先序以 02 為準；本檔改為直接 reuse core/state/enums.ts 的
// `DEVELOP_FOCUS_VALUES`（單一真相），已回寫 plan/14-scenario-data.md §8（D15）。
import { z } from 'zod';
import { DEVELOP_FOCUS_VALUES } from '../../core/state/enums';
import { RE, id, zPos, zName, int0, pct100 } from './common';

/** 郡（02 §4.6 District 靜態子集；ownerClanId 由 builder 設為所轄城 owner，§8-D7）。 */
export const zDistrict = z.object({
  id: id(RE.dist),
  name: zName, // '春日井郡'（實名令制郡）
  castleId: id(RE.castle), // 所轄城（INV-03 鏡像由 builder 建立）
  pos: zPos,
  isPort: z.boolean().default(false), // 港郡（海路端點資格，04 §3.4.3）
  stewardId: id(RE.off).nullable().default(null), // 開局知行領主；null=直轄
  kokudaka: int0, // 石高（石/年）
  kokudakaCap: int0, // 開發潛力上限（石/年）；≥ kokudaka
  commerce: int0, // 商業（點）
  commerceCap: z.number().int().min(0).max(2000), // ≤ BAL.commerceMaxAbs（00 §6）
  population: int0, // 人口（人）
  populationCap: int0, // 人口上限（人）
  publicOrder: pct100.default(60), // 治安
  developFocus: z.enum(DEVELOP_FOCUS_VALUES).default('agri'),
});
export type DistrictData = z.infer<typeof zDistrict>;

export const zDistrictsFile = z.array(zDistrict).min(1);
export type DistrictsFileData = z.infer<typeof zDistrictsFile>;
