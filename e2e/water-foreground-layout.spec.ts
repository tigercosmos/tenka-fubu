import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Foreground = { id: string; kind: 'soldier' | 'signal'; rect: Rect };
type Materials = {
  ownedTextures: number;
  ownedSources: number;
  ownedStyleListeners: number;
  rgbaBytes: number;
  lakes: {
    id: string;
    width: number;
    height: number;
    rgbaBytes: number;
    kind: 'bankReflection' | 'solidFallback';
  }[];
};
const terrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { lakes: { id: string; polygon: number[] }[] };
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
async function diagnostics(page: Page) {
  return page.evaluate(() => (window as DebugWindow).__tenka.debug.getMapDiagnostics()) as Promise<
    ReturnType<TenkaDebugApi['getMapDiagnostics']> & {
      armyPlateLayout: { foregroundBodies?: Foreground[] };
      waterRendering: { materials?: Materials };
    }
  >;
}
async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}
async function boot(page: Page) {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await idle(page);
}
async function scale(page: Page, value: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(value === 1.5 ? 'End' : 'Home');
  if (value === 1) for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}
async function near(page: Page, id: string) {
  const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
  if (await context.count()) await context.locator('header button').click();
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
  if (id !== 'castle.sunpu') {
    const pos = await page.evaluate(
      (castleId) =>
        Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
          (entry) => entry.id === castleId,
        )!.pos,
      id,
    );
    await miniFocus(page, pos);
  }
  await idle(page);
}
async function miniFocus(page: Page, pos: Point) {
  const mini = page.getByTestId('minimap-frame'),
    box = await mini.boundingBox();
  expect(box).not.toBeNull();
  await mini.click({
    position: { x: (pos.x / 4096) * box!.width, y: (pos.y / 4096) * box!.height },
  });
  await idle(page);
}
function foregroundOf(d: Awaited<ReturnType<typeof diagnostics>>): Foreground[] {
  return [
    ...d.actorDepth.bodies
      .filter(
        (body) =>
          body.kind === 'army' &&
          body.visible &&
          body.rect &&
          body.rect.width > 0 &&
          body.rect.height > 0,
      )
      .map((body) => ({ id: body.id, kind: 'soldier' as const, rect: body.rect! })),
    ...d.armyRendering.signals
      .filter(
        (signal) =>
          signal.visible && signal.rect && signal.rect.width > 0 && signal.rect.height > 0,
      )
      .map((signal) => ({ id: signal.id, kind: 'signal' as const, rect: signal.rect! })),
  ];
}
function inside(p: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}
function edgeDistance(p: Point, polygon: Point[]) {
  return Math.min(
    ...polygon.map((a, i) => {
      const b = polygon[(i + 1) % polygon.length]!,
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

test.describe('native water material and mandatory foreground layout', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('three real renderer remounts keep lake sources and listeners live without stale texture errors', async ({
    page,
  }, info) => {
    let rejectFailure: (error: Error) => void = () => {};
    const failure = new Promise<never>((_, reject) => {
      rejectFailure = reject;
    });
    // An early browser event is still replayed into every awaited race; this
    // handler prevents an unhandled rejection before the first race is attached.
    void failure.catch(() => {});
    const onPageError = (error: Error) => rejectFailure(error);
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === 'error') rejectFailure(new Error(message.text()));
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    const bounded = async <T>(operation: Promise<T>, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: remount/idle did not settle within 10 seconds`)),
          10_000,
        );
      });
      try {
        return await Promise.race([operation, failure, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      await bounded(boot(page), 'initial map');
      const before = await diagnostics(page);
      const game = await page.evaluate(() =>
        JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
      );
      const checkResources = (material: Materials | undefined) => {
        expect(material).toBeDefined();
        expect(material!.ownedTextures).toBe(2);
        expect(material!.ownedSources).toBe(2);
        expect(material!.ownedStyleListeners).toBe(2);
        expect(material!.rgbaBytes).toBe(79_360);
      };
      checkResources(before.waterRendering.materials);
      for (let cycle = 1; cycle <= 3; cycle++) {
        await bounded(
          page.evaluate(() => (window as DebugWindow).__tenka.debug.remountMap()),
          `remount ${cycle}`,
        );
        await bounded(idle(page), `remount ${cycle} idle`);
        const current = await diagnostics(page);
        await info.attach(`water-remount-${cycle}`, {
          body: JSON.stringify(current.waterRendering),
          contentType: 'application/json',
        });
        expect(current.ready).toBe(true);
        checkResources(current.waterRendering.materials);
        expect(current.waterRendering.materials).toEqual(before.waterRendering.materials);
        const worldGeometry = (lakes: typeof current.waterRendering.lakes) =>
          lakes.map(({ id, originalBounds, worldPoints }) => ({ id, originalBounds, worldPoints }));
        expect(worldGeometry(current.waterRendering.lakes)).toEqual(
          worldGeometry(before.waterRendering.lakes),
        );
        expect(
          await page.evaluate(() =>
            JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
          ),
        ).toBe(game);
      }
    } finally {
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
    }
  });

  test('six unchanged focus views preserve castle clearance and reduce conditional soldier and signal interference', async ({
    page,
  }, info) => {
    await boot(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState()),
      before = JSON.stringify(game);
    let positiveBaseline = 0;
    const captures: {
      d: Awaited<ReturnType<typeof diagnostics>>;
      foreground: Foreground[];
      measurements: {
        id: string;
        baselineCastle: number;
        finalCastle: number;
        baselineForeground: number;
        finalForeground: number;
      }[];
    }[] = [];
    for (const value of [0.8, 1, 1.5] as const) {
      await scale(page, value);
      for (const id of ['castle.sunpu', 'castle.narumi']) {
        await near(page, id);
        const d = await diagnostics(page),
          foreground = foregroundOf(d),
          plates = d.armyPlateLayout.plates;
        const castleFrames = d.armyPlateLayout.castleBodies;
        const area = (rect: Rect, obstacles: { rect: Rect }[]) =>
          obstacles.reduce((sum, obstacle) => sum + overlap(rect, obstacle.rect), 0);
        const measurements = plates.map((plate) => ({
          id: plate.id,
          baselineCastle: area(plate.baseline, castleFrames),
          finalCastle: area(plate.rect, castleFrames),
          baselineForeground: area(plate.baseline, foreground),
          finalForeground: area(plate.rect, foreground),
        }));
        positiveBaseline += measurements.reduce((sum, m) => sum + m.baselineForeground, 0);
        // Capture old-built ACTUAL overlap before requiring the new diagnostic seam.
        await info.attach(`foreground-raw-${id}-${value}`, {
          body: JSON.stringify({ d, foreground, measurements }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`foreground-${id}-${value}.png`) });
        captures.push({ d, foreground, measurements });
        await idle(page);
        const settled = await diagnostics(page);
        expect(settled.armyPlateLayout.runs).toBe(d.armyPlateLayout.runs);
        expect(settled.armyPlateLayout.plates).toEqual(plates);
        // Actual occupied anchor remains an army hit, despite plate relocation.
        if (id === 'castle.narumi' && value === 1) {
          const army = Object.values(game.armies).find(
            (entry) => entry.leaderId === 'off.oda-nagahide',
          )!;
          const plate = plates.find((entry) => entry.id === army.id)!;
          const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
          expect(canvas).not.toBeNull();
          await page.mouse.click(canvas!.x + plate.anchor.x, canvas!.y + plate.anchor.y);
          await expect
            .poll(
              async () =>
                (await diagnostics(page)).armyPlateLayout.plates.find(
                  (entry) => entry.id === army.id,
                )?.selected,
            )
            .toBe(true);
          await expect(
            page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]'),
          ).toContainText('900人');
        }
      }
    }
    expect(captures).toHaveLength(6);
    // Behavioral checks run before new diagnostic-presence checks so the old
    // built renderer retains an independently measured failure, not just API RED.
    for (const { measurements } of captures) {
      for (const m of measurements) {
        expect(m.finalCastle).toBeLessThanOrEqual(m.baselineCastle + 1e-7);
        if (Math.abs(m.finalCastle - m.baselineCastle) <= 1e-7)
          expect(m.finalForeground).toBeLessThanOrEqual(m.baselineForeground + 1e-7);
      }
    }
    for (const { d, foreground } of captures) {
      expect(d.armyPlateLayout.foregroundBodies).toBeDefined();
      const sorted = (entries: Foreground[]) =>
        [...entries].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
      expect(sorted(d.armyPlateLayout.foregroundBodies)).toEqual(sorted(foreground));
      expect(foreground.some((entry) => entry.kind === 'soldier')).toBe(true);
      expect(foreground.some((entry) => entry.kind === 'signal')).toBe(true);
      for (const plate of d.armyPlateLayout.plates) {
        // HUD-aware information reflow uses an 80 CSS-pixel disk; model anchors stay fixed.
        expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
        expect(plate.rect.width).toBe(plate.baseline.width);
        expect(plate.rect.height).toBe(plate.baseline.height);
        expect(Object.values(plate.anchor).every(Number.isFinite)).toBe(true);
      }
    }
    expect(positiveBaseline).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    // Frame/Graphics envelopes, not opaque sprite pixels. Idle memo proof is not a normal-day proof.
  });

  test('actual Biwa and Hamana use bounded persistent two-dimensional material with visible interior variation', async ({
    page,
  }, info) => {
    await boot(page);
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    let initialMaterials: Materials | undefined;
    const observedMaterials: (Materials | undefined)[] = [];
    const bankObservations: {
      id: string;
      y: number;
      left: Point;
      center: Point;
      right: Point;
      bankLeft: number;
      middle: number;
      bankRight: number;
      widthWorld: number;
    }[] = [];
    for (const source of terrain.lakes) {
      const xs = source.polygon.filter((_, i) => i % 2 === 0),
        ys = source.polygon.filter((_, i) => i % 2 === 1);
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
      await miniFocus(page, {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      });
      const d = await diagnostics(page),
        lake = d.waterRendering.lakes.find((entry) => entry.id === source.id)!;
      const screenshot = await page.screenshot({
        path: info.outputPath(`water-material-${source.id}.png`),
      });
      await info.attach(`water-material-raw-${source.id}`, {
        body: JSON.stringify(d.waterRendering),
        contentType: 'application/json',
      });
      const material = d.waterRendering.materials;
      observedMaterials.push(material);
      if (initialMaterials) expect(material).toEqual(initialMaterials);
      else initialMaterials = material;
      const raw: Point[] = Array.from({ length: source.polygon.length / 2 }, (_, i) => ({
        x: source.polygon[i * 2]!,
        y: source.polygon[i * 2 + 1]!,
      }));
      for (const anchor of raw) expect(lake.worldPoints).toContainEqual(anchor);
      expect(lake.originalBounds).toEqual({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
      const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
      expect(canvas).not.toBeNull();
      const polygon = lake.points.map((point) => ({
        x: point.x + canvas!.x,
        y: point.y + canvas!.y,
      }));
      const cameraScale =
        Math.hypot(lake.points[1]!.x - lake.points[0]!.x, lake.points[1]!.y - lake.points[0]!.y) /
        Math.hypot(
          lake.worldPoints[1]!.x - lake.worldPoints[0]!.x,
          lake.worldPoints[1]!.y - lake.worldPoints[0]!.y,
        );
      const hud = await page
        .locator(
          '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="siege-overlay"], [data-testid="screen-strategy"] > div[aria-hidden="false"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        );
      const png = PNG.sync.read(screenshot),
        samples: { x: number; y: number; rgb: number[] }[] = [];
      for (
        let y = Math.max(0, Math.ceil(Math.min(...polygon.map((p) => p.y))));
        y < Math.min(png.height, Math.max(...polygon.map((p) => p.y)));
        y += 2
      )
        for (
          let x = Math.max(0, Math.ceil(Math.min(...polygon.map((p) => p.x))));
          x < Math.min(png.width, Math.max(...polygon.map((p) => p.x)));
          x += 2
        ) {
          const p = { x: x + 0.5, y: y + 0.5 };
          if (
            !inside(p, polygon) ||
            edgeDistance(p, polygon) <= cameraScale ||
            hud.some(
              (r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height,
            )
          )
            continue;
          const index = (y * png.width + x) * 4;
          samples.push({
            x,
            y,
            rgb: [png.data[index]!, png.data[index + 1]!, png.data[index + 2]!],
          });
        }
      await info.attach(`water-interior-samples-${source.id}`, {
        body: JSON.stringify({ samples, cameraScale }),
        contentType: 'application/json',
      });
      expect(samples.length).toBeGreaterThan(20);
      expect(new Set(samples.map((sample) => sample.y)).size).toBeGreaterThan(3);
      const ranges = [0, 1, 2].map(
        (channel) =>
          Math.max(...samples.map((s) => s.rgb[channel]!)) -
          Math.min(...samples.map((s) => s.rgb[channel]!)),
      );
      expect(Math.max(...ranges)).toBeGreaterThanOrEqual(3);
      // Independently intersect horizontal scanlines with the emitted polygon.
      // Same-row banks both brighter than the middle cannot be established by
      // the former single monotonic NW→SE gradient alone.
      const minY = Math.min(...polygon.map((p) => p.y)),
        maxY = Math.max(...polygon.map((p) => p.y));
      const rows: { y: number; left: number; right: number }[] = [];
      for (let row = 0; row < 64; row++) {
        const y = minY + (0.2 + (0.6 * (row + 0.5)) / 64) * (maxY - minY);
        const crossings: number[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i]!,
            b = polygon[(i + 1) % polygon.length]!;
          if (a.y > y !== b.y > y) crossings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
        crossings.sort((a, b) => a - b);
        for (let i = 0; i + 1 < crossings.length; i += 2)
          rows.push({ y, left: crossings[i]!, right: crossings[i + 1]! });
      }
      rows.sort((a, b) => b.right - b.left - (a.right - a.left));
      for (const row of rows) {
        if ((row.right - row.left) / cameraScale < 14) continue;
        const left = { x: row.left + 2 * cameraScale, y: row.y },
          center = { x: (row.left + row.right) / 2, y: row.y },
          right = { x: row.right - 2 * cameraScale, y: row.y };
        if (edgeDistance(center, polygon) / cameraScale < 7) continue;
        const mean = (point: Point): number | null => {
          const values: number[] = [];
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const x = Math.round(point.x) + dx,
                y = Math.round(point.y) + dy,
                pixel = { x: x + 0.5, y: y + 0.5 };
              if (
                x < 0 ||
                y < 0 ||
                x >= png.width ||
                y >= png.height ||
                !inside(pixel, polygon) ||
                edgeDistance(pixel, polygon) <= cameraScale ||
                hud.some(
                  (r) =>
                    pixel.x >= r.x &&
                    pixel.x <= r.x + r.width &&
                    pixel.y >= r.y &&
                    pixel.y <= r.y + r.height,
                )
              )
                return null;
              const index = (y * png.width + x) * 4;
              values.push((png.data[index]! + png.data[index + 1]! + png.data[index + 2]!) / 3);
            }
          return values.reduce((sum, value) => sum + value, 0) / values.length;
        };
        const bankLeft = mean(left),
          middle = mean(center),
          bankRight = mean(right);
        if (bankLeft === null || middle === null || bankRight === null) continue;
        bankObservations.push({
          id: source.id,
          y: row.y,
          left,
          center,
          right,
          bankLeft,
          middle,
          bankRight,
          widthWorld: (row.right - row.left) / cameraScale,
        });
        break;
      }
      await idle(page);
      expect((await diagnostics(page)).waterRendering.materials).toEqual(material);
    }
    await info.attach('water-same-row-bank-observations', {
      body: JSON.stringify(bankObservations),
      contentType: 'application/json',
    });
    expect(bankObservations.length).toBeGreaterThan(0);
    const biwa = bankObservations.find((row) => row.id === 'lk.biwa');
    expect(biwa, 'Biwa provides the explicit same-row bank control').toBeDefined();
    expect(
      biwa!.bankLeft,
      'Biwa left bank is brighter than the center outside shore strokes and HUD',
    ).toBeGreaterThan(biwa!.middle + 3);
    expect(
      biwa!.bankRight,
      'Biwa right bank is brighter than the center outside shore strokes and HUD',
    ).toBeGreaterThan(biwa!.middle + 3);
    for (const material of observedMaterials) {
      expect(material).toBeDefined();
      expect(material!.ownedTextures).toBe(2);
      expect(material!.ownedSources).toBe(2);
      expect(material!.rgbaBytes).toBeGreaterThan(0);
      expect(material!.rgbaBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(material!.lakes.map((entry) => entry.id).sort()).toEqual(
        terrain.lakes.map((entry) => entry.id).sort(),
      );
      for (const entry of material!.lakes) {
        expect(entry.kind).toBe('bankReflection');
        expect(Math.max(entry.width, entry.height)).toBeLessThanOrEqual(128);
        expect(Math.min(entry.width, entry.height)).toBeGreaterThanOrEqual(16);
        expect(entry.rgbaBytes).toBe(entry.width * entry.height * 4);
      }
      expect(material!.rgbaBytes).toBe(
        material!.lakes.reduce((sum, entry) => sum + entry.rgbaBytes, 0),
      );
    }
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    expect((await diagnostics(page)).waterRendering.materials).toEqual(initialMaterials);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    // Interior screenshot variation is a positive scene control, not a comparison against old gradient quality or an outside-paint proof.
  });
});
