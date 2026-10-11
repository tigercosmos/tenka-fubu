import { describe, expect, it } from 'vitest';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, RoadEdgeId } from '@core/state/ids';
import roads from '@data/scenarios/s1560/roads.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import {
  edgeBetween,
  edgePolyline,
  pointAtPolyline,
  tangentAtPolyline,
} from '@ui/map/roads/roadGeometry';

const a = 'castle.a' as CastleId,
  b = 'castle.b' as CastleId;
const id = 'road.a-b' as RoadEdgeId;
const graph = () =>
  buildMapGraph(
    { [a]: { id: a, pos: { x: 0, y: 0 } }, [b]: { id: b, pos: { x: 100, y: 100 } } },
    {},
    { [id]: { id, a, b, type: 'land', grade: 2, baseDays: 2 } },
    { [id]: { waypoints: [100, 0] } },
  );

describe('shared authored road geometry', () => {
  it('returns exact endpoint coordinates and finite endpoint tangents on all five actual authored national routes', () => {
    const positions = new Map([...castles, ...districts].map((node) => [node.id, node.pos]));
    const authored = roads.edges.filter((edge) => 'waypoints' in edge && edge.waypoints?.length);
    expect(authored).toHaveLength(5);
    for (const edge of authored) {
      const from = positions.get(edge.a),
        to = positions.get(edge.b);
      if (!from || !to || !('waypoints' in edge) || !edge.waypoints)
        throw new Error('Missing actual route geometry');
      const points = [from];
      for (let i = 0; i + 1 < edge.waypoints.length; i += 2)
        points.push({ x: edge.waypoints[i]!, y: edge.waypoints[i + 1]! });
      points.push(to);
      for (const oriented of [points, points.slice().reverse()]) {
        expect(pointAtPolyline(oriented, 0)).toEqual(oriented[0]);
        expect(pointAtPolyline(oriented, 1)).toEqual(oriented.at(-1));
        expect(Number.isFinite(tangentAtPolyline(oriented, 0))).toBe(true);
        expect(Number.isFinite(tangentAtPolyline(oriented, 1))).toBe(true);
      }
    }
  });
  it('selects only a connecting adjacent edge and preserves all authored points', () => {
    const g = graph(),
      edge = edgeBetween(g, a, b);
    if (!edge) throw new Error('Missing connecting edge');
    expect(edgeBetween(g, b, a)).toBe(edge);
    expect(edgeBetween(g, a, 'missing')).toBeUndefined();
    expect(edgePolyline(edge, g)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(edgePolyline(edge, { ...g, nodes: new Map() })).toBeNull();
  });
  it('samples the authored dogleg by arc length rather than its endpoint chord', () => {
    const g = graph(),
      edge = edgeBetween(g, a, b)!;
    const pts = edgePolyline(edge, g)!;
    const before = JSON.stringify(pts);
    expect(pointAtPolyline(pts, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAtPolyline(pts, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAtPolyline(pts, 0.75)).toEqual({ x: 100, y: 50 });
    expect(tangentAtPolyline(pts, 0.25)).toBe(0);
    expect(tangentAtPolyline(pts, 0.75)).toBe(Math.PI / 2);
    expect(pointAtPolyline([...pts].reverse(), 0.25)).toEqual({ x: 100, y: 50 });
    expect(tangentAtPolyline([...pts].reverse(), 0.25)).toBe(-Math.PI / 2);
    expect(JSON.stringify(pts)).toBe(before);
  });
  it('keeps straight routes, clamped endpoints, degenerate and subdivided paths deterministic', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const divided = [line[0]!, { x: 20, y: 0 }, { x: 20, y: 0 }, line[1]!];
    for (const ratio of [-1, 0, 0.25, 0.5, 1, 2])
      expect(pointAtPolyline(divided, ratio)).toEqual(pointAtPolyline(line, ratio));
    expect(pointAtPolyline([], 0)).toBeNull();
    expect(tangentAtPolyline([], 0)).toBeNull();
    expect(pointAtPolyline([{ x: 2, y: 3 }], 0.5)).toEqual({ x: 2, y: 3 });
    expect(tangentAtPolyline([{ x: 2, y: 3 }], 0.5)).toBeNull();
    expect(
      pointAtPolyline(
        [
          { x: 2, y: 3 },
          { x: 2, y: 3 },
        ],
        0.5,
      ),
    ).toEqual({ x: 2, y: 3 });
    expect(
      tangentAtPolyline(
        [
          { x: 2, y: 3 },
          { x: 2, y: 3 },
        ],
        0.5,
      ),
    ).toBeNull();
  });
});
