import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/** Native pointer coordinates come from the actual rendered anchor, not canvas center. */
export async function clickRenderedMapAnchor(page: Page, kind: 'castle' | 'army', id: string) {
  let prior: { x: number; y: number } | null = null;
  let stable = 0;
  let anchor: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        const current = await page.evaluate(
          ({ kind, id }) => {
            const data = window.__tenka.debug.getMapDiagnostics();
            if (kind === 'castle')
              return data.castleRendering.nodes.find((node) => node.id === id)?.anchor ?? null;
            return (
              data.armyRendering.signals.find((signal) => signal.id === id && signal.visible)
                ?.anchor ?? null
            );
          },
          { kind, id },
        );
        if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.y)) {
          prior = null;
          stable = 0;
          return false;
        }
        stable =
          prior && Math.abs(current.x - prior.x) < 0.01 && Math.abs(current.y - prior.y) < 0.01
            ? stable + 1
            : 0;
        prior = current;
        anchor = current;
        return stable >= 3;
      },
      { intervals: [50], message: `actual ${kind} ${id} projection settles before pointer input` },
    )
    .toBe(true);
  const canvas = page.getByTestId('map-canvas-host').locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(anchor).not.toBeNull();
  expect(anchor!.x).toBeGreaterThan(0);
  expect(anchor!.y).toBeGreaterThan(0);
  expect(anchor!.x).toBeLessThan(box!.width);
  expect(anchor!.y).toBeLessThan(box!.height);
  // Diagnostics are canvas-local CSS; native mouse uses page CSS.
  await page.mouse.click(box!.x + anchor!.x, box!.y + anchor!.y);
}
