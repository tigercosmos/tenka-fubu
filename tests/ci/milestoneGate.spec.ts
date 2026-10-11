import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { computeGateOutputs, loadMilestoneConfig } from '../../tools/ci/milestone-gate';

const milestones = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'DONE'] as const;
const temporaryRoots: string[] = [];

function loadFixture(value: unknown) {
  const root = mkdtempSync(path.join(tmpdir(), 'tenka-milestone-gate-'));
  temporaryRoots.push(root);
  writeFileSync(path.join(root, 'milestone.json'), JSON.stringify(value));
  return loadMilestoneConfig(root);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('milestone-conditioned quality gates', () => {
  it.each([
    ['M0', false, false, false],
    ['M6', false, false, false],
    ['M7', false, false, false],
    ['M8', false, true, false],
    ['M9', true, true, true],
    ['DONE', true, true, true],
  ] as const)('%s keeps report-only and blocking gates distinct', (current, golden, a2, m9) => {
    const config = loadFixture({
      current,
      completed: milestones.slice(0, milestones.indexOf(current)),
      completedAt: {},
    });
    expect(computeGateOutputs(config)).toEqual({
      milestoneCurrent: current,
      goldenS1560Blocking: String(golden),
      aiLegalityA2Blocking: String(a2),
      perfGateBlocking: String(m9),
      coreCoverageBlocking: String(m9),
    });
  });

  it('gates only advance across the entire canonical milestone order', () => {
    let previous: Record<string, string> = {};
    for (const current of milestones) {
      const next = computeGateOutputs({ current, completed: [], completedAt: {} });
      for (const key of Object.keys(next).filter((key) => key !== 'milestoneCurrent'))
        if (previous[key] === 'true') expect(next[key]).toBe('true');
      previous = next;
    }
  });

  it.each([
    null,
    { current: 'M10', completed: [] },
    { current: 'M6', completed: ['M0', 'M1', 'M2', 'M3', 'M4'] },
    { current: 'M6', completed: ['M0', 'M1', 'M2', 'M3', 'M5', 'M4'] },
    { current: 'M0', completed: ['M0'] },
    { current: 'M0', completed: ['unknown'] },
  ])('rejects malformed or inconsistent configuration: %j', (value) => {
    expect(() => loadFixture(value)).toThrow();
  });

  it('reads current repository metadata without advancing or rewriting the milestone', () => {
    const file = new URL('../../milestone.json', import.meta.url);
    const before = readFileSync(file, 'utf8');
    const config = loadMilestoneConfig(fileURLToPath(new URL('../../', import.meta.url)));
    const blocking = milestones.indexOf(config.current) >= milestones.indexOf('M9');
    expect(computeGateOutputs(config)).toMatchObject({
      coreCoverageBlocking: String(blocking),
      perfGateBlocking: String(blocking),
    });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('wires the flags without hiding ordinary unit failures or national golden reports', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toContain(
      'coreCoverageBlocking: ${{ steps.gate.outputs.coreCoverageBlocking }}',
    );
    expect(workflow).toContain('perfGateBlocking: ${{ steps.gate.outputs.perfGateBlocking }}');
    expect(workflow).toContain('npm run test:coverage\n');
    expect(workflow).toContain('npm run test:coverage:report\n');
    expect(workflow.match(/CI_EXCLUDE_NATIONAL_GOLDEN: '1'/g)).toHaveLength(1);
    const baseCoverage = workflow.split('      - name: vitest run')[1]!.split('      - uses:')[0]!;
    expect(baseCoverage).toContain("CI_EXCLUDE_NATIONAL_GOLDEN: '1'");
    const nationalStep = workflow.split('      - name: golden-s1560')[1]!.split('      #')[0]!;
    expect(nationalStep).not.toContain('CI_EXCLUDE_NATIONAL_GOLDEN');
    const workspace = readFileSync(new URL('../../vitest.workspace.ts', import.meta.url), 'utf8');
    expect(workspace).toContain("process.env.CI_EXCLUDE_NATIONAL_GOLDEN === '1'");
    expect(workspace).toContain("['tests/golden/s1560.spec.ts']");
    expect(workflow).toContain('run: npx vitest run tests/golden/s1560.spec.ts');
    expect(workflow).toContain(
      "continue-on-error: ${{ needs.install.outputs.goldenS1560Blocking != 'true' }}",
    );
    const perfJob = workflow.split('  perf-gate:')[1]!.split('  e2e:')[0]!;
    expect(perfJob).toContain(
      "continue-on-error: ${{ needs.install.outputs.perfGateBlocking != 'true' }}",
    );
    expect(perfJob).toContain('run: npm run test:perf');
    expect(workflow).toContain('node-version: 22');
  });
});
