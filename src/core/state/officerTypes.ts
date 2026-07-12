// 武將系統專用型別。實體 Officer 與 Rank 的單一真相仍在 gameState.ts／enums.ts。
// 規格：plan/06-officers.md §4、§5.9（M3-1）。

import type { Officer } from './gameState';
import type { TraitId } from './ids';

export type { Officer } from './gameState';
export type { Kinship, OfficerStatus, Rank } from './enums';
export type { OfficerId, TraitId } from './ids';

/** 四維能力鍵。 */
export type OfficerStat = 'ldr' | 'val' | 'int' | 'pol';

/** 特性數值介入點（06 §4）。 */
export type TraitHook =
  | 'battle.allStatsMult'
  | 'battle.attackMult'
  | 'battle.rangedAttackMult'
  | 'battle.tacticPowerValor'
  | 'battle.tacticPowerCharge'
  | 'battle.tacticPowerRanged'
  | 'battle.moraleLossMult'
  | 'battle.routThresholdAdd'
  | 'battle.aweLevelAdd'
  | 'battle.aweRangeAdd'
  | 'siege.attackMult'
  | 'siege.defenseDamageMult'
  | 'siege.defenseMoraleMult'
  | 'march.landSpeedMult'
  | 'march.seaSpeedMult'
  | 'march.subjugateTimeMult'
  | 'army.foodUseMult'
  | 'dev.efficiencyMult'
  | 'dev.kokudakaMult'
  | 'dev.commerceMult'
  | 'dev.facilityTimeMult'
  | 'dev.conscriptionMult'
  | 'dev.securityAdd'
  | 'diplo.trustGainMult'
  | 'diplo.courtCostMult'
  | 'plot.successAdd'
  | 'plot.costMult'
  | 'plot.defenseAdd'
  | 'officer.recruitSuccessAdd'
  | 'officer.loyaltyAuraAdd'
  | 'officer.loyaltySelfAdd'
  | 'officer.meritGainMult'
  | 'proposal.weightMult';

export interface TraitEffect {
  hook: TraitHook;
  mode: 'mult' | 'add';
  /** mult 以比例表示；減益為負值。add 直接加到點數或機率。 */
  value: number;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  rarity: 'common' | 'rare' | 'legendary';
  effects: readonly TraitEffect[];
}

/** traitModifier 的最小輸入契約，讓測試與其他系統不必建完整 Officer。 */
export type OfficerTraits = Pick<Officer, 'traits'>;
