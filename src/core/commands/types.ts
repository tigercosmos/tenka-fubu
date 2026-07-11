// Command 型別聯集總表（玩家／具申採納／AI 對等操作之唯一意圖表達）。
// 規格：plan/02-data-model.md §4.18（逐字轉錄）。次 tick 開頭依提交順序統一結算（00 §5.2；佇列與驗證見 03）。
// 變速/暫停/存讀檔是 UI 與外殼操作，不是 Command。
//
// 武將欄位命名慣例（二輪裁決 A）：`officerId`＝被作用武將（動作對象）；`executorId`＝執行動作的武將；
// `targetOfficerId`＝對方勢力之武將。

import type {
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  CorpsId,
  DistrictId,
  EventId,
  FacilityTypeId,
  MapNodeId,
  OfficerId,
  PlotId,
  PolicyId,
  ProposalId,
  SiegeId,
  TacticId,
  TaimeiId,
  TransportId,
} from '../state/ids';
import type {
  CaptiveAction,
  ConscriptPolicy,
  CorpsDirective,
  DevelopFocus,
  PactKind,
  PlotKind,
  RewardTier,
  SiegeMode,
} from '../state/enums';
import type { DiplomacyActionKind } from '../state/gameState';

export interface CommandBase {
  type: CommandType;
  clanId: ClanId; // 發令勢力（權限驗證基準：只能操作自家實體）
}

export type Command =
  // ── 內政（語意見 05）──
  | CmdGrantFief
  | CmdSetDevelopFocus
  | CmdBuildFacility
  | CmdCancelBuild
  | CmdDemolishFacility
  | CmdSetConscriptPolicy
  | CmdTransport
  | CmdRecallTransport
  | CmdTradeRice
  | CmdEnactPolicy
  | CmdRevokePolicy
  | CmdAppointLord
  | CmdSetCastleControl
  // ── 軍事（語意見 04/07）──
  | CmdMarch
  | CmdSetArmyTarget
  | CmdRecallArmy
  | CmdSetAutoReturn
  | CmdStartKassen
  | CmdBattleMove
  | CmdBattleAttack
  | CmdBattleTactic
  | CmdBattleDelegate
  | CmdSetSiegeMode
  | CmdUseBetrayal
  // ── 武將(語意見 06)──
  | CmdRecruitRonin
  | CmdRewardOfficer
  | CmdHandleCaptive
  | CmdPromoteRank
  // ── 外交與調略（語意見 08）──
  | CmdStartDiploWork
  | CmdStopDiploWork
  | CmdProposePact
  | CmdRespondPact
  | CmdBreakPact
  | CmdRequestCourtRank
  | CmdRequestMediation
  | CmdRequestShogunateTitle
  | CmdNominateShogun
  | CmdStartPlot
  | CmdCancelPlot
  // ── 軍團（語意見 07 §3.12；軍團 AI 見 09，四輪裁決 D-18）──
  | CmdCreateCorps
  | CmdSetCorpsDirective
  | CmdAssignCastleToCorps
  | CmdDissolveCorps
  // ── 具申／大命／事件（語意見 06/10）──
  | CmdResolveProposal
  | CmdInvokeTaimei
  | CmdResolveEventChoice
  // ── debug（03 §3.9 專有；02 §4.18 未收，見 03 §4.2／§8-D14）──
  | CmdDebugSkipDays
  | CmdDebugGrant;
// 註（勘誤 E-32，重複語意合併）：07 CmdRemoveCastleFromCorps ＝ CmdAssignCastleToCorps(corpsId:null)；
// 07 CmdUseBetrayal(siegeId) 與 08 activateBetrayal(castleId) 為同一動作，統一以 CmdUseBetrayal（圍城 context）表達。

export type CommandType = Command['type'];

