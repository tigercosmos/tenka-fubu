import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');

/** Isolate actual job/steps so a matching command in another job cannot satisfy ordering. */
function job(workflow: string, name: string): string {
  const found = workflow.match(
    new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'),
  );
  expect(found, `Missing job ${name}`).not.toBeNull();
  return found![1]!;
}
function steps(body: string): string[] {
  return body.split(/\n {6}- /).slice(1);
}

describe('production bundle workflow gates', () => {
  it('checks CI production output before native Playwright without rebuilding after the check', () => {
    const body = job(ci, 'e2e');
    const buildIndex = body.indexOf('run: npm run build');
    const checkIndex = body.indexOf('run: npm run validate:bundle');
    const browserIndex = body.indexOf('npx playwright test');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(checkIndex).toBeGreaterThan(buildIndex);
    expect(browserIndex).toBeGreaterThan(checkIndex);
    expect(body.slice(checkIndex)).not.toContain('npm run build');
    expect(body).not.toContain('npm run e2e');
    expect(body).toContain('[ -f e2e/smoke.spec.ts ]');
    expect(body).toContain('npx playwright test e2e/smoke.spec.ts');
    expect(body).not.toMatch(/^\s*npx playwright test\s*$/m);
    expect(body).not.toContain('continue-on-error:');
  });

  it('checks the Pages-base production build before uploading the artifact', () => {
    const body = job(deploy, 'build');
    const buildIndex = body.indexOf('run: npm run build');
    const baseIndex = body.indexOf('VITE_BASE: /${{ github.event.repository.name }}/');
    const checkIndex = body.indexOf('run: npm run validate:bundle');
    const artifactIndex = body.indexOf('uses: actions/upload-pages-artifact@v3');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(baseIndex).toBeGreaterThan(buildIndex);
    expect(checkIndex).toBeGreaterThan(baseIndex);
    expect(artifactIndex).toBeGreaterThan(checkIndex);
    expect(body.slice(checkIndex)).not.toContain('npm run build');
    expect(body).not.toContain('continue-on-error:');
  });

  it.each([
    ['CI', ci, 'e2e'],
    ['Deploy', deploy, 'build'],
  ])('%s has one unconditional blocking bundle step', (_name, workflow, name) => {
    const body = job(workflow, name);
    const checks = steps(body).filter((step) => step.includes('run: npm run validate:bundle'));
    expect(checks).toHaveLength(1);
    const checkFields = checks[0]!
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
    expect(checkFields.join('\n').trim()).toBe('run: npm run validate:bundle');
    expect(body).not.toMatch(/^ {4}continue-on-error:/m);
    if (name === 'e2e') expect(body).not.toMatch(/^ {4}if:/m);
    // Deployment's existing trusted-CI job guard is intentionally preserved.
    if (name === 'build')
      expect(body).toContain("github.event.workflow_run.conclusion == 'success'");
  });
});
