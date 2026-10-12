import { completeNewGameWizard } from './new-game-wizard';
import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test.describe('national canonical-army renderer prerequisite (not live ×5 acceptance)', () => {
  test.describe.configure({ mode: 'serial' });
  for (const preset of ['overview', 'operational', 'close'] as const) {
    test(`${preset}: forty canonical armies and actual postrender cadence`, async ({
      page,
    }, info) => {
      test.skip(
        process.env.VISUAL_GPU !== '1' || process.env.VISUAL_PERF !== '1',
        'Requires an explicitly leased reference GPU host; software/headless discovery is not performance evidence.',
      );
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/?debug=1&seed=15600519');
      await page.getByTestId('title-newgame').click();
      await page.getByTestId('scenario-pick-s1560').click();
      await page.getByTestId('clan-pick-clan.oda').click();
      await completeNewGameWizard(page);
      await expect(page.getByTestId('screen-strategy')).toBeVisible();
      await page.getByTestId('speed-pause').click();
      const preparation = await page.evaluate(() => window.__tenka.debug.spawnArmies(40));
      expect(preparation.count).toBe(40);
      expect(preparation.commands).toBe(40);
      expect(new Set(preparation.armyRegions.map((army) => army.region)).size).toBe(9);
      await page.evaluate(async (camera) => {
        await document.fonts.ready;
        await window.__tenka.debug.setMapCameraPreset(camera);
        await window.__tenka.debug.waitMapIdle(3);
      }, preset);
      const before = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
      const environment = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        if (!(gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext))
          throw new Error('National reference measurement requires actual WebGL rendering');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          userAgent: navigator.userAgent,
          renderer: String(
            gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          ),
          vendor: String(gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
        };
      });
      expect(environment.renderer).not.toMatch(/swiftshader|llvmpipe|software/i);
      const measurement = await page.evaluate(
        (camera) => window.__tenka.debug.measureNationalMapFrames(camera, 30_000),
        preset,
      );
      const after = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
      const path = info.outputPath(`national-${preset}-frames.json`);
      await writeFile(path, JSON.stringify({ environment, preparation, measurement }, null, 2));
      await info.attach('raw-postrender-samples', { path, contentType: 'application/json' });
      await info.attach('actual-national-renderer', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      expect(after).toBe(before);
      expect(measurement.scope).toBe('canonical-armies/render-only-paused-prerequisite');
      expect(measurement.geography.regions).toHaveLength(9);
      expect(measurement.geography.castles).toBe(121);
      expect(measurement.geography.districts).toBe(344);
      expect(measurement.armyCount).toBe(40);
      expect(new Set(measurement.armyRegions.map((army) => army.region)).size).toBe(9);
      expect(measurement.visibilityMetric).toBe(
        'renderer-cull-visible-chips/not-GPU-presented-pixels',
      );
      expect(measurement.minMountedArmies).toBe(40);
      expect(measurement.minVisibleArmies).toBeGreaterThan(0);
      expect(measurement.durationMs).toBeGreaterThanOrEqual(30_000);
      expect(measurement.averageFps).toBeGreaterThanOrEqual(60);
      expect(measurement.slowFrameFps).toBeGreaterThanOrEqual(60);
      expect(measurement.frameTimeP95).toBeLessThanOrEqual(1000 / 60);
      expect(measurement.resourcesAfter).toEqual(measurement.resourcesBefore);
      expect(measurement.lodStage).toBe(
        { overview: 'far', operational: 'mid', close: 'near' }[preset],
      );
    });
  }
});
