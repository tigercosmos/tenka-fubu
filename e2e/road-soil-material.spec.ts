import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect } from './fixtures';

test('normal campaign road material retains two authored bridges and reversible paint at mid and near', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=15600519');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.fonts.ready);
  const initial = await page.evaluate(() => ({
    state: JSON.stringify(window.__tenka.debug.getState()),
    commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
  }));
  const authored = JSON.parse(
    readFileSync(new URL('../src/data/scenarios/s1560/roads.json', import.meta.url), 'utf8'),
  ) as { edges: { id: string; bridges?: number[] }[] };
  const bridges = authored.edges.flatMap((edge) =>
    Array.from({ length: (edge.bridges?.length ?? 0) / 2 }, (_, i) => ({
      id: edge.id,
      x: edge.bridges![i * 2]!,
      y: edge.bridges![i * 2 + 1]!,
    })),
  );
  expect(bridges).toHaveLength(2);
  const observe = () =>
    page.evaluate(() => {
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
  for (const preset of ['operational', 'close'] as const) {
    await page.evaluate((p) => window.__tenka.debug.setMapCameraPreset(p), preset);
    const mini = page.getByTestId('minimap-frame');
    const box = (await mini.boundingBox())!;
    await mini.click({
      position: { x: (2325 / 4096) * box.width, y: (2876.5 / 4096) * box.height },
    });
    if (preset === 'operational') {
      await page.mouse.move(640, 360);
      for (let step = 0; step < 11; step++) await page.mouse.wheel(0, 120);
    }
    let prior = '',
      stable = 0;
    await expect
      .poll(async () => {
        const current = await page.evaluate(() =>
          JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
        );
        stable = current === prior ? stable + 1 : 0;
        prior = current;
        return stable;
      })
      .toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const observed = await observe();
    expect(observed.diagnostics.lodStage).toBe(preset === 'operational' ? 'mid' : 'near');
    expect(observed.state).toBe(initial.state);
    expect(observed.commands).toBe(initial.commands);
    writeFileSync(
      info.outputPath(`road-${preset}-observation.json`),
      JSON.stringify({ observed, bridges }, null, 2),
    );
    const on = await page.screenshot({ path: info.outputPath(`road-${preset}-scene.png`) });
    const lake = observed.diagnostics.waterRendering.lakes[0]!;
    const first = lake.worldPoints[0]!;
    const index = lake.worldPoints.findIndex((p) => p.x !== first.x);
    expect(index).toBeGreaterThan(0);
    const scale =
      (lake.points[index]!.x - lake.points[0]!.x) / (lake.worldPoints[index]!.x - first.x);
    for (const bridge of bridges) {
      const x = observed.canvas.x + lake.points[0]!.x + (bridge.x - first.x) * scale;
      const y = observed.canvas.y + lake.points[0]!.y + (bridge.y - first.y) * scale;
      expect(x).toBeGreaterThan(40);
      expect(x).toBeLessThan(1240);
      expect(y).toBeGreaterThan(40);
      expect(y).toBeLessThan(680);
      await page.screenshot({
        path: info.outputPath(`road-${preset}-${bridge.id}-bridge.png`),
        clip: { x: x - 36, y: y - 36, width: 72, height: 72 },
      });
    }
    const priorVisible = await page.evaluate(() =>
      window.__tenka.debug.setMapRoadPaintVisible(false),
    );
    expect(priorVisible).toBe(true);
    try {
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
      await page.screenshot({ path: info.outputPath(`road-${preset}-off.png`) });
      const off = await observe();
      expect(off.state).toBe(observed.state);
      expect(off.commands).toBe(observed.commands);
      expect(off.diagnostics.resources).toEqual(observed.diagnostics.resources);
    } finally {
      await page.evaluate((v) => window.__tenka.debug.setMapRoadPaintVisible(v), priorVisible);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    }
    const restored = await page.screenshot({
      path: info.outputPath(`road-${preset}-restored.png`),
    });
    expect(PNG.sync.read(restored).data.equals(PNG.sync.read(on).data)).toBe(true);
  }
});
