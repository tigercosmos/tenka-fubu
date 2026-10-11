import { describe, expect, it, vi } from 'vitest';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import type { DistrictId, MapNodeId } from '@core/state/ids';
import { zJapanOutlineFile, type JapanOutlineFile } from '@data/schemas/outline';
import { loadS1560Scenario } from '@data/scenarios/s1560';
import outlineJson from '@data/map/japan-outline.json';
import { MAPVIEW, WORLD_SIZE } from '@ui/map/mapViewConfig';
import { buildTerritoryGrid } from '@ui/map/territoryGrid';

function expectSameCells(actual: Uint16Array, expected: Uint16Array): void {
  expect(actual.length).toBe(expected.length);
  expect(
    Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(
      Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
    ),
  ).toBe(true);
}

interface Seed {
  id: string;
  x: number;
  y: number;
}

function graph(seeds: readonly Seed[]): MapGraph {
  const nodes = new Map<MapNodeId, MapGraphNode>();
  for (const seed of seeds) {
    const id = seed.id as DistrictId;
    nodes.set(id, { id, kind: 'district', pos: { x: seed.x, y: seed.y }, isPort: false });
  }
  return { nodes, edges: new Map(), adjacency: new Map() };
}

function rectangle(x: number, y: number, width: number, height: number): JapanOutlineFile {
  return {
    version: 1,
    source: 'handcrafted',
    polygons: [
      { id: 'rectangle', points: [x, y, x + width, y, x + width, y + height, x, y + height] },
    ],
  };
}

// Independent pre-change oracle: exact old ring/dx/dy/ID traversal, strict
// Math.hypot comparison, clamped seed buckets, and unchanged distance cutoff.
function fullRingOracle(seeds: readonly Seed[], land: JapanOutlineFile): Uint16Array {
  const sorted = [...seeds].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const buckets = Array.from({ length: 32 * 32 }, () => [] as number[]);
  sorted.forEach((seed, index) => {
    const bx = Math.max(0, Math.min(31, Math.floor(seed.x / 128)));
    const by = Math.max(0, Math.min(31, Math.floor(seed.y / 128)));
    buckets[by * 32 + bx]?.push(index);
  });
  const size = MAPVIEW.territoryGridSize;
  const cell = WORLD_SIZE / size;
  const result = new Uint16Array(size * size).fill(0xffff);
  for (let cy = 0; cy < size; cy += 1) {
    const py = (cy + 0.5) * cell;
    const spans: Array<[number, number]> = [];
    for (const polygon of land.polygons) {
      const xs: number[] = [];
      const points = polygon.points;
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + 2) % points.length;
        const xi = points[i] ?? 0,
          yi = points[i + 1] ?? 0;
        const xj = points[j] ?? 0,
          yj = points[j + 1] ?? 0;
        if (yi > py !== yj > py) xs.push(xi + ((py - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i] ?? 0, xs[i + 1] ?? 0]);
    }
    for (let cx = 0; cx < size; cx += 1) {
      const px = (cx + 0.5) * cell;
      if (!spans.some(([left, right]) => px >= left && px < right)) continue;
      let winner = 0xffff,
        distance = Infinity;
      const bx0 = Math.floor(px / 128),
        by0 = Math.floor(py / 128);
      const maxRing = Math.ceil(MAPVIEW.territoryMaxDist / 128) + 1;
      for (let ring = 0; ring <= maxRing; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          const bx = bx0 + dx;
          if (bx < 0 || bx >= 32) continue;
          for (let dy = -ring; dy <= ring; dy += 1) {
            if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
            const by = by0 + dy;
            if (by < 0 || by >= 32) continue;
            for (const index of buckets[by * 32 + bx] ?? []) {
              const seed = sorted[index];
              if (seed === undefined) continue;
              const d = Math.hypot(seed.x - px, seed.y - py);
              if (d < distance) {
                distance = d;
                winner = index;
              }
            }
          }
        }
      }
      if (distance <= MAPVIEW.territoryMaxDist) result[cy * size + cx] = winner;
    }
  }
  return result;
}

describe('territory nearest-bucket pruning', () => {
  it('does not evaluate a farther bucket after a strict geometric bound proves the winner', () => {
    const seeds = [
      { id: 'near', x: 66, y: 66 },
      { id: 'far', x: 194, y: 66 },
    ];
    const spy = vi.spyOn(Math, 'hypot');
    try {
      const result = buildTerritoryGrid(graph(seeds), rectangle(64, 64, 4, 4));
      expect(result.nearestDistrict[16 * result.size + 16]).toBe(
        result.districtIds.indexOf('near'),
      );
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(
    [
      [
        { id: 'a', x: 130, y: 126 },
        { id: 'b', x: 124, y: 126 },
      ],
      [
        { id: 'a', x: 126, y: 130 },
        { id: 'b', x: 130, y: 126 },
        { id: 'c', x: 126, y: 126 },
      ],
      [
        { id: 'a', x: 254, y: 130 },
        { id: 'b', x: 2, y: 130 },
      ],
      [
        { id: 'a', x: -80, y: -50 },
        { id: 'b', x: 4130, y: 4098 },
      ],
      [
        { id: 'a', x: 262, y: 2 },
        { id: 'b', x: 262.00000000000006, y: 2 },
      ],
      [
        { id: 'a', x: 512, y: 512 },
        { id: 'b', x: 768, y: 768 },
      ],
      [],
    ].map((seeds) => ({ seeds })),
  )(
    'preserves the full-ring oracle for boundary, ties, sparse, outside and cutoff seeds %#',
    ({ seeds }) => {
      const land: JapanOutlineFile = {
        version: 1,
        source: 'handcrafted',
        polygons: [
          ...rectangle(0, 0, 320, 320).polygons,
          ...rectangle(3840, 3840, 320, 320).polygons,
          ...rectangle(500, 500, 400, 400).polygons,
        ],
      };
      expectSameCells(
        buildTerritoryGrid(graph(seeds), land).nearestDistrict,
        fullRingOracle(seeds, land),
      );
    },
  );

  it('preserves every national outline cell with all actual s1560 district seeds and no cross-build cache', async () => {
    const bundle = await loadS1560Scenario();
    const outline = zJapanOutlineFile.parse(outlineJson);
    const seeds = bundle.districts.map((district) => ({ id: district.id, ...district.pos }));
    expect(seeds.length).toBeGreaterThan(300);
    const expected = fullRingOracle(seeds, outline);
    expectSameCells(buildTerritoryGrid(graph(seeds), outline).nearestDistrict, expected);
    buildTerritoryGrid(graph([{ id: 'unrelated', x: 66, y: 66 }]), rectangle(64, 64, 4, 4));
    expectSameCells(
      buildTerritoryGrid(graph([...seeds].reverse()), outline).nearestDistrict,
      expected,
    );
  });
});
