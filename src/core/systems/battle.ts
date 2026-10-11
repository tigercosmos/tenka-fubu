// 合戰戰場生成與 battle tick 核心（M5-1／M5-2）。
// 規格：plan/07-military.md §3.5～§3.7、§5.3～§5.4；plan/03-game-loop.md §3.7.2。

import { BAL } from '../balance';
import { armyAttackFacilityMultiplier } from '../domestic';
import { traitModifier } from '../traits';
import { getBattleOfficerStat, getEffectiveOfficerStat } from '../battleStats';
import {
  PLAYER_AUTHORITY,
  validateExecutionAuthority,
  type ExecutionAuthority,
} from '../commands/authority';
import type { CmdStartKassen, ValidationResult } from '../commands/types';
import { REJECT_REASONS } from '../commands/reasons';
import { CoreError } from '../errors';
import { createRngStream } from '../rng';
import { buildMapGraph } from '../state/mapGraph';
import { nextId } from '../state/serialize';
import type {
  Army,
  BattleResult,
  BattleSide,
  BattleState,
  BattleTerrain,
  BattleUnit,
  FieldCombat,
  GameState,
  Jin,
  JinEdge,
} from '../state/gameState';
import type {
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  MapNodeId,
  OfficerId,
  TacticId,
} from '../state/ids';
import type { GameEvent } from '../state/events';
import { applyAwe, judgeBattleAwe } from './awe';
import { createDelegatedBattleOrders } from './battleAi';
import { nearestOwnedCastleByHops } from './castleSelection';
import { appointClanSuccessor, dieOfficer, gainMerit, releaseOfficerAssignments } from './officers';
import {
  applyBattleTactic,
  decrementTacticTimers,
  fireArrowTargetUnitId,
  forcedAttackTargetUnitId,
  hasCavalryTactic,
  isTacticImmobile,
  tacticAttackMultiplier,
  tacticDamageTakenMultiplier,
  tacticMoraleFloor,
} from '../tactics';

export type BattleCommand =
  | { readonly kind: 'move'; readonly unitId: string; readonly targetJinId: string }
  | { readonly kind: 'attack'; readonly unitId: string; readonly targetUnitId: string }
  | {
      readonly kind: 'tactic';
      readonly unitId: string;
      readonly tacticId: TacticId;
      readonly targetUnitId: string | null;
    }
  | { readonly kind: 'toggleDelegate'; readonly unitId: string; readonly enabled: boolean };

type BattleTickEventPayload =
  | { readonly type: 'move.accepted'; readonly unitId: string; readonly targetJinId: string }
  | { readonly type: 'attack.accepted'; readonly unitId: string; readonly targetUnitId: string }
  | { readonly type: 'delegation.changed'; readonly unitId: string; readonly enabled: boolean }
  | {
      readonly type: 'tactic.accepted';
      readonly unitId: string;
      readonly tacticId: TacticId;
      readonly targetUnitId: string | null;
      readonly damageDealt: number;
      readonly troopsHealed: number;
      readonly moraleGained: number;
    }
  | {
      readonly type: 'unit.changed';
      readonly unitId: string;
      readonly source: 'tactic' | 'combat' | 'pursuit';
      readonly troopsBefore: number;
      readonly troopsAfter: number;
      readonly moraleBefore: number;
      readonly moraleAfter: number;
    }
  | {
      readonly type: 'unit.arrived';
      readonly unitId: string;
      readonly fromJinId: string;
      readonly toJinId: string;
      readonly reason: 'move' | 'retreat';
    }
  | { readonly type: 'unit.routed'; readonly unitId: string }
  | { readonly type: 'unit.exited'; readonly unitId: string }
  | {
      readonly type: 'flag.damaged';
      readonly jinId: string;
      readonly source: 'fireArrow' | 'occupation';
      readonly amount: number;
      readonly flagPowerBefore: number;
      readonly flagPowerAfter: number;
    }
  | {
      readonly type: 'jin.captured';
      readonly jinId: string;
      readonly ownerBefore: Jin['owner'];
      readonly ownerAfter: Jin['owner'];
      readonly flagPower: number;
    }
  | {
      readonly type: 'battle.resolved';
      readonly winnerSide: BattleSide;
      readonly attackerLosses: number;
      readonly defenderLosses: number;
      readonly aweLevel: BattleResult['aweLevel'];
    };

/** Detached executing-stage facts; not persisted GameEvents or queued command intentions. */
export type BattleTickEvent = BattleTickEventPayload & { readonly sequence: number };

export interface BattleTickResult {
  battleId: BattleId;
  tick: number;
  resolved: boolean;
  readonly events: readonly BattleTickEvent[];
}

function recordUnitChange(
  events: BattleTickEventPayload[],
  unit: BattleUnit,
  source: 'tactic' | 'combat' | 'pursuit',
  troopsBefore: number,
  moraleBefore: number,
): void {
  if (unit.troops !== troopsBefore || unit.morale !== moraleBefore)
    events.push({
      type: 'unit.changed',
      unitId: unit.id,
      source,
      troopsBefore,
      troopsAfter: unit.troops,
      moraleBefore,
      moraleAfter: unit.morale,
    });
}

export interface KassenParticipants {
  attacker: Army[];
  defender: Army[];
}

const ok: ValidationResult = { ok: true };
const reject = (reasonKey: string): ValidationResult => ({ ok: false, reasonKey });
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function sideClanId(battle: Readonly<BattleState>, side: BattleSide): ClanId {
  return side === 'attacker' ? battle.attackerClanId : battle.defenderClanId;
}

function sideForClan(combat: Readonly<FieldCombat>, clanId: ClanId) {
  if (combat.sideA.clanIds.includes(clanId)) return combat.sideA;
  if (combat.sideB.clanIds.includes(clanId)) return combat.sideB;
  return undefined;
}

function opposingSide(combat: Readonly<FieldCombat>, clanId: ClanId) {
  if (combat.sideA.clanIds.includes(clanId)) return combat.sideB;
  if (combat.sideB.clanIds.includes(clanId)) return combat.sideA;
  return undefined;
}

function currentFieldCombatTroops(
  state: Readonly<GameState>,
  combat: Readonly<FieldCombat>,
): number {
  return [...combat.sideA.armyIds, ...combat.sideB.armyIds].reduce(
    (sum, armyId) => sum + (state.armies[armyId]?.soldiers ?? 0),
    0,
  );
}

