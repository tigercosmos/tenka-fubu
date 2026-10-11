import { BAL } from '@core/balance';
import { CoreError } from '@core/errors';
import { validateState } from '@core/state/invariants';
import type { GameState } from '@core/state/gameState';

/** 02 §5.2: production (including debug URLs) never runs this diagnostic. */
export function isDevInvariantTick(version: number, isDev = import.meta.env.DEV): boolean {
  return isDev && version > 0 && version % BAL.devInvariantCheckEveryDays === 0;
}

/** Only completed strategic ticks advance stateVersion; no state/RNG writes or rollback. */
export function checkDevInvariantsAfterTick(
  game: GameState,
  beforeVersion: number,
  isDev = import.meta.env.DEV,
): void {
  if (
    game.meta.stateVersion === beforeVersion ||
    !isDevInvariantTick(game.meta.stateVersion, isDev)
  )
    return;
  const violations = validateState(game);
  if (violations.length > 0)
    throw new CoreError(
      'INVARIANT_VIOLATION',
      violations
        .map(({ inv, message, refs }) => `${inv}: ${message} [${refs.join(', ')}]`)
        .join('\n'),
      violations,
    );
}
