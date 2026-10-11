import { writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';

test('actual army annotation exposes three relations and independent state and supply at the original cameras', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.fonts.ready);
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  for (const preset of ['overview', 'operational', 'close'] as const) {
    await page.evaluate((p) => window.__tenka.debug.setMapCameraPreset(p), preset);
    let prior = '',
      stable = 0;
    await expect
      .poll(async () => {
        const current = await page.evaluate(() =>
          JSON.stringify(window.__tenka.debug.getMapDiagnostics().armyRendering.annotations),
        );
        stable = current === prior ? stable + 1 : 0;
        prior = current;
        return stable;
      })
      .toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const observed = await page.evaluate(() => ({
      diagnostics: window.__tenka.debug.getMapDiagnostics(),
      state: JSON.stringify(window.__tenka.debug.getState()),
      commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
    }));
    writeFileSync(
      info.outputPath(`annotation-${preset}-observation.json`),
      JSON.stringify(observed, null, 2),
    );
    await page.screenshot({ path: info.outputPath(`annotation-${preset}-scene.png`) });
    expect(observed.state).toBe(initial.state);
    expect(observed.commands).toBe(initial.commands);
    expect(observed.diagnostics.lodStage).toBe(
      { overview: 'far', operational: 'mid', close: 'near' }[preset],
    );
    const annotations = observed.diagnostics.armyRendering.annotations.filter((a) => a.visible);
    expect(annotations).toHaveLength(11);
    expect([...new Set(annotations.map((a) => a.relation.kind))].sort()).toEqual([
      'enemy',
      'friendly',
      'neutral',
    ]);
    for (const annotation of annotations) {
      expect(annotation.relation.visible).toBe(true);
      const rect = annotation.relation.rect!;
      expect(Object.values(rect).every(Number.isFinite)).toBe(true);
      // This is the actual projected reserved cell, not a raster glyph mask.
      expect(rect.width).toBeCloseTo(14, 7);
      expect(rect.height).toBeCloseTo(17.5, 7);
      if (annotation.state.visible) {
        expect(annotation.state.text).toMatch(/^[退戰圍討軍]$/);
        expect(annotation.state.rect).not.toBeNull();
      }
      if (annotation.supply.visible) {
        expect(annotation.supply.text).toMatch(/^糧!?$/);
        expect(annotation.supply.rect).not.toBeNull();
      }
    }
    expect(annotations.some((a) => a.state.visible && a.state.text === '退')).toBe(true);
    expect(annotations.some((a) => a.state.visible && a.state.text === '圍')).toBe(true);
    expect(annotations.some((a) => a.supply.visible && a.supply.text === '糧')).toBe(true);
    expect(annotations.some((a) => a.supply.visible && a.supply.text === '糧!')).toBe(true);
    for (const annotation of annotations) {
      const plate = observed.diagnostics.armyPlateLayout.plates.find((p) => p.id === annotation.id);
      expect(plate, 'annotation envelope participates in the actual plate layout').toBeDefined();
      expect(plate!.fontSizeCss).toBeCloseTo(14, 7);
      expect(Math.hypot(plate!.offset.x, plate!.offset.y)).toBeLessThanOrEqual(80 + 1e-7);
    }
  }
});
