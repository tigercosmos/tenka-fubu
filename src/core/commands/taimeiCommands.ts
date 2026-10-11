import { BAL } from '../balance';
import { castleFoodCap, castleMaxSoldiers } from '../domestic';
import type { District, GameState } from '../state/gameState';
import type { CmdInvokeTaimei, ValidationResult } from './types';
import type { EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import { availableTaimei } from '../systems/events/taimei';
import { getTaimeiDef } from '../systems/events/taimeiCatalog';

export function validateInvokeTaimei(
  state: Readonly<GameState>,
  cmd: CmdInvokeTaimei,
): ValidationResult {
  const clan = state.clans[cmd.clanId],
    def = getTaimeiDef(cmd.taimeiId);
  if (!clan?.alive || !def) return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (!availableTaimei(clan).some((candidate) => candidate.id === def.id))
    return { ok: false, reasonKey: REJECT_REASONS.taimeiLocked };
  if (clan.taimei.activeTaimeiId !== null)
    return { ok: false, reasonKey: REJECT_REASONS.taimeiBusy };
  if (state.time.day < clan.taimei.cooldownUntilDay)
    return {
      ok: false,
      reasonKey: REJECT_REASONS.taimeiCooldown,
      params: { days: clan.taimei.cooldownUntilDay - state.time.day },
    };
  if (clan.prestige < def.prestigeCost)
    return {
      ok: false,
      reasonKey: REJECT_REASONS.prestigeShort,
      params: { cost: def.prestigeCost },
    };
  if (clan.gold < def.goldCost)
    return {
      ok: false,
      reasonKey: REJECT_REASONS.insufficientGold,
      params: { cost: def.goldCost },
    };
  return { ok: true };
}

/** Exact floor quotas followed by ID-order remainder; input order is already canonical. */
function apportioned(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const allocations = weights.map((weight) => Math.floor((total * weight) / sum));
  let remainder = total - allocations.reduce((a, b) => a + b, 0);
  for (let i = 0; i < allocations.length && remainder > 0; i++) {
    if ((weights[i] ?? 0) > 0) {
      allocations[i]! += 1;
      remainder -= 1;
    }
  }
  return allocations;
}
export function applyInvokeTaimei(state: GameState, cmd: CmdInvokeTaimei, emit: EmitFn): void {
  const clan = state.clans[cmd.clanId]!,
    def = getTaimeiDef(cmd.taimeiId)!;
  clan.prestige -= def.prestigeCost;
  clan.gold -= def.goldCost;
  clan.taimei.activeTaimeiId = def.id;
  clan.taimei.activeUntilDay = state.time.day + def.durationDays;
  clan.taimei.cooldownUntilDay = clan.taimei.activeUntilDay + BAL.taimeiCooldownDays;
  const castles = Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === clan.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (def.id === 'taimei.sokuji-chohei') {
    for (const castle of castles) {
      const districts = castle.districtIds
        .map((id) => state.districts[id])
        .filter(
          (district): district is District =>
            district !== undefined && district.ownerClanId === clan.id,
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const pool = districts.reduce((sum, district) => sum + district.population, 0);
      const gain = Math.round(
        Math.min(
          castleMaxSoldiers(state, castle) - castle.soldiers,
          Math.floor(pool * BAL.taimeiSokujiPopRatio),
        ),
      );
      if (gain <= 0) continue;
      castle.soldiers += gain;
      const losses = apportioned(
        gain,
        districts.map((district) => district.population),
      );
      for (const [index, district] of districts.entries()) district.population -= losses[index]!;
    }
  } else if (def.id === 'taimei.kenkin-meneki') {
    const caps = castles.map((castle) => Math.max(0, castleFoodCap(castle) - castle.food));
    const total = Math.min(
      caps.reduce((a, b) => a + b, 0),
      BAL.taimeiKenkinGold * BAL.taimeiKenkinFoodPerGold,
    );
    const gains = apportioned(total, caps);
    for (const [index, castle] of castles.entries()) castle.food += gains[index]!;
  }
  emit({
    type: 'taimei.invoked',
    day: state.time.day,
    clanIds: [clan.id],
    clanId: clan.id,
    taimeiId: def.id,
  });
}
