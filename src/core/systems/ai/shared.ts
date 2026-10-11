import { BAL } from '../../balance';
import { getEffectiveOfficerStat } from '../../battleStats';
import type { CmdMarch } from '../../commands/types';
import type { ExecutionAuthority } from '../../commands/authority';
import type { Army, Castle, GameState, Officer } from '../../state/gameState';
import type { ClanId, MapNodeId } from '../../state/ids';
import { buildMapGraph, type MapGraph } from '../../state/mapGraph';
import { RANK_VALUES } from '../../state/enums';
import { isOfficerBusy } from '../diplomacyCommon';
import { computePath } from '../pathfinding';
import type { AiScope } from './types';

// Topology is immutable within a game. Weak keys permit old games/shadows to be collected.
const graphCache = new WeakMap<GameState['roads'], MapGraph>();
const distanceCache = new WeakMap<GameState, Map<string, { day: number; days: number }>>();
function distanceKey(from: MapNodeId, to: MapNodeId, clanId: ClanId): string {
  return `${clanId}|${from}|${to}`;
}
export function invalidateTravelCache(state: GameState): void {
  distanceCache.delete(state);
}
/** Never searches: reactive code can distinguish an absent estimate from unreachable Infinity. */
export function cachedTravelDays(
  state: GameState,
  from: MapNodeId,
  to: MapNodeId,
  clanId: ClanId,
): number | null {
  const entry = distanceCache.get(state)?.get(distanceKey(from, to, clanId));
  return entry && state.time.day - entry.day <= BAL.aiThreatCacheDays ? entry.days : null;
}
function graphOf(state: GameState): MapGraph {
  let graph = graphCache.get(state.roads);
  if (!graph) {
    graph = buildMapGraph(state.castles, state.districts, state.roads);
    graphCache.set(state.roads, graph);
  }
  return graph;
}

