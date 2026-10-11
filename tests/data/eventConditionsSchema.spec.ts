import { describe, expect, it } from 'vitest';
import {
  zCanonicalEventCondition,
  zCastleRef,
  zClanRef,
  zDistrictRef,
} from '../../src/data/schemas/eventConditions';
import type { EventCondition } from '../../src/core/systems/events/types';

const valid = [
  { kind: 'clanAlive', clanId: 'clan.oda' },
  { kind: 'clanIsPlayer', clanId: '$clan', value: false },
  { kind: 'clanGoldAtLeast', clanId: 'clan.oda', value: 0 },
  { kind: 'prestigeAtLeast', clanId: 'clan.oda', value: 2000 },
  { kind: 'castleCountAtLeast', clanId: 'clan.oda', count: 0 },
  { kind: 'kokudakaShareAtLeast', clanId: '$clan', percent: 50.5 },
  { kind: 'clanOwnsCoastalCastle', clanId: '$clan' },
  { kind: 'ownsProvince', clanId: 'clan.oda', provinceId: 'prov.yamashiro' },
  { kind: 'castleOwner', castleId: '$castle', clanId: '$clan' },
  { kind: 'officerAlive', officerId: 'off.oda-nobunaga' },
  { kind: 'officerServes', officerId: 'off.oda-nobunaga', clanId: '$clan' },
  { kind: 'officerIsLeader', officerId: 'off.oda-nobunaga', clanId: 'clan.oda' },
  { kind: 'officerInProvinces', officerId: 'off.oda-nobunaga', provinceIds: ['prov.yamashiro'] },
  { kind: 'atWar', a: 'clan.oda', b: 'clan.imagawa' },
  { kind: 'pactExists', a: '$clan', b: 'clan.imagawa', pact: 'vassal' },
  { kind: 'shogunateExists', value: true },
  { kind: 'shogunateTitleAtLeast', clanId: 'clan.oda', title: 'shogun' },
  { kind: 'courtRankAtLeast', clanId: 'clan.oda', rank: 'sho2' },
  { kind: 'flag', key: 'harvest.1560.clan.oda', min: -1 },
  { kind: 'eventFired', eventId: 'evt.okehazama' },
  { kind: 'not', cond: { kind: 'clanAlive', clanId: 'clan.oda' } },
  { kind: 'any', conds: [{ kind: 'shogunateExists', value: true }] },
];

describe('M8 canonical condition schema', () => {
  it.each(valid)('parses $kind with branded core-compatible output', (input) => {
    const parsed: EventCondition = zCanonicalEventCondition.parse(input);
    expect(parsed).toEqual(input);
  });
  it('roundtrips nested recursive conditions without changing payload or bindings', () => {
    const input = { kind: 'not', cond: { kind: 'any', conds: valid } };
    const before = structuredClone(input);
    expect(zCanonicalEventCondition.parse(JSON.parse(JSON.stringify(input)))).toEqual(before);
    expect(input).toEqual(before);
  });
  it.each([
    { kind: 'any', conds: [] },
    { kind: 'not', cond: { kind: 'monthlyChance', pct: 100 } },
    { kind: 'clanAlive', clanId: 'castle.kiyosu' },
    { kind: 'clanAlive', clanId: '$castle' },
    { kind: 'castleOwner', castleId: '$district', clanId: '$clan' },
    { kind: 'ownsProvince', clanId: '$clan', provinceId: '$province' },
    { kind: 'officerAlive', officerId: '$officer' },
    { kind: 'officerAlive', officerId: 'off.Uppercase' },
    { kind: 'eventFired', eventId: 'evt.bad_id' },
    { kind: 'flag', key: '', min: 1 },
    { kind: 'flag', key: '  ', min: 1 },
    { kind: 'flag', key: 'ready', min: 0.5 },
    { kind: 'flag', key: 'ready', min: Infinity },
    { kind: 'clanGoldAtLeast', clanId: '$clan', value: -1 },
    { kind: 'clanGoldAtLeast', clanId: '$clan', value: 1.5 },
    { kind: 'prestigeAtLeast', clanId: '$clan', value: 2001 },
    { kind: 'castleCountAtLeast', clanId: '$clan', count: -1 },
    { kind: 'kokudakaShareAtLeast', clanId: '$clan', percent: 100.1 },
    { kind: 'kokudakaShareAtLeast', clanId: '$clan', percent: NaN },
    { kind: 'pactExists', a: '$clan', b: 'clan.oda', pact: 'peace' },
    { kind: 'courtRankAtLeast', clanId: '$clan', rank: 'unknown' },
    { kind: 'shogunateExists', value: 1 },
    { kind: 'clanAlive', clanId: 'clan.oda', probability: 1 },
    { kind: 'clanAlive', clanId: 'clan.oda', legacy: true },
  ])('rejects unsupported, malformed or out-of-range input %#', (input) => {
    expect(zCanonicalEventCondition.safeParse(input).success).toBe(false);
  });
  it('accepts only the matching typed ref or binding symbol', () => {
    expect(zClanRef.parse('$clan')).toBe('$clan');
    expect(zCastleRef.parse('castle.kiyosu')).toBe('castle.kiyosu');
    expect(zDistrictRef.parse('$district')).toBe('$district');
    expect(zDistrictRef.safeParse('castle.kiyosu').success).toBe(false);
    expect(zClanRef.safeParse(null).success).toBe(false);
    expect(zClanRef.safeParse({ toString: () => 'clan.oda' }).success).toBe(false);
  });
});
