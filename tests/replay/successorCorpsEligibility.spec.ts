import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import { advanceDay } from '../../src/core/systems';
import {
  buildMiniState,
  CASTLE_B1,
  CLAN_BETA,
  OFF_BETA_TAISHO_B,
  OFF_BETA_TAISHO_C,
} from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(
    new URL('./cases/m6-successor-corps-eligibility.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;
const creation = source.entries.find((entry) => entry.command.type === 'createCorps')!;

/** Unchanged mini: earned Alpha marches/siege orders, actual pending AI drained normally,
 * then one explicit trusted Beta-clan order. This is not production AI commander selection
 * or the Alpha player's UI. The saved case records every accepted command, not just that order.
 */
function journey(native = false, log = source) {
  const creation = log.entries.find((entry) => entry.command.type === 'createCorps')!;
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  const checkpoints: Array<{ tick: number; players: number; ai: number }> = [];
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    // Recorded Alpha inputs only. AI inputs must be regenerated, not injected from the case.
    for (const entry of log.entries.filter((entry) => entry.day === tick && !entry.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    if (native && [1, 54].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const ai = structuredClone(state.ai.pendingOrders);
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(ai);
      checkpoints.push({ tick, players: pending.length, ai: ai.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
      expect(validateState(state)).toEqual([]);
    }
    if (tick === creation.day) {
      if (creation.command.type !== 'createCorps') throw new Error('Missing corps command');
      expect(tick).toBe(55); // The actual day-54 queued AI construction has settled first.
      expect(state.ai.pendingOrders).toEqual([]);
      expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_TAISHO_B);
      expect(state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
      expect(creation.command).toMatchObject({
        type: 'createCorps',
        clanId: CLAN_BETA,
        corpsLeaderId: OFF_BETA_TAISHO_B,
        castleIds: [CASTLE_B1],
      });
      expect(creation.authority).toEqual({ kind: 'clan', clanId: CLAN_BETA });
      const before = structuredClone(state);
      expect(validateCommand(state, creation.command, creation.authority)).toEqual({ ok: true });
      expect(
        validateCommand(
          state,
          {
            ...creation.command,
            corpsLeaderId: OFF_BETA_TAISHO_C,
          },
          creation.authority,
        ),
      ).toMatchObject({ ok: false, reasonKey: 'cmd.reject.rankTooLow' });
      expect(state).toEqual(before);
      queue.enqueue(structuredClone(creation.command), state.time.day, creation.authority);
    }
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands, `tick ${tick}`).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `absolute day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
  }
  return { state, log: recorder.export(state), events, checkpoints };
}

describe('unchanged mini earned successor corps privilege permanent replay', () => {
  it('records the complete trajectory and repeats the real succession plus explicit trusted-clan creation', () => {
    const first = journey();
    expect(journey()).toEqual(first);
    expect(first.log).toEqual(source);
    expect(source.truncated).toBe(false);
    expect(source.incompleteReasons).toBeUndefined();
    expect(first.events.flat()).toContainEqual(
      expect.objectContaining({
        type: 'clan.succession',
        day: 143,
        clanId: CLAN_BETA,
        heirId: OFF_BETA_TAISHO_B,
      }),
    );
    expect(Object.values(first.state.corps)).toHaveLength(1);
    expect(Object.values(first.state.corps)[0]!.corpsLeaderId).toBe(OFF_BETA_TAISHO_B);
    expect(first.state.officers[OFF_BETA_TAISHO_B]!.rank).toBe('samurai-taisho');
    expect(first.state.officers[OFF_BETA_TAISHO_B]!.loyalty).toBe(100);
    expect(
      source.entries.some((entry) => entry.day === 54 && entry.command.type === 'buildFacility'),
    ).toBe(true);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
    });
  });

  it('continues actual native pending player marches and successor AI construction with equal state, events and RNG', () => {
    const direct = journey();
    const restored = journey(true);
    expect(restored.checkpoints).toEqual([
      { tick: 1, players: 2, ai: 0 },
      { tick: 54, players: 0, ai: 1 },
    ]);
    const persistent = (state: typeof direct.state) => {
      const copy = structuredClone(state);
      copy.ai.intentLog = []; // Native codec deliberately omits these transient diagnostics only.
      return copy;
    };
    expect(persistent(restored.state)).toEqual(persistent(direct.state));
    expect(restored.events).toEqual(direct.events);
    expect(restored.state.rng).toEqual(direct.state.rng);
    expect(restored.log).toEqual(source);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('rejects a same-rank ordinary retainer tamper without changing the original oracle or violating invariants', () => {
    const changed = structuredClone(source);
    const altered = changed.entries.find((entry) => entry.command.type === 'createCorps')!;
    if (altered.command.type !== 'createCorps') throw new Error('Missing corps command');
    altered.command.corpsLeaderId = OFF_BETA_TAISHO_C;
    expect({ ...changed, entries: source.entries }).toEqual(source);
    expect(changed.entries.filter((entry) => entry !== altered)).toEqual(
      source.entries.filter((entry) => entry !== creation),
    );
    const state = buildMiniState({ seed: source.seed });
    const replay = replayCommandLog(changed, () => state);
    expect(replay).toMatchObject({
      match: false,
      balanceMismatch: false,
      expectedHash: source.finalHash,
    });
    expect(Object.values(state.corps)).toEqual([]);
    expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_TAISHO_B);
    expect(state.officers[OFF_BETA_TAISHO_C]!.rank).toBe('samurai-taisho');
    expect(validateState(state)).toEqual([]);
    expect(creation.command).toMatchObject({ corpsLeaderId: OFF_BETA_TAISHO_B });
  });

  it('accepts a legal develop-directive tamper on every day but detects its different state against the original oracle', () => {
    const changed = structuredClone(source);
    const altered = changed.entries.find((entry) => entry.command.type === 'createCorps')!;
    if (altered.command.type !== 'createCorps') throw new Error('Missing corps command');
    expect(altered.command.directive).toBe('hold');
    altered.command.directive = 'develop';
    expect(altered.command.targetNodeId).toBeNull();
    expect({ ...changed, entries: source.entries }).toEqual(source);
    expect(changed.entries.filter((entry) => entry !== altered)).toEqual(
      source.entries.filter((entry) => entry !== creation),
    );
    // journey validates before enqueue and proves all envelopes accepted, zero
    // hard rejections, and clean invariants after each actual daily settlement.
    const direct = journey();
    const tampered = journey(false, changed);
    expect(Object.values(direct.state.corps)[0]!.directive).toBe('hold');
    expect(Object.values(tampered.state.corps)[0]!.directive).toBe('develop');
    expect(tampered.log.entries).toEqual(changed.entries);
    expect(tampered.log.truncated).toBe(false);
    expect(stateHash(tampered.state)).not.toBe(source.finalHash);
    expect(replayCommandLog(changed, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: false,
      balanceMismatch: false,
      expectedHash: source.finalHash,
      actualHash: stateHash(tampered.state),
    });
    expect(creation.command).toMatchObject({ directive: 'hold' });
  });
});
