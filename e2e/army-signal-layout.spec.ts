import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
type Signal = {
  id: string;
  painted: boolean;
  visible: boolean;
  rect: Rect | null;
  baseline?: Rect | null;
  offset?: { x: number; y: number };
  anchor?: { x: number; y: number };
};
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
function pairArea(rectangles: Rect[]) {
  return rectangles.reduce(
    (sum, rect, index) =>
      sum + rectangles.slice(index + 1).reduce((total, other) => total + area(rect, other), 0),
    0,
  );
}
const fixedArea = (rectangles: Rect[], obstacles: Rect[]) =>
  rectangles.reduce(
    (sum, rect) => sum + obstacles.reduce((total, obstacle) => total + area(rect, obstacle), 0),
    0,
  );
async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}
async function observe(page: Page) {
  return page.evaluate(() => (window as DebugWindow).__tenka.debug.getMapDiagnostics());
}
async function scale(page: Page, value: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(value === 1.5 ? 'End' : 'Home');
  if (value === 1) for (let index = 0; index < 4; index++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}
async function near(page: Page, castle: 'castle.sunpu' | 'castle.narumi') {
  const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
  if (await context.count()) {
    await context.locator('header button').click();
    await expect(context).toHaveCount(0);
  }
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
  if (castle === 'castle.narumi') {
    const position = await page.evaluate(
      () =>
        Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
          (entry) => entry.id === 'castle.narumi',
        )!.pos,
    );
    const mini = page.getByTestId('minimap-frame');
    const box = await mini.boundingBox();
    expect(box).not.toBeNull();
    await mini.click({
      position: { x: (position.x / 4096) * box!.width, y: (position.y / 4096) * box!.height },
    });
  }
  await idle(page);
}

