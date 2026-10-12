import { afterEach, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactManifest, verifyArtifact, wasmHasSimd } from '../../tools/wasm/artifact';

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
  cpSync(
    'public/wasm/tenka_engine.simd.wasm',
    join(directory, 'public/wasm/tenka_engine.simd.wasm'),
  );
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
it('rejects a real module whose castle ribbon planner export is missing', () => {
  const bytes = Buffer.from(readFileSync('public/wasm/tenka_engine.wasm'));
  const name = Buffer.from('castle_ribbon_solve');
  const position = bytes.indexOf(name);
  expect(position).toBeGreaterThan(0);
  bytes[position + name.length - 1] = 'x'.charCodeAt(0);
  const changed = new WebAssembly.Module(new Uint8Array(bytes));
  expect(WebAssembly.Module.exports(changed).map(({ name }) => name)).toContain(
    'castle_ribbon_solvx',
  );
  expect(() => artifactManifest(process.cwd(), bytes)).toThrow(
    'lacks ABI export: castle_ribbon_solve',
  );
});
it.each(['geo_prepare', 'geo_score_prepared', 'geographic_preparation_abi_version'])(
  'rejects the real module when preparation export %s is absent',
  (exportName) => {
    const bytes = Buffer.from(readFileSync('public/wasm/tenka_engine.wasm'));
    const name = Buffer.from(exportName);
    const position = bytes.indexOf(Buffer.concat([Buffer.from([name.length]), name]));
    expect(position).toBeGreaterThan(0);
    bytes[position + name.length] = 'x'.charCodeAt(0);
    const changed = new WebAssembly.Module(new Uint8Array(bytes));
    expect(WebAssembly.Module.exports(changed).map(({ name }) => name)).not.toContain(exportName);
    expect(() => artifactManifest(process.cwd(), bytes)).toThrow(`lacks ABI export: ${exportName}`);
  },
);
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

it('verifies both physical variants and source/flag recipes independently', () => {
  const manifest = verifyArtifact(fixture());
  expect(manifest.variants.scalar?.hasSimd).toBe(false);
  expect(manifest.variants.simd128?.hasSimd).toBe(true);
  expect(manifest.variants.scalar?.abiVersions.render_numeric_variant).toBe(0);
  expect(manifest.variants.simd128?.abiVersions.render_numeric_variant).toBe(1);
  expect(manifest.variants.scalar?.recipe.cargoFeatures).toEqual([]);
  expect(manifest.variants.simd128?.recipe.cargoFeatures).toEqual(['render-simd']);
  expect(manifest.variants.scalar?.recipe.targetFeatures).toEqual(['-simd128']);
  expect(manifest.variants.simd128?.recipe.targetFeatures).toEqual(['-simd128']);
  expect(manifest.variants.scalar?.recipeSha256).not.toBe(manifest.variants.simd128?.recipeSha256);
});
it('rejects swapped actual variants, missing SIMD and corrupt variant metadata', () => {
  const swapped = fixture();
  const a = join(swapped, 'public/wasm/tenka_engine.wasm'),
    b = join(swapped, 'public/wasm/tenka_engine.simd.wasm');
  const scalar = readFileSync(a),
    simd = readFileSync(b);
  writeFileSync(a, simd);
  writeFileSync(b, scalar);
  expect(() => verifyArtifact(swapped)).toThrow(/variant/);
  const missing = fixture();
  rmSync(join(missing, 'public/wasm/tenka_engine.simd.wasm'));
  expect(() => verifyArtifact(missing)).toThrow();
  const metadata = fixture(),
    path = join(metadata, 'public/wasm/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    variants: { simd128: { recipe: { targetFeatures: string[] } } };
  };
  manifest.variants.simd128.recipe.targetFeatures = ['+simd128'];
  writeFileSync(path, JSON.stringify(manifest));
  expect(() => verifyArtifact(metadata)).toThrow(/stale/);
});
it.each(['render_numeric_abi_version', 'render_numeric_variant'])(
  'rejects actual missing numeric export %s',
  (exportName) => {
    const bytes = Buffer.from(readFileSync('public/wasm/tenka_engine.wasm'));
    const name = Buffer.from(exportName);
    const position = bytes.indexOf(Buffer.concat([Buffer.from([name.length]), name]));
    expect(position).toBeGreaterThan(0);
    bytes[position + name.length] = 'x'.charCodeAt(0);
    expect(() => artifactManifest(process.cwd(), bytes)).toThrow(`lacks ABI export: ${exportName}`);
  },
);
it('does not confuse immediate/data bytes with physical SIMD, and catches v128 types', () => {
  const prefix = [0, 97, 115, 109, 1, 0, 0, 0];
  const f64 = new Uint8Array([
    ...prefix,
    1,
    5,
    1,
    96,
    0,
    1,
    124,
    3,
    2,
    1,
    0,
    10,
    13,
    1,
    11,
    0,
    68,
    253,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    11,
  ]);
  expect(WebAssembly.validate(f64)).toBe(true);
  expect(wasmHasSimd(f64)).toBe(false);
  const vectorType = new Uint8Array([...prefix, 1, 5, 1, 96, 1, 123, 0]);
  expect(WebAssembly.validate(vectorType)).toBe(true);
  expect(wasmHasSimd(vectorType)).toBe(true);
});

it('rejects a scalar-labelled real module with an unused physical SIMD signature', () => {
  const original = new Uint8Array(readFileSync('public/wasm/tenka_engine.wasm'));
  const encode = (n: number) => {
    const bytes: number[] = [];
    do {
      let b = n & 127;
      n = Math.floor(n / 128);
      if (n) b |= 128;
      bytes.push(b);
    } while (n);
    return bytes;
  };
  let p = 8;
  const read = () => {
    let value = 0,
      shift = 0,
      b: number;
    do {
      b = original[p++]!;
      value += (b & 127) * 2 ** shift;
      shift += 7;
    } while (b & 128);
    return value;
  };
  const sections: number[] = [...original.slice(0, 8)];
  while (p < original.length) {
    const id = original[p++]!,
      length = read(),
      start = p,
      end = start + length;
    if (id === 1) {
      const count = read();
      const payload = [...encode(count + 1), ...original.slice(p, end), 0x60, 1, 0x7b, 0];
      sections.push(id, ...encode(payload.length), ...payload);
    } else sections.push(id, ...encode(length), ...original.slice(start, end));
    p = end;
  }
  const changed = new Uint8Array(sections);
  expect(WebAssembly.validate(changed)).toBe(true);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(changed), {
    env: { path_node_cost: () => 0 },
  });
  expect((instance.exports.render_numeric_variant as () => number)()).toBe(0);
  expect(() => artifactManifest(process.cwd(), changed)).toThrow(/physical SIMD/);
});
