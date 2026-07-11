// 勢力（Clan）zod schema。
// 規格：plan/14-scenario-data.md §4.5（clans.json）。
import { z } from 'zod';
import { COURT_RANK_VALUES, SHOGUNATE_TITLE_VALUES } from '../../core/state/enums';
import { RE, id, zName, int0 } from './common';
import { zPactInit, zWarEntry, zSentimentEntry } from './diplomacy';

/** 勢力（02 §4.3 Clan 靜態子集；alive=true、taimei 初始態由 builder 補）。 */
export const zClan = z.object({
  id: id(RE.clan),
  name: zName, // '織田家'
  leaderId: id(RE.off), // 當主（INV-08）
  homeCastleId: id(RE.castle), // 本城（INV-09：tier='main'）
  gold: int0, // 開局金錢（貫）
  prestige: z.number().int().min(0).max(2000), // 開局威信
  courtRank: z.enum(COURT_RANK_VALUES).default('none'),
  shogunateTitle: z.enum(SHOGUNATE_TITLE_VALUES).default('none'),
  personaId: id(RE.persona), // AI 性格（§4.11）；builder 寫入 ai.clans[clanId].personaId
  // （02 §4.20 唯一真相；Clan.personaId 已刪，四輪裁決 D-13）
  colorIndex: z.number().int().min(0).max(39), // 12 §3.1.3 色盤索引；builder 逐值寫入
  // `Clan.colorIndex`，hex 由渲染層導出（§8-D6）
});
export type ClanData = z.infer<typeof zClan>;

export const zClansFile = z.object({
  version: z.literal(1),
  clans: z.array(zClan).min(1),
  diplomacy: z.object({
    pacts: z.array(zPactInit).default([]),
    /** 開局交戰：builder 設該對 lastHostileDay=0（08 §3.1 atWar 推導）。 */
    wars: z.array(zWarEntry).default([]),
    /** 感情覆寫（預設 50，02 §5.5 defaultRow）。 */
    sentiments: z.array(zSentimentEntry).default([]),
  }),
});
export type ClansFileData = z.infer<typeof zClansFile>;
