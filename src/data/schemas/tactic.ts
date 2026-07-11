// 戰法（Tactic）manifest zod schema。
// 規格：plan/14-scenario-data.md §4.9（tactics.json）。
import { z } from 'zod';
import { RE, id, zName } from './common';

/** 戰法清單 = 07 §3.8 十二筆；unlockTraitId=null 為預設戰法（突擊/齊射）。 */
export const zTacticEntry = z.object({
  id: id(RE.tac),
  name: zName, // '鐵砲三段'
  unlockTraitId: id(RE.trait).nullable(),
});
export type TacticEntryData = z.infer<typeof zTacticEntry>;

export const zTacticsFile = z.object({
  version: z.literal(1),
  tactics: z.array(zTacticEntry).length(12),
});
export type TacticsFileData = z.infer<typeof zTacticsFile>;
