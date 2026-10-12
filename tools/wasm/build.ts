import { copyFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  artifactManifest,
  verifyArtifact,
  WASM_TARGET,
  WASM_PROFILE,
  WASM_VARIANTS,
} from './artifact';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
try {
  if (mode === '--check') {
    const manifest = verifyArtifact(root);
    console.log(`WASM artifact is current: ${manifest.wasmSha256}`);
  } else if (mode === '--build') {
    const crate = join(root, 'rust/engine');
    const toolchain = readFileSync(join(crate, 'rust-toolchain.toml'), 'utf8').match(
      /^channel\s*=\s*"([^"]+)"/m,
    )?.[1];
    if (!toolchain) throw new Error('Missing pinned Rust toolchain');
    const target = spawnSync('rustup', ['target', 'add', '--toolchain', toolchain, WASM_TARGET], {
      cwd: crate,
      stdio: 'inherit',
    });
    if (target.error) throw target.error;
    if (target.status !== 0)
      throw new Error(`Rust WASM target setup failed with status ${String(target.status)}`);
    for (const variant of WASM_VARIANTS) {
      const args = [
        `+${toolchain}`,
        'build',
        '--locked',
        '--target',
        WASM_TARGET,
        `--${WASM_PROFILE}`,
      ];
      if (variant.features.length) args.push('--features', variant.features.join(','));
      const targetDirectory = join(crate, 'target', variant.name);
      const result = spawnSync('cargo', args, {
        cwd: crate,
        stdio: 'inherit',
        env: {
          ...process.env,
          CARGO_TARGET_DIR: targetDirectory,
          CARGO_INCREMENTAL: '0',
          CARGO_ENCODED_RUSTFLAGS: [
            `--remap-path-prefix=${crate}=tenka-engine`,
            '-Ctarget-feature=-simd128',
          ].join('\x1f'),
        },
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Rust ${variant.name} WASM build failed with status ${String(result.status)}`,
        );
      const destination = join(root, 'public/wasm', variant.file);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(
        join(targetDirectory, WASM_TARGET, WASM_PROFILE, 'tenka_engine.wasm'),
        destination,
      );
      chmodSync(destination, 0o644);
    }
    const binary = join(root, 'public/wasm/tenka_engine.wasm');
    const manifest = artifactManifest(root, readFileSync(binary));
    writeFileSync(
      join(root, 'public/wasm/manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    console.log(
      `Built Rust dual WASM: scalar=${manifest.variants.scalar?.wasmSha256} simd128=${manifest.variants.simd128?.wasmSha256}`,
    );
  } else throw new Error('Usage: tsx tools/wasm/build.ts --check|--build');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
