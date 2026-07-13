import { BAL } from '../balance';
import { buildMapGraph } from '../state/mapGraph';
import type { Castle, GameState } from '../state/gameState';
import type { CastleId, ClanId, MapNodeId, RoadEdgeId } from '../state/ids';
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
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  if (!graph.nodes.has(from)) return undefined;

  const distance = new Map<MapNodeId, number>([[from, 0]]);
  const parentNode = new Map<MapNodeId, MapNodeId>();
  const parentEdge = new Map<MapNodeId, RoadEdgeId>();
  const queue: MapNodeId[] = [from];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const neighbors = (graph.adjacency.get(current) ?? [])
      .map((edgeId) => {
        const edge = graph.edges.get(edgeId)!;
        return { edgeId, nodeId: edge.a === current ? edge.b : edge.a };
      })
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.edgeId.localeCompare(b.edgeId));
    for (const neighbor of neighbors) {
      if (distance.has(neighbor.nodeId)) continue;
      distance.set(neighbor.nodeId, distance.get(current)! + 1);
      parentNode.set(neighbor.nodeId, current);
      parentEdge.set(neighbor.nodeId, neighbor.edgeId);
      queue.push(neighbor.nodeId);
    }
  }

  const castle = Object.values(state.castles)
    .filter((candidate) => candidate.ownerClanId === clanId && distance.has(candidate.id))
    .sort((a, b) => distance.get(a.id)! - distance.get(b.id)! || a.id.localeCompare(b.id))[0];
  if (!castle) return undefined;

  const nodes: MapNodeId[] = [castle.id];
  const edgeIds: RoadEdgeId[] = [];
  while (nodes[0] !== from) {
    const nodeId = nodes[0]!;
    const previous = parentNode.get(nodeId);
    const edgeId = parentEdge.get(nodeId);
    if (previous === undefined || edgeId === undefined) return undefined;
    nodes.unshift(previous);
    edgeIds.unshift(edgeId);
  }

  let travelDays = 0;
  let previousKind: 'land' | 'sea' = 'land';
  const steps: PathResult['steps'] = [{ nodeId: from, etaDays: 0, needsSubjugate: false }];
  for (let index = 0; index < edgeIds.length; index += 1) {
    const edge = graph.edges.get(edgeIds[index]!)!;
    const edgeDays =
      edge.type === 'sea'
        ? edge.baseDays + (previousKind === 'land' ? BAL.seaEmbarkDays : 0)
        : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
    travelDays += edgeDays;
    previousKind = edge.type;
    steps.push({ nodeId: nodes[index + 1]!, etaDays: travelDays, needsSubjugate: false });
  }

  return {
    castle,
    path: {
      found: true,
      nodes,
      edgeIds,
      travelDays,
      subjugateDays: 0,
      totalDays: Math.round(travelDays * 2) / 2,
      steps,
    },
  };
}
