// Vite 設定（規格：plan/01-architecture.md §3.7.2）。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function pixiPatchOptimizerIdentity(manifest: string | Uint8Array): string {
  return `pixi-local-patch-${createHash('sha256').update(manifest).digest('hex')}`;
}

const pixiPatchManifest = readFileSync(
  new URL('./tools/dependencies/pixi-8.19-patch.json', import.meta.url),
);

export default defineConfig({
  base: process.env.VITE_BASE ?? '/', // GH Pages 子路徑由 CI 注入（§3.8.2）
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      // Vite hashes optimizer plugin names. Local patches are not represented by
      // the unchanged package version/lockfile, so include their manifest digest.
      // This plugin transforms nothing; ordinary Vite cache validation stays active.
      // Restart Vite after changing the patch manifest to load its new identity.
      plugins: [{ name: pixiPatchOptimizerIdentity(pixiPatchManifest), setup() {} }],
    },
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)),
    },
  },
  build: {
    manifest: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pixi': ['pixi.js'],
        },
      },
    },
  },
});
