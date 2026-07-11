// 劇本資料 zod schema 共用定義（scenario/castle/district/officer/clan/road/event/... 各檔共用）。
// 規格：plan/14-scenario-data.md §4.1（共用定義）。
//
// 【與 14 §4.1 原文的唯一差異：id regex 來源】14 §4.1 在本檔內對每個前綴各自宣告一份 regex 字面值
// （`export const RE = { clan: /^clan\.[a-z0-9-]+$/, ... }`）。本實作改為直接 import
// `src/core/state/ids.ts` 的 `ID_PATTERN`（02 §3.2 ID 系統之單一真相）組成同形狀的 `RE`——
// 兩者 regex 值逐一比對完全相同（00 §8 前綴規範），差異只在「哪裡宣告」，消除雙重維護風險
// （里程碑任務 M2-1 指定：id regex 用 ids.ts 的 ID_PATTERN 對齊）。
// enum 值集合同理直接 reuse `src/core/state/enums.ts`（02 §3.3 單一真相），不在此重複宣告字面值。
import { z } from 'zod';
import { ID_PATTERN, isMapNodeId } from '../../core/state/ids';
import {
  REGION_VALUES,
  RANK_VALUES,
  COURT_RANK_VALUES,
  SHOGUNATE_TITLE_VALUES,
} from '../../core/state/enums';

/** 00 §8 ID 前綴 regex（與 02 §3.2 對照表一致；來源＝ids.ts ID_PATTERN，見檔頭說明）。 */
export const RE = {
  clan: ID_PATTERN.ClanId,
  off: ID_PATTERN.OfficerId,
  castle: ID_PATTERN.CastleId,
  dist: ID_PATTERN.DistrictId,
  prov: ID_PATTERN.ProvinceId,
  road: ID_PATTERN.RoadEdgeId,
  evt: ID_PATTERN.EventId,
  pol: ID_PATTERN.PolicyId,
  trait: ID_PATTERN.TraitId,
  tac: ID_PATTERN.TacticId,
  persona: ID_PATTERN.AiPersonaId,
  fac: ID_PATTERN.FacilityTypeId,
} as const;

export const id = (re: RegExp) => z.string().regex(re);

/**
 * MapNodeId（城∪郡；02 §3.2）。ids.ts 未提供單一 regex 常數——`isMapNodeId` 是
 * `isCastleId(v) || isDistrictId(v)` 之聯集判斷（見 ids.ts）——故此處以 `refine` 對齊，
 * 而非另外拼一份聯集 regex（避免與 ids.ts 的判斷邏輯分岔）。
 */
export const zNodeId = z.string().refine(isMapNodeId, {
  message: 'must be a CastleId or DistrictId (MapNodeId)',
});

/** 世界座標（world unit，整數 0..4096；00 §8）。 */
export const zPos = z.object({
  x: z.number().int().min(0).max(4096),
  y: z.number().int().min(0).max(4096),
});

/** 顯示名（繁中，1..12 字；專有名詞不進 i18n，00 §8）。 */
export const zName = z.string().min(1).max(12);

/** 非負整數。 */
export const int0 = z.number().int().min(0);

/** 0..100 整數。 */
export const pct100 = z.number().int().min(0).max(100);

// 9 地方分區／身分六階／朝廷官位／幕府役職：值集合單一真相在 core/state/enums.ts（02 §3.3）。
export { REGION_VALUES, RANK_VALUES, COURT_RANK_VALUES };
/** 14 §4.1 命名為 SHOGUNATE_VALUES；02/enums.ts 的單一真相常數名為 SHOGUNATE_TITLE_VALUES。 */
export const SHOGUNATE_VALUES = SHOGUNATE_TITLE_VALUES;
