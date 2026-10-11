import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseSimulateOptions,
  simulationCsv,
  simulationMonthlyCsv,
  type SimulateSummary,
} from '../../tools/simulate';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const reference = join(repository, 'tests/perf/simulate-report.json');
const digest = () => createHash('sha256').update(readFileSync(reference)).digest('hex');

function runCli(directory: string, args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'tools/simulate.ts', ...args], {
    cwd: repository,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 40_000_000,
  });
  // Durable process evidence survives cleanup of the isolated output directory.
  writeFileSync(
    join(tmpdir(), `${basename(directory)}-process.log`),
    JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message }) +
      '\nSTDOUT\n' +
      result.stdout +
      '\nSTDERR\n' +
      result.stderr,
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

describe('simulation CLI authentic failure evidence', () => {
  it('keeps continuation optional and requires an explicit output when enabled', () => {
    expect(parseSimulateOptions([]).continueOnError ?? false).toBe(false);
    expect(parseSimulateOptions(['--continue-on-error=false']).continueOnError).toBe(false);
    expect(() => parseSimulateOptions(['--continue-on-error=true'])).toThrow();
    expect(() => parseSimulateOptions(['--continue-on-error=true', '--output='])).toThrow();
    expect(
      parseSimulateOptions(['--continue-on-error=true', '--output=/tmp/explicit-summary.json'])
        .continueOnError,
    ).toBe(true);
  });

  it.each(['', '1', 'yes', 'TRUE', 'true=oops'])(
    'rejects malformed continuation value %s',
    (value) => {
      expect(() => parseSimulateOptions([`--continue-on-error=${value}`])).toThrow(
        'continue-on-error: true|false',
      );
    },
  );

  it('attempts both real seeds and preserves failures separately from completed CSV runs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tenka-simulation-failure-continue-'));
    const before = digest();
    try {
      const output = join(directory, 'summary.json');
      const wide = join(directory, 'wide.csv');
      const monthly = join(directory, 'monthly.csv');
      const result = runCli(directory, [
        '--seeds=2',
        '--years=5',
        '--difficulty=normal',
        '--continue-on-error=true',
        '--verify-repeat=false',
        `--output=${output}`,
        `--out=${wide}`,
        `--monthly-output=${monthly}`,
      ]);
      expect(result.status).toBe(1);
      expect(readFileSync(output, 'utf8')).toBe(result.stdout);
      const report = JSON.parse(result.stdout) as SimulateSummary;
      expect(report.requestedSeeds).toEqual([1, 2]);
      expect(report.repeatRuns).toBeNull();
      const failures = report.failedRuns.filter((failure) => failure.phase === 'primary');
      expect(report.failedRuns).toHaveLength(failures.length);
      const accounted = [...report.runs.map((run) => run.seed), ...failures.map((f) => f.seed)];
      expect(accounted.sort((a, b) => a - b)).toEqual([1, 2]);
      expect(new Set(accounted).size).toBe(2);
      const seedOne = failures.find((failure) => failure.seed === 1);
      expect(seedOne).toBeDefined();
      expect(seedOne!.day).toBe(1590);
      expect(seedOne!.error).toMatch(/INV/);
      expect(seedOne!.error).toMatch(/saionji/i);
      for (const failure of failures) {
        expect(Number.isInteger(failure.day)).toBe(true);
        expect(failure.day).toBeGreaterThanOrEqual(90);
        expect(failure.error.length).toBeGreaterThan(0);
      }
      expect(report.acceptance.status).toBe('incomplete');
      expect(report.balanceAcceptance.status).toBe('incomplete');
      expect(readFileSync(wide, 'utf8')).toBe(simulationCsv(report.runs));
      expect(readFileSync(monthly, 'utf8')).toBe(simulationMonthlyCsv(report.runs));
      for (const run of report.runs) expect(run.yearsSimulated).toBe(5);
      if (report.runs.length === 0) {
        expect(report.unificationRate).toBeNull();
        expect(report.medianHistoricalEventCount).toBeNull();
        expect(report.survivalRateByClan).toEqual({});
        expect(report.survivalRateAtYear10).toEqual({});
        expect(readFileSync(wide, 'utf8').trim().split('\n')).toHaveLength(1);
        expect(readFileSync(monthly, 'utf8').trim().split('\n')).toHaveLength(1);
      }
    } finally {
      expect(digest()).toBe(before);
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);

  it('keeps the default seed-one failure fail-fast without writing a partial JSON report', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tenka-simulation-failure-fast-'));
    const before = digest();
    try {
      const output = join(directory, 'summary.json');
      const result = runCli(directory, [
        '--seed=1',
        '--years=5',
        '--difficulty=normal',
        `--output=${output}`,
      ]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/INV/);
      expect(result.stderr).toMatch(/saionji/i);
      expect(existsSync(output)).toBe(false);
    } finally {
      expect(digest()).toBe(before);
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
