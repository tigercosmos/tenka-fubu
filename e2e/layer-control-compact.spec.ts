import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function startPausedStrategy(page: Page, scale: number) {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const scaleInput = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await scaleInput.press(scale === 1.5 ? 'End' : 'Home');
  if (scale === 1) for (let i = 0; i < 4; i++) await scaleInput.press('ArrowRight');
  await expect(scaleInput).toHaveValue(String(scale));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe(`${16 * scale}px`);
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
}

async function measure(root: Locator) {
  return root.evaluate((element) => {
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const summary = element.querySelector('summary')!;
    const style = getComputedStyle(element);
    return {
      root: rect(element),
      summary: rect(summary),
      font: parseFloat(getComputedStyle(summary).fontSize),
      width: parseFloat(style.width),
      background: style.backgroundColor,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  });
}

async function assertHudSeparation(page: Page, root: Locator) {
  const footprint = (await root.boundingBox())!;
  expect(footprint.x).toBeGreaterThanOrEqual(0);
  expect(footprint.y).toBeGreaterThanOrEqual(0);
  expect(footprint.x + footprint.width).toBeLessThanOrEqual(1280);
  expect(footprint.y + footprint.height).toBeLessThanOrEqual(720);
  const obstacles = page.locator(
    '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="minimap-frame"], [data-testid="screen-strategy"] > section[aria-live="polite"] > *, [data-testid="screen-strategy"] > div[aria-hidden="false"], [data-testid="siege-overlay"]',
  );
  for (const obstacle of await obstacles.all()) {
    if (!(await obstacle.isVisible())) continue;
    const r = (await obstacle.boundingBox())!;
    const area =
      Math.max(
        0,
        Math.min(footprint.x + footprint.width, r.x + r.width) - Math.max(footprint.x, r.x),
      ) *
      Math.max(
        0,
        Math.min(footprint.y + footprint.height, r.y + r.height) - Math.max(footprint.y, r.y),
      );
    expect(area, `LayerControl intersects ${await obstacle.getAttribute('data-testid')}`).toBe(0);
  }
}

async function sceneSnapshot(page: Page) {
  return page.evaluate(() => {
    const d = window.__tenka.debug.getMapDiagnostics();
    return {
      game: window.__tenka.debug.getState(),
      commands: window.__tenka.debug.exportCommandLog(),
      lodStage: d.lodStage,
      anchors: d.castleRendering.nodes.map((node) => ({ id: node.id, anchor: node.anchor })),
    };
  });
}

for (const scale of [0.8, 1, 1.5]) {
  test(`compact LayerControl retains native keyboard controls and full active legend at scale ${scale}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await startPausedStrategy(page, scale);
    const root = page.getByTestId('layer-control');
    const summary = root.locator('summary');
    const details = root.locator('details');
    const canvas = page.getByTestId('map-canvas-host').locator('canvas');
    const canvasBefore = await canvas.boundingBox();
    const before = await sceneSnapshot(page);
    await expect(root).toHaveAttribute('data-compact', 'true');
    await expect(summary).toHaveText('戰略圖層 · 一般地圖');
    await expect(root.getByTestId('analysis-legend')).toHaveCount(0);
    const closed = await measure(root);
    expect(closed.summary.height).toBeGreaterThanOrEqual(32);
    expect(closed.font).toBeGreaterThanOrEqual(12);
    if (scale === 1) expect(closed.root.width).toBeLessThan(240);
    await assertHudSeparation(page, root);
    await page.screenshot({ path: testInfo.outputPath('layer-control-compact.png') });

    await summary.focus();
    await summary.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(root).toHaveAttribute('data-compact', 'false');
    const expanded = await measure(root);
    expect(expanded.width).toBe(240 * scale);
    expect(expanded.background).not.toBe(closed.background);
    await expect(root.getByRole('radio')).toHaveCount(6);
    await summary.press('Tab');
    await expect(root.getByRole('radio', { name: '一般地圖', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(root.getByRole('radio', { name: /補給/ })).toBeChecked();
    const slider = root.getByRole('slider', { name: '圖層透明度', exact: true });
    await expect(slider).toBeEnabled();
    await slider.focus();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('5');
    await expect
      .poll(() => page.evaluate(() => window.__tenka.debug.getMapDiagnostics().analysisOpacity))
      .toBe(0.05);
    for (const label of await root.locator('fieldset label').all()) {
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(32);
      expect(
        await label.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
      ).toBeGreaterThanOrEqual(12);
    }
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await assertHudSeparation(page, root);
    await page.screenshot({ path: testInfo.outputPath('layer-control-expanded.png') });

    // Native controls own focus: Alt must not change the map while summary is focused.
    await summary.focus();
    await page.keyboard.press('Alt+5');
    await expect(root.getByRole('radio', { name: /補給/ })).toBeChecked();
    // Find a real canvas point outside DOM overlays and emitted actor frames.
    // Read-only geometry discovery; the actual pointer click owns the focus change.
    const background = await canvas.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const d = window.__tenka.debug.getMapDiagnostics();
      const actors = d.actorDepth.bodies.filter((body) => body.visible && body.rect);
      for (const [fx, fy] of [
        [0.5, 0.96],
        [0.5, 0.85],
        [0.75, 0.5],
        [0.25, 0.85],
      ] as const) {
        const x = r.x + r.width * fx;
        const y = r.y + r.height * fy;
        const localX = x - r.x;
        const localY = y - r.y;
        if (document.elementFromPoint(x, y) !== node) continue;
        if (
          actors.some(
            ({ rect }) =>
              rect &&
              localX >= rect.x - 32 &&
              localX <= rect.x + rect.width + 32 &&
              localY >= rect.y - 32 &&
              localY <= rect.y + rect.height + 32,
          )
        )
          continue;
        if (
          d.castleRendering.nodes.some(
            ({ anchor }) => Math.hypot(localX - anchor.x, localY - anchor.y) <= 40,
          )
        )
          continue;
        return { x, y };
      }
      return null;
    });
    expect(background, 'an unobstructed native map background point exists').not.toBeNull();
    await page.mouse.click(background!.x, background!.y);
    expect(
      await page.evaluate(
        () =>
          document.activeElement === document.body || document.activeElement?.tagName === 'CANVAS',
      ),
    ).toBe(true);
    await page.keyboard.press('Alt+5');
    await expect(root.getByRole('radio', { name: /城池防禦/ })).toBeChecked();
    await summary.focus();
    await summary.press('Enter');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(root).toHaveAttribute('data-compact', 'false');
    await expect(root.getByTestId('analysis-legend')).toBeVisible();
    const activeClosed = await measure(root);
    expect(activeClosed.width).toBe(240 * scale);
    await assertHudSeparation(page, root);
    await page.screenshot({ path: testInfo.outputPath('layer-control-active-legend.png') });
    expect(await canvas.boundingBox()).toEqual(canvasBefore);
    // Analysis mode/opacity are presentation settings; core and command log must remain untouched.
    expect(await sceneSnapshot(page)).toEqual(before);
    await testInfo.attach('layer-control-measurements', {
      body: JSON.stringify({ scale, closed, expanded, activeClosed, background }, null, 2),
      contentType: 'application/json',
    });
  });
}
