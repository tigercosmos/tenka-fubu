import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export const WASM_TARGET = 'wasm32-unknown-unknown';
export const WASM_PROFILE = 'release';
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function sourceFiles(root: string) {
  const paths: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (directory === 'rust/engine' && ['target', '.gitignore'].includes(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Unsupported WASM source entry: ${path}`);
    }
  }
  walk('rust/engine');
  for (const path of ['Cargo.toml', 'Cargo.lock', '.cargo/config.toml'])
    if (existsSync(join(root, path))) paths.push(path);
  for (const entry of readdirSync(join(root, 'tools/wasm')))
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) paths.push(`tools/wasm/${entry}`);
  return Object.fromEntries(
    paths.sort().map((path) => [path, digest(readFileSync(join(root, path)))]),
  );
}
export function artifactManifest(root: string, wasm: Uint8Array) {
  const files = sourceFiles(root);
  const toolchain = readFileSync(join(root, 'rust/engine/rust-toolchain.toml'), 'utf8').match(
    /^channel\s*=\s*"([^"]+)"/m,
  )?.[1];
  if (!toolchain) throw new Error('Rust toolchain must pin an explicit channel');
  const module = new WebAssembly.Module(new Uint8Array(wasm));
  const exports = WebAssembly.Module.exports(module).map((value) => value.name);
  for (const name of [
    'memory',
    'engine_abi_version',
    'engine_alloc',
    'engine_free',
    'path_solve',
    'geographic_abi_version',
    'geo_score',
  ])
    if (!exports.includes(name)) throw new Error(`WASM artifact lacks ABI export: ${name}`);
  const instance = new WebAssembly.Instance(module, { env: { path_node_cost: () => 0 } });
  const abi = instance.exports.engine_abi_version as (() => number) | undefined;
  if (typeof abi !== 'function' || abi() !== 1)
    throw new Error('WASM artifact has unsupported ABI');
  const geographicAbi = instance.exports.geographic_abi_version as (() => number) | undefined;
  if (typeof geographicAbi !== 'function' || geographicAbi() !== 1)
    throw new Error('WASM artifact has unsupported geographic ABI');
  return {
    schemaVersion: 1,
    target: WASM_TARGET,
    profile: WASM_PROFILE,
    toolchain,
    sourceSha256: digest(JSON.stringify(files)),
    wasmSha256: digest(wasm),
    sourceFiles: files,
  };
}
export function verifyArtifact(root: string) {
  const binary = join(root, 'public/wasm/tenka_engine.wasm');
  const actual = artifactManifest(root, readFileSync(binary));
  const manifest: unknown = JSON.parse(
    readFileSync(join(root, 'public/wasm/manifest.json'), 'utf8'),
  );
  if (JSON.stringify(manifest) !== JSON.stringify(actual))
    throw new Error(
      'WASM artifact is stale or modified; run npm run wasm:build and commit the binary plus manifest',
    );
  return { binary: relative(root, binary), ...actual };
}
