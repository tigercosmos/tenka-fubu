// GameEvent 型別聯集總表（core 每 tick 對外發出的事實紀錄）。
// 規格：plan/02-data-model.md §4.19（含表後五~七輪裁決 payload 補全）。
// 用途：轉為 Report、驅動 UI 動畫/自動暫停、golden test 斷言。
// 命名慣例：Evt<PascalCase(type)>；identical-payload 之表列組（如 policy.enacted/revoked）合併為單一 union-type 成員（narrowing 仍精確）。

import type {
  ArmyId,
  CastleId,
  ClanId,
  DistrictId,
  EventId,
  FacilityTypeId,
  MapNodeId,
  OfficerId,
  PolicyId,
  ProposalId,
  SiegeId,
  TaimeiId,
} from './ids';
import type {
  AweLevel,
  CourtRank,
  PactKind,
  PlotKind,
  ProposalKind,
  Rank,
  Season,
  ShogunateTitle,
} from './enums';
import type { DiplomacyActionKind } from './gameState';
import type { CommandType } from '../commands/types';

export interface GameEventBase {
  type: GameEventType;
  day: number; // 發生絕對日
  clanIds: ClanId[]; // 主要關聯勢力（供 03 isPlayerRelevant 判定；純時間事件為空陣列，非 optional，四輪裁決 C-4）
}

// ── 戰鬥（07）──
// battle*/awe 之 battleId/sourceBattleId 型別為 string（FieldCombat.id 'fc.*' ∪ BattleId），非 BattleId brand（四輪裁決 C-2）。
export interface EvtBattleStarted extends GameEventBase {
  type: 'battle.started';
  battleId: string;
  nodeId: MapNodeId;
  attackerClanId: ClanId;
  defenderClanId: ClanId;
}
export interface EvtBattleKassenAvailable extends GameEventBase {
  type: 'battle.kassenAvailable';
  battleId: string; // 兵力達合戰門檻（自動暫停候選）
}
export interface EvtBattleEnded extends GameEventBase {
  type: 'battle.ended';
  battleId: string;
  winnerClanId: ClanId | null; // null=平手撤離
  aweLevel: AweLevel;
  attackerLosses: number;
  defenderLosses: number;
  nodeId: MapNodeId; // 報告 enrichment（五輪裁決 B）
  attackerClanId: ClanId;
  defenderClanId: ClanId;
}
export interface EvtAweTriggered extends GameEventBase {
  type: 'awe.triggered';
  sourceBattleId: string;
  clanId: ClanId;
  level: AweLevel;
  flippedDistrictIds: DistrictId[];
  affectedCastleIds: CastleId[];
}
export interface EvtSiegeStarted extends GameEventBase {
  type: 'siege.started';
  siegeId: SiegeId;
  castleId: CastleId;
  attackerClanId: ClanId; // 開圍（自動暫停候選）
}
export interface EvtSiegeRelief extends GameEventBase {
  type: 'siege.relief'; // 援軍抵達受圍城節點、圍城每日效果暫停、展開解圍野戰（七輪裁決 2）
  siegeId: SiegeId;
  castleId: CastleId;
}
export interface EvtSiegeEnded extends GameEventBase {
  type: 'siege.ended';
  siegeId: SiegeId;
  castleId: CastleId;
  fallen: boolean; // 陷落或解圍
  newOwnerClanId: ClanId | null;
}

