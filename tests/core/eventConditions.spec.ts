import { describe, expect, it } from 'vitest';
import {
  evalCond,
  evalConditions,
  resolveClanRef,
  resolveCastleRef,
  resolveDistrictRef,
} from '../../src/core/systems/events/conditions';
import type { EventBinding, EventCondition } from '../../src/core/systems/events/types';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import type { EventId, OfficerId, ProvinceId, ClanId, CastleId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  PROV_OWARI,
  PROV_SURUGA,
} from '../fixtures/tiny';

const fired = 'evt.fixture' as EventId;
const missingClan = 'clan.missing' as ClanId;
function fixture() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.gold = 200;
  state.clans[CLAN_ALPHA]!.prestige = 300;
  state.clans[CLAN_ALPHA]!.courtRank = 'ju4ge';
  state.clans[CLAN_ALPHA]!.shogunateTitle = 'kanrei';
  state.castles[CASTLE_A1]!.coastal = true;
  state.events.flags.ready = 2;
  state.events.fired[fired] = 0;
  state.court.shogunateExists = true;
  return state;
}
const cases: [string, EventCondition, EventCondition][] = [
  [
    'clanAlive',
    { kind: 'clanAlive', clanId: CLAN_ALPHA },
    { kind: 'clanAlive', clanId: missingClan },
  ],
  [
    'clanIsPlayer',
    { kind: 'clanIsPlayer', clanId: CLAN_ALPHA, value: true },
    { kind: 'clanIsPlayer', clanId: CLAN_ALPHA, value: false },
  ],
  [
    'clanGoldAtLeast',
    { kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: 200 },
    { kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: 201 },
  ],
  [
    'prestigeAtLeast',
    { kind: 'prestigeAtLeast', clanId: CLAN_ALPHA, value: 300 },
    { kind: 'prestigeAtLeast', clanId: CLAN_ALPHA, value: 301 },
  ],
  [
    'castleCountAtLeast',
    { kind: 'castleCountAtLeast', clanId: CLAN_ALPHA, count: 2 },
    { kind: 'castleCountAtLeast', clanId: CLAN_ALPHA, count: 3 },
  ],
  [
    'kokudakaShareAtLeast',
    { kind: 'kokudakaShareAtLeast', clanId: CLAN_ALPHA, percent: 1 },
    { kind: 'kokudakaShareAtLeast', clanId: CLAN_ALPHA, percent: 100 },
  ],
  [
    'clanOwnsCoastalCastle',
    { kind: 'clanOwnsCoastalCastle', clanId: CLAN_ALPHA },
    { kind: 'clanOwnsCoastalCastle', clanId: CLAN_BETA },
  ],
  [
    'ownsProvince',
    { kind: 'ownsProvince', clanId: CLAN_ALPHA, provinceId: PROV_OWARI },
    { kind: 'ownsProvince', clanId: CLAN_ALPHA, provinceId: PROV_SURUGA },
  ],
  [
    'castleOwner',
    { kind: 'castleOwner', castleId: CASTLE_A1, clanId: CLAN_ALPHA },
    { kind: 'castleOwner', castleId: CASTLE_B1, clanId: CLAN_ALPHA },
  ],
  [
    'officerAlive',
    { kind: 'officerAlive', officerId: OFF_ALPHA_LORD },
    { kind: 'officerAlive', officerId: 'off.missing' as OfficerId },
  ],
  [
    'officerServes',
    { kind: 'officerServes', officerId: OFF_ALPHA_BUSHO, clanId: CLAN_ALPHA },
    { kind: 'officerServes', officerId: OFF_ALPHA_BUSHO, clanId: CLAN_BETA },
  ],
  [
    'officerIsLeader',
    { kind: 'officerIsLeader', officerId: OFF_ALPHA_LORD, clanId: CLAN_ALPHA },
    { kind: 'officerIsLeader', officerId: OFF_ALPHA_BUSHO, clanId: CLAN_ALPHA },
  ],
  [
    'officerInProvinces',
    { kind: 'officerInProvinces', officerId: OFF_ALPHA_LORD, provinceIds: [PROV_OWARI] },
    { kind: 'officerInProvinces', officerId: OFF_ALPHA_LORD, provinceIds: [PROV_SURUGA] },
  ],
  [
    'atWar',
    { kind: 'atWar', a: CLAN_ALPHA, b: CLAN_BETA },
    { kind: 'atWar', a: CLAN_ALPHA, b: CLAN_ALPHA },
  ],
  [
    'pactExists',
    { kind: 'pactExists', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'alliance' },
    { kind: 'pactExists', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'marriage' },
  ],
  [
    'shogunateExists',
    { kind: 'shogunateExists', value: true },
    { kind: 'shogunateExists', value: false },
  ],
  [
    'shogunateTitleAtLeast',
    { kind: 'shogunateTitleAtLeast', clanId: CLAN_ALPHA, title: 'kanrei' },
    { kind: 'shogunateTitleAtLeast', clanId: CLAN_ALPHA, title: 'fukushogun' },
  ],
  [
    'courtRankAtLeast',
    { kind: 'courtRankAtLeast', clanId: CLAN_ALPHA, rank: 'ju4ge' },
    { kind: 'courtRankAtLeast', clanId: CLAN_ALPHA, rank: 'ju4jo' },
  ],
  ['flag', { kind: 'flag', key: 'ready', min: 2 }, { kind: 'flag', key: 'ready', min: 3 }],
  [
    'eventFired',
    { kind: 'eventFired', eventId: fired },
    { kind: 'eventFired', eventId: 'evt.missing' as EventId },
  ],
  [
    'not',
    { kind: 'not', cond: { kind: 'flag', key: 'absent', min: 1 } },
    { kind: 'not', cond: { kind: 'clanAlive', clanId: CLAN_ALPHA } },
  ],
  [
    'any',
    {
      kind: 'any',
      conds: [
        { kind: 'clanAlive', clanId: missingClan },
        { kind: 'clanAlive', clanId: CLAN_ALPHA },
      ],
    },
    { kind: 'any', conds: [] },
  ],
];
describe('M8 pure event condition DSL', () => {
  it('missing inherited flag names evaluate as zero, while own prototype-like keys remain valid', () => {
    const state = buildTinyState();
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(evalCond({ kind: 'flag', key, min: 0 }, state)).toBe(true);
      expect(evalCond({ kind: 'flag', key, min: 1 }, state)).toBe(false);
      Object.defineProperty(state.events.flags, key, {
        value: 2,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      expect(evalCond({ kind: 'flag', key, min: 2 }, state)).toBe(true);
      expect(evalCond({ kind: 'flag', key, min: 3 }, state)).toBe(false);
    }
    expect(Object.getPrototypeOf(state.events.flags)).toBe(Object.prototype);
  });
  it.each(cases)('%s has true/false cases without mutating state or RNG', (name, yes, no) => {
    const state = fixture();
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    if (name === 'atWar') row.lastHostileDay = state.time.day;
    if (name === 'pactExists')
      row.pacts.push({
        kind: 'alliance',
        startDay: state.time.day,
        endDay: state.time.day + 30,
        vassalClanId: null,
      });
    const before = structuredClone(state);
    expect(evalCond(yes, state)).toBe(true);
    expect(evalCond(no, state)).toBe(false);
    expect(evalCond(yes, state)).toBe(true);
    expect(state).toEqual(before);
  });
  it('resolves explicit bindings without assuming player ownership or materializing diplomacy', () => {
    const state = fixture(),
      before = structuredClone(state);
    const binding: EventBinding = {
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      districtId: state.castles[CASTLE_B1]!.districtIds[0]!,
    };
    expect(resolveClanRef('$clan', binding)).toBe(CLAN_BETA);
    expect(resolveCastleRef('$castle', binding)).toBe(CASTLE_B1);
    expect(resolveDistrictRef('$district', binding)).toBe(binding.districtId);
    expect(
      evalCond({ kind: 'castleOwner', castleId: '$castle', clanId: '$clan' }, state, binding),
    ).toBe(true);
    expect(evalCond({ kind: 'clanIsPlayer', clanId: '$clan', value: false }, state, binding)).toBe(
      true,
    );
    expect(evalCond({ kind: 'clanAlive', clanId: '$clan' }, state)).toBe(false);
    expect(resolveCastleRef('$castle', null)).toBeNull();
    expect(resolveDistrictRef('$district', null)).toBeNull();
    expect(evalCond({ kind: 'atWar', a: CLAN_ALPHA, b: CLAN_BETA }, state)).toBe(false);
    expect(
      evalCond({ kind: 'pactExists', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'alliance' }, state),
    ).toBe(false);
    expect(state).toEqual(before);
  });
  it('requires a nonempty province and all castles, not partial or vacuous ownership', () => {
    const state = fixture(),
      cond: EventCondition = { kind: 'ownsProvince', clanId: CLAN_ALPHA, provinceId: PROV_OWARI };
    expect(evalCond(cond, state)).toBe(true);
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    expect(evalCond(cond, state)).toBe(false);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    expect(evalCond(cond, state)).toBe(false);
    const empty = 'prov.empty' as ProvinceId;
    state.provinces[empty] = { ...state.provinces[PROV_OWARI]!, id: empty };
    expect(evalCond({ ...cond, provinceId: empty }, state)).toBe(false);
  });
  it('rejects dead clans and nonserving officers; deployed officers are not in provinces', () => {
    const state = fixture();
    state.clans[CLAN_ALPHA]!.alive = false;
    expect(evalCond({ kind: 'clanIsPlayer', clanId: CLAN_ALPHA, value: false }, state)).toBe(false);
    expect(evalCond({ kind: 'castleCountAtLeast', clanId: CLAN_ALPHA, count: 0 }, state)).toBe(
      false,
    );
    state.clans[CLAN_ALPHA]!.alive = true;
    for (const status of ['ronin', 'captive', 'dead'] as const) {
      state.officers[OFF_ALPHA_BUSHO]!.status = status;
      expect(
        evalCond({ kind: 'officerServes', officerId: OFF_ALPHA_BUSHO, clanId: CLAN_ALPHA }, state),
      ).toBe(false);
    }
    state.officers[OFF_ALPHA_LORD]!.armyId = 'army.000001' as never;
    expect(
      evalCond(
        { kind: 'officerInProvinces', officerId: OFF_ALPHA_LORD, provinceIds: [PROV_OWARI] },
        state,
      ),
    ).toBe(false);
  });
  it('uses actual district ownership for share and guards zero national kokudaka', () => {
    const state = fixture();
    for (const d of Object.values(state.districts)) d.kokudaka = 100;
    const total = Object.keys(state.districts).length,
      held = Object.values(state.districts).filter((d) => d.ownerClanId === CLAN_ALPHA).length;
    const percentage = (held / total) * 100;
    expect(
      evalCond({ kind: 'kokudakaShareAtLeast', clanId: CLAN_ALPHA, percent: percentage }, state),
    ).toBe(true);
    expect(
      evalCond(
        { kind: 'kokudakaShareAtLeast', clanId: CLAN_ALPHA, percent: percentage + 0.1 },
        state,
      ),
    ).toBe(false);
    for (const d of Object.values(state.districts)) d.kokudaka = 0;
    expect(evalCond({ kind: 'kokudakaShareAtLeast', clanId: CLAN_ALPHA, percent: 0 }, state)).toBe(
      false,
    );
  });
  it('honors expired pacts, shogun ordering, AND and standard recursive NOT', () => {
    const state = fixture();
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'ceasefire',
      startDay: 0,
      endDay: state.time.day - 1,
      vassalClanId: null,
    });
    expect(
      evalCond({ kind: 'pactExists', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'ceasefire' }, state),
    ).toBe(false);
    state.clans[CLAN_ALPHA]!.shogunateTitle = 'shogun';
    expect(
      evalCond({ kind: 'shogunateTitleAtLeast', clanId: CLAN_ALPHA, title: 'fukushogun' }, state),
    ).toBe(true);
    expect(evalConditions([], state)).toBe(true);
    expect(
      evalConditions(
        [
          { kind: 'clanAlive', clanId: CLAN_ALPHA },
          { kind: 'flag', key: 'absent', min: 1 },
        ],
        state,
      ),
    ).toBe(false);
    expect(evalCond({ kind: 'not', cond: { kind: 'clanAlive', clanId: missingClan } }, state)).toBe(
      true,
    );
    expect(evalCond({ kind: 'monthlyChance', pct: 100 } as unknown as EventCondition, state)).toBe(
      false,
    );
    expect(
      evalCond(
        { kind: 'castleOwner', castleId: 'castle.missing' as CastleId, clanId: CLAN_ALPHA },
        state,
      ),
    ).toBe(false);
  });
});
