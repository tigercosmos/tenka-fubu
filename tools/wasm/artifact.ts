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

export const WASM_VARIANTS = [
  { name: 'scalar', file: 'tenka_engine.wasm', features: [] as string[], flag: 0 },
  { name: 'simd128', file: 'tenka_engine.simd.wasm', features: ['render-simd'], flag: 1 },
] as const;

/** Decode instructions/types, not raw byte matches (f64 constants/data can contain 0xfd).
 * Encoding: https://webassembly.github.io/spec/core/binary/instructions.html
 * Node validates the module first; unsupported future encodings fail closed here.
 */
export function wasmHasSimd(wasm: Uint8Array) {
  new WebAssembly.Module(new Uint8Array(wasm));
  let p = 8,
    limit = wasm.length,
    simd = false;
  const byte = () => {
    if (p >= limit) throw new Error('Truncated WASM feature encoding');
    return wasm[p++]!;
  };
  const skip = (n: number) => {
    if (n < 0 || p + n > limit) throw new Error('Truncated WASM feature encoding');
    p += n;
  };
  const leb = () => {
    let value = 0,
      shift = 0,
      b: number;
    do {
      b = byte();
      value += (b & 127) * 2 ** shift;
      shift += 7;
    } while (b & 128);
    if (!Number.isSafeInteger(value)) throw new Error('Unsupported WASM feature encoding');
    return value;
  };
  const skipLeb = () => {
    while (byte() & 128) {
      /* Signed immediates need no numeric conversion. */
    }
  };
  const type = () => {
    const t = byte();
    if (t === 0x7b) simd = true;
    if (t === 0x63 || t === 0x64) skipLeb();
  };
  const limits = () => {
    const flags = leb();
    skipLeb();
    if (flags & 1) skipLeb();
  };
  const memarg = () => {
    const alignment = leb();
    if (alignment & 64) skipLeb();
    skipLeb();
  };
  const instructions = (expression = false) => {
    while (p < limit) {
      const op = byte();
      if (op === 0x0b && expression) return;
      if ([2, 3, 4].includes(op)) {
        if (wasm[p] === 0x7b) simd = true;
        skipLeb();
      } else if (
        [
          0x0c, 0x0d, 0x10, 0x12, 0x14, 0x15, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x3f, 0x40,
          0xd0, 0xd2, 0xd5, 0xd6,
        ].includes(op)
      )
        skipLeb();
      else if (op === 0x11 || op === 0x13) {
        skipLeb();
        skipLeb();
      } else if (op === 0x0e) {
        const count = leb();
        for (let i = 0; i <= count; i++) skipLeb();
      } else if (op === 0x1c) {
        const count = leb();
        for (let i = 0; i < count; i++) type();
      } else if (op >= 0x28 && op <= 0x3e) memarg();
      else if (op === 0x41 || op === 0x42) skipLeb();
      else if (op === 0x43) skip(4);
      else if (op === 0x44) skip(8);
      else if (op === 0xfc) {
        const sub = leb();
        if (sub <= 7) continue;
        if ([8, 10, 12, 14].includes(sub)) {
          skipLeb();
          skipLeb();
        } else if ([9, 11, 13, 15, 16, 17].includes(sub)) skipLeb();
        else throw new Error('Unsupported WASM feature instruction');
      } else if (op === 0xfd) {
        simd = true;
        const sub = leb();
        if (sub >= 0x100) throw new Error('Relaxed SIMD is not an artifact recipe feature');
        if (sub <= 11 || sub === 0x5c || sub === 0x5d) memarg();
        else if (sub === 12 || sub === 13) skip(16);
        else if (sub >= 0x15 && sub <= 0x22) skip(1);
        else if (sub >= 0x54 && sub <= 0x5b) {
          memarg();
          skip(1);
        }
      } else if (
        ![0, 1, 5, 0x0b, 0x0f, 0x1a, 0x1b, 0xd1, 0xd3, 0xd4].includes(op) &&
        !(op >= 0x45 && op <= 0xc4)
      ) {
        throw new Error(`Unsupported WASM feature opcode: ${op}`);
      }
    }
  };
  while (p < wasm.length) {
    limit = wasm.length;
    const section = byte(),
      length = leb(),
      end = p + length;
    limit = end;
    if (section === 1) {
      const count = leb();
      for (let i = 0; i < count; i++) {
        if (byte() !== 0x60) throw new Error('Unsupported WASM type feature');
        for (let side = 0; side < 2; side++) {
          const count = leb();
          for (let j = 0; j < count; j++) type();
        }
      }
    } else if (section === 2) {
      const count = leb();
      for (let i = 0; i < count; i++) {
        skip(leb());
        skip(leb());
        const kind = byte();
        if (kind === 0) skipLeb();
        else if (kind === 1) {
          type();
          limits();
        } else if (kind === 2) limits();
        else if (kind === 3) {
          type();
          byte();
        } else if (kind === 4) {
          byte();
          skipLeb();
        } else throw new Error('Unsupported WASM import feature');
      }
    } else if (section === 6) {
      const count = leb();
      for (let i = 0; i < count; i++) {
        type();
        byte();
        instructions(true);
      }
    } else if (section === 10) {
      const count = leb();
      for (let i = 0; i < count; i++) {
        limit = end;
        const bodyLength = leb();
        const bodyEnd = p + bodyLength;
        limit = bodyEnd;
        const locals = leb();
        for (let j = 0; j < locals; j++) {
          skipLeb();
          type();
        }
        instructions();
        if (p !== bodyEnd) throw new Error('Invalid WASM code length');
      }
    }
    p = end;
    limit = wasm.length;
  }
  return simd;
}

