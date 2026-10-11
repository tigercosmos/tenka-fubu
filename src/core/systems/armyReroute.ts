import type { Army, GameState, RoadEdge } from '../state/gameState';
import type { CastleId, DistrictId, MapNodeId } from '../state/ids';
import { buildMapGraph } from '../state/mapGraph';
import { computePath, getStance } from './pathfinding';

export interface ArmyPhysicalLeg {
  from: MapNodeId;
  end: MapNodeId;
  reversing: boolean;
  progress: number;
  cost: number;
}

/** Progress is always measured from the last actually arrived node, even while reversing. */
export function armyPhysicalLeg(army: Readonly<Army>): ArmyPhysicalLeg | null {
  const end = army.reversingEdgeEndNodeId ?? army.path[army.pathCursor + 1];
  if (end === undefined || army.edgeCostDays <= 0 || army.edgeProgressDays <= 0) return null;
  return {
    from: army.posNodeId,
    end,
    reversing: army.reversingEdgeEndNodeId != null,
    progress: army.edgeProgressDays,
    cost: army.edgeCostDays,
  };
}

export function armyCanEnterNode(
  state: Readonly<GameState>,
  army: Readonly<Army>,
  nodeId: MapNodeId,
  asTarget: boolean,
  viaSea = false,
): boolean {
  const owner =
    state.castles[nodeId as CastleId]?.ownerClanId ??
    state.districts[nodeId as DistrictId]?.ownerClanId;
  if (owner === undefined) return false;
  const stance = getStance(state, army.clanId, owner);
  if (stance === 'ceasefire') return false;
  return (
    viaSea ||
    state.districts[nodeId as DistrictId] !== undefined ||
    stance === 'own' ||
    stance === 'friendly' ||
    asTarget
  );
}

export interface ArmyReroutePlan {
  nodes: MapNodeId[];
  progress: number;
  cost: number;
  reversingEnd: MapNodeId | null;
  totalDays: number;
}

/** Compare both legal endpoint tails, adding only the physical distance still needed.
 * Equal costs retain forward travel. No state mutation, RNG or phantom midpoint node. */
export function planArmyReroute(
  state: Readonly<GameState>,
  army: Readonly<Army>,
  targetNodeId: MapNodeId,
): ArmyReroutePlan | null {
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  const fromPath = computePath(state, graph, {
    clanId: army.clanId,
    from: army.posNodeId,
    to: targetNodeId,
    speedFactor: 1,
  });
  const leg = armyPhysicalLeg(army);
  if (leg === null)
    return fromPath.found
      ? {
          nodes: fromPath.nodes,
          progress: 0,
          cost: 0,
          reversingEnd: null,
          totalDays: fromPath.totalDays,
        }
      : null;
  const edge: RoadEdge | undefined = Object.values(state.roads).find(
    (candidate) =>
      (candidate.a === leg.from && candidate.b === leg.end) ||
      (candidate.b === leg.from && candidate.a === leg.end),
  );
  if (!edge) return null;
  const endPath = computePath(state, graph, {
    clanId: army.clanId,
    from: leg.end,
    to: targetNodeId,
    speedFactor: 1,
  });
  const forwardLegal =
    endPath.found &&
    armyCanEnterNode(state, army, leg.end, leg.end === targetNodeId, edge.type === 'sea');
  const reverseLegal =
    fromPath.found &&
    armyCanEnterNode(state, army, leg.from, leg.from === targetNodeId, edge.type === 'sea');
  const forwardDays = forwardLegal ? leg.cost - leg.progress + endPath.totalDays : Infinity;
  const reverseDays = reverseLegal ? leg.progress + fromPath.totalDays : Infinity;
  if (!Number.isFinite(Math.min(forwardDays, reverseDays))) return null;
  return forwardDays <= reverseDays
    ? {
        nodes: [leg.from, ...endPath.nodes],
        progress: leg.progress,
        cost: leg.cost,
        reversingEnd: null,
        totalDays: forwardDays,
      }
    : {
        nodes: fromPath.nodes,
        progress: leg.progress,
        cost: leg.cost,
        reversingEnd: leg.end,
        totalDays: reverseDays,
      };
}

export function applyArmyReroute(army: Army, plan: ArmyReroutePlan): void {
  army.path = [...plan.nodes];
  army.pathCursor = 0;
  army.edgeProgressDays = plan.progress;
  army.edgeCostDays = plan.cost;
  if (plan.reversingEnd === null) delete army.reversingEdgeEndNodeId;
  else army.reversingEdgeEndNodeId = plan.reversingEnd;
}

/** Preferred origin first; otherwise closest currently reachable owned castle from the physical point. */
export function planArmyReturn(state: Readonly<GameState>, army: Readonly<Army>) {
  const preferred =
    state.castles[army.originCastleId]?.ownerClanId === army.clanId
      ? army.originCastleId
      : undefined;
  return Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === army.clanId)
    .map((castle) => ({ castle, path: planArmyReroute(state, army, castle.id) }))
    .filter(
      (choice): choice is { castle: typeof choice.castle; path: NonNullable<typeof choice.path> } =>
        choice.path !== null,
    )
    .sort(
      (a, b) =>
        Number(b.castle.id === preferred) - Number(a.castle.id === preferred) ||
        a.path.totalDays - b.path.totalDays ||
        a.castle.id.localeCompare(b.castle.id),
    )[0];
}
