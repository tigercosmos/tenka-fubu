import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../../playwright.config';

afterEach(() => vi.unstubAllEnvs());

describe('direct headless browser defaults (configuration contracts)', () => {
  it('keeps browser windows and automatic HTML reports closed', () => {
    expect(config.use?.headless).toBe(true);
    expect(config.reporter).toContainEqual(['html', { open: 'never' }]);
  });

  it.runIf(process.platform === 'darwin')(
    'uses the verified full headless Chromium renderer on macOS without an opt-in flag',
    async () => {
      vi.stubEnv('VISUAL_GPU', '');
      vi.resetModules();
      const defaults = (await import('../../playwright.config')).default;
      const browser = defaults.projects?.find((project) => project.name === 'chromium')?.use;
      expect(browser?.channel).toBe('chromium');
      expect(browser?.headless).toBe(true);
      expect(browser?.launchOptions?.headless).toBe(true);
      expect(browser?.launchOptions?.args).toContain('--use-angle=metal');
    },
  );

  it('retains screenshot, trace and deadline controls', () => {
    expect(config.timeout).toBe(60_000);
    expect(config.globalTimeout).toBe(300_000);
    expect(config.expect?.toHaveScreenshot?.maxDiffPixels).toBe(100);
    expect(config.retries).toBe(process.env.CI ? 1 : 0);
    expect(config.use?.trace).toBe('on-first-retry');
  });
});
