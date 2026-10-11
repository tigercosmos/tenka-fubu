import { BAL } from '../../balance';
import type { EmitFn } from '../../commands/registry';
import type { GameState } from '../../state/gameState';
import { adjustSentiment, ensureDiplomacyRow, getDiplomacyRow } from '../diplomacyCommon';
import { DAYS_PER_MONTH } from '../time';
import { resolveClanRef } from './conditions';
import type { EffectOp, EventBinding } from './types';

export type EventPactEffect = Extract<EffectOp, { op: 'signPact' }>;
export type EventBreakPactEffect = Extract<EffectOp, { op: 'breakPact' }>;

/** Forced cancellation has endpoints, not an attributed player betrayal. */
export function applyEventBreakPact(
  state: GameState,
  op: EventBreakPactEffect,
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  const a = resolveClanRef(op.a, binding),
    b = resolveClanRef(op.b, binding);
  if (a === null || b === null || a === b || !state.clans[a]?.alive || !state.clans[b]?.alive)
    return;
  const row = getDiplomacyRow(state, a, b);
  if (!row.pacts.some((pact) => pact.kind === op.pact)) return;
  const actual = ensureDiplomacyRow(state, a, b);
  actual.pacts = actual.pacts.filter((pact) => pact.kind !== op.pact);
  emit({
    type: 'pact.broken',
    day: state.time.day,
    clanIds: [actual.a, actual.b],
    aClanId: actual.a,
    bClanId: actual.b,
    kind: op.pact,
    breakerClanId: null,
  });
}

/** Finite peace/alliance signing only; no spouse selection or vassal creation. */
export function supportsEventPactEffect(op: EventPactEffect): boolean {
  return (
    (op.pact === 'alliance' || op.pact === 'ceasefire') &&
    op.months !== null &&
    Number.isFinite(op.months) &&
    Number.isInteger(op.months) &&
    op.months > 0 &&
    op.vassalClanId === null
  );
}

export function applyEventPact(
  state: GameState,
  op: EventPactEffect,
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  if (!supportsEventPactEffect(op)) throw new Error('Unsupported event pact variant');
  const a = resolveClanRef(op.a, binding),
    b = resolveClanRef(op.b, binding);
  if (a === null || b === null || a === b || !state.clans[a]?.alive || !state.clans[b]?.alive)
    return;
  const existing = getDiplomacyRow(state, a, b);
  const refreshed = existing.pacts.some((pact) => pact.kind === op.pact);
  if (op.pact === 'alliance' && existing.pacts.some((pact) => pact.kind === 'vassal')) return;
  const endDay = state.time.day + op.months! * DAYS_PER_MONTH;
  if (!Number.isFinite(endDay)) throw new Error('Unsupported event pact duration overflow');
  const row = ensureDiplomacyRow(state, a, b);
  row.pacts = row.pacts.filter((pact) => pact.kind !== op.pact);
  if (op.pact === 'alliance') row.pacts = row.pacts.filter((pact) => pact.kind !== 'ceasefire');
  row.pacts.push({ kind: op.pact, startDay: state.time.day, endDay, vassalClanId: null });
  const sentiment =
    op.pact === 'alliance' ? BAL.sentimentPactSignedAlliance : BAL.sentimentPactSignedCeasefire;
  if (!refreshed) {
    adjustSentiment(state, a, b, sentiment);
    adjustSentiment(state, b, a, sentiment);
  }
  emit({
    type: 'pact.signed',
    day: state.time.day,
    clanIds: [a, b],
    aClanId: row.a,
    bClanId: row.b,
    kind: op.pact,
    endDay,
  });
}
