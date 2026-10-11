import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
const canonicalTerrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { lakes: { id: string; polygon: number[] }[]; rivers: { points: number[] }[] };
const pairs = (flat: number[]): Point[] =>
  Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2]!, y: flat[i * 2 + 1]! }));
function polygonMeasure(points: readonly Point[]) {
  const terms = points.map((a, i) => {
    const b = points[(i + 1) % points.length]!;
    return { a, b, cross: a.x * b.y - b.x * a.y };
  });
  const twiceArea = terms.reduce((n, t) => n + t.cross, 0);
  return {
    area: twiceArea / 2,
    x: terms.reduce((n, t) => n + (t.a.x + t.b.x) * t.cross, 0) / (3 * twiceArea),
    y: terms.reduce((n, t) => n + (t.a.y + t.b.y) * t.cross, 0) / (3 * twiceArea),
  };
}
function localMaximumTurn(points: readonly Point[], anchor: Point) {
  const turns = points.flatMap((point, index) => {
    if (Math.hypot(point.x - anchor.x, point.y - anchor.y) > 4 + 1e-8) return [];
    const previous = points[(index + points.length - 1) % points.length]!,
      next = points[(index + 1) % points.length]!,
      ax = point.x - previous.x,
      ay = point.y - previous.y,
      bx = next.x - point.x,
      by = next.y - point.y,
      denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
    expect(denominator).toBeGreaterThan(0);
    return [
      (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator))) * 180) / Math.PI,
    ];
  });
  expect(turns.length).toBeGreaterThan(0);
  return Math.max(...turns);
}
function segmentIntersection(a: Point, b: Point, c: Point, d: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ex = d.x - c.x,
    ey = d.y - c.y;
  const determinant = dx * ey - dy * ex;
  if (determinant === 0) return false;
  const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / determinant;
  const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / determinant;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}
async function boot(page: Page) {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await idle(page);
}
async function setScale(page: Page, scale: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(scale === 1.5 ? 'End' : 'Home');
  if (scale === 1) for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}
