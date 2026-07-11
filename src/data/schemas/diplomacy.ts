// 開局外交（Pact／交戰／感情覆寫）zod schema。
// 規格：plan/14-scenario-data.md §4.5（clans.json 的 diplomacy 區塊；§3.3 開局外交關係）。
// 這些 schema 供 clan.ts 的 `zClansFile.diplomacy` 組裝使用（14 §4.5 原文將其與 zClan
// 定義在同一段落；本實作拆一個獨立檔案以呼應「diplomacy」為獨立內容區塊，內容逐字相同）。
import { z } from 'zod';
import { PACT_KIND_VALUES } from '../../core/state/enums';
import { RE, id, pct100 } from './common';

/** 開局協定（builder 轉 02 §4.11 Pact：startDay=0、endDay=months×30）。 */
export const zPactInit = z.object({
  a: id(RE.clan),
  b: id(RE.clan),
  kind: z.enum(PACT_KIND_VALUES),
  months: z.number().int().positive().nullable(), // null 僅限 marriage/vassal（INV-17）
  vassalClanId: id(RE.clan).nullable().default(null), // 僅 vassal 填（∈{a,b}）
});
export type PactInitData = z.infer<typeof zPactInit>;

/** 開局交戰：builder 設該對 lastHostileDay=0（08 §3.1 atWar 推導）。 */
export const zWarEntry = z.object({
  a: id(RE.clan),
  b: id(RE.clan),
});
export type WarEntryData = z.infer<typeof zWarEntry>;

/** 感情覆寫（預設 50，02 §5.5 defaultRow）。 */
export const zSentimentEntry = z.object({
  a: id(RE.clan),
  b: id(RE.clan),
  aToB: pct100,
  bToA: pct100,
});
export type SentimentEntryData = z.infer<typeof zSentimentEntry>;

/** clans.json 的 diplomacy 區塊（14 §4.5）。 */
export const zDiplomacyBlock = z.object({
  pacts: z.array(zPactInit).default([]),
  wars: z.array(zWarEntry).default([]),
  sentiments: z.array(zSentimentEntry).default([]),
});
export type DiplomacyBlockData = z.infer<typeof zDiplomacyBlock>;
