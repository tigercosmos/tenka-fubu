import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { RoadPoint } from '@ui/map/roads/roadGeometry';
import { edgeVisualPolyline } from '@ui/map/roads/roadGeometry';
import { buildRoadsLayer, drawBridge, segmentAngleAt } from '@ui/map/roads/roadsDraw';
import { createRoadHighlight } from '@ui/map/roads/roadHighlight';
import {
  pathSegments,
  createPathPreview,
  type PathPreviewProps,
} from '@ui/map/sceneParts/pathPreview';
import {
  projectPolyline,
  projectedStationCount,
  PROJECTED_POLYLINE_LIMITS,
} from '@ui/map/roads/projectPolyline';
import { BRIDGE_DISPLAY_SCALE } from '@ui/map/roads/roadMaterial';
import { buildFullState } from '../helpers/fullState';
import { selectMapStaticModel } from '@core/state/selectors';

const project = (point: RoadPoint) => ({
  x: point.x - 2,
  y: point.y - 10 - (point.x * point.x) / 100,
});
const input = {
  nodes: new Map([
    ['a', { id: 'a', kind: 'castle', pos: { x: 0, y: 20 } }],
    ['b', { id: 'b', kind: 'castle', pos: { x: 32, y: 20 } }],
  ]),
  edges: new Map([
    [
      'road',
      { id: 'road', a: 'a', b: 'b', grade: 3, type: 'land', baseDays: 2, bridges: [16, 20] },
    ],
  ]),
  adjacency: new Map([
    ['a', ['road']],
    ['b', ['road']],
  ]),
} as unknown as MapGraph;
const build: (
  graph: MapGraph,
  sea?: Parameters<typeof buildRoadsLayer>[1],
  projection?: typeof project,
) => ReturnType<typeof buildRoadsLayer> = buildRoadsLayer;
const highlight: (projection?: typeof project) => ReturnType<typeof createRoadHighlight> =
  createRoadHighlight;
const segments: (
  props: PathPreviewProps,
  projection?: typeof project,
) => ReturnType<typeof pathSegments> = pathSegments;
const edge = [...input.edges.values()][0]!;
const props: PathPreviewProps = {
  graph: input,
  originNodeId: edge.a,
  targetNodeId: edge.b,
  result: {
    found: true,
    nodes: [edge.a, edge.b],
    edgeIds: [edge.id],
    travelDays: 2,
    subjugateDays: 0,
    totalDays: 2,
    steps: [
      { nodeId: edge.a, etaDays: 0, needsSubjugate: false },
      { nodeId: edge.b, etaDays: 2, needsSubjugate: false },
    ],
  },
};

