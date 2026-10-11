import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  applyDiplomacyEventEffects,
  applyEventDeclareWar,
  isDiplomacyEventEffectOp,
} from '../../src/core/systems/events/lifecycleEffects';
import { ensureDiplomacyRow, isAtWar } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

describe('M8 narrow event declaration lifecycle', () => {
  it('materializes sparse row and enters war with the canonical20 bilateral sentiment hit', () => {
    const state = buildTinyState();
    const rng = structuredClone(state.rng);
    const gold = [state.clans[CLAN_ALPHA]!.gold, state.clans[CLAN_BETA]!.gold];
    const events: GameEvent[] = [];
    expect(BAL.evtDeclareWarSentiment).toBe(20);
    applyDiplomacyEventEffects(
      state,
      [{ op: 'declareWar', a: '$clan', b: CLAN_BETA }],
      { clanId: CLAN_ALPHA, castleId: null, districtId: null },
      (event) => events.push(event),
    );
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    expect(row.lastHostileDay).toBe(state.time.day);
    expect(row.sentimentAtoB).toBe(-20);
    expect(row.sentimentBtoA).toBe(-20);
    expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(true);
    expect(state.rng).toEqual(rng);
    expect([state.clans[CLAN_ALPHA]!.gold, state.clans[CLAN_BETA]!.gold]).toEqual(gold);
    expect(events).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('removes ceasefire/alliance/marriage without trust or prestige penalties and clamps sentiment', () => {
    const state = buildTinyState();
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.sentimentAtoB = -95;
    row.sentimentBtoA = 100;
    row.trustAtoB = 80;
    row.trustBtoA = 70;
    row.pacts = ['alliance', 'ceasefire', 'marriage'].map((kind) => ({
      kind: kind as 'alliance' | 'ceasefire' | 'marriage',
      startDay: state.time.day,
      endDay: kind === 'marriage' ? null : state.time.day + 30,
      vassalClanId: null,
    }));
    const prestige = [state.clans[CLAN_ALPHA]!.prestige, state.clans[CLAN_BETA]!.prestige];
    expect(validateState(state)).toEqual([]);
    applyEventDeclareWar(state, { op: 'declareWar', a: CLAN_BETA, b: CLAN_ALPHA }, null);
    expect(row.pacts).toEqual([]);
    expect([row.sentimentAtoB, row.sentimentBtoA]).toEqual([-100, 80]);
    expect([row.trustAtoB, row.trustBtoA]).toEqual([80, 70]);
    expect([state.clans[CLAN_ALPHA]!.prestige, state.clans[CLAN_BETA]!.prestige]).toEqual(prestige);
    expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('preserves vassal exactly as10 lists; war derivation remains suppressed until pact removal', () => {
    const state = buildTinyState();
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    const pact = {
      kind: 'vassal' as const,
      startDay: state.time.day,
      endDay: null,
      vassalClanId: CLAN_BETA,
    };
    row.pacts = [pact];
    expect(validateState(state)).toEqual([]);
    applyEventDeclareWar(state, { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA }, null);
    expect(row.pacts).toEqual([pact]);
    expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(false);
    expect(validateState(state)).toEqual([]);
    // Represents the explicit preceding breakPact in the historical Kiyosu effect sequence.
    row.pacts = [];
    applyEventDeclareWar(state, { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA }, null);
    expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('applies repeated array entries in order without inventing idempotence or consuming RNG', () => {
    const state = buildTinyState();
    const rng = structuredClone(state.rng);
    applyDiplomacyEventEffects(
      state,
      [
        { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA },
        { op: 'declareWar', a: CLAN_BETA, b: CLAN_ALPHA },
      ],
      null,
      () => {},
    );
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    expect([row.sentimentAtoB, row.sentimentBtoA]).toEqual([-40, -40]);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('missing/dead/self/unbound references are silent no-ops; filter claims no other lifecycle effect', () => {
    const state = buildTinyState();
    const deadId = 'clan.dead-event' as ClanId;
    state.clans[deadId] = {
      ...state.clans[CLAN_BETA]!,
      id: deadId,
      alive: false,
      destroyedDay: state.time.day,
    };
    const before = structuredClone(state);
    applyDiplomacyEventEffects(
      state,
      [
        { op: 'declareWar', a: CLAN_ALPHA, b: 'clan.missing' as ClanId },
        { op: 'declareWar', a: CLAN_ALPHA, b: deadId },
        { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_ALPHA },
        { op: 'declareWar', a: '$clan', b: CLAN_BETA },
      ],
      null,
      () => {
        throw new Error('unexpected event');
      },
    );
    expect(state).toEqual(before);
    expect(isDiplomacyEventEffectOp({ op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA })).toBe(true);
    expect(
      isDiplomacyEventEffectOp({
        op: 'signPact',
        a: CLAN_ALPHA,
        b: CLAN_BETA,
        pact: 'alliance',
        months: 12,
        vassalClanId: null,
      }),
    ).toBe(false);
    expect(
      isDiplomacyEventEffectOp({
        op: 'killOfficer',
        officerId: state.clans[CLAN_ALPHA]!.leaderId,
        cause: 'execution',
      }),
    ).toBe(false);
  });
});
