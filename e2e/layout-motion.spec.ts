import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function newGame(page: Page) {
  await page.goto('/?debug=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await page.evaluate(() => window.__tenka.debug.waitMapIdle());
}

async function mapFocus(page: Page) {
  // Return focus to the real document background, without altering any store or game state.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function contained(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

async function setScale(page: Page, scale: number) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  if (scale === 1.5) await slider.press('End');
  else {
    await slider.press('Home');
    if (scale === 1) for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  }
  await expect(slider).toHaveValue(String(scale));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe(`${16 * scale}px`);
  await contained(page, dialog);
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  for (const scale of [0.8, 1, 1.5]) {
    test(`real UI bounds at ${viewport.width}×${viewport.height}, scale ${scale}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await newGame(page);
      const canvas = page.getByTestId('map-canvas-host').locator('canvas');
      const nativeCanvas = await canvas.evaluate((node: HTMLCanvasElement) => ({
        width: node.width,
        height: node.height,
      }));
      const canvasBox = await canvas.boundingBox();
      const before = await page.evaluate(() => window.__tenka.debug.getState());
      await setScale(page, scale);
      const strategy = page.getByTestId('screen-strategy');
      const header = strategy.locator(':scope > header');
      const nav = strategy.locator(':scope > nav');
      await contained(page, header);
      await contained(page, nav);
      const realm = nav.getByTestId('rail-realm');
      await realm.scrollIntoViewIfNeeded();
      await expect(realm).toHaveAccessibleName('地圖一覽');
      const label = realm.getByTestId('rail-realm-label');
      await expect(label.locator(':scope > span')).toHaveText(['地圖', '一覽']);
      const lines = await label.locator(':scope > span').evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return {
            font: parseFloat(getComputedStyle(node).fontSize),
            x: r.x,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
        }),
      );
      const realmBox = (await realm.boundingBox())!;
      for (const line of lines) {
        expect(line.font).toBeGreaterThanOrEqual(12);
        expect(line.x).toBeGreaterThanOrEqual(realmBox.x);
        expect(line.right).toBeLessThanOrEqual(realmBox.x + realmBox.width);
        expect(line.top).toBeGreaterThanOrEqual(realmBox.y);
        expect(line.bottom).toBeLessThanOrEqual(realmBox.y + realmBox.height);
      }
      expect(lines[0]!.bottom).toBeLessThanOrEqual(lines[1]!.top);
      const groups = nav.locator(':scope > [data-rail-group]');
      expect(
        await groups.evaluateAll((nodes) =>
          nodes.map((node) => ({
            group: node.getAttribute('data-rail-group'),
            hidden: node.getAttribute('aria-hidden'),
            tabIndex: (node as HTMLElement).tabIndex,
          })),
        ),
      ).toEqual([
        { group: 'management', hidden: 'true', tabIndex: -1 },
        { group: 'relations', hidden: 'true', tabIndex: -1 },
        { group: 'strategy', hidden: 'true', tabIndex: -1 },
      ]);
      await expect(groups.locator(':scope > span')).toHaveText(['軍政', '交涉', '國策']);
      const groupMeasurements = [];
      for (const group of await groups.all()) {
        await group.scrollIntoViewIfNeeded();
        await contained(page, group);
        const measurement = await group.evaluate((node) => {
          const label = node.querySelector('span')!;
          const bounds = node.getBoundingClientRect();
          const text = label.getBoundingClientRect();
          return {
            group: node.getAttribute('data-rail-group'),
            font: parseFloat(getComputedStyle(label).fontSize),
            bounds: {
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
            },
            text: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
          };
        });
        expect(measurement.font).toBeGreaterThanOrEqual(12);
        expect(measurement.text.left).toBeGreaterThanOrEqual(measurement.bounds.left);
        expect(measurement.text.right).toBeLessThanOrEqual(measurement.bounds.right);
        expect(measurement.text.top).toBeGreaterThanOrEqual(measurement.bounds.top);
        expect(measurement.text.bottom).toBeLessThanOrEqual(measurement.bounds.bottom);
        groupMeasurements.push(measurement);
      }
      await testInfo.attach('rail-section-bounds', {
        body: JSON.stringify({ viewport, scale, groups: groupMeasurements }),
        contentType: 'application/json',
      });
      await realm.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath('command-rail-top.png') });
      const tabbable = await nav
        .locator(':scope > button')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => !(node as HTMLButtonElement).disabled)
            .map((node) => node.getAttribute('data-testid')!),
        );
      await realm.focus();
      for (const id of tabbable.slice(1)) {
        await page.keyboard.press('Tab');
        await expect(nav.getByTestId(id)).toBeFocused();
      }
      const headerBox = (await header.boundingBox())!;
      expect(headerBox.height).toBeCloseTo(Math.max(40, 48 * scale), 0);
      const resourceText = await header.evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        return [
          ...root.querySelectorAll('time, [data-testid="food-coverage"], [class*="itemHeading"]'),
        ]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => ({
            font: parseFloat(getComputedStyle(node).fontSize),
            top: node.getBoundingClientRect().top - bounds.top,
            bottom: node.getBoundingClientRect().bottom - bounds.top,
          }));
      });
      expect(resourceText.length).toBeGreaterThanOrEqual(5);
      for (const text of resourceText) {
        expect(text.font).toBeGreaterThanOrEqual(12);
        expect(text.top).toBeGreaterThanOrEqual(0);
        expect(text.bottom).toBeLessThanOrEqual(headerBox.height);
      }
      const crest = nav.getByTestId('rail-home');
      await expect(crest).toHaveAttribute('type', 'button');
      await expect(crest).toHaveAccessibleName(/本城/);
      const crestBox = (await crest.boundingBox())!;
      // Compact 4rem rail, two .25rem paddings and two physical 1px borders.
      expect(crestBox.width).toBeCloseTo(56 * scale - 2, 0);
      expect(crestBox.height).toBeCloseTo(Math.max(72, 72 * scale), 0);
      const crestSvg = (await crest.locator('svg').boundingBox())!;
      expect(crestSvg.width).toBeCloseTo(Math.max(32, 32 * scale), 0);
      const textSizes = await crest.locator('span[title]').evaluate((node) => ({
        font: parseFloat(getComputedStyle(node).fontSize),
        line: parseFloat(getComputedStyle(node).lineHeight),
      }));
      expect(textSizes.font).toBeCloseTo(Math.max(12, 12 * scale), 1);
      expect(textSizes.line).toBeCloseTo(Math.max(16, 16 * scale), 1);
      for (const control of ['speed-pause', 'rail-domestic', 'rail-taimei']) {
        await page.getByTestId(control).scrollIntoViewIfNeeded();
        await contained(page, page.getByTestId(control));
        const box = (await page.getByTestId(control).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(32);
        expect(box.height).toBeGreaterThanOrEqual(32);
        if (control.startsWith('rail-'))
          expect(
            await page
              .getByTestId(control)
              .evaluate((node) => parseFloat(getComputedStyle(node, '::after').fontSize)),
          ).toBeGreaterThanOrEqual(12);
      }
      await page.screenshot({ path: testInfo.outputPath('command-rail-tail.png') });
      await page.getByTestId('rail-taimei').click();
      await expect(page.getByTestId('taimei-panel')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('taimei-panel')).toHaveCount(0);
      await mapFocus(page);
      await page.keyboard.press('Home');
      const context = page
        .locator('div[aria-hidden="false"]')
        .filter({ has: page.getByRole('img', { name: /^耐久 / }) });
      await expect(context).toBeVisible();
      // Visibility alone is insufficient: its entrance starts below the screen.
      await expect
        .poll(() => context.evaluate((node) => getComputedStyle(node).transform))
        .toBe('matrix(1, 0, 0, 1, 0, 0)');
      const minimap = page.getByTestId('minimap');
      await expect.poll(() => minimap.evaluate((node) => node.getAnimations().length)).toBe(0);
      await contained(page, context);
      await contained(page, minimap);
      const contextBox = (await context.boundingBox())!;
      const minimapBox = (await minimap.boundingBox())!;
      expect(minimapBox.y + minimapBox.height).toBeLessThanOrEqual(contextBox.y + 1);
      await page.screenshot({ path: testInfo.outputPath('settled-context-minimap.png') });
      await page.keyboard.press('F1');
      const castle = page.getByTestId('castle-panel');
      await contained(page, castle);
      await expect(castle.getByRole('tab', { name: '內政', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await page.screenshot({ path: testInfo.outputPath('castle.png') });
      await page.keyboard.press('Escape');
      await expect(castle).toHaveCount(0);
      await page.keyboard.press('F4');
      const officers = page.getByTestId('officer-list');
      await expect(officers).toBeVisible();
      await expect(page.getByTestId('reports-open')).toHaveCount(0);
      const table = officers.locator('table');
      const tableViewport = table.locator('..');
      await contained(page, tableViewport);
      const expectedRows = Object.values(before.officers).filter(
        (officer) =>
          officer.hasComeOfAge &&
          officer.status === 'serving' &&
          officer.clanId === before.meta.playerClanId,
      ).length;
      expect(expectedRows).toBeGreaterThan(0);
      const rows = table.locator('tbody tr');
      await expect(rows).toHaveCount(expectedRows);
      expect((await rows.first().boundingBox())!.height).toBeCloseTo(40 * scale, 0);
      const measurements = await tableViewport.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowY: getComputedStyle(node).overflowY,
      }));
      expect(measurements.overflowY).toBe('auto');
      await testInfo.attach('production-officer-table', {
        body: JSON.stringify({ expectedRows, scale, ...measurements }),
        contentType: 'application/json',
      });
      if (measurements.scrollHeight > measurements.clientHeight) {
        await tableViewport.hover();
        await page.mouse.wheel(0, measurements.scrollHeight);
        await expect
          .poll(() => tableViewport.evaluate((node) => node.scrollTop))
          .toBeGreaterThan(0);
      }
      // Rows may have an internal horizontal scrollbar; their enclosing viewport must still fit.
      // A short real roster proves scaled rows, not the Gallery's 650-row virtual fixture.
      const lastRowBox = (await rows.last().boundingBox())!;
      const tableBox = (await tableViewport.boundingBox())!;
      expect(lastRowBox.y).toBeGreaterThanOrEqual(tableBox.y - 1);
      expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(
        tableBox.y + tableBox.height + 1,
      );
      await page.screenshot({ path: testInfo.outputPath('officer-table.png') });
      await mapFocus(page);
      await page.keyboard.press('Escape');
      await expect(officers).toHaveCount(0);
      await page.keyboard.press('F2');
      const march = page.getByRole('dialog', { name: '出陣編成', exact: true });
      await contained(page, march);
      await expect(page.getByTestId('march-modal')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('march-dialog.png') });
      await page.keyboard.press('Escape');
      await expect(march).toHaveCount(0);
      await page.keyboard.press('r');
      const reports = page.getByTestId('reports-panel');
      await contained(page, reports);
      await expect(reports.getByRole('checkbox')).toHaveCount(7);
      await page.screenshot({ path: testInfo.outputPath('reports.png') });
      await page.keyboard.press('Escape');
      await expect(reports).toHaveCount(0);
      await page.keyboard.press('F7');
      const taimei = page.getByTestId('taimei-panel');
      await contained(page, taimei);
      await expect(
        taimei.locator('button[aria-pressed]').filter({ has: page.locator('strong') }),
      ).toHaveCount(8);
      await page.screenshot({ path: testInfo.outputPath('taimei.png') });
      await page.keyboard.press('Escape');
      expect(await canvas.boundingBox()).toEqual(canvasBox);
      expect(
        await canvas.evaluate((node: HTMLCanvasElement) => ({
          width: node.width,
          height: node.height,
        })),
      ).toEqual(nativeCanvas);
      expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
      await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    });
  }
}

test('initial and live OS motion preference stops decoration but preserves information transitions', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await newGame(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-reduced-motion', 'true');
  await mapFocus(page);
  await page.keyboard.press('Home');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(html).toHaveAttribute('data-reduced-motion', 'false');
  await page.keyboard.press('F2');
  const dialog = page.getByRole('dialog', { name: '出陣編成', exact: true });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((node) => getComputedStyle(node).animationDuration))
    .not.toBe('0s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(html).toHaveAttribute('data-reduced-motion', 'true');
  await expect
    .poll(() => dialog.evaluate((node) => getComputedStyle(node).animationDuration))
    .toBe('0s');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+s');
  const toast = page.getByRole('status').filter({ hasText: '已快速存檔' });
  await expect(toast).toBeVisible();
  await expect
    .poll(() => toast.evaluate((node) => getComputedStyle(node).animationDuration))
    .toBe('0s');
  await page.keyboard.press('F1');
  const panel = page.getByTestId('castle-panel');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((node) => getComputedStyle(node).animationDuration)).toBe('0s');
  await page.screenshot({ path: testInfo.outputPath('reduced-motion.png') });
  // Production tactical morale bars use the shared informational ProgressBar, not a fixture.
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  await expect(page.getByTestId('screen-battle')).toBeVisible();
  const progress = page.locator('.motion-preserve').first();
  await expect(progress).toBeVisible();
  await expect
    .poll(() => progress.evaluate((node) => getComputedStyle(node).transitionDuration))
    .toBe('0.3s');
});

test('real camera and rail hotkeys are presentation-only; battle speed stays local', async ({
  page,
}, testInfo) => {
  await newGame(page);
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  await mapFocus(page);
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();
  await page.keyboard.press('m');
  await expect(minimap).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(minimap).toBeVisible();
  await page.keyboard.press('Home');
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(30));
  const frame = page.getByTestId('minimap-frame');
  const frameBefore = await frame.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowRight');
  await expect
    .poll(() => frame.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
    .not.toBe(frameBefore);
  const zoomBefore = await frame.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.keyboard.press('+');
  await expect
    .poll(() => frame.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
    .not.toBe(zoomBefore);
  await page.keyboard.press('-');
  for (const [key, title] of [
    ['F3', '外交'],
    ['F4', '武將一覽'],
    ['F6', '軍團'],
  ] as const) {
    await page.keyboard.press(key);
    const heading =
      key === 'F4'
        ? page.getByTestId('officer-list')
        : page.locator('section > header').filter({ has: page.getByText(title, { exact: true }) });
    await expect(heading).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(heading).toHaveCount(0);
  }
  await page.keyboard.press('F5');
  await expect(page.getByTestId('policy-panel')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '已快速存檔' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('policy-panel')).toHaveCount(0);
  // First Escape closes the F1 panel; the selected castle context remains until the second.
  await page.keyboard.press('F1');
  await page.keyboard.press('Escape');
  const context = page
    .locator('div[aria-hidden="false"]')
    .filter({ has: page.getByRole('img', { name: /^耐久 / }) });
  await expect(context).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(context).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('camera-hotkeys.png') });
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const battle = page.getByTestId('screen-battle');
  await expect(battle).toBeVisible();
  const day = await page.evaluate(() => window.__tenka.debug.getState().time.day);
  await page.locator('body').evaluate((node) => {
    (document.activeElement as HTMLElement | null)?.blur();
    node.focus();
  });
  for (const [key, name] of [
    ['1', '一倍速 ×1'],
    ['2', '二倍速 ×2'],
    ['3', '五倍速 ×5'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(battle.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Space');
    await expect(battle.getByRole('button', { name: '暫停', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  expect(await page.evaluate(() => window.__tenka.debug.getState().time.day)).toBe(day);
  await page.screenshot({ path: testInfo.outputPath('battle-local-hotkeys.png') });
});
