import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/** The strategy DOM can appear before MapCanvasHost finishes renderer initialization. */
export async function waitForMapReady(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.__tenka.debug.getMapDiagnostics().ready;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes('__TENKA_DEBUG__: map renderer 尚未掛載')
          )
            return false;
          throw error;
        }
      }),
    )
    .toBe(true);
}
