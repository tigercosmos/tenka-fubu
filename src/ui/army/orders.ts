import { validateCommand, armyPhysicalLeg, planArmyReroute } from '@core/index';
import type { Command, ValidationResult } from '@core/commands/types';
import type { ArmyStatus } from '@core/state/enums';
import type { GameState } from '@core/state/gameState';
import type { ArmyId, MapNodeId } from '@core/state/ids';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CommandDispatchResult } from '@app/bridge';

export interface ArmyTargetPreview {
  readonly targetNodeId: MapNodeId;
  readonly name: string;
  readonly nodeIds: readonly MapNodeId[];
  readonly nodeNames: readonly string[];
  /** Speed-1 travel estimate from the actual physical point, with entered-leg cost preserved. */
  readonly pathEstimateDays: number;
  readonly physicalLeg?: Readonly<{ fromName: string; endName: string; reversing: boolean }>;
}
export interface ArmyKassenView {
  readonly fieldCombatId: string;
  readonly validation: ValidationResult;
  readonly pending: boolean;
  readonly canRequest: boolean;
}
export interface ArmyOrdersView {
  readonly armyId: ArmyId;
  readonly status: ArmyStatus;
  readonly fromNodeId: MapNodeId;
  readonly fromName: string;
  readonly targetNodeId: MapNodeId | null;
  readonly targetName: string | null;
  readonly pendingTargetNodeId: MapNodeId | null;
  readonly pendingRecall: boolean;
  readonly retargetValidation: ValidationResult;
  readonly canRetarget: boolean;
  readonly recallValidation: ValidationResult;
  readonly canRecall: boolean;
  readonly kassen: readonly ArmyKassenView[];
}
export interface ArmyOrderPorts {
  getGame(): GameState | null;
  getPendingCommands(): readonly Command[];
  dispatch(command: Command): CommandDispatchResult;
}
export type ArmyOrderRequestResult =
  | Readonly<{ status: 'submitted' | 'stale' | 'unavailable' | 'queued' | 'unchanged' }>
  | Readonly<{ status: 'rejected'; reason: string; params?: Record<string, string | number> }>;

const detachedValidation = (result: ValidationResult): ValidationResult =>
  result.ok
    ? Object.freeze({ ok: true })
    : Object.freeze({
        ...result,
        ...(result.params === undefined ? {} : { params: Object.freeze({ ...result.params }) }),
      });
const nodeName = (game: Readonly<GameState>, id: MapNodeId): string =>
  game.castles[id as keyof typeof game.castles]?.name ??
  game.districts[id as keyof typeof game.districts]?.name ??
  id;
function movementPending(game: Readonly<GameState>, armyId: ArmyId, commands: readonly Command[]) {
  let target: MapNodeId | null = null,
    recall = false;
  for (const command of commands) {
    if (
      command.clanId !== game.meta.playerClanId ||
      !('armyId' in command) ||
      command.armyId !== armyId
    )
      continue;
    if (command.type === 'setArmyTarget') target = command.targetNodeId;
    if (command.type === 'recallArmy') recall = true;
  }
  return { target, recall };
}
function ownedArmy(game: Readonly<GameState> | null, armyId: ArmyId) {
  const army = game?.armies[armyId];
  return game !== null && army?.clanId === game.meta.playerClanId ? army : undefined;
}

/** Fresh authority checks use the central validator; the nearby probe is not a full route scan. */
export function selectArmyOrders(
  game: Readonly<GameState> | null,
  armyId: ArmyId,
  pendingCommands: readonly Command[] = [],
): ArmyOrdersView | null {
  const army = ownedArmy(game, armyId);
  if (!game || !army) return null;
  const pending = movementPending(game, armyId, pendingCommands);
  const targetCommand = (targetNodeId: MapNodeId): Command => ({
    type: 'setArmyTarget',
    clanId: game.meta.playerClanId,
    armyId,
    targetNodeId,
  });
  const neighbors = Object.values(game.roads)
    .flatMap((edge) =>
      edge.a === army.posNodeId ? [edge.b] : edge.b === army.posNodeId ? [edge.a] : [],
    )
    .sort();
  let retargetValidation = validateCommand(game, targetCommand(army.posNodeId));
  for (const neighbor of neighbors) {
    const validation = validateCommand(game, targetCommand(neighbor));
    if (validation.ok) {
      retargetValidation = validation;
      break;
    }
  }
  const recallValidation = validateCommand(game, {
    type: 'recallArmy',
    clanId: game.meta.playerClanId,
    armyId,
  });
  const pendingKassen = pendingCommands.some(
    (command) => command.type === 'startKassen' && command.clanId === game.meta.playerClanId,
  );
  const kassen = Object.keys(game.fieldCombats)
    .sort()
    .flatMap((id) => {
      const combat = game.fieldCombats[id]!;
      if (![...combat.sideA.armyIds, ...combat.sideB.armyIds].includes(armyId)) return [];
      const validation = detachedValidation(
        validateCommand(game, {
          type: 'startKassen',
          clanId: game.meta.playerClanId,
          fieldCombatId: id,
        }),
      );
      return [
        Object.freeze({
          fieldCombatId: id,
          validation,
          pending: pendingKassen,
          canRequest: validation.ok && !pendingKassen,
        }),
      ];
    });
  const movementQueued = pending.target !== null || pending.recall;
  return Object.freeze({
    armyId,
    status: army.status,
    fromNodeId: army.posNodeId,
    fromName: nodeName(game, army.posNodeId),
    targetNodeId: army.targetNodeId,
    targetName: army.targetNodeId === null ? null : nodeName(game, army.targetNodeId),
    pendingTargetNodeId: pending.target,
    pendingRecall: pending.recall,
    retargetValidation: detachedValidation(retargetValidation),
    canRetarget: retargetValidation.ok && !movementQueued,
    recallValidation: detachedValidation(recallValidation),
    canRecall: recallValidation.ok && !movementQueued && army.status !== 'returning',
    kassen: Object.freeze(kassen),
  });
}

