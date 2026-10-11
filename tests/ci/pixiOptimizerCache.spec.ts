import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optimizeDeps, resolveConfig } from 'vite';
import config, { pixiPatchOptimizerIdentity } from '../../vite.config';

describe('local Pixi optimizer cache identity', () => {
  it('deterministically fingerprints the complete manifest bytes', () => {
    const manifest = '{"version":"8.19.0","patchedSha256":"first"}';
    const expected = `pixi-local-patch-${createHash('sha256').update(manifest).digest('hex')}`;
    expect(pixiPatchOptimizerIdentity(manifest)).toBe(expected);
    expect(pixiPatchOptimizerIdentity(Buffer.from(manifest))).toBe(expected);
    expect(pixiPatchOptimizerIdentity(manifest)).toBe(expected);
  });

  it('invalidates same-version patch revisions without a lockfile change', () => {
    const original = '{"version":"8.19.0","patchedSha256":"first"}';
    const revised = '{"version":"8.19.0","patchedSha256":"second"}';
    expect(pixiPatchOptimizerIdentity(revised)).not.toBe(pixiPatchOptimizerIdentity(original));
    expect(pixiPatchOptimizerIdentity(`${original}\n`)).not.toBe(
      pixiPatchOptimizerIdentity(original),
    );
  });

  it('uses the actual manifest in a no-op optimizer plugin, not forced/global cache clearing', () => {
    const manifest = readFileSync(
      new URL('../../tools/dependencies/pixi-8.19-patch.json', import.meta.url),
    );
    const plugins = config.optimizeDeps?.esbuildOptions?.plugins;
    expect(plugins).toHaveLength(1);
    expect(plugins![0]!.name).toBe(pixiPatchOptimizerIdentity(manifest));
    expect(plugins![0]!.setup).toBeTypeOf('function');
    expect(config.optimizeDeps?.force).toBeUndefined();
    expect(config.cacheDir).toBeUndefined();
    expect(config.build?.manifest).toBe(true);
  });

  it('changes Vite native configHash at the same root and lockfile, and reuses unchanged inputs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tenka-pixi-optimizer-'));
    try {
      const metadataFor = async (manifest: string) => {
        const resolved = await resolveConfig(
          {
            configFile: false,
            root,
            logLevel: 'silent',
            optimizeDeps: {
              noDiscovery: true,
              include: [],
              esbuildOptions: {
                plugins: [{ name: pixiPatchOptimizerIdentity(manifest), setup() {} }],
              },
            },
          },
          'serve',
        );
        return optimizeDeps(resolved);
      };
      const first = await metadataFor('{"version":"8.19.0","patch":"first"}');
      const unchanged = await metadataFor('{"version":"8.19.0","patch":"first"}');
      const revised = await metadataFor('{"version":"8.19.0","patch":"second"}');
      expect(unchanged.configHash).toBe(first.configHash);
      expect(unchanged.hash).toBe(first.hash);
      expect(revised.lockfileHash).toBe(first.lockfileHash);
      expect(revised.configHash).not.toBe(first.configHash);
      expect(revised.hash).not.toBe(first.hash);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
