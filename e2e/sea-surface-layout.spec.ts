import { PNG } from 'pngjs';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
const crops = [
  { x: 560, y: 420, width: 160, height: 120 },
  { x: 790, y: 450, width: 180, height: 110 },
] as const;
type Point = { x: number; y: number };
function landDistance(point: Point, flat: number[]) {
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const ax = flat[j]!,
      ay = flat[j + 1]!,
      bx = flat[i]!,
      by = flat[i + 1]!;
    if (ay > point.y !== by > point.y && point.x < ((bx - ax) * (point.y - ay)) / (by - ay) + ax)
      inside = !inside;
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
    distance = Math.min(distance, Math.hypot(point.x - ax - dx * t, point.y - ay - dy * t));
  }
  return inside ? 0 : distance;
}

function measure(png: PNG, crop: (typeof crops)[number]) {
  const columns = new Array<number>(crop.width).fill(0);
  const rows = new Array<number>(crop.height).fill(0);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const offset = ((crop.y + y) * png.width + crop.x + x) * 4;
      const value = (png.data[offset]! + png.data[offset + 1]! + png.data[offset + 2]!) / 3;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      columns[x]! += value / crop.height;
      rows[y]! += value / crop.width;
    }
  }
  return {
    crop,
    range: maximum - minimum,
    columnRange: Math.max(...columns) - Math.min(...columns),
    rowRange: Math.max(...rows) - Math.min(...rows),
  };
}

test.describe('native static open-water material', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });
  test('open water has quiet two-dimensional variation, stays world-locked and does not change gameplay', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
    const minimap = page.getByTestId('minimap-frame');
    const bounds = await minimap.boundingBox();
    expect(bounds).not.toBeNull();
    await minimap.click({
      position: { x: (2040 / 4096) * bounds!.width, y: (3000 / 4096) * bounds!.height },
    });
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const scene = await page.evaluate(() => {
      const debug = (window as DebugWindow).__tenka.debug;
      const diagnostics = debug.getMapDiagnostics();
      const state = debug.getState();
      const canvas = document.querySelector('[data-testid="map-canvas-host"] canvas')!;
      const origin = canvas.getBoundingClientRect();
      return {
        diagnostics,
        origin: { x: origin.x, y: origin.y },
        anchors: diagnostics.castleRendering.nodes.map((node) => ({
          id: node.id,
          screen: node.anchor,
          world: Object.values(state.castles).find((castle) => castle.id === node.id)?.pos,
        })),
      };
    });
    const first = scene.anchors.find((node) => node.id === 'castle.narumi')!;
    const second = scene.anchors.find((node) => node.id === 'castle.kakegawa')!;
    expect(first?.world).toBeDefined();
    expect(second?.world).toBeDefined();
    const worldScale = (second.screen.x - first.screen.x) / (second.world!.x - first.world!.x);
    expect(worldScale).toBeGreaterThan(0);
    for (const crop of crops) {
      for (let y = crop.y; y <= crop.y + crop.height; y += 10) {
        for (let x = crop.x; x <= crop.x + crop.width; x += 10) {
          const world = {
            x: first.world!.x + (x - scene.origin.x - first.screen.x) / worldScale,
            y: first.world!.y + (y - scene.origin.y - first.screen.y) / worldScale,
          };
          for (const polygon of scene.diagnostics.coastRendering.displayPolygons)
            expect(
              landDistance(world, polygon.points),
              'sample stays outside shelf and land',
            ).toBeGreaterThan(24);
        }
      }
    }
    const screenshot = await page.screenshot({ path: info.outputPath('sea-ise-close.png') });
    const pixels = PNG.sync.read(screenshot);
    const observations = crops.map((crop) => measure(pixels, crop));
    await info.attach('open-water-crop-measurements', {
      body: JSON.stringify({ observations, scene }),
      contentType: 'application/json',
    });
    // Independent fixed open-water pixels: neither producer samples nor coastline/HUD pixels.
    for (const observation of observations) {
      expect(observation.range, 'visible variation instead of flat fill').toBeGreaterThanOrEqual(2);
      expect(observation.range, 'quiet water, not high-contrast noise').toBeLessThanOrEqual(18);
      expect(observation.columnRange, 'not horizontal bands').toBeGreaterThanOrEqual(0.5);
      expect(observation.rowRange, 'not vertical bands').toBeGreaterThanOrEqual(0.5);
    }
    expect(scene.diagnostics.seaRendering).not.toBeNull();
    expect(scene.diagnostics.resources.ownedSeaTextures).toBe(1);
    expect(scene.diagnostics.resources.ownedSeaSources).toBe(1);
    expect(scene.diagnostics.resources.seaRgbaBytes).toBe(1_048_576);
    const idle = await page.screenshot();
    expect(crops.map((crop) => measure(PNG.sync.read(idle), crop))).toEqual(observations);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
    await minimap.click({
      position: { x: (2040 / 4096) * bounds!.width, y: (3000 / 4096) * bounds!.height },
    });
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    const restored = await page.screenshot();
    expect(crops.map((crop) => measure(PNG.sync.read(restored), crop))).toEqual(observations);
    const after = await page.evaluate(() =>
      (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
    );
    expect(after.seaRendering).toEqual(scene.diagnostics.seaRendering);
    expect(after.resources).toEqual(scene.diagnostics.resources);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    expect(errors).toEqual([]);
  });
});