describe('actual road/highlight/path producers project canonical sampled routes once', () => {
  it('draws the projected source route instead of an endpoint-regenerated or flat road', () => {
    const roads = build(input, undefined, project);
    const starts = vi.spyOn(roads.tiers.arterial, 'moveTo');
    const lines = vi.spyOn(roads.tiers.arterial, 'lineTo');
    roads.setStage('near');
    try {
      expect(starts.mock.calls[0]).toEqual([-2, 10]);
      expect(lines.mock.calls.slice(0, 4)).toEqual([
        [6, 9.36],
        [14, 7.4399999999999995],
        [22, 4.24],
        [30, -0.2400000000000002],
      ]);
    } finally {
      roads.destroy();
    }
  });
  it('draws the same projected samples in selected-road highlight', () => {
    const value = highlight(project);
    const graphics = value.container.children[0] as Graphics;
    const starts = vi.spyOn(graphics, 'moveTo');
    const lines = vi.spyOn(graphics, 'lineTo');
    value.update({ graph: input, selectedNodeId: 'a' });
    try {
      expect(starts.mock.calls[0]).toEqual([-2, 10]);
      expect(lines.mock.calls).toHaveLength(4);
    } finally {
      value.destroy();
    }
  });
  it('path preview follows those canonical samples, reversing only after projection', () => {
    const forward = segments(props, project)[0]!;
    expect(forward.from).toEqual(project({ x: 0, y: 20 }));
    expect(forward.to).toEqual(project({ x: 32, y: 20 }));
    expect(forward.pts).toHaveLength(5);
    const reverse = segments(
      {
        ...props,
        originNodeId: edge.b,
        targetNodeId: edge.a,
        result: { ...props.result, nodes: [edge.b, edge.a] },
      },
      project,
    )[0]!;
    expect(reverse.pts).toEqual([...forward.pts].reverse());
  });
  it('measures the actual national source station count before choosing an aggregate projection cap', async () => {
    const graph = selectMapStaticModel(await buildFullState()).graph;
    let bridges = 0;
    let edges = 0,
      stations = 0,
      maximum = 0;
    for (const edge of graph.edges.values()) {
      const source = edgeVisualPolyline(edge, graph);
      if (source === null) continue;
      const count =
        1 +
        source
          .slice(1)
          .reduce(
            (sum, b, i) =>
              sum + Math.max(1, Math.ceil(Math.hypot(b.x - source[i]!.x, b.y - source[i]!.y) / 8)),
            0,
          );
      edges++;
      bridges += Math.floor((edge.bridges?.length ?? 0) / 2);
      stations += count;
      maximum = Math.max(maximum, count);
    }
    console.log(
      JSON.stringify({
        nationalProjectionSourceStations: {
          edges,
          stations,
          bridges,
          totalIncludingBridges: stations + bridges,
          maximum,
        },
      }),
    );
    expect(stations).toBeGreaterThan(0);
  });

  it('emitted cached diagnostics match the actual draw points, sharing a single projection across all three producers', () => {
    const callback = vi.fn(project);
    const graphBefore = structuredClone(input);
    const roads = build(input, undefined, callback);
    const row = roads.getProjectionDiagnostics()[0]!;
    expect(callback).toHaveBeenCalledTimes(6); // five route stations and one bridge center
    expect(row.roadId).toBe('road');
    expect(row.stations.map((station) => station.source)).toEqual(
      [0, 8, 16, 24, 32].map((x) => ({ x, y: 20 })),
    );
    expect(Object.isFrozen(row)).toBe(true);
    for (const station of row.stations) {
      expect(Object.isFrozen(station)).toBe(true);
      expect(Object.isFrozen(station.source)).toBe(true);
      expect(Object.isFrozen(station.scene)).toBe(true);
      expect(station.scene).toEqual(project(station.source));
    }
    const selected = highlight(callback);
    selected.update({ graph: input, selectedNodeId: 'a' });
    expect(selected.getProjectionDiagnostics()[0]!.stations).toBe(row.stations);
    const preview = createPathPreview(callback);
    preview.update(props);
    expect(preview.getProjectionDiagnostics()[0]!.stations).toBe(row.stations);
    expect(callback).toHaveBeenCalledTimes(6);
    for (const stage of ['far', 'mid', 'near', 'near'] as const) roads.setStage(stage);
    expect(callback).toHaveBeenCalledTimes(6);
    expect(roads.getProjectionDiagnostics()[0]).toBe(row);
    expect(input).toEqual(graphBefore);
    selected.update(null);
    preview.update(null);
    expect(selected.getProjectionDiagnostics()).toEqual([]);
    expect(preview.getProjectionDiagnostics()).toEqual([]);
    roads.destroy();
    selected.destroy();
    preview.container.destroy({ children: true });
    expect(roads.getProjectionDiagnostics()).toEqual([]);
    expect(selected.getProjectionDiagnostics()).toEqual([]);
  });

  it('projects bridge centers and derives the bridge tangent from the exact emitted sampled road', () => {
    const roads = build(input, undefined, project);
    const point = project({ x: 16, y: 20 });
    const points = roads.getProjectionDiagnostics()[0]!.stations.map((station) => station.scene);
    const expected = new Graphics();
    drawBridge(
      expected,
      point.x,
      point.y,
      segmentAngleAt(points, point.x, point.y),
      BRIDGE_DISPLAY_SCALE.near,
    );
    roads.setStage('near');
    const paint = (graphics: Graphics) =>
      graphics.context.instructions.map((instruction) => ({
        action: instruction.action,
        data:
          instruction.action === 'stroke' || instruction.action === 'fill'
            ? {
                style: instruction.data.style,
                shapes: instruction.data.path.shapePath.shapePrimitives.map(
                  (primitive) => primitive.shape,
                ),
              }
            : undefined,
      }));
    expect(paint(roads.tiers.bridge)).toEqual(paint(expected));
    roads.destroy();
    expected.destroy();
  });

  it('validates/densifies source geometry once and rejects aggregate overflow before any projection or partial layer', () => {
    const source = Object.freeze(
      [
        { x: 0.25, y: 10 },
        { x: 32.75, y: 10 },
        { x: 32.75, y: 10 },
      ].map((point) => Object.freeze(point)),
    );
    const callback = vi.fn(project);
    const result = projectPolyline(source, callback);
    expect(result.points).toHaveLength(projectedStationCount(source));
    for (let i = 1; i < result.stations.length; i++) {
      const a = result.stations[i - 1]!.source,
        b = result.stations[i]!.source;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(8);
    }
    expect(projectPolyline(source, callback)).toBe(result);
    const another = vi.fn((point: RoadPoint) => ({ x: point.x + 1, y: point.y }));
    expect(projectPolyline(source, another)).not.toBe(result);
    expect(projectPolyline(source, another).points[0]).toEqual({ x: 1.25, y: 10 });
    const mutable = [{ x: 0, y: 10 }];
    const first = projectPolyline(mutable, project);
    mutable[0]!.y = 30;
    expect(projectPolyline(mutable, project).points[0]!.y).toBe(20);
    expect(first.points[0]!.y).toBe(0);
    expect(() => projectPolyline([{ x: NaN, y: 0 }], callback)).toThrow(RangeError);
    expect(() =>
      projectPolyline(
        [
          { x: 0, y: 0 },
          { x: 1e6, y: 0 },
        ],
        callback,
      ),
    ).toThrow(/budget/);
    expect(() => projectPolyline([{ x: 0, y: 0 }], () => ({ x: Infinity, y: 0 }))).toThrow(
      RangeError,
    );
    const many = {
      ...input,
      edges: new Map(
        Array.from({ length: 4000 }, (_, index) => [
          `road.${index}`,
          { ...edge, id: `road.${index}` },
        ]),
      ),
    } as unknown as MapGraph;
    const noPartial = vi.fn(project);
    expect(() => build(many, undefined, noPartial)).toThrow(/station budget/);
    expect(noPartial).not.toHaveBeenCalled();
    expect(PROJECTED_POLYLINE_LIMITS).toEqual({ step: 8, stations: 16384, layerStations: 16384 });
  });
});
