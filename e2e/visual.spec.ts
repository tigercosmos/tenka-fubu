import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
declare global {
  interface Window {
    __tenka: { debug: TenkaDebugApi };
    __contextLosses?: number;
  }
}
const CAMERA_PRESETS = ['overview', 'operational', 'close'] as const;

async function bootMap(page: Page): Promise<void> {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        try {
          await (window as DebugWindow).__tenka.debug.waitMapIdle();
          return true;
        } catch {
          return false;
        }
      }),
    )
    .toBe(true);
}

test.describe('M6-V11 visual quality gates', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('three camera baselines preserve small visual details', async ({ page }, testInfo) => {
    for (const preset of CAMERA_PRESETS) {
      const baseline = testInfo.snapshotPath(`strategy-${preset}.png`);
      if (process.env.UPDATE_VISUAL !== '1') {
        expect(existsSync(baseline), `Missing required visual baseline: ${baseline}`).toBe(true);
      }
    }
    await bootMap(page);
    for (const preset of CAMERA_PRESETS) {
      await page.evaluate(
        (p) => (window as DebugWindow).__tenka.debug.setMapCameraPreset(p),
        preset,
      );
      await expect.soft(page).toHaveScreenshot(`strategy-${preset}.png`, {
        maxDiffPixels: 100,
        threshold: 0.15,
      });
    }
  });

  test('required renderer layers contain visible content at each LOD', async ({ page }) => {
    await bootMap(page);
    for (const preset of CAMERA_PRESETS) {
      await page.evaluate(
        (p) => (window as DebugWindow).__tenka.debug.setMapCameraPreset(p),
        preset,
      );
      const diagnostics = await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
      );
      expect(diagnostics.ready).toBe(true);
      for (const name of [
        'terrainBase',
        'territory',
        'roads',
        'nodeMarkers',
        'armies',
        // V9 moved castle labels into nameplates: province labels are overview-only.
        // docs/design/m6-v9-hud-readability.md §2.3; m6-v9b-map-plates.md §2.7.
        preset === 'overview' ? 'labels' : 'nameplates',
      ] as const) {
        expect(
          diagnostics.layers[name]?.children,
          `${preset}: ${name} has content`,
        ).toBeGreaterThan(0);
        expect(diagnostics.layers[name]?.visible, `${preset}: ${name} is visible`).toBe(true);
        expect(
          diagnostics.layers[name]?.visibleDrawables,
          `${preset}: ${name} draws visible content`,
        ).toBeGreaterThan(0);
        expect(diagnostics.layers[name]?.dirty, `${preset}: ${name} is idle`).toBe(false);
      }
    }
  });

  test('zoom cycles and renderer remount preserve resource counts without context loss', async ({
    page,
  }, testInfo) => {
    if (process.env.VISUAL_HEAP === '1') test.setTimeout(180_000);
    await bootMap(page);
    const control = page.getByTestId('layer-control');
    await control.locator('summary').click();
    await control.locator('input[value="faction"]').check();
    await page.evaluate(() => window.__tenka.debug.waitMapIdle());
    const cdp = await page.context().newCDPSession(page);
    const heapSamples: number[] = [];
    const sampleHeap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      heapSamples.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
    };
    const snapshotHeap = async (name: string) => {
      const chunks: string[] = [];
      const collect = ({ chunk }: { chunk: string }) => chunks.push(chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', collect);
      try {
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        const source = chunks.join('');
        if (process.env.VISUAL_HEAP === '1')
          await writeFile(testInfo.outputPath(`${name}.heapsnapshot`), source);
        const snapshot = JSON.parse(source) as {
          snapshot: { meta: { node_fields: string[]; edge_fields: string[] } };
          nodes: number[];
          edges: number[];
          strings: string[];
        };
        const fields = snapshot.snapshot.meta.node_fields;
        const nameIndex = fields.indexOf('name');
        let fontAtlasCanvases = 0;
        let canvas2dContexts = 0;
        let bitmapTexts = 0;
        const edgeFields = snapshot.snapshot.meta.edge_fields;
        const edgeCountIndex = fields.indexOf('edge_count');
        const edgeNameIndex = edgeFields.indexOf('name_or_index');
        const edgeTargetIndex = edgeFields.indexOf('to_node');
        let edgeOffset = 0;
        for (let index = 0; index < snapshot.nodes.length; index += fields.length) {
          const nodeName = snapshot.strings[snapshot.nodes[index + nameIndex]!];
          if (nodeName === '<canvas width="512" height="512">') fontAtlasCanvases += 1;
          if (nodeName === 'CanvasRenderingContext2D') canvas2dContexts += 1;
          for (let edge = 0; edge < snapshot.nodes[index + edgeCountIndex]!; edge += 1) {
            const offset = edgeOffset + edge * edgeFields.length;
            const target = snapshot.edges[offset + edgeTargetIndex]!;
            if (
              snapshot.strings[snapshot.edges[offset + edgeNameIndex]!] === 'renderPipeId' &&
              snapshot.strings[snapshot.nodes[target + nameIndex]!] === 'bitmapText'
            )
              bitmapTexts += 1;
          }
          edgeOffset += snapshot.nodes[index + edgeCountIndex]! * edgeFields.length;
        }
        return { fontAtlasCanvases, canvas2dContexts, bitmapTexts };
      } finally {
        cdp.off('HeapProfiler.addHeapSnapshotChunk', collect);
      }
    };
    await page.evaluate(() => {
      const target = window as Window & { __contextLosses?: number };
      target.__contextLosses = 0;
      document.addEventListener(
        'webglcontextlost',
        () => {
          target.__contextLosses! += 1;
        },
        true,
      );
    });
    const before = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().resources,
    );
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await page.evaluate(async () => {
        await (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview');
        await (window as DebugWindow).__tenka.debug.setMapCameraPreset('close');
      });
    }
    {
      const warmupCount = process.env.VISUAL_HEAP === '1' ? 10 : 2;
      for (let cycle = 0; cycle < warmupCount; cycle += 1) {
        await page.evaluate(() => window.__tenka.debug.remountMap());
        await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
      }
    }
    const cacheBefore = await snapshotHeap('before-remounts');
    await sampleHeap();
    const remountCount = process.env.VISUAL_HEAP === '1' ? 20 : 10;
    for (let cycle = 0; cycle < remountCount; cycle += 1) {
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.remountMap());
      await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
      await expect(page.getByTestId('map-canvas-host').locator('canvas')).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(() => (window as DebugWindow).__tenka.debug.getMapDiagnostics().resources),
        )
        .toEqual(before);
      await sampleHeap();
    }
    const cacheAfter = await snapshotHeap('after-remounts');
    expect(cacheAfter, 'Global font atlas and canvas caches stay bounded across remounts').toEqual(
      cacheBefore,
    );
    const heapPath = testInfo.outputPath('remount-heap-samples.json');
    await writeFile(
      heapPath,
      JSON.stringify(
        { mode: 'faction', resources: before, cacheBefore, cacheAfter, usedHeapBytes: heapSamples },
        null,
        2,
      ),
    );
    await testInfo.attach('remount-heap-samples.json', {
      path: heapPath,
      contentType: 'application/json',
    });
    await cdp.detach();
    expect(
      await page.evaluate(() => (window as Window & { __contextLosses: number }).__contextLosses),
    ).toBe(0);
  });

  test('analysis modes render visible overlays without changing GameState', async ({
    page,
  }, testInfo) => {
    await bootMap(page);
    const before = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
    const control = page.getByTestId('layer-control');
    await control.locator('summary').click();
    const feedback: { mode: string; durationMs: number }[] = [];
    for (const mode of ['faction', 'supply', 'roadCapacity', 'terrainAdvantage', 'castleDefense']) {
      const durationMs = await page.evaluate(async (nextMode) => {
        const input = document.querySelector<HTMLInputElement>(
          `[data-testid="layer-control"] input[value="${nextMode}"]`,
        );
        if (!input) throw new Error(`Missing mode radio: ${nextMode}`);
        const started = performance.now();
        input.click();
        while (window.__tenka.debug.getMapDiagnostics().analysisMode !== nextMode) {
          if (performance.now() - started > 1000)
            throw new Error(`Mode feedback timed out: ${nextMode}`);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        return performance.now() - started;
      }, mode);
      feedback.push({ mode, durationMs });
      if (process.env.VISUAL_PERF === '1')
        expect(durationMs, `${mode}: feedback latency`).toBeLessThan(100);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle());
      const diagnostics = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
      expect(diagnostics.analysisMode).toBe(mode);
      expect(diagnostics.layers.analysisOverlay?.visibleDrawables).toBeGreaterThan(0);
      await expect(page.getByTestId('analysis-legend')).toBeVisible();
    }
    await control.locator('input[value="none"]').check();
    await expect(page.getByTestId('analysis-legend')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(before);
    const feedbackPath = testInfo.outputPath('analysis-feedback.json');
    await writeFile(feedbackPath, JSON.stringify(feedback, null, 2));
    await testInfo.attach('analysis-feedback.json', {
      path: feedbackPath,
      contentType: 'application/json',
    });
  });

  test('grayscale readability artifact for manual shape and line-style review', async ({
    page,
  }, testInfo) => {
    await bootMap(page);
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('operational'));
    await page.getByTestId('screen-strategy').evaluate((element) => {
      (element as HTMLElement).style.filter = 'grayscale(1)';
    });
    const artifact = testInfo.outputPath('strategy-operational-grayscale.png');
    await page.screenshot({ path: artifact, animations: 'disabled' });
    await testInfo.attach('grayscale-readability', { path: artifact, contentType: 'image/png' });
  });

  test('HUD keyboard focus is visible and enabled buttons have readable contrast', async ({
    page,
  }) => {
    await bootMap(page);
    await page.locator('button:enabled').first().focus();
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
        shadow: style.boxShadow,
      };
    });
    expect(focus?.tag).toBe('BUTTON');
    expect(
      (focus?.outline !== 'none' && (focus?.width ?? 0) >= 2) || focus?.shadow !== 'none',
    ).toBe(true);
    const failures = await page.getByRole('button').evaluateAll((buttons) => {
      const luminance = (color: string): number => {
        const channels =
          color
            .match(/[\d.]+/g)
            ?.slice(0, 3)
            .map(Number) ?? [];
        const linear = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      };
      return buttons.flatMap((button) => {
        if (
          !(button instanceof HTMLButtonElement) ||
          button.disabled ||
          !button.textContent?.trim()
        )
          return [];
        const style = getComputedStyle(button);
        let parent: Element | null = button;
        let background = style.backgroundColor;
        while (parent && (background === 'rgba(0, 0, 0, 0)' || background === 'transparent')) {
          parent = parent.parentElement;
          if (parent) background = getComputedStyle(parent).backgroundColor;
        }
        const foreground = luminance(style.color);
        const backdrop = luminance(background);
        const ratio =
          (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
        return ratio < 4.5 ? [{ label: button.textContent.trim(), ratio }] : [];
      });
    });
    expect(failures).toEqual([]);
    const control = page.getByTestId('layer-control');
    await control.locator('summary').focus();
    await page.keyboard.press('Space');
    await expect(control.locator('details')).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(control.locator('details')).not.toHaveAttribute('open', '');
    await control.locator('summary').click();
    const targets = await control.locator('summary, fieldset label').evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent, width: bounds.width, height: bounds.height };
      }),
    );
    for (const target of targets) {
      expect(target.width, `${target.text}: hit width`).toBeGreaterThanOrEqual(32);
      expect(target.height, `${target.text}: hit height`).toBeGreaterThanOrEqual(32);
    }
  });

  test('1080p / 20 moving armies / 30-second camera workload', async ({ page }, testInfo) => {
    test.skip(
      process.env.VISUAL_PERF !== '1',
      'Run VISUAL_PERF=1 on a reference GPU host; CI software rasterization is not a hardware FPS gate.',
    );
    await page.setViewportSize({ width: 1920, height: 1080 });
    await bootMap(page);
    const environment = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      if (!(
        context instanceof WebGLRenderingContext || context instanceof WebGL2RenderingContext
      )) {
        return { userAgent: navigator.userAgent, renderer: 'unavailable' };
      }
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      return {
        userAgent: navigator.userAgent,
        renderer: extension
          ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
          : String(context.getParameter(context.RENDERER)),
        vendor: extension
          ? String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL))
          : String(context.getParameter(context.VENDOR)),
      };
    });
    const result = await page.evaluate(() =>
      (window as DebugWindow).__tenka.debug.measureMapFrames(),
    );
    const measurementPath = testInfo.outputPath('frame-measurement.json');
    await writeFile(measurementPath, JSON.stringify({ environment, ...result }, null, 2));
    await testInfo.attach('frame-measurement.json', {
      path: measurementPath,
      contentType: 'application/json',
    });
    expect(result.armyCount).toBe(20);
    expect(result.durationMs).toBeGreaterThanOrEqual(30_000);
    expect(result.fpsP95).toBeGreaterThanOrEqual(55);
    expect(result.frameTimeP95).toBeLessThanOrEqual(1000 / 55);
    expect(result.resourcesAfter).toEqual(result.resourcesBefore);
  });
});
