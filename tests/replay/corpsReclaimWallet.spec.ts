import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { buildMiniState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, OFF_ALPHA_LORD } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-corps-reclaim-wallet.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;
const persistent = (state: GameState) => {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
};

function enqueueDay(state: GameState, queue: CommandQueue, day: number) {
  for (const entry of source.entries.filter((entry) => entry.day === day)) {
    expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
    queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
  }
}

/** No overrides or direct writes: all prerequisites, income and refunds are normal core ticks. */
function recordJourney() {
  const state = buildMiniState({ seed: source.seed });
  expect(validateState(state)).toEqual([]);
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events = new Map<number, GameEvent[]>();
  let saved: ReturnType<typeof decodeSave> | undefined;
  const refunds: number[] = [];
  for (let day = 1; day <= source.finalDay; day++) {
    const corps = Object.values(state.corps)[0];
    const wallet = corps?.gold ?? 0;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    if (day === 31 || day === 61) expect(wallet).toBeGreaterThan(0);
    // At day30, persist the genuinely queued next-day reclaim as well as the state.
    if (day !== 31) enqueueDay(state, queue, day);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.set(day, result.events);
    if (day === 31) {
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
      expect(corps!.gold).toBe(0);
      expect(state.corps[corps!.id]).toBe(corps);
      expect(state.castles[CASTLE_A1]).toMatchObject({ corpsId: null, directControl: true });
      expect(state.castles[CASTLE_A2]).toMatchObject({ corpsId: corps!.id, directControl: false });
      refunds.push(wallet);
    }
    if (day === 61) {
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
      expect(Object.values(state.corps)).toEqual([]);
      expect(state.castles[CASTLE_A2]).toMatchObject({ corpsId: null, directControl: true });
      // The unchanged mini has only its ruling lord eligible as corps leader.
      // This case pins the higher-priority ruling-loyalty guard, not nonruling dismissal.
      expect(state.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100); // 02 INV-08 fixed ruling loyalty.
      refunds.push(wallet);
    }
    if (day === 30) {
      enqueueDay(state, queue, 31);
      const before = structuredClone(state);
      saved = decodeSave(encodeSave(state, 0, queue.snapshotPlayerCommands()));
      expect(state).toEqual(before);
      expect(saved.ok).toBe(true);
    }
  }
  const before = structuredClone(state);
  const log = recorder.export(state);
  expect(state).toEqual(before);
  return { state, log, saved, events, refunds };
}

describe('permanent mini corps wallet reclaim regression', () => {
  it('records the exact checked-in three-command journey and replays from unchanged seed twice', () => {
    const first = recordJourney();
    const second = recordJourney();
    expect(first.log).toEqual(source);
    expect(first.log).toEqual(second.log);
    expect(first.refunds).toEqual(second.refunds);
    expect(first.state).toEqual(second.state);
    expect(first.log.truncated).toBe(false);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: true,
      actualHash: source.finalHash,
      expectedHash: source.finalHash,
      balanceMismatch: false,
    });
  });

  it('continues a genuine pending reclaim native save with identical events, state and RNG', () => {
    const original = recordJourney();
    if (!original.saved?.ok) throw new Error('native checkpoint missing');
    const restored = original.saved.saveFile.state;
    const queue = new CommandQueue(restored.meta.lastAppliedCmdSeq + 1);
    expect(original.saved.saveFile.pendingCommands).toEqual([source.entries[1]!.command]);
    for (const command of original.saved.saveFile.pendingCommands)
      queue.enqueue(command, restored.time.day);
    for (let day = 31; day <= source.finalDay; day++) {
      if (day !== 31) enqueueDay(restored, queue, day);
      const envelopes = queue.drain();
      const result = advanceDay(restored, envelopes);
      expect(result.appliedCommands).toEqual(envelopes);
      expect(result.events).toEqual(original.events.get(day));
      expect(validateState(restored)).toEqual([]);
    }
    expect(persistent(restored)).toEqual(persistent(original.state));
    expect(restored.rng).toEqual(original.state.rng);
    expect(stateHash(restored)).toBe(source.finalHash);
  });

  it('detects a changed command while keeping the original recorded oracle intact', () => {
    const tampered = structuredClone(source);
    const command = tampered.entries[1]!.command;
    if (command.type !== 'assignCastleToCorps') throw new Error('unexpected command');
    command.castleId = CASTLE_A2;
    const state = buildMiniState({ seed: tampered.seed });
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    expect(validateState(state)).toEqual([]);
    let acceptedCommands = 0;
    for (let day = 1; day <= tampered.finalDay; day++) {
      for (const entry of tampered.entries.filter((entry) => entry.day === day)) {
        expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
        queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
      }
      const envelopes = queue.drain();
      const tick = advanceDay(state, envelopes);
      expect(tick.appliedCommands).toEqual(envelopes);
      expect(tick.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      acceptedCommands += tick.appliedCommands.length;
      expect(validateState(state)).toEqual([]);
    }
    expect(acceptedCommands).toBe(tampered.entries.length);
    const result = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(result.balanceMismatch).toBe(false);
    expect(result.match).toBe(false);
    expect(result.actualHash).toBe(stateHash(state));
    expect(source.entries[1]!.command).toMatchObject({ castleId: CASTLE_A1 });
  });
});
