import { writeFile } from 'node:fs/promises';
import type { TenkaDebugApi } from '../src/app/debug';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Rect = { x: number; y: number; width: number; height: number };

// Independent rectangle intersection, without producer padding or tolerances.
function area(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

test.use({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  contextOptions: { reducedMotion: 'reduce' },
});

test('loaded castle name and troop text have separate seal space without changing paused core', async ({
  page,
}, info) => {
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle());
  const core = await page.evaluate(() =>
    JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
  );
  const observations = [];
  for (const preset of ['operational', 'close'] as const) {
    await page.evaluate(
      (value) => (window as DebugWindow).__tenka.debug.setMapCameraPreset(value),
      preset,
    );
    await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
    const castles = await page.evaluate(
      () => (window as DebugWindow).__tenka.debug.getMapDiagnostics().armyPlateLayout.castles,
    );
    expect(castles.length).toBeGreaterThan(0);
    expect(
      castles.some((castle) => castle.id === 'castle.gifu'),
      `${preset}: the previously visible Gifu castle name is retained`,
    ).toBe(true);
    for (const castle of castles) {
      expect(castle.content, `${castle.id}: initialized content`).not.toBeNull();
      if (castle.content === null) throw new Error(`Missing content geometry: ${castle.id}`);
      for (const rect of Object.values(castle.content)) {
        expect(Object.values(rect).every(Number.isFinite)).toBe(true);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
      expect(area(castle.content.seal, castle.content.name), `${castle.id}: seal/name`).toBe(0);
      expect(area(castle.content.seal, castle.content.troops), `${castle.id}: seal/troops`).toBe(0);
      expect(area(castle.content.name, castle.content.troops), `${castle.id}: name/troops`).toBe(0);
    }
    observations.push({ preset, castles });
    await page.screenshot({ path: info.outputPath(`strategy-${preset}-identity-column.png`) });
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(core);
  }
  const artifact = info.outputPath('castle-content-geometry.json');
  await writeFile(artifact, JSON.stringify(observations, null, 2));
  await info.attach('castle-content-geometry', { path: artifact, contentType: 'application/json' });
  // These bounds prove internal content clearance, not freedom from army/HUD
  // occlusion or a completed campaign. Retained screenshots require review.
});
