import type { GameState } from '../../state/gameState';
import type { EventBinding, EventFlagKey } from './types';

/** Literal keys are opaque. Only the typed structure expands year/clan bindings. */
export function resolveEventFlagKey(
  key: EventFlagKey,
  state: Readonly<GameState>,
  binding: Readonly<EventBinding> | null,
): string | null {
  if (typeof key === 'string') return key;
  const clanId = key.clanId === '$clan' ? (binding?.clanId ?? null) : key.clanId;
  if (clanId === null || !state.clans[clanId]?.alive) return null;
  return `${key.prefix}${key.year === 'current' ? `.${state.time.year}` : ''}.${clanId}`;
}
