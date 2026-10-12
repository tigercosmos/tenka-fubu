import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type Rect = { x: number; y: number; width: number; height: number };
type Body = {
  id: string;
  kind: 'castle' | 'army';
  footY: number;
  order: number;
  visible: boolean;
  selected: boolean;
  rect: Rect | null;
};
type Depth = {
  bodies: Body[];
  modelLayerOrder: number;
  semanticLayerOrders: { castle: number; army: number };
};
type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
const intersection = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function idle(page: Page) {
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
}
async function observe(page: Page) {
  return page.evaluate(() => {
    const diagnostics = (window as DebugWindow).__tenka.debug.getMapDiagnostics() as ReturnType<
      TenkaDebugApi['getMapDiagnostics']
    > & { actorDepth?: Depth };
    return {
      depth: diagnostics.actorDepth,
      plates: diagnostics.armyPlateLayout,
      castles: diagnostics.castleRendering,
      elevation: diagnostics.elevationRendering,
    };
  });
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
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function near(page: Page, id: 'castle.sunpu' | 'castle.narumi') {
  const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
  if (await context.count()) {
    await context.locator('header button').click();
    await expect(context).toHaveCount(0);
  }
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
  if (id === 'castle.narumi') {
    const pos = await page.evaluate(
      () =>
        Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
          (entry) => entry.id === 'castle.narumi',
        )!.pos,
    );
    const mini = page.getByTestId('minimap-frame');
    const box = await mini.boundingBox();
    expect(box).not.toBeNull();
    await mini.click({
      position: { x: (pos.x / 4096) * box!.width, y: (pos.y / 4096) * box!.height },
    });
  }
  await idle(page);
}
function ordered(depth: Depth) {
  expect(depth.modelLayerOrder).toBeGreaterThanOrEqual(0);
  expect(depth.semanticLayerOrders.army).toBeGreaterThan(depth.modelLayerOrder);
  expect(depth.semanticLayerOrders.castle).toBeGreaterThan(depth.modelLayerOrder);
  const visible = depth.bodies.filter(
    (entry): entry is Body & { rect: Rect } => entry.visible && entry.rect !== null,
  );
  expect(visible.some((entry) => entry.kind === 'castle')).toBe(true);
  expect(visible.some((entry) => entry.kind === 'army')).toBe(true);
  for (const body of visible) {
    expect(Number.isFinite(body.footY)).toBe(true);
    expect(body.order).toBeGreaterThanOrEqual(0);
    expect(Object.values(body.rect).every(Number.isFinite)).toBe(true);
    expect(body.rect.width).toBeGreaterThan(0);
    expect(body.rect.height).toBeGreaterThan(0);
  }
  // Independent ordering of published world foot coordinates versus actual
  // scene child indices. Neither the production comparator nor solver imported.
  const expected = [...visible].sort(
    (a, b) =>
      a.footY - b.footY ||
      (`${a.kind}:${a.id}` < `${b.kind}:${b.id}`
        ? -1
        : `${a.kind}:${a.id}` > `${b.kind}:${b.id}`
          ? 1
          : 0),
  );
  const actual = [...visible].sort((a, b) => a.order - b.order);
  expect(actual.map((entry) => `${entry.kind}:${entry.id}`)).toEqual(
    expected.map((entry) => `${entry.kind}:${entry.id}`),
  );
  return visible;
}

