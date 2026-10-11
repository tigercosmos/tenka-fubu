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

async function boot(page: Page) {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await idle(page);
}
async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
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
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await idle(page);
}

async function hud(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="map-canvas-host"] canvas',
    )!;
    const origin = canvas.getBoundingClientRect();
    const reports = document.querySelector('[data-testid="reports-open"]')?.parentElement;
    const elements = [
      ...document.querySelectorAll(
        '[data-testid="screen-strategy"] header, [data-testid="screen-strategy"] nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="siege-overlay"], [data-testid="screen-strategy"] > div[aria-hidden="false"]',
      ),
    ];
    if (reports) elements.push(reports);
    const rects = elements
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const r = element.getBoundingClientRect();
        return {
          name:
            element.getAttribute('data-testid') ??
            element.getAttribute('aria-label') ??
            element.tagName,
          rect: { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height },
        };
      });
    const banner = document
      .querySelector('[data-testid="screen-strategy"] header')!
      .getBoundingClientRect();
    const rail = document
      .querySelector('[data-testid="screen-strategy"] nav')!
      .getBoundingClientRect();
    const context = document
      .querySelector('[data-testid="screen-strategy"] > div[aria-hidden="false"]')
      ?.getBoundingClientRect();
    const rightBlocks = [
      document.querySelector('[data-testid="minimap"]'),
      ...(reports?.children ?? []),
    ]
      .filter((element) => element && element.getClientRects().length > 0)
      .map((element) => element!.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const inspector = document
      .querySelector('[data-testid="siege-overlay"]')
      ?.getBoundingClientRect();
    const left = Math.max(rail.right, inspector?.right ?? rail.right) - origin.left + 12;
    const legend = document.querySelector('[data-testid="layer-control"]')?.getBoundingClientRect();
    const top = Math.max(banner.bottom, legend?.bottom ?? banner.bottom) - origin.top + 12;
    const right = Math.min(origin.width, ...rightBlocks.map((r) => r.left - origin.left - 12));
    const bottom = context ? context.top - origin.top - 12 : origin.height;
    const safe = { x: left, y: top, width: right - left, height: bottom - top };
    return { width: origin.width, height: origin.height, rects, safe };
  });
}
async function assertSafe(page: Page, rects: Rect[]) {
  const obstacles = await hud(page);
  expect(obstacles.rects.length).toBeGreaterThanOrEqual(4);
  for (const rect of rects) {
    expect(Object.values(rect).every(Number.isFinite)).toBe(true);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(obstacles.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(obstacles.height);
    for (const obstacle of obstacles.rects)
      expect(intersection(rect, obstacle.rect), `focused target clears ${obstacle.name}`).toBe(0);
  }
  return obstacles;
}
async function minimapCastle(page: Page, id: string) {
  const pos = await page.evaluate(
    (castleId) =>
      Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
        (castle) => castle.id === castleId,
      )!.pos,
    id,
  );
  const map = page.getByTestId('minimap-frame');
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  await map.click({
    position: { x: (pos.x / 4096) * box!.width, y: (pos.y / 4096) * box!.height },
  });
  await idle(page);
}

