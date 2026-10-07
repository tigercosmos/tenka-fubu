import { BAL } from '../balance';
import type { DiplomacyActionKind, DiplomacyProposal, GameState } from '../state/gameState';
import type { ClanId, OfficerId } from '../state/ids';
import type { PactKind } from '../state/enums';
import { nextId } from '../state/serialize';
import {
  adjustSentiment,
  adjustTrust,
  ensureDiplomacyRow,
  getDiplomacyRow,
  getTrust,
  hasPact,
  isAtWar,
  isOfficerBusy,
} from '../systems/diplomacyCommon';
import { clanPower } from '../systems/diplomacyEval';
import { DAYS_PER_MONTH } from '../systems/time';
import { REJECT_REASONS, type RejectReasonKey } from './reasons';
import type { CommandByType, EmitFn } from './registry';
import type { ValidationResult } from './types';

const reject = (reasonKey: RejectReasonKey = REJECT_REASONS.invalidTarget): ValidationResult => ({
  ok: false,
  reasonKey,
});
export function validateStartDiploWork(
  state: Readonly<GameState>,
  cmd: CommandByType['startDiploWork'],
): ValidationResult {
  if (
    !state.clans[cmd.clanId]?.alive ||
    cmd.target === cmd.clanId ||
    (cmd.target !== 'court' && cmd.target !== 'shogunate' && !state.clans[cmd.target]?.alive) ||
    (cmd.target === 'shogunate' && !state.court.shogunateExists)
  )
    return reject();
  const officer = state.officers[cmd.executorId];
  if (
    !officer ||
    officer.status !== 'serving' ||
    !officer.hasComeOfAge ||
    officer.clanId !== cmd.clanId
  )
    return reject(REJECT_REASONS.notOwner);
  if (isOfficerBusy(state, officer.id)) return reject(REJECT_REASONS.officerBusy);
  const missions = state.diplomacy.missions.filter((mission) => mission.fromClanId === cmd.clanId);
  if (
    missions.length >= BAL.diplomacyWorkMaxConcurrent ||
    missions.some((mission) => mission.target === cmd.target)
  )
    return reject(REJECT_REASONS.alreadyActive);
  return { ok: true };
}
export function applyStartDiploWork(state: GameState, cmd: CommandByType['startDiploWork']): void {
  state.diplomacy.missions.push({
    fromClanId: cmd.clanId,
    target: cmd.target,
    officerId: cmd.executorId,
    startDay: state.time.day,
  });
}
export function validateStopDiploWork(
  state: Readonly<GameState>,
  cmd: CommandByType['stopDiploWork'],
): ValidationResult {
  return state.diplomacy.missions.some(
    (mission) => mission.fromClanId === cmd.clanId && mission.target === cmd.target,
  )
    ? { ok: true }
    : reject();
}
export function applyStopDiploWork(state: GameState, cmd: CommandByType['stopDiploWork']): void {
  state.diplomacy.missions = state.diplomacy.missions.filter(
    (mission) => mission.fromClanId !== cmd.clanId || mission.target !== cmd.target,
  );
}
export function pactTrustCost(kind: DiplomacyActionKind): number {
  return {
    proposeAlliance: BAL.trustCostAlliance,
    proposeCeasefire: BAL.trustCostCeasefire,
    proposeMarriage: BAL.trustCostMarriage,
    requestReinforce: BAL.trustCostReinforce,
    demandVassal: 0,
    offerVassal: 0,
  }[kind];
}
export function marriageCandidates(state: Readonly<GameState>, clanId: ClanId): OfficerId[] {
  return Object.values(state.officers)
    .filter(
      (officer) =>
        officer.clanId === clanId &&
        officer.status === 'serving' &&
        officer.kinship === 'kin' &&
        officer.spouseId === null &&
        state.time.year - officer.birthYear >= BAL.marriageMinAge &&
        state.time.year - officer.birthYear <= BAL.marriageMaxAge,
    )
    .sort((a, b) => b.birthYear - a.birthYear || a.id.localeCompare(b.id))
    .map((officer) => officer.id);
}
export function overlordOf(state: Readonly<GameState>, clanId: ClanId): ClanId | null {
  for (const row of Object.values(state.diplomacy.rows))
    if (row.a === clanId || row.b === clanId)
      if (
        row.pacts.some(
          (pact) =>
            pact.kind === 'vassal' &&
            pact.vassalClanId === clanId &&
            (pact.endDay === null || state.time.day <= pact.endDay),
        )
      )
        return row.a === clanId ? row.b : row.a;
  return null;
}
function canBecomeVassal(state: Readonly<GameState>, vassal: ClanId, overlord: ClanId): boolean {
  if (overlordOf(state, vassal) !== null) return false;
  const seen = new Set<ClanId>();
  let cursor: ClanId | null = overlord;
  while (cursor !== null) {
    if (cursor === vassal || seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = overlordOf(state, cursor);
  }
  return true;
}
/** Shared preconditions, rechecked at acceptance without the pending-proposal guard. */
export function validatePactTerms(
  state: Readonly<GameState>,
  from: ClanId,
  to: ClanId,
  kind: DiplomacyActionKind,
  against: ClanId | null,
): ValidationResult {
  if (from === to || !state.clans[from]?.alive || !state.clans[to]?.alive) return reject();
  if (getTrust(state, from, to) < pactTrustCost(kind)) return reject();
  const row = getDiplomacyRow(state, from, to);
  const friendly = hasPact(state, from, to, 'alliance') || hasPact(state, from, to, 'marriage');
  const vassal = hasPact(state, from, to, 'vassal');
  if (kind !== 'requestReinforce' && against !== null) return reject();
  switch (kind) {
    case 'proposeAlliance':
      if (isAtWar(state, from, to) || vassal || hasPact(state, from, to, 'alliance'))
        return reject();
      break;
    case 'proposeCeasefire':
      if (!isAtWar(state, from, to)) return reject();
      break;
    case 'proposeMarriage':
      if (
        !hasPact(state, from, to, 'alliance') ||
        vassal ||
        hasPact(state, from, to, 'marriage') ||
        marriageCandidates(state, from).length === 0 ||
        marriageCandidates(state, to).length === 0
      )
        return reject();
      if (state.clans[from].gold < BAL.goldCostMarriage)
        return reject(REJECT_REASONS.insufficientGold);
      break;
    case 'demandVassal':
      if (
        friendly ||
        vassal ||
        clanPower(state, from) / Math.max(1, clanPower(state, to)) < BAL.vassalDemandPowerRatio ||
        !canBecomeVassal(state, to, from)
      )
        return reject();
      break;
    case 'offerVassal':
      if (
        friendly ||
        vassal ||
        clanPower(state, to) / Math.max(1, clanPower(state, from)) < BAL.vassalOfferPowerRatio ||
        !canBecomeVassal(state, from, to)
      )
        return reject();
      break;
    case 'requestReinforce': {
      const last =
        row.a === from ? row.lastReinforceRequestDayAtoB : row.lastReinforceRequestDayBtoA;
      if (
        !friendly ||
        against === null ||
        against === from ||
        against === to ||
        !state.clans[against]?.alive ||
        (last !== null && state.time.day - last < BAL.reinforceCooldownMonths * DAYS_PER_MONTH) ||
        hasPact(state, from, against, 'alliance') ||
        hasPact(state, from, against, 'marriage') ||
        hasPact(state, from, against, 'ceasefire') ||
        hasPact(state, from, against, 'vassal') ||
        hasPact(state, to, against, 'alliance') ||
        hasPact(state, to, against, 'marriage') ||
        hasPact(state, to, against, 'ceasefire') ||
        hasPact(state, to, against, 'vassal')
      )
        return reject();
      break;
    }
  }
  return { ok: true };
}
export function validateProposePact(
  state: Readonly<GameState>,
  cmd: CommandByType['proposePact'],
): ValidationResult {
  const result = validatePactTerms(
    state,
    cmd.clanId,
    cmd.targetClanId,
    cmd.kind,
    cmd.reinforceAgainstClanId,
  );
  if (!result.ok) return result;
  const row = getDiplomacyRow(state, cmd.clanId, cmd.targetClanId);
  if (state.time.day < (row.refusalCooldownUntilDay[cmd.kind] ?? 0)) return reject();
  if (
    state.diplomacy.pendingProposals.some(
      (p) =>
        p.kind === cmd.kind &&
        ((p.fromClanId === cmd.clanId && p.toClanId === cmd.targetClanId) ||
          (p.toClanId === cmd.clanId && p.fromClanId === cmd.targetClanId)),
    )
  )
    return reject(REJECT_REASONS.alreadyActive);
  return { ok: true };
}
export function applyProposePact(
  state: GameState,
  cmd: CommandByType['proposePact'],
  emit: EmitFn,
): void {
  const proposal: DiplomacyProposal = {
    id: nextId(state, 'proposal'),
    kind: cmd.kind,
    fromClanId: cmd.clanId,
    toClanId: cmd.targetClanId,
    createdDay: state.time.day,
    expiresDay: state.time.day + BAL.dipProposalExpiryDays,
    marriageOfficerIds:
      cmd.kind === 'proposeMarriage'
        ? [
            marriageCandidates(state, cmd.clanId)[0]!,
            marriageCandidates(state, cmd.targetClanId)[0]!,
          ]
        : null,
    reinforceAgainstClanId: cmd.reinforceAgainstClanId,
  };
  state.diplomacy.pendingProposals.push(proposal);
  if (proposal.toClanId === state.meta.playerClanId)
    emit({
      type: 'diplo.envoyArrived',
      day: state.time.day,
      clanIds: [proposal.fromClanId, proposal.toClanId],
      fromClanId: proposal.fromClanId,
      proposalId: proposal.id,
      kind: proposal.kind,
    });
}
export function settleDiplomacyProposal(
  state: GameState,
  proposal: DiplomacyProposal,
  accept: boolean,
  emit: EmitFn,
): void {
  state.diplomacy.pendingProposals = state.diplomacy.pendingProposals.filter(
    (p) => p.id !== proposal.id,
  );
  const { fromClanId: from, toClanId: to, kind } = proposal;
  const row = ensureDiplomacyRow(state, from, to);
  const refused = () =>
    emit({
      type: 'diplo.refused',
      day: state.time.day,
      clanIds: [from, to],
      fromClanId: from,
      toClanId: to,
      kind,
    });
  if (!accept) {
    row.refusalCooldownUntilDay[kind] =
      state.time.day + BAL.dipRefusalCooldownMonths * DAYS_PER_MONTH;
    refused();
    return;
  }
  if (!validatePactTerms(state, from, to, kind, proposal.reinforceAgainstClanId).ok) {
    refused();
    return;
  }
  if (kind === 'proposeMarriage') {
    const ids = proposal.marriageOfficerIds;
    if (
      ids === null ||
      !marriageCandidates(state, from).includes(ids[0]) ||
      !marriageCandidates(state, to).includes(ids[1])
    ) {
      refused();
      return;
    }
    state.officers[ids[0]]!.spouseId = ids[1];
    state.officers[ids[1]]!.spouseId = ids[0];
    state.clans[from]!.gold -= BAL.goldCostMarriage;
  }
  adjustTrust(state, from, to, -pactTrustCost(kind));
  if (kind === 'requestReinforce') {
    if (row.a === from) row.lastReinforceRequestDayAtoB = state.time.day;
    else row.lastReinforceRequestDayBtoA = state.time.day;
    emit({
      type: 'diplo.reinforceAgreed',
      day: state.time.day,
      clanIds: [from, to],
      fromClanId: from,
      toClanId: to,
      againstClanId: proposal.reinforceAgainstClanId!,
    });
    return;
  }
  const pactKind: PactKind =
    kind === 'proposeAlliance'
      ? 'alliance'
      : kind === 'proposeCeasefire'
        ? 'ceasefire'
        : kind === 'proposeMarriage'
          ? 'marriage'
          : 'vassal';
  const endDay =
    pactKind === 'alliance'
      ? state.time.day + BAL.allianceMonths * DAYS_PER_MONTH
      : pactKind === 'ceasefire'
        ? state.time.day + BAL.ceasefireMonths * DAYS_PER_MONTH
        : null;
  if (pactKind === 'alliance') row.pacts = row.pacts.filter((p) => p.kind !== 'ceasefire');
  row.pacts.push({
    kind: pactKind,
    startDay: state.time.day,
    endDay,
    vassalClanId: pactKind === 'vassal' ? (kind === 'offerVassal' ? from : to) : null,
  });
  const sentiment =
    pactKind === 'alliance'
      ? BAL.sentimentPactSignedAlliance
      : pactKind === 'marriage'
        ? BAL.sentimentPactSignedMarriage
        : pactKind === 'ceasefire'
          ? BAL.sentimentPactSignedCeasefire
          : 0;
  adjustSentiment(state, from, to, sentiment);
  adjustSentiment(state, to, from, sentiment);
  emit({
    type: 'pact.signed',
    day: state.time.day,
    clanIds: [from, to],
    aClanId: row.a,
    bClanId: row.b,
    kind: pactKind,
    endDay,
  });
}
export function validateRespondPact(
  state: Readonly<GameState>,
  cmd: CommandByType['respondPact'],
): ValidationResult {
  const proposal = state.diplomacy.pendingProposals.find((p) => p.id === cmd.proposalId);
  return proposal?.toClanId === cmd.clanId &&
    state.time.day <= proposal.expiresDay &&
    state.clans[cmd.clanId]?.alive
    ? { ok: true }
    : reject();
}
export function applyRespondPact(
  state: GameState,
  cmd: CommandByType['respondPact'],
  emit: EmitFn,
): void {
  settleDiplomacyProposal(
    state,
    state.diplomacy.pendingProposals.find((p) => p.id === cmd.proposalId)!,
    cmd.accept,
    emit,
  );
}
export function validateBreakPact(
  state: Readonly<GameState>,
  cmd: CommandByType['breakPact'],
): ValidationResult {
  if (
    !state.clans[cmd.clanId]?.alive ||
    !state.clans[cmd.targetClanId]?.alive ||
    cmd.kind === 'ceasefire'
  )
    return reject();
  const pact = getDiplomacyRow(state, cmd.clanId, cmd.targetClanId).pacts.find(
    (p) => p.kind === cmd.kind && (p.endDay === null || state.time.day <= p.endDay),
  );
  return pact !== undefined &&
    (pact.kind !== 'marriage' ||
      state.time.day >= pact.startDay + BAL.marriageNoBreakMonths * DAYS_PER_MONTH)
    ? { ok: true }
    : reject();
}
export function applyBreakPact(
  state: GameState,
  cmd: CommandByType['breakPact'],
  emit: EmitFn,
): void {
  const row = ensureDiplomacyRow(state, cmd.clanId, cmd.targetClanId);
  row.pacts = row.pacts.filter((pact) => pact.kind !== cmd.kind);
  adjustTrust(state, cmd.clanId, cmd.targetClanId, -BAL.trustMax);
  adjustSentiment(state, cmd.targetClanId, cmd.clanId, BAL.sentimentBetrayalHit);
  state.clans[cmd.clanId]!.prestige = Math.max(
    0,
    state.clans[cmd.clanId]!.prestige - BAL.betrayalPrestigeHit,
  );
  for (const clan of Object.values(state.clans).sort((a, b) => a.id.localeCompare(b.id)))
    if (clan.alive && clan.id !== cmd.clanId && clan.id !== cmd.targetClanId)
      adjustSentiment(state, clan.id, cmd.clanId, BAL.betrayalGlobalSentimentHit);
  emit({
    type: 'pact.broken',
    day: state.time.day,
    clanIds: [row.a, row.b],
    aClanId: row.a,
    bClanId: row.b,
    kind: cmd.kind,
    breakerClanId: cmd.clanId,
  });
}