function terrainAtNode(state: Readonly<GameState>, nodeId: MapNodeId): BattleTerrain {
  const castle = state.castles[nodeId as keyof typeof state.castles];
  if (castle?.coastal) return 'coast';
  const district = state.districts[nodeId as keyof typeof state.districts];
  return district?.isPort ? 'coast' : 'plain';
}

function nodeDistances(state: Readonly<GameState>, from: MapNodeId): Map<MapNodeId, number> {
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  const distances = new Map<MapNodeId, number>([[from, 0]]);
  const queue: MapNodeId[] = [from];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const distance = distances.get(current)!;
    if (distance >= BAL.kassenGatherRange) continue;
    const neighbors = (graph.adjacency.get(current) ?? [])
      .map((edgeId) => {
        const edge = graph.edges.get(edgeId)!;
        return edge.a === current ? edge.b : edge.a;
      })
      .sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}

/** 07 §3.5：只拉入交戰兩勢力、2 跳內、非潰走／非圍城的在外部隊。 */
export function gatherKassenParticipants(
  state: Readonly<GameState>,
  combat: Readonly<FieldCombat>,
  attackerClanId: ClanId,
  defenderClanId: ClanId,
): KassenParticipants {
  const distances = nodeDistances(state, combat.nodeId);
  const sourceArmyIds = new Set([...combat.sideA.armyIds, ...combat.sideB.armyIds]);
  const select = (clanId: ClanId): Army[] =>
    Object.values(state.armies)
      .filter(
        (army) =>
          army.clanId === clanId &&
          army.soldiers > 0 &&
          army.status !== 'routed' &&
          army.status !== 'sieging' &&
          (army.status !== 'engaged' || sourceArmyIds.has(army.id)) &&
          army.siegeId === null &&
          army.battleId === null &&
          (distances.get(army.posNodeId) ?? Number.POSITIVE_INFINITY) <= BAL.kassenGatherRange,
      )
      .sort((a, b) => b.soldiers - a.soldiers || a.id.localeCompare(b.id))
      .slice(0, BAL.kassenMaxUnitsPerSide);
  return { attacker: select(attackerClanId), defender: select(defenderClanId) };
}

export function validateStartKassen(
  state: Readonly<GameState>,
  cmd: CmdStartKassen,
  authority: ExecutionAuthority = PLAYER_AUTHORITY,
): ValidationResult {
  const combat = state.fieldCombats[cmd.fieldCombatId];
  if (!combat) return reject(REJECT_REASONS.invalidTarget);
  const trustedAi =
    (authority.kind === 'clan' || authority.kind === 'corps') &&
    authority.clanId === cmd.clanId &&
    validateExecutionAuthority(state, cmd, authority).ok;
  if ((cmd.clanId !== state.meta.playerClanId && !trustedAi) || !sideForClan(combat, cmd.clanId)) {
    return reject(REJECT_REASONS.notOwner);
  }
  if (combat.kassenUsed || combat.interrupted) return reject(REJECT_REASONS.alreadyActive);
  if (Object.values(state.battles).some((battle) => battle.result === null)) {
    return reject(REJECT_REASONS.alreadyActive);
  }
  if (currentFieldCombatTroops(state, combat) < BAL.kassenMinTroops) {
    return reject(REJECT_REASONS.insufficientTroops);
  }
  const defenderClanId = opposingSide(combat, cmd.clanId)?.clanIds[0];
  if (!defenderClanId) return reject(REJECT_REASONS.invalidTarget);
  const participants = gatherKassenParticipants(state, combat, cmd.clanId, defenderClanId);
  return participants.attacker.length > 0 && participants.defender.length > 0
    ? ok
    : reject(REJECT_REASONS.invalidTarget);
}

interface Cell {
  col: number;
  row: number;
  id: string;
}

const cellId = (col: number, row: number): string => `jin.${String(col)}-${String(row)}`;

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildJinEdges(cells: readonly Cell[], terrain: BattleTerrain): JinEdge[] {
  const edges = new Map<string, JinEdge>();
  const add = (a: Cell, b: Cell): void => {
    const key = edgeKey(a.id, b.id);
    if (edges.has(key)) return;
    const crossesRiver =
      terrain === 'river' &&
      ((a.col === 2 && Math.abs(a.col - b.col) === 1) ||
        (b.col === 2 && Math.abs(a.col - b.col) === 1));
    edges.set(key, {
      a: a.id < b.id ? a.id : b.id,
      b: a.id < b.id ? b.id : a.id,
      moveCost: crossesRiver ? 2 : 1,
    });
  };

  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = cells[i]!;
      const b = cells[j]!;
      const colDiff = Math.abs(a.col - b.col);
      const rowDiff = Math.abs(a.row - b.row);
      if ((colDiff === 0 && rowDiff === 1) || (colDiff === 1 && rowDiff <= 1)) add(a, b);
    }
  }

  const components = (): Cell[][] => {
    const byId = new Map(cells.map((cell) => [cell.id, cell]));
    const remaining = new Set(byId.keys());
    const result: Cell[][] = [];
    while (remaining.size > 0) {
      const start = [...remaining].sort()[0]!;
      remaining.delete(start);
      const queue = [start];
      const component: Cell[] = [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor]!;
        component.push(byId.get(current)!);
        const neighbors = [...edges.values()]
          .flatMap((edge) => (edge.a === current ? [edge.b] : edge.b === current ? [edge.a] : []))
          .sort();
        for (const neighbor of neighbors) {
          if (!remaining.delete(neighbor)) continue;
          queue.push(neighbor);
        }
      }
      result.push(component.sort((a, b) => a.id.localeCompare(b.id)));
    }
    return result;
  };

  for (;;) {
    const groups = components();
    if (groups.length <= 1) break;
    let best: { a: Cell; b: Cell; distance: number } | undefined;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        for (const a of groups[i]!) {
          for (const b of groups[j]!) {
            const distance = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
            const key = edgeKey(a.id, b.id);
            const bestKey = best ? edgeKey(best.a.id, best.b.id) : '';
            if (
              !best ||
              distance < best.distance ||
              (distance === best.distance && key < bestKey)
            ) {
              best = { a, b, distance };
            }
          }
        }
      }
    }
    if (!best) break;
    add(best.a, best.b);
  }
  return [...edges.values()].sort((a, b) => edgeKey(a.a, a.b).localeCompare(edgeKey(b.a, b.b)));
}

