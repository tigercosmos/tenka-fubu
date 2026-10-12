import { completeNewGameWizard } from './new-game-wizard';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from './fixtures';
const authoredRoads = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/roads.json', import.meta.url), 'utf8'),
) as { edges: { id: string; waypoints?: unknown[]; bridges?: unknown[] }[] };

test('national Shikoku road has attributable paint at fixed unobstructed dash stations', async ({
  page,
}, info) => {
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
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              '__TENKA_DEBUG__: map renderer 尚未掛載（尚未進入含地圖的畫面，如 MainScreen）'
          )
            return false;
          throw error;
        }
      }),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
  const mini = page.getByTestId('minimap-frame');
  const box = (await mini.boundingBox())!;
  await mini.click({
    position: { x: (1189.5 / 4096) * box.width, y: (3208.5 / 4096) * box.height },
  });
  let previous = '';
  let stable = 0;
  await expect
    .poll(async () => {
      const signature = await page.evaluate(() =>
        JSON.stringify(window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points),
      );
      stable = signature === previous ? stable + 1 : 0;
      previous = signature;
      return stable;
    })
    .toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
  const snapshot = () =>
    page.evaluate(() => {
      const d = window.__tenka.debug.getMapDiagnostics();
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      const state = window.__tenka.debug.getState();
      const road = state.roads['road.b7-30' as keyof typeof state.roads]!;
      const position = (id: string) =>
        Object.values(state.castles).find((n) => n.id === id)?.pos ??
        Object.values(state.districts).find((n) => n.id === id)?.pos;
      return {
        state: JSON.stringify(state),
        commands: JSON.stringify(window.__tenka.debug.exportCommandLog()),
        resources: d.resources,
        roadLayer: d.layers.roads!,
        lake: d.waterRendering.lakes[0]!,
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        road: {
          id: road.id,
          grade: road.grade,
          type: road.type,
          a: position(road.a),
          b: position(road.b),
        },
        labels: d.geographicLabelLayout.labels,
        obstacles: d.geographicLabelLayout.obstacles,
        emitted: d.elevationRendering.roads.find((r) => r.roadId === road.id),
      };
    });
  const before = await snapshot();
  expect(before.road).toEqual({
    id: 'road.b7-30',
    grade: 1,
    type: 'land',
    a: { x: 1203, y: 3266 },
    b: { x: 1409, y: 3124 },
  });
  const authored = authoredRoads.edges.find((road) => road.id === before.road.id)!;
  expect(authored).toBeDefined();
  expect(authored.waypoints ?? []).toEqual([]);
  expect(authored.bridges ?? []).toEqual([]);
  const on = await page.screenshot({ path: info.outputPath('road-on.png') });
  const prior = await page.evaluate(() => window.__tenka.debug.setMapRoadPaintVisible(false));
  let off: Buffer;
  try {
    expect(prior).toBe(true);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    off = await page.screenshot({ path: info.outputPath('road-off.png') });
    const hidden = await snapshot();
    expect(hidden.state).toEqual(before.state);
    expect(hidden.commands).toEqual(before.commands);
    expect(hidden.resources).toEqual(before.resources);
    expect(hidden.roadLayer.children).toEqual(before.roadLayer.children);
    expect(hidden.roadLayer.rebuildCount).toEqual(before.roadLayer.rebuildCount);
    expect(await page.evaluate(() => window.__tenka.debug.setMapRoadPaintVisible(false))).toBe(
      false,
    );
  } finally {
    await page.evaluate((visible) => window.__tenka.debug.setMapRoadPaintVisible(visible), prior);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
  }
  const restored = await page.screenshot({ path: info.outputPath('road-restored.png') });
  const after = await snapshot();
  expect(after).toEqual(before);
  const a = PNG.sync.read(on),
    b = PNG.sync.read(off!),
    c = PNG.sync.read(restored);
  expect(c.data.equals(a.data)).toBe(true);
  const lake = before.lake;
  const p = lake.worldPoints[0]!;
  const index = lake.worldPoints.findIndex((q) => q.x !== p.x);
  expect(index).toBeGreaterThan(0);
  const scale = (lake.points[index]!.x - lake.points[0]!.x) / (lake.worldPoints[index]!.x - p.x);
  expect(scale).toBeCloseTo(1.5, 5);
  const project = (x: number, y: number) => ({
    x: before.canvas.x + lake.points[0]!.x + (x - p.x) * scale,
    y: before.canvas.y + lake.points[0]!.y + (y - p.y) * scale,
  });
  expect(before.emitted).toBeDefined();
  const emitted = before.emitted!;
  expect(emitted.stations[0]!.source).toEqual(before.road.a);
  expect(emitted.stations.at(-1)!.source).toEqual(before.road.b);
  // The installed dashedPolyline producer measures phase along its emitted scene
  // polyline, not along the pre-projection canonical straight edge. Keep the same
  // fixed dash indices, transverse samples and original 32/255 paint threshold.
  const stations = [5, 8, 11, 14, 21].map((k) => {
    const distance = 9 * k + 2.5;
    let remaining = distance;
    let sample: { x: number; y: number; dx: number; dy: number; length: number } | undefined;
    for (let i = 1; i < emitted.stations.length; i++) {
      const p = emitted.stations[i - 1]!.scene;
      const q = emitted.stations[i]!.scene;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        length = Math.hypot(dx, dy);
      if (length === 0) continue;
      if (remaining <= length) {
        sample = {
          x: p.x + (dx * remaining) / length,
          y: p.y + (dy * remaining) / length,
          dx,
          dy,
          length,
        };
        break;
      }
      remaining -= length;
    }
    if (!sample) throw new Error(`Fixed dash ${k} lies outside the actual emitted route`);
    const { dx, dy, length } = sample;
    const center = project(sample.x, sample.y);
    const overlaps = [
      ...before.labels.map((l) => ({ id: l.id, kind: l.kind, rect: l.rect })),
      ...before.obstacles.filter((o) => o.kind !== 'canvasEdge'),
    ].filter((o) => {
      const r = o.rect;
      return (
        center.x - 4 < r.x + before.canvas.x + r.width &&
        r.x + before.canvas.x < center.x + 4 &&
        center.y - 4 < r.y + before.canvas.y + r.height &&
        r.y + before.canvas.y < center.y + 4
      );
    });
    const pixels = [];
    const seen = new Set<string>();
    for (let offset = -3; offset <= 3; offset += 0.25) {
      const x = Math.round(center.x - (dy / length) * offset),
        y = Math.round(center.y + (dx / length) * offset);
      if (seen.has(`${x},${y}`)) continue;
      seen.add(`${x},${y}`);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(a.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(a.height);
      const i = (y * a.width + x) * 4;
      const onRGB = [...a.data.subarray(i, i + 3)],
        offRGB = [...b.data.subarray(i, i + 3)];
      pixels.push({
        x,
        y,
        onRGB,
        offRGB,
        delta: Math.max(...onRGB.map((v, channel) => Math.abs(v - offRGB[channel]!))),
      });
    }
    return {
      k,
      distance,
      center,
      overlaps,
      pixels,
      maxDelta: Math.max(...pixels.map((pixel) => pixel.delta)),
    };
  });
  const observations = JSON.stringify({ road: before.road, emitted, scale, stations }, null, 2);
  writeFileSync(info.outputPath('fixed-road-paint-stations.json'), observations);
  await info.attach('fixed-road-paint-stations', {
    body: observations,
    contentType: 'application/json',
  });
  for (const station of stations) {
    expect(station.overlaps, `station ${station.k} must not be obscured`).toEqual([]);
    expect(
      station.maxDelta,
      `station ${station.k} must contain at least 32/255 road-attributable channel contrast`,
    ).toBeGreaterThanOrEqual(32);
  }
});
