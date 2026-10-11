import type { GameState } from '../state/gameState';
import { REGION_VALUES } from '../state/enums';
import { isCastleId, isClanId, isDistrictId, isOfficerId } from '../state/ids';
import type { EventBinding, EventHookSignal } from '../systems/events/types';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactFields = (value: Record<string, unknown>, fields: readonly string[]): boolean =>
  Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const nullableId = (value: unknown, guard: (id: string) => boolean): boolean =>
  value === null || (typeof value === 'string' && guard(value));

/** Shape only: dead/destroyed facts and bindings must survive save/load without reinterpretation. */
export function validEventBinding(value: unknown): value is EventBinding {
  return (
    object(value) &&
    exactFields(
      value,
      Object.hasOwn(value, 'region')
        ? ['clanId', 'castleId', 'districtId', 'region']
        : ['clanId', 'castleId', 'districtId'],
    ) &&
    nullableId(value.clanId, isClanId) &&
    nullableId(value.castleId, isCastleId) &&
    nullableId(value.districtId, isDistrictId) &&
    (!Object.hasOwn(value, 'region') ||
      value.region === null ||
      (typeof value.region === 'string' &&
        (REGION_VALUES as readonly string[]).includes(value.region)))
  );
}

export function validEventHookSignal(value: unknown): value is EventHookSignal {
  return (
    object(value) &&
    exactFields(value, [
      'kind',
      'day',
      'clanIds',
      'castleId',
      'officerId',
      'winnerClanId',
      'playerInvolved',
    ]) &&
    typeof value.kind === 'string' &&
    ['castleFallen', 'clanDestroyed', 'leaderDied', 'battleEnded'].includes(value.kind) &&
    typeof value.day === 'number' &&
    Number.isSafeInteger(value.day) &&
    value.day >= 0 &&
    Array.isArray(value.clanIds) &&
    Array.from(value.clanIds).every((id: unknown) => typeof id === 'string' && isClanId(id)) &&
    nullableId(value.castleId, isCastleId) &&
    nullableId(value.officerId, isOfficerId) &&
    nullableId(value.winnerClanId, isClanId) &&
    typeof value.playerInvolved === 'boolean'
  );
}

/** Additive format3 compatibility; defaults apply only to absent fields, never malformed values. */
export function defaultOmittedEventPersistenceFields(state: GameState): void {
  if (!Object.hasOwn(state.events, 'pendingChoiceBinding'))
    state.events.pendingChoiceBinding = null;
  if (!Object.hasOwn(state.events, 'hookSignals')) state.events.hookSignals = [];
}

export function validateSavedEvents(state: Pick<GameState, 'events'>): boolean {
  return (
    (state.events.pendingChoiceBinding === null ||
      validEventBinding(state.events.pendingChoiceBinding)) &&
    (state.events.pendingChoiceEventId !== null || state.events.pendingChoiceBinding === null) &&
    Array.isArray(state.events.hookSignals) &&
    Array.from(state.events.hookSignals).every(validEventHookSignal)
  );
}
