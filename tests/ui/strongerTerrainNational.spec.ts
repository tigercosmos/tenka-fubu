import { expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import {
  createTerrainProtectedCells,
  type TerrainProtectedCellDiagnostics,
} from '../../src/ui/map/terrain/terrainProtectedCells';
import { buildTerrainPack } from '../../src/ui/map/terrain/terrainPack';
import { createWaterFeatures } from '../../src/ui/map/terrain/terrainDraw';
import { buildDisplayCoast } from '../../src/ui/map/displayCoast';
import outline from '../../src/data/map/japan-outline.json';
import castles from '../../src/data/scenarios/s1560/castles.json';
import districts from '../../src/data/scenarios/s1560/districts.json';
import roads from '../../src/data/scenarios/s1560/roads.json';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '../../src/core/state/ids';
import { collectRiverBridgeFootprints } from '../../src/ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '../../src/ui/map/terrain/riverDisplayConstraints';

import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { buildTerrainElevatedSurfaceBuffers } from '@ui/map/terrain/terrainElevatedSurface';
const point = (x: number, y: number) => ({ x, y });
it('preserves actual national emitted-water protection with stronger Float32 terrain and inverse64', () => {
  const terrain = buildTerrainPack();
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
  const landPolygons = coast.polygons.map((polygon) =>
    Array.from({ length: polygon.points.length / 2 }, (_, i) =>
      point(polygon.points[2 * i]!, polygon.points[2 * i + 1]!),
    ),
  );
  const water = createWaterFeatures(
    terrain.rivers,
    terrain.lakes,
    collectRiverBridgeFootprints(graph),
    collectRiverDisplayConstraints(graph, coast),
  );
  try {
    const waterGeometry = {
      lakes: water.getLakeGeometry(),
      rivers: water.getRiverMaterialDiagnostics().rivers,
    };
    const before = JSON.stringify({ landPolygons, waterGeometry });
    let diagnostics: TerrainProtectedCellDiagnostics | undefined;
    const mask = createTerrainProtectedCells({
      worldSize: 4096,
      cells: 128,
      landPolygons,
      waterGeometry,
      onDiagnostics: (value) => {
        diagnostics = value;
      },
    });
    expect(mask.length).toBe(128 * 128);
    expect(diagnostics).toMatchObject({ status: 'ok', failClosed: false });
    expect(diagnostics!.unprotectedCount).toBeGreaterThan(0);
    expect(diagnostics!.protectedCount).toBeGreaterThan(0);
    expect(mask).toEqual(
      createTerrainProtectedCells({ worldSize: 4096, cells: 128, landPolygons, waterGeometry }),
    );
    expect(JSON.stringify({ landPolygons, waterGeometry })).toBe(before);
    // Actual authored mountain center cells—not just empty sea—remain eligible.
    const elevatedEligible = (terrain.mountains ?? []).filter((mountain) =>
      mountain.ridges.some((ridge) =>
        ridge.some((p) => mask[Math.floor(p.y / 32) * 128 + Math.floor(p.x / 32)] === 0),
      ),
    );
    expect(elevatedEligible.length).toBeGreaterThan(0);
    console.info(
      'national protected-cell evidence',
      JSON.stringify({ ...diagnostics, elevatedEligible: elevatedEligible.map((m) => m.id) }),
    );

    const field = createSampledTerrainElevation(
      createTerrainTopography(terrain.mountains ?? [], landPolygons),
      { protectedCells: mask },
    );
    let inverseMax = 0,
      maxError = 0;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const p = { x: (x + 0.37) * 32, y: (y + 0.63) * 32 };
        if (mask[y * 128 + x]) {
          expect(field.sample(p)).toBe(0);
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ])
            expect(field.sample({ x: (x + dx!) * 32, y: (y + dy!) * 32 })).toBe(0);
        }
        const result = field.unprojectWithDiagnostics(field.project(p));
        inverseMax = Math.max(inverseMax, result.iterations);
        maxError = Math.max(maxError, Math.hypot(result.point.x - p.x, result.point.y - p.y));
        expect(result.iterations).toBeLessThanOrEqual(64);
        expect(Math.hypot(result.point.x - p.x, result.point.y - p.y)).toBeLessThan(2e-9);
      }
    const buffers = buildTerrainElevatedSurfaceBuffers(field);
    expect(buffers.bytes).toBe(1966080);
    let minimumFloat32Area = Infinity;
    for (let i = 0; i < buffers.indices.length; i += 3) {
      const a = buffers.indices[i]! * 6,
        b = buffers.indices[i + 1]! * 6,
        c = buffers.indices[i + 2]! * 6;
      const area =
        (buffers.vertices[b]! - buffers.vertices[a]!) *
          (buffers.vertices[c + 1]! - buffers.vertices[a + 1]!) -
        (buffers.vertices[b + 1]! - buffers.vertices[a + 1]!) *
          (buffers.vertices[c]! - buffers.vertices[a]!);
      minimumFloat32Area = Math.min(minimumFloat32Area, area);
    }
    expect(minimumFloat32Area).toBeGreaterThan(0);
    expect(Math.max(...field.vertexHeights)).toBeGreaterThan(20);
    expect(Math.max(...field.vertexHeights)).toBeLessThanOrEqual(64);
    console.info(
      'national-stronger-relief',
      JSON.stringify({
        protected: mask.filter((v) => v === 1).length,
        positive: field.vertexHeights.filter((h) => h > 0).length,
        maximum: Math.max(...field.vertexHeights),
        inverseMax,
        maxError,
        minimumFloat32Area,
        bytes: buffers.bytes,
        indices: buffers.indices.length,
      }),
    );
  } finally {
    water.destroy();
  }
});