test.describe('native army semantic-signal staggering', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('six actual crowded views reduce banner overlap without hiding signals or moving troop bodies', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await idle(page);
    // Unchanged debug fixture: presentation evidence, not an earned campaign.
    const state = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const value of [0.8, 1, 1.5] as const) {
      await scale(page, value);
      for (const castle of ['castle.sunpu', 'castle.narumi'] as const) {
        await near(page, castle);
        const data = await observe(page);
        const signals = (data.armyRendering.signals as Signal[]).filter(
          (entry): entry is Signal & { rect: Rect } => entry.visible && entry.rect !== null,
        );
        const original = signals.map((signal) => signal.baseline ?? signal.rect);
        const current = signals.map((signal) => signal.rect);
        const castles = data.actorDepth.bodies.flatMap((body) =>
          body.visible && body.kind === 'castle' && body.rect ? [body.rect] : [],
        );
        const soldiers = data.actorDepth.bodies.flatMap((body) =>
          body.visible && body.kind === 'army' && body.rect ? [body.rect] : [],
        );
        const plates = data.armyPlateLayout.plates.map((plate) => plate.rect);
        const metrics = {
          baseline: pairArea(original),
          placed: pairArea(current),
          castle: [fixedArea(original, castles), fixedArea(current, castles)],
          soldier: [fixedArea(original, soldiers), fixedArea(current, soldiers)],
          plate: [fixedArea(original, plates), fixedArea(current, plates)],
        };
        await info.attach(`army-signals-${castle}-${value}`, {
          body: JSON.stringify({ value, castle, metrics, data }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`army-signals-${castle}-${value}.png`) });
        await idle(page);
        observations.push({ value, castle, metrics, signals, data, idle: await observe(page) });
      }
    }
    // All six old-build measurements survive before behavior/structural failures.
    for (const observation of observations) {
      const { metrics, signals, data } = observation;
      expect(metrics.baseline, 'unchanged scene has a genuine signal collision').toBeGreaterThan(0);
      expect(
        metrics.placed,
        'actual semantic bounds improve, not merely a new diagnostic',
      ).toBeLessThan(metrics.baseline);
      // Plates are subsequently laid out against the moved banners, not fixed
      // obstacles. Retain their measured area without inventing a signal/plate
      // nonincrease guarantee for that downstream coupled layout.
      for (const role of ['castle', 'soldier'] as const)
        expect(metrics[role][1], `${role} collision must not increase`).toBeLessThanOrEqual(
          metrics[role][0]! + 1e-6,
        );
      for (const signal of signals) {
        expect(signal.painted).toBe(true);
        expect(Object.values(signal.rect).every(Number.isFinite)).toBe(true);
        expect(signal.rect.width).toBeGreaterThan(0);
        expect(signal.rect.height).toBeGreaterThan(0);
        expect(signal.baseline, 'actual unshifted signal geometry is published').toBeDefined();
        expect(signal.offset).toBeDefined();
        expect(signal.anchor).toBeDefined();
        expect(Math.hypot(signal.offset!.x, signal.offset!.y)).toBeLessThanOrEqual(24 + 1e-6);
        expect(signal.rect.x).toBeCloseTo(signal.baseline!.x + signal.offset!.x, 6);
        expect(signal.rect.y).toBeCloseTo(signal.baseline!.y + signal.offset!.y, 6);
        expect(signal.rect.width).toBeCloseTo(signal.baseline!.width, 6);
        expect(signal.rect.height).toBeCloseTo(signal.baseline!.height, 6);
        for (const body of data.actorDepth.bodies.filter((body) => body.visible && body.rect))
          expect(
            area(signal.rect, body.rect!),
            `${signal.id} must not gain overlap with fixed ${body.kind}:${body.id}`,
          ).toBeLessThanOrEqual(area(signal.baseline!, body.rect!) + 1e-6);
      }
      expect(observation.idle.armyRendering.signalLayoutRuns).toBe(
        data.armyRendering.signalLayoutRuns,
      );
      expect(observation.idle.actorDepth).toEqual(data.actorDepth);
      expect(observation.idle.armyRendering).toEqual(data.armyRendering);
      expect(observation.idle.armyPlateLayout).toEqual(data.armyPlateLayout);
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(state);
    expect(errors).toEqual([]);
  });

  test('body-anchor selection and far mandatory signals survive; real movement refreshes placement only when needed', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await near(page, 'castle.narumi');
    const state = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const originalState = JSON.stringify(state);
    const army = Object.values(state.armies).find(
      (entry) => entry.leaderId === 'off.oda-nagahide',
    )!;
    expect(army.soldiers).toBe(900);
    const original = await observe(page);
    const anchor = original.castleRendering.nodes.find(
      (node) => node.id === 'castle.narumi',
    )!.anchor;
    const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
    expect(canvas).not.toBeNull();
    // Actual established army-before-castle picking at the occupied Narumi anchor.
    await page.mouse.click(canvas!.x + anchor.x, canvas!.y + anchor.y);
    await expect
      .poll(
        async () =>
          (await observe(page)).armyPlateLayout.plates.find((plate) => plate.id === army.id)
            ?.selected,
      )
      .toBe(true);
    await expect(page.getByTestId('army-context-controls')).toBeVisible();
    await idle(page);
    const selected = await observe(page);
    await info.attach('signals-selected-body-anchor', {
      body: JSON.stringify({ original, selected }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('signals-selected-body-anchor.png') });
    for (const body of original.actorDepth.bodies) {
      const current = selected.actorDepth.bodies.find(
        (entry) => entry.id === body.id && entry.kind === body.kind,
      );
      expect(current).toBeDefined();
      expect(current!.footY).toBe(body.footY);
      expect(current!.order).toBe(body.order);
    }
    const selectedSignal = selected.armyRendering.signals.find((signal) => signal.id === army.id)!;
    expect(selectedSignal.visible).toBe(true);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    const far = await observe(page);
    await info.attach('signals-selected-far', {
      body: JSON.stringify(far),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('signals-selected-far.png') });
    expect(far.armyPlateLayout.plates.some((plate) => plate.id === army.id && plate.selected)).toBe(
      true,
    );
    expect(far.armyRendering.signals.find((signal) => signal.id === army.id)?.visible).toBe(true);
    for (const signal of far.armyRendering.signals.filter((entry) => entry.visible))
      expect(signal.offset).toEqual({ x: 0, y: 0 });
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(originalState);
    await near(page, 'castle.sunpu');
    const before = await observe(page);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.stepDays(1));
    await idle(page);
    const after = await observe(page);
    await info.attach('signals-real-normal-day', {
      body: JSON.stringify({ before, after }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('signals-real-normal-day.png') });
    expect(
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState().time.day),
    ).toBe(state.time.day + 1);
    expect(
      after.actorDepth.bodies.some(
        (body) =>
          body.kind === 'army' &&
          body.visible &&
          before.actorDepth.bodies.some((old) => old.id === body.id && old.footY !== body.footY),
      ),
      'actual existing fixture moves, not a fabricated position update',
    ).toBe(true);
    expect(after.armyRendering.signalLayoutRuns).toBeGreaterThan(
      before.armyRendering.signalLayoutRuns,
    );
    await idle(page);
    const settled = await observe(page);
    expect(settled.armyRendering).toEqual(after.armyRendering);
    expect(settled.actorDepth).toEqual(after.actorDepth);
    expect(errors).toEqual([]);
  });
});
