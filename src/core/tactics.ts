// Canonical M5 battle tactics: definitions, availability, validation, application, and effect queries.
// Spec: plan/07-military.md §3.8 and §5.4; plan/06-officers.md §2 and §3.3.

import { BAL } from './balance';
import { CoreError } from './errors';
import type { ActiveTactic, BattleState, BattleUnit, GameState } from './state/gameState';
import type { OfficerId, TacticId, TraitId } from './state/ids';
import type { TacticEntryData } from '../data/schemas/tactic';

export type TacticKind = 'buff' | 'debuff' | 'instant';
export type TacticCategory = 'valor' | 'intrigue' | 'charge' | 'ranged';

export type TacticEffect =
  | { readonly type: 'charge' }
  | { readonly type: 'volley'; readonly hits: 1 | 3; readonly damageMult: number }
  | { readonly type: 'inspire'; readonly moraleGain: number }
  | { readonly type: 'taunt' }
  | { readonly type: 'disrupt'; readonly clearsActiveTactics: true }
  | { readonly type: 'hold' }
  | { readonly type: 'fireArrow'; readonly flagDamagePerTick: number }
  | { readonly type: 'cavalry'; readonly freeMoveBeforeAttack: true }
  | { readonly type: 'lastStand'; readonly moraleFloorOffset: number }
  | { readonly type: 'pin' }
  | { readonly type: 'heal'; readonly initialTroopRatio: number };

export interface TacticDef {
  readonly id: TacticId;
  readonly saihaiCost: number;
  readonly kind: TacticKind;
  readonly category: TacticCategory;
  readonly durationTicks: number;
  readonly cooldownTicks: number;
  readonly needsTarget: boolean;
  readonly unlockTraitId: TraitId | null;
  readonly atkMult: number;
  readonly dmgTakenMult: number;
  readonly immobile: boolean;
  readonly effect: TacticEffect;
}

const tacticId = (id: string): TacticId => id as TacticId;
const traitId = (id: string): TraitId => id as TraitId;

export const TACTIC_IDS = [
  tacticId('tac.charge'),
  tacticId('tac.volley'),
  tacticId('tac.inspire'),
  tacticId('tac.taunt'),
  tacticId('tac.disrupt'),
  tacticId('tac.hold'),
  tacticId('tac.fire-arrow'),
  tacticId('tac.cavalry'),
  tacticId('tac.triple-volley'),
  tacticId('tac.last-stand'),
  tacticId('tac.pin'),
  tacticId('tac.heal'),
] as const;

function defineTactic(definition: TacticDef): TacticDef {
  return Object.freeze(definition);
}

