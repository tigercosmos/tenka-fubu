import { completeNewGameWizard } from './new-game-wizard';
import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';

test('Akaishi unequal summits preserve normal-game river, roads and static resources', async ({
  page,
}, info) => {
  const errors: string[] = [],
    responses: string[] = [];
  const asset =
    process.env.AKAISHI_ASSET_BASELINE === '1'
      ? 'terrain-mountain-akaishi-massif-v1.png'
      : process.env.AKAISHI_ASSET_BASELINE === '2'
        ? 'terrain-mountain-akaishi-massif-v2.png'
        : 'terrain-mountain-akaishi-massif-v3.png';
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.ok() && response.url().endsWith(asset)) responses.push(response.url());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=15600519');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.__tenka.debug.getMapDiagnostics().ready;
        } catch {
          return false;
        }
      }),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  for (const preset of ['operational', 'close'] as const) {
    await page.evaluate((p) => window.__tenka.debug.setMapCameraPreset(p), preset);
    const mini = page.getByTestId('minimap-frame');
    const box = (await mini.boundingBox())!;
    await mini.click({
      position: {
        x: (2266.5 / 4096) * box.width,
        y: (2812.5 / 4096) * box.height,
      },
    });
    if (preset === 'operational') {
      await page.mouse.move(640, 360);
      for (let step = 0; step < 11; step++) await page.mouse.wheel(0, 120);
    }
    let prior = '',
      stable = 0;
    await expect
      .poll(async () => {
        const value = await page.evaluate(() =>
          JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
        );
        stable = value === prior ? stable + 1 : 0;
        prior = value;
        return stable;
      })
      .toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const observed = await page.evaluate(() => {
      const diagnostics = window.__tenka.debug.getMapDiagnostics();
      const r = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      return {
        diagnostics,
        canvas: { x: r.x, y: r.y, width: r.width, height: r.height },
        state: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      };
    });
    expect(observed.state).toBe(initial.state);
    expect(observed.commands).toBe(initial.commands);
    expect(observed.diagnostics.lodStage).toBe(preset === 'operational' ? 'mid' : 'near');
    expect(observed.diagnostics.resources.ownedMountainShadeTextures).toBe(14);
    const lake = observed.diagnostics.waterRendering.lakes[0]!;
    const i = lake.worldPoints.findIndex((p) => p.x !== lake.worldPoints[0]!.x);
    expect(i).toBeGreaterThan(0);
    const scale =
      (lake.points[i]!.x - lake.points[0]!.x) / (lake.worldPoints[i]!.x - lake.worldPoints[0]!.x);
    // Fixed complete authored Akaishi rectangle, including the western river contact.
    const crop = {
      x: Math.floor(
        observed.canvas.x + lake.points[0]!.x + (2188 - lake.worldPoints[0]!.x) * scale,
      ),
      y: Math.floor(
        observed.canvas.y + lake.points[0]!.y + (2675 - lake.worldPoints[0]!.y) * scale,
      ),
      width: Math.ceil(152 * scale),
      height: Math.ceil(275 * scale),
    };
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1280);
    expect(crop.y + crop.height).toBeLessThanOrEqual(720);
    writeFileSync(
      info.outputPath(`akaishi-${preset}-observation.json`),
      JSON.stringify({ preset, asset, scale, crop, observed }, null, 2),
    );
    await page.screenshot({ path: info.outputPath(`akaishi-${preset}-scene.png`) });
    await page.screenshot({ path: info.outputPath(`akaishi-${preset}-mass.png`), clip: crop });
  }
  expect(
    responses.length,
    'Actual network admission of the selected Akaishi asset',
  ).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
