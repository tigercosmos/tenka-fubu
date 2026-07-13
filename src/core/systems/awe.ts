import { BAL } from '../balance';
import { buildMapGraph } from '../state/mapGraph';
import type { AweLevel } from '../state/enums';
import type { GameState } from '../state/gameState';
import type { ClanId, MapNodeId } from '../state/ids';
import type { GameEvent } from '../state/events';

export function applyAwe(
  state: GameState,
  level: Exclude<AweLevel, 'none'>,
  centerNodeId: MapNodeId,
  winnerClanId: ClanId,
  loserClanId: ClanId,
  sourceBattleId: string,
): GameEvent[] {
  const range =
    level === 'small'
      ? BAL.aweRangeSmall
      : level === 'medium'
        ? BAL.aweRangeMed
        : BAL.aweRangeLarge;
  const prestige =
    level === 'small'
      ? BAL.awePrestigeSmall
      : level === 'medium'
        ? BAL.awePrestigeMed
        : BAL.awePrestigeLarge;
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  const distances = new Map<MapNodeId, number>([[centerNodeId, 0]]);
  const queue: MapNodeId[] = [centerNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const distance = distances.get(current)!;
    if (distance >= range) continue;
    for (const edgeId of graph.adjacency.get(current) ?? []) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      const other = edge.a === current ? edge.b : edge.a;
      if (!distances.has(other)) {
        distances.set(other, distance + 1);
        queue.push(other);
      }
    }
  }
  const flippedDistrictIds = [];
  const affectedCastleIds = [];
  for (const nodeId of [...distances.keys()].sort()) {
    const district = state.districts[nodeId as keyof typeof state.districts];
    if (district?.ownerClanId === loserClanId) {
      district.ownerClanId = winnerClanId;
      district.stewardId = null;
      district.subjugation = null;
      flippedDistrictIds.push(district.id);
      state.meta.territoryChangedToday = true;
      for (const army of Object.values(state.armies)) {
        if (army.posNodeId !== district.id || army.status !== 'subjugating') continue;
        army.status = army.pathCursor < army.path.length - 1 ? 'marching' : 'holding';
      }
    }
    const castle = state.castles[nodeId as keyof typeof state.castles];
    if (castle?.ownerClanId === loserClanId) {
      castle.morale = Math.max(0, castle.morale - BAL.aweCastleMoraleHit);
      castle.durability = Math.max(
        1,
        Math.floor(castle.durability - castle.maxDurability * BAL.aweCastleDurabilityRatio),
      );
      affectedCastleIds.push(castle.id);
    }
  }
  const clan = state.clans[winnerClanId];
  if (clan) clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + prestige);
  return [
    {
      type: 'awe.triggered',
      day: state.time.day,
      clanIds: [winnerClanId, loserClanId],
      sourceBattleId,
      clanId: winnerClanId,
      level,
      flippedDistrictIds,
      affectedCastleIds,
    },
  ];
}
