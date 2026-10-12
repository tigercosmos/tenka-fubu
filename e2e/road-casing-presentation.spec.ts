import { completeNewGameWizard } from './new-game-wizard';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect } from './fixtures';
import { validateState } from '../src/core/state/invariants';

// Fixed normal-national presentation evidence, not a global road-contrast/art gate.
// Open/wooded descriptions refer to the archived lighting baseline, not sampled color.
const controls = [
  {
    id: 'road.b34-91',
    context: 'wooded',
    a: { x: 2217, y: 2559 },
    b: { x: 2270, y: 2474 },
    t: 0.32,
  },
  { id: 'road.b34-90', context: 'open', a: { x: 2238, y: 2669 }, b: { x: 2217, y: 2559 }, t: 0.25 },
] as const;
const poses = [
  { key: 'hida-far', preset: 'overview', focus: { x: 2130, y: 2613 }, stage: 'far' },
  { key: 'hida-mid', preset: 'operational', focus: { x: 2130, y: 2613 }, stage: 'mid' },
  { key: 'hida-near', preset: 'close', focus: { x: 2130, y: 2613 }, stage: 'near' },
  { key: 'suzuka-near', preset: 'close', focus: { x: 1855.5, y: 2886.5 }, stage: 'near' },
  { key: 'sunpu-mid', preset: 'operational', focus: { x: 2427, y: 2984 }, stage: 'mid' },
  { key: 'national-far', preset: 'overview', focus: null, stage: 'far' },
] as const;