async function selectCastle(page: Page, id: string) {
  const name = await page.evaluate(
    (castleId) =>
      Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
        (entry) => entry.id === castleId,
      )!.name,
    id,
  );
  await page.getByTestId('rail-realm').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: '顯示種類', exact: true }).selectOption('castle');
  await dialog.getByRole('searchbox', { name: '搜尋地點、部隊或勢力', exact: true }).fill(name);
  await dialog.getByRole('button', { name: `選取${name}`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await idle(page);
}
async function data(page: Page) {
  return page.evaluate(() => (window as DebugWindow).__tenka.debug.getMapDiagnostics());
}
function depthOrder(diagnostics: Awaited<ReturnType<typeof data>>) {
  const bodies = diagnostics.actorDepth.bodies.filter(
    (entry) => entry.visible && entry.rect !== null,
  );
  const expected = [...bodies].sort(
    (a, b) =>
      a.footY - b.footY ||
      (`${a.kind}:${a.id}` < `${b.kind}:${b.id}`
        ? -1
        : `${a.kind}:${a.id}` > `${b.kind}:${b.id}`
          ? 1
          : 0),
  );
  expect(
    [...bodies].sort((a, b) => a.order - b.order).map((entry) => `${entry.kind}:${entry.id}`),
  ).toEqual(expected.map((entry) => `${entry.kind}:${entry.id}`));
  expect(diagnostics.actorDepth.semanticLayerOrders.army).toBeGreaterThan(
    diagnostics.actorDepth.modelLayerOrder,
  );
  expect(diagnostics.actorDepth.semanticLayerOrders.castle).toBeGreaterThan(
    diagnostics.actorDepth.modelLayerOrder,
  );
}

test.describe('native original model hierarchy', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('painted main and branch castle frames have the approved world widths at three UI scales, without covering mandatory channels', async ({
    page,
  }, info) => {
    await boot(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const before = JSON.stringify(game);
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const id of ['castle.sunpu', 'castle.narumi'] as const) {
        await selectCastle(page, id);
        const current = await data(page);
        const node = current.castleRendering.nodes.find((entry) => entry.id === id);
        const reference = current.castleRendering.nodes.find((entry) => entry.id !== id);
        expect(node).toBeDefined();
        expect(reference).toBeDefined();
        const castle = Object.values(game.castles).find((entry) => entry.id === id)!;
        const other = Object.values(game.castles).find((entry) => entry.id === reference!.id)!;
        // Uniform camera scale reconstructed from two actual screen anchors and
        // unchanged world coordinates. Never infer scale from the body width
        // being tested, or import the production placement helper.
        const cameraScale =
          Math.hypot(node!.anchor.x - reference!.anchor.x, node!.anchor.y - reference!.anchor.y) /
          Math.hypot(castle.pos.x - other.pos.x, castle.pos.y - other.pos.y);
        await info.attach(`model-hierarchy-raw-${id}-${scale}`, {
          body: JSON.stringify({ current, id, scale, cameraScale }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`model-hierarchy-${id}-${scale}.png`) });
        expect(node!.painted).toBe(true);
        expect(node!.bodyFrameKind).toBe('alphaContentFrame');
        expect(node!.body.width).toBeCloseTo((castle.tier === 'main' ? 40 : 30) * cameraScale, 6);
        expect(node!.selection?.behindBody).toBe(true);
        expect(node!.durability).not.toBeNull();
        expect(
          overlap(node!.durability!, node!.body),
          'HP channel stays outside enlarged original artwork',
        ).toBe(0);
        if (id === 'castle.sunpu') {
          expect(node!.warning).not.toBeNull();
          expect(
            overlap(node!.warning!, node!.body),
            'critical badge stays outside enlarged original artwork',
          ).toBe(0);
          expect(node!.siege?.behindBody).toBe(true);
        } else {
          expect(node!.warning).toBeNull();
        }
        depthOrder(current);
        const paintedSignals = current.armyRendering.signals.filter(
          (signal) => signal.visible && signal.painted,
        );
        expect(paintedSignals.length).toBeGreaterThan(0);
        for (const signal of paintedSignals) {
          expect(signal.rect).not.toBeNull();
          expect(Object.values(signal.rect!).every(Number.isFinite)).toBe(true);
          expect(signal.rect!.width).toBeGreaterThan(0);
          expect(signal.rect!.height).toBeGreaterThan(0);
        }
        const castles = current.castleRendering.nodes;
        const plateArea = (baseline: boolean) =>
          current.armyPlateLayout.plates.reduce(
            (sum, plate) =>
              sum +
              castles.reduce(
                (n, target) => n + overlap(baseline ? plate.baseline : plate.rect, target.body),
                0,
              ),
            0,
          );
        expect(
          plateArea(false),
          'body-aware plate layout cannot worsen actual enlarged-body overlap',
        ).toBeLessThanOrEqual(plateArea(true) + 1e-7);
        for (const plate of current.armyPlateLayout.plates) {
          // HUD-aware information reflow uses an 80 CSS-pixel disk; model anchors stay fixed.
          expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
          expect(plate.rect.width).toBe(plate.baseline.width);
          expect(plate.rect.height).toBe(plate.baseline.height);
        }
        const geoArea = (baseline: boolean) =>
          current.geographicLabelLayout.labels.reduce(
            (sum, label) =>
              sum +
              current.geographicLabelLayout.obstacles.reduce(
                (n, obstacle) => n + overlap(baseline ? label.baseline : label.rect, obstacle.rect),
                0,
              ),
            0,
          );
        expect(
          geoArea(false),
          'bounded geography placement preserves nonregression against current actual obstacles',
        ).toBeLessThanOrEqual(geoArea(true) + 1e-7);
      }
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    // Frame envelopes and retained screenshots are not opaque-pixel roof or
    // cloth/pole measurement. Actual Graphics flag-profile tests cover24/11.
  });

  test('actual native lake polygons preserve canonical anchors, bounds and river banks while rounding the displayed scene', async ({
    page,
  }, info) => {
    await boot(page);
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    let rounded = 0,
      protectedBanks = 0;
    for (const source of canonicalTerrain.lakes) {
      const raw = pairs(source.polygon);
      const xs = raw.map((p) => p.x),
        ys = raw.map((p) => p.y);
      const bounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
      const minimap = page.getByTestId('minimap-frame');
      const box = await minimap.boundingBox();
      expect(box).not.toBeNull();
      await minimap.click({
        position: {
          x: ((bounds.x + bounds.width / 2) / 4096) * box!.width,
          y: ((bounds.y + bounds.height / 2) / 4096) * box!.height,
        },
      });
      await idle(page);
      const current = await data(page);
      const lake = current.waterRendering.lakes.find((entry) => entry.id === source.id)!;
      await info.attach(`lake-actual-${source.id}`, {
        body: JSON.stringify({ raw, lake, visible: current.waterRendering.visible }),
        contentType: 'application/json',
      });
      await page.screenshot({ path: info.outputPath(`lake-actual-${source.id}.png`) });
      expect(current.waterRendering.visible).toBe(true);
      expect(lake).toBeDefined();
      expect(lake.originalBounds).toEqual(bounds);
      const emitted = lake.worldPoints;
      expect(emitted.length).toBeLessThanOrEqual(768);
      for (const anchor of raw) expect(emitted).toContainEqual(anchor);
      expect(Math.min(...emitted.map((p) => p.x))).toBe(bounds.x);
      expect(Math.max(...emitted.map((p) => p.x))).toBe(bounds.x + bounds.width);
      expect(Math.min(...emitted.map((p) => p.y))).toBe(bounds.y);
      expect(Math.max(...emitted.map((p) => p.y))).toBe(bounds.y + bounds.height);
      const original = polygonMeasure(raw),
        display = polygonMeasure(emitted);
      expect(Math.sign(display.area)).toBe(Math.sign(original.area));
      expect(Math.abs(display.area / original.area - 1)).toBeLessThanOrEqual(0.02);
      expect(Math.hypot(display.x - original.x, display.y - original.y)).toBeLessThanOrEqual(0.5);
      for (let i = 0; i < emitted.length; i++)
        for (let j = i + 2; j < emitted.length; j++) {
          if (i === 0 && j === emitted.length - 1) continue;
          expect(
            segmentIntersection(
              emitted[i]!,
              emitted[(i + 1) % emitted.length]!,
              emitted[j]!,
              emitted[(j + 1) % emitted.length]!,
            ),
          ).toBe(false);
        }
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i]!,
          b = raw[(i + 1) % raw.length]!;
        const crossed = canonicalTerrain.rivers.some((river) => {
          const points = pairs(river.points);
          return points
            .slice(1)
            .some((end, index) => segmentIntersection(a, b, points[index]!, end));
        });
        if (crossed) {
          protectedBanks++;
          const index = emitted.findIndex((p) => p.x === a.x && p.y === a.y);
          expect(emitted[(index + 1) % emitted.length]).toEqual(b);
        }
      }
      if (emitted.length > raw.length) rounded++;
      expect(lake.points.length).toBe(emitted.length);
      expect(lake.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      const eligibleCorners =
        source.id === 'lk.biwa'
          ? [
              { x: 1774, y: 2775 },
              { x: 1784, y: 2775 },
            ]
          : source.id === 'lk.hamana'
            ? [
                { x: 2130, y: 2951 },
                { x: 2145, y: 2971 },
              ]
            : [];
      for (const anchor of eligibleCorners)
        expect(
          localMaximumTurn(emitted, anchor),
          `${source.id} local corner turn`,
        ).toBeLessThanOrEqual(35);
    }
    expect(rounded).toBeGreaterThan(0);
    expect(protectedBanks).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    // Actual emitted CPU geometry and screenshot evidence, not opaque-water pixels or GPU depth proof.
  });

  test('enlarged artwork leaves occupied-army priority, unoccupied castle picking and far vector profiles intact', async ({
    page,
  }, info) => {
    await boot(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const before = JSON.stringify(game);
    for (const id of ['castle.narumi', 'castle.kiyosu']) {
      await selectCastle(page, id);
      const current = await data(page);
      const node = current.castleRendering.nodes.find((entry) => entry.id === id)!;
      const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
      await context.locator('header button').click();
      await expect(context).toHaveCount(0);
      const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
      expect(canvas).not.toBeNull();
      await page.mouse.click(canvas!.x + node.anchor.x, canvas!.y + node.anchor.y);
      if (id === 'castle.narumi') {
        const occupying = Object.values(game.armies).find(
          (entry) => entry.leaderId === 'off.oda-nagahide',
        )!;
        expect(occupying.soldiers).toBe(900);
        await expect
          .poll(
            async () =>
              (await data(page)).armyPlateLayout.plates.find((entry) => entry.id === occupying.id)
                ?.selected,
          )
          .toBe(true);
        await expect(context).toContainText('900人');
      } else {
        await expect
          .poll(async () =>
            Boolean(
              (await data(page)).castleRendering.nodes.find((entry) => entry.id === id)?.selection,
            ),
          )
          .toBe(true);
      }
      depthOrder(await data(page));
    }
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    const far = await data(page);
    await info.attach('model-hierarchy-far', {
      body: JSON.stringify(far),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('model-hierarchy-far.png') });
    expect(far.lodStage).toBe('far');
    for (const castle of far.castleRendering.nodes) {
      expect(castle.painted).toBe(false);
      expect(castle.bodyFrameKind).toBe('vectorNominal');
    }
    const main = far.castleRendering.nodes.find((entry) => entry.id === 'castle.sunpu')!;
    expect(far.castleRendering.nodes.some((entry) => entry.id === 'castle.narumi')).toBe(false);
    expect(
      far.actorDepth.bodies.find((entry) => entry.kind === 'castle' && entry.id === 'castle.narumi')
        ?.visible,
    ).toBe(false);
    const reference = far.castleRendering.nodes.find(
      (entry) =>
        entry.id !== main.id &&
        Object.values(game.castles).some(
          (castle) => castle.id === entry.id && castle.tier === 'main',
        ),
    );
    expect(reference).toBeDefined();
    const mainState = Object.values(game.castles).find((entry) => entry.id === main.id)!;
    const referenceState = Object.values(game.castles).find((entry) => entry.id === reference!.id)!;
    const cameraScale =
      Math.hypot(main.anchor.x - reference!.anchor.x, main.anchor.y - reference!.anchor.y) /
      Math.hypot(mainState.pos.x - referenceState.pos.x, mainState.pos.y - referenceState.pos.y);
    expect(main.body.width).toBeCloseTo(28 * 1.4 * cameraScale, 6);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
  });
});
