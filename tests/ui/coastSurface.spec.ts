import { describe, expect, it, vi } from 'vitest';
import { Container, MeshGeometry } from 'pixi.js';
import {
  buildCoastProfile,
  coastProfilePixels,
  createCoastSurface,
  COAST_SURFACE,
} from '@ui/map/terrain/coastSurface';
import outlineData from '@data/map/japan-outline.json';
import { buildDisplayCoast } from '@ui/map/displayCoast';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
const outline = { polygons: [{ id: 'island', points: [0, 0, 100, 0, 100, 60, 0, 60] }] };
describe('bounded display-only coastal bank and shelf', () => {
  it('builds separate actual seaward and landward profile geometry for a valid coast', () => {
    const profile = buildCoastProfile(outline);
    expect(profile).not.toBeNull();
    expect(profile!.sea.positions.length).toBeGreaterThan(0);
    expect(profile!.land.positions.length).toBeGreaterThan(0);
    expect(profile!.inputVertices).toBe(4);
  });
  it('keeps shoreline anchors, offsets the two sides correctly, and does not mutate input', () => {
    const before = JSON.stringify(outline);
    const result = buildCoastProfile(outline)!;
    expect(Array.from(result.sea.positions.slice(0, 8))).toEqual([0, 0, 100, 0, 0, -12, 100, -12]);
    expect(result.land.positions[5]).toBeGreaterThan(0);
    expect(result.land.positions[5]).toBeLessThanOrEqual(3);
    expect(JSON.stringify(outline)).toBe(before);
    const reversed = { polygons: [{ id: 'reverse', points: [0, 60, 100, 60, 100, 0, 0, 0] }] };
    const bounds = (p: Float32Array) => ({
      minX: Math.min(...p.filter((_, i) => i % 2 === 0)),
      maxX: Math.max(...p.filter((_, i) => i % 2 === 0)),
      minY: Math.min(...p.filter((_, i) => i % 2 === 1)),
      maxY: Math.max(...p.filter((_, i) => i % 2 === 1)),
    });
    const other = buildCoastProfile(reversed)!;
    expect(bounds(other.sea.positions)).toEqual(bounds(result.sea.positions));
    expect(bounds(other.land.positions)).toEqual(bounds(result.land.positions));
  });
  it('bevels convex and concave corners without unbounded miters or invalid indices', () => {
    const points = [100, 100, 300, 100, 300, 200, 201, 200, 200, 101, 199, 200, 100, 200];
    const result = buildCoastProfile({ polygons: [{ id: 'inlet', points }] })!;
    expect(result).not.toBeNull();
    for (const [ribbon, width] of [
      [result.sea, 12],
      [result.land, 3],
    ] as const) {
      for (let i = 0; i < ribbon.positions.length; i += 2) {
        const x = ribbon.positions[i]!,
          y = ribbon.positions[i + 1]!;
        let distance = Infinity;
        for (let j = 0; j < points.length; j += 2)
          distance = Math.min(distance, Math.hypot(x - points[j]!, y - points[j + 1]!));
        expect(distance).toBeLessThanOrEqual(width + 0.00002);
      }
      expect(Array.from(ribbon.uvs).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(
        true,
      );
      expect(Array.from(ribbon.indices).every((v) => v < ribbon.positions.length / 2)).toBe(true);
      expect(ribbon.positions.length / 2).toBeLessThanOrEqual((points.length / 2) * 7);
      expect(ribbon.indices.length).toBeLessThanOrEqual((points.length / 2) * 9);
    }
  });
  it('fails closed for invalid topology, oversized inputs and unsupported nested islands', () => {
    const bad = [
      [],
      [0, 0, 10],
      [0, 0, NaN, 10, 10, 0],
      [0, 0, 10, 0, 20, 0],
      [0, 0, 10, 10, 0, 10, 10, 0],
      [-1, 0, 10, 0, 10, 10],
      [0, 0, 4097, 0, 0, 10],
      [0, 0, 10, 0, 5, 0, 5, 10, 0, 10],
      Array.from({ length: 4097 * 2 }, (_, i) => i % 2),
    ];
    for (const points of bad)
      expect(createCoastSurface({ polygons: [{ id: 'invalid', points }] })).toBeNull();
    expect(buildCoastProfile({ polygons: [] })).toBeNull();
    expect(buildCoastProfile({ polygons: [...outline.polygons, ...outline.polygons] })).toBeNull();
    expect(
      buildCoastProfile({
        polygons: [...outline.polygons, { id: 'nested', points: [20, 20, 30, 20, 30, 30, 20, 30] }],
      }),
    ).toBeNull();
  });
  it('allocates one 2048-byte atlas with transparent outer edges and directional rows', () => {
    const pixels = coastProfilePixels();
    expect(pixels.byteLength).toBe(2048);
    for (let row = 0; row < 4; row++) {
      expect(pixels[(row * 128 + 127) * 4 + 3]).toBe(0);
      expect(pixels[row * 128 * 4 + 3]).toBeGreaterThan(0);
    }
    expect(pixels[0]).toBeGreaterThan(pixels[128 * 4]!);
    expect(pixels[256 * 4]).toBeGreaterThan(pixels[384 * 4]!);
    expect(pixels.slice(0, 4)).not.toEqual(pixels.slice(256 * 4, 256 * 4 + 4));
  });
  it('uses muted non-emissive bank tones and a restrained shallow-water profile', () => {
    const pixels = coastProfilePixels();
    const land = [16, 8, 0].map((shift) => (MAP_PALETTE_NUM.landBase >> shift) & 255);
    let bankIsMuted = true,
      alphaIsBounded = true,
      stepsAreContinuous = true;
    for (let row = 0; row < 4; row++)
      for (let x = 0; x < 128; x++) {
        const p = (row * 128 + x) * 4;
        if (row >= 2)
          for (let c = 0; c < 3; c++) if (pixels[p + c]! > land[c]! - 20) bankIsMuted = false;
        if (pixels[p + 3]! > Math.round(255 * (row < 2 ? 0.32 : 0.42))) alphaIsBounded = false;
        if (x > 0)
          for (let c = 0; c < 4; c++)
            if (Math.abs(pixels[p + c]! - pixels[p - 4 + c]!) > 8) stepsAreContinuous = false;
      }
    expect(bankIsMuted).toBe(true);
    expect(alphaIsBounded).toBe(true);
    expect(stepsAreContinuous).toBe(true);
    expect(coastProfilePixels()).toEqual(pixels);
  });
  it('shares directional atlas coordinates at every shoreline corner without a color seam', () => {
    const profile = buildCoastProfile(outline)!;
    for (const ribbon of [profile.sea, profile.land]) {
      const corners = new Map<string, number>();
      for (let i = 0; i < ribbon.positions.length / 2; i++) {
        if (ribbon.uvs[i * 2] !== 0) continue;
        const key = `${ribbon.positions[i * 2]},${ribbon.positions[i * 2 + 1]}`;
        const v = ribbon.uvs[i * 2 + 1]!;
        if (corners.has(key)) expect(v).toBe(corners.get(key));
        else corners.set(key, v);
      }
      expect(corners.size).toBe(4);
      expect(new Set(corners.values()).size).toBeGreaterThan(1);
    }
  });
  it('uses real Pixi MeshGeometry and releases detached resources exactly once', () => {
    const owner = createCoastSurface(outline)!;
    const texture = owner.seaMesh.texture,
      source = texture.source;
    expect(owner.landMesh.texture).toBe(texture);
    expect(owner.seaMesh.geometry).toBeInstanceOf(MeshGeometry);
    expect(source.width).toBe(128);
    expect(source.height).toBe(4);
    expect(source.style.addressMode).toBe('clamp-to-edge');
    const seaDestroy = vi.spyOn(owner.seaMesh.geometry, 'destroy');
    const landDestroy = vi.spyOn(owner.landMesh.geometry, 'destroy');
    const textureDestroy = vi.spyOn(texture, 'destroy');
    const sourceDestroy = vi.spyOn(source, 'destroy');
    const parent = new Container();
    parent.addChild(owner.seaContainer, owner.landContainer);
    expect(owner.getDiagnostics()).toMatchObject({
      ownedTextures: 1,
      ownedSources: 1,
      ownedGeometries: 2,
      rgbaBytes: 2048,
    });
    owner.destroy();
    owner.destroy();
    expect(parent.children).toHaveLength(0);
    expect(seaDestroy).toHaveBeenCalledTimes(1);
    expect(landDestroy).toHaveBeenCalledTimes(1);
    expect(textureDestroy).toHaveBeenCalledTimes(1);
    expect(textureDestroy).toHaveBeenCalledWith(true);
    expect(sourceDestroy).toHaveBeenCalledTimes(1);
    expect(owner.getDiagnostics()).toMatchObject({
      ownedTextures: 0,
      ownedSources: 0,
      ownedGeometries: 0,
      geometryBytes: 0,
      rgbaBytes: 0,
    });
    parent.destroy();
  });
  it('accepts the actual national display shoreline within explicit geometry and atlas budgets', () => {
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
    const display = buildDisplayCoast(outlineData, graph, buildTerrainPack().rivers);
    const before = JSON.stringify(display);
    const result = buildCoastProfile(display);
    expect(result).not.toBeNull();
    expect(result!.inputVertices).toBeLessThanOrEqual(COAST_SURFACE.maxVertices);
    expect(result!.geometryBytes).toBeLessThanOrEqual(COAST_SURFACE.maxGeometryBytes);
    expect(JSON.stringify(display)).toBe(before);
  });
});