function adjacentJinIds(battle: { readonly edges: readonly JinEdge[] }, jinId: string): string[] {
  return battle.edges
    .flatMap((edge) => (edge.a === jinId ? [edge.b] : edge.b === jinId ? [edge.a] : []))
    .sort((a, b) => a.localeCompare(b));
}

function jinDistances(edges: readonly JinEdge[], from: string): Map<string, number> {
  const distances = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of adjacentJinIds({ edges }, current)) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distances.get(current)! + 1);
      queue.push(neighbor);
    }
  }
  return distances;
}

function deployUnits(
  state: Readonly<GameState>,
  battle: BattleState,
  side: BattleSide,
  armies: readonly Army[],
): BattleUnit[] {
  const honjinId = side === 'attacker' ? cellId(0, 1) : cellId(4, 1);
  const distances = jinDistances(battle.edges, honjinId);
  const positions = [...battle.jins].sort((a, b) => {
    const distanceDiff = distances.get(a.id)! - distances.get(b.id)!;
    if (distanceDiff !== 0) return distanceDiff;
    const colDiff = side === 'attacker' ? a.col - b.col : b.col - a.col;
    return colDiff || a.id.localeCompare(b.id);
  });
  const occupied = new Set<string>();
  return [...armies]
    .sort((a, b) => b.soldiers - a.soldiers || a.id.localeCompare(b.id))
    .map((army, index) => {
      const jin =
        index === 0
          ? battle.jins.find((candidate) => candidate.id === honjinId)!
          : positions.find((candidate) => !occupied.has(candidate.id))!;
      occupied.add(jin.id);
      return {
        id: `bu.${army.id.replace(/^army\./u, '')}`,
        armyId: army.id,
        side,
        generalId: army.leaderId,
        troops: army.soldiers,
        battleInitialTroops: army.soldiers,
        morale: army.morale,
        jinId: jin.id,
        moveTargetJinId: null,
        moveProgress: 0,
        attackTargetUnitId: null,
        activeTactics: [],
        tacticCooldowns: {},
        delegated: army.clanId !== state.meta.playerClanId,
        routed: false,
        exited: false,
        strategyStatus: army.status,
      };
    });
}

/** M5-1 deterministic battlefield generation; the only entropy source is state.rng.battle. */
export function generateBattlefield(
  state: GameState,
  combat: Readonly<FieldCombat>,
  attackerClanId: ClanId,
  defenderClanId: ClanId,
  participants = gatherKassenParticipants(state, combat, attackerClanId, defenderClanId),
  terrain: BattleTerrain = terrainAtNode(state, combat.nodeId),
): BattleState {
  const rng = createRngStream(state.rng, 'battle');
  const count = rng.nextInt(BAL.jinCountMin, BAL.jinCountMax);
  const attackerHonjin: Cell = { col: 0, row: 1, id: cellId(0, 1) };
  const defenderHonjin: Cell = { col: 4, row: 1, id: cellId(4, 1) };
  const candidates: Cell[] = [];
  for (let col = 0; col <= 4; col += 1) {
    for (let row = 0; row <= 2; row += 1) {
      const id = cellId(col, row);
      if (id !== attackerHonjin.id && id !== defenderHonjin.id) candidates.push({ col, row, id });
    }
  }
  let neutralCells: Cell[];
  do {
    neutralCells = rng.shuffle([...candidates]).slice(0, count - 2);
  } while (![1, 2, 3].every((col) => neutralCells.some((cell) => cell.col === col)));
  const cells = [attackerHonjin, defenderHonjin, ...neutralCells].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const edges = buildJinEdges(cells, terrain);
  const hillIds = new Set(
    terrain === 'hill' || terrain === 'mountain'
      ? rng.shuffle(neutralCells.map((cell) => cell.id)).slice(0, 3)
      : [],
  );
  const adjacentToAttacker = new Set(adjacentJinIds({ edges }, attackerHonjin.id));
  const adjacentToDefender = new Set(adjacentJinIds({ edges }, defenderHonjin.id));
  const jins: Jin[] = cells.map((cell) => {
    const isHonjin = cell.id === attackerHonjin.id || cell.id === defenderHonjin.id;
    const flagPowerMax = isHonjin ? BAL.jinFlagHonjin : BAL.jinFlagNeutral;
    const owner: Jin['owner'] =
      cell.id === attackerHonjin.id || adjacentToAttacker.has(cell.id)
        ? 'attacker'
        : cell.id === defenderHonjin.id || adjacentToDefender.has(cell.id)
          ? 'defender'
          : 'neutral';
    return {
      id: cell.id,
      col: cell.col,
      row: cell.row,
      owner,
      isHonjin,
      flagPower: flagPowerMax,
      flagPowerMax,
      defenseBonus: isHonjin
        ? BAL.jinDefHonjin
        : hillIds.has(cell.id)
          ? BAL.jinDefHill
          : BAL.jinDefNeutral,
    };
  });
  const battle: BattleState = {
    id: nextId(state, 'battle'),
    fieldCombatId: combat.id,
    nodeId: combat.nodeId,
    terrain,
    attackerClanId,
    defenderClanId,
    jins,
    edges,
    units: [],
    tick: 0,
    saihai: { attacker: BAL.saihaiInit, defender: BAL.saihaiInit },
    honjinFallenTick: null,
    result: null,
  };
  battle.units = [
    ...deployUnits(state, battle, 'attacker', participants.attacker),
    ...deployUnits(state, battle, 'defender', participants.defender),
  ].sort((a, b) => a.id.localeCompare(b.id));
  return battle;
}

export function applyStartKassen(
  state: GameState,
  cmd: CmdStartKassen,
  _emit: (event: GameEvent) => void,
): void {
  void _emit;
  const combat = state.fieldCombats[cmd.fieldCombatId]!;
  const involvesPlayer =
    !state.ai.allAi &&
    [...combat.sideA.clanIds, ...combat.sideB.clanIds].includes(state.meta.playerClanId);
  if (!involvesPlayer) {
    // 09 D12: NPC-only encounters stay in strategic field resolution, without a tactical UI.
    // The spec supplies no numeric prediction modifier, so no invented combat bonus is applied.
    combat.kassenUsed = true;
    return;
  }
  const defenderClanId = opposingSide(combat, cmd.clanId)!.clanIds[0]!;
  const participants = gatherKassenParticipants(state, combat, cmd.clanId, defenderClanId);
  const battle = generateBattlefield(state, combat, cmd.clanId, defenderClanId, participants);
  combat.kassenUsed = true;
  combat.interrupted = true;
  state.battles[battle.id] = battle;
  for (const unit of battle.units) state.armies[unit.armyId]!.battleId = battle.id;
}

