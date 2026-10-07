import { BAL } from './balance';
import { CoreError } from './errors';
import type { GameState } from './state/gameState';
import type {
  AiPersonaId,
  CastleId,
  ClanId,
  DistrictId,
  OfficerId,
  ProposalId,
  RoadEdgeId,
} from './state/ids';
import { validateState } from './state/invariants';
import { validateCommand } from './commands/validate';
import { ensureDiplomacyRow } from './systems/diplomacyCommon';
import { submitProposal } from './systems/proposals';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from './systems/officers';

// The first successful unmodified production RNG seed in tests/core/debugM6.spec.ts.
export const DEBUG_M6_FLOW_SEED = 5;
export const DEBUG_M6_FLOW_IDS = {
  actor: 'clan.oda' as ClanId,
  ally: 'clan.takeda' as ClanId,
  enemy: 'clan.imagawa' as ClanId,
  against: 'clan.imagawa' as ClanId,
  allyLeader: 'off.takeda-shingen' as OfficerId,
  allyCastle: 'castle.tsutsujigasaki' as CastleId,
  poachTarget: 'off.okabe-masatsuna' as OfficerId,
  plotExecutor: 'off.kinoshita-tokichiro' as OfficerId,
  proposalOfficer: 'off.niwa-nagahide' as OfficerId,
  proposalId: 'prop.000001' as ProposalId,
} as const;
export const DEBUG_M6_FLOW_METADATA = {
  debugOnly: true,
  syntheticTakedaExtension: true,
  note: 'Takeda, Shingen and Tsutsujigasaki are synthetic test entities absent from the current Tokai/Kinki production bundle. Coordinates and numeric fields are test templates, not historical data.',
  poachInvestment: BAL.plotPoachInvestGoldOptions[3],
  poachSettlementDays: 60,
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
  const sourceCastle = state.castles['castle.sunpu' as CastleId],
    sourceClan = state.clans[ids.enemy],
    sourceLeader = state.officers['off.imagawa-yoshimoto' as OfficerId],
    personaId = 'persona.takeda' as AiPersonaId;
  if (!sourceCastle || !sourceClan || !sourceLeader || !state.ai.personas[personaId])
    throw new CoreError('DATA_INTEGRITY', 'M6 flow fixture requires the real Tokai/Kinki bundle');
  const districtIds = ['dist.debug-kai-east', 'dist.debug-kai-west'] as DistrictId[];
  const position = { x: sourceCastle.pos.x, y: sourceCastle.pos.y - 40 };
  state.clans[ids.ally] = {
    ...structuredClone(sourceClan),
    id: ids.ally,
    name: '武田家',
    leaderId: ids.allyLeader,
    homeCastleId: ids.allyCastle,
    colorIndex: 20,
    courtRank: 'none',
    shogunateTitle: 'none',
  };
  state.castles[ids.allyCastle] = {
    ...structuredClone(sourceCastle),
    id: ids.allyCastle,
    name: '躑躅崎館',
    pos: position,
    ownerClanId: ids.ally,
    lordId: ids.allyLeader,
    districtIds,
    corpsId: null,
    buildQueue: [],
  };
  const templateDistrict = state.districts[sourceCastle.districtIds[0]!];
  if (!templateDistrict) throw new CoreError('DATA_INTEGRITY', 'M6 flow district template missing');
  for (const [index, id] of districtIds.entries())
    state.districts[id] = {
      ...structuredClone(templateDistrict),
      id,
      name: index === 0 ? '試驗甲斐東郡' : '試驗甲斐西郡',
      castleId: ids.allyCastle,
      ownerClanId: ids.ally,
      pos: { x: position.x + (index === 0 ? -10 : 10), y: position.y - 10 },
      stewardId: null,
      uprising: null,
      subjugation: null,
    };
  state.officers[ids.allyLeader] = {
    ...structuredClone(sourceLeader),
    id: ids.allyLeader,
    name: '武田信玄',
    clanId: ids.ally,
    locationCastleId: ids.allyCastle,
    debutCastleId: ids.allyCastle,
    debutClanId: ids.ally,
    spouseId: null,
    deathYear: 1573,
    scheduledDeath: { year: 1573, month: 4 },
    traits: [],
  };
  for (const [index, destination] of [sourceCastle.id, ...districtIds].entries()) {
    const id = `road.debug-takeda-${index + 1}` as RoadEdgeId;
    state.roads[id] = {
      id,
      a: ids.allyCastle,
      b: destination,
      type: 'land',
      grade: 1,
      baseDays: 2,
    };
  }
  state.ai.clans[ids.ally] = {
    ...structuredClone(state.ai.clans[ids.enemy]!),
    clanId: ids.ally,
    personaId,
    pendingPhases: [],
    attackPlans: [],
    threatCache: null,
  };
  state.policies[ids.ally] = structuredClone(state.policies[ids.enemy]!);
  // Sanctioned debug initial conditions: generous resources, cooperative aid persona and no autonomous councils during this short flow.
  state.meta.debugMode = true;
  state.clans[ids.actor]!.gold = 20_000;
  state.ai.personas[personaId].loyalty = 100;
  for (const ai of Object.values(state.ai.clans)) {
    ai.lastCouncilDay = state.time.day + 120;
    ai.pendingPhases = [];
  }
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
