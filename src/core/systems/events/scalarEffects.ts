import { BAL } from '../../balance';
import { castleFoodCap, castleMaxSoldiers } from '../../domestic';
import type { EmitFn } from '../../commands/registry';
import type { Castle, Clan, District, GameState, Officer } from '../../state/gameState';
import { collapseShogunate } from '../court';
import { adjustSentiment, adjustTrust, getSentiment, getTrust } from '../diplomacyCommon';
import { resolveCastleRef, resolveClanRef, resolveDistrictRef } from './conditions';
import { resolveEventFlagKey } from './flagKeys';
import type { CastleRef, ClanRef, DistrictRef, EffectOp, EventBinding } from './types';

export const SCALAR_EFFECT_OPS = [
  'addGold',
  'addFood',
  'addSoldiers',
  'loseCastleSoldiersPct',
  'reduceClanSoldiersPct',
  'addPrestige',
  'addLoyalty',
  'addClanLoyalty',
  'addMerit',
  'renameOfficer',
  'addSentiment',
  'addTrust',
  'renameCastle',
  'renameClan',
  'addCastleMorale',
  'addClanCastlesMorale',
  'addCastleDurability',
  'scaleCastleDurability',
  'addDistrictOrder',
  'addClanOrder',
  'scalePopulation',
  'addCourtFavor',
  'endShogunate',
  'setFlag',
] as const satisfies readonly EffectOp['op'][];
export type ScalarEffectOp = Extract<EffectOp, { op: (typeof SCALAR_EFFECT_OPS)[number] }>;
export function isScalarEffectOp(op: EffectOp): op is ScalarEffectOp {
  return (SCALAR_EFFECT_OPS as readonly string[]).includes(op.op);
}

const sorted = <T extends { id: string }>(values: Record<string, T>): T[] =>
  Object.values(values).sort((a, b) => a.id.localeCompare(b.id));
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const add = (current: number, amount: number, min = 0, max = Infinity): number => {
  const next = current + Math.round(amount);
  return Number.isFinite(next) ? clamp(next, min, max) : current;
};

