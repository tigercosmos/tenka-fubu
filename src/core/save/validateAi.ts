import type { GameState, CouncilPhase } from '../state/gameState';
import { validateCommand } from '../commands/validate';
import { FACILITIES } from '../facilities';
import { POLICIES } from '../policies';

const phaseSequences: readonly CouncilPhase[][] = [
  [],
  ['threat', 'military', 'domestic', 'diplomacy'],
  ['military', 'domestic', 'diplomacy'],
  ['domestic', 'diplomacy'],
  ['diplomacy'],
  ['threat', 'military'],
  ['military'],
];
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const nonnegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
function validThreatCache(value: unknown, day: number): boolean {
  if (value === null) return true;
  if (
    !isObject(value) ||
    !integer(value.computedDay) ||
    value.computedDay > day ||
    !nonnegativeFinite(value.totalThreat) ||
    !Array.isArray(value.entries)
  )
    return false;
  return value.entries.every(
    (entry) =>
      isObject(entry) &&
      typeof entry.enemyClanId === 'string' &&
      entry.enemyClanId !== '' &&
      ['borderPowerEnemy', 'borderPowerOurs', 'relationFactor', 'threat'].every((key) =>
        nonnegativeFinite(entry[key]),
      ) &&
      Array.isArray(entry.threatenedCastleIds) &&
      entry.threatenedCastleIds.every((id) => typeof id === 'string' && id !== ''),
  );
}
const validPhases = (value: unknown): boolean =>
  Array.isArray(value) &&
  phaseSequences.some((sequence) => JSON.stringify(sequence) === JSON.stringify(value));

/** Shape, not current legality: stale targets/resources still go through next-tick hard validation. */
function validPendingCommand(command: Record<string, unknown>): boolean {
  const ids = (...keys: string[]) =>
    keys.every((key) => typeof command[key] === 'string' && command[key] !== '');
  const numbers = (...keys: string[]) => keys.every((key) => integer(command[key]));
  const nullableId = (key: string) => command[key] === null || ids(key);
  const oneOf = (key: string, choices: readonly string[]) =>
    typeof command[key] === 'string' && choices.includes(command[key]);
  if (!ids('clanId', 'type') || 'authority' in command) return false;
  switch (command.type) {
    case 'setDevelopFocus':
      return ids('districtId') && oneOf('focus', ['agri', 'commerce', 'barracks']);
    case 'setConscriptPolicy':
      return ids('castleId') && oneOf('policy', ['low', 'mid', 'high']);
    case 'buildFacility':
    case 'demolishFacility':
      return (
        ids('castleId', 'facilityTypeId') &&
        Object.hasOwn(FACILITIES, String(command.facilityTypeId))
      );
    case 'cancelBuild':
      return ids('castleId') && numbers('queueIndex');
    case 'transport':
      return ids('fromCastleId', 'toCastleId') && numbers('soldiers', 'food', 'gold');
    case 'recallTransport':
      return ids('transportId');
    case 'tradeRice':
      return ids('castleId') && oneOf('mode', ['buy', 'sell']) && numbers('amount');
    case 'enactPolicy':
    case 'revokePolicy':
      return ids('policyId') && Object.hasOwn(POLICIES, String(command.policyId));
    case 'rewardOfficer':
      return ids('officerId') && oneOf('tier', ['small', 'medium', 'large']);
    case 'recruitRonin':
      return ids('officerId', 'executorId');
    case 'promoteRank':
      return ids('officerId');
    case 'handleCaptive':
      return (
        ids('officerId') &&
        nullableId('executorId') &&
        oneOf('action', ['recruit', 'release', 'execute'])
      );
    case 'march':
      return (
        ids('originCastleId', 'leaderId', 'targetNodeId') &&
        numbers('soldiers', 'food') &&
        Array.isArray(command.deputyIds) &&
        command.deputyIds.every((id) => typeof id === 'string' && id !== '')
      );
    case 'setArmyTarget':
      return ids('armyId', 'targetNodeId');
    case 'recallArmy':
      return ids('armyId');
    case 'returnArmyToCastle':
      return ids('armyId', 'destinationCastleId');
    case 'depositGarrison':
      return ids('armyId', 'castleId') && numbers('soldiers', 'food');
    case 'setAutoReturn':
      return ids('armyId') && typeof command.enabled === 'boolean';
    case 'setSiegeMode':
      return ids('siegeId') && oneOf('mode', ['encircle', 'assault']);
    case 'startKassen':
      return ids('fieldCombatId');
    case 'startDiploWork':
      return ids('target', 'executorId');
    case 'stopDiploWork':
      return ids('target');
    case 'proposePact':
      return (
        ids('targetClanId') &&
        nullableId('reinforceAgainstClanId') &&
        oneOf('kind', [
          'proposeAlliance',
          'proposeMarriage',
          'proposeCeasefire',
          'demandVassal',
          'offerVassal',
          'requestReinforce',
        ])
      );
    case 'respondPact':
      return ids('proposalId') && typeof command.accept === 'boolean';
    case 'breakPact':
      return ids('targetClanId') && oneOf('kind', ['alliance', 'marriage', 'ceasefire', 'vassal']);
    case 'startPlot':
      return (
        ids('executorId', 'targetClanId') &&
        nullableId('targetOfficerId') &&
        nullableId('targetCastleId') &&
        numbers('investGold') &&
        oneOf('kind', ['poach', 'rumor', 'betrayal'])
      );
    case 'cancelPlot':
      return ids('plotId');
    default:
      return false; // No debug/player-modal authority may be persisted as an AI order.
  }
}

