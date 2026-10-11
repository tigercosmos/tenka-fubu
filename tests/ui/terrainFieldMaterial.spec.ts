import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Graphics, Texture } from 'pixi.js';
import {
  createTerrainFieldMaterial,
  fieldMaterialMask,
  TERRAIN_FIELD_MATERIAL,
} from '@ui/map/terrain/terrainFieldMaterial';
import { buildTerrainPack, type TerrainPack } from '@ui/map/terrain/terrainPack';
import { zJapanOutlineFile } from '@data/schemas/outline';
import outlineJson from '@data/map/japan-outline.json';
import { pointInPolygon } from '@data/map/outlineGeometry';

type Point = { x: number; y: number };
// Captured pre-ROI implementation, 2026-10-09. Independent literal constants/whole-world scan.
function originalFieldMask(terrain: TerrainPack) {
  const worldSize = 4096,
    size = 512,
    fadeWorld = 32;
  const cell = worldSize / size;
  const guard = (Math.SQRT2 * cell) / 2 + cell;
  const shapes = [
    ...(terrain.mountains ?? []).map((m) => m.mass),
    ...(terrain.forests ?? []).map((f) => f.polygon),
  ]
    .filter((points) => points.length > 0)
    .map((points) => ({
      minX: Math.min(...points.map((p) => p.x)) - guard - fadeWorld,
      maxX: Math.max(...points.map((p) => p.x)) + guard + fadeWorld,
      minY: Math.min(...points.map((p) => p.y)) - guard - fadeWorld,
      maxY: Math.max(...points.map((p) => p.y)) + guard + fadeWorld,
      segments: points.map((a, i) => {
        const b = points[(i + 1) % points.length]!;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        return { a, b, dx, dy, inverseLength: 1 / (dx * dx + dy * dy || 1) };
      }),
    }));
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) * cell,
        y = (row + 0.5) * cell;
      let distanceSquared = Infinity,
        inside = false;
      for (const shape of shapes) {
        if (x < shape.minX || x > shape.maxX || y < shape.minY || y > shape.maxY) continue;
        let inShape = false;
        for (const { a, b, dx, dy, inverseLength } of shape.segments) {
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
            inShape = !inShape;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) * inverseLength));
          const ex = x - a.x - t * dx,
            ey = y - a.y - t * dy;
          distanceSquared = Math.min(distanceSquared, ex * ex + ey * ey);
        }
        if (inShape) {
          inside = true;
          break;
        }
      }
      const t = inside
        ? 0
        : Math.max(0, Math.min(1, (Math.sqrt(distanceSquared) - guard) / fadeWorld));
      const value = Math.round(255 * t * t * (3 - 2 * t));
      const index = (row * size + col) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  return { size, pixels };
}
// Independent rectangle/segment clipping oracle, not the mask's center-distance algorithm.
function intersectsCell(points: readonly Point[], x: number, y: number) {
  if (points.some((p) => p.x >= x && p.x <= x + 8 && p.y >= y && p.y <= y + 8)) return true;
  const flat = points.flatMap((p) => [p.x, p.y]);
  if (
    [
      [x, y],
      [x + 8, y],
      [x, y + 8],
      [x + 8, y + 8],
    ].some(([px, py]) => pointInPolygon(px!, py!, flat))
  )
    return true;
  return points.some((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    let lo = 0,
      hi = 1;
    for (const [p, q] of [
      [-dx, a.x - x],
      [dx, x + 8 - a.x],
      [-dy, a.y - y],
      [dy, y + 8 - a.y],
    ]) {
      if (p === 0) {
        if (q! < 0) return false;
      } else {
        const t = q! / p!;
        if (p! < 0) lo = Math.max(lo, t);
        else hi = Math.min(hi, t);
        if (lo > hi) return false;
      }
    }
    return true;
  });
}

