// Read-only calculation abilities: 00/02 upper bound takes priority over 06 trait multipliers.
import { BAL } from './balance';
import type { Officer } from './state/gameState';
import type { OfficerStat } from './state/officerTypes';
import { traitModifier } from './traits';

/** Ordinary effective ability; used for tactical saihai without a Gunshin bonus. */
export function getEffectiveOfficerStat(officer: Readonly<Officer>, stat: OfficerStat): number {
  return Math.min(BAL.abilityMax, officer[stat] + officer.statGrowth[stat]);
}

/** Primary-general attack/tactic calculation only; never writes persisted abilities. */
export function getBattleOfficerStat(officer: Readonly<Officer>, stat: OfficerStat): number {
  return Math.min(
    BAL.abilityMax,
    getEffectiveOfficerStat(officer, stat) * traitModifier(officer, 'battle.allStatsMult').mult,
  );
}