function jinEdge(battle: Readonly<BattleState>, a: string, b: string): JinEdge | undefined {
  return battle.edges.find(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

function activeUnit(unit: Readonly<BattleUnit>): boolean {
  return unit.troops > 0 && !unit.routed && !unit.exited;
}

function unitsAreAdjacent(
  battle: Readonly<BattleState>,
  a: Readonly<BattleUnit>,
  b: Readonly<BattleUnit>,
): boolean {
  return a.jinId === b.jinId || jinEdge(battle, a.jinId, b.jinId) !== undefined;
}

/** Detached current facts, not a prediction of damage or next-tick movement outcomes. */
export interface BattleUnitActivity {
  readonly unitId: string;
  readonly active: boolean;
  readonly depleted: boolean;
  readonly routed: boolean;
  readonly exited: boolean;
  readonly contactEnemyUnitIds: readonly string[];
  readonly moveTargetJinId: string | null;
  readonly moving: boolean;
  readonly movementBlockedReason: 'inactive' | 'immobile' | 'missingEdge' | null;
  readonly moveCost: number | null;
  readonly destinationAtCapacity: boolean;
}

export function queryBattleUnitActivity(
  battle: Readonly<BattleState>,
  unitId: string,
): BattleUnitActivity | null {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (!unit) return null;
  const active = activeUnit(unit);
  const target = unit.moveTargetJinId;
  const edge = target === null ? undefined : jinEdge(battle, unit.jinId, target);
  // Match advanceMovement's gate order: inactive, no intent, immobile, then missing edge.
  const movementBlockedReason =
    target === null
      ? null
      : !active
        ? 'inactive'
        : isTacticImmobile(unit)
          ? 'immobile'
          : !edge
            ? 'missingEdge'
            : null;
  return {
    unitId: unit.id,
    active,
    depleted: unit.troops <= 0,
    routed: unit.routed,
    exited: unit.exited,
    contactEnemyUnitIds: active
      ? battle.units
          .filter(
            (other) =>
              other.side !== unit.side &&
              activeUnit(other) &&
              unitsAreAdjacent(battle, unit, other),
          )
          .map((other) => other.id)
          .sort()
      : [],
    moveTargetJinId: target,
    moving: target !== null && movementBlockedReason === null,
    movementBlockedReason,
    moveCost: edge?.moveCost ?? null,
    // Capacity is checked only at arrival, after preceding movers may have changed occupancy.
    destinationAtCapacity:
      target !== null &&
      battle.units.filter(
        (other) =>
          other.id !== unit.id &&
          other.side === unit.side &&
          activeUnit(other) &&
          other.jinId === target,
      ).length >= BAL.jinStackLimit,
  };
}

/** Canonical M5-2 attack-power formula; tactic multipliers are supplied by M5-3 integration. */
export function computeBattleUnitAttackPower(
  state: Readonly<GameState>,
  unit: Readonly<BattleUnit>,
  tacticAtkMult = 1,
): number {
  const general = state.officers[unit.generalId];
  const val = general ? getBattleOfficerStat(general, 'val') : 0;
  const ldr = general ? getBattleOfficerStat(general, 'ldr') : 0;
  const moraleFactor = BAL.moraleFactorBase + unit.morale / BAL.moraleFactorDivisor;
  return (
    unit.troops *
    (1 + val * BAL.valBattleFactor + ldr * BAL.ldrBattleFactor) *
    moraleFactor *
    tacticAtkMult *
    armyAttackFacilityMultiplier(state, state.armies[unit.armyId])
  );
}

function processOrders(
  battle: BattleState,
  orders: readonly BattleCommand[],
  events: BattleTickEventPayload[],
): void {
  for (const order of orders) {
    if (order.kind === 'toggleDelegate') {
      if (order.unitId === 'all') {
        for (const unit of battle.units) {
          if (unit.delegated !== order.enabled)
            events.push({ type: 'delegation.changed', unitId: unit.id, enabled: order.enabled });
          unit.delegated = order.enabled;
        }
      } else {
        const unit = battle.units.find((candidate) => candidate.id === order.unitId);
        if (unit) {
          if (unit.delegated !== order.enabled)
            events.push({ type: 'delegation.changed', unitId: unit.id, enabled: order.enabled });
          unit.delegated = order.enabled;
        }
      }
      continue;
    }
    const unit = battle.units.find((candidate) => candidate.id === order.unitId);
    if (!unit || !activeUnit(unit)) continue;
    if (order.kind === 'move') {
      if (!isTacticImmobile(unit) && jinEdge(battle, unit.jinId, order.targetJinId)) {
        unit.moveTargetJinId = order.targetJinId;
        unit.moveProgress = 0;
        events.push({ type: 'move.accepted', unitId: unit.id, targetJinId: order.targetJinId });
      }
    } else if (order.kind === 'attack') {
      const target = battle.units.find((candidate) => candidate.id === order.targetUnitId);
      if (
        target &&
        activeUnit(target) &&
        target.side !== unit.side &&
        unitsAreAdjacent(battle, unit, target)
      ) {
        unit.attackTargetUnitId = target.id;
        events.push({ type: 'attack.accepted', unitId: unit.id, targetUnitId: target.id });
      }
    }
  }
}

function applyTacticOrders(
  state: Readonly<GameState>,
  battle: BattleState,
  orders: readonly BattleCommand[],
  events: BattleTickEventPayload[],
): void {
  for (const order of orders) {
    if (order.kind !== 'tactic') continue;
    const actor = battle.units.find((unit) => unit.id === order.unitId);
    const attackPower = actor
      ? computeBattleUnitAttackPower(state, actor, tacticAttackMultiplier(actor))
      : undefined;
    const before = battle.units.map((unit) => ({ unit, troops: unit.troops, morale: unit.morale }));
    const result = applyBattleTactic(
      state,
      battle,
      order,
      attackPower === undefined ? {} : { attackPower },
    );
    if (result.applied) {
      events.push({
        type: 'tactic.accepted',
        unitId: order.unitId,
        tacticId: order.tacticId,
        targetUnitId: order.targetUnitId,
        damageDealt: result.damageDealt,
        troopsHealed: result.troopsHealed,
        moraleGained: result.moraleGained,
      });
      for (const snapshot of before)
        recordUnitChange(events, snapshot.unit, 'tactic', snapshot.troops, snapshot.morale);
    }
  }
}

function advanceMovement(battle: BattleState, events: BattleTickEventPayload[]): Set<string> {
  const moved = new Set<string>();
  for (const unit of [...battle.units].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!activeUnit(unit) || unit.moveTargetJinId === null || isTacticImmobile(unit)) continue;
    if (!hasCavalryTactic(unit)) moved.add(unit.id);
    const edge = jinEdge(battle, unit.jinId, unit.moveTargetJinId);
    if (!edge) {
      unit.moveTargetJinId = null;
      unit.moveProgress = 0;
      continue;
    }
    unit.moveProgress += 1;
    if (unit.moveProgress < edge.moveCost) continue;
    const occupants = battle.units.filter(
      (candidate) =>
        candidate.id !== unit.id &&
        candidate.side === unit.side &&
        candidate.jinId === unit.moveTargetJinId &&
        activeUnit(candidate),
    ).length;
    if (occupants < BAL.jinStackLimit) {
      const fromJinId = unit.jinId;
      unit.jinId = unit.moveTargetJinId;
      if (unit.jinId !== fromJinId)
        events.push({
          type: 'unit.arrived',
          unitId: unit.id,
          fromJinId,
          toJinId: unit.jinId,
          reason: 'move',
        });
    }
    unit.moveTargetJinId = null;
    unit.moveProgress = 0;
  }
  return moved;
}

function chooseTarget(
  battle: Readonly<BattleState>,
  attacker: Readonly<BattleUnit>,
): BattleUnit | undefined {
  const legal = battle.units
    .filter(
      (candidate) =>
        candidate.side !== attacker.side &&
        activeUnit(candidate) &&
        unitsAreAdjacent(battle, attacker as BattleUnit, candidate),
    )
    .sort((a, b) => {
      const sameA = a.jinId === attacker.jinId ? 0 : 1;
      const sameB = b.jinId === attacker.jinId ? 0 : 1;
      return sameA - sameB || a.id.localeCompare(b.id);
    });
  const forcedTarget = forcedAttackTargetUnitId(attacker);
  const specified = legal.find(
    (candidate) => candidate.id === (forcedTarget ?? attacker.attackTargetUnitId),
  );
  return specified ?? legal[0];
}

function resolveDamage(
  state: Readonly<GameState>,
  battle: BattleState,
  moved: ReadonlySet<string>,
  events: BattleTickEventPayload[],
): void {
  const damageByTarget = new Map<string, number>();
  const causedDamage = new Set<string>();
  const troopsBefore = new Map(battle.units.map((unit) => [unit.id, unit.troops]));
  for (const unit of [...battle.units].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!activeUnit(unit) || moved.has(unit.id)) continue;
    const target = chooseTarget(battle, unit);
    if (!target) continue;
    const targetJin = battle.jins.find((jin) => jin.id === target.jinId)!;
    const defenseBonus = targetJin.owner === target.side ? targetJin.defenseBonus : 0;
    const damage = Math.max(
      0,
      Math.round(
        computeBattleUnitAttackPower(state, unit, tacticAttackMultiplier(unit)) *
          BAL.battleTickDamageRate *
          (1 - defenseBonus) *
          tacticDamageTakenMultiplier(target),
      ),
    );
    if (damage > 0) causedDamage.add(unit.id);
    damageByTarget.set(target.id, (damageByTarget.get(target.id) ?? 0) + damage);
  }
  for (const unit of battle.units) {
    const moraleBefore = unit.morale;
    const received = Math.min(unit.troops, damageByTarget.get(unit.id) ?? 0);
    unit.troops -= received;
    const before = troopsBefore.get(unit.id) ?? 0;
    if (received >= before * 0.03 && received > 0) unit.morale -= 2;
    else if (received > 0) unit.morale -= 1;
    if (causedDamage.has(unit.id) && received === 0) unit.morale += 1;
    unit.morale = clamp(unit.morale, 0, 100);
    const moraleFloor = tacticMoraleFloor(unit);
    if (moraleFloor !== null) unit.morale = Math.max(unit.morale, moraleFloor);
    recordUnitChange(events, unit, 'combat', before, moraleBefore);
    const general = state.officers[unit.generalId];
    const routThreshold =
      BAL.moraleBreakThreshold +
      (general ? traitModifier(general, 'battle.routThresholdAdd').add : 0);
    if (
      !unit.routed &&
      (unit.troops <= 0 ||
        unit.morale <= routThreshold ||
        unit.troops < unit.battleInitialTroops * BAL.routTroopRatio)
    ) {
      unit.routed = true;
      unit.moveTargetJinId = null;
      unit.moveProgress = 0;
      events.push({ type: 'unit.routed', unitId: unit.id });
    }
  }
}

