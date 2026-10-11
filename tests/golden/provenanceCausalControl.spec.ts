import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('reproduces all protected old goldens and attributes every daily state, event and command to documented mechanics', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const proof = join(root, 'docs/validation/2026-10-12/golden-provenance/goldens');
  const manifest = JSON.parse(
    readFileSync(join(proof, 'historical-source-manifest.json'), 'utf8'),
  ) as { archiveSha256: string };
  expect(
    createHash('sha256')
      .update(readFileSync(join(proof, 'historical-source.tar.gz')))
      .digest('hex'),
  ).toBe(manifest.archiveSha256);
  const scratch = mkdtempSync(join(tmpdir(), 'tenka-golden-proof-test-'));
  try {
    const historical = join(scratch, 'historical');
    mkdirSync(historical);
    execFileSync('tar', ['-xzf', join(proof, 'historical-source.tar.gz'), '-C', historical]);
    const script = join(scratch, 'reproduce.mts');
    copyFileSync(join(proof, 'reproduce.mts.txt'), script);
    const stdout = execFileSync(
      process.execPath,
      [join(root, 'node_modules/tsx/dist/cli.mjs'), script],
      {
        env: {
          ...process.env,
          TENKA_HISTORICAL_ROOT: historical,
          TENKA_CURRENT_ROOT: root,
          TENKA_PROOF_ROOT: proof,
          TENKA_DEPENDENCIES_ROOT: root,
        },
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    const result = JSON.parse(stdout) as {
      scratch: string;
      historicalManifestVerified: boolean;
      results: Array<{
        name: string;
        days: number;
        dailyFullStateEventQueueAppliedParity: boolean;
      }>;
    };
    expect(result.historicalManifestVerified).toBe(true);
    expect(result.results).toEqual([
      { name: 'golden-mini', days: 720, dailyFullStateEventQueueAppliedParity: true },
      { name: 'golden-ai', days: 360, dailyFullStateEventQueueAppliedParity: true },
      { name: 'golden-diplomacy', days: 1800, dailyFullStateEventQueueAppliedParity: true },
    ]);
    rmSync(result.scratch, { recursive: true, force: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 65000);
