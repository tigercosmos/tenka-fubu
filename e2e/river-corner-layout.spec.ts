import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { DEBUG_VISUAL_ROAD_DISPLAY } from '../src/core/state/debugVisualRoadDisplay';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type Segment = { a: Point; b: Point; width: number };
const terrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { rivers: { id: string; points: number[]; widthClass: number }[] };
const controls = [
  {
    id: 'rv.fuji',
    corner: { x: 2364, y: 2870 },
    limit: 20,
    pixelAcceptance: false,
    visualRole: 'obstructed-context; emitted-geometry-only',
  },
  {
    id: 'rv.shinano',
    corner: { x: 2515, y: 2310 },
    limit: 30,
    pixelAcceptance: true,
    visualRole: 'clear visual-review control',
  },
];
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function localTurns(segments: readonly Segment[], corner: Point) {
  const turns: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]!,
      b = segments[i]!;
    if (Math.hypot(a.b.x - b.a.x, a.b.y - b.a.y) > 1e-8) continue;
    if (Math.hypot(b.a.x - corner.x, b.a.y - corner.y) > 13) continue;
    const ax = a.b.x - a.a.x,
      ay = a.b.y - a.a.y,
      bx = b.b.x - b.a.x,
      by = b.b.y - b.a.y;
    if (Math.hypot(ax, ay) === 0 || Math.hypot(bx, by) === 0) continue;
    turns.push(
      (Math.acos(
        Math.max(-1, Math.min(1, (ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by))),
      ) *
        180) /
        Math.PI,
    );
  }
  return turns;
}