// ── 移動/制壓（04）──
export interface EvtDistrictSubjugated extends GameEventBase {
  type: 'district.subjugated';
  districtId: DistrictId;
  fromClanId: ClanId;
  toClanId: ClanId;
  armyId: ArmyId; // 完成制壓之部隊（報告 leader enrichment，五輪裁決 B）
  leaderId: OfficerId;
}
export interface EvtArmyDeparted extends GameEventBase {
  type: 'army.departed';
  armyId: ArmyId;
  clanId: ClanId;
  originCastleId: CastleId;
  targetNodeId: MapNodeId;
  leaderId: OfficerId;
}
export interface EvtArmyArrived extends GameEventBase {
  type: 'army.arrived';
  armyId: ArmyId;
  clanId: ClanId;
  nodeId: MapNodeId; // 部隊抵達其目標節點（04 movement；勘誤 E-30）
  leaderId: OfficerId;
}
export interface EvtArmyReturned extends GameEventBase {
  type: 'army.returned';
  armyId: ArmyId;
  clanId: ClanId;
  castleId: CastleId;
  soldiersReturned: number; // 歸還入城解散
  leaderId: OfficerId;
}
export interface EvtArmyBlocked extends GameEventBase {
  type: 'army.blocked';
  armyId: ArmyId;
  clanId: ClanId;
  nodeId: MapNodeId; // 行軍受阻、於節點轉 holding 待命（04 §5.4；四輪裁決 C-6）
  leaderId: OfficerId;
}
export interface EvtArmyStarving extends GameEventBase {
  type: 'army.starving';
  armyId: ArmyId;
  clanId: ClanId; // 攜帶兵糧歸 0
  leaderId: OfficerId;
}
export interface EvtArmyRouted extends GameEventBase {
  type: 'army.routed';
  armyId: ArmyId;
  clanId: ClanId;
  nodeId: MapNodeId; // 士氣崩潰／糧盡潰走轉 routed（潰走發生節點；七輪裁決 2）
  leaderId: OfficerId;
}

// ── 經濟/內政（05）──
export interface EvtEconomyIncome extends GameEventBase {
  type: 'economy.income';
  clanId: ClanId;
  gold: number;
  foodByCastle: Record<CastleId, number>; // 每月 1 日收入
}
export interface EvtEconomyHarvest extends GameEventBase {
  type: 'economy.harvest';
  clanId: ClanId;
  totalFood: number; // 9/1 秋收
}
export interface EvtEconomyGranaryOverflow extends GameEventBase {
  type: 'economy.granaryOverflow';
  clanId: ClanId;
  castleId: CastleId;
  food: number; // 米藏超過容量、溢出散失（食＝散失石數；六輪裁決 1）
}
export interface EvtEconomyUpkeepUnpaid extends GameEventBase {
  type: 'economy.upkeepUnpaid';
  clanId: ClanId; // 金錢不足、當月俸祿未全額發放（warning 級；四輪裁決 C-5）
  /** Step 6 支薪時計算出的實際對象；Step 9 必須使用此快照，避免軍事結算改變武將集合。 */
  payeeIds: OfficerId[];
}
export interface EvtEconomyFoodShortage extends GameEventBase {
  type: 'economy.foodShortage';
  clanId: ClanId;
  castleId: CastleId; // 城兵糧見底、士卒逃散（非圍城一般糧盡；四輪裁決 C-5）
}
export interface EvtFacilityCompleted extends GameEventBase {
  type: 'facility.completed';
  castleId: CastleId;
  facilityTypeId: FacilityTypeId; // 施設完工（佇列制無 slotIndex，勘誤 E-39）
}
export interface EvtPolicyChanged extends GameEventBase {
  type: 'policy.enacted' | 'policy.revoked'; // 政策生效/廢止
  clanId: ClanId;
  policyId: PolicyId;
}
export interface EvtPolicyAutoRevoked extends GameEventBase {
  type: 'policy.autoRevoked';
  clanId: ClanId;
  policyId: PolicyId; // 維持費不足、由新到舊自動廢止（每廢止一項一則；六輪裁決 1）
}
export interface EvtConscriptCompleted extends GameEventBase {
  type: 'conscript.completed';
  castleId: CastleId;
  soldiers: number; // 徵兵入營
}
export interface EvtTransportArrived extends GameEventBase {
  type: 'transport.arrived';
  fromCastleId: CastleId;
  toCastleId: CastleId;
  soldiers: number;
  gold: number;
  food: number; // 輸送抵達（勘誤 E-41）
}
export interface EvtTransportLooted extends GameEventBase {
  type: 'transport.looted'; // 輸送隊被劫消滅（05 §3.6；六輪追記＋七輪裁決 1）
  ownerClanId: ClanId; // 輸送隊所屬（＝TransportOrder.clanId；被劫方視角分流所需）
  fromCastleId: CastleId;
  toCastleId: CastleId;
  byClanId: ClanId; // 劫方
  nodeId: MapNodeId;
  soldiers: number;
  gold: number;
  food: number;
}
export interface EvtUprisingStarted extends GameEventBase {
  type: 'uprising.started';
  districtId: DistrictId;
  severity: number; // 一揆爆發（severity 1..3）
}
export interface EvtUprisingEnded extends GameEventBase {
  type: 'uprising.ended';
  districtId: DistrictId;
  resolved: 'suppressed' | 'subsided'; // suppressed=野戰鎮壓（治安 45）；subsided=自然平息（治安 40）；六輪裁決 1
}

