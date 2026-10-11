import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function setScale(page: Page, scale: 0.8 | 1 | 1.5) {
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(scale === 1.5 ? 'End' : 'Home');
  if (scale === 1) for (let step = 0; step < 4; step++) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
}

async function selectCastle(page: Page, id: string) {
  const name = await page.evaluate(
    (castleId) =>
      Object.values(window.__tenka.debug.getState().castles).find(
        (castle) => castle.id === castleId,
      )!.name,
    id,
  );
  await page.getByTestId('rail-realm').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: '顯示種類', exact: true }).selectOption('castle');
  await dialog.getByRole('searchbox', { name: '搜尋地點、部隊或勢力', exact: true }).fill(name);
  await dialog.getByRole('button', { name: `選取${name}`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let prior = '',
    stable = 0;
  await expect
    .poll(async () => {
      const current = await page.evaluate((castleId) => {
        const diagnostics = window.__tenka.debug.getMapDiagnostics();
        const node = diagnostics.castleRendering.nodes.find((entry) => entry.id === castleId);
        return node ? JSON.stringify(node.anchor) : '';
      }, id);
      stable = current && current === prior ? stable + 1 : 0;
      prior = current;
      return stable;
    })
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
}

test('placard material keeps selected critical main and ordinary branch channels at three UI scales', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  for (const scale of [0.8, 1, 1.5] as const) {
    await setScale(page, scale);
    for (const id of ['castle.sunpu', 'castle.narumi'] as const) {
      await selectCastle(page, id);
      const observed = await page.evaluate(() => {
        const canvas = document
          .querySelector('[data-testid="map-canvas-host"] canvas')!
          .getBoundingClientRect();
        return {
          diagnostics: window.__tenka.debug.getMapDiagnostics(),
          canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
          state: JSON.stringify(window.__tenka.debug.getState()),
          commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
        };
      });
      const key = `${id}-${scale}`;
      writeFileSync(
        info.outputPath(`placard-${key}-observation.json`),
        JSON.stringify({ id, scale, observed }, null, 2),
      );
      await page.screenshot({ path: info.outputPath(`placard-${key}-scene.png`) });
      expect(observed.state).toBe(initial.state);
      expect(observed.commands).toBe(initial.commands);
      expect(observed.diagnostics.lodStage).toBe('near');
      const node = observed.diagnostics.castleRendering.nodes.find((entry) => entry.id === id);
      const ribbon = observed.diagnostics.armyPlateLayout.castles.find((entry) => entry.id === id);
      expect(node).toBeDefined();
      expect(ribbon).toBeDefined();
      expect(ribbon?.content).toBeDefined();
      expect(ribbon?.content).not.toBeNull();
      expect(node!.painted).toBe(true);
      expect(node!.selection?.behindBody).toBe(true);
      if (id === 'castle.sunpu') {
        expect(node!.warning).not.toBeNull();
        expect(node!.siege?.behindBody).toBe(true);
      } else expect(node!.warning).toBeNull();
    }
  }
});
