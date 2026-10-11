import { BAL } from '../balance';
import type { GameState, Proposal } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { OfficerId, ProposalId } from '../state/ids';
import type { OfficerStat } from '../state/officerTypes';
import type { ProposalKind } from '../state/enums';
import { adjustLoyalty } from './officers';
import { nextId } from '../state/serialize';
import { DAYS_PER_MONTH } from './time';

export const proposalTerminalKey = (id: ProposalId): string => `proposal.terminal:${id}`;
export const proposalOfficerCooldownKey = (id: OfficerId): string => `proposal.officer:${id}`;
export function markProposalTerminal(state: GameState, proposal: Proposal): void {
  state.events.cooldownUntil[proposalTerminalKey(proposal.id)] =
    state.time.day + DAYS_PER_MONTH + 1 - state.time.dayOfMonth;
}
export function proposalExpStats(kind: ProposalKind): readonly OfficerStat[] {
  if (kind === 'march' || kind === 'recall' || kind === 'conscript') return ['ldr'];
  if (kind === 'plot') return ['int'];
  return ['pol'];
}

/** M7 supplies candidates; this boundary enforces M6 ownership and monthly limits. */
export function submitProposal(
  state: GameState,
  candidate: Omit<Proposal, 'id' | 'createdDay' | 'expiresDay' | 'status'>,
): GameEvent | null {
  const officer = state.officers[candidate.officerId];
  if (
    candidate.clanId !== state.meta.playerClanId ||
    !officer?.hasComeOfAge ||
    officer.status !== 'serving' ||
    officer.clanId !== candidate.clanId ||
    candidate.command.clanId !== candidate.clanId ||
    candidate.command.type === 'resolveProposal' ||
    !Number.isFinite(candidate.meritReward) ||
    candidate.meritReward < 0 ||
    (state.events.cooldownUntil[proposalOfficerCooldownKey(candidate.officerId)] ?? 0) >
      state.time.day
  )
    return null;
  const monthStart = state.time.day - state.time.dayOfMonth + 1;
  const monthly = Object.values(state.proposals).filter(
    (p) => p.clanId === candidate.clanId && p.createdDay >= monthStart,
  );
  if (
    monthly.length >= BAL.proposalMaxPerMonth ||
    monthly.filter((p) => p.officerId === candidate.officerId).length >=
      BAL.proposalMaxPerOfficerPerMonth
  )
    return null;
  const id = nextId(state, 'proposal');
  state.proposals[id] = {
    ...candidate,
    id,
    createdDay: state.time.day,
    expiresDay: state.time.day + BAL.proposalExpireDays,
    status: 'pending',
  };
  return {
    type: 'proposal.submitted',
    day: state.time.day,
    clanIds: [candidate.clanId],
    proposalId: id,
    officerId: candidate.officerId,
    kind: candidate.kind,
  };
}

export function proposalsSystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const proposal of Object.values(state.proposals).sort((a, b) => a.id.localeCompare(b.id))) {
    const officer = state.officers[proposal.officerId];
    const invalid = !officer || officer.status !== 'serving' || officer.clanId !== proposal.clanId;
    if (proposal.status === 'pending' && (invalid || proposal.expiresDay <= state.time.day)) {
      proposal.status = 'expired';
      if (!invalid && state.clans[proposal.clanId]?.leaderId !== officer.id)
        adjustLoyalty(officer, -BAL.proposalExpireLoyalty);
      markProposalTerminal(state, proposal);
      events.push({
        type: 'proposal.expired',
        day: state.time.day,
        clanIds: [proposal.clanId],
        proposalId: proposal.id,
        officerId: proposal.officerId,
        reason: invalid ? 'invalidated' : 'timeout',
      });
    } else if (proposal.status !== 'pending' && state.time.dayOfMonth === 1) {
      const key = proposalTerminalKey(proposal.id);
      if ((state.events.cooldownUntil[key] ?? 0) <= state.time.day) {
        delete state.proposals[proposal.id];
        delete state.events.cooldownUntil[key];
      }
    }
  }
  return events;
}
