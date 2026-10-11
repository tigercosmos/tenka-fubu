import { BAL } from '@core/balance';
import { canControlCastle } from '@core/commands/authority';
import { RANK_VALUES } from '@core/state/enums';
import type { GameState } from '@core/state/gameState';
import type { CastleId, OfficerId } from '@core/state/ids';
import { isOfficerBusy } from '@core/index';
import type { MarchDraft } from '../hooks/uiStore';

export function marchOfficerEligible(
  game: Readonly<GameState>,
  castleId: CastleId,
  officerId: OfficerId,
): boolean {
  const officer = game.officers[officerId];
  return (
    officer?.status === 'serving' &&
    officer.hasComeOfAge &&
    officer.clanId === game.meta.playerClanId &&
    officer.locationCastleId === castleId &&
    !isOfficerBusy(game, officerId)
  );
}

function snap(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value / 100) * 100));
}

export function marchLeaderDefaults(
  game: Readonly<GameState>,
  castleId: CastleId,
  leaderId: OfficerId,
): Pick<MarchDraft, 'soldiers' | 'food'> {
  const castle = game.castles[castleId];
  const leader = game.officers[leaderId];
  if (!castle || !leader || !marchOfficerEligible(game, castleId, leaderId))
    return { soldiers: 0, food: 0 };
  const rankIndex =
    game.clans[game.meta.playerClanId]?.leaderId === leaderId
      ? RANK_VALUES.length - 1
      : RANK_VALUES.indexOf(leader.rank);
  const max = Math.min(castle.soldiers, BAL.rankTroopCap[rankIndex] ?? 0);
  const soldiers = snap(max, max);
  return {
    soldiers,
    food: snap(
      soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays,
      Math.min(castle.food, soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
    ),
  };
}

export function createMarchDraft(
  game: Readonly<GameState>,
  castleId: CastleId,
  selectedOfficerIds: readonly OfficerId[] = [],
): MarchDraft | null {
  const castle = game.castles[castleId];
  if (!castle || castle.ownerClanId !== game.meta.playerClanId || !canControlCastle(game, castle))
    return null;
  if (
    selectedOfficerIds.length > 1 + BAL.maxDeputies ||
    new Set(selectedOfficerIds).size !== selectedOfficerIds.length ||
    selectedOfficerIds.some((id) => !marchOfficerEligible(game, castleId, id))
  )
    return null;
  const ids = [...selectedOfficerIds];
  const leader = ids[0] ?? null;
  return {
    originCastleId: castleId,
    leaderOfficerId: leader,
    subOfficerIds: ids.slice(1),
    ...(leader === null ? { soldiers: 0, food: 0 } : marchLeaderDefaults(game, castleId, leader)),
    targetNodeId: null,
    previewPath: null,
    previewDays: null,
    phase: 'compose',
    errorKey: null,
  };
}
