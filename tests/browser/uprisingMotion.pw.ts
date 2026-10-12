import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { waitForMapReady } from '../../e2e/map-ready';

type Witness = {
  warningVisible: boolean;
  districtVisible: boolean;
  warningLayerSeparated: boolean;
  renderer: string | null;
};

test('uprising DEV fixture preflight resolves the native map and source module', async ({
  page,
}) => {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await waitForMapReady(page);
  const count = await page.evaluate(async () => {
    const path = '/src/ui/map/debugMapBridge.ts';
    const bridge = (await import(/* @vite-ignore */ path)) as {
      getDebugMapRenderer(): {
        getPublishedViewSnapshot(): { districts?: Array<{ id: string }> };
      } | null;
    };
    const renderer = bridge.getDebugMapRenderer();
    if (!renderer) throw new Error('Mounted renderer absent');
    return renderer.getPublishedViewSnapshot().districts?.length ?? 0;
  });
  expect(count).toBeGreaterThan(0);
});

function witness(page: Page, target: string): Promise<Witness> {
  return page.evaluate(async (targetId) => {
    const path = '/src/ui/map/debugMapBridge.ts';
    const bridge = (await import(/* @vite-ignore */ path)) as {
      getDebugMapRenderer(): {
        getApp(): { canvas: HTMLCanvasElement } | null;
        getPublishedViewSnapshot(): { districts?: Array<{ id: string; ikkiActive?: boolean }> };
        nodeParts: Map<
          string,
          {
            part: {
              container: { label: string; visible: boolean; children: Array<{ visible: boolean }> };
            };
          }
        >;
      } | null;
    };
    const renderer = bridge.getDebugMapRenderer();
    if (!renderer) throw new Error('Map renderer absent');
    const active = renderer
      .getPublishedViewSnapshot()
      .districts?.find((entry) => entry.id === targetId);
    if (active?.ikkiActive !== true) throw new Error('Synthetic target uprising was lost');
    const district = renderer.nodeParts.get(targetId)?.part.container;
    if (!district || district.label !== 'districtNode' || !district.visible)
      throw new Error('Target district warning is not rendered');
    if (district.children.length < 1 || district.children.length > 2)
      throw new Error('Unexpected target district graphics structure');
    const canvas = renderer.getApp()?.canvas;
    const gl = canvas?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      // Before the fix the triangle is painted into the single ground Graphics and cannot blink.
      warningVisible: district.children.length === 1 ? true : district.children[1]!.visible,
      districtVisible: district.visible,
      warningLayerSeparated: district.children.length === 2,
      renderer: gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
    };
  }, target);
}

async function stageSyntheticUprising(page: Page): Promise<string> {
  const target = await page.evaluate(async () => {
    const path = '/src/ui/map/debugMapBridge.ts';
    const bridge = (await import(/* @vite-ignore */ path)) as {
      getDebugMapRenderer(): {
        getPublishedViewSnapshot(): { districts?: Array<{ id: string; ikkiActive?: boolean }> };
        updateView(view: unknown): void;
        focusNode(id: string): void;
      } | null;
    };
    const renderer = bridge.getDebugMapRenderer();
    if (!renderer) throw new Error('Map renderer absent');
    const view = renderer.getPublishedViewSnapshot();
    const district = view.districts?.find((entry) => !entry.ikkiActive);
    if (!district) throw new Error('No inactive district in native map view');
    renderer.updateView({
      ...view,
      districts: view.districts!.map((entry) => ({
        ...entry,
        ikkiActive: entry.id === district.id,
      })),
    });
    renderer.focusNode(district.id);
    return district.id;
  });
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
  return target;
}

