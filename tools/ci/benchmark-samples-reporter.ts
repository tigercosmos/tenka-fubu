import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Reporter } from 'vitest/reporters';

const require = createRequire(import.meta.url);
function version(file: string): string {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  )
    throw new Error(`Missing package version: ${file}`);
  return parsed.version;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid benchmark task');
  return value as Record<string, unknown>;
}

/** Retains native Tinybench observations. Tinybench sorts them before completion: no tick IDs. */
export function collectBenchmarkSamples(files: readonly unknown[], errors: readonly unknown[]) {
  if (errors.length > 0)
    throw new Error('Benchmark run contains errors; samples cannot be published');
  const benchmarks: {
    filepath: string;
    name: string;
    id: string;
    statistics: Record<string, unknown>;
    samplesMs: number[];
  }[] = [];
  for (const fileValue of files) {
    const file = record(fileValue);
    if (typeof file.filepath !== 'string') throw new Error('Missing benchmark filepath');
    const visit = (value: unknown) => {
      const task = record(value);
      if (task.result && record(task.result).state === 'fail')
        throw new Error('Failed benchmark task');
      if (task.meta && record(task.meta).benchmark === true) {
        const result = record(task.result);
        if (result.state !== 'pass') throw new Error('Incomplete benchmark task');
        const stats = record(result.benchmark);
        const samples = stats.samples;
        if (
          !Array.isArray(samples) ||
          samples.length === 0 ||
          !samples.every(
            (sample): sample is number =>
              typeof sample === 'number' && Number.isFinite(sample) && sample >= 0,
          )
        )
          throw new Error('Missing or invalid native benchmark samples');
        if (!Number.isInteger(stats.sampleCount) || stats.sampleCount !== samples.length)
          throw new Error('Native benchmark sample count mismatch');
        if (samples.some((sample, index) => index > 0 && sample < samples[index - 1]!))
          throw new Error('Native Tinybench samples are not sorted');
        if (typeof task.name !== 'string' || typeof task.id !== 'string')
          throw new Error('Missing benchmark identity');
        const statistics = { ...stats };
        delete statistics.samples;
        benchmarks.push({
          filepath: file.filepath as string,
          name: task.name,
          id: task.id,
          statistics,
          samplesMs: [...samples],
        });
      }
      if (task.tasks !== undefined) {
        if (!Array.isArray(task.tasks)) throw new Error('Invalid benchmark task list');
        task.tasks.forEach(visit);
      }
    };
    visit(file);
  }
  if (benchmarks.length === 0) throw new Error('No completed benchmark samples');
  return {
    formatVersion: 1,
    observationOrder: 'duration-ascending-not-chronological',
    durationUnit: 'milliseconds',
    nodeVersion: process.version,
    vitestVersion: version(require.resolve('vitest/package.json')),
    tinybenchVersion: version(
      path.resolve(path.dirname(require.resolve('tinybench')), '../package.json'),
    ),
    benchmarks,
  };
}

export function sampleOutputPath(root: string, requestedJson: string): string {
  if (
    !requestedJson.endsWith('.json') ||
    requestedJson.includes('\0') ||
    path.basename(requestedJson) === '.json'
  )
    throw new Error('Benchmark output must name a JSON file');
  return path.resolve(root, requestedJson.slice(0, -5) + '.samples.json');
}

export function writeBenchmarkSamples(
  output: string,
  report: ReturnType<typeof collectBenchmarkSamples>,
): void {
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Extra reporter: built-in statistics/outputJson remain untouched. No work in measured ticks. */
export default class BenchmarkSamplesReporter implements Reporter {
  private output: string | null = null;
  onInit(context: Parameters<NonNullable<Reporter['onInit']>>[0]): void {
    const requested = context.config.benchmark?.outputJson;
    this.output = requested ? sampleOutputPath(context.config.root, requested) : null;
  }
  onFinished(files: Parameters<NonNullable<Reporter['onFinished']>>[0], errors: unknown[]): void {
    if (this.output !== null)
      writeBenchmarkSamples(this.output, collectBenchmarkSamples(files, errors));
  }
}
