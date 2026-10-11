import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { test, expect } from './fixtures';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type House = {
  castleId: string;
  approachId: string;
  center: Point;
  footprint: Point[];
  shadow: Point[];
  walls: Point[][];
  roofs: Point[][];
};
type Town = {
  houses: number;
  ownedGraphics: number;
  ownedTextures: number;
  stage: string;
  geometry: { houses: House[]; attempted: number; rejected: number; limited: boolean };
  constraints?: {
    obstacles: { id?: string; a: Point; b: Point; radius: number }[];
    crests: { id: string; mass: Point[]; ridges: Point[][] }[];
  };
};
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (p: Point, a: Point, b: Point) =>
  Math.abs(cross(a, b, p)) < 1e-8 &&
  p.x >= Math.min(a.x, b.x) &&
  p.x <= Math.max(a.x, b.x) &&
  p.y >= Math.min(a.y, b.y) &&
  p.y <= Math.max(a.y, b.y);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
function inside(p: Point, ring: readonly Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y))
      result = !result;
  }
  return result;
}
function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const edges = (ring: readonly Point[]) =>
  ring.map((a, i) => [a, ring[(i + 1) % ring.length]!] as const);
function touches(a: readonly Point[], b: readonly Point[]) {
  return (
    a.some((p) => inside(p, b)) ||
    b.some((p) => inside(p, a)) ||
    edges(a).some(([p, q]) => edges(b).some(([r, s]) => intersects(p, q, r, s)))
  );
}
function touchesCapsule(ring: readonly Point[], a: Point, b: Point, radius: number) {
  return (
    inside(a, ring) ||
    inside(b, ring) ||
    edges(ring).some(
      ([p, q]) =>
        intersects(p, q, a, b) ||
        Math.min(distance(p, a, b), distance(q, a, b), distance(a, p, q), distance(b, p, q)) <=
          radius,
    )
  );
}
function bounds(points: readonly Point[]): Rect {
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function settle(page: Page) {
  let previous = '',
    stable = 0;
  await expect
    .poll(async () => {
      const value = await page.evaluate(() =>
        JSON.stringify(
          window.__tenka.debug.getMapDiagnostics().waterRendering.lakes.map((lake) => lake.points),
        ),
      );
      stable = value === previous ? stable + 1 : 0;
      previous = value;
      return stable;
    })
    .toBeGreaterThanOrEqual(3);
}

test('original town roofs, walls and shadows occupy safe ground without changing actors or gameplay', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const initial = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const captures = [];
  for (const castleId of ['castle.sunpu', 'castle.kiyosu']) {
    const pos = await page.evaluate(
      (id) =>
        Object.values(window.__tenka.debug.getState().castles).find((castle) => castle.id === id)!
          .pos,
      castleId,
    );
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
    const mini = page.getByTestId('minimap-frame'),
      box = (await mini.boundingBox())!;
    await mini.click({
      position: { x: (pos.x / 4096) * box.width, y: (pos.y / 4096) * box.height },
    });
    await settle(page);
    for (const stage of ['near', 'mid'] as const) {
      if (stage === 'mid') {
        await page.mouse.move(560, 320);
        for (let i = 0; i < 8; i++) {
          if (
            (await page.evaluate(() => window.__tenka.debug.getMapDiagnostics().lodStage)) === 'mid'
          )
            break;
          await page.mouse.wheel(0, 100);
          await settle(page);
        }
      }
      const raw = await page.evaluate(() => {
        const d = window.__tenka.debug.getMapDiagnostics();
        const rect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
        const canvas = document.querySelector('[data-testid="map-canvas-host"] canvas')!;
        const hud = [
          ...document.querySelectorAll(
            '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *, [data-testid="siege-overlay"], [data-testid="screen-strategy"] > div[aria-hidden="false"]',
          ),
        ]
          .map((node) => rect(node.getBoundingClientRect()))
          .filter((r) => r.width > 0 && r.height > 0);
        return { d, canvas: rect(canvas.getBoundingClientRect()), hud };
      });
      const town = (raw.d as typeof raw.d & { settlementRendering?: Town }).settlementRendering;
      const screenshot = await page.screenshot({
        path: info.outputPath(`town-${castleId}-${stage}.png`),
      });
      const image = PNG.sync.read(screenshot);
      const lake = raw.d.waterRendering.lakes[0]!;
      const other = lake.worldPoints.findIndex((p) => p.x !== lake.worldPoints[0]!.x);
      const scale =
        (lake.points[other]!.x - lake.points[0]!.x) /
        (lake.worldPoints[other]!.x - lake.worldPoints[0]!.x);
      const project = (p: Point) => ({
        x: raw.canvas.x + lake.points[0]!.x + (p.x - lake.worldPoints[0]!.x) * scale,
        y: raw.canvas.y + lake.points[0]!.y + (p.y - lake.worldPoints[0]!.y) * scale,
      });
      const actors = [
        ...raw.d.actorDepth.bodies.flatMap((body) =>
          body.visible && body.rect ? [body.rect] : [],
        ),
        ...raw.d.armyRendering.signals.flatMap((signal) =>
          signal.visible && signal.rect ? [signal.rect] : [],
        ),
        ...raw.d.armyPlateLayout.plates.map((plate) => plate.rect),
        ...raw.d.armyPlateLayout.castles.map((castle) => castle.rect),
        ...raw.d.geographicLabelLayout.labels.map((label) => label.rect),
        ...raw.d.castleRendering.nodes.flatMap((node) =>
          [node.durability, node.warning].filter((rect): rect is Rect => rect !== null),
        ),
      ];
      const pixelSamples = (town?.geometry.houses ?? [])
        .filter((h) => h.castleId === castleId)
        .map((house) => {
          const sample = (polygon: readonly Point[], later: readonly (readonly Point[])[]) => {
            const screen = bounds(polygon.map(project));
            const rejected = { outside: 0, facet: 0, later: 0, overlay: 0 };
            const candidates: { pixel: Point; pixelWorld: Point; margin: number }[] = [];
            for (let y = Math.floor(screen.y); y < Math.ceil(screen.y + screen.height); y++) {
              for (let x = Math.floor(screen.x); x < Math.ceil(screen.x + screen.width); x++) {
                const cell = { x, y, width: 1, height: 1 };
                if (
                  x < raw.canvas.x ||
                  y < raw.canvas.y ||
                  x + 1 > raw.canvas.x + raw.canvas.width ||
                  y + 1 > raw.canvas.y + raw.canvas.height ||
                  x < 0 ||
                  y < 0 ||
                  x >= image.width ||
                  y >= image.height
                ) {
                  rejected.outside++;
                  continue;
                }
                const pixelWorld = {
                  x: lake.worldPoints[0]!.x + (x + 0.5 - raw.canvas.x - lake.points[0]!.x) / scale,
                  y: lake.worldPoints[0]!.y + (y + 0.5 - raw.canvas.y - lake.points[0]!.y) / scale,
                };
                if (!inside(pixelWorld, polygon)) {
                  rejected.facet++;
                  continue;
                }
                const pixelWorldCell = [
                  { x: pixelWorld.x - 0.5 / scale, y: pixelWorld.y - 0.5 / scale },
                  { x: pixelWorld.x + 0.5 / scale, y: pixelWorld.y - 0.5 / scale },
                  { x: pixelWorld.x + 0.5 / scale, y: pixelWorld.y + 0.5 / scale },
                  { x: pixelWorld.x - 0.5 / scale, y: pixelWorld.y + 0.5 / scale },
                ];
                if (later.some((facet) => touches(pixelWorldCell, facet))) {
                  rejected.later++;
                  continue;
                }
                if (
                  raw.hud.some((rect) => overlap(cell, rect) > 0) ||
                  actors.some(
                    (rect) =>
                      overlap(cell, {
                        ...rect,
                        x: rect.x + raw.canvas.x,
                        y: rect.y + raw.canvas.y,
                      }) > 0,
                  )
                ) {
                  rejected.overlay++;
                  continue;
                }
                candidates.push({
                  pixel: { x, y },
                  pixelWorld,
                  margin: Math.min(...edges(polygon).map(([a, b]) => distance(pixelWorld, a, b))),
                });
              }
            }
            // Geometric interior margin then y/x decides the pixel BEFORE any
            // RGB is inspected. Thin visible facets need not contain a centroid.
            candidates.sort(
              (a, b) => b.margin - a.margin || a.pixel.y - b.pixel.y || a.pixel.x - b.pixel.x,
            );
            const chosen = candidates[0];
            if (!chosen) return { polygon, rejected, candidates, sample: null };
            const at = (chosen.pixel.y * image.width + chosen.pixel.x) * 4;
            const rgb = Array.from(image.data.subarray(at, at + 3));
            return {
              polygon,
              rejected,
              candidates,
              sample: { ...chosen, rgb, mean: rgb.reduce((sum, value) => sum + value, 0) / 3 },
            };
          };
          const roofs = house.roofs.map((polygon, index) =>
            sample(polygon, house.roofs.slice(index + 1)),
          );
          const walls = house.walls.map((polygon, index) =>
            sample(polygon, [...house.walls.slice(index + 1), ...house.roofs]),
          );
          return {
            house,
            roofs,
            walls,
            shadow: sample(house.shadow, [...house.walls, ...house.roofs]),
          };
        });
      const observation = { castleId, requestedStage: stage, raw, town, scale, pixelSamples };
      captures.push(observation);
      await info.attach(`town-${castleId}-${stage}`, {
        body: JSON.stringify(observation),
        contentType: 'application/json',
      });
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(5));
      expect(
        (
          (await page.evaluate(() => window.__tenka.debug.getMapDiagnostics())) as typeof raw.d & {
            settlementRendering?: Town;
          }
        ).settlementRendering,
      ).toEqual(town);
      expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(
        initial,
      );
    }
  }
  // All reference views are retained before structural/material acceptance.
  // Missing old diagnostics is a structural RED, not proof of old pixel quality.
  for (const view of captures) {
    expect(view.town).toBeDefined();
    const town = view.town!;
    expect(view.raw.d.lodStage).toBe(view.requestedStage);
    expect(town.ownedGraphics).toBe(2);
    expect(town.ownedTextures).toBe(0);
    expect(town.houses).toBe(town.geometry.houses.length);
    expect(town.houses, 'Fixed fixture retains all six crest-safe houses across both LODs').toBe(6);
    expect(
      Object.fromEntries(
        ['castle.gifu', 'castle.kiyosu', 'castle.sunpu'].map((id) => [
          id,
          town.geometry.houses.filter((house) => house.castleId === id).length,
        ]),
      ),
    ).toEqual({ 'castle.gifu': 3, 'castle.kiyosu': 2, 'castle.sunpu': 1 });
    expect(town.houses).toBeGreaterThan(0);
    expect(town.houses).toBeLessThanOrEqual(1024);
    const land = view.raw.d.coastRendering.displayPolygons.map((polygon) =>
      Array.from({ length: polygon.points.length / 2 }, (_, i) => ({
        x: polygon.points[2 * i]!,
        y: polygon.points[2 * i + 1]!,
      })),
    );
    const lakes = view.raw.d.waterRendering.lakes.map((lake) => lake.worldPoints);
    expect(
      town.constraints?.obstacles,
      'Actual admitted road/bridge/node paint capsules',
    ).toBeDefined();
    expect(town.constraints?.crests, 'Actual mountain masses and ridge polylines').toBeDefined();
    expect(town.constraints?.crests.length).toBeGreaterThan(0);
    const unsafe: { castleId: string; approachId: string; reason: string }[] = [];
    for (const house of town.geometry.houses) {
      const footprint = house.footprint;
      const reject = (reason: string) =>
        unsafe.push({ castleId: house.castleId, approachId: house.approachId, reason });
      if (!land.some((ring) => footprint.every((p) => inside(p, ring)))) reject('outside land');
      for (const ring of land)
        if (edges(footprint).some(([a, b]) => edges(ring).some(([c, d]) => intersects(a, b, c, d))))
          reject('crosses coastline');
      for (const lake of lakes) if (touches(footprint, lake)) reject('touches lake');
      for (const crest of town.constraints?.crests ?? []) {
        // Conservative full-foot policy: mass overlap AND any r18 ridge-capsule
        // overlap reject, even when these occur at different footprint points.
        // This deliberately is NOT a narrowed triple-intersection predicate.
        if (
          touches(footprint, crest.mass) &&
          crest.ridges.some((ridge) =>
            ridge.some((point, i) =>
              touchesCapsule(footprint, point, ridge[Math.min(i + 1, ridge.length - 1)]!, 18),
            ),
          )
        )
          reject(`touches crest ${crest.id}`);
      }
      const frame = bounds(footprint);
      for (const p of [...house.shadow, ...house.walls.flat(), ...house.roofs.flat()]) {
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < frame.x ||
          p.x > frame.x + frame.width ||
          p.y < frame.y ||
          p.y > frame.y + frame.height
        )
          reject('facet outside full painted footprint');
      }
      for (const capsule of town.constraints?.obstacles ?? []) {
        if (inside(capsule.a, footprint) || inside(capsule.b, footprint))
          reject(`contains ${capsule.id ?? 'capsule'}`);
        for (const [a, b] of edges(footprint)) {
          if (
            intersects(a, b, capsule.a, capsule.b) ||
            Math.min(
              distance(a, capsule.a, capsule.b),
              distance(b, capsule.a, capsule.b),
              distance(capsule.a, a, b),
              distance(capsule.b, a, b),
            ) <= capsule.radius
          )
            reject(`touches ${capsule.id ?? 'capsule'}`);
        }
      }
    }
    expect(unsafe, 'Independent full-facet continuous land/water/road/bridge clearance').toEqual(
      [],
    );
    expect(view.pixelSamples.length, 'Positive actual town houses per fixed view').toBeGreaterThan(
      0,
    );
    // This proves partial material channels per VIEW. Roof and wall pixels may
    // belong to separate recorded houses; it is not full-model visibility or art approval.
    const eligible = view.pixelSamples.filter((samples) =>
      samples.roofs.every((roof) => roof.sample !== null),
    );
    expect(
      eligible.length,
      'At least one house has both roof facets with unobscured interior pixels',
    ).toBeGreaterThan(0);
    for (const samples of eligible) {
      expect(samples.roofs).toHaveLength(2);
      const roofs = samples.roofs.flatMap((roof) => (roof.sample ? [roof.sample] : []));
      expect(roofs).toHaveLength(2);
      expect(
        Math.abs(roofs[0]!.mean - roofs[1]!.mean),
        'Actual lit/shaded roof facets, not only draw metadata',
      ).toBeGreaterThan(8);
    }
    const visibleRoofs = view.pixelSamples.flatMap((samples) =>
      samples.roofs.flatMap((roof) => (roof.sample ? [roof.sample] : [])),
    );
    const visibleWalls = view.pixelSamples.flatMap((samples) =>
      samples.walls.flatMap((wall) => (wall.sample ? [wall.sample] : [])),
    );
    expect(
      visibleWalls.length,
      'At least one individually unobscured wall pixel per view',
    ).toBeGreaterThan(0);
    for (const wall of visibleWalls)
      expect(
        visibleRoofs.some((roof) => Math.abs(roof.mean - wall.mean) > 8),
        'Actual visible wall differs from an actual visible roof',
      ).toBe(true);
  }
  const beforePick = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const node = await page.evaluate(() =>
    window.__tenka.debug
      .getMapDiagnostics()
      .castleRendering.nodes.find((entry) => entry.id === 'castle.kiyosu')!,
  );
  const canvas = (await page.locator('[data-testid="map-canvas-host"] canvas').boundingBox())!;
  await page.mouse.click(canvas.x + node.anchor.x, canvas.y + node.anchor.y);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          window.__tenka.debug
            .getMapDiagnostics()
            .castleRendering.nodes.find((entry) => entry.id === 'castle.kiyosu')?.selection,
        ),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(
    beforePick,
  );
});
