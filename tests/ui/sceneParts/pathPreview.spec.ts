import { expect, it } from 'vitest';
import type { MapGraph } from '@core/state/mapGraph';
import type { CastleId, RoadEdgeId } from '@core/state/ids';
import { drawPathPreview, pathSegments } from '@ui/map/sceneParts/pathPreview';
import { makeRec } from './recordingGraphics';
import { selectMapStaticModel } from '@core/state/selectors';
import { edgeVisualPolyline, edgePolyline } from '@ui/map/roads/roadGeometry';
import { buildFullState } from '../../helpers/fullState';

const a = 'castle.a' as CastleId,
  b = 'castle.b' as CastleId,
  c = 'castle.c' as CastleId;
const ab = 'road.ab' as RoadEdgeId;
it('actual Sunpu ETA circles follow the approved display curve by independent arc-length interpolation', async () => {
  const game = await buildFullState(),
    before = structuredClone(game);
  const graph = selectMapStaticModel(game).graph;
  const edge = graph.edges.get('road.sunpu-kokokuji-01' as RoadEdgeId)!;
  const points = edgeVisualPolyline(edge, graph)!;
  const immutableBefore = JSON.stringify(points);
  expect(Object.isFrozen(points)).toBe(true);
  expect(points.length).toBeGreaterThan(edgePolyline(edge, graph)!.length);
  const lengths = points
    .slice(1)
    .map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const expected = Array.from({ length: 16 }, (_, index) => {
    let remaining = (total * (index + 1)) / 16;
    for (let leg = 0; leg < lengths.length; leg++) {
      const length = lengths[leg]!;
      if (length > 0 && remaining <= length) {
        const from = points[leg]!,
          to = points[leg + 1]!;
        return [
          from.x + ((to.x - from.x) * remaining) / length,
          from.y + ((to.y - from.y) * remaining) / length,
          2.5,
        ];
      }
      remaining -= length;
    }
    return [points.at(-1)!.x, points.at(-1)!.y, 2.5];
  });
  const { rec, g } = makeRec();
  drawPathPreview(g, {
    graph,
    originNodeId: edge.a,
    targetNodeId: edge.b,
    result: {
      found: true,
      nodes: [edge.a, edge.b],
      edgeIds: [edge.id],
      travelDays: 16,
      subjugateDays: 0,
      totalDays: 16,
      steps: [
        { nodeId: edge.a, etaDays: 0, needsSubjugate: false },
        { nodeId: edge.b, etaDays: 16, needsSubjugate: false },
      ],
    },
  });
  const actual = rec.argsOf('circle');
  expect(actual).toHaveLength(16);
  for (let index = 0; index < expected.length; index++) {
    expect(actual[index]![0]).toBeCloseTo(expected[index]![0]!, 8);
    expect(actual[index]![1]).toBeCloseTo(expected[index]![1]!, 8);
  }
  const reverse = makeRec();
  drawPathPreview(reverse.g, {
    graph,
    originNodeId: edge.b,
    targetNodeId: edge.a,
    result: {
      found: true,
      nodes: [edge.b, edge.a],
      edgeIds: [edge.id],
      travelDays: 16,
      subjugateDays: 0,
      totalDays: 16,
      steps: [
        { nodeId: edge.b, etaDays: 0, needsSubjugate: false },
        { nodeId: edge.a, etaDays: 16, needsSubjugate: false },
      ],
    },
  });
  const reverseCircles = reverse.rec.argsOf('circle');
  expect(reverseCircles).toHaveLength(16);
  for (let index = 0; index < 15; index++) {
    expect(reverseCircles[index]![0]).toBeCloseTo(expected[14 - index]![0]!, 8);
    expect(reverseCircles[index]![1]).toBeCloseTo(expected[14 - index]![1]!, 8);
  }
  expect(reverseCircles[15]).toEqual([points[0]!.x, points[0]!.y, 2.5]);
  expect(JSON.stringify(points)).toBe(immutableBefore);
  expect(game).toEqual(before);
});
function fixture(reverse = false) {
  const graph: MapGraph = {
    nodes: new Map([
      [a, { id: a, kind: 'castle', pos: { x: 0, y: 0 }, isPort: false }],
      [b, { id: b, kind: 'castle', pos: { x: 20, y: 20 }, isPort: false }],
      [c, { id: c, kind: 'castle', pos: { x: 40, y: 40 }, isPort: false }],
    ]),
    edges: new Map([
      [ab, { id: ab, a, b, type: 'land', grade: 1, baseDays: 4, waypoints: [0, 20] }],
    ]),
    adjacency: new Map([
      [a, [ab]],
      [b, [ab]],
      [c, []],
    ]),
  };
  const from = reverse ? b : a,
    to = reverse ? a : b;
  return {
    graph,
    originNodeId: from,
    targetNodeId: to,
    result: {
      found: true,
      nodes: [from, to],
      edgeIds: [ab],
      travelDays: 4,
      subjugateDays: 0,
      totalDays: 4,
      steps: [
        { nodeId: from, etaDays: 0, needsSubjugate: false },
        { nodeId: to, etaDays: 4, needsSubjugate: true },
      ],
    },
  };
}
it('uses authored corners in both directions without mutating graph geometry', () => {
  const props = fixture(),
    before = structuredClone(props.graph);
  expect(pathSegments(props)[0]?.pts).toEqual([
    { x: 0, y: 0 },
    { x: 0, y: 20 },
    { x: 20, y: 20 },
  ]);
  expect(pathSegments(fixture(true))[0]?.pts).toEqual([
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
  ]);
  expect(props.graph).toEqual(before);
});
it('places ETA markers and hostile cross by arc length, dashes continuously through corners, arrow on terminal tangent', () => {
  const { rec, g } = makeRec();
  drawPathPreview(g, fixture());
  expect(rec.argsOf('circle')).toEqual([
    [0, 10, 2.5],
    [0, 20, 2.5],
    [10, 20, 2.5],
    [20, 20, 2.5],
  ]);
  expect(rec.argsOf('lineTo')).toContainEqual([2, 20]); // dash14..22 crosses corner20; not restarted
  expect(rec.argsOf('moveTo')).toContainEqual([-4, 16]); // midpoint cross at authored corner
  const arrow = rec.argsOf('poly')[0]![0] as number[];
  expect(arrow[2]).toBeCloseTo(20 - Math.cos(Math.PI / 6) * 10);
  expect(arrow[3]).toBeCloseTo(25);
});
it('keeps reachable authored segments and adds only a direct unreachable terminal connector', () => {
  const props = fixture();
  const segments = pathSegments({ ...props, targetNodeId: c, unreachable: true });
  expect(segments[0]).toMatchObject({
    unreachable: false,
    pts: [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 20, y: 20 },
    ],
  });
  expect(segments[1]).toMatchObject({
    unreachable: true,
    pts: [
      { x: 20, y: 20 },
      { x: 40, y: 40 },
    ],
  });
  expect(pathSegments({ ...props, unreachable: true })[0]?.pts).toEqual(
    pathSegments(props)[0]?.pts,
  );
});

