import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { envelopeAuthority } from '../../src/core/commands/authority';
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
import { buildMiniState, CLAN_ALPHA, CLAN_BETA, OFF_ALPHA_TAISHO_B } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-reward-month-boundary-ai.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;
const persistent = (state: GameState) => {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
};

/** Faithful bridge queue order, without app observers/live army targets: no manually supplied AI orders. */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  const twin = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const twinQueue = new CommandQueue(twin.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  const counters: number[] = [];
  const checkpoints: { tick: number; player: number; ai: number }[] = [];
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    // Only the player trace comes from JSON; every clan-authorized envelope is generated naturally.
    for (const entry of log.entries.filter((entry) => entry.day === tick && !entry.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    if (native && [24, 30, 31].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      checkpoints.push({ tick, player: pending.length, ai: state.ai.pendingOrders.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    // runOneDay transfers stored AI after player commands, before the one daily drain.
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    for (const envelope of envelopes)
      expect(validateCommand(state, envelope.command, envelopeAuthority(envelope))).toEqual({
        ok: true,
      });
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    enqueuePendingAiOrders(twin, twinQueue);
    const twinEnvelopes = twinQueue.drain();
    const twinResult = advanceDay(twin, twinEnvelopes);
    expect(twinResult.appliedCommands).toEqual(twinEnvelopes);
    expect(validateState(twin)).toEqual([]);
    if (tick >= 29) counters.push(state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth!);
  }
  expect(twin.clans[CLAN_ALPHA]!.gold - state.clans[CLAN_ALPHA]!.gold).toBe(
    3 * BAL.rewardGoldSmallCost,
  );
  expect(state.officers[OFF_ALPHA_TAISHO_B]!.rewardGiftsThisYear).toBe(3);
  return { state, log: recorder.export(state), events, counters, checkpoints };
}

describe('unchanged mini monthly gifts with production AI queue scheduling', () => {
  it('records real Beta orders alongside three gifts, repeats and replays the complete accepted trace', () => {
    const first = journey();
    expect(journey()).toEqual(first);
    expect(first.log).toEqual(source);
    expect(first.counters).toEqual([BAL.rewardGoldSmallCost, 0, BAL.rewardGoldSmallCost]);
    const ai = first.log.entries.filter((entry) => entry.authority);
    expect(ai).toHaveLength(8);
    for (const entry of ai) expect(entry.authority).toEqual({ kind: 'clan', clanId: CLAN_BETA });
    expect(ai.map((entry) => entry.command.type)).toEqual([
      'setConscriptPolicy',
      'buildFacility',
      'enactPolicy',
      'setDevelopFocus',
      'setDevelopFocus',
      'setDevelopFocus',
      'setDevelopFocus',
      'startDiploWork',
    ]);
    expect(first.state.ai.pendingOrders).toEqual([]);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: true,
      actualHash: source.finalHash,
      expectedHash: source.finalHash,
      balanceMismatch: false,
    });
  });

  it('restores genuine AI pending orders and both boundary player gifts into fresh queues', () => {
    const original = journey();
    const restored = journey(source, true);
    expect(restored.checkpoints).toEqual([
      { tick: 24, player: 0, ai: 7 },
      { tick: 30, player: 1, ai: 0 },
      { tick: 31, player: 1, ai: 0 },
    ]);
    expect(restored.log).toEqual(source);
    expect(restored.events).toEqual(original.events);
    expect(restored.counters).toEqual(original.counters);
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('proves a legal old-month timing alteration with actual AI execution and unchanged total debit', () => {
    const tampered = structuredClone(source);
    const third = tampered.entries.filter((entry) => entry.command.type === 'rewardOfficer')[2]!;
    third.day = 30;
    third.seq = 1;
    const actual = journey(tampered);
    expect(actual.counters).toEqual([BAL.rewardGoldSmallCost, 0, 0]);
    expect(actual.log.entries).toEqual(tampered.entries);
    const replay = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(replay.match).toBe(false);
    expect(replay.actualHash).toBe(stateHash(actual.state));
    expect(replay.actualHash).not.toBe(source.finalHash);
  });
});