describe('static decorative lowland field material', () => {
  it('bounds actual authored-pack square roots below 20,000 using polygon ROI', () => {
    const sqrt = vi.spyOn(Math, 'sqrt');
    try {
      fieldMaterialMask(buildTerrainPack());
      expect(sqrt.mock.calls.length).toBeLessThan(20000);
    } finally {
      sqrt.mockRestore();
    }
  });
  it('matches every pre-ROI RGBA byte for the real pack and independent boundary datasets', () => {
    const empty: TerrainPack = {
      reliefAssetId: 'diagnostic',
      forestAssetId: 'diagnostic',
      rivers: [],
      lakes: [],
    };
    const tiny = [
      { x: 101, y: 101 },
      { x: 102, y: 101 },
      { x: 102, y: 102 },
    ];
    const thin = [
      { x: 80, y: 103 },
      { x: 140, y: 103 },
      { x: 140, y: 104 },
      { x: 80, y: 104 },
    ];
    const negative = [
      { x: -30, y: -20 },
      { x: 2, y: -20 },
      { x: 2, y: 5 },
      { x: -30, y: 5 },
    ];
    const datasets = [
      buildTerrainPack(),
      empty,
      { ...empty, forests: [{ id: 'tiny', polygon: tiny }] },
      { ...empty, forests: [{ id: 'thin', polygon: thin }] },
      { ...empty, forests: [{ id: 'negative', polygon: negative }] },
      {
        ...empty,
        forests: [
          { id: 'tiny', polygon: tiny },
          { id: 'reverse', polygon: [...tiny].reverse() },
          { id: 'duplicate', polygon: [tiny[0]!, ...tiny] },
          { id: 'thin', polygon: thin },
          { id: 'point', polygon: [{ x: 101, y: 101 }] },
          { id: 'empty', polygon: [] },
        ],
      },
    ];
    let compared = 0,
      mismatches = 0;
    for (const terrain of datasets) {
      const before = JSON.stringify(terrain);
      const old = originalFieldMask(terrain).pixels,
        next = fieldMaterialMask(terrain).pixels;
      for (let i = 0; i < old.length; i++) {
        compared++;
        if (old[i] !== next[i]) mismatches++;
      }
      expect(JSON.stringify(terrain)).toBe(before);
    }
    expect(compared).toBe(6291456);
    expect(mismatches).toBe(0);
  });
  it('uses a bounded conservative nearest red mask, without modifying authored terrain', () => {
    const terrain = buildTerrainPack();
    const before = JSON.stringify(terrain);
    const { size, pixels } = fieldMaterialMask(terrain);
    expect(size).toBe(512);
    expect(pixels.length).toBe(1048576);
    expect(JSON.stringify(terrain)).toBe(before);
    let valid = true;
    for (let i = 0; i < pixels.length; i += 4)
      valid &&= pixels[i] === pixels[i + 1] && pixels[i] === pixels[i + 2] && pixels[i + 3] === 255;
    expect(valid).toBe(true);
    let intersections = 0,
      unsafe = 0;
    for (const poly of [
      ...terrain.mountains!.map((m) => m.mass),
      ...terrain.forests!.map((f) => f.polygon),
    ]) {
      for (
        let row = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y)) / 8));
        row <= Math.min(511, Math.floor(Math.max(...poly.map((p) => p.y)) / 8));
        row++
      )
        for (
          let col = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x)) / 8));
          col <= Math.min(511, Math.floor(Math.max(...poly.map((p) => p.x)) / 8));
          col++
        )
          if (intersectsCell(poly, col * 8, row * 8)) {
            intersections++;
            if (pixels[(row * 512 + col) * 4] !== 0) unsafe++;
          }
    }
    expect(intersections).toBeGreaterThan(6000);
    expect(unsafe).toBe(0);
  });
  it('excludes tiny contained polygons, thin crossings, reversed duplicates and overlaps', () => {
    const tiny = [
      { x: 101, y: 101 },
      { x: 102, y: 101 },
      { x: 102, y: 102 },
    ];
    const thin = [
      { x: 80, y: 103 },
      { x: 140, y: 103 },
      { x: 140, y: 104 },
      { x: 80, y: 104 },
    ];
    const terrain: TerrainPack = {
      reliefAssetId: 'diagnostic-relief',
      forestAssetId: 'diagnostic-forest',
      rivers: [],
      lakes: [],
      forests: [
        { id: 'tiny', polygon: tiny },
        { id: 'crossing', polygon: thin },
        { id: 'reverse', polygon: [...tiny].reverse() },
        { id: 'duplicate', polygon: [tiny[0]!, ...tiny] },
        { id: 'point', polygon: [{ x: 101, y: 101 }] },
        {
          id: 'negative-boundary',
          polygon: [
            { x: -4, y: -4 },
            { x: 1, y: -4 },
            { x: 1, y: 1 },
          ],
        },
      ],
    };
    const { pixels } = fieldMaterialMask(terrain);
    expect(pixels[(12 * 512 + 12) * 4]).toBe(0);
    expect(pixels[(12 * 512 + 15) * 4]).toBe(0);
    expect(pixels[(100 * 512 + 100) * 4]).toBe(255);
    expect(Buffer.from(fieldMaterialMask(terrain).pixels)).toEqual(Buffer.from(pixels));
    expect(pixels.some((v) => v > 0 && v < 255)).toBe(true);
    expect(pixels[0]).toBe(0);
    const empty = fieldMaterialMask({ ...terrain, forests: [], mountains: [] });
    expect(empty.pixels.every((v) => v === 255)).toBe(true);
  });
  it('keeps NPOT texture world phase and owns only its mask source', () => {
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(1254 * 1254 * 4),
        width: 1254,
        height: 1254,
      }),
    });
    const destroyShared = vi.spyOn(texture, 'destroy');
    const outline = zJapanOutlineFile.parse(outlineJson);
    const originalOutline = JSON.stringify(outline);
    const poly = vi.spyOn(Graphics.prototype, 'poly');
    const art = createTerrainFieldMaterial(texture, outline, buildTerrainPack());
    expect(poly.mock.calls.map((c) => c[0])).toEqual(outline.polygons.map((p) => p.points));
    poly.mockRestore();
    expect(JSON.stringify(outline)).toBe(originalOutline);
    expect(art.sprite.alpha).toBe(0.35);
    expect(art.sprite.tileScale.x).toBe(384 / 1254);
    for (const point of [
      { x: -129, y: 225 },
      { x: 2048, y: 3199 },
    ]) {
      const uv = art.sprite.tileTransform.matrix.applyInverse(point);
      expect(uv.x / 1254).toBeCloseTo(point.x / 384, 10);
      expect(uv.y / 1254).toBeCloseTo(point.y / 384, 10);
    }
    const source = art.softMask.texture.source;
    const destroySource = vi.spyOn(source, 'destroy');
    expect(source.scaleMode).toBe('nearest');
    expect(art.sprite.mask).toBe(art.softMask);
    expect(art.container.eventMode).toBe('none');
    expect(TERRAIN_FIELD_MATERIAL.fadeWorld).toBe(32);
    art.destroy();
    art.destroy();
    expect(destroySource).toHaveBeenCalledTimes(1);
    expect(destroyShared).not.toHaveBeenCalled();
    texture.destroy(true);
  });
});
