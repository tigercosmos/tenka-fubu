// @ts-check
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
import { z } from 'zod';

const manifestPath = fileURLToPath(new URL('./pixi-8.19-patch.json', import.meta.url));
const manifestSchema = z.object({
  version: z.literal('8.19.0'),
  targets: z
    .array(
      z.object({
        path: z.string(),
        originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
        patchedSha256: z.string().regex(/^[a-f0-9]{64}$/),
        replacements: z.array(z.object({ from: z.string().min(1), to: z.string() })),
      }),
    )
    .min(1),
});
/** @typedef {{version: string, targets: {path: string, originalSha256: string,
 * patchedSha256: string, replacements: {from: string, to: string}[]}[]}} PixiPatchManifest */
/** @param {string} text */
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Validate every input before writing any file. Mixed known states are recoverable. */
/** @param {string} root @param {PixiPatchManifest} manifest */
export function applyPixiPatch(
  root,
  manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8'))),
) {
  manifest = manifestSchema.parse(manifest);
  const pkg = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')));
  if (pkg.version !== manifest.version) throw new Error(`Unsupported Pixi version: ${pkg.version}`);
  const paths = new Set();
  const pending = [];
  for (const target of manifest.targets) {
    if (!target.path.startsWith('lib/') || target.path.includes('..') || paths.has(target.path)) {
      throw new Error(`Unsafe or duplicate patch target: ${target.path}`);
    }
    paths.add(target.path);
    const path = resolve(root, target.path);
    const original = readFileSync(path, 'utf8');
    const digest = sha256(original);
    if (digest === target.patchedSha256) continue;
    if (digest !== target.originalSha256) throw new Error(`Unexpected Pixi source: ${target.path}`);
    let patched = original;
    for (const { from, to } of target.replacements) {
      if (!from || patched.split(from).length !== 2)
        throw new Error(`Ambiguous patch: ${target.path}`);
      patched = patched.replace(from, to);
    }
    if (sha256(patched) !== target.patchedSha256)
      throw new Error(`Invalid patch result: ${target.path}`);
    pending.push({ path, patched });
  }
  for (const { path, patched } of pending) {
    const temp = `${path}.tenka-patch-tmp`;
    writeFileSync(temp, patched);
    renameSync(temp, path);
  }
  return { version: pkg.version, validated: paths.size, written: pending.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  log(JSON.stringify(applyPixiPatch(resolve(repo, 'node_modules/pixi.js'))));
}
