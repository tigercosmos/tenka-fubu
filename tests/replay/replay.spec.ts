import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope } from '../../src/core/commands/types';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { advanceDay } from '../../src/core/systems';
import { buildMiniState, CASTLE_A1, CLAN_ALPHA, CLAN_BETA } from '../fixtures/mini';
const CASES_DIR = fileURLToPath(new URL('./cases', import.meta.url));
const replayCases = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.tfulog.json'))
  .sort()
  .map((name) => ({
    name,
    log: JSON.parse(readFileSync(`${CASES_DIR}/${name}`, 'utf8')) as CommandLogFile,
  }));

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
    const changed = { ...replayCase, balanceHash: '0000000000000000' };
    const result = replayCommandLog(changed as CommandLogFile, (log) =>
      buildMiniState({ seed: log.seed }),
    );
    expect(result.balanceMismatch).toBe(true);
    expect(result.match).toBe(true);
  });

  it('reports a mismatch when a recorded command is tampered with', () => {
    const replayCase = replayCases[0]?.log;
    expect(replayCase).toBeDefined();
    const tampered = structuredClone(replayCase as CommandLogFile);
    const lastEntry = tampered.entries.at(-1);
    if (!lastEntry || lastEntry.command.type !== 'setConscriptPolicy') {
      throw new Error('測試案例最後一筆必須是 setConscriptPolicy');
    }
    lastEntry.command.policy = 'high';

    const result = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(result.balanceMismatch).toBe(false);
    expect(result.match).toBe(false);
  });
});
