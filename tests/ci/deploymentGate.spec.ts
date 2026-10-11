import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);
const build = workflow.split('  build:')[1]!.split('  deploy:')[0]!;
const deploy = workflow.split('  deploy:')[1]!;
const gate = build.split('    if: >-\n')[1]!.split('    runs-on:')[0]!.trim();

/** Evaluate the actual checked-in guard's supported expression subset, not a duplicate predicate. */
function allowsBuild(
  conclusion: string,
  event: string,
  branch: string,
  repository = 'owner/tenka-fubu',
): unknown {
  expect(gate).toMatch(/^[\w\s.='&/-]+$/);
  return runInNewContext(
    gate,
    {
      github: {
        repository: 'owner/tenka-fubu',
        event: {
          workflow_run: {
            conclusion,
            event,
            head_branch: branch,
            head_repository: { full_name: repository },
          },
        },
      },
    },
    { timeout: 100 },
  ) as unknown;
}

describe('GitHub Pages CI completion gate', () => {
  it('has no direct push or manual deployment bypass', () => {
    const triggers = workflow.split('\non:\n')[1]!.split('\npermissions:')[0]!;
    expect(triggers).toContain('workflow_run:');
    expect(triggers).toContain('workflows: [CI]');
    expect(triggers).toContain('types: [completed]');
    expect(triggers).toContain('branches: [main]');
    expect(triggers).not.toMatch(/(?:push|workflow_dispatch|pull_request):/);
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toMatch(/^name: CI$/m);
  });

  it('accepts only successful same-repository main push CI', () => {
    expect(allowsBuild('success', 'push', 'main')).toBe(true);
  });

  it.each(['failure', 'cancelled', 'skipped', 'neutral', 'timed_out', 'action_required'])(
    'rejects upstream conclusion %s',
    (conclusion) => expect(allowsBuild(conclusion, 'push', 'main')).toBe(false),
  );

  it('rejects PRs, manual upstream runs, non-main branches and foreign repositories', () => {
    expect(allowsBuild('success', 'pull_request', 'main')).toBe(false);
    expect(allowsBuild('success', 'workflow_dispatch', 'main')).toBe(false);
    expect(allowsBuild('success', 'push', 'feature')).toBe(false);
    expect(allowsBuild('success', 'push', 'main', 'fork/tenka-fubu')).toBe(false);
  });

  it('builds the tested SHA rather than default/latest main and does not consume upstream artifacts', () => {
    expect(build).toContain('repository: ${{ github.repository }}');
    expect(build).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    expect(build).toContain('persist-credentials: false');
    expect(build).toContain('npm ci');
    expect(build).toContain('npm run build');
    expect(build).toContain('actions/upload-pages-artifact@v3');
    expect(build).toContain('with: { path: dist }');
    expect(workflow).not.toContain('actions/download-artifact');
  });

  it('limits Pages write and OIDC privileges to the dependent deployment job', () => {
    const globalPermissions = workflow.split('\npermissions:\n')[1]!.split('\njobs:')[0]!;
    expect(globalPermissions.trim()).toBe('contents: read');
    expect(build).not.toMatch(/pages: write|id-token: write/);
    expect(deploy).toContain('needs: build');
    expect(deploy).toContain('pages: write');
    expect(deploy).toContain('id-token: write');
    expect(deploy).toContain('name: github-pages');
    expect(deploy).toContain('actions/deploy-pages@v4');
    expect(deploy).not.toContain('always()');
    expect(deploy).toContain('concurrency:');
    expect(deploy).toContain('group: pages');
    expect(workflow.split('\njobs:')[0]).not.toContain('concurrency:');
  });
});
