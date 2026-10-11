import { describe, expect, it } from 'vitest';
import { DOMAdapter } from 'pixi.js';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { buildTerrainElevatedSurfaceBuffers } from '@ui/map/terrain/terrainElevatedSurface';
import { buildTerrainFoothillCanopyBuffers } from '@ui/map/terrain/terrainFoothillCanopy';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { createTerrainProtectedCells } from '@ui/map/terrain/terrainProtectedCells';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import { buildMapGraph } from '@core/state/mapGraph';
import { collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '@ui/map/terrain/riverDisplayConstraints';
import type { ElevationMountain, ElevationPoint } from '@ui/map/terrain/terrainElevation';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import outline from '@data/map/japan-outline.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';

const square = [
  { x: -1000, y: -1000 },
  { x: 1000, y: -1000 },
  { x: 1000, y: 1000 },
  { x: -1000, y: 1000 },
];
const mountain = (tier: 1 | 2 | 3): ElevationMountain => ({
  tier,
  mass: square,
  ridges: [
    [
      { x: 0, y: -500 },
      { x: 0, y: 500 },
    ],
  ],
});
const sharpReference = (peak: number, distance: number) => {
  const toe = 0.2 * peak,
    join = (peak - toe) / 0.4,
    radius = (peak + toe) / 0.4;
  return distance <= join
    ? peak - 0.4 * distance
    : distance < radius
      ? (0.16 / (4 * toe)) * (radius - distance) ** 2
      : 0;
};

describe('sharp authored crests with a C1 foothill toe (not a globally C1 field)', () => {
  it.each([
    [1, 20],
    [2, 40],
    [3, 64],
  ] as const)('retains tier %s peak and independently specified profile', (tier, peak) => {
    const field = createTerrainTopography([mountain(tier)]);
    const join = (0.8 * peak) / 0.4,
      radius = (1.2 * peak) / 0.4;
    for (const distance of [0, 1, 32, peak / 0.8, join, join + 1, radius - 1, radius, radius + 1]) {
      expect(field.sample({ x: distance, y: 0 })).toBeCloseTo(sharpReference(peak, distance), 11);
      expect(field.sample({ x: -distance, y: 0 })).toBeCloseTo(sharpReference(peak, distance), 11);
    }
    const eps = 1e-4;
    const left = (field.sample({ x: join, y: 0 }) - field.sample({ x: join - eps, y: 0 })) / eps;
    const right = (field.sample({ x: join + eps, y: 0 }) - field.sample({ x: join, y: 0 })) / eps;
    expect(left).toBeCloseTo(-0.4, 5);
    expect(right).toBeCloseTo(-0.4, 5);
    // The ridge center has a cusp: one-sided slopes are opposite, not zero.
    expect((field.sample({ x: eps, y: 0 }) - peak) / eps).toBeCloseTo(-0.4, 8);
    expect((peak - field.sample({ x: -eps, y: 0 })) / eps).toBeCloseTo(0.4, 8);
  });
  it('retains the global slope/inverse bounds across ridge and max-union cusps', () => {
    const field = createTerrainTopography([
      mountain(3),
      {
        ...mountain(2),
        ridges: [
          [
            { x: 60, y: -200 },
            { x: 60, y: 200 },
          ],
        ],
      },
    ]);
    for (let x = -230; x <= 250; x += 7)
      for (let y = -220; y <= 220; y += 19) {
        const p = { x, y },
          q = { x: x + 0.17, y: y - 0.11 };
        expect(Math.abs(field.sample(p) - field.sample(q))).toBeLessThanOrEqual(
          0.4 * Math.hypot(0.17, 0.11) + 1e-12,
        );
        const inverse = field.unprojectWithDiagnostics(field.project(p));
        expect(Math.hypot(inverse.point.x - x, inverse.point.y - y)).toBeLessThan(2e-9);
        expect(inverse.iterations).toBeLessThanOrEqual(64);
      }
  });
});

// Independent historical cubic reference for paired national census, not a
// production fallback and not a substitute for the current safety assertions.
function oldCubic(mountains: readonly ElevationMountain[], land: readonly ElevationPoint[][]) {
  const distance = (p: ElevationPoint, a: ElevationPoint, b: ElevationPoint) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const inside = (p: ElevationPoint, r: readonly ElevationPoint[]) => {
    let yes = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i]!,
        b = r[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        yes = !yes;
    }
    return yes;
  };
  return {
    bounds: { heightLipschitz: 0.4, maximumHeight: 64 },
    sample(p: ElevationPoint) {
      let h = 0;
      for (const m of mountains) {
        const peak = { 1: 20, 2: 40, 3: 64 }[m.tier];
        let d = Infinity;
        for (const r of m.ridges) {
          if (r.length === 1) d = Math.min(d, Math.hypot(p.x - r[0]!.x, p.y - r[0]!.y));
          for (let i = 1; i < r.length; i++) d = Math.min(d, distance(p, r[i - 1]!, r[i]!));
        }
        const t = Math.min(1, d / ((1.5 * peak) / 0.4));
        h = Math.max(h, peak * (1 - 3 * t * t + 2 * t * t * t));
      }
      let safe = 0;
      for (const r of land)
        if (inside(p, r)) {
          let d = Infinity;
          for (let i = 0; i < r.length; i++)
            d = Math.min(d, distance(p, r[i]!, r[(i + 1) % r.length]!));
          safe = Math.max(safe, 0.4 * d);
        }
      return Math.min(h, safe);
    },
  };
}