test('an explicitly synthetic uprising view blinks under ordinary motion and stays lit when OS motion is reduced', async ({
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
  const target = await stageSyntheticUprising(page);
  await expect.poll(async () => (await witness(page, target)).warningVisible).toBe(true);
  const initial = await witness(page, target);
  expect(initial.districtVisible).toBe(true);
  expect(initial.warningVisible).toBe(true);
  const initialPath = info.outputPath('uprising-initial.png');
  await page.screenshot({ path: initialPath });
  const initialAfterScreenshot = await witness(page, target);
  await info.attach('uprising-initial', { path: initialPath, contentType: 'image/png' });
  await expect
    .poll(async () => (await witness(page, target)).warningVisible, { timeout: 1_200 })
    .toBe(false);
  const hidden = await witness(page, target);
  const hiddenPath = info.outputPath('uprising-hidden.png');
  await page.screenshot({ path: hiddenPath });
  const hiddenAfterScreenshot = await witness(page, target);
  await info.attach('uprising-hidden', { path: hiddenPath, contentType: 'image/png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await witness(page, target)).warningVisible).toBe(true);
  const reduced = await witness(page, target);
  const reducedSamples: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(250);
    reducedSamples.push((await witness(page, target)).warningVisible);
  }
  expect(reducedSamples).toEqual(Array(6).fill(true));
  const reducedPath = info.outputPath('uprising-reduced.png');
  await page.screenshot({ path: reducedPath });
  await info.attach('uprising-reduced', { path: reducedPath, contentType: 'image/png' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(async () => (await witness(page, target)).warningVisible, { timeout: 1_200 })
    .toBe(false);
  const gameAfter = JSON.stringify(await page.evaluate(() => window.__tenka.debug.getState()));
  const commandsAfter = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
  );
  expect(gameAfter).toBe(gameBefore);
  expect(commandsAfter).toBe(commandsBefore);

  // The visual fixture may own a system modal. Use the real title Settings UI,
  // then load the same paused fixture again to check the user's effects choice.
  await page.goto('/?debug=1');
  await expect(page.getByTestId('screen-title')).toBeVisible();
  await page.getByTestId('title-settings').click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('switch', { name: '地圖特效', exact: true }).setChecked(false);
  await expect(settings.getByRole('switch', { name: '地圖特效', exact: true })).not.toBeChecked();
  await settings.getByRole('button', { name: '返回', exact: true }).click();
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await waitForMapReady(page);
  await page.evaluate(async () => {
    await window.__tenka.debug.waitSimulationIdle();
    await window.__tenka.debug.waitMapIdle();
  });
  const effectsGameBefore = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.getState()),
  );
  const effectsCommandsBefore = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
  );
  const effectsTarget = await stageSyntheticUprising(page);
  await expect.poll(async () => (await witness(page, effectsTarget)).warningVisible).toBe(true);
  const effectsOffSamples: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(250);
    effectsOffSamples.push((await witness(page, effectsTarget)).warningVisible);
  }
  expect(effectsOffSamples).toEqual(Array(6).fill(true));
  const effectsOff = await witness(page, effectsTarget);
  const offPath = info.outputPath('uprising-effects-off.png');
  await page.screenshot({ path: offPath });
  await info.attach('uprising-effects-off', { path: offPath, contentType: 'image/png' });
  const effectsGameAfter = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.getState()),
  );
  const effectsCommandsAfter = JSON.stringify(
    await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
  );
  expect(effectsGameAfter).toBe(effectsGameBefore);
  expect(effectsCommandsAfter).toBe(effectsCommandsBefore);
  await info.attach('uprising-witness', {
    body: JSON.stringify(
      {
        target,
        initial,
        initialAfterScreenshot,
        hidden,
        hiddenAfterScreenshot,
        reduced,
        reducedSamples,
        effectsTarget,
        effectsOff,
        effectsOffSamples,
        gameSha256: createHash('sha256').update(gameBefore).digest('hex'),
        commandsSha256: createHash('sha256').update(commandsBefore).digest('hex'),
        effectsGameSha256: createHash('sha256').update(effectsGameBefore).digest('hex'),
        effectsCommandsSha256: createHash('sha256').update(effectsCommandsBefore).digest('hex'),
        fixture:
          'Published render-view override and real title Settings choice; no GameState mutation',
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