function ownHonjin(battle: Readonly<BattleState>, side: BattleSide): Jin {
  return battle.jins.find((jin) => jin.isHonjin && jin.col === (side === 'attacker' ? 0 : 4))!;
}

function nextJinToward(
  battle: Readonly<BattleState>,
  from: string,
  to: string,
): string | undefined {
  if (from === to) return undefined;
  const parent = new Map<string, string>();
  const queue = [from];
  const visited = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbor of adjacentJinIds(battle, current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);
      if (neighbor === to) {
        let step = to;
        while (parent.get(step) !== from) step = parent.get(step)!;
        return step;
      }
      queue.push(neighbor);
    }
  }
  return undefined;
}

function retreatRoutedUnits(
  state: Readonly<GameState>,
  battle: BattleState,
  events: BattleTickEventPayload[],
): void {
  for (const unit of battle.units
    .filter((candidate) => candidate.routed && !candidate.exited)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (unit.troops <= 0) {
      unit.exited = true;
      events.push({ type: 'unit.exited', unitId: unit.id });
      continue;
    }
    const honjin = ownHonjin(battle, unit.side);
    if (unit.jinId === honjin.id) {
      unit.exited = true;
      events.push({ type: 'unit.exited', unitId: unit.id });
      continue;
    }
    const next = nextJinToward(battle, unit.jinId, honjin.id);
    if (!next) {
      unit.exited = true;
      events.push({ type: 'unit.exited', unitId: unit.id });
      continue;
    }
    const fromJinId = unit.jinId;
    unit.jinId = next;
    events.push({
      type: 'unit.arrived',
      unitId: unit.id,
      fromJinId,
      toJinId: next,
      reason: 'retreat',
    });
    const pursuers = battle.units.filter(
      (candidate) =>
        candidate.side !== unit.side && activeUnit(candidate) && candidate.jinId === next,
    );
    if (pursuers.length > 0) {
      const pursuit = Math.round(
        pursuers.reduce(
          (sum, candidate) => sum + computeBattleUnitAttackPower(state, candidate),
          0,
        ) *
          BAL.pursuitDamageRate *
          0.5,
      );
      const troopsBefore = unit.troops;
      unit.troops = Math.max(0, unit.troops - pursuit);
      recordUnitChange(events, unit, 'pursuit', troopsBefore, unit.morale);
      if (unit.troops === 0) {
        unit.exited = true;
        events.push({ type: 'unit.exited', unitId: unit.id });
      }
    }
  }
}

