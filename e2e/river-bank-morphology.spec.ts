import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect } from './fixtures';
import { DEBUG_VISUAL_ROAD_DISPLAY } from '../src/core/state/debugVisualRoadDisplay';
import { associatedWaterRun, isFixedBankWaterPixel } from './river-bank-pixel-run';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
const terrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { rivers: { id: string; points: number[] }[] };
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
function pointDistance(p: Point, a: Point, b: Point) {
  const x = b.x - a.x,
    y = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1)));
  return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
}
function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return 0;
  return Math.min(
    pointDistance(a, c, d),
    pointDistance(b, c, d),
    pointDistance(c, a, b),
    pointDistance(d, a, b),
  );
}
function rectDistance(a: Point, b: Point, r: Rect) {
  if (inside(a, r) || inside(b, r)) return 0;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  return Math.min(...corners.map((p, i) => segmentDistance(a, b, p, corners[(i + 1) % 4]!)));
}

for (const control of [
  {
    name: 'Kiso',
    id: 'rv.kiso',
    a: { x: 2050, y: 2720 },
    b: { x: 1990, y: 2800 },
    focus: { x: 2020, y: 2760 },
  },
  {
    name: 'Shinano',
    id: 'rv.shinano',
    a: { x: 2500, y: 2360 },
    b: { x: 2515, y: 2310 },
    focus: { x: 2507.5, y: 2335 },
  },
] as const) {
  test(`fixed inland ${control.name} full-bank reference has guarded pixels and stable geography`, async ({
    page,
  }, info) => {
    const raw = terrain.rivers.find((r) => r.id === control.id)!;
    const { a, b } = control;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    const normal = { x: -dy / length, y: dx / length };
    const worldAt = (t: number, side: number): Point => ({
      x: a.x + dx * t + normal.x * side,
      y: a.y + dy * t + normal.y * side,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?debug=visual-map');
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const stateBefore = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
    const settle = async () => {
      let previous = '',
        stable = 0;
      await expect
        .poll(async () => {
          const value = await page.evaluate(() =>
            JSON.stringify(
              window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points,
            ),
          );
          stable = value === previous ? stable + 1 : 0;
          previous = value;
          return stable;
        })
        .toBeGreaterThanOrEqual(3);
    };
    const focus = async () => {
      await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
      const mini = page.getByTestId('minimap-frame'),
        box = (await mini.boundingBox())!;
      await mini.click({
        position: {
          x: (control.focus.x / 4096) * box.width,
          y: (control.focus.y / 4096) * box.height,
        },
      });
      await settle();
      await page.mouse.move(570, 340);
      for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
      await settle();
    };
    await focus();
    const scene = await page.evaluate(() => {
      const d = window.__tenka.debug.getMapDiagnostics(),
        state = window.__tenka.debug.getState();
      const cr = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      const toRect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
      const hud = [
        ...document.querySelectorAll(
          '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *, [data-testid="siege-overlay"], [data-testid="screen-strategy"] > div[aria-hidden="false"]',
        ),
      ]
        .map((n) => toRect(n.getBoundingClientRect()))
        .filter((r) => r.width > 0 && r.height > 0);
      const position = (id: string) =>
        Object.values(state.castles).find((n) => n.id === id)?.pos ??
        Object.values(state.districts).find((n) => n.id === id)?.pos;
      return {
        d,
        canvas: toRect(cr),
        hud,
        roads: Object.values(state.roads).map((r) => ({
          id: r.id,
          a: position(r.a)!,
          b: position(r.b)!,
        })),
      };
    });
    const lake = scene.d.waterRendering.lakes[0]!,
      p = lake.worldPoints[0]!;
    const index = lake.worldPoints.findIndex((q) => q.x !== p.x);
    expect(index).toBeGreaterThan(0);
    const scale = (lake.points[index]!.x - lake.points[0]!.x) / (lake.worldPoints[index]!.x - p.x);
    const project = (q: Point) => ({
      x: scene.canvas.x + lake.points[0]!.x + (q.x - p.x) * scale,
      y: scene.canvas.y + lake.points[0]!.y + (q.y - p.y) * scale,
    });
    const corners = [worldAt(0.22, -12), worldAt(0.22, 12), worldAt(0.62, -12), worldAt(0.62, 12)];
    const worldRect = {
      x: Math.min(...corners.map((p) => p.x)),
      y: Math.min(...corners.map((p) => p.y)),
      width: Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)),
      height: Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y)),
    };
    const top = project(worldRect);
    const crop = {
      x: Math.floor(top.x),
      y: Math.floor(top.y),
      width: Math.ceil(worldRect.width * scale),
      height: Math.ceil(worldRect.height * scale),
    };
    const actors = [
      ...scene.d.actorDepth.bodies.flatMap((v) => (v.visible && v.rect ? [v.rect] : [])),
      ...scene.d.armyPlateLayout.plates.map((v) => v.rect),
      ...scene.d.armyRendering.signals.flatMap((v) => (v.visible && v.rect ? [v.rect] : [])),
      ...scene.d.geographicLabelLayout.labels.map((v) => v.rect),
      ...scene.d.castleRendering.nodes.flatMap((n) =>
        [n.body, n.durability, n.warning].filter((r): r is Rect => r !== null),
      ),
    ].map((r) => ({ ...r, x: r.x + scene.canvas.x, y: r.y + scene.canvas.y }));
    const roads = scene.roads.map((r) => {
      const authored = DEBUG_VISUAL_ROAD_DISPLAY[r.id];
      const flat = authored?.waypoints ?? [];
      const points = [
        r.a,
        ...Array.from({ length: flat.length / 2 }, (_, i) => ({
          x: flat[i * 2]!,
          y: flat[i * 2 + 1]!,
        })),
        r.b,
      ];
      const bridges = authored?.bridges ?? [];
      return {
        id: r.id,
        clearance: Math.min(
          ...points.slice(1).map((b, i) => rectDistance(points[i]!, b, worldRect)),
        ),
        bridgeClearance: Math.min(
          ...Array.from({ length: bridges.length / 2 }, (_, i) =>
            rectDistance(
              { x: bridges[i * 2]!, y: bridges[i * 2 + 1]! },
              { x: bridges[i * 2]!, y: bridges[i * 2 + 1]! },
              worldRect,
            ),
          ),
        ),
      };
    });
    const coasts = scene.d.coastRendering.displayPolygons.flatMap((poly) =>
      Array.from({ length: poly.points.length / 2 }, (_, i) =>
        rectDistance(
          { x: poly.points[i * 2]!, y: poly.points[i * 2 + 1]! },
          {
            x: poly.points[(i * 2 + 2) % poly.points.length]!,
            y: poly.points[(i * 2 + 3) % poly.points.length]!,
          },
          worldRect,
        ),
      ),
    );
    const image = await page.screenshot({
      path: info.outputPath(`${control.name.toLowerCase()}-full-bank-scene.png`),
    });
    const png = PNG.sync.read(image);
    const material = scene.d.riverRendering.materials.rivers.find((r) => r.id === control.id)!;
    const sourceSegment = Array.from({ length: raw.points.length / 2 - 1 }, (_, i) => i).find(
      (i) =>
        raw.points[i * 2] === a.x &&
        raw.points[i * 2 + 1] === a.y &&
        raw.points[i * 2 + 2] === b.x &&
        raw.points[i * 2 + 3] === b.y,
    );
    const rows = Array.from({ length: 33 }, (_, i) => {
      const t = 0.22 + (i * 0.4) / 32;
      const samples = Array.from({ length: 161 }, (_, j) => {
        const side = -12 + j * 0.15,
          world = worldAt(t, side),
          screen = project(world),
          x = Math.round(screen.x),
          y = Math.round(screen.y);
        const offset = (y * png.width + x) * 4;
        const rgb = [...png.data.subarray(offset, offset + 3)];
        return { side, world, pixel: { x, y }, rgb, water: isFixedBankWaterPixel(rgb) };
      });
      const centers: number[] = [];
      for (const segment of material.displaySegments.filter(
        (s) => s.sourceSegment === sourceSegment,
      )) {
        const start = ((segment.a.x - a.x) * dx + (segment.a.y - a.y) * dy) / (length * length);
        const end = ((segment.b.x - a.x) * dx + (segment.b.y - a.y) * dy) / (length * length);
        if (
          Math.abs(end - start) < 1e-12 ||
          t < Math.min(start, end) - 1e-9 ||
          t > Math.max(start, end) + 1e-9
        )
          continue;
        const u = (t - start) / (end - start);
        const side =
          (segment.a.x + u * (segment.b.x - segment.a.x) - a.x - dx * t) * normal.x +
          (segment.a.y + u * (segment.b.y - segment.a.y) - a.y - dy * t) * normal.y;
        if (!centers.some((value) => Math.abs(value - side) < 1e-8)) centers.push(side);
      }
      let run: ReturnType<typeof associatedWaterRun> | null = null;
      let associationFailure: string | null = null;
      try {
        if (centers.length !== 1)
          throw new Error(`Ambiguous emitted station: ${centers.length} intersections`);
        run = associatedWaterRun(samples, centers[0]!);
      } catch (error) {
        associationFailure = String(error);
      }
      const water = samples.filter((s) => s.water);
      const legacyWater = samples.filter((s) => s.rgb.length === 3 && s.rgb[2]! > s.rgb[0]!);
      return {
        t,
        samples,
        centers,
        run,
        associationFailure,
        disconnectedSamples: run?.disconnected.map((i) => samples[i]) ?? [],
        legacyLeft: legacyWater[0]?.side ?? null,
        legacyRight: legacyWater.at(-1)?.side ?? null,
        currentUnassociatedLeft: water[0]?.side ?? null,
        currentUnassociatedRight: water.at(-1)?.side ?? null,
        left: run?.left ?? null,
        right: run?.right ?? null,
      };
    });
    // These are the actual emitted strokes, not the producer's material bounding box.
    // Independently intersect both complete capsule banks with each fixed cross-section.
    const bankGeometry = rows.map((row) => {
      const sides = Array.from({ length: 961 }, (_, i) => -12 + i * 0.025).filter((side) =>
        material.displaySegments.some(
          (segment) =>
            pointDistance(worldAt(row.t, side), segment.a, segment.b) <= segment.width / 2,
        ),
      );
      return { t: row.t, left: sides[0] ?? null, right: sides.at(-1) ?? null };
    });
    const observation = {
      classifier: {
        scope: 'fixedKiso/Shinano',
        RGB8cue: 'B>=G && B-R>=16',
        sourceDark: [88, 120, 128],
        sourceShallow: [115, 148, 151],
        universal: false,
        legacyCue: 'B>R',
        qualification:
          'Source contrast is not screenshot contrast; blue-gray rocks may pass. All raw RGB and disconnected hits are retained.',
      },
      control,
      worldRect,
      crop,
      scale,
      rows,
      scene,
      material,
      bankGeometry,
      hudIntersections: scene.hud.filter((r) => intersects(crop, r)),
      actorIntersections: actors.filter((r) => intersects(crop, r)),
      roads,
      coastClearance: Math.min(...coasts),
      qualification:
        'Scoped cyan-material bank trace requires whole-ROI exclusion; screenshot banks are AA estimates, not opaque asset proof or universal water classification',
    };
    await info.attach(`${control.name.toLowerCase()}-full-bank-observation`, {
      body: JSON.stringify(observation),
      contentType: 'application/json',
    });
    expect(crop.x).toBeGreaterThanOrEqual(scene.canvas.x);
    expect(crop.y).toBeGreaterThanOrEqual(scene.canvas.y);
    expect(crop.x + crop.width).toBeLessThanOrEqual(scene.canvas.x + scene.canvas.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(scene.canvas.y + scene.canvas.height);
    await page.screenshot({
      path: info.outputPath(`${control.name.toLowerCase()}-full-bank-crop.png`),
      clip: crop,
    });
    expect(observation.hudIntersections).toEqual([]);
    expect(observation.actorIntersections).toEqual([]);
    expect(Math.min(...roads.map((r) => r.clearance))).toBeGreaterThan(12);
    expect(Math.min(...roads.map((r) => r.bridgeClearance))).toBeGreaterThan(36);
    expect(observation.coastClearance).toBeGreaterThan(16);
    expect(rows.map((r) => r.associationFailure)).toEqual(rows.map(() => null));
    expect(rows.every((r) => r.left !== null && r.right !== null && r.left < r.right)).toBe(true);
    for (let i = 0; i < rows.length; i++) {
      const pixel = rows[i]!,
        geometry = bankGeometry[i]!;
      expect(geometry.left).not.toBeNull();
      expect(geometry.right).not.toBeNull();
      // One-pixel AA plus rounded pixel-center error, and the independent scan steps.
      const tolerance = 1.75 / scale + 0.175;
      expect(Math.abs(pixel.left! - geometry.left!)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(pixel.right! - geometry.right!)).toBeLessThanOrEqual(tolerance);
      expect(geometry.left!).toBeGreaterThan(-12);
      expect(geometry.right!).toBeLessThan(12);
    }
    if (control.id === 'rv.shinano' || process.env.RIVER_REQUIRE_BANK_DEPARTURE === '1') {
      const range = (values: number[]) => Math.max(...values) - Math.min(...values);
      // A resolvable change beyond two screen pixels is necessary, not art acceptance.
      // The same independent pixel requirement precedes the emitted geometry check.
      const pixelRanges = [range(rows.map((r) => r.left!)), range(rows.map((r) => r.right!))];
      const geometryRanges = [
        range(bankGeometry.map((r) => r.left!)),
        range(bankGeometry.map((r) => r.right!)),
      ];
      // Shinano requires BOTH banks; Kiso retains its original opt-in maximum.
      expect(
        (control.id === 'rv.shinano' ? Math.min(...pixelRanges) : Math.max(...pixelRanges)) * scale,
      ).toBeGreaterThan(2);
      expect(
        (control.id === 'rv.shinano' ? Math.min(...geometryRanges) : Math.max(...geometryRanges)) *
          scale,
      ).toBeGreaterThan(2);
    }
    expect(material.points).toEqual(
      Array.from({ length: raw.points.length / 2 }, (_, i) => ({
        x: raw.points[i * 2]!,
        y: raw.points[i * 2 + 1]!,
      })),
    );
    expect(material.displaySegments[0]!.a).toEqual(material.points[0]);
    expect(material.displaySegments.at(-1)!.b).toEqual(material.points.at(-1));
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    expect(
      await page.evaluate(() => window.__tenka.debug.getMapDiagnostics().riverRendering.materials),
    ).toEqual(scene.d.riverRendering.materials);
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('overview'));
    await settle();
    await focus();
    const restored = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
    expect(restored.waterRendering.lakes[0]!.points).toEqual(lake.points);
    expect(restored.riverRendering.materials).toEqual(scene.d.riverRendering.materials);
    if (control.id === 'rv.shinano') {
      // Raw authored contacts remain actual emitted endpoints, not only metadata.
      for (const point of material.points)
        expect(
          material.displaySegments.some(
            (segment) =>
              (segment.a.x === point.x && segment.a.y === point.y) ||
              (segment.b.x === point.x && segment.b.y === point.y),
          ),
        ).toBe(true);
      const resources = restored.resources;
      // Evidence only: compare browser JSON with structured transport and fresh
      // diagnostics in the same task. Do not normalize or replace asserted bounds.
      const captureMaterialTransport = () =>
        page.evaluate(() => {
          const firstDiagnostics = window.__tenka.debug.getMapDiagnostics();
          const first = firstDiagnostics.riverRendering.materials;
          const firstJSON = JSON.stringify(first);
          const secondDiagnostics = window.__tenka.debug.getMapDiagnostics();
          const second = secondDiagnostics.riverRendering.materials;
          const secondJSON = JSON.stringify(second);
          return {
            first,
            firstJSON,
            second,
            secondJSON,
            browserEqual: firstJSON === secondJSON,
            firstStillEqualAfterFreshRead: JSON.stringify(first) === firstJSON,
            firstResources: firstDiagnostics.resources,
            secondResources: secondDiagnostics.resources,
            originalPointBounds: first.rivers.map((river) => {
              // Independent literal original width contract 2/4/7 world units;
              // riverSurfacePixels pads its raw-point bbox by half that width.
              const halfWidth = ({ 1: 2, 2: 4, 3: 7 } as const)[river.widthClass] / 2;
              const xs = river.points.map((point) => point.x);
              const ys = river.points.map((point) => point.y);
              return {
                id: river.id,
                widthClass: river.widthClass,
                points: river.points,
                reportedBounds: river.bounds,
                expectedBounds: {
                  x: Math.min(...xs) - halfWidth,
                  y: Math.min(...ys) - halfWidth,
                  width: Math.max(...xs) - Math.min(...xs) + 2 * halfWidth,
                  height: Math.max(...ys) - Math.min(...ys) + 2 * halfWidth,
                },
              };
            }),
          };
        });
      const beforeRemountTransport = await captureMaterialTransport();
      await info.attach('shinano-before-remount-material-transport', {
        body: JSON.stringify({
          initialMaterials: scene.d.riverRendering.materials,
          beforeRemountTransport,
        }),
        contentType: 'application/json',
      });
      await page.evaluate(() => window.__tenka.debug.remountMap());
      await focus();
      const remounted = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
      const afterRemountTransport = await captureMaterialTransport();
      await info.attach('shinano-after-remount-material-transport', {
        body: JSON.stringify({
          assertedMaterials: remounted.riverRendering.materials,
          afterRemountTransport,
        }),
        contentType: 'application/json',
      });
      expect(remounted.waterRendering.lakes[0]!.points).toEqual(lake.points);
      expect(remounted.riverRendering.materials).toEqual(scene.d.riverRendering.materials);
      expect(remounted.resources).toEqual(resources);
    }
    expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(
      stateBefore,
    );
    expect(errors).toEqual([]);
  });
}
