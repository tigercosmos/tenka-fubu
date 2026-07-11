// Branded ID 型別全表＋前綴/格式 regex 常數＋type guard。
// 規格：plan/02-data-model.md §3.2（ID 系統）、§7（ids 驗收：regex 覆蓋 §3.2 全表、type guard 有單元測試）。
// 前綴規範見 00 §8；執行期流水號生成見 02 §5.3（M1-12 實作）。

declare const __brand: unique symbol;
type Brand<B extends string> = { readonly [__brand]: B };

// ── 靜態 ID：由劇本資料定義（00 §8 前綴規範；02 §3.2）──
export type ClanId = string & Brand<'ClanId'>; // 'clan.oda'
export type OfficerId = string & Brand<'OfficerId'>; // 'off.oda-nobunaga'
export type CastleId = string & Brand<'CastleId'>; // 'castle.kiyosu'
export type DistrictId = string & Brand<'DistrictId'>; // 'dist.owari-kasugai'
export type ProvinceId = string & Brand<'ProvinceId'>; // 'prov.owari'
export type RoadEdgeId = string & Brand<'RoadEdgeId'>; // 'road.kiyosu-sunpu-01'
export type EventId = string & Brand<'EventId'>; // 'evt.okehazama'
export type PolicyId = string & Brand<'PolicyId'>; // 'pol.rakuichi'
export type TraitId = string & Brand<'TraitId'>; // 'trait.gunshin'
export type TacticId = string & Brand<'TacticId'>; // 'tac.charge'
export type TaimeiId = string & Brand<'TaimeiId'>; // 'taimei.sokuji'
export type FacilityTypeId = string & Brand<'FacilityTypeId'>; // 'fac.market'（城下施設種類，型錄見 05）
export type AiPersonaId = string & Brand<'AiPersonaId'>; // 'persona.conqueror'（AI 性格參數組，型錄見 09）

// ── 執行期 ID：遊戲進行中由 §5.3 流水號生成器產生 ──
export type ArmyId = string & Brand<'ArmyId'>; // 'army.000042'
export type BattleId = string & Brand<'BattleId'>; // 'battle.000007'（合戰 BattleState，勘誤 E-18）
export type SiegeId = string & Brand<'SiegeId'>; // 'siege.000003'
export type CorpsId = string & Brand<'CorpsId'>; // 'corps.000001'
export type ProposalId = string & Brand<'ProposalId'>; // 'prop.000118'（具申）
export type ReportId = string & Brand<'ReportId'>; // 'rep.004250'
export type TransportId = string & Brand<'TransportId'>; // 'trans.000005'（輸送隊，勘誤 E-41）
export type PlotId = string & Brand<'PlotId'>; // 'plot.000012'（調略，08；勘誤 E-28）

/** 地圖節點 = 城 ∪ 郡（00 §4：地圖是節點圖；02 §3.2） */
export type MapNodeId = CastleId | DistrictId;

/** 無向勢力對 key：字典序小者在前，'|' 連接。見 §5.5 pairKey()（02 §3.2） */
export type ClanPairKey = string & Brand<'ClanPairKey'>; // 'clan.imagawa|clan.oda'

/**
 * ID 格式 regex（02 §3.2 對照表逐項）。
 * - 靜態 ID：`^<prefix>\.[a-z0-9-]+$`（slug 規則）；RoadEdgeId 允許尾綴 `-\d{2}`。
 * - 執行期流水號 ID：`^<prefix>\.\d{6}$`（六位數，§5.3）。
 * - ClanPairKey：兩個 ClanId 以 '|' 連接（§5.5）。
 * 注意：合戰／野戰內部 id（`fc.`／`bu.`／`jin.`）非流水號、不入 nextSerials，此表不列（§3.2）。
 */
