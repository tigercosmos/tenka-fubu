import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { runS1560Golden } from './s1560Runner';
import type { GoldenSnapshotFile } from './goldenRunner';

const SNAPSHOT_PATH = fileURLToPath(
  new URL('./snapshots/golden-s1560-nightly.json', import.meta.url),
);

it.skipIf(process.env.NIGHTLY_GOLDEN !== '1')(
  'nightly s1560 locks3600 actual national ticks, repeatability and native codec continuation',
  async () => {
    const actual = await runS1560Golden(false, 10);
    expect(actual.ticks).toBe(3600);
    expect(actual.checkpoints).toHaveLength(10);
    expect(actual.checkpoints.map((checkpoint) => checkpoint.day)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index + 1) * 360),
    );
    expect(await runS1560Golden(false, 10), 'ten-year repeat must match every checkpoint').toEqual(
      actual,
    );
    expect(
      await runS1560Golden(true, 10),
      'native midpoint codec continuation must match every checkpoint',
    ).toEqual(actual);
    if (process.env.UPDATE_GOLDEN === '1') {
      // Manual generation only, after all three complete real runs succeed.
      writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
      return;
    }
    const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as GoldenSnapshotFile;
    expect(actual, 'nightly trajectory changes require reviewed manual regeneration').toEqual(
      expected,
    );
  },
  360_000,
);
