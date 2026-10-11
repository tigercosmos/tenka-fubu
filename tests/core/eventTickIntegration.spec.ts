import { describe, expect, it } from 'vitest';
import { createEventEngine } from '../../src/core/systems/events/engine';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import type { EventDef, EventHookSignal } from '../../src/core/systems/events/types';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, applyCommands } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import type { CmdResolveEventChoice } from '../../src/core/commands/types';
import { PLAYER_AUTHORITY } from '../../src/core/commands/authority';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { dayToCalendar } from '../../src/core/systems/time';
import { createRngStream } from '../../src/core/rng';
import { validateState } from '../../src/core/state/invariants';
import type { EventId, MapNodeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function definition(id = 'evt.integration'): EventDef {
  return {
    id: id as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
    cutscene: { title: 'Fixture', body: 'Fixture', monClanId: CLAN_ALPHA },
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1561, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    effects: [{ op: 'addMerit', officerId: OFF_ALPHA_BUSHO, amount: 123 }],
    choices: [
      {
        label: 'A',
        conditions: [{ kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: 10 }],
        aiWeight: 3,
        effects: [{ op: 'setFlag', key: 'choice.A', value: 1 }],
      },
      {
        label: 'B',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'setFlag', key: 'choice.B', value: 1 }],
      },
    ],
  };
}
function fixture(day = 29) {
  const state = buildTinyState();
  state.time = { day, ...dayToCalendar(day) };
  for (const district of Object.values(state.districts)) district.publicOrder = 100;
  for (const officer of Object.values(state.officers)) officer.loyalty = 100;
  return state;
}
const cmd = (choiceIndex = 0): CmdResolveEventChoice => ({
  type: 'resolveEventChoice',
  clanId: CLAN_ALPHA,
  eventId: 'evt.integration' as EventId,
  choiceIndex,
});
function battleHook(day = 30): EventHookSignal {
  return {
    kind: 'battleEnded',
    day,
    clanIds: [CLAN_ALPHA, CLAN_BETA],
    castleId: null,
    officerId: null,
    winnerClanId: CLAN_ALPHA,
    playerInvolved: true,
  };
}