test('soil-road casing captures six fixed poses and unobscured open/wooded stations', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=1&seed=15600519');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.__tenka.debug.getMapDiagnostics().ready;
        } catch (e) {
          if (
            e instanceof Error &&
            e.message ===
              '__TENKA_DEBUG__: map renderer 尚未掛載（尚未進入含地圖的畫面，如 MainScreen）'
          )
            return false;
          throw e;
        }
      }),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const snapshot = () =>
    page.evaluate(() => {
      const diagnostics = window.__tenka.debug.getMapDiagnostics();
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')
        ?.getBoundingClientRect();
      const lake = diagnostics.waterRendering.lakes[0];
      if (!canvas || !lake) throw new Error('Missing actual projection anchors');
      const j = lake.worldPoints.findIndex((p) => p.x !== lake.worldPoints[0]!.x);
      if (j < 0) throw new Error('Degenerate lake projection');
      const scale =
        (lake.points[j]!.x - lake.points[0]!.x) / (lake.worldPoints[j]!.x - lake.worldPoints[0]!.x);
      return {
        diagnostics,
        state: window.__tenka.debug.getState(),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        transform: {
          scale,
          x: lake.points[0]!.x - lake.worldPoints[0]!.x * scale,
          y: lake.points[0]!.y - lake.worldPoints[0]!.y * scale,
        },
      };
    });
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
  const initial = await snapshot();
  const observations = [];
  for (const pose of poses) {
    await page.evaluate((preset) => window.__tenka.debug.setMapCameraPreset(preset), pose.preset);
    if (pose.focus) {
      const mini = page.getByTestId('minimap-frame'),
        box = await mini.boundingBox();
      if (!box) throw new Error('Missing minimap hit box');
      await mini.click({
        position: { x: (pose.focus.x / 4096) * box.width, y: (pose.focus.y / 4096) * box.height },
      });
      const boxCanvas = await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox();
      if (!boxCanvas) throw new Error('Missing canvas');
      await page.mouse.move(boxCanvas.x + boxCanvas.width / 2, boxCanvas.y + boxCanvas.height / 2);
      for (let i = 0; i < (pose.stage === 'far' ? 19 : pose.stage === 'mid' ? 12 : 2); i++)
        await page.mouse.wheel(0, 1);
    }
    let previous = '',
      stable = 0;
    await expect
      .poll(async () => {
        const next = await page.evaluate(() =>
          JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
        );
        stable = next === previous ? stable + 1 : 0;
        previous = next;
        return stable;
      })
      .toBeGreaterThanOrEqual(3);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
    const before = await snapshot();
    const on = await page.screenshot({ path: info.outputPath(`${pose.key}-on.png`) });
    const prior = await page.evaluate(() => window.__tenka.debug.setMapRoadPaintVisible(false));
    let off: Buffer;
    try {
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
      off = await page.screenshot({ path: info.outputPath(`${pose.key}-off.png`) });
    } finally {
      await page.evaluate((visible) => window.__tenka.debug.setMapRoadPaintVisible(visible), prior);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    }
    const restored = await page.screenshot({ path: info.outputPath(`${pose.key}-restored.png`) });
    const after = await snapshot();
    const a = PNG.sync.read(on),
      b = PNG.sync.read(off),
      c = PNG.sync.read(restored);
    const stations =
      pose.key === 'hida-near'
        ? controls.map((control) => {
            const road = before.diagnostics.elevationRendering.roads.find(
              (r) => r.roadId === control.id,
            );
            if (!road) throw new Error(`Missing actual emitted route ${control.id}`);
            const canonical = {
              x: control.a.x + (control.b.x - control.a.x) * control.t,
              y: control.a.y + (control.b.y - control.a.y) * control.t,
            };
            const axis = { x: control.b.x - control.a.x, y: control.b.y - control.a.y };
            const fraction = (p: { x: number; y: number }) =>
              ((p.x - control.a.x) * axis.x + (p.y - control.a.y) * axis.y) /
              (axis.x ** 2 + axis.y ** 2);
            const k = road.stations.findIndex(
              (p, i) =>
                i + 1 < road.stations.length &&
                fraction(p.source) <= control.t &&
                fraction(road.stations[i + 1]!.source) >= control.t,
            );
            if (k < 0) throw new Error(`No emitted axial intersection ${control.id}`);
            const p = road.stations[k]!,
              q = road.stations[k + 1]!;
            const t = (control.t - fraction(p.source)) / (fraction(q.source) - fraction(p.source));
            const center = {
              x:
                before.canvas.x +
                before.transform.x +
                (p.scene.x + t * (q.scene.x - p.scene.x)) * before.transform.scale,
              y:
                before.canvas.y +
                before.transform.y +
                (p.scene.y + t * (q.scene.y - p.scene.y)) * before.transform.scale,
            };
            const dx = q.scene.x - p.scene.x,
              dy = q.scene.y - p.scene.y,
              length = Math.hypot(dx, dy);
            const pixels = [],
              seen = new Set<string>();
            for (let offset = -3; offset <= 3; offset += 0.25) {
              const x = Math.round(center.x - (dy / length) * offset),
                y = Math.round(center.y + (dx / length) * offset);
              if (seen.has(`${x},${y}`)) continue;
              seen.add(`${x},${y}`);
              if (x < 0 || y < 0 || x >= a.width || y >= a.height)
                throw new Error('Fixed station outside viewport');
              const index = (y * a.width + x) * 4;
              const onRGB = [...a.data.subarray(index, index + 3)],
                offRGB = [...b.data.subarray(index, index + 3)];
              const overlays = [
                ...before.diagnostics.geographicLabelLayout.labels,
                ...before.diagnostics.geographicLabelLayout.obstacles.filter(
                  (o) => o.kind !== 'canvasEdge',
                ),
                ...before.diagnostics.armyRendering.signals.flatMap((signal) =>
                  signal.visible && signal.rect
                    ? [{ id: `signal:${signal.id}`, rect: signal.rect }]
                    : [],
                ),
              ]
                .filter(
                  (o) =>
                    x + 0.5 > o.rect.x + before.canvas.x &&
                    x - 0.5 < o.rect.x + before.canvas.x + o.rect.width &&
                    y + 0.5 > o.rect.y + before.canvas.y &&
                    y - 0.5 < o.rect.y + before.canvas.y + o.rect.height,
                )
                .map((o) => o.id);
              pixels.push({
                x,
                y,
                onRGB,
                offRGB,
                restoredRGB: [...c.data.subarray(index, index + 3)],
                overlays,
                delta: Math.max(...onRGB.map((v, i) => Math.abs(v - offRGB[i]!))),
              });
            }
            return { control, canonical, emitted: road, center, pixels };
          })
        : [];
    const record = { pose, before, after, stations, restoredExact: a.data.equals(c.data) };
    observations.push(record);
    writeFileSync(info.outputPath(`${pose.key}.json`), JSON.stringify(record, null, 2));
    await info.attach(pose.key, { body: JSON.stringify(record), contentType: 'application/json' });
  }
  // All eighteen PNGs and six raw observations precede behavioral assertions.
  for (const { pose, before, after, stations, restoredExact } of observations) {
    expect(before.state).toEqual(initial.state);
    expect(after.state).toEqual(initial.state);
    expect(validateState(before.state)).toEqual([]);
    expect(before.commands).toBe(initial.commands);
    expect(after.commands).toBe(initial.commands);
    expect(before.diagnostics.lodStage).toBe(pose.stage);
    expect(after.transform).toEqual(before.transform);
    expect(after.diagnostics.resources).toEqual(before.diagnostics.resources);
    expect(after.diagnostics.elevationRendering.roads).toEqual(
      before.diagnostics.elevationRendering.roads,
    );
    expect(restoredExact).toBe(true);
    for (const station of stations) {
      expect(station.emitted.stations[0]!.source).toEqual(station.control.a);
      expect(station.emitted.stations.at(-1)!.source).toEqual(station.control.b);
      expect(
        station.pixels.flatMap((p) => p.overlays),
        `${station.control.context} fixed station must be unobscured`,
      ).toEqual([]);
      expect(Math.max(...station.pixels.map((p) => p.delta))).toBeGreaterThan(0);
    }
  }
  expect(errors).toEqual([]);
});