/** Persisted AI bookkeeping is versioned data, not a trusted source of execution authority. */
export function validateSavedAi(state: GameState): boolean {
  const ai = state.ai;
  if (typeof ai.allAi !== 'boolean') return false;
  if (
    !Array.isArray(ai.pendingOrders) ||
    !Array.isArray(ai.councilJobs) ||
    !isObject(ai.lastCouncilEnrollment) ||
    !Object.values(ai.lastCouncilEnrollment).every(integer)
  )
    return false;
  const owners = new Set<string>();
  for (const job of ai.councilJobs) {
    if (
      !isObject(job) ||
      typeof job.clanId !== 'string' ||
      (job.corpsId !== null && typeof job.corpsId !== 'string') ||
      !integer(job.enrolledDay) ||
      !validPhases(job.phases) ||
      job.phases.length === 0
    )
      return false;
    const owner = job.corpsId === null ? `clan:${job.clanId}` : `corps:${job.corpsId}`;
    if (owners.has(owner)) return false;
    owners.add(owner);
    const clan = state.clans[job.clanId];
    if (!clan || (job.corpsId === null && job.clanId === state.meta.playerClanId && !ai.allAi))
      return false;
    if (job.corpsId !== null) {
      // Dissolution/victory can leave a stale job until the next scheduler cleanup.
      const corps = state.corps[job.corpsId];
      if (corps && corps.clanId !== job.clanId) return false;
    } else if (
      clan.alive &&
      JSON.stringify(ai.clans[job.clanId]?.pendingPhases) !== JSON.stringify(job.phases)
    )
      return false;
  }
  for (const clan of Object.values(ai.clans)) {
    if (
      !validThreatCache(clan.threatCache, state.time.day) ||
      !validPhases(clan.pendingPhases) ||
      !integer(clan.councilOffset) ||
      clan.councilOffset >= 30 ||
      !Array.isArray(clan.attackPlans) ||
      !integer(clan.nextPlanSeq)
    )
      return false;
    if (
      state.clans[clan.clanId]?.alive &&
      clan.pendingPhases.length > 0 &&
      !ai.councilJobs.some((job) => job.corpsId === null && job.clanId === clan.clanId)
    )
      return false;
    for (const plan of clan.attackPlans) {
      if (
        !isObject(plan) ||
        (plan.abortReason !== null && typeof plan.abortReason !== 'string') ||
        !['id', 'targetCastleId', 'targetClanId', 'stagingCastleId'].every(
          (key) => typeof plan[key] === 'string' && plan[key] !== '',
        ) ||
        (plan.ownerCorpsId !== null && typeof plan.ownerCorpsId !== 'string') ||
        !['startedDay', 'stageEnteredDay', 'plannedTroops', 'stagingRetainedTroops'].every((key) =>
          integer(plan[key]),
        ) ||
        !isObject(plan.sourceLeaderIds) ||
        !Object.values(plan.sourceLeaderIds).every((id) => typeof id === 'string' && id !== '') ||
        !Array.isArray(plan.sourceCastleIds) ||
        !plan.sourceCastleIds.every((id) => typeof id === 'string' && id !== '') ||
        new Set(plan.sourceCastleIds).size !== plan.sourceCastleIds.length ||
        !Array.isArray(plan.armyIds) ||
        !plan.armyIds.every((id) => typeof id === 'string' && id !== '') ||
        new Set(plan.armyIds).size !== plan.armyIds.length ||
        !['muster', 'advance', 'siege', 'consolidate'].includes(plan.stage)
      )
        return false;
    }
  }
  for (const order of ai.pendingOrders) {
    if (!isObject(order) || !isObject(order.command) || !isObject(order.authority)) return false;
    if (!validPendingCommand(order.command)) return false;
    const authority = order.authority;
    if (
      typeof order.command.type !== 'string' ||
      typeof order.command.clanId !== 'string' ||
      authority.kind === 'player' ||
      !['clan', 'corps', 'castle', 'steward'].includes(authority.kind) ||
      typeof authority.clanId !== 'string' ||
      authority.clanId !== order.command.clanId
    )
      return false;
    if (authority.kind === 'corps' && typeof authority.corpsId !== 'string') return false;
    if (authority.kind === 'castle' && typeof authority.castleId !== 'string') return false;
    if (
      authority.kind === 'steward' &&
      (typeof authority.officerId !== 'string' || typeof authority.districtId !== 'string')
    )
      return false;
    // Stale but well-shaped orders may be rejected next tick. A malformed payload must not crash after load.
    try {
      validateCommand(state, order.command, order.authority);
    } catch {
      return false;
    }
  }
  return true;
}
