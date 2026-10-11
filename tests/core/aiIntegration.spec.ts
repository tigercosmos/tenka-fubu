import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { envelopeAuthority } from '../../src/core/commands/authority';
import type { GameState } from '../../src/core/state/gameState';
import { stateHash } from '../../src/core/state/serialize';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { CommandLogRecorder, replayCommandLog } from '../../src/core/replay/commandLog';
import { advanceDay } from '../../src/core/systems';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { buildTinyState, CASTLE_B1, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function initialState(): GameState {
  const state = buildTinyState();
  // Domestic integration isolate: no wars/plots can create unrelated hard rejections.
  ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
    kind: 'alliance',
    startDay: state.time.day,
    endDay: state.time.day + 3000,
    vassalClanId: null,
  });
  state.ai.clans[CLAN_BETA]!.councilOffset = 2;
  state.clans[CLAN_BETA]!.gold = 10_000;
  return state;
}
/** Same synchronous pending→authority envelope→drain lifecycle as the app loop. */
function tick(state: GameState, queue: CommandQueue) {
  const count = Math.min(
    state.ai.pendingOrders.length,
    Math.max(0, BAL.maxCommandsPerTick - queue.size),
  );
  for (const order of state.ai.pendingOrders.splice(0, count))
    queue.enqueue(order.command, state.time.day, order.authority);
  return advanceDay(state, queue.drain());
}

