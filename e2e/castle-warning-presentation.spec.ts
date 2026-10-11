import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { GameState } from '../src/core/state/gameState';
import { validateState } from '../src/core/state/invariants';
import { test, expect } from './fixtures';

type Rect = { x: number; y: number; width: number; height: number };
const area = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
function warningPixels(
  image: Buffer,
  observed: Awaited<ReturnType<typeof capture>>,
  target: string,
) {
  const rect = observed.diagnostics.castleRendering.nodes.find((n) => n.id === target)?.warning;
  if (!rect) return null;
  const png = PNG.sync.read(image);
  const adjacentPoint = { x: Math.floor(rect.x + rect.width / 2), y: Math.floor(rect.y) - 2 };
  const bp = (adjacentPoint.y * png.width + adjacentPoint.x) * 4;
  const adjacentRGB = Array.from(png.data.subarray(bp, bp + 3));
  let sampleCount = 0,
    maxContrast = 0;
  for (let y = Math.ceil(rect.y - 0.5); y < Math.ceil(rect.y + rect.height - 0.5); y++)
    for (let x = Math.ceil(rect.x - 0.5); x < Math.ceil(rect.x + rect.width - 0.5); x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const p = (y * png.width + x) * 4;
      sampleCount++;
      for (let c = 0; c < 3; c++)
        maxContrast = Math.max(maxContrast, Math.abs(png.data[p + c]! - adjacentRGB[c]!));
    }
  // Fixed geometry-selected point; terrain may also contribute contrast.
  // This records paint/context evidence, never a recognition threshold.
  return { rect, sampleCount, adjacentPoint, adjacentRGB, maxContrast };
}
async function uiScale(page: Page, value: 0.8 | 1 | 1.5) {
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
async function capture(page: Page) {
  return page.evaluate(() => {
    const canvas = document
      .querySelector('[data-testid="map-canvas-host"] canvas')!
      .getBoundingClientRect();
    const hud = Array.from(
      document.querySelectorAll(
        '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="siege-overlay"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *, [data-testid="screen-strategy"] > div[aria-hidden="false"]',
      ),
    )
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x - canvas.x, y: r.y - canvas.y, width: r.width, height: r.height };
      })
      .filter((r) => r.width > 0 && r.height > 0);
    return {
      diagnostics: window.__tenka.debug.getMapDiagnostics(),
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
      canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      hud,
    };
  });
}
async function settled(page: Page, target: string, painted: boolean) {
  let previous = '',
    stable = 0;
  await expect
    .poll(
      async () => {
        const current = await page.evaluate(
          ({ target, painted }) => {
            const data = window.__tenka.debug.getMapDiagnostics();
            if (data.castleRendering.nodes.find((n) => n.id === target)?.painted !== painted)
              return null;
            return JSON.stringify({ castles: data.castleRendering, depth: data.actorDepth });
          },
          { target, painted },
        );
        if (current === null) {
          previous = '';
          stable = 0;
          return stable;
        }
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      { intervals: [50] },
    )
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
}

test.use({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  contextOptions: { reducedMotion: 'reduce' },
});
test('mini-campaign fixture warning presentation at twelve real UI/camera views, not earned siege', async ({
  page,
}, info) => {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.fonts.ready);
  const initial = await capture(page);
  const rows: {
    ui: number;
    target: string;
    preset: string;
    observed: Awaited<ReturnType<typeof capture>>;
    idle: Awaited<ReturnType<typeof capture>>;
    pixels: ReturnType<typeof warningPixels>;
  }[] = [];
  try {
    for (const ui of [0.8, 1, 1.5] as const) {
      await uiScale(page, ui);
      const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
      if (await context.count()) {
        await context.locator('header button').click();
        await expect(context).toHaveCount(0);
      }
      for (const preset of ['overview', 'operational', 'close'] as const) {
        await page.evaluate((p) => window.__tenka.debug.setMapCameraPreset(p), preset);
        await settled(page, 'castle.sunpu', preset !== 'overview');
        const observed = await capture(page);
        const image = await page.screenshot({
          path: info.outputPath(`warning-sunpu-${preset}-${ui}.png`),
        });
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
        rows.push({
          ui,
          target: 'castle.sunpu',
          preset,
          observed,
          idle: await capture(page),
          pixels: warningPixels(image, observed, 'castle.sunpu'),
        });
      }
      // Real minimap pointer retains the existing close camera. No debug
      // selection, army spawn, siege mutation or synthetic calendar tick.
      const position = await page.evaluate(
        () =>
          window.__tenka.debug.getState().castles[
            'castle.kakegawa' as keyof ReturnType<Window['__tenka']['debug']['getState']>['castles']
          ]!.pos,
      );
      const mini = page.getByTestId('minimap-frame'),
        box = await mini.boundingBox();
      expect(box).not.toBeNull();
      await mini.click({
        position: { x: (position.x / 4096) * box!.width, y: (position.y / 4096) * box!.height },
      });
      await settled(page, 'castle.kakegawa', true);
      const observed = await capture(page);
      const image = await page.screenshot({
        path: info.outputPath(`warning-kakegawa-close-${ui}.png`),
      });
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
      rows.push({
        ui,
        target: 'castle.kakegawa',
        preset: 'close',
        observed,
        idle: await capture(page),
        pixels: warningPixels(image, observed, 'castle.kakegawa'),
      });
    }
  } finally {
    await info.attach('warning-campaign-observations', {
      body: JSON.stringify(
        {
          scope: 'unchanged debugVisual mini-campaign, not national or earned siege',
          initial,
          rows,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  }
  // The baseline14CSS failure occurs only after all twelve PNG/raw captures.
  expect(rows).toHaveLength(12);
  const state = JSON.parse(initial.state) as GameState;
  expect(validateState(state)).toEqual([]);
  expect(Object.values(state.sieges).find((s) => s.castleId === 'castle.sunpu')?.mode).toBe(
    'assault',
  );
  expect(Object.values(state.sieges).find((s) => s.castleId === 'castle.kakegawa')?.mode).toBe(
    'encircle',
  );
  for (const row of rows) {
    expect(row.observed.state).toBe(initial.state);
    expect(row.observed.commands).toBe(initial.commands);
    expect(row.idle.state).toBe(initial.state);
    expect(row.idle.commands).toBe(initial.commands);
    expect(row.idle.diagnostics.castleRendering).toEqual(row.observed.diagnostics.castleRendering);
    expect(row.idle.diagnostics.actorDepth).toEqual(row.observed.diagnostics.actorDepth);
    expect(row.idle.diagnostics.resources).toEqual(row.observed.diagnostics.resources);
    const nodes = row.observed.diagnostics.castleRendering.nodes;
    const castle = nodes.find((n) => n.id === row.target);
    expect(castle).toBeDefined();
    expect(castle!.warning).not.toBeNull();
    expect(castle!.painted).toBe(row.preset !== 'overview');
    expect(castle!.bodyFrameKind).toBe(
      row.preset === 'overview' ? 'vectorNominal' : 'alphaContentFrame',
    );
    const warning = castle!.warning!;
    expect(warning.width).toBeCloseTo(14, 8);
    expect(warning.height).toBeCloseTo(14, 8);
    expect(castle!.body.y - warning.y - warning.height).toBeGreaterThanOrEqual(2 - 1e-7);
    expect(area(warning, castle!.body)).toBe(0);
    expect(warning.x).toBeGreaterThanOrEqual(0);
    expect(warning.y).toBeGreaterThanOrEqual(0);
    expect(warning.x + warning.width).toBeLessThanOrEqual(row.observed.canvas.width);
    expect(warning.y + warning.height).toBeLessThanOrEqual(row.observed.canvas.height);
    for (const block of row.observed.hud)
      expect(area(warning, block), 'actual warning clears measured HUD').toBe(0);
    expect(castle!.siege?.behindBody).toBe(true);
    if (row.preset === 'overview')
      expect(nodes.some((n) => n.id === 'castle.kakegawa' || n.id === 'castle.narumi')).toBe(false);
    if (row.preset === 'close') {
      const narumi = nodes.find((n) => n.id === 'castle.narumi');
      expect(narumi).toBeDefined();
      expect(narumi!.warning).toBeNull();
    }
  }
});
