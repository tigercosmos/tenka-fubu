import { describe, expect, it, vi } from 'vitest';
import { applyEventEffects, supportsEventEffects } from '../../src/core/systems/events/effects';
import { BAL } from '../../src/core/balance';
import { ensureDiplomacyRow, getSentiment } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import type { EffectOp } from '../../src/core/systems/events/types';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

const binding = { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: null };
const unsupported: EffectOp[] = [
  { op: 'transferOfficer', officerId: OFF_ALPHA_BUSHO, toClanId: CLAN_BETA },
  { op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'execution' },
  {
    op: 'signPact',
    a: CLAN_ALPHA,
    b: CLAN_BETA,
    pact: 'marriage',
    months: null,
    vassalClanId: null,
  },
  { op: 'transferCastle', castleId: CASTLE_A1, toClanId: CLAN_BETA },
  { op: 'grantCourtRank', clanId: CLAN_ALPHA, rank: 'ju5ge' },
];

describe('ordered explicit partial event effect dispatcher', () => {
  it.each(unsupported)(
    'preflights unsupported $op before any earlier mutation or emission',
    (op) => {
      const state = buildTinyState(),
        before = structuredClone(state),
        emit = vi.fn();
      const ops: EffectOp[] = [
        { op: 'addGold', clanId: CLAN_ALPHA, amount: 100 },
        { op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'age' },
        op,
      ];
      expect(supportsEventEffects(ops)).toBe(false);
      expect(() => applyEventEffects(state, ops, binding, emit)).toThrow(
        'Unsupported event effect batch',
      );
      expect(state).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('preserves interleaved scalar/war ordering, removes only specified pacts and charges no break penalties', () => {
    const state = buildTinyState();
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.trustAtoB = 80;
    row.trustBtoA = 70;
    row.pacts = [
      { kind: 'alliance', startDay: 0, endDay: 999, vassalClanId: null },
      { kind: 'ceasefire', startDay: 0, endDay: 999, vassalClanId: null },
      { kind: 'marriage', startDay: 0, endDay: null, vassalClanId: null },
      { kind: 'vassal', startDay: 0, endDay: null, vassalClanId: CLAN_BETA },
    ];
    const rng = { ...state.rng },
      prestige = state.clans[CLAN_ALPHA]!.prestige;
    const ops: EffectOp[] = [
      { op: 'addSentiment', from: '$clan', to: CLAN_BETA, amount: 100 },
      { op: 'declareWar', a: '$clan', b: CLAN_BETA },
      { op: 'addSentiment', from: '$clan', to: CLAN_BETA, amount: 10 },
    ];
    expect(supportsEventEffects(ops)).toBe(true);
    applyEventEffects(state, ops, binding, vi.fn());
    expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(100 - BAL.evtDeclareWarSentiment + 10);
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(-BAL.evtDeclareWarSentiment);
    expect(row.lastHostileDay).toBe(state.time.day);
    expect(row.pacts.map((p) => p.kind)).toEqual(['vassal']);
    expect(row.trustAtoB).toBe(80);
    expect(row.trustBtoA).toBe(70);
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(prestige);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['age', 'battle'] as const)(
    'delegates death %s to verified cleanup/succession without RNG',
    (cause) => {
      const state = buildTinyState();
      state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
      const events: GameEvent[] = [];
      const rng = { ...state.rng };
      applyEventEffects(
        state,
        [
          { op: 'addMerit', officerId: OFF_ALPHA_LORD, amount: 123 },
          { op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause },
          { op: 'renameOfficer', officerId: OFF_ALPHA_LORD, name: 'Must skip dead officer' },
        ],
        binding,
        (event) => events.push(event),
      );
      expect(state.officers[OFF_ALPHA_LORD]!.status).toBe('dead');
      expect(state.officers[OFF_ALPHA_LORD]!.clanId).toBeNull();
      expect(state.castles[CASTLE_A1]!.lordId).not.toBe(OFF_ALPHA_LORD);
      expect(state.clans[CLAN_ALPHA]!.leaderId).not.toBe(OFF_ALPHA_LORD);
      expect(state.officers[OFF_ALPHA_LORD]!.name).not.toBe('Must skip dead officer');
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'officer.died', officerId: OFF_ALPHA_LORD, cause }),
          expect.objectContaining({ type: 'clan.succession' }),
        ]),
      );
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('missing/dead entities, unresolved bindings and self war are silent no-ops', () => {
    const state = buildTinyState();
    const before = structuredClone(state),
      emit = vi.fn();
    applyEventEffects(
      state,
      [
        { op: 'declareWar', a: '$clan', b: CLAN_BETA },
        { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_ALPHA },
        { op: 'declareWar', a: 'clan.missing' as ClanId, b: CLAN_BETA },
        { op: 'killOfficer', officerId: 'off.missing' as OfficerId, cause: 'battle' },
      ],
      null,
      emit,
    );
    expect(state).toEqual(before);
    expect(emit).not.toHaveBeenCalled();
    applyEventEffects(
      state,
      [{ op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'age' }],
      binding,
      emit,
    );
    const dead = structuredClone(state);
    emit.mockClear();
    applyEventEffects(
      state,
      [{ op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'age' }],
      binding,
      emit,
    );
    expect(state).toEqual(dead);
    expect(emit).not.toHaveBeenCalled();
  });
});