// ── 武將（06/07/08）──
export interface EvtOfficerDied extends GameEventBase {
  type: 'officer.died';
  officerId: OfficerId;
  clanId: ClanId | null;
  cause: 'age' | 'battle'; // 處刑改由 officer.executed 承載（五輪裁決 C）
  nodeId: MapNodeId | null; // 僅 cause='battle' 為戰死地、否則 null（五輪裁決 B）
}
export interface EvtOfficerComingOfAge extends GameEventBase {
  type: 'officer.comingOfAge';
  officerId: OfficerId;
  clanId: ClanId | null; // null=原定勢力已滅亡、於 debutCastleId 就地成浪人（06 §3.10）
}
export interface EvtOfficerPromoted extends GameEventBase {
  type: 'officer.promoted';
  officerId: OfficerId;
  clanId: ClanId;
  newRank: Rank;
}
export interface EvtOfficerLoyaltyLow extends GameEventBase {
  type: 'officer.loyaltyLow';
  officerId: OfficerId;
  clanId: ClanId;
  loyalty: number; // 月結忠誠重算後跌破 30（warning 級，二輪裁決 C）
}
export interface EvtOfficerDefected extends GameEventBase {
  type: 'officer.defected';
  officerId: OfficerId;
  fromClanId: ClanId;
  toClanId: ClanId | null; // null=流浪為浪人
}
export interface EvtOfficerRecruited extends GameEventBase {
  type: 'officer.recruited';
  officerId: OfficerId;
  clanId: ClanId;
  source: 'ronin' | 'captive' | 'poach'; // 登用成功
}
export interface EvtOfficerRecruitFailed extends GameEventBase {
  type: 'officer.recruitFailed'; // 浪人登用擲骰失敗（06 §3.7.1；七輪裁決 2）
  officerId: OfficerId; // 婉拒之浪人
  executorId: OfficerId; // 登用者
  clanId: ClanId; // 登用勢力
}
export interface EvtOfficerCaptured extends GameEventBase {
  type: 'officer.captured';
  officerId: OfficerId;
  byClanId: ClanId; // 戰敗被俘
}
export interface EvtCaptiveDisposed extends GameEventBase {
  type: 'officer.released' | 'officer.executed'; // 捕虜處置
  officerId: OfficerId;
  byClanId: ClanId;
}

