import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { collapseShogunate } from '../../src/core/systems/court';
import { DAYS_PER_MONTH } from '../../src/core/systems/time';
import { supportsEventEffects } from '../../src/core/systems/events/effects';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

describe('production catalog forced effects', () => {
  it('removes an existing vassal pact without player betrayal penalties', () => {
    const state = buildTinyState();
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts = [{ kind: 'vassal', startDay: 0, endDay: null, vassalClanId: CLAN_ALPHA }];
    const before = structuredClone(state);
    const events: GameEvent[] = [];
    applyEventEffects(
      state,
      [{ op: 'breakPact', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'vassal' }],
      null,
      (event) => events.push(event),
    );
    expect(row.pacts).toEqual([]);
    expect(state.clans).toEqual(before.clans);
    expect({ ...row, pacts: before.diplomacy.rows[row.key]!.pacts }).toEqual(
      before.diplomacy.rows[row.key],
    );
    expect(state.rng).toEqual(before.rng);
    expect(events.map((event) => event.type)).toEqual(['pact.broken']);
    expect(validateState(state)).toEqual([]);
  });

  it('grants the authored title with cumulative title prestige but without donation', () => {
    const state = buildTinyState();
    state.court.shogunateExists = true;
    state.court.shogunClanId = CLAN_BETA;
    const before = structuredClone(state);
    const events: GameEvent[] = [];
    applyEventEffects(
      state,
      [{ op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'fukushogun' }],
      null,
      (event) => events.push(event),
    );
    expect(state.clans[CLAN_ALPHA]).toEqual({
      ...before.clans[CLAN_ALPHA],
      shogunateTitle: 'fukushogun',
      prestige: Math.min(
        BAL.prestigeMax,
        before.clans[CLAN_ALPHA]!.prestige +
          BAL.shogunateTitleTable
            .filter(
              (def) =>
                def.order <= BAL.shogunateTitleTable.find((def) => def.id === 'fukushogun')!.order,
            )
            .reduce((sum, def) => sum + def.prestigeBonus, 0),
      ),
    });
    expect(state.court).toEqual(before.court);
    expect(state.rng).toEqual(before.rng);
    expect(events.map((event) => event.type)).toEqual(['shogunate.titleGranted']);
    expect(validateState(state)).toEqual([]);
  });

  it('does not materialize a missing pact or emit an invented breaker', () => {
    const state = buildTinyState(),
      before = structuredClone(state),
      events: GameEvent[] = [];
    applyEventEffects(
      state,
      [{ op: 'breakPact', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'marriage' }],
      null,
      (event) => events.push(event),
    );
    expect(state).toEqual(before);
    expect(events).toEqual([]);
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts = [
      { kind: 'marriage', startDay: state.time.day, endDay: null, vassalClanId: null },
    ];
    applyEventEffects(
      state,
      [{ op: 'breakPact', a: CLAN_BETA, b: CLAN_ALPHA, pact: 'marriage' }],
      null,
      (event) => events.push(event),
    );
    expect(events).toEqual([
      {
        type: 'pact.broken',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        aClanId: CLAN_ALPHA,
        bClanId: CLAN_BETA,
        kind: 'marriage',
        breakerClanId: null,
      },
    ]);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['alliance', 'ceasefire'] as const)(
    'refreshes %s expiry once without repeated sentiment or costs',
    (kind) => {
      const state = buildTinyState(),
        row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA),
        events: GameEvent[] = [];
      row.pacts = [{ kind, startDay: 0, endDay: state.time.day + 1, vassalClanId: null }];
      const before = structuredClone(state);
      applyEventEffects(
        state,
        [
          {
            op: 'signPact',
            a: CLAN_ALPHA,
            b: CLAN_BETA,
            pact: kind,
            months: 240,
            vassalClanId: null,
          },
        ],
        null,
        (event) => events.push(event),
      );
      expect(row.pacts).toEqual([
        {
          kind,
          startDay: state.time.day,
          endDay: state.time.day + 240 * DAYS_PER_MONTH,
          vassalClanId: null,
        },
      ]);
      expect(row.sentimentAtoB).toBe(before.diplomacy.rows[row.key]!.sentimentAtoB);
      expect(row.sentimentBtoA).toBe(before.diplomacy.rows[row.key]!.sentimentBtoA);
      expect(state.clans).toEqual(before.clans);
      expect(state.rng).toEqual(before.rng);
      expect(events.map((event) => event.type)).toEqual(['pact.signed']);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('takes only the cumulative title delta and reclaims exactly that bonus on collapse', () => {
    const state = buildTinyState(),
      events: GameEvent[] = [];
    state.court.shogunateExists = true;
    state.court.shogunClanId = CLAN_BETA;
    const clan = state.clans[CLAN_ALPHA]!,
      start = clan.prestige;
    applyEventEffects(
      state,
      [
        { op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'hokoshu' },
        { op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'kanrei' },
        { op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'kanrei' },
      ],
      null,
      (event) => events.push(event),
    );
    const order = BAL.shogunateTitleTable.find((def) => def.id === 'kanrei')!.order;
    expect(clan.prestige).toBe(
      start +
        BAL.shogunateTitleTable
          .filter((def) => def.order <= order)
          .reduce((sum, def) => sum + def.prestigeBonus, 0),
    );
    expect(events).toHaveLength(2);
    collapseShogunate(state, () => undefined);
    expect(clan.prestige).toBe(start);
    const before = structuredClone(state);
    applyEventEffects(
      state,
      [{ op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'kanrei' }],
      null,
      () => undefined,
    );
    expect(state).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });

  it('protects a living successor after the ordered Honnoji-style two-death batch', () => {
    // A miniature lifecycle fixture, not a claim that tiny is the national scenario.
    const state = buildTinyState(),
      events: GameEvent[] = [];
    state.officers[OFF_ALPHA_TAISHO]!.kinship = 'kin';
    state.officers[OFF_ALPHA_TAISHO]!.rank = 'karo';
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    const rng = structuredClone(state.rng);
    applyEventEffects(
      state,
      [
        { op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'battle' },
        { op: 'killOfficer', officerId: OFF_ALPHA_TAISHO, cause: 'battle' },
        { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO },
      ],
      null,
      (event) => events.push(event),
    );
    expect(state.clans[CLAN_ALPHA]!.leaderId).toBe(OFF_ALPHA_BUSHO);
    expect(state.officers[OFF_ALPHA_BUSHO]!.status).toBe('serving');
    expect(events.map((event) => event.type)).toEqual([
      'officer.died',
      'clan.succession',
      'officer.died',
      'clan.succession',
    ]);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('preflights an overflowing duration before earlier forced cancellation or title mutation', () => {
    const state = buildTinyState(),
      events: GameEvent[] = [];
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts = [
      { kind: 'alliance', startDay: 0, endDay: state.time.day + 30, vassalClanId: null },
    ];
    const before = structuredClone(state);
    expect(() =>
      applyEventEffects(
        state,
        [
          { op: 'breakPact', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'alliance' },
          { op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'kanrei' },
          {
            op: 'signPact',
            a: CLAN_ALPHA,
            b: CLAN_BETA,
            pact: 'alliance',
            months: Number.MAX_VALUE,
            vassalClanId: null,
          },
        ],
        null,
        (event) => events.push(event),
      ),
    ).toThrow('duration overflow');
    expect(state).toEqual(before);
    expect(events).toEqual([]);
    expect(
      supportsEventEffects([
        {
          op: 'transferCastle',
          castleId: state.clans[CLAN_ALPHA]!.homeCastleId,
          toClanId: CLAN_BETA,
        },
      ]),
    ).toBe(false);
  });
});
