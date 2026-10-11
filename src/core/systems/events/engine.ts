import type { CmdResolveEventChoice, ValidationResult } from '../../commands/types';
import type { EmitFn } from '../../commands/registry';
import { REJECT_REASONS } from '../../commands/reasons';
import { createRngStream } from '../../rng';
import type { GameState } from '../../state/gameState';
import type { ClanId, EventId } from '../../state/ids';
import { REGION_VALUES } from '../../state/enums';
import { affectedRegionClanIds } from './regionEffects';
import { expireTaimei } from './taimei';
import { evalConditions, resolveClanRef } from './conditions';
import {
  eventCheckDue,
  eventCooldownKey,
  eventDateWindowContains,
  isEventTriggerEligible,
  sortEventDefs,
} from './triggerEligibility';
import type { EffectOp, EventBinding, EventChoice, EventDef } from './types';

export type EventEffectApplier = (
  state: GameState,
  ops: readonly EffectOp[],
  binding: Readonly<EventBinding>,
  emit: EmitFn,
) => void;

/** Pure batch validation; callers must not mutate state, emit, or consume its RNG. */
export type EventEffectPreflight = (
  state: Readonly<GameState>,
  ops: readonly EffectOp[],
  binding: Readonly<EventBinding>,
) => void;

export interface EventFiredNotice {
  def: Readonly<EventDef>;
  binding: Readonly<EventBinding>;
  clanIds: readonly ClanId[];
}
export type EventFiredListener = (notice: EventFiredNotice, state: Readonly<GameState>) => void;

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function writeOwn(record: Record<string, number>, key: string, value: number): void {
  Object.defineProperty(record, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

/** Plan10 §5.1–5.3; catalog and ordered effect dispatch are injected, never global. */
export function createEventEngine(
  defs: readonly EventDef[],
  applyEffects: EventEffectApplier,
  options: { preflight?: EventEffectPreflight } = {},
) {
  const catalog = new Map<EventId, EventDef>();
  const observers = new Set<{ listener: EventFiredListener }>();
  function subscribeFired(listener: EventFiredListener): () => void {
    const registration = { listener };
    observers.add(registration);
    return () => {
      observers.delete(registration);
    };
  }
  function notifyFired(
    state: GameState,
    def: EventDef,
    binding: Readonly<EventBinding>,
    clanIds: ClanId[],
  ): void {
    if (observers.size === 0 || (def.target === 'randomRegionClan' && clanIds.length === 0)) return;
    const notice = Object.freeze({
      def,
      binding: Object.freeze({ ...binding }),
      clanIds: Object.freeze(clanIds),
    });
    for (const registration of [...observers]) {
      if (!observers.has(registration)) continue;
      try {
        registration.listener(notice, state);
      } catch {
        /* Presentation observers cannot abort a core tick. */
      }
    }
  }
  const ordered = sortEventDefs(structuredClone(defs));
  for (const def of ordered) {
    if (catalog.has(def.id)) throw new Error(`Duplicate event id: ${def.id}`);
    catalog.set(def.id, freeze(def));
  }
  function owner(
    state: Readonly<GameState>,
    def: EventDef,
    binding: Readonly<EventBinding>,
  ): ClanId | null {
    const live = def.ownerCandidates
      .map((ref) => resolveClanRef(ref, binding))
      .filter((id): id is ClanId => id !== null && state.clans[id]?.alive === true);
    return (
      (!state.ai.allAi && live.includes(state.meta.playerClanId)
        ? state.meta.playerClanId
        : live[0]) ?? null
    );
  }
  function bindings(state: GameState, def: EventDef): EventBinding[] {
    const empty: EventBinding = { clanId: null, castleId: null, districtId: null };
    switch (def.target) {
      case 'fixed':
        return [{ ...empty, clanId: owner(state, def, empty) }];
      case 'player':
        return [{ ...empty, clanId: state.meta.playerClanId }];
      case 'eachClan':
        return Object.values(state.clans)
          .filter((clan) => clan.alive)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((clan) => ({ ...empty, clanId: clan.id }));
      case 'randomDistrict': {
        const candidates = Object.values(state.districts).sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        );
        if (candidates.length === 0) return [];
        const district = createRngStream(state.rng, 'event').pick(candidates);
        return [
          { clanId: district.ownerClanId, castleId: district.castleId, districtId: district.id },
        ];
      }
      case 'randomRegionClan':
        return [
          { ...empty, region: createRngStream(state.rng, 'event').pick([...REGION_VALUES].sort()) },
        ];
    }
  }
  function aiChoice(
    state: GameState,
    def: EventDef,
    binding: Readonly<EventBinding>,
  ): EventChoice | null {
    const eligible = def.choices.filter((choice) =>
      evalConditions(choice.conditions, state, binding),
    );
    const weighted = eligible.filter((choice) => choice.aiWeight > 0);
    const sum = weighted.reduce((total, choice) => total + choice.aiWeight, 0);
    if (sum === 0) return eligible[0] ?? null;
    let draw = createRngStream(state.rng, 'event').nextInt(1, sum);
    for (const choice of weighted) {
      draw -= choice.aiWeight;
      if (draw <= 0) return choice;
    }
    return null;
  }
  function validateChoice(
    state: Readonly<GameState>,
    cmd: CmdResolveEventChoice,
  ): ValidationResult {
    if (cmd.clanId !== state.meta.playerClanId)
      return { ok: false, reasonKey: REJECT_REASONS.notOwner };
    const def = catalog.get(cmd.eventId);
    if (
      !def ||
      state.events.pendingChoiceEventId !== cmd.eventId ||
      (state.events.pendingChoiceBinding === null && def.target !== 'fixed') ||
      !Number.isInteger(cmd.choiceIndex) ||
      cmd.choiceIndex < 0 ||
      cmd.choiceIndex >= def.choices.length
    )
      return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
    return { ok: true };
  }
  function resolveChoice(state: GameState, cmd: CmdResolveEventChoice, emit: EmitFn): void {
    if (!validateChoice(state, cmd).ok) return;
    const def = catalog.get(cmd.eventId)!;
    const binding = state.events.pendingChoiceBinding ?? bindings(state, def)[0]!;
    const selected = def.choices[cmd.choiceIndex]!;
    if (options.preflight) {
      const probe = structuredClone(state);
      const choice = evalConditions(selected.conditions, probe, binding)
        ? selected
        : aiChoice(probe, def, binding);
      if (choice) options.preflight(state, choice.effects, binding);
      // Replay selection below in its original order; probe RNG is never copied back.
    }
    const choice = evalConditions(selected.conditions, state, binding)
      ? selected
      : aiChoice(state, def, binding);
    if (choice) applyEffects(state, choice.effects, binding, emit);
    state.events.pendingChoiceEventId = null;
    state.events.pendingChoiceBinding = null;
  }

  function stageFire(state: GameState, def: EventDef, binding: Readonly<EventBinding>) {
    const preflight = options.preflight;
    if (!preflight) return;
    const probeRng = { ...state.rng };
    if (
      def.trigger.probability < 1 &&
      !createRngStream(probeRng, 'event').chance(def.trigger.probability)
    )
      return;
    // Misses need only the detached five-stream RNG probe; hits still stage all effects atomically.
    const probe = structuredClone(state);
    probe.rng = probeRng;
    preflight(state, def.effects, binding);
    applyEffects(probe, def.effects, binding, () => undefined);
    const choiceOwner = owner(probe, def, binding);
    const choice =
      def.choices.length > 0 &&
      choiceOwner !== null &&
      (choiceOwner !== state.meta.playerClanId || state.ai.allAi)
        ? aiChoice(probe, def, binding)
        : null;
    if (choice) preflight(state, [...def.effects, ...choice.effects], binding);
  }
  function run(state: GameState, emit: EmitFn): void {
    expireTaimei(state, emit);
    const signals = state.events.hookSignals;
    state.events.hookSignals = [];
    for (const signal of signals)
      if (signal.kind === 'battleEnded' && signal.playerInvolved) {
        state.events.stats.battlesFought += 1;
        if (signal.winnerClanId === state.meta.playerClanId) state.events.stats.battlesWon += 1;
      }
    if (state.events.pendingChoiceEventId !== null) return;
    if (state.time.month === 10 && state.time.dayOfMonth === 1) {
      for (const key of Object.keys(state.events.flags)) {
        const match = /^harvest\.(\d+)\./u.exec(key);
        if (match && Number(match[1]) < state.time.year) delete state.events.flags[key];
      }
    }
    const hookKinds = signals.map((signal) => signal.kind);
    for (const def of ordered) {
      if (
        !eventDateWindowContains(def.trigger, state.time.day) ||
        (def.trigger.once && Object.hasOwn(state.events.fired, def.id)) ||
        !eventCheckDue(def.trigger, state.time.day, hookKinds)
      )
        continue;
      // Global cooldowns precede random binding selection, so blocked events draw nothing.
      if (def.target === 'randomDistrict' || def.target === 'randomRegionClan') {
        const key = eventCooldownKey(def, null);
        if (
          Object.hasOwn(state.events.cooldownUntil, key) &&
          state.events.cooldownUntil[key]! > state.time.day
        )
          continue;
      }
      const beforeRandomBinding =
        options.preflight && (def.target === 'randomDistrict' || def.target === 'randomRegionClan')
          ? { ...state.rng }
          : null;
      for (const binding of bindings(state, def)) {
        if (!isEventTriggerEligible(state, def, binding, hookKinds)) continue;
        if (options.preflight) {
          const beforeAttempt = beforeRandomBinding ?? { ...state.rng };
          try {
            stageFire(state, def, binding);
          } catch (error) {
            Object.assign(state.rng, beforeAttempt);
            throw error;
          }
        }
        if (
          def.trigger.probability < 1 &&
          !createRngStream(state.rng, 'event').chance(def.trigger.probability)
        )
          continue;
        if (def.trigger.once) writeOwn(state.events.fired, def.id, state.time.day);
        else
          writeOwn(
            state.events.cooldownUntil,
            eventCooldownKey(def, binding),
            state.time.day + def.trigger.cooldownDays,
          );
        const firedClanIds =
          def.target === 'randomRegionClan'
            ? affectedRegionClanIds(state, binding.region).map((clanId) => [clanId])
            : [
                [
                  ...new Set([
                    ...(binding.clanId === null ? [] : [binding.clanId]),
                    ...def.ownerCandidates
                      .map((ref) => resolveClanRef(ref, binding))
                      .filter((id): id is ClanId => id !== null),
                  ]),
                ].sort(),
              ];
        for (const clanIds of firedClanIds)
          emit({
            type: 'event.fired',
            day: state.time.day,
            clanIds,
            eventId: def.id,
            hasChoice: def.choices.length > 0,
          });
        applyEffects(state, def.effects, binding, emit);
        if (def.choices.length === 0) {
          notifyFired(state, def, binding, firedClanIds.flat());
          continue;
        }
        const choiceOwner = owner(state, def, binding);
        if (choiceOwner === null) {
          notifyFired(state, def, binding, firedClanIds.flat());
          continue;
        }
        if (choiceOwner === state.meta.playerClanId && !state.ai.allAi) {
          state.events.pendingChoiceEventId = def.id;
          state.events.pendingChoiceBinding = { ...binding };
          notifyFired(state, def, binding, firedClanIds.flat());
          return;
        }
        const choice = aiChoice(state, def, binding);
        if (choice) applyEffects(state, choice.effects, binding, emit);
        notifyFired(state, def, binding, firedClanIds.flat());
      }
    }
  }
  return {
    getDef: (id: EventId): Readonly<EventDef> | undefined => catalog.get(id),
    subscribeFired,
    run,
    resolveChoice,
    validateChoice,
  };
}

export type EventEngine = ReturnType<typeof createEventEngine>;
