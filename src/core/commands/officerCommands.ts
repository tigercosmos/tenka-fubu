import type { GameState } from '../state/gameState';
import { promoteOfficer, validatePromotion } from '../systems/officers';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import type { ValidationResult } from './types';

export function validatePromoteRank(
  state: Readonly<GameState>,
  cmd: CommandByType['promoteRank'],
): ValidationResult {
  const result = validatePromotion(state, cmd.officerId, cmd.clanId);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    reasonKey:
      result.reason === 'insufficientMerit' || result.reason === 'highestRank'
        ? REJECT_REASONS.rankTooLow
        : REJECT_REASONS.invalidTarget,
  };
}

export function applyPromoteRank(
  state: GameState,
  cmd: CommandByType['promoteRank'],
  emit: EmitFn,
): void {
  const result = promoteOfficer(state, cmd.officerId, cmd.clanId);
  if (!result.ok) return;
  emit({
    type: 'officer.promoted',
    day: state.time.day,
    clanIds: [cmd.clanId],
    officerId: cmd.officerId,
    clanId: cmd.clanId,
    newRank: result.nextRank,
  });
}
