import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('simulation CLI independent repeat evidence', () => {
  it('keeps repeat optional and accepts only explicit booleans', () => {
    expect(parseSimulateOptions([])).not.toHaveProperty('verifyRepeat');
    expect(parseSimulateOptions(['--verify-repeat=true']).verifyRepeat).toBe(true);
    expect(parseSimulateOptions(['--verify-repeat=false']).verifyRepeat).toBe(false);
  });

  it.each(['', '1', 'yes', 'TRUE', 'true=oops'])(
    'rejects malformed repeat value %s before simulation',
    (value) => {
      expect(() => parseSimulateOptions([`--verify-repeat=${value}`])).toThrow(
        'verify-repeat: true|false',
      );
    },
  );

  it.each([true, false])(
    'runs the actual CLI with repeat=%s without replacing the reference report',
    (verifyRepeat) => {
      const directory = mkdtempSync(join(tmpdir(), 'tenka-simulation-repeat-test-'));
      const before = digest();
      try {
        const output = join(directory, 'summary.json');
        const wide = join(directory, 'wide.csv');
        const monthly = join(directory, 'monthly.csv');
        const stdout = execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            'tools/simulate.ts',
            '--seed=42',
            '--years=0.1',
            '--difficulty=hard',
            `--verify-repeat=${verifyRepeat}`,
            `--output=${output}`,
            `--out=${wide}`,
            `--monthly-output=${monthly}`,
          ],
          { cwd: repository, encoding: 'utf8', timeout: 30000, maxBuffer: 20_000_000 },
        );
        const report = JSON.parse(stdout) as SimulateSummary;
        expect(readFileSync(output, 'utf8')).toBe(stdout);
        expect(report.difficulty).toBe('hard');
        expect(report.runs).toHaveLength(1);
        expect(report.runs[0]!.seed).toBe(42);
        expect(report.runs[0]!.yearsSimulated).toBe(0.1);
        expect(report.runs[0]!.hardRejections).toBe(0);
        expect(report.runs[0]!.invalidDecisionCount).toBe(0);
        expect(readFileSync(wide, 'utf8')).toBe(simulationCsv(report.runs));
        expect(readFileSync(monthly, 'utf8')).toBe(simulationMonthlyCsv(report.runs));
        expect(report.acceptance.specification).toBe('18 §5.4');
        expect(report.acceptance.status).toBe('incomplete');
        expect(report.balanceAcceptance.specification).toBe('15 §5.6');
        expect(report.balanceAcceptance.status).toBe('incomplete');
        if (verifyRepeat) {
          expect(report.repeatRuns).toHaveLength(1);
          expect(report.repeatRuns![0]!.avgTickMs).toBe(0);
          expect(report.runs[0]!.avgTickMs).toBeGreaterThan(0);
          expect(report.repeatRuns![0]!.monthlySamples).toEqual(report.runs[0]!.monthlySamples);
          expect(simulationCsv(report.repeatRuns!)).toBe(simulationCsv(report.runs));
        } else expect(report.repeatRuns).toBeNull();
        expect(digest()).toBe(before);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    60000,
  );
});
