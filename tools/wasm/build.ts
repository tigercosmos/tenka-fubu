import { copyFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { artifactManifest, verifyArtifact, WASM_TARGET, WASM_PROFILE } from './artifact';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
try {
  if (mode === '--check') {
    const manifest = verifyArtifact(root);
    console.log(`WASM artifact is current: ${manifest.wasmSha256}`);
  } else if (mode === '--build') {
    const crate = join(root, 'rust/engine');
    const result = spawnSync(
      'cargo',
      [
        `+${readFileSync(join(crate, 'rust-toolchain.toml'), 'utf8').match(/^channel\s*=\s*"([^"]+)"/m)?.[1]}`,
        'build',
        '--locked',
        '--target',
        WASM_TARGET,
        `--${WASM_PROFILE}`,
      ],
      {
        cwd: crate,
        stdio: 'inherit',
        env: {
          ...process.env,
          CARGO_TARGET_DIR: join(crate, 'target'),
          CARGO_INCREMENTAL: '0',
          CARGO_ENCODED_RUSTFLAGS: `--remap-path-prefix=${crate}=tenka-engine`,
        },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Rust WASM build failed with status ${String(result.status)}`);
    const binary = join(root, 'public/wasm/tenka_engine.wasm');
    mkdirSync(dirname(binary), { recursive: true });
    copyFileSync(join(crate, 'target', WASM_TARGET, WASM_PROFILE, 'tenka_engine.wasm'), binary);
    chmodSync(binary, 0o644);
    const manifest = artifactManifest(root, readFileSync(binary));
    writeFileSync(
      join(root, 'public/wasm/manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    console.log(`Built Rust WASM: ${manifest.wasmSha256}`);
  } else throw new Error('Usage: tsx tools/wasm/build.ts --check|--build');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
