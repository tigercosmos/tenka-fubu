import { describe, expect, it } from 'vitest';
import eventsJson from '../../src/data/scenarios/s1560/events.json';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { advanceDay } from '../../src/core/systems';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { castleHarvest } from '../../src/core/domestic';
import { getDifficultyMods } from '../../src/core/systems/ai/difficulty';
import { policyUnlocked } from '../../src/core/commands/domesticCommands';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { PLAYER_AUTHORITY } from '../../src/core/commands/authority';
import { createRngStream } from '../../src/core/rng';
import { REGION_VALUES } from '../../src/core/state/enums';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { CommandLogRecorder, replayCommandLog } from '../../src/core/replay/commandLog';
import type { EventDef } from '../../src/core/systems/events/types';
import type { GameEvent } from '../../src/core/state/events';
import type { CmdResolveEventChoice } from '../../src/core/commands/types';
import type { PolicyId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, CASTLE_A1, CASTLE_B1 } from '../fixtures/tiny';

const catalog = zCanonicalEventsFile
  .parse(eventsJson)
  .events.filter((def) => def.kind === 'generic');
// Only probabilities change: payloads, targets, conditions, priorities and cooldowns stay authored.
function controlled(...ids: string[]): EventDef[] {
  return structuredClone(catalog).map((def) => ({
    ...def,
    trigger: { ...def.trigger, probability: ids.includes(def.id) ? 1 : 0 },
  }));
}
function fixture(day = calendarToDay(1560, 4, 30), seed = 42) {
  const state = buildTinyState({ seed });
  state.time = { day, ...dayToCalendar(day) };
  state.ai.clans = {};
  for (const district of Object.values(state.districts)) district.publicOrder = 100;
  for (const officer of Object.values(state.officers)) officer.loyalty = 100;
  for (const castle of Object.values(state.castles)) castle.coastal = false;
  state.castles[CASTLE_A1]!.coastal = true;
  expect(validateState(state)).toEqual([]);
  return state;
}
function choice(eventId: EventDef['id'], choiceIndex = 0): CmdResolveEventChoice {
  return { type: 'resolveEventChoice', clanId: CLAN_ALPHA, eventId, choiceIndex };
}
function seededPick<T>(items: T[], selected: T): number {
  for (let seed = 0; seed < 1024; seed++) {
    const state = buildTinyState({ seed });
    if (createRngStream(structuredClone(state.rng), 'event').pick(items) === selected) return seed;
  }
  throw new Error('No bounded deterministic seed for fixture pick');
}

