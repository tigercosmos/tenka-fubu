import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { runS1560Golden } from './s1560Runner';
import type { GoldenSnapshotFile } from './goldenRunner';
import { TESTCFG } from '../config';

const SNAPSHOT_PATH = fileURLToPath(new URL('./snapshots/golden-s1560.json', import.meta.url));
it('s1560 locks1800 national all-AI/event ticks, repeatability and native codec continuation', async () => {
  const actual = await runS1560Golden();
  expect(actual.checkpoints).toHaveLength(TESTCFG.goldenYearsFull);
  expect(await runS1560Golden(), 'national repeat must preserve every yearly checkpoint').toEqual(
    actual,
  );
  expect(
    await runS1560Golden(true),
    'native midpoint save/load must preserve every checkpoint',
  ).toEqual(actual);
  if (process.env.UPDATE_GOLDEN === '1') {
    // Write only after every real run and invariant check completed successfully.
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    return;
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as GoldenSnapshotFile;
  expect(
    actual.balanceHash,
    'BAL changes require reviewed golden metadata/trajectory evidence',
  ).toBe(expected.balanceHash);
  expect(actual.scenarioId).toBe(expected.scenarioId);
  expect(actual.seed).toBe(expected.seed);
  expect(actual.ticks).toBe(expected.ticks);
  expect(actual.formatVersion).toBe(expected.formatVersion);
  for (let index = 0; index < expected.checkpoints.length; index++)
    expect(
      actual.checkpoints[index],
      `s1560 checkpoint${expected.checkpoints[index]?.day}: intentional changes require reviewed UPDATE_GOLDEN=1`,
    ).toEqual(expected.checkpoints[index]);
  expect(actual.checkpoints).toHaveLength(expected.checkpoints.length);
}, 180_000);
