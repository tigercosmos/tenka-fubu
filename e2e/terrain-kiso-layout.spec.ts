import { completeNewGameWizard } from './new-game-wizard';
import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';

test('Kiso original massif retains normal-game geography, cameras and static resources', async ({
  page,
}, info) => {
  const errors: string[] = [],
    responses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (
      response.ok() &&
      /terrain-mountain-(?:kiso-massif-v1|vertical-v5)\.png$/.test(response.url())
    )
      responses.push(response.url());
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
      position: { x: (2173.5 / 4096) * box.width, y: (2772 / 4096) * box.height },
    });
    // Minimap focus sets close zoom. Native wheel input must follow it,
    // or both named captures silently measure the same near LOD.
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
      const d = window.__tenka.debug.getMapDiagnostics();
      const r = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      return {
        diagnostics: d,
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
    const crop = {
      x: Math.floor(
        observed.canvas.x + lake.points[0]!.x + (2110 - lake.worldPoints[0]!.x) * scale,
      ),
      y: Math.floor(
        observed.canvas.y + lake.points[0]!.y + (2640 - lake.worldPoints[0]!.y) * scale,
      ),
      width: Math.ceil(125 * scale),
      height: Math.ceil(265 * scale),
    };
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1280);
    expect(crop.y + crop.height).toBeLessThanOrEqual(720);
    writeFileSync(
      info.outputPath(`kiso-${preset}-observation.json`),
      JSON.stringify({ preset, scale, crop, observed }, null, 2),
    );
    await page.screenshot({ path: info.outputPath(`kiso-${preset}-scene.png`) });
    await page.screenshot({ path: info.outputPath(`kiso-${preset}-mass.png`), clip: crop });
    // Both river flanks, entry, authored interior turns and exit stay in the review.
    for (const [name, worldX, worldY] of [
      ['entry', 2200, 2650],
      ['upper-turn', 2210, 2740],
      ['lower-turn', 2200, 2850],
      ['exit', 2205, 2890],
    ] as const) {
      const clip = {
        x: Math.floor(
          observed.canvas.x + lake.points[0]!.x + (worldX - 18 - lake.worldPoints[0]!.x) * scale,
        ),
        y: Math.floor(
          observed.canvas.y + lake.points[0]!.y + (worldY - 18 - lake.worldPoints[0]!.y) * scale,
        ),
        width: Math.ceil(36 * scale),
        height: Math.ceil(36 * scale),
      };
      await page.screenshot({ path: info.outputPath(`kiso-${preset}-${name}.png`), clip });
    }
    expect(await page.evaluate(() => window.__tenka.debug.setMapMountainHeroVisible(false))).toBe(
      true,
    );
    try {
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
      await page.screenshot({ path: info.outputPath(`kiso-${preset}-hero-off.png`) });
      expect(
        (await page.evaluate(() => window.__tenka.debug.getMapDiagnostics())).resources,
      ).toEqual(observed.diagnostics.resources);
    } finally {
      await page.evaluate(() => window.__tenka.debug.setMapMountainHeroVisible(true));
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    }
  }
  const expected =
    process.env.KISO_ASSET_BASELINE === '1'
      ? 'terrain-mountain-vertical-v5.png'
      : 'terrain-mountain-kiso-massif-v1.png';
  expect(
    responses.some((url) => url.endsWith(expected)),
    'Actual network admission; CPU tests separately verify the Kiso-only binding',
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => ({
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    })),
  ).toEqual(initial);
});
