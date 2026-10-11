import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { validateState } from '../../src/core/state/invariants';
import { pairKey } from '../../src/core/state/serialize';
import type { GameEvent } from '../../src/core/state/events';
import type { EventId } from '../../src/core/state/ids';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EffectOp, EventDef } from '../../src/core/systems/events/types';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  CASTLE_A1,
} from '../fixtures/tiny';

function definition(): EventDef {
  return {
    id: 'evt.runtime-fixture' as EventId,
    kind: 'historical',
    priority: 20,
    target: 'player',
    ownerCandidates: [],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 30,
      cooldownKey: 'runtime-fixture',
    },
    cutscene: { title: 'Runtime fixture', body: 'Runtime fixture', monClanId: '$clan' },
    effects: [],
    choices: [],
  };
}

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
  { op: 'grantCourtRank', clanId: CLAN_ALPHA, rank: 'ju4ge' },
];

describe('supported production event runtime boundary', () => {
  it('runs real ordered scalar, war and officer-death effects with invariant-safe cleanup', () => {
    const state = buildTinyState();
    const d = definition();
    d.effects = [
      { op: 'addGold', clanId: '$clan', amount: 25 },
      { op: 'setFlag', key: 'runtime-common', value: 1 },
      { op: 'declareWar', a: '$clan', b: CLAN_BETA },
      { op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'age' },
    ];
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const rng = structuredClone(state.rng);
    const emitted: GameEvent[] = [];
    createRuntimeEventEngine([d]).run(state, (event) => emitted.push(event));

    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 25);
    expect(state.events.flags['runtime-common']).toBe(1);
    expect(state.officers[OFF_ALPHA_BUSHO]!.status).toBe('dead');
    const row = state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)]!;
    expect(row.lastHostileDay).toBe(state.time.day);
    expect(row.sentimentAtoB).toBe(-BAL.evtDeclareWarSentiment);
    expect(row.sentimentBtoA).toBe(-BAL.evtDeclareWarSentiment);
    expect(emitted.map((event) => event.type)).toContain('officer.died');
    expect(emitted.map((event) => event.type)).toContain('event.fired');
    expect(state.events.fired[d.id]).toBe(state.time.day);
    expect(state.events.cooldownUntil).toEqual({});
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('resolves supported player choices through the same real dispatcher exactly once', () => {
    const state = buildTinyState();
    const d = definition();
    d.ownerCandidates = ['$clan'];
    d.effects = [{ op: 'setFlag', key: 'common', value: 1 }];
    d.choices = [
      {
        label: 'Accept',
        conditions: [],
        aiWeight: 1,
        effects: [
          { op: 'addGold', clanId: '$clan', amount: 12 },
          { op: 'renameCastle', castleId: CASTLE_A1, name: '新城' },
        ],
      },
    ];
    const engine = createRuntimeEventEngine([d]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    engine.run(state, () => undefined);
    expect(state.events.pendingChoiceEventId).toBe(d.id);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
    const command = {
      type: 'resolveEventChoice' as const,
      clanId: CLAN_ALPHA,
      eventId: d.id,
      choiceIndex: 0,
    };
    expect(engine.validateChoice(state, command)).toEqual({ ok: true });
    engine.resolveChoice(state, command, () => undefined);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 12);
    expect(state.castles[CASTLE_A1]!.name).toBe('新城');
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.events.pendingChoiceBinding).toBeNull();
    expect(engine.validateChoice(state, command).ok).toBe(false);
    expect(validateState(state)).toEqual([]);
  });

  it.each(unsupported)(
    'rejects unsupported $op common and choice content before construction can mutate anything',
    (op) => {
      const state = buildTinyState();
      const before = structuredClone(state);
      for (const location of ['common', 'choice'] as const) {
        const d = definition();
        const ops: EffectOp[] = [{ op: 'setFlag', key: 'must-not-partly-apply', value: 1 }, op];
        if (location === 'common') d.effects = ops;
        else
          d.choices = [
            {
              label: 'Ineligible still unsupported',
              conditions: [{ kind: 'flag', key: 'absent', min: 1 }],
              aiWeight: 0,
              effects: ops,
            },
          ];
        const catalog = [d];
        const catalogBefore = structuredClone(catalog);
        expect(() => createRuntimeEventEngine(catalog)).toThrow(
          `Unsupported event effect in catalog: ${d.id}`,
        );
        expect(catalog).toEqual(catalogBefore);
        expect(state).toEqual(before);
      }
    },
  );

  it('does not invent a clan binding for randomRegionClan', () => {
    const state = buildTinyState();
    const before = structuredClone(state);
    const d = definition();
    d.target = 'randomRegionClan';
    d.effects = [{ op: 'addGold', clanId: '$clan', amount: 100 }];
    createRuntimeEventEngine([d]).run(state, () => undefined);
    expect(state.clans).toEqual(before.clans);
  });

  it('clones and freezes nested catalog content without freezing or retaining caller objects', () => {
    const d = definition();
    d.trigger.conditions = [{ kind: 'clanAlive', clanId: '$clan' }];
    d.effects = [{ op: 'addGold', clanId: '$clan', amount: 5 }];
    const catalog = [d];
    const original = structuredClone(d);
    const engine = createRuntimeEventEngine(catalog);
    expect(Object.isFrozen(d)).toBe(false);
    d.effects[0] = { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO };
    d.trigger.conditions = [{ kind: 'flag', key: 'never', min: 1 }];
    d.cutscene.body = 'Caller mutation';
    catalog.length = 0;
    expect(engine.getDef(original.id)).toEqual(original);
    expect(Object.isFrozen(engine.getDef(original.id)?.effects[0])).toBe(true);
    expect(Object.isFrozen(engine.getDef(original.id)?.trigger.conditions)).toBe(true);
    const state = buildTinyState();
    const gold = state.clans[CLAN_ALPHA]!.gold;
    engine.run(state, () => undefined);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 5);
    expect(state.officers[OFF_ALPHA_BUSHO]!.status).not.toBe('ronin');
  });
});
