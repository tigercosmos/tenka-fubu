import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests } from '@app/store';
import { validateCommand } from '@core/index';
import { validateState } from '@core/state/invariants';
import { generateProposalCandidates } from '@core/systems/ai/proposalGen';
import { officerTroopCap, planMarchFromCastle } from '@core/systems/ai/shared';
import { submitProposal } from '@core/systems/proposals';
import { t } from '@i18n/zh-TW';
import { ProposalInbox } from '../../src/ui/screens/ProposalInbox';
import { describeProposal } from '../../src/ui/screens/proposalDescription';
import { uiStore } from '../../src/ui/hooks/uiStore';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});

it('previews the generated proposer commander rather than the shared planner best commander', () => {
  const game = buildTinyState();
  const proposer = game.officers[OFF_ALPHA_TAISHO]!;
  proposer.ldr = 100;
  proposer.val = 10;
  proposer.int = 10;
  proposer.pol = 10;
  proposer.traits = [];
  const best = game.officers[OFF_ALPHA_BUSHO]!;
  best.locationCastleId = CASTLE_A2;
  best.ldr = 120;
  best.traits = [];
  game.castles[CASTLE_A2]!.soldiers = 3000;
  game.castles[CASTLE_A2]!.food = 20000;
  game.castles[CASTLE_B1]!.soldiers = 100;
  expect(validateState(game)).toEqual([]);

  const planner = planMarchFromCastle(
    game,
    { clanId: CLAN_ALPHA, corpsId: null, castleIds: [CASTLE_A2], targetNodeId: null },
    game.castles[CASTLE_A2]!,
    CASTLE_B1,
    officerTroopCap(game, proposer),
  );
  expect(planner?.leaderId).toBe(best.id);
  const candidate = generateProposalCandidates(game).find((x) => x.officerId === proposer.id);
  if (!candidate || candidate.command.type !== 'march')
    throw new Error('Expected an actual generated march suggestion');
  expect(candidate.command.leaderId).toBe(proposer.id);
  expect(candidate.command.leaderId).not.toBe(planner!.leaderId);
  expect(validateCommand(game, candidate.command)).toEqual({ ok: true });
  const event = submitProposal(game, candidate);
  if (!event || event.type !== 'proposal.submitted')
    throw new Error('Expected actual proposal submission');
  const saved = game.proposals[event.proposalId]!;
  expect(saved.command).toEqual(candidate.command);
  expect(validateState(game)).toEqual([]);

  const commanders = t('ui.proposal.intent.commanders', {
    leader: proposer.name,
    deputies: t('ui.common.none'),
  });
  resetGameStoreForTests(game);
  const before = structuredClone(game);
  expect(describeProposal(game, saved).details).toContain(commanders);
  render(<ProposalInbox />);
  const details = screen.getByTestId('proposal-command-details');
  expect(details.textContent).toContain(commanders);
  expect(details.textContent).not.toContain(best.name);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});