describe('event runtime across real tick/command/save seams', () => {
  it('fires Step3 at day30; queued Step1 choice resolves before day31, common effects apply once', () => {
    const state = fixture(),
      control = structuredClone(state),
      engine = createEventEngine([definition()], applyEventEffects);
    advanceDay(control, [], { eventEngine: createEventEngine([], applyEventEffects) });
    const fired = advanceDay(state, [], { eventEngine: engine });
    expect(state.time.day).toBe(30);
    expect(state.events.pendingChoiceEventId).toBe(cmd().eventId);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit).toBe(
      control.officers[OFF_ALPHA_BUSHO]!.merit + 123,
    );
    expect(fired.events.filter((e) => e.type === 'event.fired')).toHaveLength(1);
    const queue = new CommandQueue();
    queue.enqueue(cmd(), state.time.day);
    expect(validateCommand(state, cmd(), PLAYER_AUTHORITY, { eventEngine: engine })).toEqual({
      ok: true,
    });
    const resolved = advanceDay(state, queue.drain(), { eventEngine: engine });
    expect(resolved.appliedCommands).toHaveLength(1);
    expect(state.time.day).toBe(31);
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.events.pendingChoiceBinding).toBeNull();
    expect(state.events.flags['choice.A']).toBe(1);
    expect(state.events.flags['choice.B']).toBeUndefined();
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit).toBe(
      control.officers[OFF_ALPHA_BUSHO]!.merit + 123,
    );
    expect(validateState(state)).toEqual([]);
  });

  it('passes explicit context through direct apply and queue, while no context rejects unavailable handler', () => {
    const state = fixture(),
      engine = createEventEngine([definition()], applyEventEffects);
    advanceDay(state, [], { eventEngine: engine });
    expect(validateCommand(state, cmd()).ok).toBe(false);
    const direct = structuredClone(state);
    applyCommand(direct, cmd(), () => {}, PLAYER_AUTHORITY, { eventEngine: engine });
    expect(direct.events.flags['choice.A']).toBe(1);
    const queue = new CommandQueue();
    queue.enqueue(cmd(), state.time.day);
    expect(applyCommands(state, queue.drain(), () => {}, { eventEngine: engine })).toHaveLength(1);
    expect(state.events.flags).toEqual(direct.events.flags);
  });

  it.each(['wrong-event', 'wrong-player', 'negative', 'overflow', 'fraction'])(
    'rejects %s with no event RNG draw or effects through actual queue validation',
    (kind) => {
      const state = fixture(),
        engine = createEventEngine([definition()], applyEventEffects);
      advanceDay(state, [], { eventEngine: engine });
      const invalid = cmd();
      if (kind === 'wrong-event') invalid.eventId = 'evt.wrong' as EventId;
      if (kind === 'wrong-player') invalid.clanId = CLAN_BETA;
      if (kind === 'negative') invalid.choiceIndex = -1;
      if (kind === 'overflow') invalid.choiceIndex = 2;
      if (kind === 'fraction') invalid.choiceIndex = 0.5;
      const rng = { ...state.rng },
        flags = { ...state.events.flags };
      const queue = new CommandQueue();
      queue.enqueue(invalid, state.time.day);
      const events: string[] = [];
      expect(
        applyCommands(state, queue.drain(), (e) => events.push(e.type), { eventEngine: engine }),
      ).toEqual([]);
      expect(events).toEqual(['command.rejected']);
      expect(state.rng).toEqual(rng);
      expect(state.events.flags).toEqual(flags);
      expect(state.events.pendingChoiceEventId).toBe(cmd().eventId);
    },
  );

  it('a preceding queued gold mutation invalidates selection and falls back using one weighted AI draw', () => {
    const state = fixture(),
      engine = createEventEngine([definition()], applyEventEffects);
    state.meta.debugMode = true;
    advanceDay(state, [], { eventEngine: engine });
    const queue = new CommandQueue();
    queue.enqueue(
      {
        type: 'debugGrant',
        clanId: CLAN_ALPHA,
        gold: -state.clans[CLAN_ALPHA]!.gold,
        food: null,
        castleId: null,
      },
      state.time.day,
    );
    queue.enqueue(cmd(), state.time.day);
    const expected = { ...state.rng };
    createRngStream(expected, 'event').nextInt(1, 1);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    expect(result.appliedCommands).toHaveLength(2);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    expect(state.events.flags['choice.B']).toBe(1);
    expect(state.events.flags['choice.A']).toBeUndefined();
    expect(state.rng.event).toBe(expected.event);
    expect(state.events.pendingChoiceEventId).toBeNull();
  });

  it('saved pending binding, queued resolution and hooks continue identically after codec roundtrip', () => {
    const state = fixture(),
      defs = [definition()],
      engine = createEventEngine(defs, applyEventEffects);
    advanceDay(state, [], { eventEngine: engine });
    state.events.hookSignals.push(battleHook());
    const decoded = decodeSave(encodeSave(state, 123, [cmd()]));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state,
      restoredEngine = createEventEngine(defs, applyEventEffects);
    const a = new CommandQueue(state.meta.lastAppliedCmdSeq + 1),
      b = new CommandQueue(restored.meta.lastAppliedCmdSeq + 1);
    a.enqueue(cmd(), state.time.day);
    for (const pending of decoded.saveFile.pendingCommands) b.enqueue(pending, restored.time.day);
    const continuous = advanceDay(state, a.drain(), { eventEngine: engine });
    const resumed = advanceDay(restored, b.drain(), { eventEngine: restoredEngine });
    expect(resumed).toEqual(continuous);
    expect(restored.events.stats.battlesFought).toBe(1);
    expect(restored.events.stats.battlesWon).toBe(1);
    expect(restored.events.hookSignals).toEqual([]);
  });

  it('real officer death enqueues leaderDied at tick end; subscribed event cannot fire until next tick', () => {
    const state = fixture(),
      death = definition('evt.death'),
      after = definition('evt.after-death');
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    death.priority = 50;
    death.ownerCandidates = [];
    death.choices = [];
    death.effects = [{ op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'age' }];
    after.choices = [];
    after.ownerCandidates = [];
    after.trigger.check = 'hook';
    after.trigger.hooks = ['leaderDied'];
    after.trigger.conditions = [
      { kind: 'not', cond: { kind: 'officerAlive', officerId: OFF_ALPHA_LORD } },
    ];
    after.effects = [{ op: 'setFlag', key: 'leader-death-seen', value: 1 }];
    // Avoid the canonical monthly catch-up allowing this hook event on the death day itself.
    death.trigger.check = 'hook';
    death.trigger.hooks = ['battleEnded'];
    state.time = { day: 30, ...dayToCalendar(30) };
    state.events.hookSignals = [battleHook()];
    const engine = createEventEngine([death, after], applyEventEffects);
    const first = advanceDay(state, [], { eventEngine: engine });
    expect(first.events.some((e) => e.type === 'officer.died')).toBe(true);
    expect(state.events.flags['leader-death-seen']).toBeUndefined();
    expect(state.events.hookSignals.filter((s) => s.kind === 'leaderDied')).toHaveLength(1);
    advanceDay(state, [], { eventEngine: engine });
    expect(state.events.flags['leader-death-seen']).toBe(1);
    expect(state.events.hookSignals).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('deferred real battle fact becomes next-tick stats without legacy victory double count', () => {
    const state = fixture(30),
      engine = createEventEngine([], applyEventEffects);
    state.meta.deferredEvents.push({
      type: 'battle.ended',
      day: 30,
      clanIds: [CLAN_ALPHA, CLAN_BETA],
      battleId: 'fc.integration',
      winnerClanId: CLAN_ALPHA,
      aweLevel: 'none',
      attackerLosses: 0,
      defenderLosses: 0,
      nodeId: CASTLE_A1 as MapNodeId,
      attackerClanId: CLAN_ALPHA,
      defenderClanId: CLAN_BETA,
    });
    const first = advanceDay(state, [], { eventEngine: engine });
    expect(first.events.some((e) => e.type === 'battle.ended')).toBe(true);
    expect(state.events.stats.battlesFought).toBe(0);
    expect(state.events.hookSignals).toHaveLength(1);
    advanceDay(state, [], { eventEngine: engine });
    expect(state.events.stats.battlesFought).toBe(1);
    expect(state.events.stats.battlesWon).toBe(1);
    advanceDay(state, [], { eventEngine: engine });
    expect(state.events.stats.battlesFought).toBe(1);
  });

  it('collector tracks a successor who also dies later in the same ordered effect batch', () => {
    const state = fixture();
    state.officers[OFF_ALPHA_TAISHO]!.kinship = 'kin';
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    const d = definition();
    d.ownerCandidates = [];
    d.choices = [];
    d.effects = [
      { op: 'killOfficer', officerId: OFF_ALPHA_LORD, cause: 'age' },
      { op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'battle' },
    ];
    advanceDay(state, [], { eventEngine: createEventEngine([d], applyEventEffects) });
    expect(
      state.events.hookSignals.filter((s) => s.kind === 'leaderDied').map((s) => s.officerId),
    ).toEqual([OFF_ALPHA_LORD, OFF_ALPHA_BUSHO]);
    expect(state.clans[CLAN_ALPHA]!.leaderId).toBe(OFF_ALPHA_TAISHO);
    expect(validateState(state)).toEqual([]);
  });

  it('default noninjected mode retains legacy immediate battle statistics without enqueuing new hooks', () => {
    const state = fixture(30);
    state.meta.deferredEvents.push({
      type: 'battle.ended',
      day: 30,
      clanIds: [CLAN_ALPHA, CLAN_BETA],
      battleId: 'fc.default',
      winnerClanId: CLAN_ALPHA,
      aweLevel: 'none',
      attackerLosses: 0,
      defenderLosses: 0,
      nodeId: CASTLE_A1 as MapNodeId,
      attackerClanId: CLAN_ALPHA,
      defenderClanId: CLAN_BETA,
    });
    advanceDay(state, []);
    expect(state.events.stats.battlesFought).toBe(1);
    expect(state.events.stats.battlesWon).toBe(1);
    expect(state.events.hookSignals).toEqual([]);
  });
});
