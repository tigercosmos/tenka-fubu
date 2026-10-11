import type { GameState } from '../core/state/gameState';
import type { CastleId, ClanId, MapNodeId, TransportId } from '../core/state/ids';
import { validateRecallTransport } from '../core/commands/domesticCommands';
import { buildMapGraph } from '../core/state/mapGraph';
import { computePath } from '../core/systems/pathfinding';
import { transportEstimatedDays, transportPathDays } from '../core/systems/transport';

export interface TransportPreview {
  readonly toCastleId: CastleId;
  readonly toName: string;
  readonly nodeIds: readonly MapNodeId[];
  readonly nodeNames: readonly string[];
  /** Current-route estimate, not a guarantee against later policy/ownership/road changes or looting. */
  readonly estimatedDays: number;
}

export type TransportPosition =
  | Readonly<{ kind: 'node'; nodeId: MapNodeId; name: string }>
  | Readonly<{ kind: 'edge'; aNodeId: MapNodeId; aName: string; bNodeId: MapNodeId; bName: string }>
  | Readonly<{ kind: 'unknown' }>;

export interface TransportOrderView {
  readonly id: TransportId;
  readonly fromCastleId: CastleId;
  readonly fromName: string;
  readonly toCastleId: CastleId;
  readonly toName: string;
  readonly soldiers: number;
  readonly gold: number;
  readonly food: number;
  readonly returning: boolean;
  readonly canRecall: boolean;
  readonly position: TransportPosition;
}

/** Original-source filter does not hide an owned order merely because its source was captured. */
export function getTransportOrders(
  game: Readonly<GameState> | null,
  clanId: ClanId,
  fromCastleId?: CastleId,
): readonly TransportOrderView[] {
  if (!game) return [];
  const name = (id: MapNodeId) =>
    game.castles[id as CastleId]?.name ??
    game.districts[id as keyof typeof game.districts]?.name ??
    id;
  return Object.values(game.transports)
    .filter(
      (order) =>
        order.clanId === clanId &&
        (fromCastleId === undefined || order.fromCastleId === fromCastleId),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((order) => {
      const node = order.path[order.pathCursor];
      const next = order.path[order.pathCursor + (order.returning ? -1 : 1)];
      const position: TransportPosition = !node
        ? { kind: 'unknown' }
        : order.edgeCostDays > 0
          ? next
            ? { kind: 'edge', aNodeId: node, aName: name(node), bNodeId: next, bName: name(next) }
            : { kind: 'unknown' }
          : { kind: 'node', nodeId: node, name: name(node) };
      return {
        id: order.id,
        fromCastleId: order.fromCastleId,
        fromName: name(order.fromCastleId),
        toCastleId: order.toCastleId,
        toName: name(order.toCastleId),
        soldiers: order.soldiers,
        gold: order.gold,
        food: order.food,
        returning: order.returning,
        canRecall: validateRecallTransport(game, {
          type: 'recallTransport',
          clanId,
          transportId: order.id,
        }).ok,
        position,
      };
    });
}

export function getTransportPreviews(
  game: Readonly<GameState> | null,
  clanId: ClanId,
  fromCastleId: CastleId,
): readonly TransportPreview[] {
  if (!game || !game.clans[clanId]?.alive || game.castles[fromCastleId]?.ownerClanId !== clanId)
    return [];
  const graph = buildMapGraph(game.castles, game.districts, game.roads);
  return Object.values(game.castles)
    .filter((castle) => castle.id !== fromCastleId && castle.ownerClanId === clanId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((castle) => {
      // Same route query as validateTransport, with no fabricated cargo/resource amounts.
      const path = computePath(game, graph, {
        clanId,
        from: fromCastleId,
        to: castle.id,
        speedFactor: 1,
      });
      if (!path.found) return [];
      const endpoints = { clanId, fromCastleId, toCastleId: castle.id };
      const days = transportPathDays(game, endpoints, path.nodes);
      if (days === null) return [];
      return [
        {
          toCastleId: castle.id,
          toName: castle.name,
          nodeIds: [...path.nodes],
          nodeNames: path.nodes.map(
            (id) =>
              game.castles[id as CastleId]?.name ??
              game.districts[id as keyof typeof game.districts]?.name ??
              id,
          ),
          estimatedDays: transportEstimatedDays(days),
        },
      ];
    });
}

export function getTransportPreview(
  game: Readonly<GameState> | null,
  clanId: ClanId,
  fromCastleId: CastleId,
  toCastleId: CastleId,
): TransportPreview | null {
  return (
    getTransportPreviews(game, clanId, fromCastleId).find((row) => row.toCastleId === toCastleId) ??
    null
  );
}