function captureJins(
  battle: BattleState,
  events: BattleTickEventPayload[],
): BattleSide | undefined {
  for (const unit of battle.units.filter(activeUnit).sort((a, b) => a.id.localeCompare(b.id))) {
    const targetUnitId = fireArrowTargetUnitId(unit);
    if (targetUnitId === null) continue;
    const target = battle.units.find((candidate) => candidate.id === targetUnitId);
    const targetJin = target ? battle.jins.find((jin) => jin.id === target.jinId) : undefined;
    if (!targetJin || targetJin.owner === unit.side) continue;
    const flagPowerBefore = targetJin.flagPower;
    targetJin.flagPower -= BAL.tacFireFlagDamage;
    events.push({
      type: 'flag.damaged',
      jinId: targetJin.id,
      source: 'fireArrow',
      amount: BAL.tacFireFlagDamage,
      flagPowerBefore,
      flagPowerAfter: targetJin.flagPower,
    });
    if (targetJin.flagPower > 0) continue;
    const fallenSide = targetJin.isHonjin
      ? targetJin.col === 0
        ? 'attacker'
        : 'defender'
      : undefined;
    const ownerBefore = targetJin.owner;
    targetJin.owner = unit.side;
    targetJin.flagPower = targetJin.flagPowerMax * BAL.flagResetRatio;
    events.push({
      type: 'jin.captured',
      jinId: targetJin.id,
      ownerBefore,
      ownerAfter: targetJin.owner,
      flagPower: targetJin.flagPower,
    });
    if (fallenSide) {
      battle.honjinFallenTick = battle.tick;
      return fallenSide === 'attacker' ? 'defender' : 'attacker';
    }
  }
  for (const jin of [...battle.jins].sort((a, b) => a.id.localeCompare(b.id))) {
    const occupants = battle.units.filter((unit) => activeUnit(unit) && unit.jinId === jin.id);
    const sides = new Set(occupants.map((unit) => unit.side));
    if (sides.size !== 1) continue;
    const side = occupants[0]!.side;
    if (jin.owner === side) continue;
    const flagPowerBefore = jin.flagPower;
    const amount = occupants.reduce((sum, unit) => sum + unit.troops, 0) * BAL.flagCaptureRate;
    jin.flagPower -= amount;
    events.push({
      type: 'flag.damaged',
      jinId: jin.id,
      source: 'occupation',
      amount,
      flagPowerBefore,
      flagPowerAfter: jin.flagPower,
    });
    if (jin.flagPower > 0) continue;
    const fallenSide = jin.isHonjin ? (jin.col === 0 ? 'attacker' : 'defender') : undefined;
    const ownerBefore = jin.owner;
    jin.owner = side;
    jin.flagPower = jin.flagPowerMax * BAL.flagResetRatio;
    events.push({
      type: 'jin.captured',
      jinId: jin.id,
      ownerBefore,
      ownerAfter: jin.owner,
      flagPower: jin.flagPower,
    });
    if (fallenSide) {
      battle.honjinFallenTick = battle.tick;
      return fallenSide === 'attacker' ? 'defender' : 'attacker';
    }
  }
  return undefined;
}

function accumulateSaihai(state: Readonly<GameState>, battle: BattleState): void {
  for (const side of ['attacker', 'defender'] as const) {
    const maxLdr = battle.units
      .filter((unit) => unit.side === side)
      .reduce((max, unit) => {
        const officer = state.officers[unit.generalId];
        return Math.max(max, officer ? getEffectiveOfficerStat(officer, 'ldr') : 0);
      }, 0);
    battle.saihai[side] = Math.min(
      BAL.saihaiMax,
      battle.saihai[side] + BAL.saihaiBase + Math.floor(maxLdr * BAL.saihaiLdrFactor),
    );
  }
  decrementTacticTimers(battle);
}

function sidePower(
  state: Readonly<GameState>,
  battle: Readonly<BattleState>,
  side: BattleSide,
): number {
  return battle.units
    .filter((unit) => unit.side === side && unit.troops > 0)
    .reduce((sum, unit) => sum + computeBattleUnitAttackPower(state, unit), 0);
}

function checkWinner(
  state: Readonly<GameState>,
  battle: Readonly<BattleState>,
  honjinWinner?: BattleSide,
): BattleSide | undefined {
  if (honjinWinner) return honjinWinner;
  const attackerDefeated = battle.units
    .filter((unit) => unit.side === 'attacker')
    .every((unit) => unit.routed || unit.troops <= 0);
  const defenderDefeated = battle.units
    .filter((unit) => unit.side === 'defender')
    .every((unit) => unit.routed || unit.troops <= 0);
  if (attackerDefeated !== defenderDefeated) return attackerDefeated ? 'defender' : 'attacker';
  if (!attackerDefeated && battle.tick < BAL.kassenMaxTicks) return undefined;
  const attackerPower = sidePower(state, battle, 'attacker');
  const defenderPower = sidePower(state, battle, 'defender');
  return attackerPower >= defenderPower * BAL.kassenTiebreakMult ? 'attacker' : 'defender';
}

