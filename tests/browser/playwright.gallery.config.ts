import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: '*.pw.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  globalTimeout: 5 * 60_000,
  outputDir: join(tmpdir(), 'tenka-component-gallery-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: join(tmpdir(), 'tenka-component-gallery-report') }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: { headless: true },
    baseURL: 'http://127.0.0.1:4181',
    viewport: { width: 1280, height: 720 },
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4181 --strictPort',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: false,
  },
  projects: [{ name: 'gallery-chromium', use: { browserName: 'chromium' } }],
});
