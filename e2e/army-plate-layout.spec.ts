import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

// Intersect the open rectangle with the segment parameter interval [0, 1].
// Boundary-only touches and zero-length leaders do not cross an interior.
function crossesInterior(start: Point, end: Point, rect: Rect): boolean {
  if (rect.width <= 0 || rect.height <= 0 || (start.x === end.x && start.y === end.y)) return false;
  let low = 0,
    high = 1;
  for (const [a, b, min, max] of [
    [start.x, end.x, rect.x, rect.x + rect.width],
    [start.y, end.y, rect.y, rect.y + rect.height],
  ] as const) {
    const delta = b - a;
    if (delta === 0) {
      if (a <= min || a >= max) return false;
    } else {
      const first = (min - a) / delta,
        second = (max - a) / delta;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low >= high) return false;
    }
  }
  return low < high;
}

async function layout(page: Page) {
  return page.evaluate(
    () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout,
  );
}

// Independent, unpadded intersection area. Diagnostics expose actual part
// bounds, not rendered glyph pixels; retained screenshots need visual review.
function intersection(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

// Rectangle union, not a sum: overlapping HUD panels must not be subtracted twice.
function visibleArea(rect: Rect, canvas: Rect, hud: Rect[]): number {
  const left = Math.max(rect.x, canvas.x),
    right = Math.min(rect.x + rect.width, canvas.x + canvas.width),
    top = Math.max(rect.y, canvas.y),
    bottom = Math.min(rect.y + rect.height, canvas.y + canvas.height);
  if (right <= left || bottom <= top) return 0;
  const xs = [...new Set([left, right, ...hud.flatMap((r) => [r.x, r.x + r.width])])]
    .filter((x) => x >= left && x <= right)
    .sort((a, b) => a - b);
  const ys = [...new Set([top, bottom, ...hud.flatMap((r) => [r.y, r.y + r.height])])]
    .filter((y) => y >= top && y <= bottom)
    .sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const x = (xs[i - 1]! + xs[i]!) / 2,
        y = (ys[j - 1]! + ys[j]!) / 2;
      if (!hud.some((r) => x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height))
        area += (xs[i]! - xs[i - 1]!) * (ys[j]! - ys[j - 1]!);
    }
  return area;
}

function overlap(data: Awaited<ReturnType<typeof layout>>, baseline: boolean): number {
  let area = 0;
  data.plates.forEach((plate, index) => {
    const rect = baseline ? plate.baseline : plate.rect;
    for (const castle of data.castles) area += intersection(rect, castle.rect);
    for (const other of data.plates.slice(index + 1))
      area += intersection(rect, baseline ? other.baseline : other.rect);
  });
  return area;
}

async function boot(page: Page) {
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
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
}

