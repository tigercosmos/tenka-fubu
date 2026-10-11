import type { GameState } from '../../state/gameState';
import { calendarToDay, dayToCalendar } from '../time';
import { evalConditions } from './conditions';
import type { EventBinding, EventDef, EventHookKind, EventTrigger } from './types';

/** Plan10 §5.1: descending priority, then locale-independent ID order. */
export function compareEventPriority(
  a: Pick<EventDef, 'priority' | 'id'>,
  b: Pick<EventDef, 'priority' | 'id'>,
): number {
  return b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function sortEventDefs(defs: readonly EventDef[]): EventDef[] {
  return [...defs].sort(compareEventPriority);
}

/** Inclusive 360-day endpoints; a null generic endpoint leaves that side unbounded. */
export function eventDateWindowContains(
  trigger: Pick<EventTrigger, 'from' | 'to'>,
  absoluteDay: number,
): boolean {
  return (
    Number.isFinite(absoluteDay) &&
    (trigger.from === null ||
      absoluteDay >= calendarToDay(trigger.from.year, trigger.from.month, trigger.from.day)) &&
    (trigger.to === null ||
      absoluteDay <= calendarToDay(trigger.to.year, trigger.to.month, trigger.to.day))
  );
}

/** Hook kinds are already-consumed input; this helper neither consumes nor dates signals. */
export function eventCheckDue(
  trigger: Pick<EventTrigger, 'check' | 'hooks'>,
  absoluteDay: number,
  hookKinds: readonly EventHookKind[] = [],
): boolean {
  const { month, dayOfMonth } = dayToCalendar(absoluteDay);
  switch (trigger.check) {
    case 'monthStart':
      return dayOfMonth === 1;
    case 'harvest':
      return month === 9 && dayOfMonth === 1;
    case 'hook':
      return dayOfMonth === 1 || hookKinds.some((kind) => trigger.hooks.includes(kind));
  }
}

/** §3.2.3/§3.6: clan-target cooldowns are independent; district/region events are global. */
export function eventCooldownKey(
  def: Pick<EventDef, 'id' | 'target' | 'trigger'>,
  binding: Readonly<EventBinding> | null,
): string {
  const base = def.trigger.cooldownKey ?? def.id;
  return (def.target === 'eachClan' || def.target === 'player') && binding?.clanId != null
    ? `${base}.${binding.clanId}`
    : base;
}

/** Eligibility before the probability draw, not a decision that an event fires.
 * The caller supplies a resolved binding and hook kinds. No RNG, bookkeeping, catalog,
 * binding generation, pending-choice gate or hook lifecycle is owned here (plan10 §5.1).
 */
export function isEventTriggerEligible(
  state: Readonly<GameState>,
  def: Readonly<EventDef>,
  binding: Readonly<EventBinding> | null,
  hookKinds: readonly EventHookKind[] = [],
): boolean {
  const today = state.time.day;
  if (def.target === 'eachClan' || def.target === 'player') {
    const clanId = binding?.clanId;
    if (clanId == null || !state.clans[clanId]?.alive) return false;
    if (def.target === 'player' && clanId !== state.meta.playerClanId) return false;
  }
  if (!eventDateWindowContains(def.trigger, today)) return false;
  if (def.trigger.once && Object.hasOwn(state.events.fired, def.id)) return false;
  const cooldownKey = eventCooldownKey(def, binding);
  const cooldownUntil = Object.hasOwn(state.events.cooldownUntil, cooldownKey)
    ? (state.events.cooldownUntil[cooldownKey] ?? 0)
    : 0;
  if (cooldownUntil > today) return false;
  if (!eventCheckDue(def.trigger, today, hookKinds)) return false;
  return evalConditions(def.trigger.conditions, state, binding);
}