// —— 內政 ——
export interface CmdGrantFief extends CommandBase {
  // 知行：分封/收回郡
  type: 'grantFief';
  districtId: DistrictId;
  officerId: OfficerId | null; // null=收回直轄
}
export interface CmdSetDevelopFocus extends CommandBase {
  // 設定直轄郡開發重點
  type: 'setDevelopFocus';
  districtId: DistrictId;
  focus: DevelopFocus;
}
export interface CmdBuildFacility extends CommandBase {
  // 建設城下施設（下單即入 buildQueue、全額扣造價，勘誤 E-39）
  type: 'buildFacility';
  castleId: CastleId;
  facilityTypeId: FacilityTypeId;
}
export interface CmdCancelBuild extends CommandBase {
  // 取消佇列建設（退款 造價×BAL.buildRefundRate，勘誤 E-39）
  type: 'cancelBuild';
  castleId: CastleId;
  queueIndex: number; // 0-based，指向 castle.buildQueue
}
export interface CmdDemolishFacility extends CommandBase {
  // 拆除已建成施設（勘誤 E-39）
  type: 'demolishFacility';
  castleId: CastleId;
  facilityTypeId: FacilityTypeId;
}
export interface CmdSetConscriptPolicy extends CommandBase {
  // 設定城徵兵方針（每月自動回復，取代一次性徵兵，勘誤 E-42）
  type: 'setConscriptPolicy';
  castleId: CastleId;
  policy: ConscriptPolicy;
}
export interface CmdTransport extends CommandBase {
  // 城際輸送兵力/金錢/兵糧（勘誤 E-41）
  type: 'transport';
  fromCastleId: CastleId;
  toCastleId: CastleId;
  soldiers: number; // ≥0（人）
  gold: number; // ≥0（貫）
  food: number; // ≥0（石）；三者不得同時為 0
}
export interface CmdRecallTransport extends CommandBase {
  // 撤回進行中輸送隊（勘誤 E-41）
  type: 'recallTransport';
  transportId: TransportId;
}
export interface CmdTradeRice extends CommandBase {
  // 米問屋買賣兵糧（需該城有米問屋施設；四輪裁決 D-10：統一走 Command 佇列次 tick 開頭結算）
  type: 'tradeRice';
  castleId: CastleId;
  mode: 'buy' | 'sell'; // buy＝金錢換兵糧、sell＝兵糧換金錢（匯率／月上限見 05 §5.5）
  amount: number; // 交易量（石），>0
}
export interface CmdEnactPolicy extends CommandBase {
  type: 'enactPolicy';
  policyId: PolicyId;
}
export interface CmdRevokePolicy extends CommandBase {
  type: 'revokePolicy';
  policyId: PolicyId;
}
export interface CmdAppointLord extends CommandBase {
  // 任命/罷免城主
  type: 'appointLord';
  castleId: CastleId;
  officerId: OfficerId | null;
}
export interface CmdSetCastleControl extends CommandBase {
  // 切換直轄/委任
  type: 'setCastleControl';
  castleId: CastleId;
  directControl: boolean;
}

// —— 軍事 ——
export interface CmdMarch extends CommandBase {
  // 出陣
  type: 'march';
  originCastleId: CastleId;
  leaderId: OfficerId;
  deputyIds: OfficerId[]; // 0..2 人
  soldiers: number; // 自城中撥出兵力，>0
  food: number; // 自城中撥出兵糧（石），≥0
  targetNodeId: MapNodeId; // 目標節點（尋路由 core 執行，04）
}
export interface CmdSetArmyTarget extends CommandBase {
  // 變更部隊目標（重尋路）
  type: 'setArmyTarget';
  armyId: ArmyId;
  targetNodeId: MapNodeId;
}
export interface CmdRecallArmy extends CommandBase {
  type: 'recallArmy';
  armyId: ArmyId;
} // 召回
export interface CmdSetAutoReturn extends CommandBase {
  // 切換部隊自動歸還（勘誤 E-32；07 §3.13）
  type: 'setAutoReturn';
  armyId: ArmyId;
  enabled: boolean;
}
export interface CmdStartKassen extends CommandBase {
  // 對進行中野戰（FieldCombat）發動合戰（門檻見 07；勘誤 E-18）
  type: 'startKassen';
  fieldCombatId: string;
}
export interface CmdBattleMove extends CommandBase {
  // 合戰：移動至目標陣（勘誤 E-18）
  type: 'battleMove';
  battleId: BattleId;
  unitId: string;
  targetJinId: string;
}
export interface CmdBattleAttack extends CommandBase {
  // 合戰：指定攻擊目標（勘誤 E-18）
  type: 'battleAttack';
  battleId: BattleId;
  unitId: string;
  targetUnitId: string;
}
export interface CmdBattleTactic extends CommandBase {
  // 合戰：發動戰法（勘誤 E-18）
  type: 'battleTactic';
  battleId: BattleId;
  unitId: string;
  tacticId: TacticId;
  targetUnitId: string | null; // 減益型的目標；否則 null
}
export interface CmdBattleDelegate extends CommandBase {
  // 合戰：委任 AI 開關（勘誤 E-18）
  type: 'battleDelegate';
  battleId: BattleId;
  // 02 §4.18 原型 `string | 'all'`（redundant，'all' ⊆ string）；'all' 為「全單位」哨兵值（apply 時判別）。
  // 為過 ESLint 決定論守門（no-redundant-type-constituents）收斂為 string；值集合不變（M1 型別實作裁決，02 §8）。
  unitId: string;
  enabled: boolean;
}
export interface CmdSetSiegeMode extends CommandBase {
  type: 'setSiegeMode';
  siegeId: SiegeId;
  mode: SiegeMode;
}
export interface CmdUseBetrayal extends CommandBase {
  // 圍城時發動已備妥的內應（勘誤 E-32）。效果採 08（四輪裁決 B）：城士氣降至 BAL.plotBetrayalMoraleFloor(=5)、城主忠誠歸 0（08 §5.5.3／§3.7.3）
  type: 'useBetrayal';
  siegeId: SiegeId;
}

