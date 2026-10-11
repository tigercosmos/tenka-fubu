import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

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

async function observe(page: Page, id: string) {
  return page.evaluate((castleId) => {
    const diagnostics = (window as DebugWindow).__tenka.debug.getMapDiagnostics();
    const ribbon = diagnostics.armyPlateLayout.castles.find((entry) => entry.id === castleId);
    const model = diagnostics.castleRendering.nodes.find((entry) => entry.id === castleId);
    const canvas = document.querySelector('[data-testid="map-canvas-host"] canvas')!;
    const origin = canvas.getBoundingClientRect();
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
    };
    const inspector = document.querySelector('[data-testid="siege-overlay"]');
    const hud = [
      ...document.querySelectorAll(
        '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="screen-strategy"] > div[aria-hidden="false"]',
      ),
    ]
      .filter((element) => element.getClientRects().length > 0)
      .map(rect);
    const root = document.querySelector('[data-testid="screen-strategy"]')!;
    const header = root.querySelector(':scope > header')!.getBoundingClientRect();
    const nav = root.querySelector(':scope > nav')!.getBoundingClientRect();
    const legend = document.querySelector('[data-testid="layer-control"]')!.getBoundingClientRect();
    const context = root
      .querySelector(':scope > div[aria-hidden="false"]')
      ?.getBoundingClientRect();
    const reports = root.querySelector(':scope > section[aria-live="polite"]');
    const rightBlocks = [
      document.querySelector('[data-testid="minimap"]'),
      ...(reports?.children ?? []),
    ]
      .filter((element) => element && element.getClientRects().length > 0)
      .map((element) => element!.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const left =
      Math.max(nav.right, inspector?.getBoundingClientRect().right ?? nav.right) - origin.left + 12;
    const top = Math.max(header.bottom, legend.bottom) - origin.top + 12;
    const right = Math.min(origin.width, ...rightBlocks.map((r) => r.left - origin.left - 12));
    const bottom = context ? context.top - origin.top - 12 : origin.height;
    const safe = { x: left, y: top, width: right - left, height: bottom - top };
    return { ribbon, model, inspector: inspector ? rect(inspector) : null, hud, safe };
  }, id);
}

// Independent projection of the original PNG's alpha>8 visible frame and
// visually authored ground anchor. This is an art-frame envelope, not an
// assertion that every enclosed pixel is opaque or a semantic roof mask.
function modelFrame(id: string, anchor: { x: number; y: number }): Rect {
  const main = id === 'castle.sunpu';
  const frame = main
    ? { x: 5, y: 95, width: 1244, height: 1064, ax: 627, ay: 875 }
    : { x: 12, y: 210, width: 1232, height: 943, ax: 627, ay: 900 };
  // Painted-only hierarchy contract, art-bible section 6.4.3. Far vectors retain28/20.
  const worldWidth = main ? 40 : 30;
  const scale = (worldWidth / frame.width) * 1.5;
  return {
    x: anchor.x + (frame.x - frame.ax) * scale,
    y: anchor.y + (frame.y - frame.ay) * scale,
    width: frame.width * scale,
    height: frame.height * scale,
  };
}

