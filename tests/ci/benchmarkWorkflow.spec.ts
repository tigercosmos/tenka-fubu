import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raw: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const scripts = (raw as { scripts: Record<string, string> }).scripts;
const nightly = readFileSync(
  new URL('../../.github/workflows/nightly.yml', import.meta.url),
  'utf8',
);
const workspace = readFileSync(new URL('../../vitest.workspace.ts', import.meta.url), 'utf8');

describe('reference benchmark workflow isolation', () => {
  it('selects only the existing node core project without changing the workload path', () => {
    expect(scripts.bench).toBe(
      'vitest bench tests/perf --project core --minWorkers=1 --maxWorkers=1 --reporter ./tools/ci/benchmark-samples-reporter.ts',
    );
    expect(workspace).toMatch(/name: 'core',\s+environment: 'node'/);
    expect(workspace).toMatch(/name: 'core',[\s\S]*?benchmark: \{ includeSamples: true \}/);
  });

  it('runs the nightly benchmark once, serially, with a reporter JSON artifact', () => {
    const benchmark = nightly
      .split('      - name: National benchmark\n')[1]!
      .split('      - name: Ten-year national golden')[0]!;
    expect(benchmark.match(/npm run bench/g)).toHaveLength(1);
    expect(benchmark).toContain('npm run bench -- --run --outputJson=nightly-artifacts/bench.json');
    expect(benchmark).toContain('set -o pipefail');
    expect(benchmark).toContain('tee nightly-artifacts/bench.log');
    expect(benchmark).toContain('continue-on-error: true');
    expect(nightly).toContain('path: nightly-artifacts/');
  });

  it('passes each single-value worker option exactly once across npm script and nightly arguments', () => {
    const benchmark = nightly
      .split('      - name: National benchmark\n')[1]!
      .split('      - name: Ten-year national golden')[0]!;
    const forwarded = benchmark.match(/npm run bench -- (.*?) 2>&1/)![1]!;
    const combined = `${scripts.bench} ${forwarded}`;
    expect(combined.match(/--minWorkers=1(?=\s|$)/g)).toHaveLength(1);
    expect(combined.match(/--maxWorkers=1(?=\s|$)/g)).toHaveLength(1);
    expect(combined).toContain('--run --outputJson=nightly-artifacts/bench.json');
  });

  it('keeps the blocking performance gate in its separate serial workspace', () => {
    expect(scripts['test:perf']).toBe(
      'vitest run --workspace tests/perf/vitest.gate.workspace.ts --minWorkers=1 --maxWorkers=1',
    );
    const gateWorkspace = readFileSync(
      new URL('../perf/vitest.gate.workspace.ts', import.meta.url),
      'utf8',
    );
    expect(gateWorkspace).toContain("name: 'perf'");
    expect(gateWorkspace).toContain("include: ['tests/perf/advance-day.gate.spec.ts']");
    expect(gateWorkspace).not.toContain('.bench.');
  });
});
