import { BAL } from '../../balance';
import type { EmitFn } from '../../commands/registry';
import type { GameState } from '../../state/gameState';
import { adjustSentiment, ensureDiplomacyRow } from '../diplomacyCommon';
import { resolveClanRef } from './conditions';
import type { EffectOp, EventBinding } from './types';

// Deliberately narrow: forced pacts, transfers, execution and direct titles need separate contracts.
export type DiplomacyEventEffectOp = Extract<EffectOp, { op: 'declareWar' }>;
export function isDiplomacyEventEffectOp(op: EffectOp): op is DiplomacyEventEffectOp {
  return op.op === 'declareWar';
}

/** Literal plan10 §3.3: vassal is NOT listed among the agreements removed by this effect. */
export function applyEventDeclareWar(
  state: GameState,
  op: DiplomacyEventEffectOp,
  binding: Readonly<EventBinding> | null,
): void {
  const a = resolveClanRef(op.a, binding);
  const b = resolveClanRef(op.b, binding);
  if (a === null || b === null || a === b || !state.clans[a]?.alive || !state.clans[b]?.alive)
    return;
  const row = ensureDiplomacyRow(state, a, b);
  row.lastHostileDay = state.time.day;
  row.pacts = row.pacts.filter((pact) => pact.kind === 'vassal');
  adjustSentiment(state, a, b, -BAL.evtDeclareWarSentiment);
  adjustSentiment(state, b, a, -BAL.evtDeclareWarSentiment);
  // No pact.broken event: its required breaker identity is absent from the effect contract.
  // An existing vassal pact still suppresses isAtWar; authors must explicitly end it first.
}

/** Ordered declareWar-only subset. No RNG, command costs, penalties, hooks or invented events. */
export function applyDiplomacyEventEffects(
  state: GameState,
  ops: readonly DiplomacyEventEffectOp[],
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  // Retain the scalar-applier callback contract; this subset has no canonical derived event.
  void emit;
  for (const op of ops) applyEventDeclareWar(state, op, binding);
}
