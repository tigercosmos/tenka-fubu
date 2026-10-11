import { describe, expect, it, vi } from 'vitest';
import { Graphics, Matrix, Texture, generateTextureMatrix, type StrokeInstruction } from 'pixi.js';
import {
  createRiverSurfaceMaterial,
  riverSurfacePixels,
} from '@ui/map/terrain/riverSurfaceMaterial';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { RIVER_WIDTH } from '@ui/map/mapViewConfig';
import { buildNaturalDisplayRiver } from '@ui/map/terrain/displayRiverGeometry';

const bent = [
  { x: 100, y: -30 },
  { x: 140, y: -30 },
  { x: 140, y: 50 },
];
const sampleSurface = (
  surface: NonNullable<ReturnType<typeof riverSurfacePixels>>,
  x: number,
  y: number,
) => {
  const tx = ((x - surface.bounds.x) * surface.width) / surface.bounds.width - 0.5;
  const ty = ((y - surface.bounds.y) * surface.height) / surface.bounds.height - 0.5;
  const ix = Math.floor(tx),
    iy = Math.floor(ty),
    fx = tx - ix,
    fy = ty - iy;
  const at = (col: number, row: number) => {
    const i =
      (Math.max(0, Math.min(surface.height - 1, row)) * surface.width +
        Math.max(0, Math.min(surface.width - 1, col))) *
      4;
    return (surface.pixels[i]! + surface.pixels[i + 1]! + surface.pixels[i + 2]!) / 3;
  };
  return (
    (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) +
    (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
  );
};
describe('static world-registered river surface (real installed Pixi CPU, not native GPU)', () => {
  it('gives both banks depth and a coherent north-west daylight side rather than symmetric bbox noise', () => {
    const surface = riverSurfacePixels(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ],
      8,
    )!;
    for (const x of [32, 64, 96, 128]) {
      const north = sampleSurface(surface, x, -3.2),
        south = sampleSurface(surface, x, 3.2),
        center = sampleSurface(surface, x, 0);
      expect(north).toBeGreaterThan(center + 3);
      expect(south).toBeGreaterThan(center + 3);
      expect(north - south).toBeGreaterThan(3);
      expect(north - south).toBeLessThan(12);
    }
  });
  it('keeps upstream material stable when a downstream turn changes the bounding box, and blends through the junction', () => {
    const straight = riverSurfacePixels(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
      ],
      8,
      1,
    )!;
    const turn = riverSurfacePixels(
      [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
        { x: 160, y: 80 },
      ],
      8,
      1,
    )!;
    for (const x of [32, 64, 96])
      for (const y of [-2.4, 0, 2.4])
        expect(Math.abs(sampleSurface(straight, x, y) - sampleSurface(turn, x, y))).toBeLessThan(2);
    const values = [
      { x: 158, y: 0 },
      { x: 159, y: 0 },
      { x: 160, y: 0 },
      { x: 160, y: 1 },
      { x: 160, y: 2 },
    ].map((p) => sampleSurface(turn, p.x, p.y));
    for (let i = 1; i < values.length; i++)
      expect(Math.abs(values[i]! - values[i - 1]!)).toBeLessThan(3);
  });
  it('retains readable bank depth after real low-resolution Tenryu texture filtering', () => {
    const river = buildTerrainPack().rivers.find((r) => r.id === 'rv.tenryu')!;
    const surface = riverSurfacePixels(river.points, RIVER_WIDTH[river.widthClass])!;
    const a = river.points.at(-2)!,
      b = river.points.at(-1)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y),
      radius = RIVER_WIDTH[river.widthClass] / 2;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t;
      const center = sampleSurface(surface, x, y);
      for (const sign of [-1, 1])
        expect(
          sampleSurface(
            surface,
            x - ((b.y - a.y) / length) * radius * 0.8 * sign,
            y + ((b.x - a.x) / length) * radius * 0.8 * sign,
          ),
        ).toBeGreaterThan(center + 3);
    }
  });
  it('registers natural Kiso banks to actual display legs without changing bbox UV or re-tapering subdivisions', () => {
    const points = buildTerrainPack().rivers.find((r) => r.id === 'rv.kiso')!.points;
    const geometry = buildNaturalDisplayRiver(points, 7, [], {
      boundaryPolygons: [
        [
          { x: 1500, y: 2400 },
          { x: 2500, y: 2400 },
          { x: 2500, y: 3200 },
          { x: 1500, y: 3200 },
        ],
      ],
      obstacles: [],
    });
    const original = riverSurfacePixels(points, 7)!;
    const raw = riverSurfacePixels(points, 7, undefined, geometry.rawSegments)!;
    const display = riverSurfacePixels(points, 7, undefined, geometry.displaySegments)!;
    expect(raw.pixels).toEqual(original.pixels);
    expect(display.bounds).toEqual(original.bounds);
    expect([display.width, display.height]).toEqual([original.width, original.height]);
    expect(display.pixels).not.toEqual(original.pixels);
    const a = createRiverSurfaceMaterial(points, 7)!,
      b = createRiverSurfaceMaterial(points, 7, undefined, geometry.displaySegments)!;
    try {
      expect(b.matrix).toEqual(a.matrix);
      expect(b.rgbaBytes).toBe(a.rgbaBytes);
    } finally {
      a.destroy();
      b.destroy();
    }
    expect(
      riverSurfacePixels(points, 7, undefined, [{ a: points[0]!, b: points[1]!, width: 0 }]),
    ).toBeNull();
  });
  it('has reproducible two-sided banks, quiet interior variation and opaque geometry-neutral samples', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 160, y: 0 },
    ];
    const surface = riverSurfacePixels(points, 8)!;
    const before = JSON.stringify(points);
    expect(surface.pixels).toEqual(riverSurfacePixels(points, 8)!.pixels);
    expect(surface.pixels).toEqual(
      riverSurfacePixels(
        points.map((p) => ({ x: p.x + 4096, y: p.y - 4096 })),
        8,
      )!.pixels,
    );
    const column = Math.floor(surface.width / 2);
    const value = (row: number) => surface.pixels[(row * surface.width + column) * 4]!;
    const center = Math.floor(surface.height / 2);
    expect(value(0)).toBeGreaterThan(value(center) + 3);
    expect(value(surface.height - 1)).toBeGreaterThan(value(center) + 3);
    const interior = new Set(
      Array.from(
        { length: surface.width },
        (_, col) => surface.pixels[(center * surface.width + col) * 4],
      ),
    );
    expect(interior.size).toBeGreaterThan(3);
    for (let i = 3; i < surface.pixels.length; i += 4) expect(surface.pixels[i]).toBe(255);
    expect(JSON.stringify(points)).toBe(before);
  });
  it('maps every bent-leg joint and expanded endpoint cap through ONE global UV transform', () => {
    const material = createRiverSurfaceMaterial(bent, 7)!;
    const graphics = new Graphics();
    try {
      for (let i = 0; i < bent.length - 1; i++)
        graphics
          .moveTo(bent[i]!.x, bent[i]!.y)
          .lineTo(bent[i + 1]!.x, bent[i + 1]!.y)
          .stroke({
            texture: material.texture,
            textureSpace: material.textureSpace,
            matrix: material.matrix,
            width: 7,
            cap: 'round',
            join: 'round',
          });
      const strokes = graphics.context.instructions.filter(
        (i): i is StrokeInstruction => i.action === 'stroke',
      );
      expect(strokes).toHaveLength(2);
      for (const stroke of strokes) {
        const shape = stroke.data.path.shapePath.shapePrimitives[0]!.shape;
        const uv = generateTextureMatrix(new Matrix(), stroke.data.style, shape);
        for (const p of [
          ...bent,
          { x: material.bounds.x, y: material.bounds.y },
          {
            x: material.bounds.x + material.bounds.width,
            y: material.bounds.y + material.bounds.height,
          },
        ]) {
          const actual = uv.apply(p);
          expect(actual.x).toBeCloseTo((p.x - material.bounds.x) / material.bounds.width, 12);
          expect(actual.y).toBeCloseTo((p.y - material.bounds.y) / material.bounds.height, 12);
        }
      }
      expect(material.source.style.addressMode).toBe('clamp-to-edge');
    } finally {
      graphics.destroy({ context: true });
      material.destroy();
    }
  });
  it('uses exact taper radii without letting a narrow upstream leg reset the joint material', () => {
    const surface = riverSurfacePixels(bent, 8, 0.4)!;
    expect(surface.bounds).toEqual({ x: 96, y: -34, width: 48, height: 88 });
    const sample = (x: number, y: number) =>
      surface.pixels[
        (Math.min(
          surface.height - 1,
          Math.floor(((y - surface.bounds.y) * surface.height) / surface.bounds.height),
        ) *
          surface.width +
          Math.min(
            surface.width - 1,
            Math.floor(((x - surface.bounds.x) * surface.width) / surface.bounds.width),
          )) *
          4
      ]!;
    expect(sample(120, -28.7)).toBeGreaterThan(sample(120, -30) + 2);
    expect(sample(143.5, 20)).toBeGreaterThan(sample(140, 20) + 2);
  });
  it('caps every actual national river and rejects invalid or degenerate input before allocation', () => {
    const surfaces = buildTerrainPack().rivers.map((r) =>
      riverSurfacePixels(r.points, RIVER_WIDTH[r.widthClass])!,
    );
    expect(surfaces.length).toBeGreaterThan(0);
    for (const surface of surfaces) {
      expect(surface).not.toBeNull();
      expect(surface.width * surface.height * 4).toBeLessThanOrEqual(128 * 1024);
      expect(Math.max(surface.width, surface.height)).toBeLessThanOrEqual(512);
    }
    for (const points of [
      [],
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: NaN, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: -1e308, y: 0 },
        { x: 1e308, y: 0 },
      ],
      Array.from({ length: 257 }, (_, x) => ({ x, y: 0 })),
    ])
      expect(riverSurfacePixels(points, 7)).toBeNull();
    for (const width of [0, -1, 1e-300, NaN, Infinity, 129])
      expect(riverSurfacePixels(bent, width)).toBeNull();
    for (const taper of [0, -1, NaN, Infinity, 1.1])
      expect(riverSurfacePixels(bent, 7, taper)).toBeNull();
  });
  it('keeps restrained visible variation on both final-leg flanks of actual Kiso and Yodo', () => {
    for (const river of buildTerrainPack().rivers.filter(
      (r) => r.id === 'rv.kiso' || r.id === 'rv.yodo',
    )) {
      const width = RIVER_WIDTH[river.widthClass];
      const surface = riverSurfacePixels(river.points, width)!;
      const a = river.points.at(-2)!,
        b = river.points.at(-1)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const sample = (x: number, y: number) => {
        const tx = ((x - surface.bounds.x) * surface.width) / surface.bounds.width - 0.5;
        const ty = ((y - surface.bounds.y) * surface.height) / surface.bounds.height - 0.5;
        const x0 = Math.floor(tx),
          y0 = Math.floor(ty),
          fx = tx - x0,
          fy = ty - y0;
        const value = (col: number, row: number) => {
          const offset =
            (Math.max(0, Math.min(surface.height - 1, row)) * surface.width +
              Math.max(0, Math.min(surface.width - 1, col))) *
            4;
          return (
            (surface.pixels[offset]! + surface.pixels[offset + 1]! + surface.pixels[offset + 2]!) /
            3
          );
        };
        return (
          (value(x0, y0) * (1 - fx) + value(x0 + 1, y0) * fx) * (1 - fy) +
          (value(x0, y0 + 1) * (1 - fx) + value(x0 + 1, y0 + 1) * fx) * fy
        );
      };
      for (const sign of [-1, 1]) {
        const values = Array.from({ length: 25 }, (_, i) => {
          const t = 0.15 + (0.7 * i) / 24;
          return sample(
            a.x + (b.x - a.x) * t - ((b.y - a.y) / length) * width * 0.3 * sign,
            a.y + (b.y - a.y) * t + ((b.x - a.x) / length) * width * 0.3 * sign,
          );
        });
        const range = Math.max(...values) - Math.min(...values);
        expect(range, `${river.id}/${sign}`).toBeGreaterThanOrEqual(3);
        expect(range, `${river.id}/${sign}`).toBeLessThanOrEqual(18);
      }
    }
  });
  it('releases only its owned texture/source/listener once while another owner and WHITE stay live', () => {
    const first = createRiverSurfaceMaterial(bent, 7)!,
      second = createRiverSurfaceMaterial(bent, 4)!;
    const sourceDestroy = vi.spyOn(first.source, 'destroy');
    const textureDestroy = vi.spyOn(first.texture, 'destroy');
    try {
      expect(first.getDiagnostics()).toMatchObject({
        ownedTextures: 1,
        ownedSources: 1,
        ownedStyleListeners: 1,
      });
      first.destroy();
      first.destroy();
      expect(sourceDestroy).toHaveBeenCalledTimes(1);
      expect(textureDestroy).toHaveBeenCalledTimes(1);
      expect(first.getDiagnostics()).toMatchObject({
        ownedTextures: 0,
        ownedSources: 0,
        ownedStyleListeners: 0,
        rgbaBytes: 0,
      });
      expect(second.texture.destroyed).toBe(false);
      expect(second.source.destroyed).toBe(false);
      expect(Texture.WHITE.destroyed).toBe(false);
      expect(Texture.WHITE.source.destroyed).toBe(false);
    } finally {
      sourceDestroy.mockRestore();
      textureDestroy.mockRestore();
      first.destroy();
      second.destroy();
    }
  });
});
