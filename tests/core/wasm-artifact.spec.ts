import { afterEach, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactManifest, verifyArtifact } from '../../tools/wasm/artifact';

const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'tenka-wasm-artifact-'));
  fixtures.push(directory);
  mkdirSync(join(directory, 'rust/engine'), { recursive: true });
  mkdirSync(join(directory, 'tools/wasm'), { recursive: true });
  mkdirSync(join(directory, 'public/wasm'), { recursive: true });
  for (const file of ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'])
    cpSync(`rust/engine/${file}`, join(directory, 'rust/engine', file));
  cpSync('rust/engine/src', join(directory, 'rust/engine/src'), { recursive: true });
  for (const file of ['artifact.ts', 'build.ts'])
    cpSync(`tools/wasm/${file}`, join(directory, 'tools/wasm', file));
  const wasm = readFileSync('public/wasm/tenka_engine.wasm');
  writeFileSync(join(directory, 'public/wasm/tenka_engine.wasm'), wasm);
  writeFileSync(
    join(directory, 'public/wasm/manifest.json'),
    JSON.stringify(artifactManifest(directory, wasm)),
  );
  return directory;
}
it('accepts the committed artifact without invoking the Rust compiler', () => {
  const directory = fixture();
  expect(verifyArtifact(directory).wasmSha256).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects a real module whose geographic scorer export is missing', () => {
  const bytes = Buffer.from(readFileSync('public/wasm/tenka_engine.wasm'));
  const name = Buffer.from('geo_score');
  const position = bytes.indexOf(name);
  expect(position).toBeGreaterThan(0);
  bytes[position + name.length - 1] = 'x'.charCodeAt(0);
  const changed = new WebAssembly.Module(new Uint8Array(bytes));
  expect(WebAssembly.Module.exports(changed).map(({ name }) => name)).toContain('geo_scorx');
  expect(() => artifactManifest(process.cwd(), bytes)).toThrow('lacks ABI export: geo_score');
});
it('rejects changed Rust source and newly added build inputs', () => {
  const edited = fixture();
  const source = join(edited, 'rust/engine/src/lib.rs');
  writeFileSync(source, readFileSync(source, 'utf8') + '\n// changed source\n');
  expect(() => verifyArtifact(edited)).toThrow(/stale/);
  const added = fixture();
  writeFileSync(join(added, 'rust/engine/build.rs'), 'fn main() {}\n');
  expect(() => verifyArtifact(added)).toThrow(/stale/);
});
it('rejects changed toolchain, recipe, and compiler configuration', () => {
  for (const file of ['rust/engine/rust-toolchain.toml', 'tools/wasm/build.ts']) {
    const directory = fixture();
    const path = join(directory, file);
    writeFileSync(path, readFileSync(path, 'utf8') + '\n# changed recipe\n');
    expect(() => verifyArtifact(directory)).toThrow(/stale/);
  }
  const directory = fixture();
  mkdirSync(join(directory, '.cargo'));
  writeFileSync(join(directory, '.cargo/config.toml'), '[build]\nincremental = false\n');
  expect(() => verifyArtifact(directory)).toThrow(/stale/);
});
it('rejects binary corruption and missing manifests instead of accepting an untracked binary', () => {
  const corrupt = fixture();
  const path = join(corrupt, 'public/wasm/tenka_engine.wasm');
  const wasm = readFileSync(path);
  wasm[0] = 1;
  writeFileSync(path, wasm);
  expect(() => verifyArtifact(corrupt)).toThrow();
  const missing = fixture();
  rmSync(join(missing, 'public/wasm/manifest.json'));
  expect(() => verifyArtifact(missing)).toThrow();
});
