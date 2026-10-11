import { z } from 'zod';
import {
  COURT_RANK_VALUES,
  PACT_KIND_VALUES,
  SHOGUNATE_TITLE_VALUES,
} from '../../core/state/enums';
import { isClanId, isOfficerId, type ClanId, type OfficerId } from '../../core/state/ids';
import type { EffectOp } from '../../core/systems/events/types';
import { zClanRef, zCastleRef, zDistrictRef, zEventFlagRef, zRegionRef } from './eventConditions';
import { zName } from './common';

const clanId = z.custom<ClanId>((v: unknown) => typeof v === 'string' && isClanId(v));
const officerId = z.custom<OfficerId>((v: unknown) => typeof v === 'string' && isOfficerId(v));
const amount = z.number().finite().int();
const pct = z.number().finite().min(0).max(100);
const regionEffect = z.discriminatedUnion('op', [
  z.object({ op: z.literal('scaleCastleDurability'), pct }).strict(),
  z.object({ op: z.literal('addDistrictOrder'), amount }).strict(),
  z.object({ op: z.literal('scalePopulation'), pct }).strict(),
]);
const operations = z.discriminatedUnion('op', [
  z.object({ op: z.literal('addGold'), clanId: zClanRef, amount }).strict(),
  z.object({ op: z.literal('addFood'), castleId: zCastleRef, amount }).strict(),
  z.object({ op: z.literal('addSoldiers'), castleId: zCastleRef, amount }).strict(),
  z.object({ op: z.literal('loseCastleSoldiersPct'), castleId: zCastleRef, pct }).strict(),
  z.object({ op: z.literal('reduceClanSoldiersPct'), clanId: zClanRef, pct }).strict(),
  z.object({ op: z.literal('addPrestige'), clanId: zClanRef, amount }).strict(),
  z.object({ op: z.literal('addLoyalty'), officerId, amount }).strict(),
  z.object({ op: z.literal('addClanLoyalty'), clanId: zClanRef, amount }).strict(),
  z.object({ op: z.literal('addMerit'), officerId, amount }).strict(),
  z.object({ op: z.literal('transferOfficer'), officerId, toClanId: clanId }).strict(),
  z.object({ op: z.literal('makeRonin'), officerId }).strict(),
  z
    .object({
      op: z.literal('killOfficer'),
      officerId,
      cause: z.enum(['age', 'battle', 'execution']),
    })
    .strict(),
  z.object({ op: z.literal('renameOfficer'), officerId, name: zName }).strict(),
  z.object({ op: z.literal('addSentiment'), from: zClanRef, to: zClanRef, amount }).strict(),
  z.object({ op: z.literal('addTrust'), from: zClanRef, to: zClanRef, amount }).strict(),
  z.object({ op: z.literal('declareWar'), a: zClanRef, b: zClanRef }).strict(),
  z
    .object({
      op: z.literal('signPact'),
      a: zClanRef,
      b: zClanRef,
      pact: z.enum(PACT_KIND_VALUES),
      months: z.number().finite().int().positive().nullable(),
      vassalClanId: clanId.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal('breakPact'),
      a: zClanRef,
      b: zClanRef,
      pact: z.enum(PACT_KIND_VALUES),
    })
    .strict(),
  z.object({ op: z.literal('transferCastle'), castleId: zCastleRef, toClanId: clanId }).strict(),
  z.object({ op: z.literal('renameCastle'), castleId: zCastleRef, name: zName }).strict(),
  z.object({ op: z.literal('renameClan'), clanId: zClanRef, name: zName }).strict(),
  z.object({ op: z.literal('addCastleMorale'), castleId: zCastleRef, amount }).strict(),
  z.object({ op: z.literal('addClanCastlesMorale'), clanId: zClanRef, amount }).strict(),
  z.object({ op: z.literal('addCastleDurability'), castleId: zCastleRef, amount }).strict(),
  z.object({ op: z.literal('scaleCastleDurability'), castleId: zCastleRef, pct }).strict(),
  z.object({ op: z.literal('addDistrictOrder'), districtId: zDistrictRef, amount }).strict(),
  z.object({ op: z.literal('addClanOrder'), clanId: zClanRef, amount }).strict(),
  z.object({ op: z.literal('scalePopulation'), districtId: zDistrictRef, pct }).strict(),
  z
    .object({ op: z.literal('affectRegion'), region: zRegionRef, effects: z.array(regionEffect) })
    .strict(),
  z.object({ op: z.literal('addCourtFavor'), clanId: zClanRef, amount }).strict(),
  z
    .object({ op: z.literal('grantCourtRank'), clanId: zClanRef, rank: z.enum(COURT_RANK_VALUES) })
    .strict(),
  z
    .object({
      op: z.literal('grantShogunateTitle'),
      clanId: zClanRef,
      title: z.enum(SHOGUNATE_TITLE_VALUES),
    })
    .strict(),
  z.object({ op: z.literal('endShogunate') }).strict(),
  z.object({ op: z.literal('setFlag'), key: zEventFlagRef, value: amount }).strict(),
]);
/** Cross-field pact rules mirror02 INV-17; actual referenced ownership remains runtime validation. */
export const zCanonicalEffectOp: z.ZodType<EffectOp> = operations.superRefine((op, ctx) => {
  if (op.op !== 'signPact') return;
  if (op.a === op.b) ctx.addIssue({ code: 'custom', message: 'pact endpoints must differ' });
  if (op.months === null && op.pact !== 'marriage' && op.pact !== 'vassal')
    ctx.addIssue({
      code: 'custom',
      path: ['months'],
      message: 'only marriage/vassal may have no expiry',
    });
  if (op.pact !== 'vassal' && op.vassalClanId !== null)
    ctx.addIssue({
      code: 'custom',
      path: ['vassalClanId'],
      message: 'non-vassal pact must have null vassalClanId',
    });
  if (
    op.pact === 'vassal' &&
    (op.vassalClanId === null ||
      (op.vassalClanId !== op.a &&
        op.vassalClanId !== op.b &&
        op.a !== '$clan' &&
        op.b !== '$clan'))
  )
    ctx.addIssue({
      code: 'custom',
      path: ['vassalClanId'],
      message: 'vassal must be an endpoint (bound endpoints rechecked at runtime)',
    });
});
