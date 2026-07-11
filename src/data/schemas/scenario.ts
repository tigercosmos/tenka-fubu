// 劇本總 schema。
// 規格：plan/14-scenario-data.md §3.1（檔案清單與載入結構；`s1560` 彙整形狀）、§4（全部子
// schema）。本檔把各檔案 schema（province/castle/district/road/clan/officer/event/型錄）組成
// 單一 `zScenario`，對應 §3.1 `index.ts` 匯出的 `s1560` 物件形狀，供未來 `tools/validate.ts`
// （M2-2，14-T2）與劇本 `index.ts`（M2-9 起）共用同一份驗證入口，避免規則分散。
import { z } from 'zod';
import { zProvince } from './province';
import { zCastle } from './castle';
import { zDistrict } from './district';
import { zRoadEdge } from './road';
import { zClan } from './clan';
import { zWarEntry, zPactInit, zSentimentEntry } from './diplomacy';
import { zOfficer } from './officer';
import { zEvent } from './event';
import { zTraitEntry } from './trait';
import { zTacticEntry } from './tactic';
import { zPolicyEntry } from './policy';
import { zPersonaEntry } from './persona';
import { REGION_VALUES } from './common';

/** 單一劇本彙整資料（§3.1 `s1560` shape）；各子陣列已由對應檔案 schema 逐筆驗證。 */
export const zScenario = z.object({
  id: z.string().min(1), // 's1560'
  provinces: z.array(zProvince),
  castles: z.array(zCastle),
  districts: z.array(zDistrict),
  roads: z.array(zRoadEdge),
  clans: z.array(zClan),
  diplomacy: z.object({
    pacts: z.array(zPactInit).default([]),
    wars: z.array(zWarEntry).default([]),
    sentiments: z.array(zSentimentEntry).default([]),
  }),
  events: z.array(zEvent),
  /** 9 地方分檔（§3.1 officers/{region}.json）；builder 載入時合併，順序＝REGION_VALUES。 */
  officers: z.array(z.array(zOfficer)).length(REGION_VALUES.length),
  catalogs: z.object({
    traits: z.array(zTraitEntry).length(37),
    policies: z.array(zPolicyEntry).length(13),
    tactics: z.array(zTacticEntry).length(12),
    personas: z.array(zPersonaEntry).min(41),
  }),
});
export type ScenarioBundleData = z.infer<typeof zScenario>;
