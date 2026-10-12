import { test, expect, type Page } from '@playwright/test';
import { waitForMapReady } from '../../e2e/map-ready';

type RingWitness = {
  visible: boolean;
  worldX: number;
  worldY: number;
  scale: number;
  groundY: number;
  alpha: number;
};

async function ringWitness(page: Page): Promise<RingWitness> {
  return page.evaluate(async () => {
    const path = '/src/ui/map/debugMapBridge.ts';
    const bridge = (await import(/* @vite-ignore */ path)) as {
      getDebugMapRenderer(): {
        selectionRing: {
          container: {
            visible: boolean;
            position: { x: number; y: number };
            alpha: number;
            children: Array<{
              scale: { x: number; y: number };
              position: { y: number };
            }>;
          };
        } | null;
      } | null;
    };
    const ring = bridge.getDebugMapRenderer()?.selectionRing?.container;
    const gfx = ring?.children[0];
    if (!ring || !gfx) throw new Error('Mounted selection ring absent');
    return {
      visible: ring.visible,
      worldX: ring.position.x,
      worldY: ring.position.y,
      scale: gfx.scale.x,
      groundY: gfx.position.y + 4 * gfx.scale.y,
      alpha: ring.alpha,
    };
  });
}

async function selectFirstCastle(page: Page, selected: boolean): Promise<void> {
  await page.evaluate(async (shouldSelect) => {
    const path = '/src/ui/map/debugMapBridge.ts';
    const bridge = (await import(/* @vite-ignore */ path)) as {
      getDebugMapRenderer(): {
        getPublishedViewSnapshot(): {
          castles: Array<{ id: string }>;
          selection: unknown;
        };
        updateView(view: unknown): void;
      } | null;
    };
    const renderer = bridge.getDebugMapRenderer();
    if (!renderer) throw new Error('Mounted map renderer absent');
    const view = renderer.getPublishedViewSnapshot();
    const id = view.castles[0]?.id;
    if (!id) throw new Error('No castle in visual map fixture');
    renderer.updateView({
      ...view,
      selection: shouldSelect ? { kind: 'node', id } : null,
    });
  }, selected);
}

test('real selected castle ground ring pulses while ordinary motion is allowed and is static under OS reduction', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await waitForMapReady(page);
  await page.evaluate(async () => {
    await window.__tenka.debug.waitSimulationIdle();
    await window.__tenka.debug.waitMapIdle();
  });
  const gameBefore = JSON.stringify(await page.evaluate(() => window.__tenka.debug.getState()));
  const commandsBefore = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
  );

  await selectFirstCastle(page, true);
  const initial = await ringWitness(page);
  expect(initial.visible).toBe(true);
  const expandedSamples: RingWitness[] = [];
  await expect
    .poll(
      async () => {
        const sample = await ringWitness(page);
        if (sample.scale > 1.04 && sample.alpha < 0.75) expandedSamples.push(sample);
        return expandedSamples.length > 0;
      },
      { timeout: 3000, intervals: [50] },
    )
    .toBe(true);
  const expanded = expandedSamples.at(-1);
  if (!expanded) throw new Error('Selected ring never reached the expansion frame');
  expect(expanded.groundY).toBeCloseTo(4, 5);
  expect({ x: expanded.worldX, y: expanded.worldY }).toEqual({
    x: initial.worldX,
    y: initial.worldY,
  });
  const ordinaryPath = info.outputPath('selected-ordinary.png');
  await page.screenshot({ path: ordinaryPath });
  await info.attach('selected-ordinary', { path: ordinaryPath, contentType: 'image/png' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  const reducedSamples: RingWitness[] = [];
  for (let index = 0; index < 3; index += 1) {
    if (index) await page.waitForTimeout(650);
    const sample = await ringWitness(page);
    reducedSamples.push(sample);
    expect(sample.scale).toBe(1);
    expect(sample.alpha).toBe(1);
    expect(sample.groundY).toBe(4);
  }
  const reducedPath = info.outputPath('selected-reduced.png');
  await page.screenshot({ path: reducedPath });
  await info.attach('selected-reduced', { path: reducedPath, contentType: 'image/png' });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  await expect
    .poll(async () => (await ringWitness(page)).scale, { timeout: 3000, intervals: [50] })
    .toBeGreaterThan(1.04);
  await selectFirstCastle(page, false);
  await expect
    .poll(async () => ringWitness(page))
    .toMatchObject({
      visible: false,
      scale: 1,
      alpha: 1,
    });
  expect(JSON.stringify(await page.evaluate(() => window.__tenka.debug.getState()))).toBe(
    gameBefore,
  );
  expect(JSON.stringify(await page.evaluate(() => window.__tenka.debug.exportCommandLog()))).toBe(
    commandsBefore,
  );
  await info.attach('ring-witness', {
    body: JSON.stringify({ initial, expanded, reducedSamples }),
    contentType: 'application/json',
  });
});