const tacticDefinitions = [
  defineTactic({
    id: tacticId('tac.charge'),
    saihaiCost: 5,
    kind: 'buff',
    category: 'charge',
    durationTicks: 3,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: null,
    atkMult: 1.5,
    dmgTakenMult: 1.2,
    immobile: false,
    effect: { type: 'charge' },
  }),
  defineTactic({
    id: tacticId('tac.volley'),
    saihaiCost: 4,
    kind: 'instant',
    category: 'ranged',
    durationTicks: 0,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: true,
    unlockTraitId: null,
    atkMult: 1,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'volley', hits: 1, damageMult: BAL.tacVolleyDamageMult },
  }),
  defineTactic({
    id: tacticId('tac.inspire'),
    saihaiCost: 4,
    kind: 'instant',
    category: 'valor',
    durationTicks: 0,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: traitId('trait.gunshin'),
    atkMult: 1,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'inspire', moraleGain: 15 },
  }),
  defineTactic({
    id: tacticId('tac.taunt'),
    saihaiCost: 3,
    kind: 'debuff',
    category: 'intrigue',
    durationTicks: 4,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: true,
    unlockTraitId: traitId('trait.benzetsu'),
    atkMult: 0.8,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'taunt' },
  }),
  defineTactic({
    id: tacticId('tac.disrupt'),
    saihaiCost: 4,
    kind: 'debuff',
    category: 'intrigue',
    durationTicks: 3,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: true,
    unlockTraitId: traitId('trait.gunryaku'),
    atkMult: 0.7,
    dmgTakenMult: 1,
    immobile: true,
    effect: { type: 'disrupt', clearsActiveTactics: true },
  }),
  defineTactic({
    id: tacticId('tac.hold'),
    saihaiCost: 3,
    kind: 'buff',
    category: 'valor',
    durationTicks: 4,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: traitId('trait.fudou'),
    atkMult: 1,
    dmgTakenMult: 0.6,
    immobile: true,
    effect: { type: 'hold' },
  }),
  defineTactic({
    id: tacticId('tac.fire-arrow'),
    saihaiCost: 5,
    kind: 'buff',
    category: 'ranged',
    durationTicks: 3,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: true,
    unlockTraitId: traitId('trait.hizeme'),
    atkMult: 1.3,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'fireArrow', flagDamagePerTick: BAL.tacFireFlagDamage },
  }),
  defineTactic({
    id: tacticId('tac.cavalry'),
    saihaiCost: 6,
    kind: 'buff',
    category: 'charge',
    durationTicks: 2,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: traitId('trait.kiba'),
    atkMult: 1.6,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'cavalry', freeMoveBeforeAttack: true },
  }),
  defineTactic({
    id: tacticId('tac.triple-volley'),
    saihaiCost: 8,
    kind: 'instant',
    category: 'ranged',
    durationTicks: 0,
    cooldownTicks: 10,
    needsTarget: true,
    unlockTraitId: traitId('trait.teppo'),
    atkMult: 1,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'volley', hits: 3, damageMult: 1 },
  }),
  defineTactic({
    id: tacticId('tac.last-stand'),
    saihaiCost: 6,
    kind: 'buff',
    category: 'valor',
    durationTicks: 5,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: traitId('trait.kesshi'),
    atkMult: 1.8,
    dmgTakenMult: 1.3,
    immobile: false,
    effect: { type: 'lastStand', moraleFloorOffset: 1 },
  }),
  defineTactic({
    id: tacticId('tac.pin'),
    saihaiCost: 3,
    kind: 'debuff',
    category: 'intrigue',
    durationTicks: 3,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: true,
    unlockTraitId: traitId('trait.roukou'),
    atkMult: 1,
    dmgTakenMult: 1,
    immobile: true,
    effect: { type: 'pin' },
  }),
  defineTactic({
    id: tacticId('tac.heal'),
    saihaiCost: 5,
    kind: 'instant',
    category: 'intrigue',
    durationTicks: 0,
    cooldownTicks: BAL.tacticCooldownTicks,
    needsTarget: false,
    unlockTraitId: traitId('trait.iryou'),
    atkMult: 1,
    dmgTakenMult: 1,
    immobile: false,
    effect: { type: 'heal', initialTroopRatio: BAL.tacHealRatio },
  }),
] as const satisfies readonly TacticDef[];

export const TACTICS: Readonly<Record<TacticId, TacticDef>> = Object.freeze(
  Object.fromEntries(tacticDefinitions.map((definition) => [definition.id, definition])) as Record<
    TacticId,
    TacticDef
  >,
);

export function getTacticDef(id: TacticId): TacticDef | undefined {
  return TACTICS[id];
}

export interface LoadedTacticDef extends TacticDef {
  readonly name: string;
}

