import type { Page } from '@playwright/test';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };
function overlap(a: Rect, b: Rect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
async function scale(page: Page, value: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog'),
    slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(value === 1.5 ? 'End' : 'Home');
  if (value === 1) for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}

test.describe('native geographic-text semantic obstruction audit', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });
  test('records six unchanged views without assuming every view has a collision', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const original = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const value of [0.8, 1, 1.5] as const) {
      await scale(page, value);
      for (const castle of ['castle.sunpu', 'castle.narumi'] as const) {
        const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
        if (await context.count()) await context.locator('header button').click();
        await page.evaluate(() =>
          (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'),
        );
        if (castle === 'castle.narumi') {
          const pos = await page.evaluate(
            () =>
              Object.values((window as DebugWindow).__tenka.debug.getState().castles).find(
                (entry) => entry.id === 'castle.narumi',
              )!.pos,
          );
          const mini = page.getByTestId('minimap-frame'),
            bounds = await mini.boundingBox();
          expect(bounds).not.toBeNull();
          await mini.click({
            position: { x: (pos.x / 4096) * bounds!.width, y: (pos.y / 4096) * bounds!.height },
          });
        }
        await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
        const data = await page.evaluate(() =>
          (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
        );
        const shapes: { id: string; kind: string; rect: Rect }[] = [
          ...data.armyRendering.signals.flatMap((signal) =>
            signal.visible && signal.rect
              ? [{ id: signal.id, kind: 'armySignal', rect: signal.rect }]
              : [],
          ),
          ...data.actorDepth.bodies.flatMap((body) =>
            body.visible && body.rect
              ? [
                  {
                    id: body.id,
                    kind: body.kind === 'army' ? 'soldier' : 'castleBody',
                    rect: body.rect,
                  },
                ]
              : [],
          ),
          ...data.castleRendering.nodes.flatMap((node) => [
            ...(node.warning ? [{ id: node.id, kind: 'castleWarning', rect: node.warning }] : []),
            ...(node.durability
              ? [{ id: node.id, kind: 'castleDurability', rect: node.durability }]
              : []),
          ]),
        ];
        const pairs = data.geographicLabelLayout.labels.flatMap((label) =>
          shapes.flatMap((shape) => {
            const area = overlap(label.rect, shape.rect);
            return area > 0
              ? [
                  {
                    labelId: label.id,
                    labelKind: label.kind,
                    text: label.text,
                    shapeId: shape.id,
                    shapeKind: shape.kind,
                    area,
                    label: label.rect,
                    shape: shape.rect,
                    anchor: label.anchor,
                    offset: label.offset,
                  },
                ]
              : [];
          }),
        );
        const totals: Record<string, number> = {};
        for (const pair of pairs)
          totals[pair.shapeKind] = (totals[pair.shapeKind] ?? 0) + pair.area;
        const visibility = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="screen-strategy"] canvas')!;
          const c = canvas.getBoundingClientRect();
          const rect = (e: Element) => {
            const b = e.getBoundingClientRect();
            return { x: b.x - c.x, y: b.y - c.y, width: b.width, height: b.height };
          };
          return {
            canvas: { x: 0, y: 0, width: c.width, height: c.height },
            hud: [
              ...document.querySelectorAll(
                '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], [data-testid="screen-strategy"] > div[aria-hidden="false"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *',
              ),
            ]
              .map(rect)
              .filter((b) => b.width > 0 && b.height > 0),
          };
        });
        const hp = data.castleRendering.nodes.find(
          (node) => node.id === 'castle.sunpu',
        )?.durability;
        const label = data.geographicLabelLayout.labels.find(
          (entry) => entry.id === 'dist.sunpu-higashi',
        );
        const hpControl =
          hp && label
            ? {
                baseline: overlap(label.baseline, hp),
                current: overlap(label.rect, hp),
                label: label.rect,
                hp,
              }
            : null;
        const fixedCastleControls = data.geographicLabelLayout.labels.flatMap((label) =>
          shapes
            .filter((shape) => shape.kind.startsWith('castle'))
            .map((shape) => ({
              labelId: label.id,
              shapeId: shape.id,
              shapeKind: shape.kind,
              baseline: overlap(label.baseline, shape.rect),
              current: overlap(label.rect, shape.rect),
              label: label.rect,
              shape: shape.rect,
            })),
        );
        const observation = {
          value,
          castle,
          totals,
          pairs,
          data,
          visibility,
          hpControl,
          fixedCastleControls,
        };
        observations.push(observation);
        await info.attach(`geography-semantics-${castle}-${value}`, {
          body: JSON.stringify(observation),
          contentType: 'application/json',
        });
        await page.screenshot({
          path: info.outputPath(`geography-semantics-${castle}-${value}.png`),
        });
        expect(data.geographicLabelLayout.labels.length).toBeGreaterThan(0);
        for (const shape of shapes)
          expect(Object.values(shape.rect).every(Number.isFinite)).toBe(true);
      }
    }
    await info.attach('geography-semantic-audit-summary', {
      body: JSON.stringify(
        observations.map(({ value, castle, totals, pairs }) => ({ value, castle, totals, pairs })),
      ),
      contentType: 'application/json',
    });
    const control = observations.find((o) => o.value === 1.5 && o.castle === 'castle.narumi')!;
    expect(control.hpControl).not.toBeNull();
    for (const rect of [control.hpControl!.label, control.hpControl!.hp]) {
      expect(overlap(rect, control.visibility.canvas)).toBeCloseTo(rect.width * rect.height, 5);
      for (const hud of control.visibility.hud) expect(overlap(rect, hud)).toBe(0);
    }
    // Preserve a clear baseline: moving this mandatory label must not newly
    // cover the visible HP frame. This is a frame oracle, not opaque glyph proof.
    expect(control.hpControl!.baseline).toBe(0);
    expect(control.hpControl!.current).toBeLessThanOrEqual(control.hpControl!.baseline);
    for (const observation of observations)
      for (const fixed of observation.fixedCastleControls)
        expect(
          fixed.current,
          `${observation.castle}/${observation.value}: ${fixed.labelId} versus ${fixed.shapeKind}/${fixed.shapeId}`,
        ).toBeLessThanOrEqual(fixed.baseline);
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(original);
    expect(errors).toEqual([]);
  });
});
