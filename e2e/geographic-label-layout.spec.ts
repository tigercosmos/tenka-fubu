import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };

function intersection(a: Rect, b: Rect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

async function layout(page: Page) {
  return page.evaluate(
    () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().geographicLabelLayout,
  );
}

async function boot(page: Page) {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle());
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

async function near(page: Page, castleId: 'castle.sunpu' | 'castle.narumi') {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
  if (castleId === 'castle.narumi') {
    const pos = await page.evaluate(
      () =>
        Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
          (castle) => castle.id === 'castle.narumi',
        )!.pos,
    );
    const frame = page.getByTestId('minimap-frame');
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    await frame.click({
      position: { x: (pos.x / 4096) * box!.width, y: (pos.y / 4096) * box!.height },
    });
  }
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}

function overlap(data: Awaited<ReturnType<typeof layout>>, baseline: boolean) {
  return data.labels.reduce(
    (sum, label) =>
      sum +
      data.obstacles.reduce(
        (area, obstacle) =>
          area + intersection(baseline ? label.baseline : label.rect, obstacle.rect),
        0,
      ),
    0,
  );
}

test.describe('native geographic-label placement', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('actual Sunpu text overlap improves and the clear Narumi road stays clear while restored districts do not worsen at three scales without changing core', async ({
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
        await near(page, castleId);
        const data = await layout(page);
        expect(data.labels.length).toBeGreaterThan(0);
        expect(data.obstacles.some((entry) => entry.kind === 'armyBody')).toBe(true);
        for (const label of data.labels) {
          expect(label.text.length).toBeGreaterThan(0);
          expect(Object.values(label.rect).every(Number.isFinite)).toBe(true);
          expect(label.rect.width).toBeGreaterThan(0);
          expect(label.rect.height).toBeGreaterThan(0);
          expect(Math.hypot(label.offset.x, label.offset.y)).toBeLessThanOrEqual(48 + 1e-7);
          expect(label.rect.width).toBe(label.baseline.width);
          expect(label.rect.height).toBe(label.baseline.height);
          expect(label.rect.x).toBeCloseTo(label.baseline.x + label.offset.x, 8);
          expect(label.rect.y).toBeCloseTo(label.baseline.y + label.offset.y, 8);
        }
        const before = overlap(data, true),
          after = overlap(data, false);
        // Preserve native geometry even when a fixture-specific expectation fails.
        await info.attach(`geographic-labels-${castleId}-${scale}-geometry`, {
          body: JSON.stringify({ scale, castleId, before, after, layout: data }),
          contentType: 'application/json',
        });
        // A text offset must not buy aggregate clearance by covering a castle
        // ribbon that was clear at the original geographic anchor.
        for (const label of data.labels)
          for (const ribbon of data.obstacles.filter((obstacle) => obstacle.kind === 'castle'))
            expect(
              intersection(label.rect, ribbon.rect),
              `${label.id} preserves ${ribbon.id} ribbon clearance at UI ${scale}`,
            ).toBeLessThanOrEqual(intersection(label.baseline, ribbon.rect));
        if (castleId === 'castle.sunpu') {
          expect(
            before,
            `Sunpu at UI ${scale} has a nonvacuous original collision`,
          ).toBeGreaterThan(0);
          expect(
            after,
            `Sunpu at UI ${scale} improves against the same actual obstacles`,
          ).toBeLessThan(before);
        } else {
          // The original clear fixture contained only this road. Castle AABB
          // decluttering restores districts that conservative buckets hid;
          // keep the road's zero-collision oracle rather than hiding districts.
          const road = data.labels.find((label) => label.id === 'road:road.narumi-sunpu');
          expect(road, `original clear Narumi road remains visible at UI ${scale}`).toBeDefined();
          for (const label of data.labels) {
            const labelArea = (baseline: boolean) =>
              data.obstacles.reduce(
                (area, obstacle) =>
                  area + intersection(baseline ? label.baseline : label.rect, obstacle.rect),
                0,
              );
            expect(
              labelArea(false),
              `${label.id} does not worsen at UI ${scale}`,
            ).toBeLessThanOrEqual(labelArea(true));
            if (label.id === road!.id) {
              expect(labelArea(true), `original Narumi road baseline at UI ${scale}`).toBe(0);
              expect(labelArea(false), `original Narumi road stays clear at UI ${scale}`).toBe(0);
            }
          }
          expect(
            before,
            `restored Narumi text has a nonvacuous collision at UI ${scale}`,
          ).toBeGreaterThan(0);
          expect(after, `restored Narumi text improves at UI ${scale}`).toBeLessThan(before);
        }
        await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
        expect(await layout(page)).toEqual(data);
        observations.push({
          scale,
          castleId,
          category:
            castleId === 'castle.sunpu' ? 'collision-improvement' : 'already-clear-stability',
          before,
          after,
          layout: data,
        });
        await page.screenshot({
          path: info.outputPath(`geographic-labels-${castleId}-${scale}.png`),
        });
      }
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
    await info.attach('geographic-label-observations', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
    // Actual BitmapText rectangles, not glyph-pixel recognition. Screenshots
    // require independent visual review; the unchanged fixture is synthetic.
  });

  test('actual normal-day movement refreshes obstacles while idle placement remains stable', async ({
    page,
  }, info) => {
    await boot(page);
    await near(page, 'castle.sunpu');
    const before = await layout(page);
    const day = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getState().time.day,
    );
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.stepDays(1));
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    const after = await layout(page);
    expect(
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState().time.day),
    ).toBe(day + 1);
    const moved = after.obstacles.filter(
      (obstacle) =>
        obstacle.kind === 'armyBody' &&
        before.obstacles.some(
          (old) =>
            old.kind === obstacle.kind &&
            old.id === obstacle.id &&
            (old.rect.x !== obstacle.rect.x || old.rect.y !== obstacle.rect.y),
        ),
    );
    expect(
      moved.length,
      'unchanged visual fixture actually moves at least one visible army',
    ).toBeGreaterThan(0);
    expect(after.runs).toBeGreaterThan(before.runs);
    expect(after.labels.map(({ id, text }) => ({ id, text }))).toEqual(
      before.labels.map(({ id, text }) => ({ id, text })),
    );
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    expect(await layout(page)).toEqual(after);
    await info.attach('geographic-label-normal-day', {
      body: JSON.stringify({ before, after, moved }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('geographic-labels-after-movement.png') });
    // Real driver on the existing synthetic visual state, not an earned campaign.
  });
});