describe('M7 next-tick AI queue, saves and replay integration', () => {
  it('does not apply an AI build during decision tick; applies its actual authority-bearing order next tick', () => {
    const state = initialState(),
      queue = new CommandQueue();
    let generated = false;
    for (let day = 0; day < 8; day++) {
      const before = state.castles[CASTLE_B1]!.buildQueue.length;
      const result = tick(state, queue);
      const order = state.ai.pendingOrders.find((o) => o.command.type === 'buildFacility');
      if (!order) continue;
      generated = true;
      expect(state.castles[CASTLE_B1]!.buildQueue).toHaveLength(before);
      expect(result.appliedCommands.some((e) => e.command.type === 'buildFacility')).toBe(false);
      const next = tick(state, queue);
      expect(
        next.appliedCommands.some(
          (e) =>
            JSON.stringify(e.command) === JSON.stringify(order.command) &&
            envelopeAuthority(e).kind === 'clan',
        ),
      ).toBe(true);
      expect(state.castles[CASTLE_B1]!.buildQueue.length).toBeGreaterThan(before);
      break;
    }
    expect(generated).toBe(true);
  });
  it('executes real AI domestic commands across 90 days without hard rejection or same-tick shortcut', () => {
    const state = initialState(),
      queue = new CommandQueue();
    let applied = 0;
    for (let day = 0; day < 90; day++) {
      const pending = state.ai.pendingOrders.map((order) => JSON.stringify(order.command));
      const result = tick(state, queue);
      expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
      for (const envelope of result.appliedCommands) {
        expect(envelopeAuthority(envelope).kind).toBe('clan');
        expect(pending).toContain(JSON.stringify(envelope.command));
        applied++;
      }
    }
    expect(applied).toBeGreaterThan(3);
    expect(state.castles[CASTLE_B1]!.facilities.length).toBeGreaterThan(0);
  });
  it('JSON save/load with in-flight councils and pending orders reproduces the uninterrupted 90-day hash', () => {
    const uninterrupted = initialState();
    let resumed = initialState();
    const firstQueue = new CommandQueue();
    let resumedQueue = new CommandQueue();
    let savedPending = false;
    for (let day = 0; day < 90; day++) {
      tick(uninterrupted, firstQueue);
      tick(resumed, resumedQueue);
      if (!savedPending && resumed.ai.pendingOrders.length > 0) {
        expect(resumed.ai.councilJobs.length).toBeGreaterThan(0);
        const loaded = decodeSave(encodeSave(resumed, 123456));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) throw new Error(`save decode rejected: ${loaded.code}`);
        resumed = loaded.saveFile.state;
        resumedQueue = new CommandQueue(resumed.meta.lastAppliedCmdSeq + 1);
        savedPending = true;
      }
      expect(stateHash(resumed)).toBe(stateHash(uninterrupted));
    }
    expect(savedPending).toBe(true);
  });
  it('success-only command logs reproduce AI decisions and pending orders when no command is hard-rejected', () => {
    const state = initialState(),
      queue = new CommandQueue(),
      recorder = new CommandLogRecorder();
    for (let day = 0; day < 90; day++) {
      const result = tick(state, queue);
      expect(result.events.some((e) => e.type === 'command.rejected')).toBe(false);
      recorder.recordTick(result.appliedCommands);
    }
    const log = recorder.export(state);
    expect(log.entries.length).toBeGreaterThan(3);
    expect(log.entries.every((e) => e.authority?.kind === 'clan')).toBe(true);
    expect(log.truncated).toBe(false);
    expect(replayCommandLog(log, initialState).match).toBe(true);
  });
  it('unconsumed pending builds stay reserved in following decision steps', () => {
    const state = initialState(),
      queue = new CommandQueue();
    for (
      let day = 0;
      day < 5 && !state.ai.pendingOrders.some((o) => o.command.type === 'buildFacility');
      day++
    )
      tick(state, queue);
    const pending = state.ai.pendingOrders.find((o) => o.command.type === 'buildFacility');
    expect(pending).toBeDefined();
    if (!pending) throw new Error('fixture did not produce a pending build');
    const { sink, orders } = createAiCommandSink(state);
    expect(sink.enqueue(pending.command, pending.authority).ok).toBe(false);
    expect(orders).toHaveLength(0);
    expect(state.ai.pendingOrders).toContain(pending);
  });
  it('all-AI mode genuinely runs both clans and suppresses player proposal generation', () => {
    const state = initialState();
    state.ai.allAi = true;
    state.ai.clans[CLAN_ALPHA]!.councilOffset = 2;
    state.clans[CLAN_ALPHA]!.gold = 10_000;
    const queue = new CommandQueue(),
      actingClans = new Set<string>();
    for (let day = 0; day < 60; day++) {
      const result = tick(state, queue);
      expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
      for (const envelope of result.appliedCommands) actingClans.add(envelope.command.clanId);
    }
    expect(actingClans).toEqual(new Set([CLAN_ALPHA, CLAN_BETA]));
    expect(state.ai.clans[CLAN_ALPHA]!.lastCouncilDay).toBeGreaterThan(0);
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBeGreaterThan(0);
    expect(state.proposals).toEqual({});
  });
  it('replays all-AI player-clan diplomacy with clan authority and consumes its pending orders', () => {
    const initial = () => {
      const state = initialState();
      state.ai.allAi = true;
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts = [];
      state.ai.clans[CLAN_ALPHA]!.councilOffset = 2;
      state.clans[CLAN_ALPHA]!.gold = 10_000;
      const ai = state.ai.clans[CLAN_ALPHA]!;
      state.ai.personas[ai.personaId]!.diplomacy = 100;
      ai.pendingPhases = ['diplomacy'];
      state.ai.councilJobs = [
        { clanId: CLAN_ALPHA, corpsId: null, phases: ['diplomacy'], enrolledDay: state.time.day },
      ];
      ai.threatCache = {
        computedDay: state.time.day,
        totalThreat: 10,
        entries: [
          {
            enemyClanId: CLAN_BETA,
            threat: 10,
            borderPowerEnemy: 1000,
            borderPowerOurs: 100,
            relationFactor: 1,
            threatenedCastleIds: [],
          },
        ],
      };
      return state;
    };
    const state = initial(),
      queue = new CommandQueue(),
      recorder = new CommandLogRecorder();
    for (let day = 0; day < 90; day++) {
      const result = tick(state, queue);
      expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
      recorder.recordTick(result.appliedCommands);
    }
    const log = recorder.export(state);
    const diplomacy = log.entries.filter(
      (entry) =>
        entry.command.clanId === CLAN_ALPHA &&
        ['startDiploWork', 'proposePact', 'startPlot'].includes(entry.command.type),
    );
    expect(diplomacy.length).toBeGreaterThan(0);
    expect(diplomacy.every((entry) => entry.authority?.kind === 'clan')).toBe(true);
    expect(replayCommandLog(log, initial).match).toBe(true);
  });
});
