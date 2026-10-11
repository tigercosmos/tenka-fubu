import { describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { Graphics } from 'pixi.js';
import { createWaterFeatures } from '../../src/ui/map/terrain/terrainDraw';
import { buildTerrainPack } from '../../src/ui/map/terrain/terrainPack';
import {
  buildDisplayLake,
  DISPLAY_LAKE,
  type LakePoint,
} from '../../src/ui/map/terrain/displayLakeGeometry';

const bounds = (ps: readonly LakePoint[]) => ({
  x: Math.min(...ps.map((p) => p.x)),
  y: Math.min(...ps.map((p) => p.y)),
  width: Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)),
  height: Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)),
});
// Independent origin-relative shoelace oracle avoids cancellation at national world coordinates.
function metrics(ps: readonly LakePoint[]) {
  const origin = ps[0]!;
  let twiceArea = 0,
    mx = 0,
    my = 0;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!,
      b = ps[(i + 1) % ps.length]!,
      ax = a.x - origin.x,
      ay = a.y - origin.y,
      bx = b.x - origin.x,
      by = b.y - origin.y;
    const c = ax * by - bx * ay;
    twiceArea += c;
    mx += (ax + bx) * c;
    my += (ay + by) * c;
  }
  return {
    area: twiceArea / 2,
    x: origin.x + mx / (3 * twiceArea),
    y: origin.y + my / (3 * twiceArea),
  };
}
function segmentDistance(p: LakePoint, a: LakePoint, b: LakePoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
const pentagon = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 70, y: 40 },
  { x: 40, y: 70 },
  { x: 0, y: 50 },
];