/** Deliberately the cheap council estimate, not the battle damage formula (09 §3.4). */
export function estCastlePower(
  state: GameState,
  castle: Castle,
  soldiers = castle.soldiers,
): number {
  const lord = castle.lordId === null ? undefined : state.officers[castle.lordId];
  const ldr = lord ? getEffectiveOfficerStat(lord, 'ldr') : 0;
  return soldiers * (1 + ldr / BAL.aiPowerLdrDivisor) * (castle.morale / 100);
}
export function estArmyPower(state: GameState, army: Army): number {
  const leader = state.officers[army.leaderId];
  const ldr = leader ? getEffectiveOfficerStat(leader, 'ldr') : 0;
  return army.soldiers * (1 + ldr / BAL.aiPowerLdrDivisor) * (army.morale / 100);
}
export function scopeAuthority(scope: AiScope): ExecutionAuthority {
  return scope.corpsId === null
    ? { kind: 'clan', clanId: scope.clanId }
    : { kind: 'corps', clanId: scope.clanId, corpsId: scope.corpsId };
}
export function travelDays(
  state: GameState,
  from: MapNodeId,
  to: MapNodeId,
  clanId: ClanId,
): number {
  const cached = cachedTravelDays(state, from, to, clanId);
  if (cached !== null) return cached;
  const result = computePath(state, graphOf(state), { clanId, from, to, speedFactor: 1 });
  const days = result.found ? result.totalDays : Infinity;
  const cache = distanceCache.get(state) ?? new Map<string, { day: number; days: number }>();
  cache.set(distanceKey(from, to, clanId), { day: state.time.day, days });
  distanceCache.set(state, cache);
  return days;
}
/** Local event checks explore only the travel-budget neighbourhood, then reuse canonical routing. */
export function boundedTravelDays(
  state: GameState,
  from: MapNodeId,
  to: MapNodeId,
  clanId: ClanId,
  maxDays: number,
): number {
  const graph = graphOf(state);
  const distance = new Map<MapNodeId, number>([[from, 0]]),
    visited = new Set<MapNodeId>();
  for (;;) {
    const current = [...distance]
      .filter(([id, cost]) => !visited.has(id) && cost <= maxDays)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!current) break;
    const [node, cost] = current;
    visited.add(node);
    for (const id of graph.adjacency.get(node) ?? []) {
      const edge = graph.edges.get(id);
      if (!edge) continue;
      const other = edge.a === node ? edge.b : edge.a;
      // Lower bound excludes embark/subjugation costs, so no legal in-budget path is pruned.
      const days =
        cost + edge.baseDays / (edge.type === 'sea' ? 1 : BAL.roadGradeSpeedMult[edge.grade]);
      if (days <= maxDays && days < (distance.get(other) ?? Infinity)) distance.set(other, days);
    }
  }
  if (!visited.has(to)) return Infinity;
  const local: MapGraph = {
    nodes: graph.nodes,
    edges: graph.edges,
    adjacency: new Map(
      [...visited].map((id) => [
        id,
        (graph.adjacency.get(id) ?? []).filter((edgeId) => {
          const edge = graph.edges.get(edgeId);
          return edge !== undefined && visited.has(edge.a) && visited.has(edge.b);
        }),
      ]),
    ),
  };
  const result = computePath(state, local, { clanId, from, to, speedFactor: 1 });
  return result.found && result.totalDays <= maxDays ? result.totalDays : Infinity;
}
export function retainedGarrison(castle: Castle): number {
  return Math.max(BAL.aiHomeGarrisonMin, Math.ceil(castle.soldiers * BAL.aiHomeGarrisonRatio));
}
export function officerTroopCap(state: GameState, officer: Officer): number {
  const index =
    officer.clanId !== null && state.clans[officer.clanId]?.leaderId === officer.id
      ? RANK_VALUES.length - 1
      : RANK_VALUES.indexOf(officer.rank);
  return BAL.rankTroopCap[index] ?? 0;
}
export function findMarchLeader(state: GameState, castle: Castle): Officer | null {
  return (
    Object.values(state.officers)
      .filter(
        (o) =>
          o.clanId === castle.ownerClanId &&
          o.status === 'serving' &&
          o.hasComeOfAge &&
          o.locationCastleId === castle.id &&
          !isOfficerBusy(state, o.id),
      )
      .sort(
        (a, b) =>
          getEffectiveOfficerStat(b, 'ldr') - getEffectiveOfficerStat(a, 'ldr') ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
/** Produces an ordinary command without reserving or changing gameplay resources. */
export function planMarchFromCastle(
  state: GameState,
  scope: AiScope,
  castle: Castle,
  targetNodeId: MapNodeId,
  soldiers?: number,
  maxDays?: number,
): CmdMarch | null {
  if (
    castle.ownerClanId !== scope.clanId ||
    castle.corpsId !== scope.corpsId ||
    !scope.castleIds.includes(castle.id) ||
    castle.id === targetNodeId
  )
    return null;
  const leader = findMarchLeader(state, castle);
  if (
    !leader ||
    !Number.isFinite(
      maxDays === undefined
        ? travelDays(state, castle.id, targetNodeId, scope.clanId)
        : boundedTravelDays(state, castle.id, targetNodeId, scope.clanId, maxDays),
    )
  )
    return null;
  const count = Math.floor(
    Math.min(
      soldiers ?? Infinity,
      castle.soldiers - retainedGarrison(castle),
      officerTroopCap(state, leader),
      castle.food / (BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays),
    ),
  );
  if (count < BAL.minMarchTroops) return null;
  const food = Math.floor(
    Math.min(castle.food, count * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays),
  );
  return {
    type: 'march',
    clanId: scope.clanId,
    originCastleId: castle.id,
    leaderId: leader.id,
    deputyIds: [],
    soldiers: count,
    food,
    targetNodeId,
  };
}
/** Unweighted bounded graph expansion; never confuses hops with travel days. */
export function nodesWithin(
  state: GameState,
  seeds: Iterable<MapNodeId>,
  hops: number,
): Set<MapNodeId> {
  const visited = new Set(seeds);
  let frontier = [...visited];
  for (let depth = 0; depth < hops && frontier.length; depth++) {
    const next: MapNodeId[] = [];
    for (const road of Object.values(state.roads)) {
      for (const [a, b] of [
        [road.a, road.b],
        [road.b, road.a],
      ] as const)
        if (frontier.includes(a) && !visited.has(b)) {
          visited.add(b);
          next.push(b);
        }
    }
    frontier = next;
  }
  return visited;
}
export function nodeOwner(state: GameState, node: MapNodeId): ClanId | undefined {
  return (
    state.castles[node as keyof typeof state.castles]?.ownerClanId ??
    state.districts[node as keyof typeof state.districts]?.ownerClanId
  );
}