function detachDestroyedArmy(state: GameState, army: Army): void {
  for (const officerId of [army.leaderId, ...army.deputyIds]) {
    const officer = state.officers[officerId];
    if (!officer) continue;
    officer.armyId = null;
    officer.locationCastleId =
      state.castles[army.originCastleId]?.ownerClanId === army.clanId
        ? army.originCastleId
        : officer.debutCastleId;
  }
  delete state.armies[army.id];
}

function routeStrategyArmy(state: GameState, army: Army, deferred: GameEvent[]): void {
  const choice = nearestOwnedCastleByHops(state, army.clanId, army.posNodeId);
  army.status = 'routed';
  army.mission = 'return';
  army.targetNodeId = choice?.castle.id ?? army.targetNodeId;
  army.path = choice?.path.nodes ?? [army.posNodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  delete army.reversingEdgeEndNodeId;
  deferred.push({
    type: 'army.routed',
    day: state.time.day,
    clanIds: [army.clanId],
    armyId: army.id,
    clanId: army.clanId,
    nodeId: army.posNodeId,
    leaderId: army.leaderId,
  });
}

function retreatStrategyArmyOneHop(state: GameState, army: Army): void {
  const choice = nearestOwnedCastleByHops(state, army.clanId, army.posNodeId);
  const nextNode = choice?.path.nodes[1];
  if (nextNode !== undefined) army.posNodeId = nextNode;
  army.status = 'holding';
  army.targetNodeId = army.posNodeId;
  army.path = [army.posNodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  delete army.reversingEdgeEndNodeId;
}

function battlePrisonCastle(
  state: Readonly<GameState>,
  battle: Readonly<BattleState>,
  winnerSide: BattleSide,
  winnerClanId: ClanId,
): CastleId | undefined {
  const winningArmy = battle.units
    .filter((unit) => unit.side === winnerSide)
    .map((unit) => state.armies[unit.armyId])
    .filter((army): army is Army => army !== undefined && army.soldiers > 0)
    .sort((a, b) => b.soldiers - a.soldiers || a.id.localeCompare(b.id))[0];
  if (
    winningArmy !== undefined &&
    state.castles[winningArmy.originCastleId]?.ownerClanId === winnerClanId
  ) {
    return winningArmy.originCastleId;
  }
  return Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === winnerClanId && castle.directControl)
    .sort((a, b) => b.soldiers - a.soldiers || a.id.localeCompare(b.id))[0]?.id;
}

function canReplaceCapturedLeader(state: Readonly<GameState>, officerId: OfficerId): boolean {
  const officer = state.officers[officerId];
  if (officer?.clanId === null || officer?.clanId === undefined) return false;
  const clan = state.clans[officer.clanId];
  if (clan?.leaderId !== officer.id) return true;
  return Object.values(state.officers).some(
    (candidate) =>
      candidate.id !== officer.id &&
      candidate.status === 'serving' &&
      candidate.clanId === officer.clanId &&
      candidate.hasComeOfAge,
  );
}

function captureDefeatedGeneral(
  state: GameState,
  officerId: OfficerId,
  byClanId: ClanId,
  prisonCastleId: CastleId,
  deferred: GameEvent[],
): void {
  const officer = state.officers[officerId];
  if (
    officer === undefined ||
    officer.status !== 'serving' ||
    officer.clanId === null ||
    !canReplaceCapturedLeader(state, officerId)
  ) {
    return;
  }
  const originalClanId = officer.clanId;
  const wasClanLeader = state.clans[originalClanId]?.leaderId === officer.id;
  const army = officer.armyId === null ? undefined : state.armies[officer.armyId];
  if (army !== undefined) {
    if (army.leaderId === officer.id) {
      const successor = army.deputyIds.find(
        (candidate) => state.officers[candidate]?.status === 'serving',
      );
      if (successor !== undefined) {
        army.leaderId = successor;
        army.deputyIds = army.deputyIds.filter(
          (candidate) => candidate !== successor && candidate !== officer.id,
        );
      } else {
        for (const deputyId of army.deputyIds) {
          const deputy = state.officers[deputyId];
          if (deputy === undefined) continue;
          deputy.armyId = null;
          deputy.locationCastleId = prisonCastleId;
        }
        delete state.armies[army.id];
      }
    } else {
      army.deputyIds = army.deputyIds.filter((candidate) => candidate !== officer.id);
    }
  }
  deferred.push(...releaseOfficerAssignments(state, officer.id));
  officer.status = 'captive';
  officer.armyId = null;
  officer.locationCastleId = prisonCastleId;
  officer.capturedByClanId = byClanId;
  deferred.push({
    type: 'officer.captured',
    day: state.time.day,
    clanIds: [originalClanId, byClanId],
    officerId: officer.id,
    byClanId,
  });
  if (wasClanLeader) {
    const succession = appointClanSuccessor(state, originalClanId, officer.id, true);
    if (succession !== null) deferred.push(succession);
  }
}

function resolveDefeatedGenerals(
  state: GameState,
  battle: Readonly<BattleState>,
  winnerSide: BattleSide,
  deferred: GameEvent[],
): void {
  const loserSide: BattleSide = winnerSide === 'attacker' ? 'defender' : 'attacker';
  const winnerClanId = sideClanId(battle, winnerSide);
  const prisonCastleId = battlePrisonCastle(state, battle, winnerSide, winnerClanId);
  const rng = createRngStream(state.rng, 'misc');
  for (const unit of battle.units
    .filter(
      (candidate) => candidate.side === loserSide && (candidate.routed || candidate.troops <= 0),
    )
    .sort((a, b) => a.id.localeCompare(b.id))) {
    const officer = state.officers[unit.generalId];
    if (officer === undefined || officer.status !== 'serving') continue;
    if (rng.chance(BAL.battleDeathChanceDefeatGeneral)) {
      deferred.push(...dieOfficer(state, officer.id, battle.nodeId));
      continue;
    }
    if (rng.chance(BAL.battleCaptureChanceDefeatGeneral) && prisonCastleId !== undefined) {
      captureDefeatedGeneral(state, officer.id, winnerClanId, prisonCastleId, deferred);
    }
  }
}

/** Atomic strategy-layer writeback: no Army/FieldCombat mutation occurs before this function. */
function resolveBattle(state: GameState, battle: BattleState, winnerSide: BattleSide): void {
  const armies = new Map<ArmyId, Army>();
  for (const unit of battle.units) {
    const army = state.armies[unit.armyId];
    if (!army) {
      throw new CoreError('DATA_INTEGRITY', `合戰 ${battle.id} 引用不存在的部隊 ${unit.armyId}`, {
        battleId: battle.id,
        armyId: unit.armyId,
      });
    }
    armies.set(unit.armyId, army);
  }
  const loserSide: BattleSide = winnerSide === 'attacker' ? 'defender' : 'attacker';
  const winnerClanId = sideClanId(battle, winnerSide);
  const loserClanId = sideClanId(battle, loserSide);
  const attackerLosses = battle.units
    .filter((unit) => unit.side === 'attacker')
    .reduce((sum, unit) => sum + Math.max(0, unit.battleInitialTroops - unit.troops), 0);
  const defenderLosses = battle.units
    .filter((unit) => unit.side === 'defender')
    .reduce((sum, unit) => sum + Math.max(0, unit.battleInitialTroops - unit.troops), 0);
  const aweLevel = judgeBattleAwe(battle, winnerSide);
  // Winner participation includes routed/exited/depleted contingents. Snapshot
  // their actual Army rosters before strategic writeback can delete assignments.
  // 06 §3.5/§5.7: commander rounding precedes the shared trait/experience award.
  const meritRecipients = new Map<OfficerId, number>();
  // judgeBattleAwe guarantees at least small for every tactical victory (07 §3.10).
  const victoryMerit = BAL.meritBattleWin + BAL.meritBattleAweBonus;
  for (const unit of battle.units) {
    if (unit.side !== winnerSide) continue;
    const army = armies.get(unit.armyId)!;
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      const officer = state.officers[officerId];
      if (officer?.status !== 'serving' || officer.clanId !== army.clanId) continue;
      meritRecipients.set(
        officerId,
        Math.round(victoryMerit * (officerId === army.leaderId ? BAL.meritCommanderMult : 1)),
      );
    }
  }
  const result: BattleResult = {
    winnerSide,
    endTick: battle.tick,
    attackerLosses,
    defenderLosses,
    aweLevel,
  };
  const deferred: GameEvent[] = [];

  for (const unit of battle.units) {
    const army = armies.get(unit.armyId)!;
    army.soldiers = unit.troops;
    army.morale = unit.morale;
    army.battleId = null;
    if (army.soldiers <= 0) {
      detachDestroyedArmy(state, army);
      continue;
    }
    if (unit.side === winnerSide) {
      army.morale = Math.min(100, army.morale + BAL.moraleVictoryGain);
      army.status = unit.strategyStatus === 'engaged' ? 'holding' : unit.strategyStatus;
    } else if (unit.routed) {
      routeStrategyArmy(state, army, deferred);
    } else {
      army.morale = Math.max(0, army.morale - BAL.moraleDefeatLoss);
      retreatStrategyArmyOneHop(state, army);
    }
  }

  const combat = state.fieldCombats[battle.fieldCombatId];
  if (combat) {
    for (const armyId of [...combat.sideA.armyIds, ...combat.sideB.armyIds]) {
      const army = state.armies[armyId];
      if (!army || army.battleId !== null || army.status !== 'engaged') continue;
      army.status = army.siegeId === null ? 'holding' : 'sieging';
    }
    delete state.fieldCombats[combat.id];
  }

  resolveDefeatedGenerals(state, battle, winnerSide, deferred);

  for (const [officerId, amount] of meritRecipients) {
    gainMerit(state.officers[officerId]!, amount, ['ldr', 'val']);
  }

  deferred.push(...applyAwe(state, aweLevel, battle.nodeId, winnerClanId, loserClanId, battle.id), {
    type: 'battle.ended',
    day: state.time.day,
    clanIds: [battle.attackerClanId, battle.defenderClanId],
    battleId: battle.id,
    winnerClanId,
    aweLevel,
    attackerLosses,
    defenderLosses,
    nodeId: battle.nodeId,
    attackerClanId: battle.attackerClanId,
    defenderClanId: battle.defenderClanId,
  });
  battle.result = result;
  state.meta.deferredEvents.push(...deferred);
}

