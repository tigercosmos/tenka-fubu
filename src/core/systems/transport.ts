import { BAL } from '../balance';
import { castleFoodCap, castleMaxSoldiers, hasFacility, hasPolicy } from '../domestic';
import type { Army, GameState, RoadEdge, TransportOrder } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { ClanId, ClanPairKey, MapNodeId } from '../state/ids';

function pairKey(a: ClanId, b: ClanId): ClanPairKey {
  return (a < b ? `${a}|${b}` : `${b}|${a}`) as ClanPairKey;
}

function atWar(state: Readonly<GameState>, a: ClanId, b: ClanId): boolean {
  const row = state.diplomacy.rows[pairKey(a, b)];
  return (
    row?.lastHostileDay !== null &&
    row?.lastHostileDay !== undefined &&
    row.pacts.length === 0 &&
    state.time.day - row.lastHostileDay < BAL.warStateMonths * 30
  );
}

function edgeBetween(state: Readonly<GameState>, a: MapNodeId, b: MapNodeId): RoadEdge | undefined {
  return Object.values<RoadEdge>(state.roads).find(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

function adjustedEdgeDays(
  state: Readonly<GameState>,
  order: Readonly<TransportOrder>,
  edge: Readonly<RoadEdge>,
): number {
  let days =
    edge.type === 'sea' ? edge.baseDays : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
  days /= BAL.transportSpeedFactor;
  if (hasPolicy(state, order.clanId, 'pol.tenmasei')) days *= 2 / 3;
  const from = state.castles[order.fromCastleId];
  const to = state.castles[order.toCastleId];
  if (
    edge.type === 'sea' &&
    ((from && hasFacility(from, 'fac.minato')) || (to && hasFacility(to, 'fac.minato')))
  )
    days *= 0.5;
  return Math.max(Number.EPSILON, days);
}

function looterAt(
  state: Readonly<GameState>,
  order: Readonly<TransportOrder>,
  nodeId: MapNodeId,
): Army | undefined {
  return Object.values<Army>(state.armies)
    .filter((army) => army.posNodeId === nodeId && atWar(state, order.clanId, army.clanId))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

function finishTransport(
  state: GameState,
  order: TransportOrder,
  destinationId: typeof order.toCastleId,
  events: GameEvent[],
): void {
  const destination = state.castles[destinationId];
  if (!destination) return;
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
  destination.soldiers += Math.min(
    order.soldiers,
    Math.max(0, castleMaxSoldiers(state, destination) - destination.soldiers),
  );
  const clan = state.clans[order.clanId];
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

export function transportDaily(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.transports).sort()) {
    const order = state.transports[id as keyof typeof state.transports];
    if (!order) continue;
    const occupiedNode = order.path[order.pathCursor];
    if (occupiedNode) {
      const looter = looterAt(state, order, occupiedNode);
      const uprising = state.districts[occupiedNode as keyof typeof state.districts]?.uprising;
      if (looter || uprising) {
        if (looter) {
          const foodCap = looter.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays;
          looter.food += Math.min(order.food, Math.max(0, foodCap - looter.food));
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
            nodeId: occupiedNode,
            soldiers: order.soldiers,
            gold: order.gold,
            food: order.food,
          });
        }
        delete state.transports[order.id];
        continue;
      }
    }
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
      continue;
    }
    const edge = edgeBetween(state, currentNode, nextNode);
    if (!edge) {
      delete state.transports[order.id];
      continue;
    }
    if (order.edgeCostDays === 0) order.edgeCostDays = adjustedEdgeDays(state, order, edge);
    order.edgeProgressDays += 1;
    if (order.edgeProgressDays < order.edgeCostDays) continue;
    order.pathCursor = nextIndex;
    order.edgeProgressDays = 0;
    order.edgeCostDays = 0;
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
  return events;
}
