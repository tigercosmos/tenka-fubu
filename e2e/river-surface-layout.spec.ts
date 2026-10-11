import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { TenkaDebugApi } from '../src/app/debug';
import { DEBUG_VISUAL_ROAD_DISPLAY } from '../src/core/state/debugVisualRoadDisplay';
import { test, expect } from './fixtures';

type DebugWindow = Window & { __tenka: { debug: TenkaDebugApi } };
type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
const terrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { rivers: { id: string; points: number[]; widthClass: number }[] };
const probes = ['rv.kiso', 'rv.yodo'].map((id) => {
  const river = terrain.rivers.find((entry) => entry.id === id)!;
  const count = river.points.length / 2;
  // Kiso's mouth lies inside the protected coastal shelf; the next segment
  // crosses actual castle/army text. Select its upstream segment from authored
  // geography, not from sampled colors.
  const segment = id === 'rv.kiso' ? count - 4 : count - 2;
  return {
    id,
    sourceSegment: segment,
    a: { x: river.points[segment * 2]!, y: river.points[segment * 2 + 1]! },
    b: { x: river.points[(segment + 1) * 2]!, y: river.points[(segment + 1) * 2 + 1]! },
    radius: 3.5 * (0.4 + (0.6 * segment) / (count - 2)),
  };
});
const inRect = (p: Point, rect: Rect, margin = 2) =>
  p.x >= rect.x - margin &&
  p.x <= rect.x + rect.width + margin &&
  p.y >= rect.y - margin &&
  p.y <= rect.y + rect.height + margin;
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function landAndClearance(p: Point, flat: number[]) {
  let inside = false,
    distance = Infinity;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const a = { x: flat[j]!, y: flat[j + 1]! },
      b = { x: flat[i]!, y: flat[i + 1]! };
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
    distance = Math.min(distance, segmentDistance(p, a, b));
  }
  return { inside, distance };
}
function mean(png: PNG, point: Point) {
  const x = Math.round(point.x),
    y = Math.round(point.y);
  const offset = (y * png.width + x) * 4;
  return {
    point,
    pixel: { x, y },
    rgb: [...png.data.subarray(offset, offset + 3)],
    value: (png.data[offset]! + png.data[offset + 1]! + png.data[offset + 2]!) / 3,
  };
}

