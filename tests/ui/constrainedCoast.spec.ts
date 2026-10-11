import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import frozenRings from './fixtures/constrained-coast-rings.json';
import { buildMapGraph } from '@core/state/mapGraph';
import { buildVisualMapState } from '@core/debugVisual';
import { selectMapStaticModel } from '@core/state/selectors';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import outline from '@data/map/japan-outline.json';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import {
  pointInPolygon,
  isSimplePolygon,
  polygonsOverlap,
  signedArea,
} from '@data/map/outlineGeometry';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { buildDisplayCoast, type OutlineGeometry } from '@ui/map/displayCoast';
import {
  buildConstrainedCoast,
  collectCoastFootprints,
  collectRiverBridgeFootprints,
  roundConstrainedCoast,
  coastTriangleTouchesCapsule,
  CONSTRAINED_COAST,
  getConstrainedCoastWork,
  type CoastCapsule,
} from '@ui/map/constrainedCoast';
import { ROAD_DEPTH_STYLE as painterDepth } from '@ui/map/roads/roadsDraw';
import { BRIDGE, ROAD_DEPTH_STYLE } from '@ui/map/mapViewConfig';
import { BRIDGE_DISPLAY_SCALE } from '@ui/map/roads/roadMaterial';

function graph() {
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
const square: OutlineGeometry = {
  polygons: [{ id: 'square', points: [100, 100, 300, 100, 300, 300, 100, 300] }],
};
const points = (geometry: OutlineGeometry) =>
  geometry.polygons.flatMap((poly) =>
    Array.from({ length: poly.points.length / 2 }, (_, i) => ({
      x: poly.points[i * 2]!,
      y: poly.points[i * 2 + 1]!,
    })),
  );
const land = (geometry: OutlineGeometry, p: { x: number; y: number }) =>
  geometry.polygons.some((poly) => pointInPolygon(p.x, p.y, poly.points));

describe('constrained display coast', () => {
  it('collects only immutable bridge disks identical to the existing complete paint envelope', () => {
    const g = graph();
    const before = JSON.stringify([...g.edges.values()]);
    const actual = collectRiverBridgeFootprints(g)!;
    const expected = collectCoastFootprints(g)!.filter((entry) => entry.id.startsWith('bridge:'));
    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(0);
    const scale = Math.max(BRIDGE_DISPLAY_SCALE.mid, BRIDGE_DISPLAY_SCALE.near);
    const radius =
      scale *
      (Math.hypot(BRIDGE.deckLength / 2 + BRIDGE.abutment, BRIDGE.deckWidth / 2) +
        Math.max(
          ROAD_DEPTH_STYLE.bridgeLift + ROAD_DEPTH_STYLE.bridgeRailHeight + 0.5,
          Math.SQRT2 * ROAD_DEPTH_STYLE.shadowOffset,
        ));
    expect(Object.isFrozen(actual)).toBe(true);
    for (const entry of actual) {
      expect(entry.radius).toBe(radius);
      expect(entry.a).toEqual(entry.b);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.a)).toBe(true);
      expect(Object.isFrozen(entry.b)).toBe(true);
    }
    expect(JSON.stringify([...g.edges.values()])).toBe(before);
    expect(collectRiverBridgeFootprints({ ...g, edges: new Map() })).toEqual([]);
  });

  it.each(
    [[1], [1, 2, 3], [NaN, 2], [1, Infinity], [1, -Infinity]].map((bridges) => ({ bridges })),
  )(
    'rejects malformed bridge coordinates $bridges without returning partial protection',
    ({ bridges }) => {
      const g = graph();
      const edge = [...g.edges.values()][0]!;
      const valid = { ...edge, bridges: [4, 5] };
      const invalid = { ...edge, id: 'invalid' as RoadEdgeId, bridges };
      expect(
        collectRiverBridgeFootprints({
          ...g,
          edges: new Map([
            [valid.id, valid],
            [invalid.id, invalid],
          ]),
        }),
      ).toBeNull();
    },
  );

  it('bounds bridge pair and edge input counts, accepting exactly the configured footprint budget', () => {
    const g = graph();
    const edge = [...g.edges.values()][0]!;
    const bridges = Array.from({ length: CONSTRAINED_COAST.footprints * 2 }, (_, index) =>
      index % 2 ? 2 : 1,
    );
    expect(
      collectRiverBridgeFootprints({ ...g, edges: new Map([[edge.id, { ...edge, bridges }]]) }),
    ).toHaveLength(CONSTRAINED_COAST.footprints);
    expect(
      collectRiverBridgeFootprints({
        ...g,
        edges: new Map([[edge.id, { ...edge, bridges: [...bridges, 3, 4] }]]),
      }),
    ).toBeNull();
    const edges = new Map(
      Array.from({ length: CONSTRAINED_COAST.footprints + 1 }, (_, index) => {
        const id = `empty:${index}` as RoadEdgeId;
        return [id, { ...edge, id, bridges: [] }] as const;
      }),
    );
    expect(collectRiverBridgeFootprints({ ...g, edges })).toBeNull();
  });

  it('preserves frozen pre-index geometry hashes for national, sparse and bounded synthetic builds', () => {
    // Pin original synthetic inputs: Math.sin differs by one rounding step across platforms.
    // The existing output hashes below remain exact, with no coordinate rounding or tolerance.
    const ring = (n: 350 | 700) => ({
      polygons: [{ id: 'ring', points: [...frozenRings.rings[n]] }],
    });
    const rivers = buildTerrainPack().rivers;
    const outputs = {
      sparse: buildConstrainedCoast(
        outline,
        selectMapStaticModel(buildVisualMapState()).graph,
        rivers,
      ),
      national: buildConstrainedCoast(outline, graph(), rivers),
      square: roundConstrainedCoast(square, []),
      obstacle: roundConstrainedCoast(square, [
        { id: 'point', a: { x: 104, y: 104 }, b: { x: 104, y: 104 }, radius: 1 },
      ]),
      ring350: roundConstrainedCoast(ring(350), []),
      ring700: roundConstrainedCoast(ring(700), []),
    };
    expect(
      Object.fromEntries(
        Object.entries(outputs).map(([id, output]) => [
          id,
          createHash('sha256').update(JSON.stringify(output)).digest('hex'),
        ]),
      ),
    ).toEqual({
      sparse: 'cc8f687eaa4ace9e39032a69302b05a22153b6fc94c8d0c19f7a646ad8aaccd4',
      national: '7c1b05d9d013a534c0f9b3fae255a5be2b6c4527d797fdb3be15435578ed9052',
      square: 'f93e0cea3945a86d93f094b079fd715b2e9f6131611589f18dcb1806f1284eab',
      obstacle: '361f9b8dc8172b6c5193b73455086e208a9e3f446539ccfc2db25112e6bf6b3b',
      ring350: '8e4c8c169cd1bae73ae766e1f2e55856dd3519f6bdc0b7576bb61a6bea992e34',
      ring700: '12f1399c4014eb2779ae141325d8f0ae8d0cf60cad70396678bc2d021feef883',
    });
    expect(getConstrainedCoastWork(outputs.sparse)?.acceptedTriangleComparisons).toBeLessThan(5000);
    expect(Object.isFrozen(getConstrainedCoastWork(outputs.sparse))).toBe(true);
  });
  it('bounds exact triangle predicate work instead of scanning every previously admitted triangle', () => {
    const original = Array.prototype.some;
    let triangleCalls = 0;
    Array.prototype.some = function <T>(
      this: T[],
      callback: (value: T, index: number, array: T[]) => unknown,
      thisArg?: unknown,
    ): boolean {
      const first = this[0];
      if (
        this.length === 3 &&
        typeof first === 'object' &&
        first !== null &&
        'x' in first &&
        'y' in first
      )
        triangleCalls++;
      return original.call(this, callback, thisArg);
    };
    try {
      const g = selectMapStaticModel(buildVisualMapState()).graph;
      const output = buildConstrainedCoast(
        { ...outline, polygons: outline.polygons.map((p) => ({ ...p, points: [...p.points] })) },
        g,
        buildTerrainPack().rivers,
      );
      expect(points(output).length).toBe(4094);
      expect(triangleCalls).toBeLessThan(5000);
    } finally {
      Array.prototype.some = original;
    }
  });
  it('keeps locally admitted curves in the actual sparse visual runtime graph without globally reverting on output budget', () => {
    const graph = selectMapStaticModel(buildVisualMapState()).graph;
    expect(graph.nodes.size).toBe(15);
    expect(graph.edges.size).toBe(14);
    const output = buildDisplayCoast(outline, graph, buildTerrainPack().rivers);
    expect(points(output).length).toBeGreaterThan(470);
    expect(points(output).length).toBeLessThanOrEqual(4096);
    const poly = output.polygons.find((p) => p.id === 'honshu')!;
    const vertices = points({ polygons: [poly] });
    const turns = vertices.flatMap((p, i) => {
      if (Math.hypot(p.x - 2055, p.y - 2953) > 24) return [];
      const a = vertices[(i + vertices.length - 1) % vertices.length]!,
        b = vertices[(i + 1) % vertices.length]!;
      const dx = p.x - a.x,
        dy = p.y - a.y,
        ex = b.x - p.x,
        ey = b.y - p.y;
      return [
        (Math.acos(
          Math.max(
            -1,
            Math.min(1, (dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey))),
          ),
        ) *
          180) /
          Math.PI,
      ];
    });
    expect(Math.max(...turns)).toBeLessThanOrEqual(30);
    for (const p of output.polygons) expect(isSimplePolygon(p.points)).toBe(true);
    for (const c of collectCoastFootprints(graph, buildTerrainPack().rivers)!) {
      expect(land(output, c.a)).toBe(land(outline, c.a));
      expect(land(output, c.b)).toBe(land(outline, c.b));
    }
  });
  it('bounds inward display bbox drift and quadratic displacement while leaving canonical bounds untouched', () => {
    for (const raw of [square, outline]) {
      const snapshot = JSON.stringify(raw);
      const output =
        raw === square
          ? roundConstrainedCoast(raw, [])
          : buildConstrainedCoast(raw, graph(), buildTerrainPack().rivers);
      for (const poly of output.polygons) {
        const original = raw.polygons.find((p) => p.id === poly.id)!;
        for (const axis of [0, 1]) {
          const a = original.points.filter((_, i) => i % 2 === axis);
          const b = poly.points.filter((_, i) => i % 2 === axis);
          expect(Math.min(...b)).toBeGreaterThanOrEqual(Math.min(...a) - 1e-9);
          expect(Math.max(...b)).toBeLessThanOrEqual(Math.max(...a) + 1e-9);
          expect(Math.min(...b) - Math.min(...a)).toBeLessThanOrEqual(12);
          expect(Math.max(...a) - Math.max(...b)).toBeLessThanOrEqual(12);
        }
        const vertices = points({ polygons: [original] });
        for (const p of points({ polygons: [poly] })) {
          const distance = Math.min(
            ...vertices.map((a, i) => {
              const b = vertices[(i + 1) % vertices.length]!;
              const dx = b.x - a.x,
                dy = b.y - a.y;
              const t = Math.max(
                0,
                Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
              );
              return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
            }),
          );
          expect(distance).toBeLessThanOrEqual(12 + 1e-9);
        }
      }
      expect(JSON.stringify(raw)).toBe(snapshot);
    }
  });
  it('actually rounds the nationally pinned 96-degree coast corner rather than preserving its raw cut', () => {
    const g = graph(),
      rivers = buildTerrainPack().rivers;
    const result = buildDisplayCoast(outline, g, rivers);
    const all = points(result);
    const local = all.filter((p) => Math.hypot(p.x - 2055, p.y - 2953) <= 24);
    expect(local.some((p) => p.x === 2055 && p.y === 2953)).toBe(false);
    expect(local.length).toBeGreaterThan(3);
    const turns = all.flatMap((p, i) => {
      if (Math.hypot(p.x - 2055, p.y - 2953) > 24) return [];
      const a = all[(i + all.length - 1) % all.length]!,
        b = all[(i + 1) % all.length]!;
      const dx = p.x - a.x,
        dy = p.y - a.y,
        ex = b.x - p.x,
        ey = b.y - p.y;
      return (
        (Math.acos(
          Math.max(
            -1,
            Math.min(1, (dx * ex + dy * ey) / (Math.hypot(dx, dy) * Math.hypot(ex, ey))),
          ),
        ) *
          180) /
        Math.PI
      );
    });
    expect(Math.max(...turns)).toBeLessThanOrEqual(30);
  });
  it('guards continuous swept triangles, including tiny contained disks and crossing capsules without sampled vertices', () => {
    const triangle = [
      { x: 100, y: 100 },
      { x: 120, y: 100 },
      { x: 100, y: 120 },
    ] as const;
    const capsule = (a: { x: number; y: number }, b = a, radius = 0): CoastCapsule => ({
      id: 'test',
      a,
      b,
      radius,
    });
    expect(coastTriangleTouchesCapsule(triangle, capsule({ x: 105, y: 105 }))).toBe(true);
    expect(
      coastTriangleTouchesCapsule(triangle, capsule({ x: 90, y: 110 }, { x: 125, y: 110 })),
    ).toBe(true);
    expect(
      coastTriangleTouchesCapsule(triangle, capsule({ x: 95, y: 105 }, { x: 95, y: 115 }, 5)),
    ).toBe(true);
    expect(
      coastTriangleTouchesCapsule(triangle, capsule({ x: 94, y: 105 }, { x: 94, y: 115 }, 5)),
    ).toBe(false);
    expect(coastTriangleTouchesCapsule(triangle, capsule({ x: 120, y: 120 }))).toBe(false);
  });
  it('preserves exact boundary confluences locally without freezing both remote endpoint corners', () => {
    const river: CoastCapsule = {
      id: 'mouth',
      a: { x: 200, y: 90 },
      b: { x: 200, y: 170 },
      radius: 2,
    };
    const output = roundConstrainedCoast(square, [river]);
    expect(points(output).some((p) => p.x === 100 && p.y === 100)).toBe(false);
    expect(points(output).some((p) => p.x === 300 && p.y === 100)).toBe(false);
    for (let y = 90; y <= 170; y += 0.5)
      expect(land(output, { x: 200, y })).toBe(land(square, { x: 200, y }));
  });
  it('halves obstructed local rounds while retaining unrelated safe corners', () => {
    const obstacle: CoastCapsule = {
      id: 'local',
      a: { x: 104, y: 104 },
      b: { x: 104, y: 104 },
      radius: 1,
    };
    const output = roundConstrainedCoast(square, [obstacle]);
    expect(points(output).some((p) => p.x === 100 && p.y === 100)).toBe(false);
    expect(land(output, obstacle.a)).toBe(land(square, obstacle.a));
    expect(points(output).some((p) => p.x === 300 && p.y === 300)).toBe(false);
    expect(points(output).some((p) => p.x === 100 && p.y > 100 && p.y < 112)).toBe(true);
  });
  it('fails closed for invalid geometry/protection, normalizes repeats, and enforces point budgets', () => {
    expect(
      roundConstrainedCoast({ polygons: [{ id: 'bad', points: [0, 0, 10, 10, 0, 10, 10, 0] }] }, [])
        .polygons,
    ).toEqual([]);
    expect(
      roundConstrainedCoast({ polygons: [{ id: 'bad', points: [NaN, 0, 10, 10, 0, 10] }] }, [])
        .polygons,
    ).toEqual([]);
    expect(
      roundConstrainedCoast(square, [
        { id: 'bad', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, radius: Infinity },
      ]),
    ).toEqual(square);
    const duplicate = {
      polygons: [
        { id: 'square', points: [100, 100, 100, 100, 300, 100, 300, 300, 100, 300, 100, 100] },
      ],
    };
    expect(roundConstrainedCoast(duplicate, [])).toEqual(roundConstrainedCoast(square, []));
    const ring = (count: number): OutlineGeometry => ({
      polygons: [
        {
          id: 'dense',
          points: Array.from({ length: count }, (_, i) => [
            1000 + 200 * Math.cos((i * 2 * Math.PI) / count),
            1000 + 200 * Math.sin((i * 2 * Math.PI) / count),
          ]).flat(),
        },
      ],
    });
    expect(points(roundConstrainedCoast(ring(350), [])).length).toBeGreaterThan(350);
    const large = ring(700),
      snapshot = JSON.stringify(large);
    const partial = roundConstrainedCoast(large, []);
    expect(points(partial).length).toBeGreaterThan(700);
    expect(points(partial).length).toBeLessThanOrEqual(4096);
    expect(isSimplePolygon(partial.polygons[0]!.points)).toBe(true);
    expect(JSON.stringify(large)).toBe(snapshot);
  });
  it('keeps the national topology, classifications, footprint geometry and immutable cache', () => {
    const g = graph(),
      rivers = buildTerrainPack().rivers;
    const before = JSON.stringify({ outline, roads, castles, districts, rivers });
    const output = buildConstrainedCoast(outline, g, rivers);
    expect(buildConstrainedCoast(outline, g, rivers)).toBe(output);
    expect(Object.isFrozen(output.polygons[0]!.points)).toBe(true);
    expect(points(output).length).toBeGreaterThan(470);
    expect(points(output).length).toBeLessThanOrEqual(CONSTRAINED_COAST.outputPoints);
    for (const poly of output.polygons) {
      expect(isSimplePolygon(poly.points)).toBe(true);
      expect(Math.sign(signedArea(poly.points))).toBe(
        Math.sign(signedArea(outline.polygons.find((p) => p.id === poly.id)!.points)),
      );
    }
    for (let i = 0; i < output.polygons.length; i++)
      for (let j = i + 1; j < output.polygons.length; j++)
        expect(polygonsOverlap(output.polygons[i]!.points, output.polygons[j]!.points)).toBe(false);
    for (const node of g.nodes.values())
      expect(land(output, node.pos)).toBe(land(outline, node.pos));
    const footprints = collectCoastFootprints(g, rivers)!;
    expect(footprints.length).toBeLessThan(3000);
    expect(footprints.filter((c) => c.id.startsWith('node:')).every((c) => c.radius === 0)).toBe(
      true,
    );
    expect(footprints.filter((c) => c.id.startsWith('bridge:')).every((c) => c.radius < 20)).toBe(
      true,
    );
    for (const c of footprints) {
      // Independent finite samples are a regression oracle, not the continuous safety proof.
      const count = Math.max(1, Math.ceil(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) / 4));
      for (let k = 0; k <= count; k++) {
        const p = {
          x: c.a.x + ((c.b.x - c.a.x) * k) / count,
          y: c.a.y + ((c.b.y - c.a.y) * k) / count,
        };
        expect(land(output, p)).toBe(land(outline, p));
      }
    }
    expect(painterDepth).toBe(ROAD_DEPTH_STYLE);
    expect(JSON.stringify({ outline, roads, castles, districts, rivers })).toBe(before);
  });
});