test('actual emitted river corners soften with one clear visual-review control and unchanged raw footprints/gameplay', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const before = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const observations = [];
  for (const control of controls) {
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
    const mini = page.getByTestId('minimap-frame');
    const box = (await mini.boundingBox())!;
    await mini.click({
      position: {
        x: (control.corner.x / 4096) * box.width,
        y: (control.corner.y / 4096) * box.height,
      },
    });
    await page.mouse.move(570, 340);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -100);
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
    const scene = await page.evaluate(() => {
      const d = window.__tenka.debug.getMapDiagnostics();
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      const hud = [
        ...document.querySelectorAll(
          '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *',
        ),
      ]
        .map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })
        .filter((r) => r.width > 0 && r.height > 0);
      return {
        d,
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
        hud,
      };
    });
    const lake = scene.d.waterRendering.lakes[0]!;
    const first = lake.worldPoints[0]!;
    const index = lake.worldPoints.findIndex((p) => p.x !== first.x);
    expect(index).toBeGreaterThan(0);
    const scale =
      (lake.points[index]!.x - lake.points[0]!.x) / (lake.worldPoints[index]!.x - first.x);
    expect(scale).toBeGreaterThanOrEqual(2);
    const project = (p: Point) => ({
      x: scene.canvas.x + lake.points[0]!.x + (p.x - first.x) * scale,
      y: scene.canvas.y + lake.points[0]!.y + (p.y - first.y) * scale,
    });
    const center = project(control.corner);
    const crop = {
      x: Math.floor(center.x - 16 * scale),
      y: Math.floor(center.y - 16 * scale),
      width: Math.ceil(32 * scale),
      height: Math.ceil(32 * scale),
    };
    const critical = {
      x: center.x - 8 * scale,
      y: center.y - 8 * scale,
      width: 16 * scale,
      height: 16 * scale,
    };
    const actors = [
      ...scene.d.actorDepth.bodies.flatMap((b) => (b.visible && b.rect ? [b.rect] : [])),
      ...scene.d.armyPlateLayout.plates.map((p) => p.rect),
      ...scene.d.armyPlateLayout.castles.map((p) => p.rect),
      ...scene.d.geographicLabelLayout.labels.map((p) => p.rect),
    ].map((r) => ({ ...r, x: r.x + scene.canvas.x, y: r.y + scene.canvas.y }));
    const material = scene.d.riverRendering.materials.rivers.find((r) => r.id === control.id)!;
    const display =
      (material as typeof material & { displaySegments?: readonly Segment[] }).displaySegments ??
      material.segments;
    const canonical = terrain.rivers.find((r) => r.id === control.id)!;
    const raw = Array.from({ length: canonical.points.length / 2 }, (_, i) => ({
      x: canonical.points[i * 2]!,
      y: canonical.points[i * 2 + 1]!,
    }));
    const turns = localTurns(display, control.corner);
    const roads = await page.evaluate(() =>
      Object.values(window.__tenka.debug.getState().roads).map((road) => {
        const state = window.__tenka.debug.getState();
        const position = (id: string) =>
          Object.values(state.castles).find((n) => n.id === id)?.pos ??
          Object.values(state.districts).find((n) => n.id === id)?.pos;
        return { id: road.id, a: position(road.a)!, b: position(road.b)! };
      }),
    );
    const roadSegments = roads.flatMap((r) => {
      const authored = DEBUG_VISUAL_ROAD_DISPLAY[r.id]?.waypoints ?? [];
      const points = [
        r.a,
        ...Array.from({ length: authored.length / 2 }, (_, i) => ({
          x: authored[i * 2]!,
          y: authored[i * 2 + 1]!,
        })),
        r.b,
      ];
      return points.slice(1).map((b, i) => ({ a: points[i]!, b }));
    });
    const bridges = Object.values(DEBUG_VISUAL_ROAD_DISPLAY).flatMap((r) =>
      Array.from({ length: (r.bridges?.length ?? 0) / 2 }, (_, i) => ({
        x: r.bridges![i * 2]!,
        y: r.bridges![i * 2 + 1]!,
      })),
    );
    const coasts = scene.d.coastRendering.displayPolygons;
    const coastSegments = coasts.flatMap((poly) =>
      Array.from({ length: poly.points.length / 2 }, (_, i) => ({
        a: { x: poly.points[i * 2]!, y: poly.points[i * 2 + 1]! },
        b: {
          x: poly.points[(i * 2 + 2) % poly.points.length]!,
          y: poly.points[(i * 2 + 3) % poly.points.length]!,
        },
      })),
    );
    const observation = {
      ...control,
      scale,
      crop,
      critical,
      raw,
      emittedRaw: material.points,
      emittedSegments: material.segments,
      display,
      turns,
      hudIntersections: scene.hud.filter((r) => overlap(crop, r)),
      actorIntersections: actors.filter((r) => overlap(crop, r)),
      criticalHudIntersections: scene.hud.filter((r) => overlap(critical, r)),
      criticalActorIntersections: actors.filter((r) => overlap(critical, r)),
      nearestAuthoredRoad: Math.min(...roadSegments.map((r) => distance(control.corner, r.a, r.b))),
      nearestBridge: Math.min(
        ...bridges.map((p) => Math.hypot(p.x - control.corner.x, p.y - control.corner.y)),
      ),
      coastClearance: Math.min(...coastSegments.map((s) => distance(control.corner, s.a, s.b))),
    };
    await info.attach(`river-corner-${control.id}`, {
      body: JSON.stringify(observation, null, 2),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath(`river-corner-${control.id}-scene.png`) });
    expect(crop.x).toBeGreaterThanOrEqual(scene.canvas.x);
    expect(crop.y).toBeGreaterThanOrEqual(scene.canvas.y);
    expect(crop.x + crop.width).toBeLessThanOrEqual(scene.canvas.x + scene.canvas.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(scene.canvas.y + scene.canvas.height);
    await page.screenshot({
      path: info.outputPath(`river-corner-${control.id}-close.png`),
      clip: crop,
    });
    observations.push(observation);
  }
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(before);
  for (const observation of observations) {
    if (observation.pixelAcceptance) {
      expect(observation.criticalHudIntersections).toEqual([]);
      expect(observation.criticalActorIntersections).toEqual([]);
      expect(observation.nearestAuthoredRoad).toBeGreaterThan(24);
      expect(observation.nearestBridge).toBeGreaterThan(36);
      expect(observation.coastClearance).toBeGreaterThan(20);
    }
  }
  for (const observation of observations) {
    expect(observation.emittedRaw).toEqual(observation.raw);
    expect(observation.turns.length).toBeGreaterThan(0);
    expect(Math.max(...observation.turns), observation.id).toBeLessThan(observation.limit);
  }
});
