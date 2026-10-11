import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import manifest from '../../tools/dependencies/pixi-8.19-patch.json';
import { applyPixiPatch, sha256 } from '../../tools/dependencies/pixi-8.19-patch.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
function fixture(version = '8.19.0') {
  const root = mkdtempSync(join(tmpdir(), 'tenka-pixi-patch-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));
  for (const target of manifest.targets) {
    let source = readFileSync(join('node_modules/pixi.js', target.path), 'utf8');
    if (sha256(source) === target.patchedSha256) {
      for (const { from, to } of [...target.replacements].reverse()) {
        if (!to && from.startsWith('//# sourceMappingURL=')) {
          source += from;
          continue;
        }
        // Deletions have no unique reverse marker; reinsert their exact spans
        // below at unique source anchors, then verify the original digest.
        if (!to) continue;
        source = source.replace(to, from);
      }
      if (target.path.includes('setProgramName')) {
        source = source.replace(
          'function setProgramName',
          'const fragmentNameCache = {};\nconst VertexNameCache = {};\nfunction setProgramName',
        );
        const deleted = target.replacements[1]!.from;
        source = source.replace('  if (src.indexOf', deleted + '  if (src.indexOf');
      }
    }
    expect(sha256(source)).toBe(target.originalSha256);
    const path = join(root, target.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return root;
}
function hashes(root: string) {
  return manifest.targets.map(({ path }) => sha256(readFileSync(join(root, path), 'utf8')));
}

describe('offline exact-version Pixi dependency patch installation', () => {
  it('patches all runtime/declaration files and is idempotent across fresh offline reinstalls', () => {
    for (let install = 0; install < 2; install++) {
      const root = fixture();
      expect(applyPixiPatch(root)).toEqual({ version: '8.19.0', validated: 23, written: 23 });
      expect(hashes(root)).toEqual(manifest.targets.map((target) => target.patchedSha256));
      expect(applyPixiPatch(root).written).toBe(0);
    }
    expect(manifest.targets.filter(({ path }) => path.endsWith('.js'))).toHaveLength(11);
    expect(manifest.targets.filter(({ path }) => path.endsWith('.mjs'))).toHaveLength(11);
    expect(manifest.targets.some(({ path }) => path.endsWith('.d.ts'))).toBe(true);
  });
  it('rejects an unknown version before any writes', () => {
    const root = fixture('8.19.1');
    const before = hashes(root);
    expect(() => applyPixiPatch(root)).toThrow('Unsupported Pixi version');
    expect(hashes(root)).toEqual(before);
  });
  it('rejects corruption in the LAST target before touching earlier targets', () => {
    const root = fixture();
    const last = manifest.targets.at(-1)!;
    writeFileSync(join(root, last.path), 'corrupt');
    const before = hashes(root);
    expect(() => applyPixiPatch(root)).toThrow('Unexpected Pixi source');
    expect(hashes(root)).toEqual(before);
  });
  it('rejects an invalid result hash and unsafe paths before writes', () => {
    const root = fixture();
    const before = hashes(root);
    const badHash = structuredClone(manifest);
    badHash.targets.at(-1)!.patchedSha256 = '0'.repeat(64);
    expect(() => applyPixiPatch(root, badHash)).toThrow('Invalid patch result');
    expect(hashes(root)).toEqual(before);
    const unsafe = structuredClone(manifest);
    unsafe.targets.at(-1)!.path = '../escape';
    expect(() => applyPixiPatch(root, unsafe)).toThrow('Unsafe or duplicate');
    expect(hashes(root)).toEqual(before);
  });
  it('recovers a known mixed original/patched state without rewriting patched files', () => {
    const root = fixture();
    applyPixiPatch(root);
    const first = manifest.targets[0]!;
    const clean = fixture();
    writeFileSync(join(root, first.path), readFileSync(join(clean, first.path)));
    expect(applyPixiPatch(root).written).toBe(1);
    expect(hashes(root)).toEqual(manifest.targets.map((target) => target.patchedSha256));
  });
  it('removes stale runtime map directives while preserving upstream map files', () => {
    const root = fixture();
    const runtime = manifest.targets.filter(({ path }) => /\.(js|mjs)$/.test(path));
    const maps = runtime.map(({ path }) => {
      const source = readFileSync(join('node_modules/pixi.js', path + '.map'), 'utf8');
      writeFileSync(join(root, path + '.map'), source);
      return sha256(source);
    });
    applyPixiPatch(root);
    expect(runtime).toHaveLength(22);
    for (const { path } of runtime) {
      expect(readFileSync(join(root, path), 'utf8')).not.toContain('//# sourceMappingURL=');
    }
    expect(
      runtime.map(({ path }) => sha256(readFileSync(join(root, path + '.map'), 'utf8'))),
    ).toEqual(maps);
  });
});
