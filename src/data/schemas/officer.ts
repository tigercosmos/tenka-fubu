// 武將（Officer）zod schema。
// 規格：plan/14-scenario-data.md §4.6（officers/{region}.json，9 檔同 schema）。
import { z } from 'zod';
import { RANK_VALUES } from '../../core/state/enums';
import { RE, id, zName, REGION_VALUES } from './common';

/** 武將（02 §4.4 Officer 靜態子集；status/hasComeOfAge/loyalty/merit 由 builder 推導 §5.3）。 */
export const zOfficer = z.object({
  id: id(RE.off),
  name: zName, // '織田信長'
  clanId: id(RE.clan).nullable(), // null=具名浪人
  locationCastleId: id(RE.castle), // 駐在城（serving）或寄寓城（ronin）
  ldr: z.number().int().min(1).max(120), // 統率
  val: z.number().int().min(1).max(120), // 武勇
  int: z.number().int().min(1).max(120), // 知略
  pol: z.number().int().min(1).max(120), // 政務
  traits: z.array(id(RE.trait)).max(4).default([]), // ≤ BAL.maxTraitsPerOfficer
  tactics: z.array(id(RE.tac)).max(2).default([]), // 解鎖特性檢查在 validate.ts（07 §3.8）
  rank: z.enum(RANK_VALUES).default('kumigashira'),
  isKin: z.boolean().default(false), // 一門眾
  birthYear: z.number().int().min(1470).max(1570), // 1570 為收錄上限（1585 前元服）
  deathYear: z.number().int().min(1540).max(1660), // 卒年基準；validate.ts 檢 deathYear > birthYear
  debutYear: z.number().int().optional(), // 元服登場年；缺→builder = birthYear + BAL.comingOfAgeAge
  // （02 §4.4，五輪裁決 E）
  debutClanId: id(RE.clan).nullable().optional(), // 元服時加入勢力；缺此欄→builder = clanId，
  // 資料明示 null＝直接為浪人（02 §4.4，五輪裁決 E）
  debutCastleId: id(RE.castle).optional(), // 元服/淪浪人時所在城；缺→builder = locationCastleId
  // （02 §4.4，五輪裁決 E）
});
export type OfficerData = z.infer<typeof zOfficer>;

export const zOfficersFile = z.object({
  version: z.literal(1),
  region: z.enum(REGION_VALUES), // 檔名一致性由 validate.ts 檢
  officers: z.array(zOfficer).min(1),
});
export type OfficersFileData = z.infer<typeof zOfficersFile>;