/** Merge scenario display names with canonical core mechanics, rejecting drift in ids or unlock traits. */
export function loadTacticCatalog(entries: readonly TacticEntryData[]): readonly LoadedTacticDef[] {
  const byId = new Map(entries.map((entry) => [entry.id as TacticId, entry]));
  if (entries.length !== TACTIC_IDS.length || byId.size !== TACTIC_IDS.length) {
    throw new CoreError('DATA_INTEGRITY', '戰法型錄必須恰含 12 個不重複的 canonical id');
  }
  return Object.freeze(
    TACTIC_IDS.map((id) => {
      const manifest = byId.get(id);
      const definition = TACTICS[id];
      if (!manifest || !definition || manifest.unlockTraitId !== definition.unlockTraitId) {
        throw new CoreError('DATA_INTEGRITY', `戰法型錄與 core 定義不一致：${id}`, {
          tacticId: id,
          manifestUnlockTraitId: manifest?.unlockTraitId,
          coreUnlockTraitId: definition?.unlockTraitId,
        });
      }
      return Object.freeze({ ...definition, name: manifest.name });
    }),
  );
}

function unitOfficerIds(state: Readonly<GameState>, unit: Readonly<BattleUnit>): OfficerId[] {
  const army = state.armies[unit.armyId];
  return army ? [army.leaderId, ...army.deputyIds] : [unit.generalId];
}

/** Defaults plus any tactics unlocked by the general or either deputy, in canonical display order. */
export function getAvailableTacticIds(
  state: Readonly<GameState>,
  unit: Readonly<BattleUnit>,
): readonly TacticId[] {
  const traits = new Set<TraitId>();
  for (const officerId of unitOfficerIds(state, unit)) {
    for (const id of state.officers[officerId]?.traits ?? []) traits.add(id);
  }
  return TACTIC_IDS.filter((id) => {
    const unlock = TACTICS[id]?.unlockTraitId;
    return unlock === null || (unlock !== undefined && traits.has(unlock));
  });
}

export function getAvailableTacticDefs(
  state: Readonly<GameState>,
  unit: Readonly<BattleUnit>,
): readonly TacticDef[] {
  return getAvailableTacticIds(state, unit).map((id) => TACTICS[id]!);
}

export interface BattleTacticOrder {
  readonly kind: 'tactic';
  readonly unitId: string;
  readonly tacticId: TacticId;
  readonly targetUnitId: string | null;
}

export type TacticRejectionReason =
  | 'battleResolved'
  | 'unitNotFound'
  | 'unitRouted'
  | 'unknownTactic'
  | 'tacticLocked'
  | 'cooldown'
  | 'insufficientSaihai'
  | 'targetRequired'
  | 'targetForbidden'
  | 'targetNotFound'
  | 'targetFriendly'
  | 'targetRouted'
  | 'targetOutOfRange';

export type TacticValidationResult =
  | {
      readonly ok: true;
      readonly def: TacticDef;
      readonly actor: BattleUnit;
      readonly target: BattleUnit | null;
    }
  | { readonly ok: false; readonly reason: TacticRejectionReason };

