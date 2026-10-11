import { defineConfig, devices } from '@playwright/test';

// Explicit opt-in; this is never part of the ordinary short regression suite.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'national-soak.spec.ts',
  metadata: { nationalSoak: true },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 35 * 60_000,
  globalTimeout: 36 * 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1920, height: 1080 },
    headless: true,
    baseURL: 'http://localhost:4182',
    // A 30-minute full trace itself retains substantial diagnostic data.
    trace: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview -- --port 4182 --strictPort',
    url: 'http://localhost:4182',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium' }],
});
