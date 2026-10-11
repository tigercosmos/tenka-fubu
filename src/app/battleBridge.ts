import {
  advanceBattleTick,
  closeResolvedBattle,
  queryBattleUnitActivity,
  type BattleCommand,
  type BattleTickEvent,
  type BattleTickResult,
  type BattleUnitActivity,
} from '@core/systems/battle';
import { getAvailableTacticDefs } from '@core/tactics';
import type { BattleState } from '@core/state/gameState';
import type { BattleId, TacticId } from '@core/state/ids';
import { store, bumpTickSeq } from './store';

const pendingOrders = new Map<BattleId, BattleCommand[]>();
let pendingOrdersGame: object | null = null;

export interface PendingBattleOrders {
  readonly battleId: BattleId;
  readonly orders: readonly BattleCommand[];
}

function ownOrders(game: object): void {
  if (pendingOrdersGame === game) return;
  pendingOrders.clear();
  pendingOrdersGame = game;
}

/** Notify app progress subscribers; queue edits are not core ticks. */
function publishOrders(): void {
  store.setState({});
}

export function snapshotPendingBattleOrders(): PendingBattleOrders[] {
  if (pendingOrdersGame !== store.getState().game) return [];
  return [...pendingOrders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([battleId, orders]) => ({ battleId, orders: structuredClone(orders) }));
}

export type BattleOrderDispatchResult =
  | { ok: true }
  | { ok: false; reason: 'notBooted' | 'battleMissing' | 'battleResolved' | 'unitMissing' };

export type BattleResultAcknowledgement =
  { ok: true } | { ok: false; reason: 'notBooted' | 'battleMissing' | 'battleUnresolved' };

export interface BattleTacticOption {
  readonly id: TacticId;
  readonly saihaiCost: number;
  readonly needsTarget: boolean;
}

export type { BattleCommand, BattleTickEvent, BattleTickResult, BattleUnitActivity };

/** Read-only tactical facts; also supports isolated presentation fixtures without a live session. */
export function getBattleUnitActivity(
  battle: Readonly<BattleState>,
  unitId: string,
): BattleUnitActivity | null {
  return queryBattleUnitActivity(battle, unitId);
}

/** 合戰操作不進策略 CommandQueue；驗證最小歸屬後排入下一個 battle tick。 */
export function dispatchBattleOrder(
  battleId: BattleId,
  order: BattleCommand,
): BattleOrderDispatchResult {
  const game = store.getState().game;
  if (game === null) return { ok: false, reason: 'notBooted' };
  const battle = game.battles[battleId];
  if (battle === undefined) return { ok: false, reason: 'battleMissing' };
  if (battle.result !== null) return { ok: false, reason: 'battleResolved' };
  if (!battle.units.some((unit) => unit.id === order.unitId)) {
    return { ok: false, reason: 'unitMissing' };
  }
  ownOrders(game);
  const orders = pendingOrders.get(battleId) ?? [];
  orders.push(structuredClone(order));
  pendingOrders.set(battleId, orders);
  publishOrders();
  return { ok: true };
}

export function runBattleTick(battleId: BattleId): BattleTickResult {
  const game = store.getState().game;
  if (game === null) throw new Error('runBattleTick: game 尚未初始化');
  ownOrders(game);
  const orders = pendingOrders.get(battleId) ?? [];
  pendingOrders.delete(battleId);
  const result = advanceBattleTick(game, battleId, orders);
  bumpTickSeq();
  return result;
}

/** UI-safe tactic projection; keeps BattleScreen off core implementation modules. */
export function getBattleTacticOptions(
  battleId: BattleId,
  unitId: string,
): readonly BattleTacticOption[] {
  const game = store.getState().game;
  if (game === null) return [];
  const unit = game.battles[battleId]?.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) return [];
  return getAvailableTacticDefs(game, unit).map(({ id, saihaiCost, needsTarget }) => ({
    id,
    saihaiCost,
    needsTarget,
  }));
}

/** Result acknowledgement is the sole app path that removes a completed battle. */
export function acknowledgeBattleResult(battleId: BattleId): BattleResultAcknowledgement {
  const game = store.getState().game;
  if (game === null) return { ok: false, reason: 'notBooted' };
  const battle = game.battles[battleId];
  if (battle === undefined) return { ok: false, reason: 'battleMissing' };
  if (battle.result === null) return { ok: false, reason: 'battleUnresolved' };
  closeResolvedBattle(game, battleId);
  clearBattleOrders(battleId);
  bumpTickSeq();
  return { ok: true };
}

export function clearBattleOrders(battleId: BattleId): void {
  if (pendingOrders.delete(battleId)) publishOrders();
}

/** New/load/title lifecycle cleanup; never applies queued tactical commands. */
export function clearAllBattleOrders(): void {
  const changed = pendingOrders.size > 0;
  pendingOrders.clear();
  pendingOrdersGame = null;
  if (changed) publishOrders();
}

export function resetBattleBridgeForTests(): void {
  clearAllBattleOrders();
}

export function getPendingBattleOrdersForTests(battleId: BattleId): readonly BattleCommand[] {
  return snapshotPendingBattleOrders().find((entry) => entry.battleId === battleId)?.orders ?? [];
}
