import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { buildRoadsLayer } from '@ui/map/roads/roadsDraw';
import { createRoadHighlight } from '@ui/map/roads/roadHighlight';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import roads from '@data/scenarios/s1560/roads.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import {
  curveAuthoredPolyline,
  edgePolyline,
  edgeVisualPolyline,
  tangentAtPolyline,
} from '@ui/map/roads/roadGeometry';

export function nationalRoadGraph() {
  return buildMapGraph(
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
}

describe('bounded authored display curves', () => {
  it('draws actual curved road and selection highlight through the same cached display points', () => {
    const graph = nationalRoadGraph();
    const edge = [...graph.edges.values()].find((e) => e.id === 'road.sunpu-kokokuji-01')!;
    const visual = edgeVisualPolyline(edge, graph)!;
    expect(visual.length).toBeGreaterThan(edgePolyline(edge, graph)!.length);
    const raw = edgePolyline(edge, graph)!;
    const interior = visual.find((p) =>
      raw.slice(1).every((b, i) => {
        const a = raw[i]!,
          dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
        );
        return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) > 1e-5;
      }),
    );
    expect(interior).toBeDefined();
    const line = vi.spyOn(Graphics.prototype, 'lineTo');
    const roads = buildRoadsLayer(graph);
    const highlight = createRoadHighlight();
    try {
      roads.setStage('near');
      expect(line).toHaveBeenCalledWith(interior!.x, interior!.y);
      line.mockClear();
      highlight.update({ graph, selectedNodeId: edge.a });
      expect(line).toHaveBeenCalledWith(interior!.x, interior!.y);
    } finally {
      roads.destroy();
      highlight.destroy();
      line.mockRestore();
    }
  });
  it('curves a one-waypoint dogleg through every raw anchor while keeping exact endpoint directions', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const result = curveAuthoredPolyline(raw);
    expect(result.length).toBeGreaterThan(raw.length);
    for (const anchor of raw) expect(result).toContainEqual(anchor);
    expect(tangentAtPolyline(result, 0)).toBe(0);
    expect(tangentAtPolyline(result, 1)).toBe(Math.PI / 2);
    expect(result.length).toBeLessThanOrEqual(256);
    expect(result).toEqual(curveAuthoredPolyline(raw));
    const reversed = curveAuthoredPolyline([...raw].reverse());
    expect(reversed).toHaveLength(result.length);
    reversed.forEach((p, i) => {
      // Independent reverse construction can differ at floating arithmetic roundoff;
      // runtime reverse travel uses the single cached path in reverse order.
      expect(p.x).toBeCloseTo(result[result.length - 1 - i]!.x, 12);
      expect(p.y).toBeCloseTo(result[result.length - 1 - i]!.y, 12);
    });
  });
  it('retains raw bridge-near segments and fails closed on blocked corners', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(curveAuthoredPolyline(raw, { bridgePins: [{ x: 90, y: 0 }] })).toEqual(raw);
    expect(curveAuthoredPolyline(raw, { bridgePins: [{ x: 50, y: 0 }] }).length).toBeGreaterThan(
      raw.length,
    );
    expect(curveAuthoredPolyline(raw, { isAllowed: (p) => p.x <= 100 && p.y >= 0 })).toEqual(raw);
    for (const points of [
      [],
      [{ x: 1, y: 1 }],
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    ])
      expect(curveAuthoredPolyline(points)).toEqual(points);
  });
  it('curves at least one of the five actual national routes, freezes the cache and preserves every original anchor', () => {
    const graph = nationalRoadGraph();
    let curved = 0;
    for (const edge of graph.edges.values()) {
      const raw = edgePolyline(edge, graph)!,
        visual = edgeVisualPolyline(edge, graph)!;
      expect(edgeVisualPolyline(edge, graph)).toBe(visual);
      expect(Object.isFrozen(visual)).toBe(true);
      expect(visual.every(Object.isFrozen)).toBe(true);
      for (const anchor of raw) expect(visual).toContainEqual(anchor);
      expect(visual.length).toBeLessThanOrEqual(256);
      if (!edge.waypoints?.length || edge.type === 'sea') expect(visual).toEqual(raw);
      else if (visual.length > raw.length) curved++;
    }
    expect(curved).toBeGreaterThan(0);
  });
});