function areJinsAdjacent(bs: Readonly<BattleState>, a: string, b: string): boolean {
  if (a === b) return true;
  return bs.edges.some((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
}

export function validateBattleTactic(
  state: Readonly<GameState>,
  bs: Readonly<BattleState>,
  order: Readonly<BattleTacticOrder>,
): TacticValidationResult {
  if (bs.result !== null) return { ok: false, reason: 'battleResolved' };
  const actor = bs.units.find((unit) => unit.id === order.unitId);
  if (!actor) return { ok: false, reason: 'unitNotFound' };
  if (actor.routed || actor.troops <= 0) return { ok: false, reason: 'unitRouted' };
  const def = getTacticDef(order.tacticId);
  if (!def) return { ok: false, reason: 'unknownTactic' };
  if (!getAvailableTacticIds(state, actor).includes(def.id)) {
    return { ok: false, reason: 'tacticLocked' };
  }
  if ((actor.tacticCooldowns[def.id] ?? 0) > 0) return { ok: false, reason: 'cooldown' };
  if (bs.saihai[actor.side] < def.saihaiCost) {
    return { ok: false, reason: 'insufficientSaihai' };
  }
  if (!def.needsTarget) {
    return order.targetUnitId === null
      ? { ok: true, def, actor, target: null }
      : { ok: false, reason: 'targetForbidden' };
  }
  if (order.targetUnitId === null) return { ok: false, reason: 'targetRequired' };
  const target = bs.units.find((unit) => unit.id === order.targetUnitId);
  if (!target) return { ok: false, reason: 'targetNotFound' };
  if (target.side === actor.side) return { ok: false, reason: 'targetFriendly' };
  if (target.routed || target.troops <= 0) return { ok: false, reason: 'targetRouted' };
  if (!areJinsAdjacent(bs, actor.jinId, target.jinId)) {
    return { ok: false, reason: 'targetOutOfRange' };
  }
  return { ok: true, def, actor, target };
}

function activeDefinition(active: Readonly<ActiveTactic>): TacticDef | undefined {
  return getTacticDef(active.tacticId);
}

function addBuff(actor: BattleUnit, def: TacticDef, targetUnitId: string | null): void {
  actor.activeTactics = actor.activeTactics.filter(
    (active) => activeDefinition(active)?.kind !== 'buff',
  );
  actor.activeTactics.push({
    tacticId: def.id,
    remainingTicks: def.durationTicks,
    targetUnitId,
  });
}

function addDebuff(target: BattleUnit, def: TacticDef, sourceUnitId: string): void {
  if (def.effect.type === 'disrupt') target.activeTactics = [];
  const existing = target.activeTactics.find((active) => active.tacticId === def.id);
  if (existing) {
    existing.remainingTicks = def.durationTicks;
    existing.targetUnitId = sourceUnitId;
    return;
  }
  target.activeTactics.push({
    tacticId: def.id,
    remainingTicks: def.durationTicks,
    targetUnitId: sourceUnitId,
  });
}

function defaultTacticAttackPower(state: Readonly<GameState>, actor: Readonly<BattleUnit>): number {
  const general = state.officers[actor.generalId];
  const val = general ? general.val + general.statGrowth.val : 0;
  const ldr = general ? general.ldr + general.statGrowth.ldr : 0;
  const moraleFactor = BAL.moraleFactorBase + actor.morale / BAL.moraleFactorDivisor;
  return (
    actor.troops *
    (1 + val * BAL.valBattleFactor + ldr * BAL.ldrBattleFactor) *
    moraleFactor *
    tacticAttackMultiplier(actor)
  );
}

export interface ApplyBattleTacticOptions {
  /** Tick-start attack power override; battle.ts can supply its shared snapshot calculation. */
  readonly attackPower?: number;
}

export type TacticApplicationResult =
  | {
      readonly applied: false;
      readonly reason: TacticRejectionReason;
      readonly damageDealt: 0;
      readonly troopsHealed: 0;
      readonly moraleGained: 0;
    }
  | {
      readonly applied: true;
      readonly damageDealt: number;
      readonly troopsHealed: number;
      readonly moraleGained: number;
    };

export function applyBattleTactic(
  state: Readonly<GameState>,
  bs: BattleState,
  order: Readonly<BattleTacticOrder>,
  options: Readonly<ApplyBattleTacticOptions> = {},
): TacticApplicationResult {
  const validation = validateBattleTactic(state, bs, order);
  if (!validation.ok) {
    return {
      applied: false,
      reason: validation.reason,
      damageDealt: 0,
      troopsHealed: 0,
      moraleGained: 0,
    };
  }
  const { actor, def, target } = validation;
  bs.saihai[actor.side] -= def.saihaiCost;
  actor.tacticCooldowns[def.id] = def.cooldownTicks;

  if (def.kind === 'buff') {
    addBuff(actor, def, target?.id ?? null);
    return { applied: true, damageDealt: 0, troopsHealed: 0, moraleGained: 0 };
  }
  if (def.kind === 'debuff') {
    addDebuff(target!, def, actor.id);
    return { applied: true, damageDealt: 0, troopsHealed: 0, moraleGained: 0 };
  }

  if (def.effect.type === 'volley') {
    const attackPower = options.attackPower ?? defaultTacticAttackPower(state, actor);
    const perHit = Math.max(
      0,
      Math.round(attackPower * BAL.battleTickDamageRate * def.effect.damageMult),
    );
    let damageDealt = 0;
    for (let hit = 0; hit < def.effect.hits; hit += 1) {
      const damage = Math.min(target!.troops, perHit);
      target!.troops -= damage;
      damageDealt += damage;
    }
    return { applied: true, damageDealt, troopsHealed: 0, moraleGained: 0 };
  }
  if (def.effect.type === 'inspire') {
    let moraleGained = 0;
    for (const unit of bs.units) {
      if (unit.side !== actor.side || unit.jinId !== actor.jinId || unit.routed) continue;
      const before = unit.morale;
      unit.morale = Math.min(100, unit.morale + def.effect.moraleGain);
      moraleGained += unit.morale - before;
    }
    return { applied: true, damageDealt: 0, troopsHealed: 0, moraleGained };
  }
  if (def.effect.type === 'heal') {
    const missing = Math.max(0, actor.battleInitialTroops - actor.troops);
    const cap = Math.floor(actor.battleInitialTroops * def.effect.initialTroopRatio);
    const troopsHealed = Math.min(missing, cap);
    actor.troops += troopsHealed;
    return { applied: true, damageDealt: 0, troopsHealed, moraleGained: 0 };
  }
  throw new CoreError('INVARIANT_VIOLATION', `即時戰法缺少結算器：${def.id}`);
}

export function tacticAttackMultiplier(unit: Readonly<BattleUnit>): number {
  return unit.activeTactics.reduce(
    (mult, active) => mult * (activeDefinition(active)?.atkMult ?? 1),
    1,
  );
}

export function tacticDamageTakenMultiplier(unit: Readonly<BattleUnit>): number {
  return unit.activeTactics.reduce(
    (mult, active) => mult * (activeDefinition(active)?.dmgTakenMult ?? 1),
    1,
  );
}

export function isTacticImmobile(unit: Readonly<BattleUnit>): boolean {
  return unit.activeTactics.some((active) => activeDefinition(active)?.immobile === true);
}

export function tacticMoraleFloor(unit: Readonly<BattleUnit>): number | null {
  const lastStand = unit.activeTactics.find(
    (active) => activeDefinition(active)?.effect.type === 'lastStand',
  );
  const effect = lastStand ? activeDefinition(lastStand)?.effect : undefined;
  return effect?.type === 'lastStand' ? BAL.moraleBreakThreshold + effect.moraleFloorOffset : null;
}

export function forcedAttackTargetUnitId(unit: Readonly<BattleUnit>): string | null {
  return (
    unit.activeTactics.find((active) => activeDefinition(active)?.effect.type === 'taunt')
      ?.targetUnitId ?? null
  );
}

export function hasCavalryTactic(unit: Readonly<BattleUnit>): boolean {
  return unit.activeTactics.some((active) => activeDefinition(active)?.effect.type === 'cavalry');
}

export function fireArrowTargetUnitId(unit: Readonly<BattleUnit>): string | null {
  return (
    unit.activeTactics.find((active) => activeDefinition(active)?.effect.type === 'fireArrow')
      ?.targetUnitId ?? null
  );
}

/** Step 7: decrement cooldowns and durations once, deleting zero-valued entries deterministically. */
export function decrementTacticTimers(bs: BattleState): void {
  for (const unit of bs.units) {
    for (const id of Object.keys(unit.tacticCooldowns).sort()) {
      const remaining = unit.tacticCooldowns[id] ?? 0;
      if (remaining <= 1) delete unit.tacticCooldowns[id];
      else unit.tacticCooldowns[id] = remaining - 1;
    }
    unit.activeTactics = unit.activeTactics
      .map((active) => ({ ...active, remainingTicks: active.remainingTicks - 1 }))
      .filter((active) => active.remainingTicks > 0);
  }
}
