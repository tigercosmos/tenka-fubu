import { writeFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from './fixtures';

async function capture(page: Page, info: TestInfo, key: string) {
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
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
  writeFileSync(
    info.outputPath(`army-plate-${key}-observation.json`),
    JSON.stringify({ observed }, null, 2),
  );
  await page.screenshot({ path: info.outputPath(`army-plate-${key}-scene.png`) });
  return observed;
}

test('army plate material retains actual selected army and mandatory far channels', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
  const position = await page.evaluate(
    () =>
      Object.values(window.__tenka.debug.getState().castles).find(
        (castle) => castle.id === 'castle.narumi',
      )!.pos,
  );
  const mini = page.getByTestId('minimap-frame');
  const box = await mini.boundingBox();
  expect(box).not.toBeNull();
  await mini.click({
    position: { x: (position.x / 4096) * box!.width, y: (position.y / 4096) * box!.height },
  });
  const ordinary = await capture(page, info, 'ordinary');
  const armyId = await page.evaluate(
    () =>
      Object.values(window.__tenka.debug.getState().armies).find(
        (a) => a.leaderId === 'off.oda-nagahide',
      )!.id,
  );
  expect(ordinary.diagnostics.lodStage).toBe('near');
  expect(ordinary.diagnostics.armyRendering.signals.find((a) => a.id === armyId)?.painted).toBe(
    true,
  );
  expect(ordinary.diagnostics.armyPlateLayout.plates.find((a) => a.id === armyId)?.selected).toBe(
    false,
  );
  const anchor = ordinary.diagnostics.castleRendering.nodes.find(
    (a) => a.id === 'castle.narumi',
  )!.anchor;
  await page.mouse.click(ordinary.canvas.x + anchor.x, ordinary.canvas.y + anchor.y);
  await expect(page.getByTestId('army-context-controls')).toBeVisible();
  const selected = await capture(page, info, 'selected');
  expect(selected.diagnostics.armyPlateLayout.plates.find((a) => a.id === armyId)?.selected).toBe(
    true,
  );
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('overview'));
  const far = await capture(page, info, 'far');
  expect(far.diagnostics.lodStage).toBe('far');
  expect(far.diagnostics.armyPlateLayout.plates.find((a) => a.id === armyId)?.selected).toBe(true);
  expect(far.diagnostics.armyRendering.signals.find((a) => a.id === armyId)?.visible).toBe(true);
  for (const observed of [selected, far]) {
    expect(observed.state).toBe(ordinary.state);
    expect(observed.commands).toBe(ordinary.commands);
  }
});