test.describe('native explicit HUD-safe map focus', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });
  test('actual minimap coordinate input keeps the intended castle ribbon clear across scale, M and resize', async ({
    page,
  }, info) => {
    await boot(page);
    const core = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const castleId of ['castle.sunpu', 'castle.narumi']) {
        await minimapCastle(page, castleId);
        const data = await page.evaluate(
          () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout,
        );
        const castle = data.castles.find((entry) => entry.id === castleId);
        expect(
          castle,
          'the intended castle is actually visible after pointer navigation',
        ).toBeDefined();
        await info.attach(`hud-focus-raw-${castleId}-${scale}`, {
          body: JSON.stringify({ data, hud: await hud(page) }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`hud-focus-raw-${castleId}-${scale}.png`) });
        const obstacles = await assertSafe(page, [castle!.rect]);
        const model = await page.evaluate(
          (id) =>
            (window as DebugWindow).__tenka.debug
              .getMapDiagnostics()
              .castleRendering.nodes.find((entry) => entry.id === id),
          castleId,
        );
        // Observe the actual model anchor, independent of local ribbon offsets.
        expect(model).toBeDefined();
        const anchor = model!.anchor;
        expect(obstacles.safe.width).toBeGreaterThan(0);
        expect(obstacles.safe.height).toBeGreaterThan(0);
        // Native minimap pointer coordinates pass through CSS canvas bounds to
        // the logical raster/world projection; retained pre-fix evidence shows
        // 0.166px input residual versus the actual 72px framing defect. One CSS
        // pixel allows that input precision, not a displaced focus destination.
        expect(
          Math.abs(anchor.x - (obstacles.safe.x + obstacles.safe.width / 2)),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(anchor.y - (obstacles.safe.y + obstacles.safe.height / 2)),
        ).toBeLessThanOrEqual(1);
        let obscuredCluster;
        if (castleId === 'castle.narumi' && scale !== 0.8) {
          const diagnostics = await page.evaluate(() =>
            (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
          );
          const body = diagnostics.geographicLabelLayout.obstacles.find(
            (entry) => entry.id === 'army.000001' && entry.kind === 'armyBody',
          );
          const plate = diagnostics.armyPlateLayout.plates.find(
            (entry) => entry.id === 'army.000001',
          );
          expect(
            body,
            'previously obscured Sunpu army remains visible in Narumi view',
          ).toBeDefined();
          expect(plate).toBeDefined();
          // Reconstruct only the old full-canvas-center framing at identical
          // scale/world positions. This is not a screenshot from the old build.
          const dx = obstacles.width / 2 - anchor.x,
            dy = obstacles.height / 2 - anchor.y;
          const current = [body!.rect, plate!.rect];
          const baseline = current.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
          const area = (rects: Rect[]) =>
            rects.reduce(
              (sum, r) =>
                sum + obstacles.rects.reduce((n, block) => n + intersection(r, block.rect), 0),
              0,
            );
          const before = area(baseline),
            after = area(current);
          expect(
            before,
            'same-position old framing really obscures the Sunpu cluster',
          ).toBeGreaterThan(0);
          expect(after, 'HUD-safe framing reduces that actual cluster occlusion').toBeLessThan(
            before,
          );
          obscuredCluster = { before, after, current, baseline };
        }
        observations.push({
          scale,
          castleId,
          rect: castle!.rect,
          anchor,
          obstacles,
          obscuredCluster,
        });
        await page.screenshot({ path: info.outputPath(`hud-focus-${castleId}-${scale}.png`) });
      }
    }
    // Real keyboard input, not a UI-store setter. Hiding/showing M must retain
    // input mapping; resize is an actual browser viewport change.
    const background = await hud(page);
    await page
      .getByTestId('map-canvas-host')
      .locator('canvas')
      .click({
        position: {
          x: background.safe.x + background.safe.width * 0.2,
          y: background.safe.y + background.safe.height * 0.2,
        },
      });
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body ||
          document.activeElement?.tagName === 'CANVAS' ||
          (document.activeElement instanceof HTMLElement &&
            document.activeElement.dataset.testid === 'map-canvas-host'),
      ),
      'real map pointer leaves keyboard focus on map/background',
    ).toBe(true);
    await page.keyboard.press('m');
    await expect(page.getByTestId('minimap')).toHaveCount(0);
    await page.keyboard.press('m');
    await expect(page.getByTestId('minimap')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await idle(page);
    await minimapCastle(page, 'castle.narumi');
    const resized = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout,
    );
    const castle = resized.castles.find((entry) => entry.id === 'castle.narumi');
    expect(castle).toBeDefined();
    await assertSafe(page, [castle!.rect]);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
    await info.attach('hud-focus-castles', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
  });

  test('real navigator explicit army focus keeps the selected body and mandatory plate clear', async ({
    page,
  }, info) => {
    await boot(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const armies = Object.values(game.armies);
    const army = armies.find(
      (candidate) =>
        candidate.clanId === game.meta.playerClanId &&
        armies.filter((other) => other.leaderId === candidate.leaderId).length === 1,
    );
    expect(army, 'unchanged fixture has an unambiguous real player commander').toBeDefined();
    const name = game.officers[army!.leaderId]!.name;
    const observations = [];
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      await page.getByTestId('rail-realm').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: '顯示種類', exact: true }).selectOption('army');
      await dialog.getByRole('searchbox', { name: '搜尋地點、部隊或勢力', exact: true }).fill(name);
      await dialog.getByRole('button', { name: `選取${name}`, exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('army-context-controls')).toBeVisible();
      await idle(page);
      const data = await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
      );
      const plate = data.armyPlateLayout.plates.find(
        (entry) => entry.id === army!.id && entry.selected,
      );
      const body = data.geographicLabelLayout.obstacles.find(
        (entry) => entry.id === army!.id && entry.kind === 'armyBody',
      );
      expect(plate).toBeDefined();
      expect(body).toBeDefined();
      const obstacles = await assertSafe(page, [body!.rect, plate!.rect]);
      observations.push({ scale, body, plate, obstacles });
      await page.screenshot({ path: info.outputPath(`hud-focus-selected-army-${scale}.png`) });
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(JSON.stringify(game));
    await info.attach('hud-focus-army', {
      body: JSON.stringify(observations),
      contentType: 'application/json',
    });
    // Only the explicitly focused target, not every unrelated army, is asserted.
    // Real Pixi bounds + DOM obstacles are geometry evidence; screenshots need review.
  });
});

