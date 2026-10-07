import type { GameState } from '../state/gameState';
import type { Command, ValidationResult } from './types';
import type { Applier, CommandByType, EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import { BAL } from '../balance';
import { adjustLoyalty, gainMerit } from '../systems/officers';
import {
  markProposalTerminal,
  proposalExpStats,
  proposalOfficerCooldownKey,
} from '../systems/proposals';

export function validateResolveProposal(
  state: Readonly<GameState>,
  cmd: CommandByType['resolveProposal'],
): ValidationResult {
  const proposal = state.proposals[cmd.proposalId];
  const officer = proposal && state.officers[proposal.officerId];
  return proposal?.status === 'pending' &&
    proposal.clanId === cmd.clanId &&
    proposal.expiresDay > state.time.day &&
    officer?.status === 'serving' &&
    officer.hasComeOfAge &&
    officer.clanId === cmd.clanId &&
    Number.isFinite(proposal.meritReward) &&
    proposal.meritReward >= 0 &&
    proposal.command.clanId === cmd.clanId &&
    proposal.command.type !== 'resolveProposal'
    ? { ok: true }
    : { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
}
export interface ProposalExecutor {
  validate(state: Readonly<GameState>, command: Command): ValidationResult;
  apply(state: GameState, command: Command, emit: EmitFn): void;
}
/** Injected registry operations avoid a runtime import cycle. */
export function createApplyResolveProposal(
  executor: ProposalExecutor,
): Applier<CommandByType['resolveProposal']> {
  return (state, cmd, emit) => {
    const proposal = state.proposals[cmd.proposalId];
    if (!proposal || !validateResolveProposal(state, cmd).ok) return;
    const officer = state.officers[proposal.officerId]!;
    if (cmd.accept && !executor.validate(state, proposal.command).ok) {
      proposal.status = 'expired';
      markProposalTerminal(state, proposal);
      emit({
        type: 'proposal.expired',
        day: state.time.day,
        clanIds: [cmd.clanId],
        proposalId: proposal.id,
        officerId: officer.id,
        reason: 'invalidated',
      });
      return;
    }
    // Mark before nested execution to prevent a reentrant executor executing it twice.
    proposal.status = cmd.accept ? 'accepted' : 'rejected';
    markProposalTerminal(state, proposal);
    state.events.cooldownUntil[proposalOfficerCooldownKey(officer.id)] =
      state.time.day + BAL.proposalCooldownDays;
    if (cmd.accept) {
      executor.apply(state, proposal.command, emit);
      gainMerit(officer, proposal.meritReward, proposalExpStats(proposal.kind));
      adjustLoyalty(officer, BAL.proposalAdoptLoyalty);
    } else adjustLoyalty(officer, -BAL.proposalRejectLoyalty);
    emit({
      type: 'proposal.resolved',
      day: state.time.day,
      clanIds: [cmd.clanId],
      proposalId: proposal.id,
      accepted: cmd.accept,
    });
  };
}