it('uses the path result edge rather than the first parallel adjacency edge and keeps sea dash phase', () => {
  const props = fixture();
  const alternate = 'road.alternate' as RoadEdgeId;
  const graph: MapGraph = {
    ...props.graph,
    edges: new Map([
      ...props.graph.edges,
      [alternate, { id: alternate, a, b, type: 'sea', grade: 1, baseDays: 4, waypoints: [20, 0] }],
    ]),
    adjacency: new Map([
      [a, [ab, alternate]],
      [b, [ab, alternate]],
      [c, []],
    ]),
  };
  const preview = { ...props, graph, result: { ...props.result, edgeIds: [alternate] } };
  expect(pathSegments(preview)[0]).toMatchObject({
    kind: 'sea',
    pts: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ],
  });
  const { rec, g } = makeRec();
  drawPathPreview(g, preview);
  expect(rec.argsOf('lineTo')).toContainEqual([18, 0]);
  expect(rec.argsOf('moveTo')).toContainEqual([20, 4]);
});

it('keeps straight-road fallback and duplicate zero-length waypoints finite without changing ETA', () => {
  const props = fixture();
  const edge = props.graph.edges.get(ab)!;
  const graph: MapGraph = {
    ...props.graph,
    edges: new Map([[ab, { ...edge, waypoints: [0, 0, 0, 20, 0, 20, 20, 20] }]]),
  };
  const { rec, g } = makeRec();
  drawPathPreview(g, { ...props, graph });
  expect(rec.argsOf('circle')).toEqual([
    [0, 10, 2.5],
    [0, 20, 2.5],
    [10, 20, 2.5],
    [20, 20, 2.5],
  ]);
  for (const method of ['moveTo', 'lineTo', 'circle'])
    expect(
      rec
        .argsOf(method)
        .flat()
        .every((value) => typeof value !== 'number' || Number.isFinite(value)),
    ).toBe(true);
  const straight = {
    id: edge.id,
    a: edge.a,
    b: edge.b,
    type: edge.type,
    grade: edge.grade,
    baseDays: edge.baseDays,
  };
  expect(
    pathSegments({ ...props, graph: { ...props.graph, edges: new Map([[ab, straight]]) } })[0]?.pts,
  ).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 20 },
  ]);
});

