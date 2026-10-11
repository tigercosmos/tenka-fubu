import { BAL } from '../balance';
import type { GameState } from '../state/gameState';
import type { CastleId, CorpsId } from '../state/ids';

/** Integer accounting preserves every unit of income; the clan receives the tithe. */
export function splitCorpsIncome(gross: number): { corpsGold: number; clanGold: number } {
  const income = Math.max(0, Math.floor(gross));
  const clanGold = Math.floor(income * BAL.corpsTithe);
  return { corpsGold: income - clanGold, clanGold };
}

export function corpsCastleIds(state: Readonly<GameState>, corpsId: CorpsId): CastleId[] {
  return Object.values(state.castles)
    .filter((castle) => castle.corpsId === corpsId)
    .map((castle) => castle.id)
    .sort();
}

/** Also used by capture/death cleanup; refund once and clear every persistent snapshot. */
export function dissolveCorps(state: GameState, corpsId: CorpsId): void {
  const corps = state.corps[corpsId];
  if (!corps) return;
  const clan = state.clans[corps.clanId];
  if (clan) clan.gold += corps.gold;
  for (const castle of Object.values(state.castles)) {
    if (castle.corpsId !== corpsId) continue;
    castle.corpsId = null;
    if (castle.ownerClanId === corps.clanId) castle.directControl = true;
  }
  for (const army of Object.values(state.armies)) {
    if (army.corpsId === corpsId) army.corpsId = null;
  }
  const ai = state.ai.clans[corps.clanId];
  if (ai) ai.attackPlans = ai.attackPlans.filter((plan) => plan.ownerCorpsId !== corpsId);
  delete state.corps[corpsId];
}

export function removeCastleFromCorps(state: GameState, castleId: CastleId): void {
  const castle = state.castles[castleId];
  if (!castle || castle.corpsId === null) return;
  const corpsId = castle.corpsId;
  castle.corpsId = null;
  castle.directControl = true;
  for (const army of Object.values(state.armies)) {
    if (army.corpsId === corpsId && army.originCastleId === castleId) army.corpsId = null;
  }
  if (corpsCastleIds(state, corpsId).length === 0) dissolveCorps(state, corpsId);
}
