import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { Reporter } from 'vitest/reporters';
import BenchmarkSamplesReporter, {
  collectBenchmarkSamples,
  sampleOutputPath,
  writeBenchmarkSamples,
} from '../../tools/ci/benchmark-samples-reporter';

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);
function fixture() {
  const benchmark = {
    id: 'case1',
    name: 'actual workload',
    type: 'custom',
    meta: { benchmark: true },
    result: {
      state: 'pass',
      benchmark: { samples: [1, 2, 3], sampleCount: 3, mean: 2, p99: 3, rank: 1 },
    },
  };
  const files = [
    { filepath: '/project/example.bench.ts', tasks: [{ name: 'group', tasks: [benchmark] }] },
  ];
  return { benchmark, files };
}
describe('native Tinybench sample reporter', () => {
  it('preserves sorted native samples and statistics without altering the source', () => {
    const { files, benchmark } = fixture();
    const before = JSON.stringify(files);
    const report = collectBenchmarkSamples(files, []);
    expect(report.observationOrder).toBe('duration-ascending-not-chronological');
    expect(report.durationUnit).toBe('milliseconds');
    expect(report.nodeVersion).toBe(process.version);
    expect(report.vitestVersion).toMatch(/^2\./);
    expect(report.tinybenchVersion).toMatch(/^2\./);
    expect(report.benchmarks[0]).toEqual({
      filepath: '/project/example.bench.ts',
      name: 'actual workload',
      id: 'case1',
      statistics: { sampleCount: 3, mean: 2, p99: 3, rank: 1 },
      samplesMs: [1, 2, 3],
    });
    report.benchmarks[0]!.samplesMs.push(4);
    expect(benchmark.result.benchmark.samples).toEqual([1, 2, 3]);
    expect(JSON.stringify(files)).toBe(before);
  });
  it.each([[], [NaN], [Infinity], [-1], [3, 2, 1]].map((samples) => ({ samples })))(
    'rejects invalid or absent native samples %j',
    ({ samples }) => {
      const { files, benchmark } = fixture();
      benchmark.result.benchmark.samples = samples;
      benchmark.result.benchmark.sampleCount = samples.length;
      expect(() => collectBenchmarkSamples(files, [])).toThrow();
    },
  );
  it('rejects aggregate-only sample loss, count mismatches, incomplete tasks and errors', () => {
    const { files, benchmark } = fixture();
    benchmark.result.benchmark.sampleCount = 360;
    expect(() => collectBenchmarkSamples(files, [])).toThrow('count mismatch');
    benchmark.result.benchmark.sampleCount = 3;
    benchmark.result.state = 'run';
    expect(() => collectBenchmarkSamples(files, [])).toThrow('Incomplete');
    benchmark.result.state = 'fail';
    expect(() => collectBenchmarkSamples(files, [])).toThrow('Failed');
    expect(() => collectBenchmarkSamples(files, [new Error('benchmark failure')])).toThrow(
      'contains errors',
    );
    expect(() => collectBenchmarkSamples([], [])).toThrow('No completed');
  });
  it('retains all 360 observations without downsampling', () => {
    const { files, benchmark } = fixture();
    benchmark.result.benchmark.samples = Array.from({ length: 360 }, (_, index) => index / 10);
    benchmark.result.benchmark.sampleCount = 360;
    expect(collectBenchmarkSamples(files, []).benchmarks[0]!.samplesMs).toEqual(
      benchmark.result.benchmark.samples,
    );
  });
  it('fails requested output on missing native array or errors without creating an artifact', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'tenka-benchmark-samples-'));
    directories.push(directory);
    const reporter = new BenchmarkSamplesReporter();
    reporter.onInit({
      config: { root: directory, benchmark: { outputJson: 'bench.json' } },
    } as unknown as Parameters<NonNullable<Reporter['onInit']>>[0]);
    expect(() => reporter.onFinished([], [new Error('failure')])).toThrow('contains errors');
    expect(readdirSync(directory)).toEqual([]);
    const { files, benchmark } = fixture();
    delete (benchmark.result.benchmark as Record<string, unknown>).samples;
    expect(() => collectBenchmarkSamples(files, [])).toThrow('Missing or invalid');
  });
  it('derives a separate explicit JSON sibling and rejects unnamed/non-JSON output', () => {
    expect(sampleOutputPath('/project', 'reports/bench.json')).toBe(
      '/project/reports/bench.samples.json',
    );
    expect(sampleOutputPath('/project', '/tmp/bench.json')).toBe('/tmp/bench.samples.json');
    for (const name of ['/', '', '.json', 'bench.txt', 'bad\0.json'])
      expect(() => sampleOutputPath('/project', name)).toThrow();
  });
  it('writes atomically with no temporary files and leaves default statistics file untouched', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'tenka-benchmark-samples-'));
    directories.push(directory);
    const output = sampleOutputPath(directory, 'bench.json');
    const report = collectBenchmarkSamples(fixture().files, []);
    writeBenchmarkSamples(output, report);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(report);
    expect(readdirSync(directory)).toEqual(['bench.samples.json']);
  });
  it('does no validation or output when JSON was not requested', () => {
    const reporter = new BenchmarkSamplesReporter();
    const context = { config: { root: '/project', benchmark: {} } } as unknown as Parameters<
      NonNullable<Reporter['onInit']>
    >[0];
    reporter.onInit(context);
    expect(() => reporter.onFinished([], [new Error('no output requested')])).not.toThrow();
  });
});
