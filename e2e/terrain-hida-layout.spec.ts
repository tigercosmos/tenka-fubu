import { test, expect } from './fixtures';
import { writeFileSync } from 'node:fs';

test('Hida original massif reference preserves national geography and static resources', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.ok() &&
      /terrain-mountain-(?:hida-massif-v2|vertical-v4)\.png$/.test(response.url())
    )
      responses.push(response.url());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=15600519');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.__tenka.debug.getMapDiagnostics().ready;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              '__TENKA_DEBUG__: map renderer 尚未掛載（尚未進入含地圖的畫面，如 MainScreen）'
          )
            return false;
          throw error;
        }
      }),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const before = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
  const mini = page.getByTestId('minimap-frame');
  const box = (await mini.boundingBox())!;
  await mini.click({ position: { x: (2130 / 4096) * box.width, y: (2613 / 4096) * box.height } });
  let previousCamera = '';
  let stableCameraSamples = 0;
  await expect
    .poll(async () => {
      const signature = await page.evaluate(() =>
        JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
      );
      stableCameraSamples = signature === previousCamera ? stableCameraSamples + 1 : 0;
      previousCamera = signature;
      return stableCameraSamples;
    })
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
  const observation = await page.evaluate(() => {
    const diagnostics = window.__tenka.debug.getMapDiagnostics();
    const canvas = document
      .querySelector('[data-testid="map-canvas-host"] canvas')!
      .getBoundingClientRect();
    return {
      diagnostics,
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    };
  });
  const lake = observation.diagnostics.waterRendering.lakes[0]!;
  const index = lake.worldPoints.findIndex((point) => point.x !== lake.worldPoints[0]!.x);
  expect(index).toBeGreaterThan(0);
  const scale =
    (lake.points[index]!.x - lake.points[0]!.x) /
    (lake.worldPoints[index]!.x - lake.worldPoints[0]!.x);
  const crop = {
    x: Math.floor(
      observation.canvas.x + lake.points[0]!.x + (2068 - 6 - lake.worldPoints[0]!.x) * scale,
    ),
    y: Math.floor(
      observation.canvas.y + lake.points[0]!.y + (2463 - 6 - lake.worldPoints[0]!.y) * scale,
    ),
    width: Math.ceil(136 * scale),
    height: Math.ceil(312 * scale),
  };
  await info.attach('hida-reference', {
    body: JSON.stringify({
      mass: { x: 2068, y: 2463, width: 124, height: 300 },
      scale,
      crop,
      observation,
      responses,
      errors,
    }),
    contentType: 'application/json',
  });
  writeFileSync(
    info.outputPath('hida-observation.json'),
    JSON.stringify(
      {
        mass: { x: 2068, y: 2463, width: 124, height: 300 },
        scale,
        crop,
        observation,
        responses,
        errors,
      },
      null,
      2,
    ),
  );
  expect(scale).toBeGreaterThan(0);
  expect(crop.x).toBeGreaterThanOrEqual(0);
  expect(crop.y).toBeGreaterThanOrEqual(0);
  expect(crop.x + crop.width).toBeLessThanOrEqual(1280);
  expect(crop.y + crop.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: info.outputPath('hida-full-scene.png') });
  await page.screenshot({ path: info.outputPath('hida-mass.png'), clip: crop });
  expect(observation.state).toBe(before.state);
  expect(observation.commands).toBe(before.commands);
  expect(observation.diagnostics.resources.ownedMountainShadeTextures).toBe(14);
  expect(observation.diagnostics.resources.ownedMountainShadeSources).toBe(14);
  expect(observation.diagnostics.resources.mountainShadeRgbaBytes).toBe(14 * 128 * 128 * 4);
  const expected =
    process.env.HIDA_REQUIRE_NEW_ASSET === '1'
      ? 'terrain-mountain-hida-massif-v2.png'
      : 'terrain-mountain-vertical-v4.png';
  expect(responses.some((url) => url.endsWith(expected))).toBe(true);
  expect(errors).toEqual([]);
});
