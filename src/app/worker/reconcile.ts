import type { GameState } from '../../core/state/gameState';
import type { SimulationWorkerResult } from './protocol';

function reconcileValue(target: unknown, source: unknown): unknown {
  if (source === null || typeof source !== 'object') return source;
  if (Array.isArray(source)) {
    const output = Array.isArray(target) ? target : [];
    for (let index = 0; index < source.length; index++)
      output[index] = reconcileValue(output[index], source[index]);
    output.length = source.length;
    return output;
  }
  const output: Record<string, unknown> =
    target !== null && typeof target === 'object' && !Array.isArray(target)
      ? (target as Record<string, unknown>)
      : {};
  const input = source as Record<string, unknown>;
  for (const key of Object.keys(output)) if (!Object.hasOwn(input, key)) delete output[key];
  for (const key of Object.keys(input))
    Object.defineProperty(output, key, {
      value: reconcileValue(Object.hasOwn(output, key) ? output[key] : undefined, input[key]),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return output;
}

export function reconcileSnapshot(game: GameState, next: GameState): void {
  reconcileValue(game, next);
}

/** Apply only to the same session and version; retain live references held by map and UI subjects. */
export function reconcileWorkerTick(
  game: GameState,
  response: SimulationWorkerResult,
  options: { epoch: number; currentGame?: GameState | null },
): boolean {
  if (
    response.epoch !== options.epoch ||
    (options.currentGame !== undefined && options.currentGame !== game) ||
    game.meta.stateVersion !== response.beforeStateVersion ||
    response.state.meta.stateVersion !== response.beforeStateVersion + 1
  )
    return false;
  reconcileSnapshot(game, response.state);
  response.result.state = game;
  return true;
}
