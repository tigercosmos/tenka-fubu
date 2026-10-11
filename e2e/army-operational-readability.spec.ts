import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function crossesInterior(start: Point, end: Point, rect: Rect) {
  if (start.x === end.x && start.y === end.y) return false;
  let low = 0,
    high = 1;
  for (const [a, b, min, max] of [
    [start.x, end.x, rect.x, rect.x + rect.width],
    [start.y, end.y, rect.y, rect.y + rect.height],
  ]) {
    const delta = b! - a!;
    if (delta === 0) {
      if (a! <= min! || a! >= max!) return false;
    } else {
      const first = (min! - a!) / delta,
        second = (max! - a!) / delta;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low >= high) return false;
    }
  }
  return low < high;
}

test('operational original formations gain readable area while close frames and gameplay remain anchored', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
  // Existing fixed visual fixture: presentation proof, not an earned campaign.
  const core = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const observations = [];
  for (const scale of [0.8, 1, 1.5]) {
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '設定', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
    await slider.press(scale === 1.5 ? 'End' : 'Home');
    if (scale === 1) for (let step = 0; step < 4; step++) await slider.press('ArrowRight');
    await expect(slider).toHaveValue(String(scale));
    await dialog.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
    for (const preset of ['operational', 'close'] as const) {
      await page.evaluate(async (value) => {
        await window.__tenka.debug.setMapCameraPreset(value);
        await window.__tenka.debug.waitMapIdle(3);
      }, preset);
      const data = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
      const idle = await page.evaluate(async () => {
        await window.__tenka.debug.waitMapIdle(3);
        return window.__tenka.debug.getMapDiagnostics();
      });
      observations.push({ scale, preset, data, idle });
      await page.screenshot({
        path: info.outputPath(`original-formations-${preset}-${scale}.png`),
      });
    }
  }
  const path = info.outputPath('original-formation-observations.json');
  await writeFile(path, JSON.stringify(observations, null, 2));
  await info.attach('original-formation-observations', { path, contentType: 'application/json' });
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(core);
  for (const { preset, data, idle } of observations) {
    expect(data.lodStage).toBe(preset === 'operational' ? 'mid' : 'near');
    const painted = new Set(
      data.armyRendering.signals
        .filter((signal) => signal.painted && signal.visible)
        .map((signal) => signal.id),
    );
    const bodies = data.actorDepth.bodies.filter(
      (body) => body.kind === 'army' && body.visible && body.rect && painted.has(body.id),
    );
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const longest = Math.max(body.rect!.width, body.rect!.height);
      // Independent physical bounds: mid32×34 at camera.5; original near26×28 at1.25.
      expect(longest).toBeGreaterThanOrEqual((preset === 'operational' ? 16 : 32.5) - 1e-6);
      expect(longest).toBeLessThanOrEqual((preset === 'operational' ? 17 : 35) + 1e-6);
    }
    for (const [index, plate] of data.armyPlateLayout.plates.entries()) {
      expect(plate.fontSizeCss).toBeCloseTo(14, 8);
      expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(80 + 1e-6);
      for (const other of data.armyPlateLayout.plates.slice(index + 1))
        expect(
          intersects(plate.rect, other.rect),
          `${preset}: ${plate.id}/${other.id} plates`,
        ).toBe(false);
      if (plate.leader.visible)
        for (const other of data.armyPlateLayout.plates)
          if (other.id !== plate.id)
            expect(
              crossesInterior(plate.leader.start, plate.leader.end, other.rect),
              `${preset}: ${plate.id} leader/${other.id}`,
            ).toBe(false);
    }
    expect(idle.actorDepth).toEqual(data.actorDepth);
    expect(idle.armyRendering).toEqual(data.armyRendering);
    expect(idle.armyPlateLayout).toEqual(data.armyPlateLayout);
  }
});