describe('display-only softened lake banks', () => {
  it('softens every flattened join around real unpinned northern Biwa and Hamana corners', () => {
    const terrain = buildTerrainPack();
    const controls = [
      { id: 'lk.biwa', x: 1774, y: 2775 },
      { id: 'lk.biwa', x: 1784, y: 2775 },
      { id: 'lk.hamana', x: 2130, y: 2951 },
      { id: 'lk.hamana', x: 2145, y: 2971 },
    ];
    for (const control of controls) {
      const lake = terrain.lakes.find((lake) => lake.id === control.id)!;
      const display = buildDisplayLake(lake.polygon, terrain.rivers);
      const turns = display.flatMap((point, index) => {
        if (Math.hypot(point.x - control.x, point.y - control.y) > 4 + 1e-8) return [];
        const a = display[(index + display.length - 1) % display.length]!;
        const b = display[(index + 1) % display.length]!;
        const ax = point.x - a.x,
          ay = point.y - a.y;
        const bx = b.x - point.x,
          by = b.y - point.y;
        return [
          (Math.acos(
            Math.max(
              -1,
              Math.min(1, (ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by)),
            ),
          ) *
            180) /
            Math.PI,
        ];
      });
      expect(turns.length).toBeGreaterThan(0);
      expect(Math.max(...turns)).toBeLessThanOrEqual(35);
    }
  });
  it('emits nontrivial bounded curves for the actual authored lakes, with read-only actual draw geometry', () => {
    const terrain = buildTerrainPack();
    const before = structuredClone(terrain.lakes);
    const poly = vi.spyOn(Graphics.prototype, 'poly');
    const water = createWaterFeatures(terrain.rivers, terrain.lakes);
    try {
      expect(typeof water.getLakeGeometry).toBe('function');
      const geometry = water.getLakeGeometry();
      expect(geometry).toHaveLength(2);
      for (const [index, lake] of terrain.lakes.entries()) {
        const display = geometry[index]!;
        expect(display.id).toBe(lake.id);
        expect(display.points.length).toBeGreaterThan(lake.polygon.length);
        expect(display.originalBounds).toEqual(bounds(lake.polygon));
        for (const point of lake.polygon)
          expect(display.points.some((p) => p.x === point.x && p.y === point.y)).toBe(true);
        const flat = display.points.flatMap((p) => [p.x, p.y]);
        for (let pass = 0; pass < 4; pass++)
          expect(poly.mock.calls[index * 4 + pass]![0]).toEqual(flat);
        expect(Object.isFrozen(display.points)).toBe(true);
        expect(Object.isFrozen(display)).toBe(true);
      }
      expect(terrain.lakes).toEqual(before);
      const count = poly.mock.calls.length;
      water.setStage('far');
      water.setStage('near');
      expect(poly.mock.calls).toHaveLength(count);
    } finally {
      water.destroy();
      poly.mockRestore();
    }
  });
  it('retains exact national lake bounds/centers with real curvature and bounded area/centroid drift in both windings', () => {
    for (const lake of buildTerrainPack().lakes)
      for (const raw of [lake.polygon, [...lake.polygon].reverse()]) {
        const display = buildDisplayLake(raw),
          before = metrics(raw),
          after = metrics(display);
        expect(bounds(display)).toEqual(bounds(raw));
        expect(Math.sign(after.area)).toBe(Math.sign(before.area));
        expect(Math.abs(after.area - before.area)).toBeLessThanOrEqual(
          Math.abs(before.area) * 0.02,
        );
        expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThanOrEqual(0.5);
        const departures = display.map((p) =>
          Math.min(...raw.map((a, i) => segmentDistance(p, a, raw[(i + 1) % raw.length]!))),
        );
        expect(Math.max(...departures)).toBeGreaterThan(0.001);
        expect(Math.max(...departures)).toBeLessThanOrEqual(4);
        expect(display.length).toBeLessThanOrEqual(DISPLAY_LAKE.maxOutputPoints);
        expect(buildDisplayLake(raw)).toEqual(display);
      }
  });
  it('keeps the entire river-connected bank edge consecutive and unchanged', () => {
    const rivers = [
      {
        widthClass: 1 as const,
        points: [
          { x: 20, y: -20 },
          { x: 20, y: 20 },
        ],
      },
    ];
    const before = structuredClone({ pentagon, rivers }),
      display = buildDisplayLake(pentagon, rivers);
    const index = display.findIndex((p) => p.x === 0 && p.y === 0);
    expect(display[(index + 1) % display.length]).toEqual({ x: 60, y: 0 });
    expect(display.length).toBeGreaterThan(pentagon.length);
    expect({ pentagon, rivers }).toEqual(before);
  });
  it('preserves simple concave bays without nonadjacent segment intersections', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 45, y: 80 },
      { x: 45, y: 20 },
      { x: 35, y: 20 },
      { x: 35, y: 80 },
      { x: 0, y: 80 },
    ];
    const display = buildDisplayLake(raw);
    const turn = (a: LakePoint, b: LakePoint, c: LakePoint) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    for (let i = 0; i < display.length; i++)
      for (let j = i + 2; j < display.length; j++) {
        if (i === 0 && j === display.length - 1) continue;
        const a = display[i]!,
          b = display[(i + 1) % display.length]!,
          c = display[j]!,
          d = display[(j + 1) % display.length]!;
        const proper = turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
        expect(proper).toBe(false);
      }
    expect(bounds(display)).toEqual(bounds(raw));
  });
  it('normalizes duplicate/closed inputs but leaves unsafe, degenerate and small rings uncurved', () => {
    const closed = [...pentagon, pentagon[0]!];
    expect(buildDisplayLake(closed)).toEqual(buildDisplayLake(pentagon));
    expect(buildDisplayLake([pentagon[0]!, ...pentagon])).toEqual(buildDisplayLake(pentagon));
    const bow = [
      { x: 0, y: 0 },
      { x: 60, y: 60 },
      { x: 0, y: 60 },
      { x: 60, y: 0 },
      { x: 30, y: 30 },
    ];
    expect(buildDisplayLake(bow)).toEqual(bow);
    const rectangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(buildDisplayLake(rectangle)).toEqual(rectangle);
    expect(buildDisplayLake([{ x: NaN, y: 0 }])).toEqual([]);
    expect(buildDisplayLake([])).toEqual([]);
    expect(buildDisplayLake(Array.from({ length: 129 }, (_, i) => ({ x: i, y: i })))).toEqual([]);
    expect(
      buildDisplayLake(pentagon, [
        {
          points: [
            { x: NaN, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      ]),
    ).toEqual(pentagon);
  });
  it('keeps the explicit 768-point output budget with a genuinely eligible large ring', () => {
    const ring = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.cos((i * 2 * Math.PI) / count) * 100,
        y: Math.sin((i * 2 * Math.PI) / count) * 100,
      }));
    const small = ring(80),
      large = ring(100),
      before = structuredClone(large);
    const rounded = buildDisplayLake(small);
    expect(rounded.length).toBeGreaterThan(small.length);
    expect(rounded.length).toBeLessThanOrEqual(768);
    // Nine points per eligible corner exceed the cap even though input100 < input128.
    expect(buildDisplayLake(large)).toEqual(large);
    expect(large).toEqual(before);
    expect(DISPLAY_LAKE.maxPoints).toBe(128);
    expect(DISPLAY_LAKE.maxOutputPoints).toBe(768);
  });
});
