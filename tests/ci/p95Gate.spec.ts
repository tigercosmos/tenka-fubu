import { describe, expect, it } from 'vitest';
import { measureP95Ticks, nearestRankP95 } from '../perf/p95Gate';
import { readFileSync } from 'node:fs';

describe('independent nearest-rank p95 gate', () => {
  it('uses nearest rank without mutating chronological observations', () => {
    const samples = Array.from({ length: 360 }, (_, index) => 360 - index);
    expect(nearestRankP95(samples)).toBe(342);
    expect(samples[0]).toBe(360);
    expect(nearestRankP95([7.99])).toBeLessThan(8);
    expect(nearestRankP95([8]) < 8).toBe(false);
  });
  it.each([[], [NaN], [-1], [Infinity]].map((samples) => ({ samples })))(
    'rejects malformed samples $samples',
    ({ samples }) => {
      expect(() => nearestRankP95(samples)).toThrow('Invalid p95');
    },
  );
  it('times only advance, excludes expensive prepare/validation, and retains chronological samples', () => {
    let clock = 0n;
    let prepared = 0;
    let validated = 0;
    let reads = 0;
    const result = measureP95Ticks({
      count: 360,
      prepare: () => {
        clock += 1000_000_000n;
        return prepared++;
      },
      advance: (index) => {
        clock += BigInt(360 - index) * 1_000_000n;
      },
      validate: () => {
        clock += 500_000_000n;
        validated++;
      },
      now: () => {
        reads++;
        return clock;
      },
      onFailure: () => {
        throw new Error('Unexpected failure');
      },
    });
    expect(result.samplesMs).toEqual(Array.from({ length: 360 }, (_, index) => 360 - index));
    expect(result.p95Ms).toBe(342);
    expect(reads).toBe(720);
    expect(prepared).toBe(360);
    expect(validated).toBe(360);
  });
  it.each(['prepare', 'advance', 'validate'] as const)(
    'retains partial evidence and original %s exception without retry',
    (stage) => {
      const error = new Error(`original ${stage}`);
      let advances = 0;
      let clock = 0n;
      let partial: readonly number[] | null = null;
      let captured: unknown;
      expect(() =>
        measureP95Ticks({
          count: 360,
          prepare: () => {
            if (stage === 'prepare') throw error;
            return 0;
          },
          advance: () => {
            advances++;
            clock += 2_000_000n;
            if (stage === 'advance') throw error;
          },
          validate: () => {
            if (stage === 'validate') throw error;
          },
          now: () => clock,
          onFailure: (samples, failure) => {
            partial = samples;
            captured = failure;
          },
        }),
      ).toThrow(error);
      expect(captured).toBe(error);
      expect(advances).toBe(stage === 'prepare' ? 0 : 1);
      expect(partial).toEqual(stage === 'prepare' ? [] : [2]);
    },
  );
  it('keeps the opt-in workload out of ordinary and mean-gate test discovery', () => {
    const workspace = readFileSync(new URL('../../vitest.workspace.ts', import.meta.url), 'utf8');
    const mean = readFileSync(new URL('../perf/vitest.gate.workspace.ts', import.meta.url), 'utf8');
    const p95 = readFileSync(new URL('../perf/vitest.p95.workspace.ts', import.meta.url), 'utf8');
    expect(workspace).toContain("'tests/perf/**/*.gate.spec.ts'");
    expect(mean).not.toContain('p95');
    expect(p95).toContain("include: ['tests/perf/advance-day.p95.gate.spec.ts']");
  });
  it('preserves the workload exception even when failure artifact publication throws', () => {
    const original = new Error('original invariant failure');
    expect(() =>
      measureP95Ticks({
        count: 1,
        prepare: () => 0,
        advance: () => {
          throw original;
        },
        validate: () => {},
        now: () => 0n,
        onFailure: () => {
          throw new Error('artifact failure');
        },
      }),
    ).toThrow(original);
  });
});