// —— 武將 ——
export interface CmdRecruitRonin extends CommandBase {
  // 登用浪人（成功率以登用者 pol／特性為輸入，06 §3.7.1）
  type: 'recruitRonin';
  officerId: OfficerId; // 目標浪人（status='ronin'、locationCastleId 屬我方）
  executorId: OfficerId; // 登用者（同城、未出陣）；成功率公式必要輸入（二輪裁決 A；06 §3.7.1）
}
export interface CmdRewardOfficer extends CommandBase {
  // 金錢褒賞（提忠誠；三檔制，費用與忠誠增益由 BAL 推導，勘誤 E-29）
  type: 'rewardOfficer';
  officerId: OfficerId;
  tier: RewardTier; // 賞賜檔位 small/medium/large；費用/忠誠增益見 06 §3.8.1（年內遞減）
}
export interface CmdHandleCaptive extends CommandBase {
  // 捕虜處置
  type: 'handleCaptive';
  officerId: OfficerId; // 目標捕虜（capturedByClanId === CommandBase.clanId）
  action: CaptiveAction;
  executorId: OfficerId | null; // action='recruit' 時的登用者；null＝以當主能力代入（招降成功率必要輸入，二輪裁決 A；06 §3.7.2）
}
export interface CmdPromoteRank extends CommandBase {
  // 身分推舉（升格；褒賞的一種，勘誤 E-32；06 §3.8.3）
  type: 'promoteRank';
  officerId: OfficerId;
}

// —— 外交與調略 ——
export interface CmdStartDiploWork extends CommandBase {
  // 開始外交工作（對勢力＝派使者累積信用；target='court'＝朝廷獻金、'shogunate'＝幕府獻金，勘誤 E-27／三輪裁決 2）
  type: 'startDiploWork';
  target: ClanId | 'court' | 'shogunate'; // 對象：勢力（累積信用）／'court'（→courtFavor）／'shogunate'（→shogunateFavor）；月費為固定 BAL 常數（勘誤 E-27 尾）
  executorId: OfficerId; // 執行武將（serving、屬 from 方；執行期間不可出陣）；apply 時寫入 DiploMission.officerId（二輪裁決 A；08 §3.5）
}
export interface CmdStopDiploWork extends CommandBase {
  type: 'stopDiploWork';
  target: ClanId | 'court' | 'shogunate';
} // 撤回外交／獻金工作（勘誤 E-27／三輪裁決 2）
export interface CmdProposePact extends CommandBase {
  // 提案外交行動（消耗信用；成立/接受度判定見 08 §5.3／§5.6）
  type: 'proposePact';
  targetClanId: ClanId;
  kind: DiplomacyActionKind; // 六種外交行動；產生同 kind 之 DiplomacyProposal（§4.11）。期限依 kind 查 BAL 常數（三輪裁決 3a，原 termDays 刪除）
  reinforceAgainstClanId: ClanId | null; // kind='requestReinforce' 時對抗的敵勢力；其他 kind 為 null。婚姻成婚武將由 08 §5.3.1 自動選定（三輪裁決 3d）
}
export interface CmdRespondPact extends CommandBase {
  // 回應送達的外交提案（來使 modal；勘誤 E-32；08 §3.4）
  type: 'respondPact';
  proposalId: ProposalId;
  accept: boolean;
}
export interface CmdBreakPact extends CommandBase {
  // 毀約（信用/感情懲罰見 08）
  type: 'breakPact';
  targetClanId: ClanId;
  kind: PactKind;
}
export interface CmdRequestCourtRank extends CommandBase {
  type: 'requestCourtRank';
} // 請求敘任下一階官位
export interface CmdRequestMediation extends CommandBase {
  // 請朝廷斡旋停戰
  type: 'requestMediation';
  targetClanId: ClanId;
}
export interface CmdRequestShogunateTitle extends CommandBase {
  type: 'requestShogunateTitle';
} // 申請下一階幕府役職（勘誤 E-32；08 §3.6）
export interface CmdNominateShogun extends CommandBase {
  type: 'nominateShogun';
} // 擁立將軍（勘誤 E-32；08 §3.6.3）
export interface CmdStartPlot extends CommandBase {
  // 調略：引拔/流言/內應
  type: 'startPlot';
  kind: PlotKind;
  executorId: OfficerId; // 執行武將（我方）；apply 時寫入 Plot.officerId（二輪裁決 A；08 §3.7）
  targetClanId: ClanId; // 對象勢力
  targetOfficerId: OfficerId | null; // poach／rumor(武將模式) 的對象武將；rumor(城模式)／betrayal 為 null（betrayal 城主由 targetCastleId 反查、apply 時快照，四輪裁決 D-17）
  targetCastleId: CastleId | null; // rumor(城模式)/betrayal 的對象城；否則 null（08 §3.7）
  investGold: number; // 一次性投入（貫），≥0（08 §3.7）
}
export interface CmdCancelPlot extends CommandBase {
  // 中止進行中調略（無退款，勘誤 E-32；08 §3.7）
  type: 'cancelPlot';
  plotId: PlotId;
}

