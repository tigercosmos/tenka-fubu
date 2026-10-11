import { describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import {
  buildReliefFaces,
  buildForestCanopies,
  createDimensionalTerrain,
  terrainFaceColor,
} from './terrainDraw';
import { TERRAIN_RELIEF, TERRAIN_GROUND_COLOR, MAPVIEW } from '../mapViewConfig';
import { buildTerrainPack } from './terrainPack';

describe('static oblique atlas relief', () => {
  it('matches flat/zero-height ground and introduces rock gradually only on elevated slopes', () => {
    const flat = { points: [], shade: 'hill' as const, elevation: 0, slope: 0, illumination: 0.8 };
    expect(terrainFaceColor(flat)).toBe(TERRAIN_GROUND_COLOR);
    expect(MAPVIEW.colors.land).toBe(TERRAIN_GROUND_COLOR);
    expect(terrainFaceColor({ ...flat, elevation: 1 })).toBe(TERRAIN_GROUND_COLOR);
    expect(terrainFaceColor({ ...flat, slope: 1 })).toBe(TERRAIN_GROUND_COLOR);
    expect(terrainFaceColor({ ...flat, elevation: 0.1, slope: 0.1 })).not.toBe(
      terrainFaceColor({ ...flat, elevation: 1, slope: 1 }),
    );
  });

  it('samples continuous field normals independently of the ear-clipped face orientation', () => {
    const terrain = {
      reliefAssetId: '',
      forestAssetId: '',
      rivers: [],
      lakes: [],
      mountains: [
        {
          id: 'hill',
          tier: 3 as const,
          mass: [
            { x: 0, y: 0 },
            { x: 160, y: 0 },
            { x: 160, y: 160 },
            { x: 0, y: 160 },
          ],
          ridges: [],
        },
      ],
    };
    const height = (x: number, y: number): number => {
      if (x <= 0 || y <= 0 || x >= 160 || y >= 160) return 0;
      const t = Math.min(1, Math.min(x, y, 160 - x, 160 - y) / TERRAIN_RELIEF.hillEdgeFade);
      return TERRAIN_RELIEF.mountainHeight[3] * t * t * (3 - 2 * t) * (0.15 + 0.85 * 0.65);
    };
    for (const face of buildReliefFaces(terrain)) {
      const points = face.ground!;
      const x = points.reduce((sum, p) => sum + p.x, 0) / 3;
      const y = points.reduce((sum, p) => sum + p.y, 0) / 3;
      const e = TERRAIN_RELIEF.hillNormalSample;
      const dx = (height(x + e, y) - height(x - e, y)) / (2 * e);
      const dy = (height(x, y + e) - height(x, y - e)) / (2 * e);
      expect(face.slope).toBeCloseTo(Math.hypot(dx, dy), 10);
      expect(face.illumination).toBeCloseTo(
        Math.max(0.25, Math.min(1, (0.45 * dx + 0.55 * dy + 0.8) / Math.hypot(dx, dy, 1))),
        10,
      );
    }
  });

  it('creates continuous sloped heights with zero-height edges and graded northwest lighting', () => {
    const terrain = {
      reliefAssetId: '',
      forestAssetId: '',
      rivers: [],
      lakes: [],
      mountains: [
        {
          id: 'mountain',
          tier: 3 as const,
          mass: [
            { x: 0, y: 0 },
            { x: 80, y: 0 },
            { x: 80, y: 80 },
            { x: 0, y: 80 },
          ],
          ridges: [
            [
              { x: 20, y: 20 },
              { x: 60, y: 60 },
            ],
          ],
        },
      ],
      forests: [
        {
          id: 'forest',
          polygon: [
            { x: 90, y: 90 },
            { x: 120, y: 90 },
            { x: 120, y: 120 },
          ],
        },
      ],
    };
    const original = structuredClone(terrain);
    const faces = buildReliefFaces(terrain);
    expect(terrain).toEqual(original);
    expect(buildReliefFaces(terrain)).toEqual(faces);
    const shared = new Map<string, number>();
    for (const face of faces) {
      expect(face.ground).toBeDefined();
      face.ground!.forEach((p, i) => {
        const height = face.heights![i]!;
        const key = `${p.x},${p.y}`;
        if (shared.has(key)) expect(height).toBe(shared.get(key));
        shared.set(key, height);
        if (p.x === 0 || p.x === 80 || p.y === 0 || p.y === 80) expect(height).toBe(0);
        expect(height).toBeLessThanOrEqual(TERRAIN_RELIEF.mountainHeight[3]);
        expect(face.points[i]).toEqual({
          x: p.x + height * TERRAIN_RELIEF.projectionX,
          y: p.y - height,
        });
      });
    }
    expect(Math.max(...shared.values())).toBeGreaterThan(20);
    expect(new Set(faces.map((face) => face.illumination)).size).toBeGreaterThan(4);
    expect(faces.every((face) => face.points.length === 3)).toBe(true);
  });

  it('clips complete canopy projections inside authored patches with deterministic count caps', () => {
    const terrain = {
      reliefAssetId: '',
      forestAssetId: '',
      rivers: [],
      lakes: [],
      forests: Array.from({ length: 30 }, (_, i) => ({
        id: `forest.${String(i).padStart(2, '0')}`,
        polygon: [
          { x: 0, y: 0 },
          { x: 4096, y: 0 },
          { x: 4096, y: 4096 },
          { x: 0, y: 4096 },
        ],
      })),
    };
    const clusters = buildForestCanopies(terrain);
    expect(clusters).toHaveLength(TERRAIN_RELIEF.canopyTotal);
    expect(buildForestCanopies(terrain)).toEqual(clusters);
    const counts = new Map<string, number>();
    for (const cluster of clusters) {
      counts.set(cluster.forestId, (counts.get(cluster.forestId) ?? 0) + 1);
      const clearance = cluster.height + cluster.radius;
      expect(cluster.center.x).toBeGreaterThanOrEqual(clearance);
      expect(cluster.center.y).toBeGreaterThanOrEqual(clearance);
      expect(cluster.center.x).toBeLessThanOrEqual(4096 - clearance);
      expect(cluster.center.y).toBeLessThanOrEqual(4096 - clearance);
    }
    expect(Math.max(...counts.values())).toBe(TERRAIN_RELIEF.canopyPerPatch);
    const faces = buildReliefFaces(terrain);
    const canopyFaces = faces.slice(-clusters.length * 4);
    expect(
      canopyFaces.every((face) => face.shade === 'forestLight' || face.shade === 'forestDark'),
    ).toBe(true);
    expect(
      canopyFaces.every((face) =>
        face.points.every((p) => p.x >= 0 && p.y >= 0 && p.x <= 4096 && p.y <= 4096),
      ),
    ).toBe(true);
    const runtime = createDimensionalTerrain(terrain);
    expect(runtime.children).toHaveLength(1);
    runtime.destroy({ children: true });
  });

  it('rejects canopy candidates in concave gaps and narrow edge strips', () => {
    const terrain = {
      reliefAssetId: '',
      forestAssetId: '',
      rivers: [],
      lakes: [],
      forests: [
        {
          id: 'concave',
          polygon: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 200 },
            { x: 120, y: 200 },
            { x: 120, y: 80 },
            { x: 80, y: 80 },
            { x: 80, y: 200 },
            { x: 0, y: 200 },
          ],
        },
      ],
    };
    const clusters = buildForestCanopies(terrain);
    expect(clusters.length).toBeGreaterThan(0);
    for (const cluster of clusters) {
      expect(cluster.center.x < 80 || cluster.center.x > 120 || cluster.center.y < 80).toBe(true);
    }
    const canopyFaces = buildReliefFaces(terrain).slice(-clusters.length * 4);
    for (const face of canopyFaces) {
      for (const p of face.points) {
        expect(p.x >= 0 && p.x <= 200 && p.y >= 0 && p.y <= 200).toBe(true);
        expect(p.x < 80 || p.x > 120 || p.y < 80).toBe(true);
      }
    }
  });

  it('uses production mountain/forest contours with finite bounded static geometry', () => {
    const faces = buildReliefFaces(buildTerrainPack());
    expect(faces.length).toBeGreaterThan(100);
    expect(faces.length).toBeLessThanOrEqual(
      TERRAIN_RELIEF.hillFacesTotal + TERRAIN_RELIEF.canopyTotal * 4,
    );
    for (const face of faces) {
      expect(face.points.length).toBeGreaterThanOrEqual(3);
      expect(face.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    }
  });
});