test.describe('native HUD-safe focus with normal panel motion', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'no-preference' },
  });
  test('a real navigator castle selection centers against the final newly opened context panel', async ({
    page,
  }, info) => {
    await boot(page);
    await setScale(page, 1.5);
    const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
    await expect(context).toHaveCount(1);
    await context.locator('header button').click();
    await expect(context).toHaveCount(0);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const castle = Object.values(game.castles).find((entry) => entry.id === 'castle.sunpu')!;
    await page.getByTestId('rail-realm').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: '顯示種類', exact: true }).selectOption('castle');
    await dialog
      .getByRole('searchbox', { name: '搜尋地點、部隊或勢力', exact: true })
      .fill(castle.name);
    await dialog.getByRole('button', { name: `選取${castle.name}`, exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(context).toHaveCount(1);
    // Observe the real transition's final transform, not a fixed sleep or its
    // first animation-frame/offscreen rectangle.
    await expect
      .poll(() =>
        context.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          return transform === 'none' ? 0 : Math.abs(new DOMMatrixReadOnly(transform).m42);
        }),
      )
      .toBeLessThan(0.01);
    await idle(page);
    const initialFocus = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout,
    );
    await info.attach('hud-focus-context-before-camera-settles', {
      body: JSON.stringify({ data: initialFocus, hud: await hud(page) }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('hud-focus-context-before-camera-settles.png') });
    // waitMapIdle counts ticker frames, not Camera's 600ms focus animation.
    // Observe its real projected target against independently measured final
    // HUD bounds, with Playwright's existing default polling deadline.
    await expect
      .poll(async () => {
        const current = await page.evaluate(
          () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().castleRendering,
        );
        const target = current.nodes.find((entry) => entry.id === castle.id);
        if (!target) return Infinity;
        const measured = await hud(page);
        const { x, y } = target.anchor;
        return Math.max(
          Math.abs(x - (measured.safe.x + measured.safe.width / 2)),
          Math.abs(y - (measured.safe.y + measured.safe.height / 2)),
        );
      })
      .toBeLessThanOrEqual(1);
    const data = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout,
    );
    const ribbon = data.castles.find((entry) => entry.id === castle.id);
    expect(ribbon).toBeDefined();
    const obstacles = await hud(page);
    const model = await page.evaluate(
      (id) =>
        (window as DebugWindow).__tenka.debug
          .getMapDiagnostics()
          .castleRendering.nodes.find((entry) => entry.id === id),
      castle.id,
    );
    expect(model).toBeDefined();
    const anchor = model!.anchor;
    await info.attach('hud-focus-final-context-motion-raw', {
      body: JSON.stringify({ anchor, ribbon, obstacles, data }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('hud-focus-normal-context-motion-raw.png') });
    await assertSafe(page, [ribbon!.rect]);
    expect(Math.abs(anchor.x - (obstacles.safe.x + obstacles.safe.width / 2))).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(anchor.y - (obstacles.safe.y + obstacles.safe.height / 2))).toBeLessThanOrEqual(
      1,
    );
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(JSON.stringify(game));
    await idle(page);
    const stable = await page.evaluate(
      (castleId) =>
        (window as DebugWindow).__tenka.debug
          .getMapDiagnostics()
          .armyPlateLayout.castles.find((entry) => entry.id === castleId),
      castle.id,
    );
    expect(stable).toBeDefined();
    expect(Math.abs(stable!.rect.x - ribbon!.rect.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(stable!.rect.y - ribbon!.rect.y)).toBeLessThanOrEqual(1);
    await info.attach('hud-focus-final-context-motion', {
      body: JSON.stringify({ anchor, ribbon, obstacles }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('hud-focus-normal-context-motion.png') });
  });
});