/** Only the named scalar subset: ordered, deterministic, no RNG, hooks or lifecycle dispatch. */
export function applyScalarEffects(
  state: GameState,
  ops: readonly ScalarEffectOp[],
  binding: Readonly<EventBinding> | null,
  emit: EmitFn,
): void {
  const clan = (ref: ClanRef): Clan | undefined => {
    const id = resolveClanRef(ref, binding);
    return id !== null && state.clans[id]?.alive ? state.clans[id] : undefined;
  };
  const castle = (ref: CastleRef): Castle | undefined => {
    const id = resolveCastleRef(ref, binding);
    const target = id === null ? undefined : state.castles[id];
    return target && state.clans[target.ownerClanId]?.alive ? target : undefined;
  };
  const district = (ref: DistrictRef): District | undefined => {
    const id = resolveDistrictRef(ref, binding);
    const target = id === null ? undefined : state.districts[id];
    return target && state.clans[target.ownerClanId]?.alive ? target : undefined;
  };
  const officer = (id: Officer['id']): Officer | undefined => {
    const target = state.officers[id];
    return target &&
      target.status !== 'dead' &&
      (target.clanId === null || state.clans[target.clanId]?.alive)
      ? target
      : undefined;
  };
  const loyalty = (target: Officer, amount: number): void => {
    if (target.clanId !== null && state.clans[target.clanId]?.leaderId === target.id) return;
    target.loyalty = add(target.loyalty, amount, 0, 100);
  };
  for (const op of ops) {
    if ('amount' in op && !Number.isFinite(op.amount)) continue;
    if ('pct' in op && (!Number.isFinite(op.pct) || op.pct < 0 || op.pct > 100)) continue;
    switch (op.op) {
      case 'addGold': {
        const target = clan(op.clanId);
        if (target) target.gold = add(target.gold, op.amount);
        break;
      }
      case 'addPrestige': {
        const target = clan(op.clanId);
        if (target) target.prestige = add(target.prestige, op.amount, 0, BAL.prestigeMax);
        break;
      }
      case 'addFood': {
        const target = castle(op.castleId);
        if (target) target.food = add(target.food, op.amount, 0, castleFoodCap(target));
        break;
      }
      case 'addSoldiers': {
        const target = castle(op.castleId);
        if (target)
          target.soldiers = Math.round(
            add(target.soldiers, op.amount, 0, castleMaxSoldiers(state, target)),
          );
        break;
      }
      case 'loseCastleSoldiersPct': {
        const target = castle(op.castleId);
        if (target) target.soldiers -= Math.floor((target.soldiers * op.pct) / 100);
        break;
      }
      case 'reduceClanSoldiersPct': {
        const target = clan(op.clanId);
        if (!target) break;
        for (const item of [...sorted(state.castles), ...sorted(state.armies)]) {
          const owner = 'ownerClanId' in item ? item.ownerClanId : item.clanId;
          if (owner === target.id) item.soldiers = Math.floor(item.soldiers * (1 - op.pct / 100));
        }
        break;
      }
      case 'addLoyalty': {
        const target = officer(op.officerId);
        if (target) loyalty(target, op.amount);
        break;
      }
      case 'addClanLoyalty': {
        const target = clan(op.clanId);
        if (!target) break;
        for (const item of sorted(state.officers))
          if (item.status === 'serving' && item.clanId === target.id) loyalty(item, op.amount);
        break;
      }
      case 'addMerit': {
        const target = officer(op.officerId);
        if (target) target.merit = add(target.merit, op.amount);
        break;
      }
      case 'renameOfficer': {
        const target = officer(op.officerId);
        if (target) target.name = op.name;
        break;
      }
      case 'renameCastle': {
        const target = castle(op.castleId);
        if (target) target.name = op.name;
        break;
      }
      case 'renameClan': {
        const target = clan(op.clanId);
        if (target) target.name = op.name;
        break;
      }
      case 'addSentiment':
      case 'addTrust': {
        const from = clan(op.from),
          to = clan(op.to);
        if (!from || !to || from.id === to.id) break;
        const delta = Math.round(op.amount);
        if (op.op === 'addSentiment') {
          // Canonical signed sentiment range: plan08 and plan10 D16 (-100..100).
          const before = getSentiment(state, from.id, to.id);
          if (add(before, delta, -100, 100) !== before)
            adjustSentiment(state, from.id, to.id, delta);
        } else {
          const before = getTrust(state, from.id, to.id);
          if (add(before, delta, 0, BAL.trustMax) !== before)
            adjustTrust(state, from.id, to.id, delta);
        }
        break;
      }
      case 'addCastleMorale': {
        const target = castle(op.castleId);
        if (target) target.morale = add(target.morale, op.amount, 0, 100);
        break;
      }
      case 'addClanCastlesMorale': {
        const target = clan(op.clanId);
        if (!target) break;
        for (const item of sorted(state.castles))
          if (item.ownerClanId === target.id) item.morale = add(item.morale, op.amount, 0, 100);
        break;
      }
      case 'addCastleDurability': {
        const target = castle(op.castleId);
        if (target) target.durability = add(target.durability, op.amount, 0, target.maxDurability);
        break;
      }
      case 'scaleCastleDurability': {
        const target = castle(op.castleId);
        if (target) target.durability = Math.floor(target.durability * (1 - op.pct / 100));
        break;
      }
      case 'addDistrictOrder': {
        const target = district(op.districtId);
        if (target) target.publicOrder = add(target.publicOrder, op.amount, 0, 100);
        break;
      }
      case 'addClanOrder': {
        const target = clan(op.clanId);
        if (!target) break;
        for (const item of sorted(state.districts))
          if (item.ownerClanId === target.id)
            item.publicOrder = add(item.publicOrder, op.amount, 0, 100);
        break;
      }
      case 'scalePopulation': {
        const target = district(op.districtId);
        if (target) target.population = Math.floor(target.population * (1 - op.pct / 100));
        break;
      }
      case 'addCourtFavor': {
        const target = clan(op.clanId);
        if (target)
          state.court.courtFavor[target.id] = add(
            state.court.courtFavor[target.id] ?? 0,
            op.amount,
            0,
            BAL.courtFavorMax,
          );
        break;
      }
      case 'endShogunate':
        collapseShogunate(state, emit);
        break;
      case 'setFlag': {
        const key = resolveEventFlagKey(op.key, state, binding);
        if (key !== null && Number.isFinite(op.value))
          Object.defineProperty(state.events.flags, key, {
            value: Math.round(op.value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        break;
      }
    }
  }
}
