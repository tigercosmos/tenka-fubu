import type { GameState } from '../state/gameState';
import { TAIMEI_CATALOG } from '../systems/events/taimeiCatalog';

const ids: ReadonlySet<string> = new Set(TAIMEI_CATALOG.map((def) => def.id));
const day = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Preserve the stored lifecycle; overdue active effects expire through the normal Step 3. */
export function validateSavedTaimei(state: Pick<GameState, 'clans'>): boolean {
  return Object.values(state.clans).every((clan) => {
    const value: unknown = clan.taimei;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== 3 ||
      !['activeTaimeiId', 'activeUntilDay', 'cooldownUntilDay'].every((key) =>
        Object.hasOwn(record, key),
      ) ||
      !day(record.activeUntilDay) ||
      !day(record.cooldownUntilDay)
    )
      return false;
    if (record.activeTaimeiId === null) return record.activeUntilDay === 0;
    return (
      typeof record.activeTaimeiId === 'string' &&
      ids.has(record.activeTaimeiId) &&
      record.cooldownUntilDay >= record.activeUntilDay
    );
  });
}
