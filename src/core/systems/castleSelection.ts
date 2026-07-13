import { buildMapGraph } from '../state/mapGraph';
import type { Castle, GameState } from '../state/gameState';
import type { CastleId, ClanId, MapNodeId } from '../state/ids';
import { computePath, type PathResult } from './pathfinding';

export interface CastlePathChoice {
  castle: Castle;
  path: PathResult;
}

function reachableOwnedCastles(
  state: Readonly<GameState>,
  clanId: ClanId,
  from: MapNodeId,
): CastlePathChoice[] {
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  return Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === clanId)
    .map((castle) => ({
      castle,
      path: computePath(state, graph, { clanId, from, to: castle.id, speedFactor: 1 }),
    }))
    .filter((choice) => choice.path.found);
}

/** Return/escape selection: shortest effective travel time, then castle id. */
export function nearestOwnedCastleByTravelTime(
  state: Readonly<GameState>,
  clanId: ClanId,
  from: MapNodeId,
  preferredCastleId?: CastleId,
): CastlePathChoice | undefined {
  return reachableOwnedCastles(state, clanId, from).sort((a, b) => {
    const aPreferred = a.castle.id === preferredCastleId ? 0 : 1;
    const bPreferred = b.castle.id === preferredCastleId ? 0 : 1;
    return (
      aPreferred - bPreferred ||
      a.path.totalDays - b.path.totalDays ||
      a.castle.id.localeCompare(b.castle.id)
    );
  })[0];
}

/** Routed retreat contract (07 §3.4): fewest hops, then castle id. */
export function nearestOwnedCastleByHops(
  state: Readonly<GameState>,
  clanId: ClanId,
  from: MapNodeId,
): CastlePathChoice | undefined {
  return reachableOwnedCastles(state, clanId, from).sort(
    (a, b) => a.path.nodes.length - b.path.nodes.length || a.castle.id.localeCompare(b.castle.id),
  )[0];
}
