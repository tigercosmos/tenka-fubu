import { describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import {
  createTerrainProtectedCells,
  type TerrainProtectedCellInput,
  type TerrainProtectedCellDiagnostics,
} from '../../src/ui/map/terrain/terrainProtectedCells';
import { buildTerrainPack } from '../../src/ui/map/terrain/terrainPack';
import { createWaterFeatures } from '../../src/ui/map/terrain/terrainDraw';
import { buildDisplayCoast } from '../../src/ui/map/displayCoast';
import outline from '../../src/data/map/japan-outline.json';
import castles from '../../src/data/scenarios/s1560/castles.json';
import districts from '../../src/data/scenarios/s1560/districts.json';
import roads from '../../src/data/scenarios/s1560/roads.json';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '../../src/core/state/ids';
import { collectRiverBridgeFootprints } from '../../src/ui/map/constrainedCoast';
import { collectRiverDisplayConstraints } from '../../src/ui/map/terrain/riverDisplayConstraints';

const point = (x: number, y: number) => ({ x, y });
const square = (left: number, top: number, right: number, bottom: number) => [
  point(left, top),
  point(right, top),
  point(right, bottom),
  point(left, bottom),
];
const input = (overrides: Partial<TerrainProtectedCellInput> = {}): TerrainProtectedCellInput => ({
  worldSize: 200,
  cells: 2,
  landPolygons: [square(-10, -10, 210, 210)],
  waterGeometry: { lakes: [], rivers: [] },
  ...overrides,
});

describe('whole-cell actual display land and water protection', () => {
  it('admits completely inland cells and preserves independent row-major ownership', () => {
    expect([...createTerrainProtectedCells(input())]).toEqual([0, 0, 0, 0]);
    expect([
      ...createTerrainProtectedCells(input({ landPolygons: [square(-10, -10, 110, 210)] })),
    ]).toEqual([0, 1, 0, 1]);
  });
  it('protects a concave coast crossing even when every cell corner is land', () => {
    const land = [
      point(-10, -10),
      point(210, -10),
      point(210, 210),
      point(60, 210),
      point(60, 40),
      point(40, 40),
      point(40, 210),
      point(-10, 210),
    ];
    expect(createTerrainProtectedCells(input({ landPolygons: [land] }))[0]).toBe(1);
    expect(createTerrainProtectedCells(input({ landPolygons: [land] }))[1]).toBe(0);
  });
  it('does not admit a cell merely by unioning separate land polygons', () => {
    expect(
      createTerrainProtectedCells(
        input({ landPolygons: [square(-10, -10, 50, 210), square(50, -10, 210, 210)] }),
      )[0],
    ).toBe(1);
  });
  it('protects enclosed tiny lakes and cells enclosed by large lakes, including tangency', () => {
    for (const lake of [
      square(49, 49, 51, 51),
      square(-5, -5, 105, 105),
      square(100, 20, 102, 22),
    ]) {
      const result = createTerrainProtectedCells(
        input({ waterGeometry: { lakes: [{ points: lake }], rivers: [] } }),
      );
      expect(result[0]).toBe(1);
    }
  });
  it('protects a capsule crossing or wholly inside the cell while all cell corners are outside', () => {
    for (const [a, b] of [
      [point(-20, 50), point(120, 50)],
      [point(45, 50), point(55, 50)],
    ]) {
      const result = createTerrainProtectedCells(
        input({
          waterGeometry: { lakes: [], rivers: [{ displaySegments: [{ a: a!, b: b!, width: 1 }] }] },
        }),
      );
      expect(result[0]).toBe(1);
      expect(result[3]).toBe(0);
    }
  });
  it('uses full width/2 plus literal all-scale 2CSS AA support and closed tangencies', () => {
    const make = (x: number) =>
      createTerrainProtectedCells(
        input({
          waterGeometry: {
            lakes: [],
            rivers: [
              {
                displaySegments: [{ a: point(x, 50), b: point(x, 50), width: 2 * (25 - 2 / 0.15) }],
              },
            ],
          },
        }),
      );
    expect(make(125)[0]).toBe(1); // exact bank+AA tangency at x100
    expect(make(125.001)[0]).toBe(0);
  });
  it('consumes emitted segments, not an optional authored chord field', () => {
    const river = {
      segments: [{ a: point(140, 140), b: point(180, 180), width: 1 }],
      displaySegments: [{ a: point(45, 50), b: point(55, 50), width: 1 }],
    };
    expect(
      createTerrainProtectedCells(input({ waterGeometry: { lakes: [], rivers: [river] } }))[0],
    ).toBe(1);
  });
  it('protects actual lake-outline miter and AA support outside the fill polygon', () => {
    const support = 2 / 0.15 + (0.45 / 2) * 10;
    const make = (offset: number) =>
      createTerrainProtectedCells(
        input({
          waterGeometry: {
            lakes: [{ points: square(100 + support + offset, 40, 110 + support + offset, 60) }],
            rivers: [],
          },
        }),
      );
    expect(make(0)[0]).toBe(1);
    expect(make(0.001)[0]).toBe(0);
  });
  it('returns all protected with explicit work-exhaustion diagnostics, never a partially admitted grid', () => {
    const ring = Array.from({ length: 4096 }, (_, i) =>
      point(
        100 + 300 * Math.cos((i * 2 * Math.PI) / 4096),
        100 + 300 * Math.sin((i * 2 * Math.PI) / 4096),
      ),
    );
    let diagnostics: TerrainProtectedCellDiagnostics | undefined;
    const mask = createTerrainProtectedCells(
      input({
        cells: 256,
        landPolygons: [ring, ring, ring, ring],
        onDiagnostics: (value) => {
          diagnostics = value;
        },
      }),
    );
    expect(mask.every((value) => value === 1)).toBe(true);
    expect(diagnostics).toMatchObject({
      status: 'workLimit',
      failClosed: true,
      unprotectedCount: 0,
      work: 64_000_001,
    });
  });
  it('fails closed for invalid rings, nonfinite widths and excessive geometry, with truthful diagnostics', () => {
    const cases: TerrainProtectedCellInput[] = [
      input({
        waterGeometry: {
          lakes: [],
          rivers: [null as unknown as TerrainProtectedCellInput['waterGeometry']['rivers'][number]],
        },
      }),
      input({ landPolygons: [[point(0, 0), point(100, 100), point(0, 100), point(100, 0)]] }),
      input({ landPolygons: [[point(NaN, 0), point(100, 0), point(100, 100)]] }),
      input({
        waterGeometry: {
          lakes: [],
          rivers: [{ displaySegments: [{ a: point(50, 50), b: point(60, 50), width: Infinity }] }],
        },
      }),
      input({ landPolygons: Array.from({ length: 129 }, () => square(-10, -10, 210, 210)) }),
    ];
    for (const sample of cases) {
      let diagnostics: TerrainProtectedCellDiagnostics | undefined;
      expect([
        ...createTerrainProtectedCells({
          ...sample,
          onDiagnostics: (value) => {
            diagnostics = value;
          },
        }),
      ]).toEqual([1, 1, 1, 1]);
      expect(diagnostics).toMatchObject({
        status: 'invalidGeometry',
        failClosed: true,
        protectedCount: 4,
        unprotectedCount: 0,
      });
    }
  });
  it('rejects invalid grid bounds before allocating and treats empty land as no eligible terrain', () => {
    for (const overrides of [{ cells: 0 }, { cells: 257 }, { worldSize: Infinity }])
      expect(() => createTerrainProtectedCells(input(overrides))).toThrow(RangeError);
    expect([...createTerrainProtectedCells(input({ landPolygons: [] }))]).toEqual([1, 1, 1, 1]);
  });
  it('is deterministic without modifying input geometry, and returns independent buffers', () => {
    const data = input({
      waterGeometry: { lakes: [{ points: square(30, 30, 40, 40) }], rivers: [] },
    });
    const before = JSON.stringify(data);
    const first = createTerrainProtectedCells(data),
      second = createTerrainProtectedCells(data);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    first.fill(0);
    expect(second[0]).toBe(1);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('retains nonvacuous national inland eligibility using actual emitted water geometry', () => {
    const terrain = buildTerrainPack();
    const graph = buildMapGraph(
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
    const coast = buildDisplayCoast(outline, graph, terrain.rivers);
    const landPolygons = coast.polygons.map((polygon) =>
      Array.from({ length: polygon.points.length / 2 }, (_, i) =>
        point(polygon.points[2 * i]!, polygon.points[2 * i + 1]!),
      ),
    );
    const water = createWaterFeatures(
      terrain.rivers,
      terrain.lakes,
      collectRiverBridgeFootprints(graph),
      collectRiverDisplayConstraints(graph, coast),
    );
    try {
      const waterGeometry = {
        lakes: water.getLakeGeometry(),
        rivers: water.getRiverMaterialDiagnostics().rivers,
      };
      const before = JSON.stringify({ landPolygons, waterGeometry });
      let diagnostics: TerrainProtectedCellDiagnostics | undefined;
      const mask = createTerrainProtectedCells({
        worldSize: 4096,
        cells: 128,
        landPolygons,
        waterGeometry,
        onDiagnostics: (value) => {
          diagnostics = value;
        },
      });
      expect(mask.length).toBe(128 * 128);
      expect(diagnostics).toMatchObject({ status: 'ok', failClosed: false });
      expect(diagnostics!.unprotectedCount).toBeGreaterThan(0);
      expect(diagnostics!.protectedCount).toBeGreaterThan(0);
      expect(mask).toEqual(
        createTerrainProtectedCells({ worldSize: 4096, cells: 128, landPolygons, waterGeometry }),
      );
      expect(JSON.stringify({ landPolygons, waterGeometry })).toBe(before);
      // Actual authored mountain center cells—not just empty sea—remain eligible.
      const elevatedEligible = (terrain.mountains ?? []).filter((mountain) =>
        mountain.ridges.some((ridge) =>
          ridge.some((p) => mask[Math.floor(p.y / 32) * 128 + Math.floor(p.x / 32)] === 0),
        ),
      );
      expect(elevatedEligible.length).toBeGreaterThan(0);
      console.info(
        'national protected-cell evidence',
        JSON.stringify({ ...diagnostics, elevatedEligible: elevatedEligible.map((m) => m.id) }),
      );
    } finally {
      water.destroy();
    }
  });
});
