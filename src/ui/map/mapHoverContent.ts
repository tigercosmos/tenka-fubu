import type { GameState } from '@core/state/gameState';
import type { ArmyId, CastleId, DistrictId } from '@core/state/ids';
import { armyFoodDays } from '@core/armyFood';
import { t } from '@i18n/zh-TW';

export interface MapHoverTarget {
  game: Readonly<GameState>;
  kind: 'castle' | 'district' | 'army';
  id: string;
  screenX: number;
  screenY: number;
}

/** Public current facts only; no queued intents or simulation changes. */
export function mapHoverLines(
  game: Readonly<GameState>,
  kind: MapHoverTarget['kind'],
  id: string,
): readonly string[] | null {
  if (kind === 'castle') {
    const c = game.castles[id as CastleId];
    return c === undefined
      ? null
      : [
          t('ui.map.tooltip.castle', {
            name: c.name,
            clan: game.clans[c.ownerClanId]?.name ?? c.ownerClanId,
            soldiers: Math.floor(c.soldiers),
            food: Math.floor(c.food),
            durability: Math.floor(c.durability),
          }),
        ];
  }
  if (kind === 'district') {
    const d = game.districts[id as DistrictId];
    if (d === undefined) return null;
    const lines = [
      t('ui.map.tooltip.district', {
        name: d.name,
        clan: game.clans[d.ownerClanId]?.name ?? d.ownerClanId,
        kokudaka: Math.floor(d.kokudaka),
        security: d.publicOrder,
      }),
    ];
    if (d.stewardId !== null)
      lines.push(
        t('ui.map.tooltip.districtSteward', {
          steward: game.officers[d.stewardId]?.name ?? d.stewardId,
        }),
      );
    return lines;
  }
  const a = game.armies[id as ArmyId];
  if (a === undefined) return null;
  return [
    t('ui.map.tooltip.army', {
      leader: game.officers[a.leaderId]?.name ?? a.leaderId,
      clan: game.clans[a.clanId]?.name ?? a.clanId,
      soldiers: a.soldiers,
      morale: a.morale,
    }),
    t('ui.map.tooltip.armyFood', {
      days: a.soldiers > 0 ? Math.floor(armyFoodDays(game, a)) : 0,
    }),
  ];
}
