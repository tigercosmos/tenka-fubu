// core 公開 API 唯一出口：advanceDay、validateCommand、buildGameState、serialize、selectors 再匯出。
// 規格：plan/01-architecture.md §3.3。留待各系統於對應里程碑完成後於此彙整匯出。
export { computePath, getStance } from './systems/pathfinding';
export type { PathQuery, PathResult, Stance } from './systems/pathfinding';
export { armyPhysicalLeg, planArmyReroute } from './systems/armyReroute';
export type { ArmyPhysicalLeg, ArmyReroutePlan } from './systems/armyReroute';
export { severityOf } from './systems/reports';
export { validateCommand } from './commands/validate';
export { getEffectiveOfficerStat } from './battleStats';
export { getOfficerTacticIds } from './tactics';
export { getTrust, getSentiment, isAtWar, hasPact, isOfficerBusy } from './systems/diplomacyCommon';
export { clanPower, evaluateProposal, reinforcementAidScore } from './systems/diplomacyEval';
export {
  courtRankOrder,
  shogunateTitleOrder,
  workCostMultiplier,
  monthlyDiplomacyWorkCost,
  extraPolicySlots,
  courtUnlocks,
} from './systems/court';
export { getPlotSuccessRate, plotMonthlyProgress } from './systems/plots';
export { controlsCourtCapital } from './systems/court';
export { shogunateTitleCost, mediationFavorCost } from './commands/courtCommands';
export { pactTrustCost } from './commands/diplomacyCommands';
export {
  corpsCastleIds,
  splitCorpsIncome,
  dissolveCorps,
  removeCastleFromCorps,
} from './systems/corps';
export { DIFFICULTY_MODS, getDifficultyMods } from './systems/ai/difficulty';
export {
  officerAbilityScore,
  captiveRecruitSuccessRate,
  recruitRoninSuccessRate,
  rewardOfficerCost,
  rewardOfficerLoyaltyGain,
} from './systems/officers';
export { TAIMEI_CATALOG, getTaimeiDef } from './systems/events/taimeiCatalog';
export type { TaimeiDef } from './systems/events/taimeiCatalog';
export {
  availableTaimei,
  effectiveTaimeiPrestige,
  previewTaimeiFoodGain,
  taimeiEffects,
  TAIMEI_NEUTRAL,
} from './systems/events/taimei';
export { dayToCalendar, calendarToDay } from './systems/time';
export { buildGameState } from './state/builder';
export type { ScenarioInput } from './state/builder';
export type { TaimeiEffects } from './systems/events/taimei';
export type {
  ClanMonthOpeningSettlement,
  MonthOpeningSettlement,
} from './systems/monthOpeningSettlement';