// ── 外交/朝幕/調略（08）──
export interface EvtPactSigned extends GameEventBase {
  type: 'pact.signed';
  aClanId: ClanId;
  bClanId: ClanId;
  kind: PactKind;
  endDay: number | null; // 協定成立
}
export interface EvtPactExpired extends GameEventBase {
  type: 'pact.expired';
  aClanId: ClanId;
  bClanId: ClanId;
  kind: PactKind; // 到期
}
export interface EvtPactBroken extends GameEventBase {
  type: 'pact.broken';
  aClanId: ClanId;
  bClanId: ClanId;
  kind: PactKind;
  breakerClanId: ClanId; // 毀約（另有毀約方）
}
export interface EvtDiploRefused extends GameEventBase {
  type: 'diplo.refused';
  fromClanId: ClanId;
  toClanId: ClanId;
  kind: DiplomacyActionKind; // 提案被拒（含逾期；四輪裁決 C-1）
}
export interface EvtDiploReinforceAgreed extends GameEventBase {
  type: 'diplo.reinforceAgreed';
  fromClanId: ClanId;
  toClanId: ClanId;
  againstClanId: ClanId; // 援軍請求獲接受——不建立 Pact（四輪裁決 D-21）
}
export interface EvtDiploEnvoyArrived extends GameEventBase {
  type: 'diplo.envoyArrived';
  fromClanId: ClanId;
  proposalId: ProposalId;
  kind: DiplomacyActionKind; // 外交提案送達玩家勢力（觸發來使 modal 自動暫停；六輪裁決 2）
}
export interface EvtDiploWorkStopped extends GameEventBase {
  type: 'diplo.workStopped';
  clanId: ClanId;
  target: ClanId | 'court' | 'shogunate'; // 外交/獻金工作因金錢不足當月中止（六輪裁決 1）
}
export interface EvtCourtRankGranted extends GameEventBase {
  type: 'court.rankGranted';
  clanId: ClanId;
  newCourtRank: CourtRank; // 官位敘任
}
export interface EvtCourtMediationResult extends GameEventBase {
  type: 'court.mediationResult'; // 朝廷停戰斡旋結算（六輪裁決 1）
  clanId: ClanId; // 斡旋發起方
  targetClanId: ClanId;
  success: boolean;
  ceasefireMonths: number; // BAL.courtMediationCeasefireMonths（成功）/ 0（失敗）；成功另 emit pact.signed
}
export interface EvtShogunateTitleGranted extends GameEventBase {
  type: 'shogunate.titleGranted';
  clanId: ClanId;
  title: ShogunateTitle; // 幕府役職授與
}
export interface EvtShogunateNominated extends GameEventBase {
  type: 'shogunate.nominated';
  clanId: ClanId; // 上洛擁立將軍成立（clanId＝擁立者＝patron；世界級廣播；六輪裁決 1）
}
export interface EvtShogunatePatronLost extends GameEventBase {
  type: 'shogunate.patronLost';
  clanId: ClanId; // 擁立者喪失京都、patron 資格解除（當事勢力視角；六輪裁決 1）
}
export interface EvtShogunateCollapsed extends GameEventBase {
  type: 'shogunate.collapsed'; // 室町幕府滅亡（無 payload；clanIds=[] 全域廣播；六輪裁決 1）
}
export interface EvtPlotResolved extends GameEventBase {
  type: 'plot.succeeded' | 'plot.failed'; // 調略結算
  kind: PlotKind;
  actorClanId: ClanId;
  targetClanId: ClanId;
  targetOfficerId: OfficerId | null;
  targetCastleId: CastleId | null; // betrayal／rumor(城模式) 填、其餘 null（五輪裁決 B）
}
export interface EvtPlotExposed extends GameEventBase {
  type: 'plot.exposed'; // 調略失敗且敗露（payload 鏡射 plot.failed；六輪裁決 1）
  kind: PlotKind;
  actorClanId: ClanId;
  targetClanId: ClanId;
  targetOfficerId: OfficerId | null;
  targetCastleId: CastleId | null;
}
export interface EvtPlotBetrayalActivated extends GameEventBase {
  type: 'plot.betrayalActivated';
  actorClanId: ClanId;
  targetClanId: ClanId;
  castleId: CastleId; // 內應於圍城發動（08 §5.5.3；六輪裁決 1）
}

// ── 具申/大命/事件（06/10）──
export interface EvtProposalSubmitted extends GameEventBase {
  type: 'proposal.submitted';
  proposalId: ProposalId;
  officerId: OfficerId;
  kind: ProposalKind; // 具申送達（自動暫停候選）
}
export interface EvtProposalResolved extends GameEventBase {
  type: 'proposal.resolved';
  proposalId: ProposalId;
  accepted: boolean; // 玩家裁決
}
export interface EvtProposalExpired extends GameEventBase {
  type: 'proposal.expired';
  proposalId: ProposalId;
  officerId: OfficerId;
  reason: 'timeout' | 'invalidated'; // timeout=逾期作廢（忠誠 −1）；invalidated=採納時 Command 再驗證失敗（無懲罰）；七輪裁決 2
}
export interface EvtEventFired extends GameEventBase {
  type: 'event.fired';
  eventId: EventId;
  hasChoice: boolean; // 歷史/汎用事件觸發（自動暫停候選）
}
export interface EvtTaimei extends GameEventBase {
  type: 'taimei.invoked' | 'taimei.expired'; // 大命發動/效果結束
  clanId: ClanId;
  taimeiId: TaimeiId;
}
export interface EvtClanSuccession extends GameEventBase {
  type: 'clan.succession'; // 當主死亡或被俘後家督繼承（06 §3.9.3；七輪裁決 2）
  clanId: ClanId;
  deceasedId: OfficerId; // 前任當主（沿用 canonical 欄名；可能仍存活但已被俘）
  heirId: OfficerId; // 繼任者
}
export interface EvtClanDestroyed extends GameEventBase {
  type: 'clan.destroyed';
  clanId: ClanId;
  byClanId: ClanId | null; // 勢力滅亡
}
export interface EvtVictoryTenkabitoProgress extends GameEventBase {
  type: 'victory.tenkabitoProgress';
  clanId: ClanId;
  months: number; // 天下人條件連續達成進度提示（tenkabitoStreakMonths ≥ 6 起每月一則；info 級；七輪裁決 2）
}
export interface EvtGameEnded extends GameEventBase {
  type: 'game.victory' | 'game.defeat'; // 勝敗判定成立
  clanId: ClanId;
  condition: string; // 條件 id（10 定義）
}