// —— 軍團 ——
export interface CmdCreateCorps extends CommandBase {
  type: 'createCorps';
  corpsLeaderId: OfficerId;
  castleIds: CastleId[]; // 初始轄下城（≥1，皆我方且未屬其他軍團）
  directive: CorpsDirective;
  targetNodeId: MapNodeId | null; // directive='advance' 必填，否則 null（四輪裁決 D-9）
}
export interface CmdSetCorpsDirective extends CommandBase {
  type: 'setCorpsDirective';
  corpsId: CorpsId;
  directive: CorpsDirective;
  targetNodeId: MapNodeId | null; // directive='advance' 必填，否則 null
}
export interface CmdAssignCastleToCorps extends CommandBase {
  type: 'assignCastleToCorps';
  castleId: CastleId;
  corpsId: CorpsId | null; // null=移出軍團
}
export interface CmdDissolveCorps extends CommandBase {
  type: 'dissolveCorps';
  corpsId: CorpsId;
}

// —— 具申／大命／事件 ——
export interface CmdResolveProposal extends CommandBase {
  // 採納/駁回具申
  type: 'resolveProposal';
  proposalId: ProposalId;
  accept: boolean;
}
export interface CmdInvokeTaimei extends CommandBase {
  type: 'invokeTaimei';
  taimeiId: TaimeiId;
} // 發動大命
export interface CmdResolveEventChoice extends CommandBase {
  // 回應事件選項
  type: 'resolveEventChoice';
  eventId: EventId;
  choiceIndex: number; // 0-based，須 < 該事件選項數（10）
}

// —— debug（03 §3.9 專有；驗證/套用契約見 03 §3.9.2、§8-D14）——
// clanId（CommandBase）恆填玩家勢力（03 §4.2）。02 §7「無 optional 欄位」→ 原 03 §3.9.2 之
// `{ days }`／`{ gold?, food?, castleId? }` 落地為必填欄位＋`| null`（缺=null），比對 §4.11 M1 型別裁決。
export interface CmdDebugSkipDays extends CommandBase {
  // 時間跳轉：套用為 core no-op，實際連續 advanceDay 由 app 層驅動器執行（03 §3.9.2；M1-16／M1-22）
  type: 'debugSkipDays';
  days: number; // 跳轉日數，整數 1..BAL.debugSkipMaxDays
}
export interface CmdDebugGrant extends CommandBase {
  // 資源作弊：gold→clan.gold、food→castle.food（03 §3.9.2）
  type: 'debugGrant';
  gold: number | null; // 加至發令勢力 clan.gold（貫）；null=不加
  food: number | null; // 加至 castleId 城 castle.food（石）；null=不加（非 null 時 castleId 必填）
  castleId: CastleId | null; // food 目標城；food=null 時可為 null
}

// ═══════════════════════════════════════════════════════════════════
// 迴圈機制型別（03 §4.2 canonical；佇列信封與驗證結果）
// ═══════════════════════════════════════════════════════════════════

/** 佇列信封：由 app 層佇列指派 seq 後包裝（03 §4.2）。 */
export interface CommandEnvelope {
  seq: number; // 全域單調遞增序號（跨存讀持續；重放紀錄主鍵；03 §3.3.1）
  issuedDay: number; // 提交當下的 absoluteDay（=state.time.day）；僅供紀錄/除錯，不參與邏輯
  command: Command;
}

/** 驗證結果（03 §4.2）：硬/軟驗證共用；失敗時附 i18n reasonKey 與插值參數。 */
export type ValidationResult =
  { ok: true } | { ok: false; reasonKey: string; params?: Record<string, string | number> };
