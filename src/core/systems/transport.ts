import { BAL } from '../balance';
import { castleFoodCap, castleMaxSoldiers, hasFacility, hasPolicy } from '../domestic';
import type { Army, GameState, RoadEdge, TransportOrder } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { MapNodeId } from '../state/ids';
import { isAtWar } from './diplomacyCommon';
import { treasuryForCastle } from '../commands/treasury';
import { nearestOwnedCastleByTravelTime } from './castleSelection';
import { reverseTransport } from './transportMovement';
import { armyPhysicalLeg } from './armyReroute';

function edgeBetween(state: Readonly<GameState>, a: MapNodeId, b: MapNodeId): RoadEdge | undefined {
  return Object.values<RoadEdge>(state.roads).find(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

export function transportEdgeDays(
  state: Readonly<GameState>,
  order: Readonly<Pick<TransportOrder, 'clanId' | 'fromCastleId' | 'toCastleId'>>,
  edge: Readonly<RoadEdge>,
): number {
  let days =
    edge.type === 'sea' ? edge.baseDays : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
  days /= BAL.transportSpeedFactor;
  if (hasPolicy(state, order.clanId, 'pol.tenmasei')) days *= BAL.polTenmaseiTransportDaysMult;
  const from = state.castles[order.fromCastleId];
  const to = state.castles[order.toCastleId];
  if (
    edge.type === 'sea' &&
    ((from && hasFacility(from, 'fac.minato')) || (to && hasFacility(to, 'fac.minato')))
  )
    days *= BAL.facPortSeaTransportDaysMult;
  return Math.max(Number.EPSILON, days);
}

/** TransportOrder persists node paths, so match movement's actual first edge between each pair. */
export function transportPathDays(
  state: Readonly<GameState>,
  endpoints: Readonly<Pick<TransportOrder, 'clanId' | 'fromCastleId' | 'toCastleId'>>,
  path: readonly MapNodeId[],
): number | null {
  let days = 0;
  let compensation = 0;
  for (let i = 1; i < path.length; i += 1) {
    const edge = edgeBetween(state, path[i - 1]!, path[i]!);
    if (!edge) return null;
    const adjusted = transportEdgeDays(state, endpoints, edge) - compensation;
    const sum = days + adjusted;
    compensation = sum - days - adjusted;
    days = sum;
  }
  return days;
}

/** Snap only machine-roundoff at integer boundaries; genuine fractional days still round up. */
export function transportEstimatedDays(days: number): number {
  const integer = Math.round(days);
  return Math.ceil(
    integer > 0 && Math.abs(days - integer) <= Number.EPSILON * Math.max(1, days) * 2
      ? integer
      : days,
  );
}

function looterAt(
  state: Readonly<GameState>,
  order: Readonly<TransportOrder>,
  nodeId: MapNodeId,
): Army | undefined {
  return Object.values<Army>(state.armies)
    .filter(
      (army) =>
        army.posNodeId === nodeId &&
        armyPhysicalLeg(army) === null &&
        isAtWar(state, order.clanId, army.clanId),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

function finishTransport(
  state: GameState,
  order: TransportOrder,
  destinationId: typeof order.toCastleId,
  events: GameEvent[],
): void {
  const destination = state.castles[destinationId];
  if (
    !destination ||
    destination.ownerClanId !== order.clanId ||
    order.path[order.pathCursor] !== destinationId ||
    order.edgeCostDays !== 0
  )
    return;
  const foodAccepted = Math.min(
    order.food,
    Math.max(0, castleFoodCap(destination) - destination.food),
  );
  destination.food += foodAccepted;
  const overflow = order.food - foodAccepted;
  if (overflow > 0)
    events.push({
      type: 'economy.granaryOverflow',
      day: state.time.day,
      clanIds: [order.clanId],
      clanId: order.clanId,
      castleId: destination.id,
      food: overflow,
    });
  destination.soldiers = Math.round(
    destination.soldiers +
      Math.min(
        order.soldiers,
        Math.max(0, castleMaxSoldiers(state, destination) - destination.soldiers),
      ),
  );
  const clan = treasuryForCastle(state, destination.id);
  if (clan) clan.gold += order.gold;
  events.push({
    type: 'transport.arrived',
    day: state.time.day,
    clanIds: [order.clanId],
    fromCastleId: order.fromCastleId,
    toCastleId: destination.id,
    soldiers: order.soldiers,
    gold: order.gold,
    food: foodAccepted,
  });
}

/** 05 §3.6 requires friendly arrival; captured endpoints derive a physical return, never a refund. */
function ensureFriendlyDestination(state: GameState, order: TransportOrder): boolean {
  const destinationId = order.returning ? order.fromCastleId : order.toCastleId;
  const destinationFriendly = state.castles[destinationId]?.ownerClanId === order.clanId;
  const terminal = order.returning ? order.path[0] : order.path[order.path.length - 1];
  if (destinationFriendly && terminal === destinationId) return true;
  if (!Object.values(state.castles).some((castle) => castle.ownerClanId === order.clanId)) {
    delete state.transports[order.id];
    return false;
  }
  if (order.edgeCostDays > 0) {
    if (
      !destinationFriendly &&
      !order.returning &&
      state.castles[order.fromCastleId]?.ownerClanId === order.clanId
    )
      reverseTransport(order);
    // Other entered legs retain their direction and frozen cost until an actual node arrival.
    // In particular, a recalled partial leg's cursor may denote a never-reached far endpoint.
    if (order.edgeCostDays > 0) return true;
  }
  const current = order.path[order.pathCursor];
  if (!current) return false;
  const returnPath = order.path.slice(0, order.pathCursor + 1);
  if (
    !destinationFriendly &&
    !order.returning &&
    state.castles[order.fromCastleId]?.ownerClanId === order.clanId &&
    order.path[0] === order.fromCastleId &&
    returnPath.every(
      (node, index) => index === 0 || edgeBetween(state, returnPath[index - 1]!, node),
    )
  ) {
    order.returning = true;
  } else {
    const choice = nearestOwnedCastleByTravelTime(
      state,
      order.clanId,
      current,
      destinationFriendly ? destinationId : order.fromCastleId,
    );
    // Retain cargo at its current node while no friendly route exists; retry next day.
    if (!choice) return false;
    order.toCastleId = choice.castle.id;
    order.path = choice.path.nodes;
    order.pathCursor = 0;
    order.returning = false;
  }
  order.edgeProgressDays = 0;
  order.edgeCostDays = 0;
  return true;
}

function tryLoot(
  state: GameState,
  order: TransportOrder,
  node: MapNodeId,
  events: GameEvent[],
): boolean {
  const looter = looterAt(state, order, node);
  const uprising = state.districts[node as keyof typeof state.districts]?.uprising;
  if (!looter && !uprising) return false;
  if (looter) {
    const foodCap = looter.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays;
    looter.food += Math.min(order.food, Math.floor(Math.max(0, foodCap - looter.food)));
    const clan = state.clans[looter.clanId];
    if (clan) clan.gold += order.gold;
    events.push({
      type: 'transport.looted',
      day: state.time.day,
      clanIds: [order.clanId, looter.clanId],
      ownerClanId: order.clanId,
      fromCastleId: order.fromCastleId,
      toCastleId: order.toCastleId,
      byClanId: looter.clanId,
      nodeId: node,
      soldiers: order.soldiers,
      gold: order.gold,
      food: order.food,
    });
  }
  delete state.transports[order.id];
  return true;
}

export function transportDaily(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.transports).sort()) {
    const order = state.transports[id as keyof typeof state.transports];
    if (!order) continue;
    const occupiedNode = order.path[order.pathCursor];
    // An entered edge (including recall's reversed partial edge) is not node occupancy.
    if (order.edgeCostDays === 0 && occupiedNode && tryLoot(state, order, occupiedNode, events))
      continue;
    if (!ensureFriendlyDestination(state, order)) continue;
    let budget = 1;
    while (budget > 0 && state.transports[order.id] === order) {
      const direction = order.returning ? -1 : 1;
      const nextIndex = order.pathCursor + direction;
      const currentNode = order.path[order.pathCursor];
      const nextNode = order.path[nextIndex];
      if (!currentNode || !nextNode) {
        finishTransport(
          state,
          order,
          order.returning ? order.fromCastleId : order.toCastleId,
          events,
        );
        delete state.transports[order.id];
        break;
      }
      const edge = edgeBetween(state, currentNode, nextNode);
      if (!edge) {
        // A temporarily unavailable edge must not destroy or refund cargo.
        break;
      }
      if (order.edgeCostDays === 0) order.edgeCostDays = transportEdgeDays(state, order, edge);
      const remaining = Math.max(0, order.edgeCostDays - order.edgeProgressDays);
      const roundoff =
        Number.EPSILON * Math.max(1, budget, remaining, order.edgeCostDays, order.edgeProgressDays);
      if (budget + roundoff < remaining) {
        order.edgeProgressDays += budget;
        break;
      }
      budget = Math.max(0, budget - remaining);
      order.pathCursor = nextIndex;
      order.edgeProgressDays = 0;
      order.edgeCostDays = 0;
      if (tryLoot(state, order, nextNode, events)) break;
      if (!ensureFriendlyDestination(state, order)) break;
      if (
        (!order.returning && order.pathCursor === order.path.length - 1) ||
        (order.returning && order.pathCursor === 0)
      ) {
        finishTransport(
          state,
          order,
          order.returning ? order.fromCastleId : order.toCastleId,
          events,
        );
        delete state.transports[order.id];
      }
    }
  }
  return events;
}
