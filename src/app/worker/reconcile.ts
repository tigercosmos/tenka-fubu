import type { GameState } from '../../core/state/gameState';
import type { SimulationWorkerResult } from './protocol';

interface Reconciliation {
  outputs: WeakMap<object, object>;
  claims: WeakMap<object, object>;
}
function reconcileValue(target: unknown, source: unknown, context: Reconciliation): unknown {
  if (source === null || typeof source !== 'object') return source;
  const previous = context.outputs.get(source);
  if (previous) return previous;
  const reusable =
    target !== null &&
    typeof target === 'object' &&
    (context.claims.get(target) === undefined || context.claims.get(target) === source);
  if (Array.isArray(source)) {
    const output = reusable && Array.isArray(target) ? target : [];
    context.outputs.set(source, output);
    context.claims.set(output, source);
    for (let index = 0; index < source.length; index++)
      output[index] = reconcileValue(output[index], source[index], context);
    output.length = source.length;
    return output;
  }
  const output: Record<string, unknown> =
    reusable && target !== null && typeof target === 'object' && !Array.isArray(target)
      ? (target as Record<string, unknown>)
      : {};
  context.outputs.set(source, output);
  context.claims.set(output, source);
  const input = source as Record<string, unknown>;
  for (const key of Object.keys(output)) if (!Object.hasOwn(input, key)) delete output[key];
  for (const key of Object.keys(input))
    if (key === '__proto__') {
      Object.defineProperty(output, key, {
        value: reconcileValue(
          Object.hasOwn(output, key) ? output[key] : undefined,
          input[key],
          context,
        ),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else
      output[key] = reconcileValue(
        Object.hasOwn(output, key) ? output[key] : undefined,
        input[key],
        context,
      );
  return output;
}

export function reconcileSnapshot(game: GameState, next: GameState): void {
  reconcileValue(game, next, { outputs: new WeakMap(), claims: new WeakMap() });
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
