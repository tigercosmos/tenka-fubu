import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { validateState } from '../src/core/state/invariants';

// Isolated presentation observation, not an earned campaign or art-acceptance gate.
// The independent helper certifies actual projected triangles and paired pixels later.
test('shared terrain projection captures six national-game poses', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
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
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  const poses = [
    {
      key: 'hida-far',
      preset: 'overview',
      focus: { x: 2130, y: 2613 },
      stage: 'far',
    },
    {
      key: 'hida-mid',
      preset: 'operational',
      focus: { x: 2130, y: 2613 },
      stage: 'mid',
    },
    {
      key: 'hida-near',
      preset: 'close',
      focus: { x: 2130, y: 2613 },
      stage: 'near',
    },
    {
      key: 'suzuka-near',
      preset: 'close',
      focus: { x: 1855.5, y: 2886.5 },
      stage: 'near',
    },
    {
      key: 'sunpu-mid',
      preset: 'operational',
      focus: { x: 2427, y: 2984 },
      stage: 'mid',
    },
    // Original overview preset center; no minimap recenter and no mini-campaign fixture.
    { key: 'national-far', preset: 'overview', focus: null, stage: 'far' },
  ] as const;
  const observations = [];
  for (const pose of poses) {
    await page.evaluate((preset) => window.__tenka.debug.setMapCameraPreset(preset), pose.preset);
    if (pose.focus !== null) {
      const mini = page.getByTestId('minimap-frame');
      const box = await mini.boundingBox();
      if (box === null) throw new Error('Actual minimap has no visible pointer hit box');
      await mini.click({
        position: {
          x: (pose.focus.x / 4096) * box.width,
          y: (pose.focus.y / 4096) * box.height,
        },
      });
      // Actual minimap navigation deliberately focuses at scale 1.5. Restore the
      // requested LOD with real wheel events (sign-only x1.1 steps), not a fake pose.
      const canvas = page.locator('[data-testid="map-canvas-host"] canvas');
      const canvasBox = await canvas.boundingBox();
      if (!canvasBox) throw new Error('Missing actual map canvas');
      await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      const ticks = pose.stage === 'far' ? 19 : pose.stage === 'mid' ? 12 : 2;
      for (let tick = 0; tick < ticks; tick++) await page.mouse.wheel(0, 1);
    }
    let previous = '',
      stable = 0;
    await expect
      .poll(async () => {
        const next = await page.evaluate(() =>
          JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
        );
        stable = next === previous ? stable + 1 : 0;
        previous = next;
        return stable;
      })
      .toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const actual = await page.evaluate(() => {
      const diagnostics = window.__tenka.debug.getMapDiagnostics();
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')
        ?.getBoundingClientRect();
      const lake = diagnostics.waterRendering.lakes[0];
      if (canvas === undefined || lake === undefined)
        throw new Error('Missing actual projection anchors');
      const other = lake.worldPoints.findIndex((point) => point.x !== lake.worldPoints[0]!.x);
      if (other < 0) throw new Error('Degenerate actual lake projection');
      const scale =
        (lake.points[other]!.x - lake.points[0]!.x) /
        (lake.worldPoints[other]!.x - lake.worldPoints[0]!.x);
      return {
        diagnostics,
        transform: {
          scale,
          x: lake.points[0]!.x - lake.worldPoints[0]!.x * scale,
          y: lake.points[0]!.y - lake.worldPoints[0]!.y * scale,
        },
        canvas: {
          x: canvas.x,
          y: canvas.y,
          width: canvas.width,
          height: canvas.height,
        },
        state: JSON.stringify(window.__tenka.debug.getState()),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
        stateForValidation: window.__tenka.debug.getState(),
        fonts: document.fonts.status,
      };
    });
    const record = { pose, actual };
    observations.push(record);
    writeFileSync(info.outputPath(`${pose.key}.json`), JSON.stringify(record, null, 2));
    await info.attach(pose.key, {
      body: JSON.stringify(record),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath(`${pose.key}.png`) });
  }
  // Keep every view and its raw geometry before a structural or behavioral assertion.
  for (const { pose, actual } of observations) {
    expect(actual.state).toBe(initial.state);
    expect(actual.commands).toBe(initial.commands);
    expect(validateState(actual.stateForValidation)).toEqual([]);
    expect(actual.diagnostics.lodStage).toBe(pose.stage);
    expect(actual.diagnostics.elevationRendering.error).toBeNull();
    expect(actual.diagnostics.elevationRendering.active).toBe(true);
    expect(actual.diagnostics.elevationRendering.surface?.ownedMeshes).toBe(1);
    expect(actual.diagnostics.elevationRendering.surface?.bufferBytes).toBe(1966080);
    expect(actual.diagnostics.elevationRendering.territory?.ownedMeshes).toBe(1);
    expect(actual.diagnostics.elevationRendering.territory?.ownedBuffers).toBe(3);
    expect(actual.diagnostics.elevationRendering.territory?.bufferBytes).toBe(462864);
    expect(actual.diagnostics.elevationRendering.territoryAlpha).toBe(
      pose.stage === 'far' ? 0.3 : 0.1,
    );
    expect(actual.diagnostics.elevationRendering.canopy?.ownedMeshes).toBe(10);
    expect(actual.diagnostics.elevationRendering.canopy?.bufferBytes).toBe(50220);
    expect(actual.diagnostics.elevationRendering.foothillCanopy).toMatchObject({
      ownedMeshes: 1,
      ownedGeometries: 1,
      ownedBuffers: 2,
      ownedShaders: 1,
      ownedPrograms: 1,
      ownedTextures: 0,
      ownedSources: 0,
      ownedMasks: 0,
      ownedFilters: 0,
      ownedFramebuffers: 0,
      bufferBytes: 792600,
    });
    expect(actual.diagnostics.elevationRendering.foothillCanopy?.positiveVertices).toBeGreaterThan(
      0,
    );
    expect(actual.fonts).toBe('loaded');
    expect(Number.isFinite(actual.transform.scale) && actual.transform.scale > 0).toBe(true);
    expect(Number.isFinite(actual.transform.x) && Number.isFinite(actual.transform.y)).toBe(true);
    expect(actual.diagnostics.coastRendering.displayPolygons).toEqual(
      actual.diagnostics.coastRendering.groundClipPolygons,
    );
  }
  // Real keyboard mode changes must retain a strong ownership analysis and
  // restore the normal map without a simulation command or geometry replacement.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (const mode of ['faction', 'none'] as const) {
    await page.keyboard.press('Alt+1');
    await expect
      .poll(() => page.evaluate(() => window.__tenka.debug.getMapDiagnostics().analysisMode))
      .toBe(mode);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const actual = await page.evaluate(() => ({
      diagnostics: window.__tenka.debug.getMapDiagnostics(),
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }));
    writeFileSync(info.outputPath(`ownership-${mode}.json`), JSON.stringify(actual, null, 2));
    await page.screenshot({ path: info.outputPath(`ownership-${mode}.png`) });
    expect(actual.state).toBe(initial.state);
    expect(actual.commands).toBe(initial.commands);
    expect(actual.diagnostics.elevationRendering.territoryAlpha).toBe(
      mode === 'faction' ? 0.68 : 0.3,
    );
    expect(actual.diagnostics.elevationRendering.territory?.bufferBytes).toBe(462864);
    // The analysis mesh is deliberately cached across toggles; hidden is not
    // destroyed. Verify its actual ownership separately from presented paint.
    expect(actual.diagnostics.elevationRendering.analysis?.ownedMeshes).toBe(1);
    const analysisLayer = actual.diagnostics.layers.analysisOverlay;
    if (!analysisLayer) throw new Error('Missing actual analysis presentation layer');
    if (mode === 'faction') expect(analysisLayer.visibleDrawables).toBeGreaterThan(0);
    else expect(analysisLayer.visibleDrawables).toBe(0);
  }
  expect(errors).toEqual([]);
});
