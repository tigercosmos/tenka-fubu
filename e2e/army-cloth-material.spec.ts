import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';

test('painted army cloth has a non-vacuous mid battle view without changing campaign state', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('operational'));
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
  const observed = await page.evaluate(() => {
    const canvas = document
      .querySelector('[data-testid="map-canvas-host"] canvas')!
      .getBoundingClientRect();
    return {
      diagnostics: window.__tenka.debug.getMapDiagnostics(),
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    };
  });
  writeFileSync(
    info.outputPath('army-cloth-mid-observation.json'),
    JSON.stringify({ observed }, null, 2),
  );
  await page.screenshot({ path: info.outputPath('army-cloth-mid-scene.png') });
  expect(observed.diagnostics.lodStage).toBe('mid');
  expect(
    observed.diagnostics.armyRendering.signals.filter((signal) => signal.painted && signal.visible)
      .length,
  ).toBeGreaterThan(0);
  expect(observed.state).toBe(initial.state);
  expect(observed.commands).toBe(initial.commands);
});
