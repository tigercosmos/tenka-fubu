import { BAL } from '../balance';
import { getAvailableTacticDefs } from '../tactics';
import type { BattleCommand } from './battle';
import type { BattleSide, BattleState, BattleUnit, GameState, Jin } from '../state/gameState';
import type { TacticId } from '../state/ids';

const OFFENSIVE_TACTIC_PRIORITY = [
  'tac.triple-volley' as TacticId,
  'tac.cavalry' as TacticId,
  'tac.last-stand' as TacticId,
  'tac.charge' as TacticId,
  'tac.fire-arrow' as TacticId,
  'tac.volley' as TacticId,
] as const;

function sideClanId(battle: Readonly<BattleState>, side: BattleSide) {
  return side === 'attacker' ? battle.attackerClanId : battle.defenderClanId;
}

function adjacentJinIds(battle: Readonly<BattleState>, jinId: string): string[] {
  return battle.edges
    .flatMap((edge) => (edge.a === jinId ? [edge.b] : edge.b === jinId ? [edge.a] : []))
    .sort((a, b) => a.localeCompare(b));
}

function isAdjacentOrSame(
  battle: Readonly<BattleState>,
  a: Readonly<BattleUnit>,
  b: Readonly<BattleUnit>,
): boolean {
  return a.jinId === b.jinId || adjacentJinIds(battle, a.jinId).includes(b.jinId);
}

function unitPower(state: Readonly<GameState>, unit: Readonly<BattleUnit>): number {
  const general = state.officers[unit.generalId];
  const val = general === undefined ? 0 : general.val + general.statGrowth.val;
  const ldr = general === undefined ? 0 : general.ldr + general.statGrowth.ldr;
  return (
    unit.troops *
    (1 + val * BAL.valBattleFactor + ldr * BAL.ldrBattleFactor) *
    Math.max(0.2, unit.morale / 100)
  );
}

function activeEnemies(battle: Readonly<BattleState>, unit: Readonly<BattleUnit>): BattleUnit[] {
  return battle.units
    .filter(
      (candidate) =>
        candidate.side !== unit.side &&
        !candidate.routed &&
        candidate.troops > 0 &&
        isAdjacentOrSame(battle, unit, candidate),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

function weakestEnemy(
  state: Readonly<GameState>,
  enemies: readonly BattleUnit[],
): BattleUnit | undefined {
  return [...enemies].sort(
    (a, b) => unitPower(state, a) - unitPower(state, b) || a.id.localeCompare(b.id),
  )[0];
}

function shortestNextJin(
  battle: Readonly<BattleState>,
  from: string,
  destination: string,
): string | undefined {
  if (from === destination) return undefined;
  const parent = new Map<string, string>();
  const queue = [from];
  const visited = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of adjacentJinIds(battle, current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      if (neighbor === destination) {
        let step = destination;
        while (parent.get(step) !== from) step = parent.get(step)!;
        return step;
      }
      queue.push(neighbor);
    }
  }
  return undefined;
}

function canOccupy(
  battle: Readonly<BattleState>,
  unit: Readonly<BattleUnit>,
  jinId: string,
): boolean {
  return (
    battle.units.filter(
      (candidate) =>
        candidate.side === unit.side &&
        candidate.jinId === jinId &&
        candidate.troops > 0 &&
        !candidate.routed,
    ).length < BAL.jinStackLimit
  );
}

function chooseOrder(
  state: Readonly<GameState>,
  battle: Readonly<BattleState>,
  unit: Readonly<BattleUnit>,
): BattleCommand | undefined {
  const saihai = battle.saihai[unit.side];
  const available = getAvailableTacticDefs(state, unit).filter(
    (definition) => (unit.tacticCooldowns[definition.id] ?? 0) <= 0,
  );
  const enemies = activeEnemies(battle, unit);
  const target = weakestEnemy(state, enemies);

  const inspire = available.find((definition) => definition.id === 'tac.inspire');
  if (unit.morale < 50 && inspire !== undefined && saihai >= inspire.saihaiCost) {
    return { kind: 'tactic', unitId: unit.id, tacticId: inspire.id, targetUnitId: null };
  }

  if (target !== undefined) {
    for (const tacticId of OFFENSIVE_TACTIC_PRIORITY) {
      const tactic = available.find((definition) => definition.id === tacticId);
      if (tactic === undefined || saihai < tactic.saihaiCost + 5) continue;
      return {
        kind: 'tactic',
        unitId: unit.id,
        tacticId,
        targetUnitId: tactic.needsTarget ? target.id : null,
      };
    }
    if (unitPower(state, unit) / Math.max(1, unitPower(state, target)) >= 0.8) {
      return { kind: 'attack', unitId: unit.id, targetUnitId: target.id };
    }
  }

  const adjacent = adjacentJinIds(battle, unit.jinId);
  const weakCapture = battle.jins
    .filter(
      (jin) =>
        adjacent.includes(jin.id) &&
        jin.owner !== unit.side &&
        canOccupy(battle, unit, jin.id) &&
        !battle.units.some(
          (candidate) =>
            candidate.side !== unit.side &&
            candidate.jinId === jin.id &&
            candidate.troops > 0 &&
            !candidate.routed,
        ),
    )
    .sort((a, b) => a.flagPower - b.flagPower || a.id.localeCompare(b.id))[0];
  if (weakCapture !== undefined) {
    return { kind: 'move', unitId: unit.id, targetJinId: weakCapture.id };
  }

  const ownHonjin = battle.jins.find((jin) => jin.isHonjin && jin.owner === unit.side);
  const enemyHonjin = battle.jins.find(
    (jin) => jin.isHonjin && jin.owner !== unit.side && jin.owner !== 'neutral',
  );
  const ownHonjinThreatened =
    ownHonjin !== undefined &&
    battle.units.some(
      (enemy) =>
        enemy.side !== unit.side &&
        enemy.troops > 0 &&
        !enemy.routed &&
        adjacentJinIds(battle, ownHonjin.id).includes(enemy.jinId),
    );
  const destination = ownHonjinThreatened ? ownHonjin : enemyHonjin;
  if (destination === undefined) return undefined;
  const nextJinId = shortestNextJin(battle, unit.jinId, destination.id);
  if (nextJinId === undefined || !canOccupy(battle, unit, nextJinId)) return undefined;
  return { kind: 'move', unitId: unit.id, targetJinId: nextJinId };
}

/** 07 §3.9：AI 側恆委任；玩家側僅處理 delegated=true 的部隊。 */
export function createDelegatedBattleOrders(
  state: Readonly<GameState>,
  battle: Readonly<BattleState>,
): BattleCommand[] {
  return battle.units
    .filter(
      (unit) =>
        unit.troops > 0 &&
        !unit.routed &&
        (sideClanId(battle, unit.side) !== state.meta.playerClanId || unit.delegated),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((unit) => {
      const order = chooseOrder(state, battle, unit);
      return order === undefined ? [] : [order];
    });
}

export function enemyHonjinFor(battle: Readonly<BattleState>, side: BattleSide): Jin | undefined {
  return battle.jins.find((jin) => jin.isHonjin && jin.owner !== side && jin.owner !== 'neutral');
}
