import { BAL } from '../../balance';
import type { EmitFn } from '../../commands/registry';
import type { GameState } from '../../state/gameState';
import { adjustSentiment, ensureDiplomacyRow } from '../diplomacyCommon';
import { dieOfficer } from '../officers';
import { resolveClanRef } from './conditions';
import { applyScalarEffects, isScalarEffectOp } from './scalarEffects';
import type { EffectOp, EventBinding } from './types';
import { applyMakeRoninEvent } from './officerLifecycle';
import { applyEventPact, applyEventBreakPact, supportsEventPactEffect } from './pactEffects';
import { shogunateTitleOrder } from '../court';
import { applyRegionEffects, supportsRegionEffects } from './regionEffects';

/** Marriage/vassal signing, transfer and execution remain outside this dispatcher. */
export function supportsEventEffects(ops: readonly EffectOp[]): boolean {
  return ops.every(
    (op) =>
      isScalarEffectOp(op) ||
      op.op === 'declareWar' ||
      op.op === 'makeRonin' ||
      op.op === 'breakPact' ||
      op.op === 'grantShogunateTitle' ||
      (op.op === 'affectRegion' && supportsRegionEffects(op.effects)) ||
      (op.op === 'signPact' && supportsEventPactEffect(op)) ||
      (op.op === 'killOfficer' && (op.cause === 'age' || op.cause === 'battle')),
  );
}

/** Preflight the whole batch before ordered dispatch; unsupported content never partly applies. */
export function applyEventEffects(
  state: GameState,
  ops: readonly EffectOp[],
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  if (!supportsEventEffects(ops)) throw new Error('Unsupported event effect batch');
  // Departure/pact eligibility depends on earlier ordered effects (including succession).
  // A detached dry-run guarantees that a later unsupported stateful effect cannot
  // leave earlier real mutations/emissions behind. Any dry-run RNG state belongs
  // only to the detached clone; emissions are suppressed until real dispatch.
  if (ops.some((op) => op.op === 'makeRonin' || op.op === 'signPact'))
    dispatchEventEffects(structuredClone(state), ops, binding, () => undefined);
  dispatchEventEffects(state, ops, binding, emit);
}

function dispatchEventEffects(
  state: GameState,
  ops: readonly EffectOp[],
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  for (const op of ops) {
    if (op.op === 'breakPact') {
      applyEventBreakPact(state, op, binding, emit);
      continue;
    }
    if (op.op === 'grantShogunateTitle') {
      const id = resolveClanRef(op.clanId, binding);
      const clan = id === null ? undefined : state.clans[id];
      if (
        !clan?.alive ||
        !state.court.shogunateExists ||
        clan.shogunateTitle === op.title ||
        !BAL.shogunateTitleTable.some((def) => def.id === op.title)
      )
        continue;
      const bonus = (title: typeof op.title): number => {
        const order = shogunateTitleOrder(title);
        return order === null
          ? 0
          : BAL.shogunateTitleTable
              .filter((def) => def.order <= order)
              .reduce((sum, def) => sum + def.prestigeBonus, 0);
      };
      clan.prestige = Math.max(
        0,
        Math.min(BAL.prestigeMax, clan.prestige + bonus(op.title) - bonus(clan.shogunateTitle)),
      );
      clan.shogunateTitle = op.title;
      emit({
        type: 'shogunate.titleGranted',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
        title: op.title,
      });
      continue;
    }
    if (op.op === 'affectRegion') {
      applyRegionEffects(state, op, binding, emit);
      continue;
    }
    if (op.op === 'signPact') {
      applyEventPact(state, op, binding, emit);
      continue;
    }
    if (op.op === 'makeRonin') {
      applyMakeRoninEvent(state, op.officerId, emit);
      continue;
    }
    if (isScalarEffectOp(op)) {
      applyScalarEffects(state, [op], binding, emit);
      continue;
    }
    if (op.op === 'declareWar') {
      const a = resolveClanRef(op.a, binding),
        b = resolveClanRef(op.b, binding);
      if (a === null || b === null || a === b || !state.clans[a]?.alive || !state.clans[b]?.alive)
        continue;
      const row = ensureDiplomacyRow(state, a, b);
      row.lastHostileDay = state.time.day;
      row.pacts = row.pacts.filter(
        (pact) => !['ceasefire', 'alliance', 'marriage'].includes(pact.kind),
      );
      adjustSentiment(state, a, b, -BAL.evtDeclareWarSentiment);
      adjustSentiment(state, b, a, -BAL.evtDeclareWarSentiment);
      continue;
    }
    if (op.op === 'killOfficer' && (op.cause === 'age' || op.cause === 'battle')) {
      const officer = state.officers[op.officerId];
      if (
        !officer ||
        officer.status === 'dead' ||
        (officer.clanId !== null && !state.clans[officer.clanId]?.alive)
      )
        continue;
      for (const event of dieOfficer(state, officer.id, null, false, op.cause)) emit(event);
    }
  }
}