export function advanceBattleTick(
  state: GameState,
  battleId: BattleId,
  orders: readonly BattleCommand[] = [],
): BattleTickResult {
  const battle = state.battles[battleId];
  if (!battle) throw new CoreError('DATA_INTEGRITY', `合戰 ${battleId} 不存在`, { battleId });
  if (battle.result) {
    throw new CoreError('INVALID_COMMAND_SHAPE', `合戰 ${battleId} 已結束，不得再推進`, {
      battleId,
    });
  }

  battle.tick += 1;
  const events: BattleTickEventPayload[] = [];
  const delegationOrders = orders.filter((order) => order.kind === 'toggleDelegate');
  processOrders(battle, delegationOrders, events);
  const delegatedOrders = createDelegatedBattleOrders(state, battle);
  const tickOrders = [
    ...orders.filter((order) => order.kind !== 'toggleDelegate'),
    ...delegatedOrders,
  ];
  processOrders(battle, tickOrders, events);
  applyTacticOrders(state, battle, tickOrders, events);
  const moved = advanceMovement(battle, events);
  resolveDamage(state, battle, moved, events);
  retreatRoutedUnits(state, battle, events);
  const honjinWinner = captureJins(battle, events);
  accumulateSaihai(state, battle);
  const winner = checkWinner(state, battle, honjinWinner);
  if (winner) {
    resolveBattle(state, battle, winner);
    const result = battle.result!;
    events.push({
      type: 'battle.resolved',
      winnerSide: result.winnerSide,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      aweLevel: result.aweLevel,
    });
  }
  return {
    battleId,
    tick: battle.tick,
    resolved: battle.result !== null,
    events: events.map((event, index) => ({ ...event, sequence: index + 1 })),
  };
}

/** Result modal acknowledgement: resolved battles remain serializable until the UI explicitly closes them. */
export function closeResolvedBattle(state: GameState, battleId: BattleId): void {
  const battle = state.battles[battleId];
  if (!battle) throw new CoreError('DATA_INTEGRITY', `合戰 ${battleId} 不存在`, { battleId });
  if (battle.result === null) {
    throw new CoreError('INVALID_COMMAND_SHAPE', `合戰 ${battleId} 尚未結束，不得關閉`, {
      battleId,
    });
  }
  delete state.battles[battleId];
}
