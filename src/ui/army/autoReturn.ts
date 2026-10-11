import { validateCommand } from '@core/index';
import type { Command, ValidationResult } from '@core/commands/types';
import type { GameState } from '@core/state/gameState';
import type { ArmyId } from '@core/state/ids';
import type { CommandDispatchResult } from '@app/bridge';

export interface ArmyAutoReturnView {
  readonly armyId: ArmyId;
  /** Authoritative current flag; never replaced by an unexecuted command. */
  readonly enabled: boolean;
  /** Last matching queued intent, or null; false is a real pending value. */
  readonly pendingEnabled: boolean | null;
  readonly canToggle: boolean;
  readonly validation: ValidationResult;
}

function pendingValue(
  game: Readonly<GameState>,
  armyId: ArmyId,
  commands: readonly Command[],
): boolean | null {
  let value: boolean | null = null;
  for (const command of commands) {
    if (
      command.type === 'setAutoReturn' &&
      command.clanId === game.meta.playerClanId &&
      command.armyId === armyId
    )
      value = command.enabled;
  }
  return value;
}

/** Detached read; ownership does not require a direct-control castle or an inferred army position. */
export function selectArmyAutoReturn(
  game: Readonly<GameState> | null,
  armyId: ArmyId,
  pendingCommands: readonly Command[] = [],
): ArmyAutoReturnView | null {
  const army = game?.armies[armyId];
  if (game === null || army === undefined || army.clanId !== game.meta.playerClanId) return null;
  const pendingEnabled = pendingValue(game, armyId, pendingCommands);
  const verdict = validateCommand(game, {
    type: 'setAutoReturn',
    clanId: game.meta.playerClanId,
    armyId,
    enabled: !army.autoReturn,
  });
  const validation: ValidationResult = verdict.ok
    ? Object.freeze({ ok: true })
    : Object.freeze({
        ...verdict,
        ...(verdict.params === undefined ? {} : { params: Object.freeze({ ...verdict.params }) }),
      });
  return Object.freeze({
    armyId,
    enabled: army.autoReturn,
    pendingEnabled,
    canToggle: pendingEnabled === null && validation.ok,
    validation,
  });
}

export interface ArmyAutoReturnPorts {
  getGame(): GameState | null;
  /** Identity-scoped strategy queue snapshot; must not initialize or drain a queue. */
  getPendingCommands(): readonly Command[];
  dispatch(command: Command): CommandDispatchResult;
}

export type ArmyAutoReturnRequestResult =
  | Readonly<{ status: 'submitted' }>
  | Readonly<{ status: 'stale' | 'unavailable' | 'queued' | 'unchanged' }>
  | Readonly<{ status: 'rejected'; reason: string; params?: Record<string, string | number> }>;

/** Fresh synchronous checks, then ordinary dispatch only; success means queued, not executed. */
export function requestArmyAutoReturn(
  expectedGame: GameState,
  armyId: ArmyId,
  enabled: boolean,
  ports: ArmyAutoReturnPorts,
): ArmyAutoReturnRequestResult {
  const game = ports.getGame();
  if (game !== expectedGame) return { status: 'stale' };
  const pending = ports.getPendingCommands();
  // Even injected readers may replace the session; never submit into their replacement.
  if (ports.getGame() !== game) return { status: 'stale' };
  const view = selectArmyAutoReturn(game, armyId, pending);
  if (view === null) return { status: 'unavailable' };
  if (view.pendingEnabled !== null) return { status: 'queued' };
  const command: Command = {
    type: 'setAutoReturn',
    clanId: game.meta.playerClanId,
    armyId,
    enabled,
  };
  const verdict = validateCommand(game, command);
  if (!verdict.ok)
    return verdict.params === undefined
      ? { status: 'rejected', reason: verdict.reasonKey }
      : { status: 'rejected', reason: verdict.reasonKey, params: { ...verdict.params } };
  if (view.enabled === enabled) return { status: 'unchanged' };
  if (ports.getGame() !== game) return { status: 'stale' };
  const dispatched = ports.dispatch(command);
  if (dispatched.ok) return { status: 'submitted' };
  return dispatched.params === undefined
    ? { status: 'rejected', reason: dispatched.reason }
    : { status: 'rejected', reason: dispatched.reason, params: { ...dispatched.params } };
}
