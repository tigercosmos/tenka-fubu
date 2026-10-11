// Canonical plan10 §3.2 condition DSL. The legacy plan14 event schema is not wired here.
import { z } from 'zod';
import { BAL } from '../../core/balance';
import {
  COURT_RANK_VALUES,
  PACT_KIND_VALUES,
  REGION_VALUES,
  SHOGUNATE_TITLE_VALUES,
} from '../../core/state/enums';
import {
  isCastleId,
  isClanId,
  isDistrictId,
  isEventId,
  isOfficerId,
  isProvinceId,
  type CastleId,
  type ClanId,
  type DistrictId,
  type EventId,
  type OfficerId,
  type ProvinceId,
} from '../../core/state/ids';
import type { EventCondition, EventFlagKey } from '../../core/systems/events/types';

// Runtime guards and branded output share core's canonical ID regexes.
const brandedId = <T extends string>(guard: (value: string) => value is T) =>
  z.custom<T>((value: unknown) => typeof value === 'string' && guard(value));
const zClanId = brandedId<ClanId>(isClanId);
const zCastleId = brandedId<CastleId>(isCastleId);
const zDistrictId = brandedId<DistrictId>(isDistrictId);
const zOfficerId = brandedId<OfficerId>(isOfficerId);
const zProvinceId = brandedId<ProvinceId>(isProvinceId);
const zEventId = brandedId<EventId>(isEventId);
export const zClanRef = z.union([zClanId, z.literal('$clan')]);
export const zCastleRef = z.union([zCastleId, z.literal('$castle')]);
export const zDistrictRef = z.union([zDistrictId, z.literal('$district')]);
export const zRegionRef = z.union([z.enum(REGION_VALUES), z.literal('$region')]);
export const zEventFlagKey = z
  .string()
  .min(1)
  .refine((key) => key.trim().length > 0, {
    message: 'event flag key must not be blank',
  });
export const zEventFlagRef: z.ZodType<EventFlagKey> = z.union([
  zEventFlagKey,
  z
    .object({ prefix: zEventFlagKey, clanId: zClanRef, year: z.literal('current').optional() })
    .strict(),
]);
const nonnegativeInt = z.number().finite().int().min(0);

/** Unknown fields are rejected instead of silently accepting a legacy/random predicate. */
export const zCanonicalEventCondition: z.ZodType<EventCondition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('clanAlive'), clanId: zClanRef }).strict(),
    z.object({ kind: z.literal('clanIsPlayer'), clanId: zClanRef, value: z.boolean() }).strict(),
    z
      .object({ kind: z.literal('clanGoldAtLeast'), clanId: zClanRef, value: nonnegativeInt })
      .strict(),
    z
      .object({
        kind: z.literal('prestigeAtLeast'),
        clanId: zClanRef,
        value: nonnegativeInt.max(BAL.prestigeMax),
      })
      .strict(),
    z
      .object({ kind: z.literal('castleCountAtLeast'), clanId: zClanRef, count: nonnegativeInt })
      .strict(),
    z
      .object({
        kind: z.literal('kokudakaShareAtLeast'),
        clanId: zClanRef,
        percent: z.number().finite().min(0).max(100),
      })
      .strict(),
    z.object({ kind: z.literal('clanOwnsCoastalCastle'), clanId: zClanRef }).strict(),
    z
      .object({ kind: z.literal('ownsProvince'), clanId: zClanRef, provinceId: zProvinceId })
      .strict(),
    z.object({ kind: z.literal('castleOwner'), castleId: zCastleRef, clanId: zClanRef }).strict(),
    z
      .object({
        kind: z.literal('districtPopulationAtLeast'),
        districtId: zDistrictRef,
        value: nonnegativeInt,
      })
      .strict(),
    z.object({ kind: z.literal('officerAlive'), officerId: zOfficerId }).strict(),
    z
      .object({ kind: z.literal('officerServes'), officerId: zOfficerId, clanId: zClanRef })
      .strict(),
    z
      .object({ kind: z.literal('officerIsLeader'), officerId: zOfficerId, clanId: zClanRef })
      .strict(),
    z
      .object({
        kind: z.literal('officerInProvinces'),
        officerId: zOfficerId,
        provinceIds: z.array(zProvinceId),
      })
      .strict(),
    z.object({ kind: z.literal('atWar'), a: zClanRef, b: zClanRef }).strict(),
    z
      .object({
        kind: z.literal('pactExists'),
        a: zClanRef,
        b: zClanRef,
        pact: z.enum(PACT_KIND_VALUES),
      })
      .strict(),
    z.object({ kind: z.literal('shogunateExists'), value: z.boolean() }).strict(),
    z
      .object({
        kind: z.literal('shogunateTitleAtLeast'),
        clanId: zClanRef,
        title: z.enum(SHOGUNATE_TITLE_VALUES),
      })
      .strict(),
    z
      .object({
        kind: z.literal('courtRankAtLeast'),
        clanId: zClanRef,
        rank: z.enum(COURT_RANK_VALUES),
      })
      .strict(),
    z
      .object({ kind: z.literal('flag'), key: zEventFlagRef, min: z.number().finite().int() })
      .strict(),
    z.object({ kind: z.literal('eventFired'), eventId: zEventId }).strict(),
    z.object({ kind: z.literal('not'), cond: zCanonicalEventCondition }).strict(),
    z.object({ kind: z.literal('any'), conds: z.array(zCanonicalEventCondition).min(1) }).strict(),
  ]),
);
