// core 公開 API 唯一出口：advanceDay、validateCommand、buildGameState、serialize、selectors 再匯出。
// 規格：plan/01-architecture.md §3.3。留待各系統於對應里程碑完成後於此彙整匯出。
export { computePath, getStance } from './systems/pathfinding';
export type { PathQuery, PathResult, Stance } from './systems/pathfinding';
export { severityOf } from './systems/reports';
export { validateCommand } from './commands/validate';
export { getTrust, getSentiment, isAtWar, hasPact, isOfficerBusy } from './systems/diplomacyCommon';
export { clanPower, evaluateProposal, reinforcementAidScore } from './systems/diplomacyEval';
export {
  courtRankOrder,
  shogunateTitleOrder,
  workCostMultiplier,
  extraPolicySlots,
  courtUnlocks,
} from './systems/court';
export { getPlotSuccessRate, plotMonthlyProgress } from './systems/plots';
export { controlsCourtCapital } from './systems/court';
export { shogunateTitleCost, mediationFavorCost } from './commands/courtCommands';
export { pactTrustCost } from './commands/diplomacyCommands';
export {
  officerAbilityScore,
  captiveRecruitSuccessRate,
  recruitRoninSuccessRate,
  rewardOfficerCost,
  rewardOfficerLoyaltyGain,
} from './systems/officers';