test.describe('native quiet river surface', () => {
  test.use({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
  });

  test('actual wide-river interior varies quietly along both banks instead of uniform concentric pipe strokes', async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(() =>
      JSON.stringify((window as DebugWindow).__tenka.debug.getState()),
    );
    const observations = [];
    for (const probe of probes) {
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
      const mini = page.getByTestId('minimap-frame'),
        box = await mini.boundingBox();
      expect(box).not.toBeNull();
      await mini.click({
        position: {
          x: ((probe.a.x + probe.b.x) / 2 / 4096) * box!.width,
          y: ((probe.a.y + probe.b.y) / 2 / 4096) * box!.height,
        },
      });
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
      const scene = await page.evaluate(() => {
        const debug = (window as DebugWindow).__tenka.debug;
        const diagnostics = debug.getMapDiagnostics(),
          state = debug.getState();
        const canvas = document
          .querySelector('[data-testid="map-canvas-host"] canvas')!
          .getBoundingClientRect();
        const hud = [
          ...document.querySelectorAll(
            '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *',
          ),
        ]
          .map((element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
          .filter((r) => r.width > 0 && r.height > 0);
        return {
          diagnostics,
          roads: Object.values(state.roads).map((road) => ({
            ...road,
            aPos:
              state.castles[road.a as keyof typeof state.castles]?.pos ??
              state.districts[road.a as keyof typeof state.districts]?.pos,
            bPos:
              state.castles[road.b as keyof typeof state.castles]?.pos ??
              state.districts[road.b as keyof typeof state.districts]?.pos,
          })),
          hud,
          origin: { x: canvas.x, y: canvas.y },
          anchors: diagnostics.castleRendering.nodes.map((node) => ({
            screen: node.anchor,
            world: Object.values(state.castles).find((castle) => castle.id === node.id)!.pos,
            scene: diagnostics.elevationRendering.nodes.find((entry) => entry.id === node.id)!
              .scene,
          })),
        };
      });
      // Water paint stays in protected flat coordinates. Its separately observed
      // lake vertices determine the camera, without using the river pixels under
      // test or treating elevated castle anchors as canonical coordinates.
      const lake = scene.diagnostics.waterRendering.lakes[0]!;
      expect(lake.worldPoints.length).toBeGreaterThan(1);
      const reference = lake.worldPoints.findIndex((point) => point.x !== lake.worldPoints[0]!.x);
      expect(reference).toBeGreaterThan(0);
      const worldAnchor = lake.worldPoints[0]!;
      const screenAnchor = lake.points[0]!;
      const scale =
        (lake.points[reference]!.x - screenAnchor.x) /
        (lake.worldPoints[reference]!.x - worldAnchor.x);
      expect(scale).toBeGreaterThan(0);
      const project = (p: Point) => ({
        x: scene.origin.x + screenAnchor.x + (p.x - worldAnchor.x) * scale,
        y: scene.origin.y + screenAnchor.y + (p.y - worldAnchor.y) * scale,
      });
      const unproject = (p: Point) => ({
        x: worldAnchor.x + (p.x - scene.origin.x - screenAnchor.x) / scale,
        y: worldAnchor.y + (p.y - scene.origin.y - screenAnchor.y) / scale,
      });
      for (const observedLake of scene.diagnostics.waterRendering.lakes) {
        expect(observedLake.points).toHaveLength(observedLake.worldPoints.length);
        observedLake.worldPoints.forEach((point, i) => {
          const mapped = project(point);
          expect(mapped.x).toBeCloseTo(scene.origin.x + observedLake.points[i]!.x, 6);
          expect(mapped.y).toBeCloseTo(scene.origin.y + observedLake.points[i]!.y, 6);
        });
      }
      for (const anchor of scene.anchors) {
        const height = anchor.world.y - anchor.scene.y;
        expect(height).toBeGreaterThanOrEqual(-1e-8);
        expect(height).toBeLessThanOrEqual(
          scene.diagnostics.elevationRendering.field?.maximumHeight ?? 0,
        );
        expect(anchor.scene.x).toBeCloseTo(anchor.world.x - 0.18 * height, 8);
        const mapped = project(anchor.scene);
        expect(mapped.x).toBeCloseTo(scene.origin.x + anchor.screen.x, 6);
        expect(mapped.y).toBeCloseTo(scene.origin.y + anchor.screen.y, 6);
      }
      const roads = scene.roads.map((road) => {
        const display = DEBUG_VISUAL_ROAD_DISPLAY[road.id];
        const flat = display?.waypoints ?? [];
        return {
          id: road.id,
          points: [
            road.aPos!,
            ...Array.from({ length: flat.length / 2 }, (_, i) => ({
              x: flat[i * 2]!,
              y: flat[i * 2 + 1]!,
            })),
            road.bPos!,
          ],
          bridges: Array.from({ length: (display?.bridges?.length ?? 0) / 2 }, (_, i) => ({
            x: display!.bridges![i * 2]!,
            y: display!.bridges![i * 2 + 1]!,
          })),
        };
      });
      const actorRects = [
        ...scene.diagnostics.actorDepth.bodies.flatMap((body) =>
          body.visible && body.rect ? [body.rect] : [],
        ),
        ...scene.diagnostics.armyPlateLayout.plates.map((plate) => plate.rect),
        ...scene.diagnostics.armyRendering.signals.flatMap((signal) =>
          signal.visible && signal.rect ? [signal.rect] : [],
        ),
        ...scene.diagnostics.geographicLabelLayout.labels.map((label) => label.rect),
      ].map((r) => ({ ...r, x: r.x + scene.origin.x, y: r.y + scene.origin.y }));
      const dx = probe.b.x - probe.a.x,
        dy = probe.b.y - probe.a.y;
      const emitted = scene.diagnostics.riverRendering.materials.rivers.find(
        (river) => river.id === probe.id,
      )!.displaySegments;
      const screenshot = await page.screenshot({ path: info.outputPath(`river-${probe.id}.png`) });
      const png = PNG.sync.read(screenshot);
      const rejected: { t: number; reason: string }[] = [];
      const rows = Array.from({ length: 48 }, (_, index) => {
        const t = 0.18 + (index * 0.44) / 47;
        const rawCenter = { x: probe.a.x + dx * t, y: probe.a.y + dy * t };
        // Keep all original axial stations. Intersect their transverse planes with
        // actual emitted paint, rather than sampling the obsolete raw centerline.
        const intersections = emitted
          .filter((segment) => segment.sourceSegment === probe.sourceSegment)
          .flatMap((segment) => {
            const sx = segment.b.x - segment.a.x,
              sy = segment.b.y - segment.a.y;
            const denominator = sx * dx + sy * dy;
            if (Math.abs(denominator) < 1e-10) return [];
            const u =
              ((rawCenter.x - segment.a.x) * dx + (rawCenter.y - segment.a.y) * dy) / denominator;
            if (u < -1e-9 || u > 1 + 1e-9) return [];
            return [{ center: { x: segment.a.x + sx * u, y: segment.a.y + sy * u }, segment }];
          })
          .filter(
            (entry, i, entries) =>
              !entries
                .slice(0, i)
                .some(
                  (other) =>
                    Math.hypot(other.center.x - entry.center.x, other.center.y - entry.center.y) <
                    1e-8,
                ),
          );
        if (intersections.length !== 1) {
          rejected.push({
            t,
            reason: `actual axial station has ${intersections.length} intersections`,
          });
          return null;
        }
        const { center, segment } = intersections[0]!;
        const sx = segment.b.x - segment.a.x,
          sy = segment.b.y - segment.a.y;
        const segmentLength = Math.hypot(sx, sy);
        const nx = -sy / segmentLength,
          ny = sx / segmentLength;
        const radius = segment.width / 2;
        expect(radius, 'unchanged source width at the fixed station').toBe(probe.radius);
        const world = [-0.6, 0, 0.6].map((side) => ({
          x: center.x + nx * radius * side,
          y: center.y + ny * radius * side,
        }));
        const screen = world.map(project);
        if (
          screen.some(
            (p) =>
              p.x < 1 ||
              p.y < 1 ||
              p.x >= png.width - 1 ||
              p.y >= png.height - 1 ||
              [...scene.hud, ...actorRects].some((r) => inRect(p, r)),
          )
        ) {
          rejected.push({ t, reason: 'viewport/HUD/actor/text' });
          return null;
        }
        const samples = screen.map((p) => mean(png, p));
        const actualWorld = samples.map((sample) => unproject(sample.pixel));
        for (const p of actualWorld) {
          if (segmentDistance(p, segment.a, segment.b) > 0.65 * radius) {
            rejected.push({ t, reason: 'roundedpixel outside actual .65radius' });
            return null;
          }
          // mean() reads one rounded screenshot pixel. Its whole square, not
          // merely its center, must be inside the actual emitted capsule union.
          const screenPixel = project(p);
          const corners = [-0.5, 0.5].flatMap((x) =>
            [-0.5, 0.5].map((y) => unproject({ x: screenPixel.x + x, y: screenPixel.y + y })),
          );
          if (
            corners.some(
              (corner) => !emitted.some((s) => segmentDistance(corner, s.a, s.b) <= s.width / 2),
            )
          ) {
            rejected.push({ t, reason: 'rounded pixel support outside actual water' });
            return null;
          }
          // Conservative paint superset: ≤4world display corner deviation,
          // nominal road/verge/grain/shadow envelope below8world; reserve12.
          // Bridge36world disk contains the original largest2.5× deck,
          // abutment/rails/shadow, not merely the centerline crossing.
          if (
            roads.some(
              (road) =>
                road.points.some(
                  (point, i) => i > 0 && segmentDistance(p, road.points[i - 1]!, point) <= 12,
                ) ||
                road.bridges.some((bridge) => Math.hypot(p.x - bridge.x, p.y - bridge.y) <= 36),
            )
          ) {
            rejected.push({ t, reason: 'conservative original road/bridge paint envelope' });
            return null;
          }
          const land = scene.diagnostics.coastRendering.displayPolygons.map((polygon) =>
            landAndClearance(p, polygon.points),
          );
          if (
            !land.some((polygon) => polygon.inside) ||
            land.some((polygon) => polygon.distance <= 16)
          ) {
            rejected.push({ t, reason: 'emittedcoast/shelf16world guard' });
            return null;
          }
        }
        return { t, rawCenter, center, segment, world, actualWorld, samples };
      }).filter((row) => row !== null);
      const ranges = [0, 1, 2].map((side) => {
        const values = rows.map((row) => row.samples[side]!.value);
        return Math.max(...values) - Math.min(...values);
      });
      await info.attach(`river-raw-${probe.id}`, {
        body: JSON.stringify({ probe, scene, rows, ranges, rejected, roads }),
        contentType: 'application/json',
      });
      const idle = PNG.sync.read(await page.screenshot());
      const repeated = rows.map((row) => row.samples.map((sample) => mean(idle, sample.point)));
      await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug.setMapCameraPreset('overview'),
      );
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
      const far = await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
      );
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.setMapCameraPreset('close'));
      await mini.click({
        position: {
          x: ((probe.a.x + probe.b.x) / 2 / 4096) * box!.width,
          y: ((probe.a.y + probe.b.y) / 2 / 4096) * box!.height,
        },
      });
      await page.evaluate(() => (window as DebugWindow).__tenka.debug.waitMapIdle(3));
      const restored = PNG.sync.read(await page.screenshot());
      const roundtrip = rows.map((row) =>
        row.samples.map((sample) => mean(restored, sample.point)),
      );
      const settled = await page.evaluate(() =>
        (window as DebugWindow).__tenka.debug.getMapDiagnostics(),
      );
      observations.push({ probe, rows, ranges, repeated, roundtrip, scene, far, settled });
    }
    // Both original-build PNGs and measurements precede any material requirement.
    for (const observation of observations) {
      expect(
        observation.rows.length,
        'real unoccluded samples; no success-only row selection',
      ).toBeGreaterThanOrEqual(8);
      for (const side of [0, 2]) {
        expect(
          observation.ranges[side],
          'both bank interiors vary along the river',
        ).toBeGreaterThanOrEqual(3);
        expect(
          observation.ranges[side],
          'restrained material, not high-contrast noise',
        ).toBeLessThanOrEqual(18);
      }
      expect(observation.repeated).toEqual(observation.rows.map((row) => row.samples));
      expect(observation.roundtrip).toEqual(observation.rows.map((row) => row.samples));
    }
    // Actual pixel behavior precedes the new structural ownership contract.
    for (const { scene, far, settled } of observations) {
      const material = scene.diagnostics.riverRendering.materials;
      expect(material.ownedTextures).toBe(10);
      expect(material.ownedSources).toBe(10);
      expect(material.ownedStyleListeners).toBe(10);
      expect(material.rivers.map((river) => river.id).sort()).toEqual(
        terrain.rivers.map((river) => river.id).sort(),
      );
      expect(material.rgbaBytes).toBe(
        material.rivers.reduce((sum, river) => sum + river.width * river.height * 4, 0),
      );
      expect(material.rgbaBytes).toBeLessThanOrEqual(10 * 32768 * 4);
      for (const river of material.rivers) {
        expect(river.kind).toBe('bankReflection');
        expect(Math.max(river.width, river.height)).toBeLessThanOrEqual(512);
        expect(Math.min(river.width, river.height)).toBeGreaterThanOrEqual(8);
        expect(river.bounds).not.toBeNull();
        expect(Object.values(river.bounds!).every(Number.isFinite)).toBe(true);
        const original = terrain.rivers.find((entry) => entry.id === river.id)!;
        expect(river.points).toEqual(
          Array.from({ length: original.points.length / 2 }, (_, i) => ({
            x: original.points[i * 2]!,
            y: original.points[i * 2 + 1]!,
          })),
        );
      }
      expect(far.riverRendering.materials).toEqual(material);
      expect(settled.riverRendering.materials).toEqual(material);
      expect(far.riverRendering.classes.map((entry) => entry.visible)).toEqual([
        true,
        false,
        false,
      ]);
      expect(settled.riverRendering.classes.map((entry) => entry.visible)).toEqual([
        true,
        true,
        true,
      ]);
      expect(settled.resources.ownedRiverTextures).toBe(10);
      expect(settled.resources.ownedRiverSources).toBe(10);
      expect(settled.resources.riverRgbaBytes).toBe(material.rgbaBytes);
      expect(settled.resources.riverStyleListeners).toBe(10);
    }
    expect(
      await page.evaluate(() => JSON.stringify((window as DebugWindow).__tenka.debug.getState())),
    ).toBe(before);
    expect(errors).toEqual([]);
  });
});
