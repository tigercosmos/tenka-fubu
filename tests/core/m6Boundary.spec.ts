import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import {
  submitProposal,
  proposalsSystem,
  proposalOfficerCooldownKey,
} from '../../src/core/systems/proposals';
import {
  buildTinyState,
  CLAN_ALPHA,
  CASTLE_A1,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

const candidate = () => ({
  clanId: CLAN_ALPHA,
  officerId: OFF_ALPHA_BUSHO,
  kind: 'reward' as const,
  command: {
    type: 'rewardOfficer' as const,
    clanId: CLAN_ALPHA,
    officerId: OFF_ALPHA_BUSHO,
    tier: 'small' as const,
  },
  meritReward: BAL.meritProposalAdopted,
  estimatedCostGold: 100,
  summaryKey: 'ui.officer.rewardOffer',
  summaryParams: {},
});

describe('M6 persistent gameplay boundaries', () => {
  it('caps release prestige at its invariant maximum', () => {
    const state = buildTinyState();
    Object.assign(state.officers[OFF_BETA_BUSHO]!, {
      status: 'captive',
      capturedByClanId: CLAN_ALPHA,
      locationCastleId: CASTLE_A1,
    });
    state.clans[CLAN_ALPHA]!.prestige = BAL.prestigeMax;
    const command = {
      type: 'handleCaptive' as const,
      clanId: CLAN_ALPHA,
      officerId: OFF_BETA_BUSHO,
      action: 'release' as const,
      executorId: null,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    applyCommand(state, command, () => {});
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(BAL.prestigeMax);
    expect(validateState(state)).toEqual([]);
  });

  it.each([true, false])(
    'persists the per-officer resolution cooldown for acceptance=%s and allows the exact end day',
    (accept) => {
      const state = buildTinyState(),
        submitted = submitProposal(state, candidate())!;
      if (submitted.type !== 'proposal.submitted') throw new Error('expected submission');
      const day = state.time.day,
        command = {
          type: 'resolveProposal' as const,
          clanId: CLAN_ALPHA,
          proposalId: submitted.proposalId,
          accept,
        };
      expect(validateCommand(state, command)).toEqual({ ok: true });
      applyCommand(state, command, () => {});
      const key = proposalOfficerCooldownKey(OFF_ALPHA_BUSHO);
      expect(state.events.cooldownUntil[key]).toBe(day + BAL.proposalCooldownDays);
      const loaded = decodeSave(encodeSave(state, 0));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const restored = loaded.saveFile.state;
      restored.time.day = day + BAL.proposalCooldownDays - 1;
      expect(submitProposal(restored, candidate())).toBeNull();
      restored.time.day++;
      expect(submitProposal(restored, candidate())).not.toBeNull();
    },
  );

  it('does not impose resolution cooldown on timed-out proposals', () => {
    const state = buildTinyState(),
      submitted = submitProposal(state, candidate())!;
    if (submitted.type !== 'proposal.submitted') throw new Error('expected submission');
    state.time.day = state.proposals[submitted.proposalId]!.expiresDay;
    proposalsSystem(state);
    expect(state.events.cooldownUntil[proposalOfficerCooldownKey(OFF_ALPHA_BUSHO)]).toBeUndefined();
  });

  it('does not impose resolution cooldown when adoption fails revalidation', () => {
    const state = buildTinyState(),
      submitted = submitProposal(state, candidate())!;
    if (submitted.type !== 'proposal.submitted') throw new Error('expected submission');
    state.clans[CLAN_ALPHA]!.gold = 0;
    applyCommand(
      state,
      {
        type: 'resolveProposal',
        clanId: CLAN_ALPHA,
        proposalId: submitted.proposalId,
        accept: true,
      },
      () => {},
    );
    expect(state.proposals[submitted.proposalId]!.status).toBe('expired');
    expect(state.events.cooldownUntil[proposalOfficerCooldownKey(OFF_ALPHA_BUSHO)]).toBeUndefined();
  });
});
