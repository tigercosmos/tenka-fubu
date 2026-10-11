import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Ribbon = {
  id: string;
  baseline: Rect;
  rect: Rect;
  offset: Point;
  anchor: Point;
  leader: { start: Point; end: Point; visible: boolean };
};
type Layout = {
  runs: number;
  ribbons: Ribbon[];
  obstacles: { id: string; kind: string; rect: Rect }[];
};
const intersection = (a: Rect, b: Rect): Rect => ({
  x: Math.max(a.x, b.x),
  y: Math.max(a.y, b.y),
  width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
  height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
});
const area = (a: Rect, b: Rect) => {
  const rect = intersection(a, b);
  return rect.width * rect.height;
};
function crosses(start: Point, end: Point, rect: Rect): boolean {
  if (start.x === end.x && start.y === end.y) return false;
  let low = 0,
    high = 1;
  for (const axis of ['x', 'y'] as const) {
    const delta = end[axis] - start[axis];
    const lower = rect[axis],
      upper = lower + (axis === 'x' ? rect.width : rect.height);
    if (!delta) {
      if (start[axis] <= lower || start[axis] >= upper) return false;
    } else {
      const a = (lower - start[axis]) / delta,
        b = (upper - start[axis]) / delta;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
  }
  return low < high && high > 0 && low < 1;
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

test('castle text obstruction improves without hiding ribbons, changing bodies, or crossing hard obstacles', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const state = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const observations = [];
  for (const value of [0.8, 1, 1.5] as const) {
    await scale(page, value);
    for (const preset of ['operational', 'close'] as const) {
      for (const target of ['castle.sunpu', 'castle.narumi'] as const) {
        const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
        if (await context.count()) await context.locator('header button').click();
        await page.evaluate((preset) => window.__tenka.debug.setMapCameraPreset(preset), preset);
        if (target === 'castle.narumi') {
          const position = await page.evaluate(
            () =>
              Object.values(window.__tenka.debug.getState().castles).find(
                (castle) => castle.id === 'castle.narumi',
              )!.pos,
          );
          const mini = page.getByTestId('minimap-frame');
          const box = await mini.boundingBox();
          expect(box).not.toBeNull();
          await mini.click({
            position: { x: (position.x / 4096) * box!.width, y: (position.y / 4096) * box!.height },
          });
        }
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
        const data = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
        const layout = (data as typeof data & { castleRibbonLayout?: Layout }).castleRibbonLayout;
        const canvas = await page
          .locator('[data-testid="screen-strategy"] canvas')
          .first()
          .boundingBox();
        expect(canvas).not.toBeNull();
        const hud = await page.evaluate(
          ({ x, y }) =>
            [
              ...document.querySelectorAll<HTMLElement>(
                '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="siege-overlay"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *, [data-testid="screen-strategy"] > div[aria-hidden="false"]',
              ),
            ]
              .filter((element) => {
                const r = element.getBoundingClientRect();
                return (
                  r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden'
                );
              })
              .map((element) => {
                const r = element.getBoundingClientRect();
                return { x: r.x - x, y: r.y - y, width: r.width, height: r.height };
              }),
          canvas!,
        );
        const actors = [
          ...data.actorDepth.bodies
            .filter((body) => body.kind === 'army' && body.visible && body.rect)
            .map((body) => ({ id: body.id, kind: 'soldier', rect: body.rect! })),
          ...data.armyRendering.signals
            .filter((signal) => signal.visible && signal.rect)
            .map((signal) => ({ id: signal.id, kind: 'signal', rect: signal.rect! })),
        ];
        const rows = data.armyPlateLayout.castles.flatMap((castle) => {
          if (!castle.content) return [];
          const placed = layout?.ribbons.find((ribbon) => ribbon.id === castle.id);
          const offset = placed?.offset ?? { x: 0, y: 0 };
          return (['name', 'troops'] as const).flatMap((channel) =>
            actors.map((actor) => {
              const current = castle.content![channel];
              const baseline = { ...current, x: current.x - offset.x, y: current.y - offset.y };
              const before = intersection(baseline, actor.rect),
                after = intersection(current, actor.rect);
              const unobscured = [before, after].every(
                (rect) =>
                  !rect.width ||
                  !rect.height ||
                  (rect.x >= 0 &&
                    rect.y >= 0 &&
                    rect.x + rect.width <= canvas!.width &&
                    rect.y + rect.height <= canvas!.height &&
                    hud.every((surface) => area(rect, surface) === 0)),
              );
              return {
                castle: castle.id,
                channel,
                actor: actor.id,
                kind: actor.kind,
                baseline,
                current,
                actorRect: actor.rect,
                unobscured,
                before: before.width * before.height,
                after: after.width * after.height,
              };
            }),
          );
        });
        const usable = rows.filter((row) => row.unobscured);
        // Actual castle text versus actual final plate bounds is a separate
        // metric: soldier/signal improvement cannot conceal plate obstruction.
        const plateRows = data.armyPlateLayout.castles.flatMap((castle) => {
          if (!castle.content) return [];
          return (['name', 'troops'] as const).flatMap((channel) =>
            data.armyPlateLayout.plates.map((plate) => {
              const content = castle.content![channel];
              const overlap = intersection(content, plate.rect);
              const unobscured =
                overlap.x >= 0 &&
                overlap.y >= 0 &&
                overlap.x + overlap.width <= canvas!.width &&
                overlap.y + overlap.height <= canvas!.height &&
                hud.every((surface) => area(overlap, surface) === 0);
              return {
                castle: castle.id,
                channel,
                plate: plate.id,
                content,
                plateRect: plate.rect,
                unobscured,
                area: overlap.width * overlap.height,
              };
            }),
          );
        });
        const observation = {
          value,
          preset,
          target,
          data,
          hud,
          rows,
          plateRows,
          before: usable.reduce((sum, row) => sum + row.before, 0),
          after: usable.reduce((sum, row) => sum + row.after, 0),
        };
        observations.push(observation);
        await info.attach(`ribbon-obstruction-${target}-${preset}-${value}`, {
          body: JSON.stringify(observation),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`ribbon-${target}-${preset}-${value}.png`) });
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
        const repeated = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
        expect(repeated.armyPlateLayout).toEqual(data.armyPlateLayout);
        expect(repeated.actorDepth).toEqual(data.actorDepth);
        expect(repeated.armyRendering).toEqual(data.armyRendering);
      }
    }
  }
  const before = observations.reduce((sum, view) => sum + view.before, 0),
    after = observations.reduce((sum, view) => sum + view.after, 0);
  expect(
    before,
    'actual unobscured castle name/troop frames have nonvacuous soldier/signal obstruction',
  ).toBeGreaterThan(0);
  expect(
    after,
    'actual content obstruction improves, not merely a new diagnostic field',
  ).toBeLessThan(before);
  for (const view of observations) {
    expect(view.after).toBeLessThanOrEqual(view.before);
    for (const row of view.plateRows.filter((row) => row.unobscured)) {
      expect(
        row.area,
        `${view.value}/${view.preset}/${view.target}: ${row.plate} covers ${row.castle}/${row.channel}`,
      ).toBe(0);
    }
    const layout = (view.data as typeof view.data & { castleRibbonLayout?: Layout })
      .castleRibbonLayout;
    expect(layout).toBeDefined();
    expect(layout.ribbons.map((ribbon) => ribbon.id).sort()).toEqual(
      view.data.armyPlateLayout.castles.map((castle) => castle.id).sort(),
    );
    for (const ribbon of layout.ribbons) {
      expect(Object.values(ribbon.rect).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(ribbon.offset.x, ribbon.offset.y)).toBeLessThanOrEqual(48 + 1e-7);
      expect(ribbon.rect.width).toBe(ribbon.baseline.width);
      expect(ribbon.rect.height).toBe(ribbon.baseline.height);
      expect(ribbon.rect.x).toBeCloseTo(ribbon.baseline.x + ribbon.offset.x, 7);
      expect(ribbon.rect.y).toBeCloseTo(ribbon.baseline.y + ribbon.offset.y, 7);
      const hard = [
        ...view.hud.map((rect) => ({ id: 'hud', kind: 'hud', rect })),
        ...view.data.actorDepth.bodies
          .filter((body) => body.visible && body.rect)
          .map((body) => ({ id: body.id, kind: body.kind, rect: body.rect! })),
        ...view.data.armyRendering.signals
          .filter((signal) => signal.visible && signal.rect)
          .map((signal) => ({ id: signal.id, kind: 'signal', rect: signal.rect! })),
        ...view.data.castleRendering.nodes.flatMap((castle) =>
          [castle.durability, castle.warning]
            .filter((rect): rect is Rect => rect !== null)
            .map((rect) => ({ id: castle.id, kind: 'castleStatus', rect })),
        ),
        ...layout.obstacles.filter((obstacle) =>
          /body|status|durability|warning/i.test(obstacle.kind),
        ),
      ];
      for (const obstacle of hard) {
        expect(area(ribbon.rect, obstacle.rect)).toBeLessThanOrEqual(
          area(ribbon.baseline, obstacle.rect) + 1e-7,
        );
        if (ribbon.leader.visible && obstacle.id !== ribbon.id)
          expect(crosses(ribbon.leader.start, ribbon.leader.end, obstacle.rect)).toBe(false);
      }
    }
  }
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(state);
  expect(errors).toEqual([]);
  // Content/actor envelopes are not opaque glyph masks. Same-view screenshots require visual review.
});
