import { createEventEngine, type EventEngine } from './engine';
import { applyEventEffects, supportsEventEffects } from './effects';
import type { EventDef } from './types';

/** Validate supported catalog content before any event can write fired/cooldown bookkeeping. */
export function createRuntimeEventEngine(defs: readonly EventDef[]): EventEngine {
  for (const def of defs) {
    if (
      !supportsEventEffects(def.effects) ||
      def.choices.some((choice) => !supportsEventEffects(choice.effects))
    ) {
      throw new Error(`Unsupported event effect in catalog: ${def.id}`);
    }
  }
  return createEventEngine(defs, applyEventEffects, {
    preflight: (state, ops, binding) => {
      applyEventEffects(structuredClone(state), ops, binding, () => undefined);
    },
  });
}
