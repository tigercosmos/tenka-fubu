import { BAL } from '../balance';
import type { EmitFn } from '../commands/registry';
import type { CourtRank, ShogunateTitle } from '../state/enums';
import type { DiplomacyActionKind, GameState, Officer } from '../state/gameState';
import type { ClanId } from '../state/ids';
import { getCourtMetadata } from '../../data/courtMetadata';
import { effectiveStat } from './officers';

export type CourtRankUnlock =
  | 'mediation'
  | 'policySlot'
  | 'trustGainBonus'
  | 'mediationDiscount'
  | 'vassalDemandBonus'
  | 'allianceBonus';

export function courtRankOrder(rank: CourtRank): number {
  return BAL.courtRankTable.find((def) => def.id === rank)?.rank ?? 0;
}

/** The hereditary shogun is not an appointable step in the title ladder. */
export function shogunateTitleOrder(title: ShogunateTitle): number | null {
  return title === 'shogun'
    ? null
    : (BAL.shogunateTitleTable.find((def) => def.id === title)?.order ?? 0);
}

export function courtUnlocks(rank: CourtRank): readonly CourtRankUnlock[] {
  return BAL.courtRankTable
    .filter((def) => def.rank <= courtRankOrder(rank))
    .flatMap((def) => (def.unlock === null ? [] : [def.unlock]));
}

function titleEffects(state: Readonly<GameState>, clanId: ClanId) {
  const title = state.clans[clanId]?.shogunateTitle;
  const order = title === undefined ? 0 : shogunateTitleOrder(title);
  return state.court.shogunateExists && order !== null
    ? BAL.shogunateTitleTable.filter((def) => def.order <= order).map((def) => def.effect)
    : [];
}

export function extraPolicySlots(state: Readonly<GameState>, clanId: ClanId): number {
  const rank = state.clans[clanId]?.courtRank ?? 'none';
  return (
    courtUnlocks(rank).filter((unlock) => unlock === 'policySlot').length +
    titleEffects(state, clanId).filter((effect) => effect === 'policySlot').length
  );
}

export function workCostMultiplier(state: Readonly<GameState>, clanId: ClanId): number {
  return titleEffects(state, clanId).includes('workCostDiscount') ? BAL.shogunateWorkCostMult : 1;
}

export function courtAcceptanceBonus(
  state: Readonly<GameState>,
  clanId: ClanId,
  kind: DiplomacyActionKind,
): number {
  const unlocks = courtUnlocks(state.clans[clanId]?.courtRank ?? 'none');
  const effects = titleEffects(state, clanId);
  let bonus = effects.includes('acceptanceAura') ? BAL.shogunateAcceptanceAura : 0;
  if (kind === 'demandVassal') {
    if (unlocks.includes('vassalDemandBonus')) bonus += BAL.courtVassalDemandBonus;
    if (effects.includes('vassalDemandBonus')) bonus += BAL.shogunateVassalDemandBonus;
  }
  if (kind === 'proposeAlliance' && unlocks.includes('allianceBonus'))
    bonus += BAL.courtAllianceBonus;
  return bonus;
}

export function courtFavorGainMonthly(officer: Officer, target: 'court' | 'shogunate'): number {
  return target === 'court'
    ? BAL.courtFavorGainBase + effectiveStat(officer, 'pol') / BAL.courtFavorGainPolDivisor
    : BAL.shogunateFavorGainBase + effectiveStat(officer, 'pol') / BAL.shogunateFavorGainPolDivisor;
}

export function controlsCourtCapital(state: Readonly<GameState>, clanId: ClanId): boolean {
  const metadata = getCourtMetadata(state.meta.scenarioId);
  return metadata !== null && state.castles[metadata.capitalCastleId]?.ownerClanId === clanId;
}

/** Called after mission settlement and plots, once per living clan each month. */
export function courtMonthlyForClan(state: GameState, clanId: ClanId, emit: EmitFn): void {
  const clan = state.clans[clanId];
  if (!clan?.alive) return;
  const hasMission = (target: 'court' | 'shogunate') =>
    state.diplomacy.missions.some(
      (mission) => mission.fromClanId === clanId && mission.target === target,
    );
  if (!hasMission('court'))
    state.court.courtFavor[clanId] = Math.max(
      0,
      (state.court.courtFavor[clanId] ?? 0) - BAL.courtFavorDecayMonthly,
    );
  if (!state.court.shogunateExists) return; // Frozen favor survives the fall of the shogunate.
  if (!hasMission('shogunate'))
    state.court.shogunateFavor[clanId] = Math.max(
      0,
      (state.court.shogunateFavor[clanId] ?? 0) - BAL.shogunateFavorDecayMonthly,
    );
  if (state.court.patronClanId !== clanId) return;
  if (!controlsCourtCapital(state, clanId)) {
    state.court.patronClanId = null;
    emit({ type: 'shogunate.patronLost', day: state.time.day, clanIds: [clanId], clanId });
  } else clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + BAL.shogunPatronMonthlyPrestige);
}

export function collapseShogunate(state: GameState, emit: EmitFn): void {
  if (!state.court.shogunateExists) return;
  state.court.shogunateExists = false;
  state.court.shogunClanId = null;
  state.court.patronClanId = null;
  for (const clan of Object.values(state.clans).sort((a, b) => a.id.localeCompare(b.id))) {
    const order = shogunateTitleOrder(clan.shogunateTitle);
    const refund =
      order === null
        ? 0
        : BAL.shogunateTitleTable
            .filter((def) => def.order <= order)
            .reduce((sum, def) => sum + def.prestigeBonus, 0);
    clan.prestige = Math.max(0, clan.prestige - refund);
    clan.shogunateTitle = 'none';
  }
  const stopped = state.diplomacy.missions
    .filter((mission) => mission.target === 'shogunate')
    .sort(
      (a, b) => a.fromClanId.localeCompare(b.fromClanId) || a.officerId.localeCompare(b.officerId),
    );
  state.diplomacy.missions = state.diplomacy.missions.filter(
    (mission) => mission.target !== 'shogunate',
  );
  for (const mission of stopped)
    emit({
      type: 'diplo.workStopped',
      day: state.time.day,
      clanIds: [mission.fromClanId],
      clanId: mission.fromClanId,
      target: mission.target,
    });
  emit({ type: 'shogunate.collapsed', day: state.time.day, clanIds: [] });
}