export const ID_PATTERN = {
  ClanId: /^clan\.[a-z0-9-]+$/,
  OfficerId: /^off\.[a-z0-9-]+$/,
  CastleId: /^castle\.[a-z0-9-]+$/,
  DistrictId: /^dist\.[a-z0-9-]+$/,
  ProvinceId: /^prov\.[a-z0-9-]+$/,
  RoadEdgeId: /^road\.[a-z0-9-]+(-\d{2})?$/,
  EventId: /^evt\.[a-z0-9-]+$/,
  PolicyId: /^pol\.[a-z0-9-]+$/,
  TraitId: /^trait\.[a-z0-9-]+$/,
  TacticId: /^tac\.[a-z0-9-]+$/,
  TaimeiId: /^taimei\.[a-z0-9-]+$/,
  FacilityTypeId: /^fac\.[a-z0-9-]+$/,
  AiPersonaId: /^persona\.[a-z0-9-]+$/,
  ArmyId: /^army\.\d{6}$/,
  BattleId: /^battle\.\d{6}$/,
  SiegeId: /^siege\.\d{6}$/,
  CorpsId: /^corps\.\d{6}$/,
  ProposalId: /^prop\.\d{6}$/,
  ReportId: /^rep\.\d{6}$/,
  TransportId: /^trans\.\d{6}$/,
  PlotId: /^plot\.\d{6}$/,
  ClanPairKey: /^clan\.[a-z0-9-]+\|clan\.[a-z0-9-]+$/,
} as const;

// ── type guard（02 §7：isClanId() 等；驗證字串是否符合各 ID 格式）──
export const isClanId = (v: string): v is ClanId => ID_PATTERN.ClanId.test(v);
export const isOfficerId = (v: string): v is OfficerId => ID_PATTERN.OfficerId.test(v);
export const isCastleId = (v: string): v is CastleId => ID_PATTERN.CastleId.test(v);
export const isDistrictId = (v: string): v is DistrictId => ID_PATTERN.DistrictId.test(v);
export const isProvinceId = (v: string): v is ProvinceId => ID_PATTERN.ProvinceId.test(v);
export const isRoadEdgeId = (v: string): v is RoadEdgeId => ID_PATTERN.RoadEdgeId.test(v);
export const isEventId = (v: string): v is EventId => ID_PATTERN.EventId.test(v);
export const isPolicyId = (v: string): v is PolicyId => ID_PATTERN.PolicyId.test(v);
export const isTraitId = (v: string): v is TraitId => ID_PATTERN.TraitId.test(v);
export const isTacticId = (v: string): v is TacticId => ID_PATTERN.TacticId.test(v);
export const isTaimeiId = (v: string): v is TaimeiId => ID_PATTERN.TaimeiId.test(v);
export const isFacilityTypeId = (v: string): v is FacilityTypeId =>
  ID_PATTERN.FacilityTypeId.test(v);
export const isAiPersonaId = (v: string): v is AiPersonaId => ID_PATTERN.AiPersonaId.test(v);
export const isArmyId = (v: string): v is ArmyId => ID_PATTERN.ArmyId.test(v);
export const isBattleId = (v: string): v is BattleId => ID_PATTERN.BattleId.test(v);
export const isSiegeId = (v: string): v is SiegeId => ID_PATTERN.SiegeId.test(v);
export const isCorpsId = (v: string): v is CorpsId => ID_PATTERN.CorpsId.test(v);
export const isProposalId = (v: string): v is ProposalId => ID_PATTERN.ProposalId.test(v);
export const isReportId = (v: string): v is ReportId => ID_PATTERN.ReportId.test(v);
export const isTransportId = (v: string): v is TransportId => ID_PATTERN.TransportId.test(v);
export const isPlotId = (v: string): v is PlotId => ID_PATTERN.PlotId.test(v);
export const isClanPairKey = (v: string): v is ClanPairKey => ID_PATTERN.ClanPairKey.test(v);
/** 地圖節點：城 ∪ 郡（02 §3.2）。 */
export const isMapNodeId = (v: string): v is MapNodeId => isCastleId(v) || isDistrictId(v);