// ── 指令（03 迴圈機制專有）──
// command.rejected 為 03 §4.3 canonical 迴圈事件、apply-time 硬驗證失敗時發出（severity warning，僅玩家指令產生；
// 02 §4.19 明文不模型化 core 迴圈拒絕，故不在該總表、本檔為其唯一型別定義處）。payload 採本檔既有 flat-field
// 慣例（非 03 §5.1／§4.3 佔位寫法之巢狀 `payload`，該佔位明文「禁止照抄」）；見 03 §8-D14。
export interface EvtCommandRejected extends GameEventBase {
  type: 'command.rejected';
  commandType: CommandType; // 被拒指令型別（供 13 §3.7 renderReport toast enrichment 導出「何種指令被拒」）
  reasonKey: string; // i18n 拒絕鍵（03 §3.3.2 通用表＋各指令專屬；如 'cmd.reject.notOwner'）
  params: Record<string, string | number>; // 插值參數（無則空物件；ValidationResult.params 之落地）
}

// ── 時間（03）──
export interface EvtTimeMonthStart extends GameEventBase {
  type: 'time.monthStart';
  year: number;
  month: number; // 每月 1 日（UI 月結摘要用）
}
export interface EvtTimeSeasonStart extends GameEventBase {
  type: 'time.seasonStart';
  year: number;
  season: Season; // 季初（3／6／9／12 月 1 日）；app 層季首自動存檔消費（16 §5.3，二輪裁決 C）
}

export type GameEvent =
  | EvtBattleStarted
  | EvtBattleKassenAvailable
  | EvtBattleEnded
  | EvtAweTriggered
  | EvtSiegeStarted
  | EvtSiegeRelief
  | EvtSiegeEnded
  | EvtDistrictSubjugated
  | EvtArmyDeparted
  | EvtArmyArrived
  | EvtArmyReturned
  | EvtArmyBlocked
  | EvtArmyStarving
  | EvtArmyRouted
  | EvtEconomyIncome
  | EvtEconomyHarvest
  | EvtEconomyGranaryOverflow
  | EvtEconomyUpkeepUnpaid
  | EvtEconomyFoodShortage
  | EvtFacilityCompleted
  | EvtPolicyChanged
  | EvtPolicyAutoRevoked
  | EvtConscriptCompleted
  | EvtTransportArrived
  | EvtTransportLooted
  | EvtUprisingStarted
  | EvtUprisingEnded
  | EvtOfficerDied
  | EvtOfficerComingOfAge
  | EvtOfficerPromoted
  | EvtOfficerLoyaltyLow
  | EvtOfficerDefected
  | EvtOfficerRecruited
  | EvtOfficerRecruitFailed
  | EvtOfficerCaptured
  | EvtCaptiveDisposed
  | EvtPactSigned
  | EvtPactExpired
  | EvtPactBroken
  | EvtDiploRefused
  | EvtDiploReinforceAgreed
  | EvtDiploEnvoyArrived
  | EvtDiploWorkStopped
  | EvtCourtRankGranted
  | EvtCourtMediationResult
  | EvtShogunateTitleGranted
  | EvtShogunateNominated
  | EvtShogunatePatronLost
  | EvtShogunateCollapsed
  | EvtPlotResolved
  | EvtPlotExposed
  | EvtPlotBetrayalActivated
  | EvtProposalSubmitted
  | EvtProposalResolved
  | EvtProposalExpired
  | EvtEventFired
  | EvtTaimei
  | EvtClanSuccession
  | EvtClanDestroyed
  | EvtVictoryTenkabitoProgress
  | EvtGameEnded
  | EvtCommandRejected
  | EvtTimeMonthStart
  | EvtTimeSeasonStart;

export type GameEventType = GameEvent['type'];
