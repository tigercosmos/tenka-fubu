// 政策（Policy）manifest zod schema。
// 規格：plan/14-scenario-data.md §4.10（policies.json）。
import { z } from 'zod';
import { RE, id, zName, int0 } from './common';

/** 政策清單 = 05 §3.7.2 十三筆（效果與特殊解鎖條件實作於 core，數值見 05/15）。 */
export const zPolicyEntry = z.object({
  id: id(RE.pol),
  name: zName, // '樂市樂座'
  prestigeReq: int0, // 威信門檻
  costGold: int0, // 施行費（貫）
  exclusiveWith: z.array(id(RE.pol)).default([]), // 互斥政策
});
export type PolicyEntryData = z.infer<typeof zPolicyEntry>;

export const zPoliciesFile = z.object({
  version: z.literal(1),
  policies: z.array(zPolicyEntry).length(13),
});
export type PoliciesFileData = z.infer<typeof zPoliciesFile>;
