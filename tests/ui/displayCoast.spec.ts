import { describe, expect, it } from 'vitest';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import outline from '@data/map/japan-outline.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import { pointInPolygon, isSimplePolygon, polygonsOverlap } from '@data/map/outlineGeometry';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import {
  buildDisplayCoast,
  collectCoastProtectedPoints,
  roundDisplayCoastGeometry,
  DISPLAY_COAST,
  type OutlineGeometry,
} from '@ui/map/displayCoast';

const square: OutlineGeometry = {
  polygons: [{ id: 'island', points: [100, 100, 300, 100, 300, 300, 100, 300] }],
};
const graph = () =>
  buildMapGraph(
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

describe('display-only coast geometry', () => {
  it('uses exact local quadratic samples, floats and immutable geometry without canonical metadata', () => {
    const before = JSON.stringify(square);
    const result = roundDisplayCoastGeometry(square, []);
    expect(result.polygons[0]!.points.slice(0, 4)).toEqual([100, 112, 100.1875, 109.1875]);
    expect(result.polygons[0]!.points).toHaveLength(4 * 9 * 2);
    expect(Object.keys(result)).toEqual(['polygons']);
    expect(Object.isFrozen(result.polygons[0]!.points)).toBe(true);
    expect(JSON.stringify(square)).toBe(before);
  });
  it('preserves exact boundary arithmetic and protected point/paint envelopes', () => {
    const result = roundDisplayCoastGeometry(square, [
      { x: 200, y: 100 },
      { x: 300, y: 300, radius: 62 },
    ]);
    expect(result.polygons[0]!.points.slice(0, 4)).toEqual([100, 100, 300, 100]);
    expect(result.polygons[0]!.points).toContain(300);
    expect(pointInPolygon(200, 100, result.polygons[0]!.points)).toBe(
      pointInPolygon(200, 100, square.polygons[0]!.points),
    );
    expect(roundDisplayCoastGeometry(square, [{ x: 100, y: 100, radius: NaN }])).toEqual(square);
  });
  it('normalizes adjacent/closing duplicates but fails closed on degenerate, nonfinite and oversized inputs', () => {
    const repeated = {
      polygons: [
        { id: 'island', points: [100, 100, 100, 100, 300, 100, 300, 300, 100, 300, 100, 100] },
      ],
    };
    expect(roundDisplayCoastGeometry(repeated, [])).toEqual(roundDisplayCoastGeometry(square, []));
    for (const points of [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 10, 0, NaN, 10],
      [0, 0, 10, 0, Infinity, 10],
      [-1, 0, 10, 0, 0, 10],
      [0, 0, 4097, 0, 0, 10],
      [0, 0, 10],
    ])
      expect(roundDisplayCoastGeometry({ polygons: [{ id: 'bad', points }] }, []).polygons).toEqual(
        [],
      );
    const oversized = Array.from({ length: DISPLAY_COAST.inputPointBudget + 1 }, (_, i) => [
      100 + (i % 2),
      100 + Math.floor(i / 2),
    ]).flat();
    expect(
      roundDisplayCoastGeometry({ polygons: [{ id: 'too-many', points: oversized }] }, []).polygons,
    ).toEqual([]);
    expect(roundDisplayCoastGeometry(square, [{ x: NaN, y: 0 }])).toEqual(square);
  });
  it('rejects raw self-intersections, cross-island touches and nested overlaps', () => {
    expect(
      roundDisplayCoastGeometry(
        { polygons: [{ id: 'bow', points: [100, 100, 300, 300, 100, 300, 300, 100, 250, 80] }] },
        [],
      ).polygons,
    ).toEqual([]);
    for (const second of [
      [200, 200, 400, 200, 400, 400, 200, 400],
      [300, 100, 400, 100, 400, 200, 300, 200],
      [150, 150, 200, 150, 200, 200, 150, 200],
    ])
      expect(
        roundDisplayCoastGeometry(
          { polygons: [...square.polygons, { id: 'other', points: second }] },
          [],
        ).polygons,
      ).toEqual([]);
  });
  it('falls back to the valid raw geometry when rounding would overlap another island', () => {
    const input = {
      polygons: [
        {
          id: 'notch',
          points: [100, 100, 200, 100, 200, 200, 170, 200, 170, 130, 130, 130, 130, 200, 100, 200],
        },
        { id: 'small', points: [131, 131, 132, 131, 132, 132, 131, 132] },
      ],
    };
    expect(polygonsOverlap(input.polygons[0]!.points, input.polygons[1]!.points)).toBe(false);
    expect(roundDisplayCoastGeometry(input, [])).toEqual(input);
  });
  it('keeps the output budget by retaining a valid high-density raw island', () => {
    const points = Array.from({ length: 700 }, (_, i) => [
      1000 + 200 * Math.cos((i * 2 * Math.PI) / 700),
      1000 + 200 * Math.sin((i * 2 * Math.PI) / 700),
    ]).flat();
    const input = { polygons: [{ id: 'dense', points }] };
    const smaller = {
      polygons: [
        { id: 'small-dense', points: points.filter((_, i) => Math.floor(i / 2) % 2 === 0) },
      ],
    };
    expect(roundDisplayCoastGeometry(smaller, []).polygons[0]!.points.length).toBe(350 * 9 * 2);
    expect(roundDisplayCoastGeometry(input, [])).toEqual(input);
  });
  it('fails closed on concentrated protection visits without changing ordinary rounding', () => {
    const points = Array.from({ length: 100 }, (_, i) => [
      1000 + 50 * Math.cos((i * 2 * Math.PI) / 100),
      1000 + 50 * Math.sin((i * 2 * Math.PI) / 100),
    ]).flat();
    const input = { polygons: [{ id: 'visits', points }] };
    const center = { x: 1000, y: 1000, radius: 0 };
    expect(roundDisplayCoastGeometry(input, [center]).polygons[0]!.points.length).toBe(100 * 9 * 2);
    expect(
      roundDisplayCoastGeometry(
        input,
        Array.from({ length: 25_000 }, () => center),
      ),
    ).toEqual(input);
  });
  it('caches actual national geometry, protects normalized rivers/roads/bridges and leaves source data intact', () => {
    const g = graph(),
      rivers = buildTerrainPack().rivers;
    const before = JSON.stringify({ outline, roads, castles, districts, rivers });
    const protectedPoints = collectCoastProtectedPoints(g, rivers)!;
    expect(protectedPoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(protectedPoints.some((p) => (p.radius ?? 20) > 50)).toBe(true);
    const result = buildDisplayCoast(outline, g, rivers);
    expect(buildDisplayCoast(outline, g, rivers)).toBe(result);
    expect(buildDisplayCoast(outline, graph(), rivers)).not.toBe(result);
    expect(result.polygons).toHaveLength(3);
    expect(result.polygons.reduce((n, p) => n + p.points.length / 2, 0)).toBeGreaterThan(470);
    expect(result.polygons.reduce((n, p) => n + p.points.length / 2, 0)).toBeLessThanOrEqual(
      DISPLAY_COAST.outputPointBudget,
    );
    for (const p of result.polygons) expect(isSimplePolygon(p.points)).toBe(true);
    for (const n of g.nodes.values())
      expect(result.polygons.some((p) => pointInPolygon(n.pos.x, n.pos.y, p.points))).toBe(
        outline.polygons.some((p) => pointInPolygon(n.pos.x, n.pos.y, p.points)),
      );
    for (const river of rivers)
      for (const p of river.points)
        expect(result.polygons.some((poly) => pointInPolygon(p.x, p.y, poly.points))).toBe(
          outline.polygons.some((poly) => pointInPolygon(p.x, p.y, poly.points)),
        );
    expect(JSON.stringify({ outline, roads, castles, districts, rivers })).toBe(before);
  });
});
