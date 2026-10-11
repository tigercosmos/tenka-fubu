import { COURT_RANK_VALUES, SHOGUNATE_TITLE_VALUES } from '../../state/enums';
import type { GameState } from '../../state/gameState';
import type { CastleId, ClanId, DistrictId } from '../../state/ids';
import { hasPact, isAtWar } from '../diplomacyCommon';
import { resolveEventFlagKey } from './flagKeys';
import type { CastleRef, ClanRef, DistrictRef, EventBinding, EventCondition } from './types';

export function resolveClanRef(
  ref: ClanRef,
  binding: Readonly<EventBinding> | null,
): ClanId | null {
  return ref === '$clan' ? (binding?.clanId ?? null) : ref;
}
export function resolveCastleRef(
  ref: CastleRef,
  binding: Readonly<EventBinding> | null,
): CastleId | null {
  return ref === '$castle' ? (binding?.castleId ?? null) : ref;
}
export function resolveDistrictRef(
  ref: DistrictRef,
  binding: Readonly<EventBinding> | null,
): DistrictId | null {
  return ref === '$district' ? (binding?.districtId ?? null) : ref;
}

/** Plan10 §3.2: pure AND/OR/NOT predicates, missing entities false; no RNG or row writes. */
export function evalCond(
  cond: EventCondition,
  state: Readonly<GameState>,
  binding: Readonly<EventBinding> | null = null,
): boolean {
  const liveClan = (ref: ClanRef) => {
    const id = resolveClanRef(ref, binding);
    return id !== null && state.clans[id]?.alive ? state.clans[id] : undefined;
  };
  switch (cond.kind) {
    case 'districtPopulationAtLeast': {
      const id = resolveDistrictRef(cond.districtId, binding);
      const district = id === null ? undefined : state.districts[id];
      return (
        !!district &&
        state.clans[district.ownerClanId]?.alive === true &&
        district.population >= cond.value
      );
    }
    case 'clanAlive':
      return liveClan(cond.clanId) !== undefined;
    case 'clanIsPlayer': {
      const clan = liveClan(cond.clanId);
      return !!clan && (clan.id === state.meta.playerClanId) === cond.value;
    }
    case 'clanGoldAtLeast':
      return (liveClan(cond.clanId)?.gold ?? -Infinity) >= cond.value;
    case 'prestigeAtLeast':
      return (liveClan(cond.clanId)?.prestige ?? -Infinity) >= cond.value;
    case 'castleCountAtLeast': {
      const clan = liveClan(cond.clanId);
      return (
        !!clan &&
        Object.values(state.castles).filter((c) => c.ownerClanId === clan.id).length >= cond.count
      );
    }
    case 'kokudakaShareAtLeast': {
      const clan = liveClan(cond.clanId);
      if (!clan) return false;
      let total = 0,
        owned = 0;
      for (const district of Object.values(state.districts)) {
        total += district.kokudaka;
        if (district.ownerClanId === clan.id) owned += district.kokudaka;
      }
      return total > 0 && (owned / total) * 100 >= cond.percent;
    }
    case 'clanOwnsCoastalCastle': {
      const clan = liveClan(cond.clanId);
      return (
        !!clan && Object.values(state.castles).some((c) => c.ownerClanId === clan.id && c.coastal)
      );
    }
    case 'ownsProvince': {
      const clan = liveClan(cond.clanId);
      if (!clan || !state.provinces[cond.provinceId]) return false;
      const castles = Object.values(state.castles).filter((c) => c.provinceId === cond.provinceId);
      return castles.length > 0 && castles.every((c) => c.ownerClanId === clan.id);
    }
    case 'castleOwner': {
      const clan = liveClan(cond.clanId),
        id = resolveCastleRef(cond.castleId, binding);
      return !!clan && id !== null && state.castles[id]?.ownerClanId === clan.id;
    }
    case 'officerAlive':
      return !!state.officers[cond.officerId] && state.officers[cond.officerId]!.status !== 'dead';
    case 'officerServes': {
      const clan = liveClan(cond.clanId),
        officer = state.officers[cond.officerId];
      return !!clan && officer?.status === 'serving' && officer.clanId === clan.id;
    }
    case 'officerIsLeader': {
      const clan = liveClan(cond.clanId),
        officer = state.officers[cond.officerId];
      return (
        !!clan &&
        clan.leaderId === cond.officerId &&
        officer?.status === 'serving' &&
        officer.clanId === clan.id
      );
    }
    case 'officerInProvinces': {
      const officer = state.officers[cond.officerId];
      if (
        !officer ||
        officer.status === 'dead' ||
        officer.armyId !== null ||
        officer.locationCastleId === null
      )
        return false;
      const province = state.castles[officer.locationCastleId]?.provinceId;
      return (
        province !== undefined && !!state.provinces[province] && cond.provinceIds.includes(province)
      );
    }
    case 'atWar': {
      const a = liveClan(cond.a),
        b = liveClan(cond.b);
      return !!a && !!b && isAtWar(state, a.id, b.id);
    }
    case 'pactExists': {
      const a = liveClan(cond.a),
        b = liveClan(cond.b);
      return !!a && !!b && a.id !== b.id && hasPact(state, a.id, b.id, cond.pact);
    }
    case 'shogunateExists':
      return state.court.shogunateExists === cond.value;
    case 'shogunateTitleAtLeast': {
      const clan = liveClan(cond.clanId),
        need = SHOGUNATE_TITLE_VALUES.indexOf(cond.title);
      return !!clan && need >= 0 && SHOGUNATE_TITLE_VALUES.indexOf(clan.shogunateTitle) >= need;
    }
    case 'courtRankAtLeast': {
      const clan = liveClan(cond.clanId),
        need = COURT_RANK_VALUES.indexOf(cond.rank);
      return !!clan && need >= 0 && COURT_RANK_VALUES.indexOf(clan.courtRank) >= need;
    }
    case 'flag': {
      const key = resolveEventFlagKey(cond.key, state, binding);
      return (
        key !== null &&
        (Object.hasOwn(state.events.flags, key) ? state.events.flags[key]! : 0) >= cond.min
      );
    }
    case 'eventFired':
      return Object.hasOwn(state.events.fired, cond.eventId);
    case 'not':
      return !evalCond(cond.cond, state, binding);
    case 'any':
      return cond.conds.length > 0 && cond.conds.some((c) => evalCond(c, state, binding));
    default:
      return false;
  }
}

export function evalConditions(
  conditions: readonly EventCondition[],
  state: Readonly<GameState>,
  binding: Readonly<EventBinding> | null = null,
): boolean {
  return conditions.every((cond) => evalCond(cond, state, binding));
}
