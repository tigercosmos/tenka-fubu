import { BAL } from '../../balance';
import { castleFoodCap } from '../../domestic';
import type { EmitFn } from '../../commands/registry';
import type { Clan, GameState } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import { courtRankOrder } from '../court';
import { TAIMEI_CATALOG, type TaimeiDef } from './taimeiCatalog';

export interface TaimeiEffects {
  conscriptMaxMult: number;
  conscriptCostMult: number;
  trustGainMult: number;
  commerceGrowthMult: number;
  siegeDamageTakenMult: number;
  castleDefenseMult: number;
  marchSpeedMult: number;
  buildStepPerDay: number;
}
export const TAIMEI_NEUTRAL: Readonly<TaimeiEffects> = Object.freeze({
  conscriptMaxMult: 1,
  conscriptCostMult: 1,
  trustGainMult: 1,
  commerceGrowthMult: 1,
  siegeDamageTakenMult: 1,
  castleDefenseMult: 1,
  marchSpeedMult: 1,
  buildStepPerDay: 1,
});
const EFFECTS: Readonly<Record<string, Readonly<TaimeiEffects>>> = Object.freeze({
  'taimei.sodoin': Object.freeze({
    ...TAIMEI_NEUTRAL,
    conscriptMaxMult: 1 + BAL.taimeiSodoinMaxBonus,
    conscriptCostMult: BAL.taimeiSodoinCostMult,
  }),
  'taimei.gaiko-kosei': Object.freeze({
    ...TAIMEI_NEUTRAL,
    trustGainMult: BAL.taimeiGaikoTrustMult,
  }),
  'taimei.rakuichi-shinko': Object.freeze({
    ...TAIMEI_NEUTRAL,
    commerceGrowthMult: BAL.taimeiRakuichiCommerceMult,
  }),
  'taimei.teppeki': Object.freeze({
    ...TAIMEI_NEUTRAL,
    siegeDamageTakenMult: 1 - BAL.taimeiTeppekiReduce,
    castleDefenseMult: BAL.taimeiTeppekiDefMult,
  }),
  'taimei.shippu-jinrai': Object.freeze({
    ...TAIMEI_NEUTRAL,
    marchSpeedMult: 1 + BAL.taimeiShippuSpeedBonus,
  }),
  'taimei.tenka-bushin': Object.freeze({
    ...TAIMEI_NEUTRAL,
    buildStepPerDay: BAL.taimeiBushinStep,
  }),
});
export function taimeiEffects(state: Readonly<GameState>, clanId: ClanId): Readonly<TaimeiEffects> {
  const clan = state.clans[clanId];
  return !clan?.alive ||
    clan.taimei.activeTaimeiId === null ||
    state.time.day > clan.taimei.activeUntilDay
    ? TAIMEI_NEUTRAL
    : Object.hasOwn(EFFECTS, clan.taimei.activeTaimeiId)
      ? EFFECTS[clan.taimei.activeTaimeiId]!
      : TAIMEI_NEUTRAL;
}
export function effectiveTaimeiPrestige(clan: Readonly<Clan>): number {
  return (
    clan.prestige +
    courtRankOrder(clan.courtRank) * BAL.taimeiRankDiscountPerStep +
    (['kanrei', 'fukushogun', 'shogun'].includes(clan.shogunateTitle)
      ? BAL.taimeiShogunateDiscount
      : 0)
  );
}
export function availableTaimei(clan: Readonly<Clan>): readonly Readonly<TaimeiDef>[] {
  return clan.alive
    ? TAIMEI_CATALOG.filter((def) => effectiveTaimeiPrestige(clan) >= def.unlockPrestige)
    : [];
}
export function previewTaimeiFoodGain(state: Readonly<GameState>, clanId: ClanId): number {
  if (!state.clans[clanId]?.alive) return 0;
  const capacity = Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === clanId)
    .reduce((sum, castle) => sum + Math.max(0, castleFoodCap(castle) - castle.food), 0);
  return Math.min(capacity, BAL.taimeiKenkinGold * BAL.taimeiKenkinFoodPerGold);
}
export function expireTaimei(state: GameState, emit: EmitFn): void {
  for (const clan of Object.values(state.clans).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (
      clan.alive &&
      clan.taimei.activeTaimeiId !== null &&
      state.time.day > clan.taimei.activeUntilDay
    ) {
      emit({
        type: 'taimei.expired',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
        taimeiId: clan.taimei.activeTaimeiId,
      });
      clan.taimei.activeTaimeiId = null;
      clan.taimei.activeUntilDay = 0;
    }
  }
}
