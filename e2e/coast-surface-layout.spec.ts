import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Point = { x: number; y: number };
type Polygon = { id: string; points: number[] };
const sourceFiles = ['../src/data/map/japan-outline.json', '../src/data/map/terrain.json'].map(
  (path) => new URL(path, import.meta.url),
);
const sourceHashes = () =>
  sourceFiles.map((path) => createHash('sha256').update(readFileSync(path)).digest('hex'));
const canonical = JSON.parse(readFileSync(sourceFiles[0]!, 'utf8')) as { polygons: Polygon[] };
const terrain = JSON.parse(readFileSync(sourceFiles[1]!, 'utf8')) as {
  rivers: { id: string; points: number[] }[];
};
const target = { x: 2055, y: 2953 };
const points = (flat: readonly number[]): Point[] =>
  Array.from({ length: flat.length / 2 }, (_, index) => ({
    x: flat[index * 2]!,
    y: flat[index * 2 + 1]!,
  }));
function inside(p: Point, polygon: readonly Point[]) {
  let answer = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      answer = !answer;
  }
  return answer;
}
const land = (point: Point, polygons: Polygon[]) =>
  polygons.some((polygon) => inside(point, points(polygon.points)));
function localTurns(polygons: Polygon[]) {
  const polygon = points(polygons.find((entry) => entry.id === 'honshu')!.points);
  return polygon.flatMap((p, index) => {
    if (Math.hypot(p.x - target.x, p.y - target.y) > 24) return [];
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!,
      next = polygon[(index + 1) % polygon.length]!;
    const ax = p.x - previous.x,
      ay = p.y - previous.y,
      bx = next.x - p.x,
      by = next.y - p.y;
    if (Math.hypot(ax, ay) === 0 || Math.hypot(bx, by) === 0) return [];
    return [
      {
        point: p,
        degrees: (Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) * 180) / Math.PI,
      },
    ];
  });
}
function distanceToEdges(p: Point, polygon: Point[]) {
  return Math.min(
    ...polygon.map((a, index) => {
      const b = polygon[(index + 1) % polygon.length]!,
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    }),
  );
}
async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}
async function observe(page: Page) {
  return page.evaluate(() => (window as DebugWindow).__tenka.debug.getMapDiagnostics()) as Promise<
    ReturnType<TenkaDebugApi['getMapDiagnostics']> & {
      coastRendering: { displayPolygons: Polygon[]; groundClipPolygons: Polygon[] };
    }
  >;
}
async function scale(page: Page, value: 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog'),
    slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(value === 1.5 ? 'End' : 'Home');
  if (value === 1) for (let index = 0; index < 4; index++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}

test.describe('native display-only coastal surface', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('the named Ise inlet removes its abrupt turn while actual ground clipping, river anchors and gameplay stay aligned', async ({
    page,
  }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await idle(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState()),
      before = JSON.stringify(game),
      hashes = sourceHashes();
    const observations: Awaited<ReturnType<typeof observe>>[] = [];
    for (const value of [1, 1.5] as const) {
      await scale(page, value);
      for (const view of ['sunpu', 'ise-inlet']) {
        await page.evaluate(() =>
          (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'),
        );
        if (view === 'ise-inlet') {
          const minimap = page.getByTestId('minimap-frame'),
            bounds = await minimap.boundingBox();
          expect(bounds).not.toBeNull();
          await minimap.click({
            position: { x: (2040 / 4096) * bounds!.width, y: (3000 / 4096) * bounds!.height },
          });
        }
        await idle(page);
        const current = await observe(page);
        observations.push(current);
        // Raw geometry and the same-view image precede improvement assertions.
        await info.attach(`coast-raw-${view}-${value}`, {
          body: JSON.stringify({
            current,
            canonicalTurns: localTurns(canonical.polygons),
            displayTurns: localTurns(current.coastRendering.displayPolygons),
          }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`coast-${view}-${value}.png`) });
      }
    }
    expect(observations).toHaveLength(4);
    for (const current of observations) {
      const coast = current.coastRendering;
      const turns = localTurns(coast.displayPolygons);
      expect(turns.length).toBeGreaterThan(0);
      expect(
        Math.max(...turns.map((turn) => turn.degrees)),
        'actual emitted inlet curve has no abrupt local turn within24world of2055,2953',
      ).toBeLessThanOrEqual(30);
      expect(coast.groundClipPolygons).toEqual(coast.displayPolygons);
      expect(coast.displayPolygons).toEqual(observations[0]!.coastRendering.displayPolygons);
      const surface = coast.surface;
      expect(surface, 'actual national coastline admits its owned material').not.toBeNull();
      expect(surface!.ownedTextures).toBe(1);
      expect(surface!.ownedSources).toBe(1);
      expect(surface!.ownedGeometries).toBe(2);
      expect(surface!.atlasWidth).toBe(128);
      expect(surface!.atlasHeight).toBe(4);
      expect(surface!.rgbaBytes).toBe(2_048);
      expect(surface!.seaWidth).toBe(12);
      expect(surface!.landWidth).toBe(3);
      expect(surface!.inputVertices).toBe(
        coast.displayPolygons.reduce((sum, polygon) => sum + polygon.points.length / 2, 0),
      );
      expect(surface!.inputVertices).toBeLessThanOrEqual(4_096);
      expect(surface!.seaVertices).toBeGreaterThan(0);
      expect(surface!.landVertices).toBeGreaterThan(0);
      expect(surface!.seaIndices).toBeGreaterThan(0);
      expect(surface!.landIndices).toBeGreaterThan(0);
      // Two Float32 XY/UV attributes plus Uint32 triangle indices, measured
      // buffers rather than browser heap or an imported allocation helper.
      expect(surface!.geometryBytes).toBe(
        (surface!.seaVertices + surface!.landVertices) * 16 +
          (surface!.seaIndices + surface!.landIndices) * 4,
      );
      expect(surface!.geometryBytes).toBeLessThanOrEqual(1_212_416);
      expect(surface).toEqual(observations[0]!.coastRendering.surface);
      expect(current.resources.ownedCoastTextures).toBe(surface!.ownedTextures);
      expect(current.resources.ownedCoastSources).toBe(surface!.ownedSources);
      expect(current.resources.ownedCoastGeometries).toBe(surface!.ownedGeometries);
      expect(current.resources.coastRgbaBytes).toBe(surface!.rgbaBytes);
      expect(current.resources.coastGeometryBytes).toBe(surface!.geometryBytes);
    }
    const display = observations[0]!.coastRendering.displayPolygons;
    const rawHonshu = points(canonical.polygons.find((entry) => entry.id === 'honshu')!.points),
      displayHonshu = points(display.find((entry) => entry.id === 'honshu')!.points);
    for (const [a, b] of [
      [rawHonshu, displayHonshu],
      [displayHonshu, rawHonshu],
    ]) {
      for (let index = 0; index < a!.length; index++) {
        const start = a![index]!,
          end = a![(index + 1) % a!.length]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
        for (let step = 0; step <= steps; step++) {
          const point = {
            x: start.x + ((end.x - start.x) * step) / steps,
            y: start.y + ((end.y - start.y) * step) / steps,
          };
          if (Math.hypot(point.x - target.x, point.y - target.y) <= 36)
            expect(distanceToEdges(point, b!)).toBeLessThanOrEqual(12 + 1e-7);
        }
      }
    }
    for (const node of [...Object.values(game.castles), ...Object.values(game.districts)])
      expect(land(node.pos, display), `${node.id}: unchanged canonical land classification`).toBe(
        land(node.pos, canonical.polygons),
      );
    for (const river of terrain.rivers)
      for (const anchor of points(river.points))
        expect(
          land(anchor, display),
          `${river.id}: unchanged original river anchor classification`,
        ).toBe(land(anchor, canonical.polygons));
    const settled = await observe(page);
    await idle(page);
    expect((await observe(page)).coastRendering).toEqual(settled.coastRendering);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    const far = await observe(page);
    expect(far.lodStage).toBe('far');
    expect(far.coastRendering).toEqual(settled.coastRendering);
    await info.attach('coast-surface-overview-resources', {
      body: JSON.stringify({ coast: far.coastRendering, resources: far.resources }),
      contentType: 'application/json',
    });
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    expect(sourceHashes()).toEqual(hashes);
    expect(pageErrors, 'coast views and LOD transitions emit no pageerror').toEqual([]);
    // Actual emitted/clip geometry and screenshots, not opaque pixels. Core roads remain
    // in unchanged GameState; complete painted-road/bridge envelopes need the independent producer geometry tests.
  });
});