async function setScale(page: Page, scale: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(scale === 1.5 ? 'End' : 'Home');
  if (scale === 1) for (let step = 0; step < 4; step++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe(`${16 * scale}px`);
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function nearCastle(page: Page, id: 'castle.sunpu' | 'castle.narumi') {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
  if (id === 'castle.narumi') {
    const position = await page.evaluate(() => {
      const game = (window as DebugWindow).__tenka.debug.getState();
      return Object.values(game.castles).find((castle) => castle.id === 'castle.narumi')!.pos;
    });
    const mini = page.getByTestId('minimap-frame');
    const box = await mini.boundingBox();
    expect(box).not.toBeNull();
    await mini.click({
      position: { x: (position.x / 4096) * box!.width, y: (position.y / 4096) * box!.height },
    });
  }
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}

test.describe('native army number-plate placement', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('the independent tether oracle detects interiors but excludes edge and corner touches', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    for (const [start, end, expected] of [
      [{ x: -5, y: 5 }, { x: 15, y: 5 }, true],
      [{ x: 5, y: -5 }, { x: 5, y: 15 }, true],
      [{ x: -5, y: -5 }, { x: 15, y: 15 }, true],
      [{ x: -5, y: 5 }, { x: 5, y: -5 }, false],
      [{ x: -5, y: 0 }, { x: 15, y: 0 }, false],
      [{ x: 5, y: 5 }, { x: 15, y: 5 }, true],
      [{ x: 5, y: 5 }, { x: 5, y: 5 }, false],
      [{ x: -5, y: 5 }, { x: 0, y: 5 }, false],
    ] as const) {
      expect(crossesInterior(start, end, rect)).toBe(expected);
      expect(crossesInterior(end, start, rect)).toBe(expected);
    }
  });

  test('the reserved-HUD visibility oracle clips and subtracts overlapping rectangles once', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(
      visibleArea(rect, rect, [
        { x: 0, y: 0, width: 6, height: 10 },
        { x: 4, y: 0, width: 4, height: 10 },
      ]),
    ).toBe(20);
    expect(visibleArea(rect, { x: 5, y: 5, width: 10, height: 10 }, [])).toBe(25);
    expect(visibleArea(rect, rect, [rect])).toBe(0);
    expect(visibleArea(rect, rect, [{ x: 10, y: 0, width: 10, height: 10 }])).toBe(100);
  });

  test('actual Sunpu/Narumi plate bounds reduce overlap at three real UI scales without core mutation', async ({
    page,
  }, info) => {
    await boot(page);
    // Existing synthetic visual fixture, unchanged: this is presentation/input
    // evidence, not an earned campaign or normal-day gameplay proof.
    const core = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const castleId of ['castle.sunpu', 'castle.narumi'] as const) {
        await nearCastle(page, castleId);
        const data = await layout(page);
        expect(data.plates.length).toBeGreaterThan(0);
        expect(data.castles.some((castle) => castle.id === castleId)).toBe(true);
        for (const plate of data.plates) {
          expect(
            plate.fontSizeCss,
            'number text retains a readable camera-independent size',
          ).toBeCloseTo(14, 8);
          expect(Object.values(plate.rect).every(Number.isFinite)).toBe(true);
          // Runtime information plates opt into 80 CSS px; legacy pure callers
          // retain their separate 48 px contract. Bodies and anchors never move.
          expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
          expect(plate.rect.width).toBe(plate.baseline.width);
          expect(plate.rect.height).toBe(plate.baseline.height);
          expect(plate.rect.x).toBeCloseTo(plate.baseline.x + plate.offset.x, 8);
          expect(plate.rect.y).toBeCloseTo(plate.baseline.y + plate.offset.y, 8);
        }
        const before = overlap(data, true),
          after = overlap(data, false);
        expect(before, `${castleId} at UI ${scale} has a real baseline collision`).toBeGreaterThan(
          0,
        );
        expect(after, `${castleId} at UI ${scale} reduces actual rectangle overlap`).toBeLessThan(
          before,
        );
        const runs = data.runs;
        await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
        expect((await layout(page)).runs).toBe(runs);
        observations.push({ scale, castleId, before, after, layout: data });
        await page.screenshot({ path: info.outputPath(`army-plates-${castleId}-${scale}.png`) });
      }
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
    const path = info.outputPath('army-plate-observations.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('army-plate-observations', { path, contentType: 'application/json' });
  });

  test('a real body-anchor pointer selects a player army and its plate survives far LOD', async ({
    page,
  }, info) => {
    await boot(page);
    await nearCastle(page, 'castle.narumi');
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const data = await layout(page);
    const canvas = page.getByTestId('map-canvas-host').locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const player = data.plates.find(
      (plate) =>
        Object.values(game.armies).some(
          (army) => army.id === plate.id && army.clanId === game.meta.playerClanId,
        ) &&
        plate.anchor.x > 100 &&
        plate.anchor.x < box!.width - 200 &&
        plate.anchor.y > 100 &&
        plate.anchor.y < box!.height - 160,
    );
    expect(player, 'unchanged visual fixture has a usable player body anchor').toBeDefined();
    const core = JSON.stringify(game);
    // Anchor is canvas-local CSS; native pointer is page CSS. Plate offset must
    // not move the hit anchor, and no direct selection setter is used.
    await page.mouse.click(box!.x + player!.anchor.x, box!.y + player!.anchor.y);
    await expect(page.getByTestId('army-context-controls')).toBeVisible();
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    const selected = (await layout(page)).plates.find((plate) => plate.selected);
    expect(selected).toBeDefined();
    expect(
      Object.values(game.armies).some(
        (army) => army.id === selected!.id && army.clanId === game.meta.playerClanId,
      ),
    ).toBe(true);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    const far = await layout(page);
    expect(far.plates.some((plate) => plate.id === selected!.id && plate.selected)).toBe(true);
    expect(far.plates.find((plate) => plate.id === selected!.id)!.fontSizeCss).toBeCloseTo(14, 8);
    // The fixed visual fixture need not contain a five-army stack; never inject
    // one or silently claim collapsed-count coverage when it is absent.
    for (const plate of far.plates.filter((entry) => entry.collapsed))
      expect(plate.rect.width).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
    await page.screenshot({ path: info.outputPath('army-plates-selected-far.png') });
    await info.attach('far-plate-visibility', {
      body: JSON.stringify(far, null, 2),
      contentType: 'application/json',
    });
  });

  test('the three observed dense-cluster plate pairs no longer overlap independently of castle ribbons', async ({
    page,
  }, info) => {
    await boot(page);
    const core = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const castleId of ['castle.sunpu', 'castle.narumi'] as const) {
        await nearCastle(page, castleId);
        const data = await layout(page);
        const controls =
          castleId === 'castle.sunpu'
            ? [
                ['army.000001', 'army.000007'],
                ['army.000001', 'army.000011'],
              ]
            : [['army.000007', 'army.000011']];
        const visibility = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="screen-strategy"] canvas')!;
          const c = canvas.getBoundingClientRect();
          const rect = (element: Element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x - c.x, y: r.y - c.y, width: r.width, height: r.height };
          };
          return {
            canvas: { x: 0, y: 0, width: c.width, height: c.height },
            hud: [
              ...document.querySelectorAll(
                '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="screen-strategy"] > div[aria-hidden="false"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *',
              ),
            ]
              .map(rect)
              .filter((r) => r.width > 0 && r.height > 0),
          };
        });
        const visible = data.plates.map((entry) => {
          const id = entry.id;
          const plate = data.plates.find((entry) => entry.id === id)!;
          expect(plate, `observed control ${id} remains present`).toBeDefined();
          return {
            id,
            before: visibleArea(plate.baseline, visibility.canvas, visibility.hud),
            after: visibleArea(plate.rect, visibility.canvas, visibility.hud),
            area: plate.rect.width * plate.rect.height,
            control: controls.flat().includes(id),
          };
        });
        const pairs = controls.map(([a, b]) => {
          const first = data.plates.find((plate) => plate.id === a),
            second = data.plates.find((plate) => plate.id === b);
          expect(first, `observed control ${a} remains visible`).toBeDefined();
          expect(second, `observed control ${b} remains visible`).toBeDefined();
          return {
            ids: [a, b],
            before: intersection(first!.baseline, second!.baseline),
            after: intersection(first!.rect, second!.rect),
          };
        });
        const remainingPairs = data.plates.flatMap((plate, index) =>
          data.plates.slice(index + 1).flatMap((other) => {
            const area = intersection(plate.rect, other.rect);
            return area > 0 ? [{ ids: [plate.id, other.id], area }] : [];
          }),
        );
        observations.push({
          scale,
          castleId,
          pairs,
          remainingPairs,
          visible,
          visibility,
          layout: data,
        });
        await page.screenshot({ path: info.outputPath(`dense-pairs-${castleId}-${scale}.png`) });
      }
    }
    // Retain every original failing control before asserting, rather than
    // stopping after the first pair or combining it with improved ribbons.
    const path = info.outputPath('dense-pair-observations.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('dense-pair-observations', { path, contentType: 'application/json' });
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
    for (const observation of observations) {
      // Physical pip packing can clear one historical baseline pair before
      // displacement. Every view must still exercise a real dense collision;
      // all final pair, visibility and strict leader checks remain mandatory.
      expect(
        observation.pairs.some((pair) => pair.before > 0),
        'authentic dense fixture retains a baseline control collision',
      ).toBe(true);
      expect(
        observation.remainingPairs,
        `${observation.castleId} UI ${observation.scale}: no collision transferred to another plate pair`,
      ).toEqual([]);
      for (const plate of observation.visible) {
        if (plate.control || Math.abs(plate.before - plate.area) < 1e-7) {
          expect(plate.before, 'control has a visible baseline frame').toBeGreaterThan(0);
          expect(
            plate.after + 1e-7,
            `${observation.castleId} UI ${observation.scale}: ${plate.id} is not hidden by HUD or clipping`,
          ).toBeGreaterThanOrEqual(plate.before);
          expect(plate.after).toBeCloseTo(plate.area, 6);
        }
      }
      for (const plate of observation.layout.plates) {
        expect(plate.fontSizeCss).toBeCloseTo(14, 8);
        expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
        const leader = plate.leader;
        expect(Object.values(leader.start).every(Number.isFinite)).toBe(true);
        expect(Object.values(leader.end).every(Number.isFinite)).toBe(true);
        expect(leader.start.x).toBeCloseTo(plate.anchor.x, 7);
        expect(leader.start.y).toBeCloseTo(plate.anchor.y, 7);
        if (leader.visible) {
          expect(leader.end.x).toBeCloseTo(
            Math.max(plate.rect.x, Math.min(plate.anchor.x, plate.rect.x + plate.rect.width)),
            7,
          );
          expect(leader.end.y).toBeCloseTo(
            Math.max(plate.rect.y, Math.min(plate.anchor.y, plate.rect.y + plate.rect.height)),
            7,
          );
        } else {
          expect(leader.end.x).toBeCloseTo(plate.anchor.x, 7);
          expect(leader.end.y).toBeCloseTo(plate.anchor.y, 7);
        }
        if (plate.offset.x !== 0 || plate.offset.y !== 0) expect(leader.visible).toBe(true);
        if (leader.visible)
          for (const other of observation.layout.plates)
            if (other.id !== plate.id)
              expect(
                crossesInterior(leader.start, leader.end, other.rect),
                `${observation.castleId} UI ${observation.scale}: ${plate.id} leader crosses ${other.id}`,
              ).toBe(false);
      }
      for (const pair of observation.pairs) {
        expect(
          pair.before,
          'current physical baseline intersection is nonnegative',
        ).toBeGreaterThanOrEqual(0);
        expect(
          pair.after,
          `${observation.castleId} UI ${observation.scale}: ${pair.ids.join(' / ')}`,
        ).toBe(0);
      }
    }
  });
});
