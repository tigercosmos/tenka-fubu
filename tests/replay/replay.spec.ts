import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope } from '../../src/core/commands/types';
import type { GameEvent } from '../../src/core/state/events';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { advanceDay } from '../../src/core/systems';
import { validateState } from '../../src/core/state/invariants';
import { buildMiniState, CASTLE_A1, CASTLE_B2, CLAN_ALPHA, CLAN_BETA } from '../fixtures/mini';
const CASES_DIR = fileURLToPath(new URL('./cases', import.meta.url));
const replayCases = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.tfulog.json'))
  .sort()
  .map((name) => ({
    name,
    log: JSON.parse(readFileSync(`${CASES_DIR}/${name}`, 'utf8')) as CommandLogFile,
  }));

/** Record the retained command sequence against current rules, without replacing its frozen oracle. */
function recordCurrentCase(source: Readonly<CommandLogFile>): CommandLogFile {
  const state = buildMiniState({ seed: source.seed });
  const recorder = new CommandLogRecorder();
  let sequence = state.meta.lastAppliedCmdSeq + 1;
  expect(validateState(state)).toEqual([]);
  for (let day = 1; day <= source.finalDay; day += 1) {
    const queue: CommandEnvelope[] = source.entries
      .filter((entry) => entry.day === day)
      .map((entry) => ({
        seq: sequence++,
        issuedDay: state.time.day,
        command: structuredClone(entry.command),
        ...(entry.authority ? { authority: structuredClone(entry.authority) } : {}),
      }));
    const result = advanceDay(state, queue);
    expect(result.appliedCommands, `current recording rejected a command on day ${day}`).toEqual(
      queue,
    );
    expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
    expect(validateState(state), `current recording invariant failure on day ${day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
  }
  const recorded = recorder.export(state);
  expect(recorded.truncated).toBe(false);
  expect(recorded.entries).toEqual(source.entries);
  return recorded;
}

function policyEnvelope(seq: number, clanId = CLAN_ALPHA): CommandEnvelope {
  return {
    seq,
    issuedDay: 0,
    command: {
      type: 'setConscriptPolicy',
      clanId,
      castleId: CASTLE_A1,
      policy: seq % 2 === 0 ? 'low' : 'high',
    },
  };
}

describe('CommandLogRecorder', () => {
  it('records only commands that survived hard validation', () => {
    const state = buildMiniState();
    const result = advanceDay(state, [policyEnvelope(1), policyEnvelope(2, CLAN_BETA)]);
    const recorder = new CommandLogRecorder();
    recorder.recordTick(
      result.appliedCommands,
      result.appliedCommands.length === 2 ? {} : { incompleteReason: 'hardRejection' },
    );

    const log = recorder.export(state);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ day: 1, seq: 0 });
    expect(log.entries[0]?.command.clanId).toBe(CLAN_ALPHA);
    expect(log.truncated).toBe(true);
    expect(log.incompleteReasons).toEqual(['hardRejection']);
  });

  it('keeps a bounded ring and marks overflow as truncated', () => {
    const state = buildMiniState();
    const recorder = new CommandLogRecorder(2);
    recorder.recordTick([policyEnvelope(1), policyEnvelope(2), policyEnvelope(3)]);

    const log = recorder.export(state);
    expect(log.truncated).toBe(true);
    expect(log.incompleteReasons).toEqual(['capacity']);
    expect(log.entries).toHaveLength(2);
  });
});

describe('command log replay cases', () => {
  it('discovers at least one checked-in case', () => {
    expect(replayCases.length).toBeGreaterThan(0);
  });

  it('keeps a checked-in M4 trajectory through march, later orders, siege, and castle fall', () => {
    const replayCase = replayCases.find(
      ({ name }) => name === 'm4-military-siege-fall.tfulog.json',
    );
    expect(replayCase).toBeDefined();
    const log = replayCase!.log;

    expect(log.entries.map((entry) => entry.command.type)).toEqual([
      'march',
      'march',
      'setArmyTarget',
      'setAutoReturn',
      'setAutoReturn',
      'setSiegeMode',
    ]);
    expect(log.entries.slice(2).every((entry) => entry.day > log.entries[0]!.day)).toBe(true);

    const state = buildMiniState({ seed: log.seed });
    const events: GameEvent[] = [];
    let entryIndex = 0;
    let envelopeSeq = state.meta.lastAppliedCmdSeq + 1;
    for (let day = 1; day <= log.finalDay; day += 1) {
      const queue: CommandEnvelope[] = [];
      while (log.entries[entryIndex]?.day === day) {
        const entry = log.entries[entryIndex]!;
        queue.push({
          seq: envelopeSeq,
          issuedDay: state.time.day,
          command: structuredClone(entry.command),
        });
        envelopeSeq += 1;
        entryIndex += 1;
      }
      const result = advanceDay(state, queue);
      expect(result.appliedCommands, `第 ${String(day)} 日有軍令遭硬驗證拒絕`).toHaveLength(
        queue.length,
      );
      events.push(...result.events);
    }

    expect(events.some((event) => event.type === 'siege.started')).toBe(true);
    expect(events.some((event) => event.type === 'siege.ended' && event.fallen)).toBe(true);
    expect(state.castles[CASTLE_B2]?.ownerClanId).toBe(CLAN_ALPHA);
  });

  for (const { name, log } of replayCases) {
    it(`${name}: is complete, BAL-current, and reproduces the final hash`, () => {
      expect(
        log.truncated,
        `${name} 是不完整記錄（${log.incompleteReasons?.join(', ') ?? '未註明原因'}），不可作為回歸案例；請從新局重錄。`,
      ).toBe(false);

      const result = replayCommandLog(log, (input) => {
        if (input.scenarioId !== 'mini') {
          throw new Error(`測試尚無「${input.scenarioId}」的同步 fixture builder`);
        }
        return buildMiniState({ seed: input.seed });
      });
      expect(
        result.balanceMismatch,
        'BAL 已變更，請以目前版本重錄此回歸案例或更新 finalHash。',
      ).toBe(false);
      expect(result.match, `${name}: 期望 ${result.expectedHash}，實得 ${result.actualHash}`).toBe(
        true,
      );
    });
  }

  it('reports BAL drift independently from replay execution', () => {
    const replayCase = replayCases[0]?.log;
    expect(replayCase).toBeDefined();
    const current = recordCurrentCase(replayCase!);
    const baseline = replayCommandLog(current, (log) => buildMiniState({ seed: log.seed }));
    expect(baseline).toMatchObject({ balanceMismatch: false, match: true });
    const changed = { ...current, balanceHash: '0000000000000000' };
    const result = replayCommandLog(changed, (log) => buildMiniState({ seed: log.seed }));
    expect(result.balanceMismatch).toBe(true);
    expect(result.match).toBe(true);
    expect(result.actualHash).toBe(baseline.actualHash);
    expect(result.expectedHash).toBe(baseline.expectedHash);
  });

  it('reports a mismatch when a recorded command is tampered with', () => {
    const replayCase = replayCases.find(
      ({ name }) => name === 'ten-command-policy-cycle.tfulog.json',
    )?.log;
    expect(replayCase).toBeDefined();
    const current = recordCurrentCase(replayCase!);
    expect(replayCommandLog(current, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      balanceMismatch: false,
      match: true,
    });
    const tampered = structuredClone(current);
    const lastEntry = tampered.entries.at(-1);
    if (!lastEntry || lastEntry.command.type !== 'setConscriptPolicy') {
      throw new Error('測試案例最後一筆必須是 setConscriptPolicy');
    }
    expect(lastEntry.command.policy).toBe('low');
    lastEntry.command.policy = 'high';
    expect(tampered.entries.slice(0, -1)).toEqual(current.entries.slice(0, -1));
    expect({ ...tampered, entries: current.entries }).toEqual(current);

    const rebuilt = buildMiniState({ seed: current.seed });
    const result = replayCommandLog(tampered, () => rebuilt);
    expect(result.balanceMismatch).toBe(false);
    expect(result.match).toBe(false);
    expect(result.expectedHash).toBe(current.finalHash);
    expect(validateState(rebuilt)).toEqual([]);
    expect(result).not.toHaveProperty('divergedDay');
  });
});
