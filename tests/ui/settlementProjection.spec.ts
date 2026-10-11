import { afterEach, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { RoadPoint } from '@ui/map/roads/roadGeometry';
import { buildSettlements } from '@ui/map/settlements/settlementsDraw';
import type { SettlementContext } from '@ui/map/settlements/settlementGeometry';

const graph = {
  nodes: new Map([
    ['castle.main', { id: 'castle.main', kind: 'castle', pos: { x: 100, y: 100 } }],
    ['district.end', { id: 'district.end', kind: 'district', pos: { x: 300, y: 100 } }],
  ]),
  edges: new Map([
    [
      'road',
      { id: 'road', a: 'castle.main', b: 'district.end', type: 'land', grade: 3, baseDays: 1 },
    ],
  ]),
  adjacency: new Map([['castle.main', ['road']]]),
} as unknown as MapGraph;
const tiers = { 'castle.main': 'main' } as const;
const context: SettlementContext = {
  land: { polygons: [{ id: 'land', points: [0, 0, 500, 0, 500, 500, 0, 500] }] },
  lakes: [],
  obstacles: [],
};
const project = (p: RoadPoint) => ({ x: p.x - 0.18 * p.y, y: p.y - p.x * 0.05 });
const flat = (points: readonly RoadPoint[]) => points.flatMap((p) => [p.x, p.y]);
afterEach(() => vi.restoreAllMocks());

it('actual producer translates every roof, wall and shadow from ONE canonical ground center', () => {
  const source = buildSettlements(graph, tiers, context);
  const geometry = source.getGeometry();
  source.destroy();
  expect(geometry.houses.length).toBeGreaterThan(0);
  const polys = vi.spyOn(Graphics.prototype, 'poly');
  const callback = vi.fn(project);
  const actual = buildSettlements(graph, tiers, context, callback);
  try {
    const projectedOrder = [...geometry.houses].sort(
      (a, b) => project(a.center).y - project(b.center).y,
    );
    const expected = projectedOrder.flatMap((h) =>
      [h.shadow, ...h.walls, ...h.roofs].map((p) => {
        const scene = project(h.center);
        return flat(
          p.map((v) => ({ x: v.x + (scene.x - h.center.x), y: v.y + (scene.y - h.center.y) })),
        );
      }),
    );
    expect(polys.mock.calls.map((args) => args[0])).toEqual(expected);
    expect(callback).toHaveBeenCalledTimes(geometry.houses.length);
    expect(callback.mock.calls.map(([p]) => p)).toEqual(geometry.houses.map((h) => h.center));
    expect(actual.getGeometry()).toEqual(geometry);
    for (const stage of ['mid', 'near', 'far'] as const) actual.setStage(stage);
    expect(callback).toHaveBeenCalledTimes(geometry.houses.length);
  } finally {
    actual.destroy();
  }
});

it('emits immutable scene geometry while retaining canonical source and intrinsic roof lift', () => {
  const before = structuredClone(graph);
  const actual = buildSettlements(graph, tiers, context, project);
  const source = actual.getGeometry(),
    scene = actual.getSceneGeometry();
  expect(Object.isFrozen(scene)).toBe(true);
  expect(Object.isFrozen(scene.houses)).toBe(true);
  for (const [i, h] of scene.houses.entries()) {
    const original = source.houses[i]!,
      delta = { x: h.center.x - original.center.x, y: h.center.y - original.center.y };
    expect(h.center).toEqual(project(original.center));
    for (const key of ['footprint', 'shadow'] as const) {
      expect(h[key]).toEqual(original[key].map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })));
      expect(Object.isFrozen(h[key][0])).toBe(true);
    }
    for (const key of ['walls', 'roofs'] as const) {
      expect(h[key]).toEqual(
        original[key].map((polygon) =>
          polygon.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
        ),
      );
    }
  }
  const snapshot = JSON.stringify(scene);
  for (const stage of ['far', 'mid', 'near'] as const) actual.setStage(stage);
  expect(actual.getSceneGeometry()).toBe(scene);
  expect(JSON.stringify(scene)).toBe(snapshot);
  expect(graph).toEqual(before);
  actual.destroy();
  actual.destroy();
  expect(actual.getSceneGeometry().houses).toHaveLength(0);
  expect(actual.getDiagnostics().ownedGraphics).toBe(0);
});

it('preserves exact flat context and historical painter instructions without projection', () => {
  const polys = vi.spyOn(Graphics.prototype, 'poly');
  for (const ctx of [undefined, context]) {
    const a = buildSettlements(graph, tiers, ctx),
      before = structuredClone(polys.mock.calls);
    polys.mockClear();
    const b = buildSettlements(graph, tiers, ctx, undefined);
    expect(polys.mock.calls).toEqual(before);
    expect(b.getSceneGeometry()).toEqual(b.getGeometry());
    a.destroy();
    b.destroy();
    polys.mockClear();
  }
});

it('rejects invalid projected anchors before allocating any owned Graphics', () => {
  const polys = vi.spyOn(Graphics.prototype, 'poly');
  expect(() => buildSettlements(graph, tiers, context, () => ({ x: NaN, y: 0 }))).toThrow(
    RangeError,
  );
  expect(polys).not.toHaveBeenCalled();
});
