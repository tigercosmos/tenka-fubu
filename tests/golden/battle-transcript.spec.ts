import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TacticId } from '../../src/core/state/ids';
import { replayBattleTranscript, type BattleTranscriptFile } from './battleTranscript';

const CASES_DIR = fileURLToPath(new URL('./battle-cases', import.meta.url));
const cases = readdirSync(CASES_DIR)
  .filter((name) => name.endsWith('.tfbattle.json'))
  .sort()
  .map((name) => ({
    name,
    transcript: JSON.parse(readFileSync(`${CASES_DIR}/${name}`, 'utf8')) as BattleTranscriptFile,
  }));

describe('battle-subloop transcript replay', () => {
  it('discovers a checked-in M5 battle transcript', () => {
    expect(cases.map(({ name }) => name)).toContain('m5-battle-subloop-v1.tfbattle.json');
  });

  for (const { name, transcript } of cases) {
    it(`${name}: rebuilds the seeded layout and reproduces every checkpoint bit-exact`, () => {
      const first = replayBattleTranscript(transcript);
      const second = replayBattleTranscript(transcript);

      expect(first.balanceMismatch, `${name}: BAL changed; re-record the transcript`).toBe(false);
      expect(
        first.initialMatch,
        `${name}: initial layout expected ${first.expectedInitialHash}, got ${first.actualInitialHash}`,
      ).toBe(true);
      expect(first.checkpointResults.every((checkpoint) => checkpoint.match)).toBe(true);
      expect(first.actualFinalHash).toBe(first.expectedFinalHash);
      expect(first.executedTicks).toBe(transcript.finalTick);
      expect(first.resolved).toBe(true);
      expect(first.match).toBe(true);
      expect(second).toEqual(first);
    });
  }

  it('detects BAL drift independently from otherwise identical replay execution', () => {
    const transcript = cases[0]?.transcript;
    expect(transcript).toBeDefined();
    const changed = { ...transcript!, balanceHash: '0000000000000000' };
    const result = replayBattleTranscript(changed);
    expect(result.balanceMismatch).toBe(true);
    expect(result.initialMatch).toBe(true);
    expect(result.actualFinalHash).toBe(result.expectedFinalHash);
    expect(result.match).toBe(false);
  });

  it('detects layout identity and battle-order tampering', () => {
    const transcript = cases[0]?.transcript;
    expect(transcript).toBeDefined();

    const changedLayout = structuredClone(transcript!);
    changedLayout.initial.stateHash = '0000000000000000';
    expect(replayBattleTranscript(changedLayout)).toMatchObject({
      initialMatch: false,
      match: false,
    });

    const changedOrder = structuredClone(transcript!);
    const firstOrder = changedOrder.entries[0]?.order;
    if (!firstOrder || firstOrder.kind !== 'tactic') {
      throw new Error('M5 battle transcript must begin with a tactic order');
    }
    changedOrder.entries[0] = {
      ...changedOrder.entries[0]!,
      order: { ...firstOrder, tacticId: 'tac.volley' as TacticId },
    };
    const result = replayBattleTranscript(changedOrder);
    expect(result.balanceMismatch).toBe(false);
    expect(result.initialMatch).toBe(true);
    expect(result.match).toBe(false);
    expect(result.checkpointResults.some((checkpoint) => !checkpoint.match)).toBe(true);
  });

  it('rejects non-contiguous within-tick order sequences', () => {
    const transcript = structuredClone(cases[0]!.transcript);
    transcript.entries[0]!.seq = 1;
    expect(() => replayBattleTranscript(transcript)).toThrow(/expected seq 0/);
  });
});
