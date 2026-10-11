import { expect, it } from 'vitest';
import { DOMAdapter } from 'pixi.js';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import { buildMapGraph } from '@core/state/mapGraph';
import outline from '@data/map/japan-outline.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '@ui/map/terrain/riverDisplayConstraints';
import { createTerrainProtectedCells } from '@ui/map/terrain/terrainProtectedCells';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { buildTerrainElevatedSurfaceBuffers } from '@ui/map/terrain/terrainElevatedSurface';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const field = (height: number, gradient: number) => ({
  sample: ({ x }: { x: number; y: number }) => Math.max(0, height + gradient * (x - 128)),
  project(p: { x: number; y: number }) {
    const h = this.sample(p);
    return { x: p.x - 0.18 * h, y: p.y - h };
  },
  bounds: { maximumQueryEdgeVisits: 0, maximumHeight: 64, cells: 8, worldSize: 256 },
});

it('keeps moderate low shoulders wooded, reserving exposure for high steep shaded crests', () => {
  const atCenter = (height: number, slope: number) => {
    const b = buildTerrainElevatedSurfaceBuffers(field(height, slope));
    return b.vertices[((3 * 8 + 3) * 4 + 2) * 6 + 5]!;
  };
  expect(atCenter(20, -0.18)).toBeGreaterThan(0.3);
  expect(atCenter(20, -0.4)).toBeGreaterThan(0.3);
  expect(atCenter(56, -0.4)).toBeLessThan(-0.1);
  expect(atCenter(56, 0.4)).toBeGreaterThan(atCenter(56, -0.4));
  // Crest woodland thins, but a flat summit has zero rock exposure.
  expect(atCenter(56, 0)).toBe(
    Math.fround(0.78 * 0.35 * (0.9 + 0.1 * Math.sin((128 + 0.6 * 128) / 64))),
  );
});

it('matches independent relative-height/steepness/aspect math without changing UV, projection or NW light', () => {
  const f = field(40, -0.3),
    b = buildTerrainElevatedSurfaceBuffers(f);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const points = [
        [col * 32, row * 32],
        [(col + 1) * 32, row * 32],
        [(col + 1) * 32, (row + 1) * 32],
        [col * 32, (row + 1) * 32],
      ];
      for (let corner = 0; corner < 4; corner++) {
        const [x, y] = points[corner]!;
        const p = { x: x!, y: y! },
          scene = f.project(p),
          h = f.sample(p);
        const dx = (f.sample({ x: p.x + 1, y: p.y }) - f.sample({ x: p.x - 1, y: p.y })) / 2;
        const rise = smooth(0, 6, h),
          relative = h / 64;
        const crest = smooth(0.55, 0.85, relative);
        const steep = smooth(0.2, 0.38, Math.abs(dx));
        const aspect = smooth(-0.15, 0.25, (-0.45 * dx) / Math.hypot(0.45, 0.55));
        const rock = crest * steep * aspect;
        const wood = rise * (1 - 0.65 * crest) * (0.9 + 0.1 * Math.sin((p.x + 0.6 * p.y) / 64));
        const i = ((row * 8 + col) * 4 + corner) * 6;
        expect(b.vertices[i]).toBe(Math.fround(scene.x));
        expect(b.vertices[i + 1]).toBe(Math.fround(scene.y));
        expect(b.vertices[i + 2]).toBe(p.x / 256);
        expect(b.vertices[i + 3]).toBe(p.y / 256);
        expect(b.vertices[i + 4]).toBe(
          Math.fround(
            1 +
              (0.45 * dx + 0.7) / Math.hypot(dx, 1) / Math.hypot(0.45, 0.55, 0.7) -
              0.7 / Math.hypot(0.45, 0.55, 0.7),
          ),
        );
        expect(b.vertices[i + 5]).toBe(Math.fround(0.78 * wood * (1 - rock) - 0.7 * rock));
      }
    }
});

it('actual national 64-field retains mixed soil/wood/rock instead of rock-dominating moderate shoulders', () => {
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  });
  const terrain = buildTerrainPack();
  const graph = buildMapGraph(
    Object.fromEntries(castles.map((c) => [c.id, c])) as unknown as Parameters<
      typeof buildMapGraph
    >[0],
    Object.fromEntries(districts.map((d) => [d.id, d])) as unknown as Parameters<
      typeof buildMapGraph
    >[1],
    Object.fromEntries(roads.edges.map((e) => [e.id, e])) as Parameters<typeof buildMapGraph>[2],
    Object.fromEntries(roads.edges.map((e) => [e.id, e])),
  );
  const coast = buildDisplayCoast(outline, graph, terrain.rivers);
  const land = coast.polygons.map((p) =>
    Array.from({ length: p.points.length / 2 }, (_, i) => ({
      x: p.points[2 * i]!,
      y: p.points[2 * i + 1]!,
    })),
  );
  const water = createWaterFeatures(
    terrain.rivers,
    terrain.lakes,
    collectRiverBridgeFootprints(graph),
    collectRiverDisplayConstraints(graph, coast),
  );
  try {
    const protection = createTerrainProtectedCells({
      worldSize: 4096,
      cells: 128,
      landPolygons: land,
      waterGeometry: {
        lakes: water.getLakeGeometry(),
        rivers: water.getRiverMaterialDiagnostics().rivers,
      },
    });
    const sampled = createSampledTerrainElevation(
      createTerrainTopography(terrain.mountains ?? [], land),
      { protectedCells: protection },
    );
    const b = buildTerrainElevatedSurfaceBuffers(sampled, {
      forests: terrain.forests?.map((f) => f.polygon) ?? [],
    });
    let rock = 0,
      wood = 0,
      soil = 0;
    for (let i = 5; i < b.vertices.length; i += 6) {
      const s = b.vertices[i]!;
      if (s < -0.1) rock++;
      else if (s > 0.3) wood++;
      else soil++;
    }
    console.log(
      'NATIONAL_CREST_SUBSTRATE',
      JSON.stringify({
        rock,
        wood,
        soil,
        vertices: b.vertices.length / 6,
        protected: protection.reduce((a, v) => a + v, 0),
        maximumHeight: sampled.bounds.maximumHeight,
      }),
    );
    expect(protection.reduce((a, v) => a + v, 0)).toBe(15124);
    expect(rock).toBeGreaterThan(0);
    expect(wood).toBeGreaterThan(rock);
    expect(soil).toBeGreaterThan(wood);
    expect(b.bytes).toBe(1966080);
  } finally {
    water.destroy();
    DOMAdapter.set(adapter);
  }
});
