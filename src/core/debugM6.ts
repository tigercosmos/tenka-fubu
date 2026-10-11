import { BAL } from './balance';
import { CoreError } from './errors';
import type { GameState } from './state/gameState';
import type { AiPersonaId, CastleId, ClanId, OfficerId, ProposalId } from './state/ids';
import { validateState } from './state/invariants';
import { validateCommand } from './commands/validate';
import { ensureDiplomacyRow } from './systems/diplomacyCommon';
import { submitProposal } from './systems/proposals';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from './systems/officers';
import { castleMaxSoldiers } from './domestic';

// The first successful unmodified production RNG seed in tests/core/debugM6.spec.ts.
export const DEBUG_M6_FLOW_SEED = 5;
export const DEBUG_M6_FLOW_IDS = {
  actor: 'clan.oda' as ClanId,
  ally: 'clan.takeda' as ClanId,
  enemy: 'clan.imagawa' as ClanId,
  against: 'clan.nagao' as ClanId,
  allyLeader: 'off.takeda-shingen' as OfficerId,
  allyCastle: 'castle.tsutsujigasaki' as CastleId,
  poachTarget: 'off.okabe-masatsuna' as OfficerId,
  plotExecutor: 'off.kinoshita-tokichiro' as OfficerId,
  proposalOfficer: 'off.niwa-nagahide' as OfficerId,
  proposalId: 'prop.000001' as ProposalId,
} as const;
export const DEBUG_M6_FLOW_METADATA = {
  debugOnly: true,
  syntheticTakedaExtension: false,
  note: 'Uses the production four-region geography, roster and pacts. Takeda aid targets nearby Nagao; Imagawa remains the poach target. Clone-only capacity-max Takeda garrisons, morale 100, food at least 20000 and half Nagao garrisons prepare genuine aid eligibility; no command outcomes are manufactured.',
  poachInvestment: BAL.plotPoachInvestGoldOptions[3],
  poachSettlementDays: 60,
  takedaInitialFood: 20000,
  takedaGarrisonPreparation: 'actual castleMaxSoldiers capacity',
  takedaInitialMorale: 100,
  nagaoInitialGarrisonRatio: 0.5,
  autonomousCouncilSuppressionDays: 120,
} as const;

/** Prepare a clone of a fresh Oda game; never modifies a live/input state or manufactures outcomes. */
export function prepareM6FlowState(input: GameState): GameState {
  const ids = DEBUG_M6_FLOW_IDS;
  if (
    input.meta.scenarioId !== 's1560' ||
    input.meta.playerClanId !== ids.actor ||
    input.meta.stateVersion !== 0 ||
    input.meta.nextSerials.proposal !== 1 ||
    Object.keys(input.armies).length > 0
  )
    throw new CoreError('DATA_INTEGRITY', 'M6 flow fixture requires a fresh s1560 Oda game');
  const state = structuredClone(input);
  const allyCastle = state.castles[ids.allyCastle],
    allyClan = state.clans[ids.ally],
    allyLeader = state.officers[ids.allyLeader],
    personaId = 'persona.takeda' as AiPersonaId;
  if (!allyCastle || !allyClan || !allyLeader || !state.ai.personas[personaId])
    throw new CoreError('DATA_INTEGRITY', 'M6 flow fixture requires production Takeda');
  // Initial-condition preparation only: retain every production entity and relationship
  // endpoint. The aid flow uses the existing nearby Nagao conflict and safe real borders.
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId === ids.ally) {
      castle.soldiers = Math.round(castleMaxSoldiers(state, castle));
      castle.morale = DEBUG_M6_FLOW_METADATA.takedaInitialMorale;
      castle.food = Math.max(castle.food, DEBUG_M6_FLOW_METADATA.takedaInitialFood);
    } else if (castle.ownerClanId === 'clan.nagao') {
      castle.soldiers = Math.floor(
        castle.soldiers * DEBUG_M6_FLOW_METADATA.nagaoInitialGarrisonRatio,
      );
    }
  }
  // Sanctioned debug initial conditions: generous resources, cooperative aid persona and no autonomous councils during this short flow.
  state.meta.debugMode = true;
  state.clans[ids.actor]!.gold = 20_000;
  state.ai.personas[personaId].loyalty = 100;
  for (const ai of Object.values(state.ai.clans)) {
    ai.lastCouncilDay = state.time.day + DEBUG_M6_FLOW_METADATA.autonomousCouncilSuppressionDays;
    state.ai.lastCouncilEnrollment[`clan:${ai.clanId}`] =
      state.time.day + DEBUG_M6_FLOW_METADATA.autonomousCouncilSuppressionDays;
    ai.pendingPhases = [];
  }
  state.ai.councilJobs = [];
  state.ai.pendingOrders = [];
  const row = ensureDiplomacyRow(state, ids.actor, ids.ally);
  if (row.a === ids.actor) {
    row.trustAtoB = BAL.trustMax;
    row.sentimentBtoA = 100;
  } else {
    row.trustBtoA = BAL.trustMax;
    row.sentimentAtoB = 100;
  }
  const executor = state.officers[ids.plotExecutor]!,
    target = state.officers[ids.poachTarget]!,
    author = state.officers[ids.proposalOfficer]!;
  executor.int = 100;
  target.loyalty = 20;
  author.loyalty = 60;
  const command = {
    type: 'rewardOfficer' as const,
    clanId: ids.actor,
    officerId: author.id,
    tier: 'small' as const,
  };
  if (!validateCommand(state, command).ok)
    throw new CoreError('DATA_INTEGRITY', 'M6 proposal payload is invalid');
  const submitted = submitProposal(state, {
    clanId: ids.actor,
    officerId: author.id,
    kind: 'reward',
    command,
    meritReward: BAL.meritProposalAdopted,
    estimatedCostGold: rewardOfficerCost('small'),
    summaryKey: 'ui.officer.rewardOffer',
    summaryParams: {
      tier: 'small',
      gold: rewardOfficerCost('small'),
      loyalty: rewardOfficerLoyaltyGain(author, 'small'),
    },
  });
  if (
    !submitted ||
    submitted.type !== 'proposal.submitted' ||
    submitted.proposalId !== ids.proposalId
  )
    throw new CoreError('DATA_INTEGRITY', 'M6 proposal boundary rejected candidate');
  state.meta.deferredEvents.push(submitted);
  const violations = validateState(state);
  if (violations.length)
    throw new CoreError('INVARIANT_VIOLATION', 'M6 flow fixture is invalid', violations);
  return state;
}