test.describe('native castle artwork and siege inspector layout', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  test('normal-motion selected Sunpu siege inspector clears actual artwork and HUD at three scales; Narumi stays ordinary', async ({
    page,
  }, info) => {
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const id of ['castle.sunpu', 'castle.narumi']) {
        await selectCastle(page, id);
        const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
        await expect
          .poll(() =>
            context.evaluate((element) => {
              const value = getComputedStyle(element).transform;
              return value === 'none' ? 0 : Math.abs(new DOMMatrixReadOnly(value).m42);
            }),
          )
          .toBeLessThan(0.01);
        // Poll the independent final DOM-safe center, not stationary samples
        // that could both precede the deferred camera animation.
        await expect
          .poll(async () => {
            const current = await observe(page, id);
            if (
              !current.ribbon ||
              !current.model ||
              current.safe.width <= 0 ||
              current.safe.height <= 0
            )
              return Infinity;
            // Local ribbon staggering does not move the model's world anchor.
            const anchor = current.model.anchor;
            return Math.max(
              Math.abs(anchor.x - current.safe.x - current.safe.width / 2),
              Math.abs(anchor.y - current.safe.y - current.safe.height / 2),
            );
          })
          .toBeLessThanOrEqual(1);
        const data = await observe(page, id);
        expect(data.ribbon).toBeDefined();
        expect(data.model).toBeDefined();
        const body = modelFrame(id, data.model!.anchor);
        await info.attach(`castle-model-${id}-${scale}`, {
          body: JSON.stringify({ data, body }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`castle-model-${id}-${scale}.png`) });
        if (id === 'castle.sunpu') {
          expect(data.inspector).not.toBeNull();
          expect(
            area(data.inspector!, body),
            'siege inspector does not cover the castle art frame',
          ).toBe(0);
          for (const block of data.hud)
            expect(area(data.inspector!, block), 'siege inspector clears settled HUD blocks').toBe(
              0,
            );
          const inspector = page.getByTestId('siege-overlay');
          const bars = inspector.getByRole('progressbar');
          await expect(bars).toHaveCount(3);
          const castle = await page.evaluate(
            (castleId) =>
              Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
                (entry) => entry.id === castleId,
              )!,
            id,
          );
          await expect(bars.nth(0)).toHaveAttribute('aria-valuenow', String(castle.durability));
          await expect(bars.nth(1)).toHaveAttribute('aria-valuenow', String(castle.morale));
          expect(Number(await bars.nth(2).getAttribute('aria-valuenow'))).toBeGreaterThan(0);
          for (const bar of await bars.all()) {
            expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
            expect(await bar.getAttribute('aria-label')).toBeTruthy();
          }
          const encircle = inspector.getByRole('radio', { name: '包圍', exact: true });
          const assault = inspector.getByRole('radio', { name: '強攻', exact: true });
          await expect(inspector.getByRole('radio')).toHaveCount(2);
          await expect(encircle).toBeDisabled();
          await expect(assault).toBeEnabled();
          await expect(assault).toBeChecked();
          const reasonId = await encircle.getAttribute('aria-describedby');
          expect(reasonId).toBeTruthy();
          const reason = inspector.locator(`[id="${reasonId}"]`);
          await expect(reason).toContainText('包圍需兵力達城兵');
          for (const label of await inspector.locator('fieldset label').all())
            expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(32);
          if (scale === 1.5) {
            await reason.scrollIntoViewIfNeeded();
            const visible = await reason.evaluate((element) => {
              const panel = element.closest('[data-testid="siege-overlay"]')!;
              const r = element.getBoundingClientRect(),
                p = panel.getBoundingClientRect();
              return (
                r.top >= p.top + panel.clientTop - 1 &&
                r.bottom <= p.top + panel.clientTop + panel.clientHeight + 1
              );
            });
            expect(visible, 'disabled reason is reachable within actual inspector viewport').toBe(
              true,
            );
            let reached = false;
            for (let step = 0; step < 100 && !reached; step++) {
              await page.keyboard.press('Shift+Tab');
              reached = await assault.evaluate((element) => document.activeElement === element);
            }
            expect(reached, 'enabled siege radio is reachable by real keyboard navigation').toBe(
              true,
            );
          }
        } else {
          expect(data.inspector).toBeNull();
        }
      }
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
  });

  test('actual selected and siege ground marks are behind original castle models, with compact separate durability and warning channels', async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    for (const scale of [0.8, 1, 1.5] as const) {
      await setScale(page, scale);
      for (const id of ['castle.narumi', 'castle.sunpu', 'castle.kakegawa']) {
        await selectCastle(page, id);
        const rendering = await page.evaluate(
          () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().castleRendering,
        );
        const node = rendering.nodes.find((entry) => entry.id === id);
        await info.attach(`castle-status-${id}-${scale}`, {
          body: JSON.stringify({ rendering, id }),
          contentType: 'application/json',
        });
        await page.screenshot({ path: info.outputPath(`castle-status-${id}-${scale}.png`) });
        expect(node).toBeDefined();
        expect(node!.painted).toBe(true);
        expect(node!.bodyFrameKind).toBe('alphaContentFrame');
        expect(node!.selection).not.toBeNull();
        expect(rendering.groundOrder).toBeGreaterThanOrEqual(0);
        expect(rendering.groundOrder).toBeLessThan(node!.modelOrder);
        expect(node!.selection!.behindBody).toBe(true);
        expect(node!.selection!.rect.height / node!.selection!.rect.width).toBeLessThan(0.5);
        expect(node!.durability).not.toBeNull();
        expect(node!.durability!.height / node!.durability!.width).toBeLessThan(0.15);
        expect(
          area(node!.durability!, node!.body),
          'durability channel does not paint across original art frame',
        ).toBe(0);
        if (id === 'castle.narumi') {
          expect(node!.siege).toBeNull();
          expect(node!.warning).toBeNull();
          const context = page.locator(
            '[data-testid="screen-strategy"] > div[aria-hidden="false"]',
          );
          await context.locator('header button').click();
          await expect(context).toHaveCount(0);
          await expect
            .poll(() =>
              page.evaluate(
                (castleId) =>
                  (window as DebugWindow).__tenka.debug
                    .getMapDiagnostics()
                    .castleRendering.nodes.find((entry) => entry.id === castleId)?.selection,
                id,
              ),
            )
            .toBeNull();
          const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
          expect(canvas).not.toBeNull();
          const occupyingArmy = await page.evaluate(() =>
            Object.values((window as DebugWindow).__tenka.debug.getState().armies).find(
              (army) => army.leaderId === 'off.oda-nagahide',
            ),
          );
          expect(occupyingArmy).toBeDefined();
          expect(occupyingArmy!.soldiers).toBe(900);
          await page.mouse.click(canvas!.x + node!.anchor.x, canvas!.y + node!.anchor.y);
          await expect
            .poll(() =>
              page.evaluate(
                (armyId) =>
                  (window as DebugWindow).__tenka.debug
                    .getMapDiagnostics()
                    .armyPlateLayout.plates.find((entry) => entry.id === armyId)?.selected,
                occupyingArmy!.id,
              ),
            )
            .toBe(true);
          await expect(context).toHaveCount(1);
          await expect(context).toContainText('900人');
          await expect(context).toContainText('鳴海西郡');
        } else {
          expect(node!.siege).not.toBeNull();
          expect(node!.siege!.behindBody).toBe(true);
          expect(node!.siege!.rect.height / node!.siege!.rect.width).toBeLessThan(0.5);
          expect(node!.warning).not.toBeNull();
          expect(area(node!.warning!, node!.body), 'warning badge clears original art frame').toBe(
            0,
          );
        }
      }
      // Army-first hit priority is intentional at occupied Narumi. Preserve a
      // separate genuine castle-pointer control at the unoccupied Kiyosu node.
      await selectCastle(page, 'castle.kiyosu');
      const kiyosu = await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug
          .getMapDiagnostics()
          .castleRendering.nodes.find((entry) => entry.id === 'castle.kiyosu'),
      );
      expect(kiyosu).toBeDefined();
      const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
      await context.locator('header button').click();
      await expect(context).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as DebugWindow).__tenka.debug
                .getMapDiagnostics()
                .castleRendering.nodes.find((entry) => entry.id === 'castle.kiyosu')?.selection,
          ),
        )
        .toBeNull();
      const canvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
      expect(canvas).not.toBeNull();
      await page.mouse.click(canvas!.x + kiyosu!.anchor.x, canvas!.y + kiyosu!.anchor.y);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(
              (window as DebugWindow).__tenka.debug
                .getMapDiagnostics()
                .castleRendering.nodes.find((entry) => entry.id === 'castle.kiyosu')?.selection,
            ),
          ),
        )
        .toBe(true);
      await expect(context).toHaveCount(1);
    }
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'));
    await idle(page);
    const far = await page.evaluate(() =>
      (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
    );
    await info.attach('castle-status-far', {
      body: JSON.stringify(far.castleRendering),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('castle-status-far.png') });
    expect(far.lodStage).toBe('far');
    const critical = far.castleRendering.nodes.find((entry) => entry.id === 'castle.sunpu');
    expect(critical).toBeDefined();
    expect(critical!.painted).toBe(false);
    expect(critical!.bodyFrameKind).toBe('vectorNominal');
    expect(critical!.durability).not.toBeNull();
    expect(critical!.warning).not.toBeNull();
    expect(critical!.siege).not.toBeNull();
    expect(critical!.siege!.behindBody).toBe(true);
    expect(far.castleRendering.groundOrder).toBeLessThan(critical!.modelOrder);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    // Far vectorNominal is not an opaque roof envelope; do not assert its whole
    // bounding box is disjoint from status paint. Bounds/order observations
    // and actual screenshots are not an opaque-pixel
    // roof segmentation or independent GPU compositing proof.
  });
});