export function variantRecipe(toolchain: string, variant: (typeof WASM_VARIANTS)[number]) {
  return {
    target: WASM_TARGET,
    profile: WASM_PROFILE,
    toolchain,
    locked: true,
    cargoFeatures: variant.features,
    targetFeatures: ['-simd128'],
    rustflags: ['--remap-path-prefix=<crate>=tenka-engine', '-Ctarget-feature=-simd128'],
    incremental: false,
    targetDirectory: `rust/engine/target/${variant.name}`,
  };
}
function inspectVariant(wasm: Uint8Array, flag: number) {
  const module = new WebAssembly.Module(new Uint8Array(wasm));
  const exports = WebAssembly.Module.exports(module).map((value) => value.name);
  const abis = [
    'engine_abi_version',
    'geographic_abi_version',
    'geographic_preparation_abi_version',
    'castle_ribbon_abi_version',
    'render_numeric_abi_version',
  ];
  for (const name of [
    'memory',
    'engine_alloc',
    'engine_free',
    'path_solve',
    'geo_score',
    'geo_prepare',
    'geo_score_prepared',
    'castle_ribbon_solve',
    'render_numeric_variant',
    ...abis,
  ])
    if (!exports.includes(name)) throw new Error(`WASM artifact lacks ABI export: ${name}`);
  const instance = new WebAssembly.Instance(module, { env: { path_node_cost: () => 0 } });
  const values: Record<string, number> = {};
  for (const name of [...abis, 'render_numeric_variant']) {
    const value = instance.exports[name];
    if (typeof value !== 'function')
      throw new Error(`WASM artifact has invalid ABI export: ${name}`);
    values[name] = (value as () => number)();
    if (values[name] !== (name === 'render_numeric_variant' ? flag : 1))
      throw new Error(`WASM artifact has unsupported ABI/variant: ${name}`);
  }
  const hasSimd = wasmHasSimd(wasm);
  if (hasSimd !== (flag === 1))
    throw new Error('WASM artifact physical SIMD feature disagrees with variant');
  return { abiVersions: values, hasSimd };
}
export function artifactManifest(
  root: string,
  scalar: Uint8Array,
  simd = readFileSync(join(root, 'public/wasm/tenka_engine.simd.wasm')),
) {
  const files = sourceFiles(root);
  const toolchain = readFileSync(join(root, 'rust/engine/rust-toolchain.toml'), 'utf8').match(
    /^channel\s*=\s*"([^"]+)"/m,
  )?.[1];
  if (!toolchain) throw new Error('Rust toolchain must pin an explicit channel');
  const sourceSha256 = digest(JSON.stringify(files));
  const variants = Object.fromEntries(
    WASM_VARIANTS.map((variant) => {
      const wasm = variant.flag === 0 ? scalar : simd;
      const recipe = variantRecipe(toolchain, variant);
      return [
        variant.name,
        {
          file: variant.file,
          bytes: wasm.length,
          wasmSha256: digest(wasm),
          sourceSha256,
          recipe,
          recipeSha256: digest(JSON.stringify(recipe)),
          sourceAndFlagsSha256: digest(JSON.stringify({ sourceSha256, recipe })),
          ...inspectVariant(wasm, variant.flag),
        },
      ];
    }),
  );
  return {
    schemaVersion: 1,
    target: WASM_TARGET,
    profile: WASM_PROFILE,
    toolchain,
    sourceSha256,
    wasmSha256: digest(scalar),
    sourceFiles: files,
    dualVariantSchemaVersion: 1,
    variants,
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
      'WASM artifact is stale or modified; run npm run wasm:build and commit both binaries plus manifest',
    );
  return { binary: relative(root, binary), ...actual };
}
