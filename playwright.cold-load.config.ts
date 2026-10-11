import { defineConfig, devices } from '@playwright/test';
import { coldLoadBaseUrl } from './tools/perf/cold-load';

const external = process.env.COLD_LOAD_BASE_URL;
const baseURL = coldLoadBaseUrl(external);
export default defineConfig({
  testDir: './e2e',
  testMatch: 'cold-load.spec.ts',
  timeout: 60_000,
  globalTimeout: 300_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  metadata: { coldLoad: true },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  ...(external !== undefined
    ? {}
    : {
        webServer: {
          command: 'npm run preview -- --port 4181 --strictPort',
          url: baseURL,
          reuseExistingServer: false,
        },
      }),
  projects: [{ name: 'chromium' }],
});