/** Only currently legal destinations. No cached graph can conceal in-place ownership/road changes. */
export function getArmyTargetPreviews(
  game: Readonly<GameState> | null,
  armyId: ArmyId,
  pendingCommands: readonly Command[] = [],
): readonly ArmyTargetPreview[] {
  const army = ownedArmy(game, armyId);
  if (!game || !army) return Object.freeze([]);
  const pending = movementPending(game, armyId, pendingCommands);
  if (pending.target !== null || pending.recall) return Object.freeze([]);
  // Reject authority/lifecycle failures before constructing any map projection.
  if (!selectArmyOrders(game, armyId)?.retargetValidation.ok) return Object.freeze([]);
  const graph = buildMapGraph(game.castles, game.districts, game.roads);
  const rows: ArmyTargetPreview[] = [];
  for (const targetNodeId of [...graph.nodes.keys()].sort()) {
    const command: Command = {
      type: 'setArmyTarget',
      clanId: game.meta.playerClanId,
      armyId,
      targetNodeId,
    };
    if (!validateCommand(game, command).ok) continue;
    const path = planArmyReroute(game, army, targetNodeId);
    if (path === null || path.totalDays <= 0) continue;
    const leg = armyPhysicalLeg(army);
    rows.push(
      Object.freeze({
        targetNodeId,
        name: nodeName(game, targetNodeId),
        nodeIds: Object.freeze([...path.nodes]),
        nodeNames: Object.freeze(path.nodes.map((id) => nodeName(game, id))),
        pathEstimateDays: path.totalDays,
        ...(leg === null
          ? {}
          : {
              physicalLeg: Object.freeze({
                fromName: nodeName(game, leg.from),
                endName: nodeName(game, leg.end),
                reversing: path.reversingEnd !== null,
              }),
            }),
      }),
    );
  }
  return Object.freeze(rows);
}

function request(
  expectedGame: GameState,
  armyId: ArmyId,
  action: Extract<Command, { type: 'setArmyTarget' | 'recallArmy' | 'startKassen' }>,
  ports: ArmyOrderPorts,
): ArmyOrderRequestResult {
  const game = ports.getGame();
  if (game !== expectedGame) return { status: 'stale' };
  const pending = ports.getPendingCommands();
  if (ports.getGame() !== game) return { status: 'stale' };
  const army = ownedArmy(game, armyId);
  if (!army) return { status: 'unavailable' };
  if (action.type === 'startKassen') {
    const combat = game.fieldCombats[action.fieldCombatId];
    if (!combat || ![...combat.sideA.armyIds, ...combat.sideB.armyIds].includes(armyId))
      return { status: 'unavailable' };
    if (
      pending.some(
        (command) => command.type === 'startKassen' && command.clanId === game.meta.playerClanId,
      )
    )
      return { status: 'queued' };
  } else {
    const movement = movementPending(game, armyId, pending);
    if (movement.target !== null || movement.recall) return { status: 'queued' };
  }
  const validation = validateCommand(game, action);
  if (!validation.ok)
    return {
      status: 'rejected',
      reason: validation.reasonKey,
      ...(validation.params === undefined ? {} : { params: { ...validation.params } }),
    };
  if (
    (action.type === 'setArmyTarget' &&
      army.status === 'marching' &&
      army.targetNodeId === action.targetNodeId) ||
    (action.type === 'recallArmy' && army.status === 'returning')
  )
    return { status: 'unchanged' };
  if (ports.getGame() !== game) return { status: 'stale' };
  const result = ports.dispatch(action);
  return result.ok
    ? { status: 'submitted' }
    : {
        status: 'rejected',
        reason: result.reason,
        ...(result.params === undefined ? {} : { params: { ...result.params } }),
      };
}
export function requestArmyTarget(
  expectedGame: GameState,
  armyId: ArmyId,
  targetNodeId: MapNodeId,
  ports: ArmyOrderPorts,
): ArmyOrderRequestResult {
  return request(
    expectedGame,
    armyId,
    { type: 'setArmyTarget', clanId: expectedGame.meta.playerClanId, armyId, targetNodeId },
    ports,
  );
}
export function requestArmyRecall(
  expectedGame: GameState,
  armyId: ArmyId,
  ports: ArmyOrderPorts,
): ArmyOrderRequestResult {
  return request(
    expectedGame,
    armyId,
    { type: 'recallArmy', clanId: expectedGame.meta.playerClanId, armyId },
    ports,
  );
}
export function requestArmyKassen(
  expectedGame: GameState,
  armyId: ArmyId,
  fieldCombatId: string,
  ports: ArmyOrderPorts,
): ArmyOrderRequestResult {
  return request(
    expectedGame,
    armyId,
    { type: 'startKassen', clanId: expectedGame.meta.playerClanId, fieldCombatId },
    ports,
  );
}
