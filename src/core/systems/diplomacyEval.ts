import { BAL } from '../balance';
import type { DiplomacyActionKind, GameState } from '../state/gameState';
import type { ClanId } from '../state/ids';
import { pairKey } from '../state/serialize';
import { courtAcceptanceBonus } from './court';
import {
  buildAdjacency,
  getDiplomacyRow,
  getSentiment,
  getTrust,
  hasPact,
  isAtWar,
} from './diplomacyCommon';
import { DAYS_PER_MONTH } from './time';

export function clanPower(state: Readonly<GameState>, clanId: ClanId): number {
  return (
    Object.values(state.districts)
      .filter((d) => d.ownerClanId === clanId)
      .reduce((sum, d) => sum + d.kokudaka * BAL.powerKokudakaWeight, 0) +
    Object.values(state.castles)
      .filter((c) => c.ownerClanId === clanId)
      .reduce((sum, c) => sum + c.soldiers * BAL.powerTroopsWeight, 0) +
    (state.clans[clanId]?.prestige ?? 0) * BAL.powerPrestigeWeight
  );
}
export function hasCommonEnemy(state: Readonly<GameState>, a: ClanId, b: ClanId): boolean {
  return Object.values(state.clans).some(
    (clan) =>
      clan.alive &&
      clan.id !== a &&
      clan.id !== b &&
      isAtWar(state, a, clan.id) &&
      isAtWar(state, b, clan.id),
  );
}
export function reinforcementAidScore(
  state: Readonly<GameState>,
  from: ClanId,
  to: ClanId,
): number {
  const ai = state.ai.clans[to];
  const persona = ai === undefined ? undefined : state.ai.personas[ai.personaId];
  if (!persona) return 0;
  const factor = hasPact(state, from, to, 'marriage') ? BAL.aiAidMarriageFactor : 1;
  const safety = Math.max(
    0,
    Math.min(1, BAL.aiAidSafetyBase - (ai?.threatCache?.totalThreat ?? 0) / BAL.aiAidThreatDivisor),
  );
  return (persona.loyalty / 100) * factor * safety;
}
/** Pure: no row materialization, random draws, or cache writes. */
export function evaluateProposal(
  state: Readonly<GameState>,
  from: ClanId,
  to: ClanId,
  kind: DiplomacyActionKind,
): number {
  if (!state.clans[from]?.alive || !state.clans[to]?.alive || from === to)
    return BAL.dipRejectedScore;
  if (kind === 'requestReinforce')
    return reinforcementAidScore(state, from, to) >= BAL.aiAidScoreMin
      ? BAL.dipAcceptThreshold
      : BAL.dipRejectedScore;
  const p = clanPower(state, from) / Math.max(1, clanPower(state, to));
  const base = {
    proposeAlliance: BAL.dipBaseAlliance,
    proposeCeasefire: BAL.dipBaseCeasefire,
    proposeMarriage: BAL.dipBaseMarriage,
    demandVassal: BAL.dipBaseVassalDemand,
    offerVassal: BAL.dipBaseVassalOffer,
  }[kind];
  if (kind === 'offerVassal' && getSentiment(state, to, from) < BAL.dipVassalOfferMinSentiment)
    return BAL.dipRejectedScore;
  let special = 0;
  if (kind === 'proposeAlliance') {
    if (hasCommonEnemy(state, from, to)) special += BAL.dipCommonEnemyBonus;
    const adjacency = buildAdjacency(state);
    if (
      Object.values(state.clans).some(
        (clan) =>
          clan.alive &&
          clan.id !== from &&
          clan.id !== to &&
          adjacency.has(pairKey(from, clan.id)) &&
          adjacency.has(pairKey(to, clan.id)) &&
          clanPower(state, clan.id) >
            Math.max(clanPower(state, from), clanPower(state, to)) * BAL.dipCommonThreatPowerRatio,
      )
    )
      special += BAL.dipCommonThreatBonus;
  } else if (kind === 'proposeCeasefire') {
    const targetRatio = clanPower(state, to) / Math.max(1, clanPower(state, from));
    if (targetRatio >= BAL.ceasefireWinningRatio) special += BAL.ceasefireWinningPenalty;
    if (targetRatio <= BAL.ceasefireLosingRatio) special += BAL.ceasefireLosingBonus;
  } else if (kind === 'proposeMarriage') {
    const alliance = getDiplomacyRow(state, from, to).pacts.find(
      (pact) => pact.kind === 'alliance' && (pact.endDay === null || state.time.day <= pact.endDay),
    );
    if (
      alliance?.endDay != null &&
      alliance.endDay - state.time.day < BAL.dipMarriageRenewMonths * DAYS_PER_MONTH
    )
      special += BAL.dipMarriageRenewBonus;
  } else if (kind === 'demandVassal') {
    if (
      Object.values(state.sieges).some((siege) => siege.castleId === state.clans[to]?.homeCastleId)
    )
      special += BAL.dipVassalSiegeBonus;
  }
  return (
    base +
    getSentiment(state, to, from) * BAL.dipSentimentWeight +
    getTrust(state, from, to) * BAL.dipTrustWeight +
    (kind === 'demandVassal'
      ? (p - BAL.vassalDemandPowerRatio) * BAL.dipVassalDemandPowerScale
      : Math.max(
          -BAL.dipPowerTermClamp,
          Math.min(BAL.dipPowerTermClamp, (p - 1) * BAL.dipPowerTermScale),
        )) +
    special +
    courtAcceptanceBonus(state, from, kind)
  );
}
