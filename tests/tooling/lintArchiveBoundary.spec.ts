import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('retained rejected evidence is not executable lint input', () => {
  it('excludes only the archived fixture while keeping production and collected tests checked', async () => {
    const lint = new ESLint({ cwd: process.cwd() });
    expect(
      await lint.isPathIgnored('output/evidence/army-annotation-v1-layout-rejected.spec.ts'),
    ).toBe(true);
    for (const file of [
      'src/ui/screens/MarchModal.tsx',
      'src/ui/screens/ProposalInbox.tsx',
      'tests/app/ProposalPresentation.spec.tsx',
      'tests/tooling/lintArchiveBoundary.spec.ts',
      'e2e/smoke.spec.ts',
      'src/ui/map/army-annotation-v1-layout-rejected.spec.ts',
      'output/evidence/another-fixture.spec.ts',
    ]) {
      expect(await lint.isPathIgnored(file), file).toBe(false);
    }
  });
});
