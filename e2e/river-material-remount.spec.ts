import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const canonicalRiverIds = (
  JSON.parse(readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8')) as {
    rivers: { id: string }[];
  }
).rivers
  .map((river) => river.id)
  .sort();

async function capture(page: Page) {
  return page.evaluate(() => {
    const firstDiagnostics = window.__tenka.debug.getMapDiagnostics();
    const first = firstDiagnostics.riverRendering.materials;
    const firstJSON = JSON.stringify(first);
    const firstBoundsTrace = firstDiagnostics.riverRendering.boundsTrace;
    const firstBoundsTraceJSON = JSON.stringify(firstBoundsTrace);
    // This check happens in-browser BEFORE Playwright serializes the result.
    const boundsChecks = first.rivers.map((river) => {
      const halfWidth = ({ 1: 2, 2: 4, 3: 7 } as const)[river.widthClass] / 2;
      const xs = river.points.map((point) => point.x);
      const ys = river.points.map((point) => point.y);
      const expected = {
        x: Math.min(...xs) - halfWidth,
        y: Math.min(...ys) - halfWidth,
        width: Math.max(...xs) - Math.min(...xs) + 2 * halfWidth,
        height: Math.max(...ys) - Math.min(...ys) + 2 * halfWidth,
      };
      const actual = river.bounds;
      return {
        id: river.id,
        points: river.points,
        expected,
        actual,
        validInBrowser:
          actual !== null &&
          actual.x === expected.x &&
          actual.y === expected.y &&
          actual.width === expected.width &&
          actual.height === expected.height,
      };
    });
    const secondDiagnostics = window.__tenka.debug.getMapDiagnostics();
    const second = secondDiagnostics.riverRendering.materials;
    const secondJSON = JSON.stringify(second);
    const secondBoundsTrace = secondDiagnostics.riverRendering.boundsTrace;
    const secondBoundsTraceJSON = JSON.stringify(secondBoundsTrace);
    return {
      first,
      firstJSON,
      second,
      secondJSON,
      // Additive producer/retention/getter evidence from these exact invocations.
      // No trace field replaces or normalizes any original material assertion.
      firstBoundsTrace,
      firstBoundsTraceJSON,
      secondBoundsTrace,
      secondBoundsTraceJSON,
      browserEqual: firstJSON === secondJSON,
      firstUnchangedAfterFreshRead: firstJSON === JSON.stringify(first),
      boundsChecks,
      resources: firstDiagnostics.resources,
      secondResources: secondDiagnostics.resources,
      coreJSON: JSON.stringify(window.__tenka.debug.getState()),
      commandJSON: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    };
  });
}

// Six ordinary isolated contexts permit a six-worker reproduction of the historical
// full-suite anomaly. Ten real remounts each are a bounded diagnostic, not a soak,
// bank-pixel acceptance, GPU timing gate or proof an intermittent failure is fixed.
for (let isolation = 1; isolation <= 6; isolation++) {
  test(`river material transport isolation ${isolation}: ten real renderer remounts`, async ({
    page,
  }, info) => {
    const observations: { remount: number; value: Awaited<ReturnType<typeof capture>> }[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/?debug=visual-map');
      await expect(page.getByTestId('screen-strategy')).toBeVisible();
      await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(async () => {
        await document.fonts.ready;
        await window.__tenka.debug.setMapCameraPreset('close');
        await window.__tenka.debug.waitMapIdle(3);
      });
      const baseline = await capture(page);
      for (let remount = 0; remount <= 10; remount++) {
        if (remount > 0) {
          await page.evaluate(async () => {
            await window.__tenka.debug.remountMap();
            await window.__tenka.debug.setMapCameraPreset('close');
            await window.__tenka.debug.waitMapIdle(3);
          });
        }
        const value = remount === 0 ? baseline : await capture(page);
        observations.push({ remount, value });
        // Preserve browser JSON and structured transport before every assertion,
        // including failures. No snapshot is normalized to conceal a mismatch.
        await info.attach(`river-material-remount-${remount}`, {
          body: JSON.stringify({ isolation, remount, value, errors }),
          contentType: 'application/json',
        });
        expect(value.boundsChecks.map((check) => check.id)).toEqual(canonicalRiverIds);
        expect(value.boundsChecks.every((check) => check.validInBrowser)).toBe(true);
        expect(JSON.parse(value.firstJSON)).toEqual(value.first);
        expect(JSON.parse(value.secondJSON)).toEqual(value.second);
        expect(value.browserEqual).toBe(true);
        expect(value.firstUnchangedAfterFreshRead).toBe(true);
        expect(value.first).toEqual(value.second);
        expect(value.first).toEqual(baseline.first);
        expect(value.first).toMatchObject({
          ownedTextures: 10,
          ownedSources: 10,
          ownedStyleListeners: 10,
          rgbaBytes: 1_078_332,
        });
        expect(value.resources).toEqual(value.secondResources);
        expect(value.resources).toEqual(baseline.resources);
        expect(value.coreJSON).toBe(baseline.coreJSON);
        expect(value.commandJSON).toBe(baseline.commandJSON);
        expect(errors).toEqual([]);
      }
      expect(observations).toHaveLength(11);
    } finally {
      await info.attach('river-material-remount-diagnostic-summary', {
        body: JSON.stringify({
          isolation,
          completedObservations: observations.length,
          observations,
          errors,
        }),
        contentType: 'application/json',
      });
    }
  });
}