it('matches independent globally indexed dash intervals on fractional legs without truncating any leg', () => {
  const props = fixture();
  const edge = props.graph.edges.get(ab)!;
  const waypoints = [1, 7, 8, 20, 308, 37, -33, 111];
  const graph: MapGraph = { ...props.graph, edges: new Map([[ab, { ...edge, waypoints }]]) };
  const preview = {
    ...props,
    graph,
    result: {
      ...props.result,
      steps: props.result.steps.map((step) => ({ ...step, needsSubjugate: false })),
    },
  };
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 7 },
    { x: 8, y: 20 },
    { x: 308, y: 37 },
    { x: -33, y: 111 },
    { x: 20, y: 20 },
  ];
  const expected: number[][] = [];
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!,
      to = points[i]!;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      length = Math.hypot(dx, dy);
    // Independent integer dash index; no incremental phase/modulo or production sampler.
    for (let dashIndex = 0; dashIndex * 14 < start + length; dashIndex++) {
      const lo = Math.max(start, dashIndex * 14),
        hi = Math.min(start + length, dashIndex * 14 + 8);
      if (hi - lo <= 1e-9) continue;
      expected.push([
        from.x + (dx * (lo - start)) / length,
        from.y + (dy * (lo - start)) / length,
        from.x + (dx * (hi - start)) / length,
        from.y + (dy * (hi - start)) / length,
      ]);
    }
    start += length;
  }
  const { rec, g } = makeRec();
  drawPathPreview(g, preview);
  const moves = rec.argsOf('moveTo') as number[][],
    lines = rec.argsOf('lineTo') as number[][];
  const actual = moves
    .map((from, i) => [...from, ...lines[i]!])
    .filter(([x, y, endX, endY]) => Math.hypot(endX! - x!, endY! - y!) > 1e-9);
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++)
    for (let coordinate = 0; coordinate < 4; coordinate++)
      expect(actual[i]![coordinate]).toBeCloseTo(expected[i]![coordinate]!, 8);
});

it('ignores a stale recorded edge that does not connect the current segment endpoints', () => {
  const props = fixture();
  const stale = 'road.stale' as RoadEdgeId;
  const graph: MapGraph = {
    ...props.graph,
    edges: new Map([
      ...props.graph.edges,
      [stale, { id: stale, a: b, b: c, type: 'sea', grade: 1, baseDays: 1, waypoints: [40, 20] }],
    ]),
  };
  const segment = pathSegments({
    ...props,
    graph,
    result: { ...props.result, edgeIds: [stale] },
  })[0];
  expect(segment).toMatchObject({
    kind: 'hostile',
    pts: [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 20, y: 20 },
    ],
  });
});