describe('authored generic catalog through real runtime', () => {
  it('constructs all six actual definitions without unsupported effects', () => {
    const engine = createRuntimeEventEngine(catalog);
    expect(catalog).toHaveLength(6);
    for (const def of catalog) expect(engine.getDef(def.id)).toEqual(def);
  });

  it.each([
    ['evt.gen-hosaku', 120],
    ['evt.gen-kyosaku', 70],
  ] as const)(
    '%s produces clan/year flags before the actual September economy harvest',
    (id, pct) => {
      const state = fixture(calendarToDay(1560, 8, 30));
      for (const castle of Object.values(state.castles)) castle.food = 0;
      const expected = new Map(
        Object.values(state.clans).map((clan) => [
          clan.id,
          Object.values(state.castles)
            .filter((castle) => castle.ownerClanId === clan.id)
            .reduce(
              (total, castle) =>
                total +
                Math.floor(
                  (castleHarvest(state, castle.id) *
                    getDifficultyMods(state, clan.id).incomeMult *
                    pct) /
                    100,
                ),
              0,
            ),
        ]),
      );
      const result = advanceDay(state, [], {
        eventEngine: createRuntimeEventEngine(controlled(id)),
      });
      expect(state.time.month).toBe(9);
      expect(state.time.dayOfMonth).toBe(1);
      for (const clan of Object.values(state.clans)) {
        expect(state.events.flags[`harvest.1560.${clan.id}`]).toBe(pct);
        expect(state.events.flags[`harvest.1561.${clan.id}`]).toBeUndefined();
        expect(state.events.cooldownUntil[`gen.harvest.${clan.id}`]).toBe(state.time.day + 300);
        const harvest = result.events.find(
          (event) => event.type === 'economy.harvest' && event.clanId === clan.id,
        );
        expect(harvest).toMatchObject({ totalFood: expected.get(clan.id) });
      }
      expect(validateState(state)).toEqual([]);
    },
  );

  it('shared harvest cooldown makes outcomes exclusive per clan, not globally', () => {
    const state = fixture(calendarToDay(1560, 8, 30));
    // An existing alpha cooldown must not suppress beta, and the higher-priority success
    // must suppress the lower-priority failure for beta in the same September tick.
    state.events.cooldownUntil[`gen.harvest.${CLAN_ALPHA}`] = state.time.day + 10;
    const result = advanceDay(state, [], {
      eventEngine: createRuntimeEventEngine(controlled('evt.gen-hosaku', 'evt.gen-kyosaku')),
    });
    expect(result.events.filter((event) => event.type === 'event.fired')).toMatchObject([
      { eventId: 'evt.gen-hosaku', clanIds: [CLAN_BETA] },
    ]);
    expect(state.events.flags[`harvest.1560.${CLAN_ALPHA}`]).toBeUndefined();
    expect(state.events.flags[`harvest.1560.${CLAN_BETA}`]).toBe(120);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['evt.nanban-visit', 'evt.teppo-denrai'])(
    '%s preserves queued choice, codec continuation and full-state replay',
    (id) => {
      const initial = fixture(),
        state = structuredClone(initial);
      const defs = controlled(id),
        engine = createRuntimeEventEngine(defs);
      const recorder = new CommandLogRecorder();
      const fired = advanceDay(state, [], { eventEngine: engine });
      recorder.recordTick(fired.appliedCommands);
      const eventId = catalog.find((def) => def.id === id)!.id;
      expect(state.events.pendingChoiceEventId).toBe(eventId);
      const cmd = choice(eventId),
        queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      const decoded = decodeSave(encodeSave(state, 123, [cmd]));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      const resumed = decoded.saveFile.state;
      expect(resumed).toEqual(state);
      const resumedQueue = new CommandQueue(resumed.meta.lastAppliedCmdSeq + 1);
      for (const pending of decoded.saveFile.pendingCommands)
        resumedQueue.enqueue(pending, resumed.time.day);
      const beforeGold = state.clans[CLAN_ALPHA]!.gold;
      queue.enqueue(cmd, state.time.day);
      const result = advanceDay(state, queue.drain(), { eventEngine: engine });
      recorder.recordTick(result.appliedCommands);
      const resumedResult = advanceDay(resumed, resumedQueue.drain(), {
        eventEngine: createRuntimeEventEngine(defs),
      });
      expect(resumedResult).toEqual(result);
      expect(resumed).toEqual(state);
      expect(state.events.pendingChoiceEventId).toBeNull();
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(
        beforeGold + (id === 'evt.nanban-visit' ? 300 : -500),
      );
      const policyId = (id === 'evt.nanban-visit' ? 'pol.nanban' : 'pol.kakishuchu') as PolicyId;
      expect(state.events.flags[`unlock.${policyId}.${CLAN_ALPHA}`]).toBe(1);
      expect(state.events.flags[`unlock.${policyId}.${CLAN_BETA}`]).toBeUndefined();
      expect(policyUnlocked(state, { type: 'enactPolicy', clanId: CLAN_BETA, policyId })).toBe(
        false,
      );
      expect(policyUnlocked(state, { type: 'enactPolicy', clanId: CLAN_ALPHA, policyId })).toBe(
        true,
      );
      expect(validateState(state)).toEqual([]);
      const log = recorder.export(state),
        rebuilt = structuredClone(initial);
      expect(
        replayCommandLog(log, () => rebuilt, { eventEngine: createRuntimeEventEngine(defs) }),
      ).toMatchObject({ match: true, balanceMismatch: false });
      expect(rebuilt).toEqual(state);
      expect(validateState(rebuilt)).toEqual([]);
    },
  );

  it.each(['evt.nanban-visit', 'evt.teppo-denrai'])(
    '%s refuses unlock on decline and rejects wrong owner/index without event draws',
    (id) => {
      const state = fixture();
      state.clans[CLAN_BETA]!.gold = 0;
      const engine = createRuntimeEventEngine(controlled(id));
      advanceDay(state, [], { eventEngine: engine });
      const eventId = catalog.find((def) => def.id === id)!.id;
      const before = structuredClone(state);
      for (const cmd of [
        { ...choice(eventId), clanId: CLAN_BETA },
        choice(eventId, -1),
        choice(eventId, 2),
      ]) {
        expect(validateCommand(state, cmd, PLAYER_AUTHORITY, { eventEngine: engine }).ok).toBe(
          false,
        );
        const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
        queue.enqueue(cmd, state.time.day);
        expect(applyCommands(state, queue.drain(), () => {}, { eventEngine: engine })).toEqual([]);
      }
      // Queue progression records even rejected envelopes; gameplay and RNG do not change.
      expect({ ...state, meta: before.meta }).toEqual(before);
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      queue.enqueue(choice(eventId, 1), state.time.day);
      expect(applyCommands(state, queue.drain(), () => {}, { eventEngine: engine })).toHaveLength(
        1,
      );
      const policyId = (id === 'evt.nanban-visit' ? 'pol.nanban' : 'pol.kakishuchu') as PolicyId;
      for (const clanId of [CLAN_ALPHA, CLAN_BETA]) {
        expect(state.events.flags[`unlock.${policyId}.${clanId}`]).toBeUndefined();
        expect(policyUnlocked(state, { type: 'enactPolicy', clanId, policyId })).toBe(false);
      }
      expect(validateState(state)).toEqual([]);
    },
  );

  it('AI merchants use actual weighted choices without creating a human pending choice in all-AI mode', () => {
    const state = fixture(),
      control = structuredClone(state),
      expectedRng = structuredClone(state.rng);
    state.ai.allAi = true;
    control.ai.allAi = true;
    const draws = createRngStream(expectedRng, 'event');
    const nanbanAccepted = draws.nextInt(1, 4) <= 3;
    const teppoAlphaAccepted = draws.nextInt(1, 3) <= 2;
    const teppoBetaAccepted = draws.nextInt(1, 3) <= 2;
    const engine = createRuntimeEventEngine(
      controlled('evt.nanban-visit', 'evt.teppo-denrai').filter(
        (def) => def.trigger.probability === 1,
      ),
    );
    const result = advanceDay(state, [], { eventEngine: engine });
    advanceDay(control, [], { eventEngine: createRuntimeEventEngine([]) });
    expect(result.events.filter((event) => event.type === 'event.fired')).toHaveLength(3);
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.events.pendingChoiceBinding).toBeNull();
    expect(state.rng.event).toBe(expectedRng.event);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(
      control.clans[CLAN_ALPHA]!.gold + (nanbanAccepted ? 300 : 0) - (teppoAlphaAccepted ? 500 : 0),
    );
    expect(state.clans[CLAN_BETA]!.gold).toBe(
      control.clans[CLAN_BETA]!.gold - (teppoBetaAccepted ? 500 : 0),
    );
    expect(state.events.flags[`unlock.pol.nanban.${CLAN_ALPHA}`]).toBe(
      nanbanAccepted ? 1 : undefined,
    );
    expect(state.events.flags[`unlock.pol.kakishuchu.${CLAN_ALPHA}`]).toBe(
      teppoAlphaAccepted ? 1 : undefined,
    );
    expect(state.events.flags[`unlock.pol.kakishuchu.${CLAN_BETA}`]).toBe(
      teppoBetaAccepted ? 1 : undefined,
    );
    expect(validateState(state)).toEqual([]);
  });

  it('actual teppo affordability becomes stale after a preceding queued expense and falls back without overspending', () => {
    const state = fixture();
    state.meta.debugMode = true;
    const engine = createRuntimeEventEngine(controlled('evt.teppo-denrai'));
    advanceDay(state, [], { eventEngine: engine });
    const eventId = catalog.find((def) => def.id === 'evt.teppo-denrai')!.id;
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
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
    queue.enqueue(choice(eventId), state.time.day);
    const expectedRng = structuredClone(state.rng);
    createRngStream(expectedRng, 'event').nextInt(1, 1);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    expect(result.appliedCommands).toHaveLength(2);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    expect(state.events.flags[`unlock.pol.kakishuchu.${CLAN_ALPHA}`]).toBeUndefined();
    expect(state.events.pendingChoiceEventId).toBeNull();
    expect(state.rng.event).toBe(expectedRng.event);
    expect(validateState(state)).toEqual([]);
  });

  it('epidemic picks the original district before testing 5000, and subtracts floored castle losses', () => {
    const ids = Object.keys(fixture().districts).sort(),
      selected = ids[0]!;
    const seed = seededPick(ids, selected);
    const state = fixture(undefined, seed);
    const district = state.districts[selected as keyof typeof state.districts]!;
    district.population = 4999;
    const engine = createRuntimeEventEngine([
      controlled('evt.gen-ekibyo').find((def) => def.id === 'evt.gen-ekibyo')!,
    ]);
    const before = structuredClone(state),
      expectedRng = structuredClone(state.rng);
    createRngStream(expectedRng, 'event').pick(ids);
    state.time = { day: state.time.day + 1, ...dayToCalendar(state.time.day + 1) };
    const events: GameEvent[] = [];
    engine.run(state, (event) => events.push(event));
    expect(events).toEqual([]);
    expect(state.rng.event).toBe(expectedRng.event);
    expect(state.districts).toEqual(before.districts);
    expect(state.events.cooldownUntil['gen.ekibyo']).toBeUndefined();
    district.population = 5000;
    state.rng = structuredClone(before.rng);
    const castle = state.castles[district.castleId]!;
    castle.soldiers = 11;
    engine.run(state, (event) => events.push(event));
    expect(district.population).toBe(4600);
    expect(district.publicOrder).toBe(92);
    expect(castle.soldiers).toBe(10);
    expect(events).toMatchObject([{ type: 'event.fired', clanIds: [district.ownerClanId] }]);
    expect(state.events.cooldownUntil['gen.ekibyo']).toBe(state.time.day + 360);
    expect(validateState(state)).toEqual([]);
  });

  it('epidemic Step3 effects feed the real monthly economy/development trajectory', () => {
    const ids = Object.keys(fixture().districts).sort(),
      selected = ids[0]!;
    const state = fixture(undefined, seededPick(ids, selected));
    const district = state.districts[selected as keyof typeof state.districts]!;
    district.population = 5000;
    state.castles[district.castleId]!.soldiers = 11;
    const control = structuredClone(state),
      expectedDistrict = control.districts[district.id]!;
    expectedDistrict.population -= Math.floor((expectedDistrict.population * 8) / 100);
    expectedDistrict.publicOrder -= 8;
    control.castles[district.castleId]!.soldiers -= 1;
    const defs = [controlled('evt.gen-ekibyo').find((def) => def.id === 'evt.gen-ekibyo')!];
    const result = advanceDay(state, [], { eventEngine: createRuntimeEventEngine(defs) });
    advanceDay(control, [], { eventEngine: createRuntimeEventEngine([]) });
    expect(result.events.filter((event) => event.type === 'event.fired')).toMatchObject([
      { eventId: 'evt.gen-ekibyo', clanIds: [district.ownerClanId] },
    ]);
    expect(state.districts).toEqual(control.districts);
    expect(state.castles).toEqual(control.castles);
    expect(state.events.cooldownUntil['gen.ekibyo']).toBe(state.time.day + 360);
    expect(validateState(state)).toEqual([]);
    expect(validateState(control)).toEqual([]);
  });

  it('earthquake real tick fans reports out per affected clan and enforces global cooldown', () => {
    const seed = seededPick([...REGION_VALUES].sort(), 'tokai');
    const state = fixture(undefined, seed),
      control = structuredClone(state);
    for (const castle of Object.values(control.castles))
      castle.durability = Math.floor(castle.durability * 0.8);
    for (const district of Object.values(control.districts)) {
      district.population = Math.floor(district.population * 0.98);
      district.publicOrder -= 10;
    }
    const defs = [controlled('evt.gen-jishin').find((def) => def.id === 'evt.gen-jishin')!];
    const result = advanceDay(state, [], { eventEngine: createRuntimeEventEngine(defs) });
    advanceDay(control, [], { eventEngine: createRuntimeEventEngine([]) });
    expect(result.events.filter((event) => event.type === 'event.fired')).toMatchObject([
      { eventId: 'evt.gen-jishin', clanIds: [CLAN_ALPHA] },
      { eventId: 'evt.gen-jishin', clanIds: [CLAN_BETA] },
    ]);
    for (const castle of Object.values(state.castles))
      expect(castle.durability).toBe(control.castles[castle.id]!.durability);
    for (const district of Object.values(state.districts)) {
      // Monthly growth/development follows Step3 damage; compare the whole real trajectory,
      // not a percentage of the already-developed undamaged month's population.
      expect(district.population).toBe(control.districts[district.id]!.population);
      expect(district.publicOrder).toBe(control.districts[district.id]!.publicOrder);
    }
    expect(state.events.cooldownUntil['gen.jishin']).toBe(state.time.day + 720);
    const snapshot = structuredClone(state),
      emitted: GameEvent[] = [];
    createRuntimeEventEngine(defs).run(state, (event) => emitted.push(event));
    expect(emitted).toEqual([]);
    expect(state).toEqual(snapshot);
    expect(validateState(state)).toEqual([]);
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
  });
});
