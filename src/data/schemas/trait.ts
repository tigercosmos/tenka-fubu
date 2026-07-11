// 特性（Trait）manifest zod schema。
// 規格：plan/14-scenario-data.md §4.8（traits.json；效果本體在 core，§8-D1）。
import { z } from 'zod';
import { RE, id, zName } from './common';

/**
 * 特性清單：06 §3.3 三十筆 ＋ 07 §8-D13 戰法解鎖特性七筆
 *（trait.benzetsu 辯舌／trait.gunryaku 軍略／trait.fudou 不動／trait.hizeme 火攻／
 *  trait.kesshi 決死／trait.roukou 老巧／trait.iryou 醫療），共 37 筆（§8-D2）。
 */
export const zTraitEntry = z.object({
  id: id(RE.trait),
  name: zName, // '軍神'
  rarity: z.enum(['common', 'rare', 'legendary']),
});
export type TraitEntryData = z.infer<typeof zTraitEntry>;

export const zTraitsFile = z.object({
  version: z.literal(1),
  traits: z.array(zTraitEntry).length(37),
});
export type TraitsFileData = z.infer<typeof zTraitsFile>;