test.describe('native castle and troop body depth', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('actual shared body order follows world feet across three scales and selection does not lift troop bodies', async ({
    page,
  }, info) => {
    await boot(page);
    const game = await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState());
    const before = JSON.stringify(game);
    let mixedOverlap = 0;
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const id of ['castle.sunpu', 'castle.narumi'] as const) {
        await near(page, id);
        const data = await observe(page);
        await info.attach(`actor-depth-raw-${id}-${scale}`, {
          body: JSON.stringify(data),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`actor-depth-${id}-${scale}.png`) });
        expect(
          data.depth,
          'actual shared-model diagnostic exists; old built absence is structural RED only',
        ).toBeDefined();
        const bodies = ordered(data.depth);
        expect(data.elevation.active).toBe(true);
        expect(data.elevation.field).not.toBeNull();
        for (const castle of bodies.filter((entry) => entry.kind === 'castle')) {
          const canonical = Object.values(game.castles).find(
            (entry) => entry.id === castle.id,
          )!.pos;
          const projected = data.elevation.nodes.find((entry) => entry.id === castle.id);
          expect(projected).toBeDefined();
          expect(projected!.canonical).toEqual(canonical);
          const height = canonical.y - projected!.scene.y;
          expect(height).toBeGreaterThanOrEqual(-1e-8);
          expect(height).toBeLessThanOrEqual(data.elevation.field!.maximumHeight + 1e-8);
          expect(projected!.scene.x).toBeCloseTo(canonical.x - 0.18 * height, 6);
          expect(castle.footY).toBe(projected!.scene.y);
          for (const army of bodies.filter((entry) => entry.kind === 'army'))
            mixedOverlap += intersection(castle.rect, army.rect);
        }
        if (id === 'castle.sunpu') {
          expect(
            bodies.some((entry) => {
              if (entry.kind !== 'castle') return false;
              const projected = data.elevation.nodes.find((node) => node.id === entry.id);
              return projected !== undefined && projected.canonical.y - projected.scene.y > 1e-8;
            }),
            'Sunpu camera includes a visible elevated castle, so canonical Y is not a valid foot oracle',
          ).toBe(true);
        }
        const reference = data.castles.nodes.find((entry) => entry.painted);
        expect(reference).toBeDefined();
        const referenceCastle = Object.values(game.castles).find(
          (entry) => entry.id === reference!.id,
        )!;
        // Painted-only hierarchy contract; vector fallback dimensions are unchanged.
        const cameraScale = reference!.body.width / (referenceCastle.tier === 'main' ? 40 : 30);
        const referenceScene = data.elevation.nodes.find((entry) => entry.id === reference!.id);
        expect(referenceScene).toBeDefined();
        for (const army of bodies.filter((entry) => entry.kind === 'army')) {
          const plate = data.plates.plates.find((entry) => entry.id === army.id);
          expect(plate, 'visible near troop body retains its anchor-bearing plate').toBeDefined();
          const sceneY =
            referenceScene!.scene.y + (plate!.anchor.y - reference!.anchor.y) / cameraScale;
          // Near formation artwork's authored ground foot is one world unit
          // above its unchanged map/picking anchor; inferred independently from
          // actual plate/castle transforms, not the published footY itself.
          expect(army.footY).toBeCloseTo(sceneY - 1, 6);
        }
        if (id === 'castle.narumi') {
          const occupying = Object.values(game.armies).find(
            (entry) => entry.leaderId === 'off.oda-nagahide',
          )!;
          expect(occupying.soldiers).toBe(900);
          expect(
            data.plates.plates.find((entry) => entry.id === occupying.id)?.selected,
            'each selection comparison begins genuinely unselected',
          ).toBe(false);
          expect(
            data.depth.bodies.find((entry) => entry.id === occupying.id && entry.kind === 'army')
              ?.selected,
          ).toBe(false);
          const anchor = data.castles.nodes.find((entry) => entry.id === id)!.anchor;
          const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
          expect(canvas).not.toBeNull();
          await page.mouse.click(canvas!.x + anchor.x, canvas!.y + anchor.y);
          await expect
            .poll(
              async () =>
                (await observe(page)).plates.plates.find((entry) => entry.id === occupying.id)
                  ?.selected,
            )
            .toBe(true);
          const selected = (await observe(page)).depth;
          ordered(selected);
          expect(
            selected.bodies.find((entry) => entry.id === occupying.id && entry.kind === 'army')
              ?.selected,
          ).toBe(true);
          for (const old of bodies) {
            const fresh = selected.bodies.find(
              (entry) => entry.id === old.id && entry.kind === old.kind,
            );
            expect(fresh).toBeDefined();
            expect(fresh!.order, 'selection does not force a body to the foreground').toBe(
              old.order,
            );
            expect(fresh!.footY).toBe(old.footY);
          }
          await expect(page.getByTestId('army-context-controls')).toBeVisible();
        }
      }
    }
    expect(
      mixedOverlap,
      'unchanged fixture contains a real mixed body-frame overlap',
    ).toBeGreaterThan(0);
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    const far = await observe(page);
    await info.attach('actor-depth-selected-far', {
      body: JSON.stringify(far),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('actor-depth-selected-far.png') });
    expect(far.depth).toBeDefined();
    expect(far.depth.modelLayerOrder).toBeGreaterThanOrEqual(0);
    expect(far.depth.semanticLayerOrders.army).toBeGreaterThan(far.depth.modelLayerOrder);
    expect(far.depth.semanticLayerOrders.castle).toBeGreaterThan(far.depth.modelLayerOrder);
    const farArmies = far.depth.bodies.filter((entry) => entry.kind === 'army');
    expect(farArmies.length).toBeGreaterThan(0);
    for (const army of farArmies)
      expect(army.rect, 'far has no fictional infantry-body footprint').toBeNull();
    const occupying = Object.values(game.armies).find(
      (entry) => entry.leaderId === 'off.oda-nagahide',
    )!;
    expect(far.plates.plates.some((entry) => entry.id === occupying.id && entry.selected)).toBe(
      true,
    );
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
  });

  test('actual plate envelopes avoid visible castle body frames rather than only castle ribbons', async ({
    page,
  }, info) => {
    await boot(page);
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    let baselineTotal = 0,
      currentTotal = 0;
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const id of ['castle.sunpu', 'castle.narumi'] as const) {
        await near(page, id);
        const data = await observe(page);
        const castles = data.castles.nodes.map((entry) => ({ id: entry.id, rect: entry.body }));
        expect(castles.length).toBeGreaterThan(0);
        expect(data.plates.plates.length).toBeGreaterThan(0);
        const sum = (baseline: boolean) =>
          data.plates.plates.reduce(
            (total, plate) =>
              total +
              castles.reduce(
                (n, castle) =>
                  n + intersection(baseline ? plate.baseline : plate.rect, castle.rect),
                0,
              ),
            0,
          );
        const baseline = sum(true),
          current = sum(false);
        baselineTotal += baseline;
        currentTotal += current;
        await info.attach(`actor-plate-body-${id}-${scale}`, {
          body: JSON.stringify({ baseline, current, data }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`actor-plate-body-${id}-${scale}.png`) });
        expect(current, 'same actual castle body frames must not gain overlap').toBeLessThanOrEqual(
          baseline + 1e-7,
        );
        for (const plate of data.plates.plates)
          // HUD-aware information reflow uses an 80 CSS-pixel disk; model anchors stay fixed.
          expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
      }
    }
    expect(baselineTotal, 'must observe a genuine baseline castle body collision').toBeGreaterThan(
      0,
    );
    expect(currentTotal).toBeLessThan(baselineTotal);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
  });

  test('real normal-day movement updates world feet and actual body ordering, then remains stable while idle', async ({
    page,
  }, info) => {
    await boot(page);
    await near(page, 'castle.sunpu');
    const before = await observe(page);
    expect(before.depth).toBeDefined();
    ordered(before.depth);
    const day = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getState().time.day,
    );
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.stepDays(1));
    await idle(page);
    const after = await observe(page);
    expect(after.depth).toBeDefined();
    ordered(after.depth);
    expect(
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.getState().time.day),
    ).toBe(day + 1);
    const moved = after.depth.bodies.filter(
      (entry) =>
        entry.kind === 'army' &&
        entry.visible &&
        before.depth.bodies.some(
          (old) => old.id === entry.id && old.kind === entry.kind && old.footY !== entry.footY,
        ),
    );
    expect(moved.length, 'actual unchanged visual fixture moves a visible army').toBeGreaterThan(0);
    await idle(page);
    expect((await observe(page)).depth).toEqual(after.depth);
    await info.attach('actor-depth-normal-day', {
      body: JSON.stringify({ before, after, moved }),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('actor-depth-after-normal-day.png') });
    // Real driver on an existing synthetic visual fixture, not an earned
    // campaign or evidence that an actor crossed another actor's depth this day.
  });
});
