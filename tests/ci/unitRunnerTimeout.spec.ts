import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('hosted unit runner timeout budget', () => {
  it('keeps strict local timeouts and applies the measured CI allowance to every project', () => {
    const workspace = readFileSync(new URL('../../vitest.workspace.ts', import.meta.url), 'utf8');

    expect(workspace).toContain('const testTimeout = process.env.CI ? 20_000 : 5_000;');
    expect(workspace.match(/^\s+testTimeout,$/gm)).toHaveLength(3);
  });
});
