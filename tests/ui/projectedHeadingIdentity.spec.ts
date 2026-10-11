import { createWasmGeographicScorer } from '@ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
import { expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { buildMapGraph, type MapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import outline from '@data/map/japan-outline.json';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '@ui/map/terrain/riverDisplayConstraints';
import { createTerrainProtectedCells } from '@ui/map/terrain/terrainProtectedCells';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { edgeVisualPolyline } from '@ui/map/roads/roadGeometry';
import { projectedPolylineHeading } from '@ui/map/roads/projectedHeading';
import { projectPolyline } from '@ui/map/roads/projectPolyline';
import { MapRenderer } from '@ui/map/MapRenderer';
import type { MapArmyView } from '@ui/map/mapViewTypes';

it('retains bit-exact source-leg heading on actual national protected flat roads with a present field', () => {
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
  const terrain = buildTerrainPack();
  const coast = buildDisplayCoast(outline, graph, terrain.rivers);
  const landPolygons = coast.polygons.map((p) =>
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
    const protectedCells = createTerrainProtectedCells({
      worldSize: 4096,
      cells: 128,
      landPolygons,
      waterGeometry: {
        lakes: water.getLakeGeometry(),
        rivers: water.getRiverMaterialDiagnostics().rivers,
      },
    });
    const field = createSampledTerrainElevation(
      createTerrainTopography(terrain.mountains ?? [], landPolygons),
      { worldSize: 4096, cells: 128, protectedCells },
    );
    // Exercise the actual consumer's field-present branch without GPU/init;
    // this narrow seam supplies only the canonical travel fields it reads.
    const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
    Reflect.set(renderer, 'sceneProjection', field);
    Reflect.set(renderer, 'projectScenePoint', field.project);
    const consumer = renderer as unknown as {
      computeArmyHeading(
        army: Pick<MapArmyView, 'fromNode' | 'toNode' | 'edgeT'>,
        graph: MapGraph,
      ): { x: number; y: number } | null;
    };
    let flatRoads = 0;
    for (const edge of graph.edges.values()) {
      const points = edgeVisualPolyline(edge, graph);
      if (points === null || points.length !== 2) continue;
      const path = projectPolyline(points, field.project);
      if (!path.stations.every((s) => s.scene.x === s.source.x && s.scene.y === s.source.y))
        continue;
      flatRoads++;
      const first = projectedPolylineHeading(points, 0.2, field.project);
      const later = projectedPolylineHeading(points, 0.8, field.project);
      // Strict equality is the actual scene-part cache contract, not a visual epsilon.
      const travel = { fromNode: edge.a, toNode: edge.b, edgeT: 0.2 };
      expect(consumer.computeArmyHeading({ ...travel, edgeT: 0.8 }, graph), edge.id).toEqual(
        consumer.computeArmyHeading(travel, graph),
      );
      expect(later, edge.id).toEqual(first);
      const reverseFirst = projectedPolylineHeading(points, 0.2, field.project, true);
      expect(projectedPolylineHeading(points, 0.8, field.project, true), edge.id).toEqual(
        reverseFirst,
      );
    }
    expect(flatRoads).toBeGreaterThan(20);
  } finally {
    water.destroy();
  }
});

it('does not substitute an identity endpoint vector when any interior station is raised', () => {
  const points = Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 32, y: 0 })]);
  const project = vi.fn((p: { x: number; y: number }) => ({
    x: p.x,
    y: p.y - 8 * Math.sin((Math.PI * p.x) / 32),
  }));
  const first = projectedPolylineHeading(points, 0.2, project)!;
  const calls = project.mock.calls.length;
  const later = projectedPolylineHeading(points, 0.8, project)!;
  expect(first.y).toBeLessThan(0);
  expect(later.y).toBeGreaterThan(0);
  expect(first).not.toEqual(later);
  expect(project).toHaveBeenCalledTimes(calls);
});
