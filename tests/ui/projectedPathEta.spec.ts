import { expect, it, vi } from 'vitest';
import type { MapGraph } from '@core/state/mapGraph';
import type { RoadPoint } from '@ui/map/roads/roadGeometry';
import { drawPathPreview, type PathPreviewProps } from '@ui/map/sceneParts/pathPreview';
import { makeRec } from './sceneParts/recordingGraphics';

const graph = {
  nodes: new Map([
    ['a', { id: 'a', kind: 'castle', pos: { x: 0, y: 0 } }],
    ['b', { id: 'b', kind: 'castle', pos: { x: 32, y: 0 } }],
  ]),
  edges: new Map([['road', { id: 'road', a: 'a', b: 'b', type: 'land', grade: 1, baseDays: 4 }]]),
  adjacency: new Map([
    ['a', ['road']],
    ['b', ['road']],
  ]),
} as unknown as MapGraph;
function props(reverse = false): PathPreviewProps {
  const edge = [...graph.edges.values()][0]!;
  const from = reverse ? edge.b : edge.a,
    to = reverse ? edge.a : edge.b;
  return {
    graph,
    originNodeId: from,
    targetNodeId: to,
    result: {
      found: true,
      nodes: [from, to],
      edgeIds: [edge.id],
      travelDays: 4,
      subjugateDays: 0,
      totalDays: 4,
      steps: [
        { nodeId: from, etaDays: 0, needsSubjugate: false },
        { nodeId: to, etaDays: 4, needsSubjugate: false },
      ],
    },
  };
}
const project = (p: RoadPoint) => ({ x: p.x, y: -(p.x * p.x) / 32 });

it('places actual ETA circles at canonical day progress, not warped scene arclength', () => {
  const { rec, g } = makeRec();
  const before = structuredClone(graph);
  drawPathPreview(g, props(), project);
  expect(rec.argsOf('circle')).toEqual([8, 16, 24, 32].map((x) => [x, -(x * x) / 32, 2.5]));
  expect(graph).toEqual(before);
});

it('reverses the original canonical samples and reuses the same cached projection for ETA', () => {
  const callback = vi.fn(project);
  const forward = makeRec(),
    reverse = makeRec();
  drawPathPreview(forward.g, props(), callback);
  const calls = callback.mock.calls.length;
  drawPathPreview(reverse.g, props(true), callback);
  expect(callback).toHaveBeenCalledTimes(calls);
  expect(reverse.rec.argsOf('circle')).toEqual([24, 16, 8, 0].map((x) => [x, -(x * x) / 32, 2.5]));
});

it('retains exact original flat ETA instructions with no projection callback', () => {
  const { rec, g } = makeRec();
  drawPathPreview(g, props());
  expect(rec.argsOf('circle')).toEqual([8, 16, 24, 32].map((x) => [x, 0, 2.5]));
});

it('interpolates the emitted segment between stations without extra projection samples', () => {
  const callback = vi.fn(project);
  const { rec, g } = makeRec();
  const value = props();
  const final = value.result.steps[1]!;
  drawPathPreview(
    g,
    {
      ...value,
      result: { ...value.result, steps: [value.result.steps[0]!, { ...final, etaDays: 3 }] },
    },
    callback,
  );
  const circles = rec.argsOf('circle');
  // x=32/3 lies one third along emitted (8,-2)->(16,-8),
  // not on a newly evaluated parabola and not at scene-length 1/3.
  expect(circles[0]![0]).toBeCloseTo(32 / 3, 12);
  expect(circles[0]![1]).toBeCloseTo(-4, 12);
  expect(circles[1]![0]).toBeCloseTo(64 / 3, 12);
  expect(circles[1]![1]).toBeCloseTo(-44 / 3, 12);
  expect(callback).toHaveBeenCalledTimes(5);
});