it('keeps actual national protection, exact shared Float32 faces, inverse and borrowed inputs while changing surviving crests', () => {
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: () =>
      ({ getContext: () => null }) as unknown as ReturnType<typeof adapter.createCanvas>,
  });
  let water: ReturnType<typeof createWaterFeatures> | null = null;
  try {
    const terrain = buildTerrainPack(),
      mountains = terrain.mountains ?? [];
    const graph = buildMapGraph(
      Object.fromEntries(castles.map((c) => [c.id, { id: c.id as CastleId, pos: c.pos }])),
      Object.fromEntries(
        districts.map((d) => [
          d.id,
          {
            id: d.id as DistrictId,
            pos: d.pos,
            isPort: d.isPort ?? false,
            castleId: d.castleId as CastleId,
          },
        ]),
      ),
      Object.fromEntries(
        roads.edges.map((e) => [
          e.id,
          {
            ...e,
            id: e.id as RoadEdgeId,
            a: e.a as MapNodeId,
            b: e.b as MapNodeId,
            type: e.type as 'land' | 'sea',
            grade: e.grade as 1 | 2 | 3,
          },
        ]),
      ),
      Object.fromEntries(roads.edges.map((e) => [e.id, e])),
    );
    const coast = buildDisplayCoast(outline, graph, terrain.rivers);
    const land = coast.polygons.map((r) =>
      Array.from({ length: r.points.length / 2 }, (_, i) => ({
        x: r.points[2 * i]!,
        y: r.points[2 * i + 1]!,
      })),
    );
    water = createWaterFeatures(
      terrain.rivers,
      terrain.lakes,
      collectRiverBridgeFootprints(graph),
      collectRiverDisplayConstraints(graph, coast),
    );
    const protection = createTerrainProtectedCells({
      worldSize: 4096,
      cells: 128,
      landPolygons: land,
      waterGeometry: {
        lakes: water.getLakeGeometry(),
        rivers: water.getRiverMaterialDiagnostics().rivers,
      },
    });
    const before = JSON.stringify({ mountains, land, protection: [...protection] });
    const field = createSampledTerrainElevation(createTerrainTopography(mountains, land), {
      protectedCells: protection,
    });
    const old = createSampledTerrainElevation(oldCubic(mountains, land), {
      protectedCells: protection,
    });
    const surface = buildTerrainElevatedSurfaceBuffers(field, {
      forests: terrain.forests?.map((f) => f.polygon) ?? [],
    });
    const canopy = buildTerrainFoothillCanopyBuffers(field),
      oldCanopy = buildTerrainFoothillCanopyBuffers(old);
    let protectedVertices = 0;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++)
        if (protection[y * 128 + x]) {
          for (const i of [
            y * 129 + x,
            y * 129 + x + 1,
            (y + 1) * 129 + x,
            (y + 1) * 129 + x + 1,
          ]) {
            expect(field.vertexHeights[i]).toBe(0);
            protectedVertices++;
          }
          expect(field.sample({ x: x * 32 + 16, y: y * 32 + 16 })).toBe(0);
        }
    let minimumArea = Infinity;
    for (let i = 0; i < surface.indices.length; i += 3) {
      const a = surface.indices[i]! * 6,
        b = surface.indices[i + 1]! * 6,
        c = surface.indices[i + 2]! * 6;
      const area =
        (surface.vertices[b]! - surface.vertices[a]!) *
          (surface.vertices[c + 1]! - surface.vertices[a + 1]!) -
        (surface.vertices[b + 1]! - surface.vertices[a + 1]!) *
          (surface.vertices[c]! - surface.vertices[a]!);
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThan(0);
      minimumArea = Math.min(minimumArea, area);
    }
    for (let y = 0; y <= 128; y += 3)
      for (let x = 0; x <= 128; x += 3) {
        const p = { x: x * 32, y: y * 32 },
          inverse = field.unprojectWithDiagnostics(field.project(p));
        expect(Math.hypot(inverse.point.x - p.x, inverse.point.y - p.y)).toBeLessThan(2e-9);
        expect(inverse.iterations).toBeLessThanOrEqual(64);
      }
    const changed = field.vertexHeights.filter(
      (h, i) => Math.abs(h - old.vertexHeights[i]!) > 1e-6,
    ).length;
    const authoredRidgePoints = mountains.flatMap((m) => m.ridges.flat());
    let changedNearAuthoredCrests = 0;
    for (let y = 0; y <= 128; y++)
      for (let x = 0; x <= 128; x++) {
        const i = y * 129 + x;
        if (
          field.vertexHeights[i]! > 0 &&
          Math.abs(field.vertexHeights[i]! - old.vertexHeights[i]!) > 1e-6 &&
          authoredRidgePoints.some((p) => Math.hypot(p.x - x * 32, p.y - y * 32) <= 32)
        )
          changedNearAuthoredCrests++;
      }
    expect(changed).toBeGreaterThan(0);
    expect(changedNearAuthoredCrests).toBeGreaterThan(0);
    expect(field.bounds.displacementLipschitz).toBe(Math.SQRT2 * 0.4 * Math.hypot(0.18, 1));
    expect(Math.max(...field.vertexHeights)).toBeLessThanOrEqual(64);
    expect(surface.bytes).toBe(1966080);
    expect(canopy.bytes).toBe(792600);
    expect(JSON.stringify({ mountains, land, protection: [...protection] })).toBe(before);
    console.log(
      'sharp-crest-national',
      JSON.stringify({
        protectedCells: protection.reduce((s, v) => s + v, 0),
        protectedVertexChecks: protectedVertices,
        changedVertices: changed,
        changedNearAuthoredCrests,
        oldPositive: old.vertexHeights.filter((h) => h > 1e-6).length,
        newPositive: field.vertexHeights.filter((h) => h > 1e-6).length,
        maximumHeight: Math.max(...field.vertexHeights),
        minimumFloat32Area: minimumArea,
        oldCanopyPositive: oldCanopy.positiveVertices,
        newCanopyPositive: canopy.positiveVertices,
        oldCanopyCoverage: oldCanopy.maximumCoverage,
        newCanopyCoverage: canopy.maximumCoverage,
        oldCanopyCoverageSum: oldCanopy.vertices.reduce(
          (sum, value, i) => sum + (i % 6 === 4 ? value : 0),
          0,
        ),
        newCanopyCoverageSum: canopy.vertices.reduce(
          (sum, value, i) => sum + (i % 6 === 4 ? value : 0),
          0,
        ),
      }),
    );
  } finally {
    try {
      water?.destroy();
    } finally {
      DOMAdapter.set(adapter);
    }
  }
});
