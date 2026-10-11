import { describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyEventEffects, supportsEventEffects } from '../../src/core/systems/events/effects';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { ensureDiplomacyRow, getSentiment, isAtWar } from '../../src/core/systems/diplomacyCommon';
import type { EffectOp, EventDef } from '../../src/core/systems/events/types';
import type { EventId, ClanId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { CommandLogRecorder, replayCommandLog } from '../../src/core/replay/commandLog';
import { advanceDay } from '../../src/core/systems';
import { dayToCalendar, DAYS_PER_MONTH } from '../../src/core/systems/time';
import { applyMarch } from '../../src/core/commands/march';
import { beginSiege } from '../../src/core/systems/siege';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

const binding = { clanId: CLAN_ALPHA, castleId: null, districtId: null };
function pact(kind: 'alliance' | 'ceasefire' = 'alliance'): Extract<EffectOp, { op: 'signPact' }> {
  return { op: 'signPact', a: '$clan', b: CLAN_BETA, pact: kind, months: 17, vassalClanId: null };
}
function definition(op: EffectOp): EventDef {
  return {
    id: 'evt.forced-pact' as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: 'Forced pact', body: 'Forced pact', monClanId: null },
    choices: [],
    effects: [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 5 }, op],
  };
}

describe('partial forced finite event pacts', () => {
  it('refreshes duplicate signing without a second sentiment gain', () => {
    const state = buildTinyState(),
      before = structuredClone(state),
      emit = vi.fn();
    applyEventEffects(
      state,
      [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 100 }, pact(), pact()],
      binding,
      emit,
    );
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold + 100);
    expect(ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts).toHaveLength(1);
    expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.sentimentPactSignedAlliance);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('preflights against ordered intermediate state rather than rejecting a lawful sign/war/sign sequence', () => {
    const state = buildTinyState(),
      events: GameEvent[] = [];
    applyEventEffects(
      state,
      [pact(), { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA }, pact()],
      binding,
      (event) => events.push(event),
    );
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    expect(row.pacts).toHaveLength(1);
    expect(events.filter((event) => event.type === 'pact.signed')).toHaveLength(2);
    expect(row.sentimentAtoB).toBe(
      2 * BAL.sentimentPactSignedAlliance - BAL.evtDeclareWarSentiment,
    );
    expect(row.sentimentBtoA).toBe(row.sentimentAtoB);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['alliance', 'ceasefire'] as const)(
    'creates authored %s with canonical row/event and normal sentiment but no resource/RNG costs',
    (kind) => {
      const state = buildTinyState(),
        row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
      row.trustAtoB = 37;
      row.trustBtoA = 12;
      row.lastHostileDay = state.time.day;
      const before = structuredClone(state),
        events: GameEvent[] = [];
      const op = pact(kind);
      expect(supportsEventEffects([op])).toBe(true);
      applyEventEffects(state, [op], binding, (event) => events.push(event));
      const endDay = state.time.day + 17 * DAYS_PER_MONTH;
      expect(row.pacts).toEqual([{ kind, startDay: state.time.day, endDay, vassalClanId: null }]);
      expect(events).toEqual([
        {
          type: 'pact.signed',
          day: state.time.day,
          clanIds: [CLAN_ALPHA, CLAN_BETA],
          aClanId: CLAN_ALPHA,
          bClanId: CLAN_BETA,
          kind,
          endDay,
        },
      ]);
      const gain =
        kind === 'alliance' ? BAL.sentimentPactSignedAlliance : BAL.sentimentPactSignedCeasefire;
      expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(gain);
      expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(gain);
      expect(row.trustAtoB).toBe(37);
      expect(row.trustBtoA).toBe(12);
      expect(state.clans).toEqual(before.clans);
      expect(state.rng).toEqual(before.rng);
      expect(state.diplomacy.pendingProposals).toEqual([]);
      expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(false);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('uses sorted row/event endpoints even when authored endpoints are reversed', () => {
    const state = buildTinyState(),
      events: GameEvent[] = [];
    applyEventEffects(state, [{ ...pact(), a: CLAN_BETA, b: CLAN_ALPHA }], null, (event) =>
      events.push(event),
    );
    expect(events[0]).toMatchObject({ aClanId: CLAN_ALPHA, bClanId: CLAN_BETA });
    expect(validateState(state)).toEqual([]);
  });

  it('alliance removes ceasefire while preserving an independent marriage pact', () => {
    const state = buildTinyState(),
      row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    const marriage = { kind: 'marriage' as const, startDay: 0, endDay: null, vassalClanId: null };
    row.pacts = [marriage, { kind: 'ceasefire', startDay: 0, endDay: 999, vassalClanId: null }];
    applyEventEffects(state, [pact()], binding, vi.fn());
    expect(row.pacts.map((entry) => entry.kind)).toEqual(['marriage', 'alliance']);
    expect(row.pacts[0]).toEqual(marriage);
    expect(validateState(state)).toEqual([]);
  });

  it('ceasefire can coexist with vassal and clamps sentiment before later ordered authored gains', () => {
    const state = buildTinyState(),
      row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts = [{ kind: 'vassal', startDay: 0, endDay: null, vassalClanId: CLAN_BETA }];
    row.sentimentAtoB = 98;
    row.sentimentBtoA = -100;
    applyEventEffects(
      state,
      [pact('ceasefire'), { op: 'addSentiment', from: CLAN_ALPHA, to: CLAN_BETA, amount: -30 }],
      binding,
      vi.fn(),
    );
    expect(row.pacts.map((entry) => entry.kind)).toEqual(['vassal', 'ceasefire']);
    expect(row.sentimentAtoB).toBe(70);
    expect(row.sentimentBtoA).toBe(-95);
    expect(validateState(state)).toEqual([]);
  });

  it.each([
    'marriage',
    'vassal',
    'indefinite',
    'fractional',
    'zero',
    'negative',
    'infinite',
    'non-null-vassal',
  ] as const)(
    'rejects unsupported %s statically in common and even ineligible choice catalogs',
    (variant) => {
      const op = pact();
      if (variant === 'marriage' || variant === 'vassal') {
        op.pact = variant;
        op.months = null;
        op.vassalClanId = variant === 'vassal' ? CLAN_BETA : null;
      }
      if (variant === 'indefinite') op.months = null;
      if (variant === 'fractional') op.months = 1.5;
      if (variant === 'zero') op.months = 0;
      if (variant === 'negative') op.months = -1;
      if (variant === 'infinite') op.months = Infinity;
      if (variant === 'non-null-vassal') op.vassalClanId = CLAN_BETA;
      expect(supportsEventEffects([op])).toBe(false);
      const state = buildTinyState(),
        before = structuredClone(state),
        emit = vi.fn();
      expect(() =>
        applyEventEffects(
          state,
          [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 100 }, op],
          binding,
          emit,
        ),
      ).toThrow('Unsupported event effect batch');
      const def = definition(op);
      expect(() => createRuntimeEventEngine([def])).toThrow('Unsupported event effect in catalog');
      def.effects = [];
      def.choices = [
        {
          label: 'Unsupported',
          conditions: [{ kind: 'flag', key: 'absent', min: 1 }],
          aiWeight: 0,
          effects: [op],
        },
      ];
      expect(() => createRuntimeEventEngine([def])).toThrow('Unsupported event effect in catalog');
      expect(state).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'dead', 'self', 'unbound'] as const)(
    'treats %s references as deterministic no-ops without materializing a row',
    (variant) => {
      const state = buildTinyState(),
        op = pact();
      if (variant === 'missing') op.b = 'clan.missing' as ClanId;
      if (variant === 'dead') state.clans[CLAN_BETA]!.alive = false;
      if (variant === 'self') op.b = CLAN_ALPHA;
      const before = structuredClone(state),
        emit = vi.fn();
      applyEventEffects(state, [op], variant === 'unbound' ? null : binding, emit);
      expect(state).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it.each(['vassal'] as const)(
    'preserves existing %s when a forced alliance would violate pact exclusivity',
    (kind) => {
      const state = buildTinyState(),
        row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
      row.pacts = [
        {
          kind,
          startDay: 0,
          endDay: kind === 'vassal' ? null : 999,
          vassalClanId: kind === 'vassal' ? CLAN_BETA : null,
        },
      ];
      const op = pact('alliance');
      const before = structuredClone(state),
        emit = vi.fn();
      applyEventEffects(state, [op], binding, emit);
      expect(state).toEqual(before);
      expect(emit).not.toHaveBeenCalled();
      createRuntimeEventEngine([definition(op)]).run(state, emit);
      expect(state.diplomacy.rows).toEqual(before.diplomacy.rows);
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold + 5);
      expect(emit.mock.calls.map(([event]) => (event as GameEvent).type)).toEqual(['event.fired']);
    },
  );

  it('reconciles an actual siege before damage in the real daily pipeline after forced peace', () => {
    const state = buildTinyState();
    state.time = { day: 29, ...dayToCalendar(29) };
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 100,
        food: 100,
        targetNodeId: CASTLE_B1,
      },
      vi.fn(),
    );
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = CASTLE_B1;
    army.path = [CASTLE_B1];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
    beginSiege(state, CASTLE_B1, army.id);
    expect(validateState(state)).toEqual([]);
    const durability = state.castles[CASTLE_B1]!.durability;
    const result = advanceDay(state, [], {
      eventEngine: createRuntimeEventEngine([definition(pact('ceasefire'))]),
    });
    expect(result.events.some((event) => event.type === 'pact.signed')).toBe(true);
    expect(state.sieges).toEqual({});
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
    expect(state.castles[CASTLE_B1]!.durability).toBeGreaterThanOrEqual(durability);
    expect(validateState(state)).toEqual([]);
  });

  it('persists authored pact duration and reproduces the full event-enabled command replay', () => {
    const initial = () => {
      const state = buildTinyState();
      state.time = { day: 29, ...dayToCalendar(29) };
      return state;
    };
    const state = initial(),
      defs = [definition(pact())];
    const engine = createRuntimeEventEngine(defs),
      recorder = new CommandLogRecorder();
    recorder.recordTick(advanceDay(state, [], { eventEngine: engine }).appliedCommands);
    const save = decodeSave(encodeSave(state, 123));
    expect(save.ok).toBe(true);
    if (!save.ok) throw new Error(save.code);
    expect(save.saveFile.state).toEqual(state);
    const log = recorder.export(state);
    expect(
      replayCommandLog(log, initial, { eventEngine: createRuntimeEventEngine(defs) }),
    ).toMatchObject({ match: true, balanceMismatch: false });
  });
});
