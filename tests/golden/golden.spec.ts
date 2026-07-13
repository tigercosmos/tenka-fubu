import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runGoldenMini, type GoldenSnapshotFile } from './goldenRunner';

const SNAPSHOT_PATH = fileURLToPath(new URL('./snapshots/golden-mini.json', import.meta.url));
const UPDATE_HINT = '若此變更是刻意的，執行 npm run golden:update 並在 PR 說明原因。';

function readSnapshot(): GoldenSnapshotFile {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as GoldenSnapshotFile;
}

describe('golden-mini', () => {
  it('locks the deterministic 720-tick trajectory', () => {
    const actual = runGoldenMini();
    expect(runGoldenMini(), '相同 seed 與固定指令連跑兩次必須 bit-exact 一致').toEqual(actual);
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
      return;
    }

    const expected = readSnapshot();
    expect(actual.formatVersion).toBe(expected.formatVersion);
    expect(actual.balanceHash, `BAL hash 不符。${UPDATE_HINT}`).toBe(expected.balanceHash);
    expect(actual.scenarioId).toBe(expected.scenarioId);
    expect(actual.seed).toBe(expected.seed);
    expect(actual.ticks).toBe(expected.ticks);

    for (let i = 0; i < expected.checkpoints.length; i += 1) {
      const expectedPoint = expected.checkpoints[i];
      const actualPoint = actual.checkpoints[i];
      expect(
        actualPoint,
        `第 ${String(expectedPoint?.day)} 日 hash 不符：期望 ${String(expectedPoint?.hash)} 實得 ${String(actualPoint?.hash)}。${UPDATE_HINT}`,
      ).toEqual(expectedPoint);
    }
    expect(actual.checkpoints).toHaveLength(expected.checkpoints.length);
  });
});
