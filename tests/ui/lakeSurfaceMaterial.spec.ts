import { describe, expect, it, vi } from 'vitest';
import {
  DOMAdapter,
  Graphics,
  Matrix,
  Texture,
  TextureStyle,
  generateTextureMatrix,
  type FillInstruction,
} from 'pixi.js';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { lakeSurfacePixels, createLakeSurfaceMaterial } from '@ui/map/terrain/lakeSurfaceMaterial';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { buildDisplayLake } from '@ui/map/terrain/displayLakeGeometry';
import { LAKE_SURFACE } from '@ui/map/mapViewConfig';

const lakes = [
  {
    id: 'bank',
    polygon: [
      { x: 100, y: -30 },
      { x: 150, y: -35 },
      { x: 190, y: 5 },
      { x: 155, y: 70 },
      { x: 110, y: 55 },
    ],
  },
];
function withCanvas(run: () => void) {
  const previous = DOMAdapter.get();
  DOMAdapter.set({
    ...previous,
    createCanvas: (width, height) =>
      ({
        width,
        height,
        getContext: () => ({
          createLinearGradient: () => ({ addColorStop: vi.fn() }),
          fillRect: vi.fn(),
          fillStyle: '',
        }),
      }) as unknown as ReturnType<typeof previous.createCanvas>,
  });
  try {
    run();
  } finally {
    DOMAdapter.set(previous);
  }
}
describe('static lake bank/reflection material', () => {
  it('uses a two-dimensional owned pixel surface instead of the old one-dimensional gradient', () =>
    withCanvas(() => {
      const water = createWaterFeatures([], lakes);
      try {
        const graphics = water.container.children[0] as Graphics;
        const fill = graphics.context.instructions.find(
          (i): i is FillInstruction => i.action === 'fill',
        )!;
        expect(ArrayBuffer.isView(fill.data.style.texture!.source.resource)).toBe(true);
        expect(fill.data.style.texture!.source.height).toBeGreaterThan(1);
      } finally {
        water.destroy();
      }
    }));
  it('reports actual owned surface resources rather than counting lake gradient intentions', () =>
    withCanvas(() => {
      const water = createWaterFeatures([], lakes);
      try {
        const stats = water.getMaterialDiagnostics();
        expect(stats.ownedTextures).toBe(1);
        expect(stats.ownedSources).toBe(1);
        expect(stats.ownedStyleListeners).toBe(1);
        expect(stats.rgbaBytes).toBe(stats.lakes[0]!.width * stats.lakes[0]!.height * 4);
        expect(stats.lakes[0]!.kind).toBe('bankReflection');
        expect(Object.isFrozen(stats.lakes[0])).toBe(true);
      } finally {
        water.destroy();
      }
    }));
  it('makes both shallow banks lighter than the calm interior and preserves coherent restrained swells', () => {
    const surface = lakeSurfacePixels([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 90 },
      { x: 0, y: 90 },
    ])!;
    const row = Math.floor(surface.height / 2);
    const brightness = (col: number) => {
      const offset = (row * surface.width + col) * 4;
      return (
        (surface.pixels[offset]! + surface.pixels[offset + 1]! + surface.pixels[offset + 2]!) / 3
      );
    };
    const left = Math.floor((2 * surface.width) / 30),
      right = surface.width - 1 - left;
    expect(brightness(left)).toBeGreaterThan(brightness(Math.floor(surface.width / 2)) + 3);
    expect(brightness(right)).toBeGreaterThan(brightness(Math.floor(surface.width / 2)) + 3);
    const centralColors = new Set<number>();
    for (let y = 20; y < surface.height - 20; y++) {
      centralColors.add(surface.pixels[(y * surface.width + Math.floor(surface.width / 2)) * 4]!);
    }
    expect(centralColors.size).toBeGreaterThan(3);
  });
  it('has transparent exterior samples, deterministic translated pixels and no input mutation', () => {
    const polygon = lakes[0]!.polygon;
    const before = JSON.stringify(polygon);
    const surface = lakeSurfacePixels(polygon)!;
    const again = lakeSurfacePixels(polygon.map((p) => ({ x: p.x + 4096, y: p.y - 4096 })))!;
    let same = true,
      exterior = 0,
      interior = 0,
      alphaCorrect = true;
    for (let row = 0; row < surface.height; row++)
      for (let col = 0; col < surface.width; col++) {
        const x = surface.bounds.x + ((col + 0.5) * surface.bounds.width) / surface.width;
        const y = surface.bounds.y + ((row + 0.5) * surface.bounds.height) / surface.height;
        let winding = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i]!,
            b = polygon[j]!;
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
            winding = !winding;
        }
        const offset = (row * surface.width + col) * 4;
        if (winding) interior++;
        else exterior++;
        alphaCorrect &&= surface.pixels[offset + 3] === (winding ? 255 : 0);
        for (let channel = 0; channel < 4; channel++)
          same &&= surface.pixels[offset + channel] === again.pixels[offset + channel];
      }
    expect({ same, alphaCorrect }).toEqual({ same: true, alphaCorrect: true });
    expect(exterior).toBeGreaterThan(0);
    expect(interior).toBeGreaterThan(0);
    expect(JSON.stringify(polygon)).toBe(before);
    expect(lakeSurfacePixels(polygon)!.pixels).toEqual(surface.pixels);
  });
  it('uses independent real owned sources and destroys each once without affecting the other owner', () => {
    const a = createLakeSurfaceMaterial(lakes[0]!.polygon)!;
    const b = createLakeSurfaceMaterial(lakes[0]!.polygon)!;
    const textureDestroy = vi.spyOn(a.texture, 'destroy'),
      sourceDestroy = vi.spyOn(a.source, 'destroy');
    expect(a.source.format).toBe('rgba8unorm');
    expect(a.source.resource).not.toBe(b.source.resource);
    a.destroy();
    a.destroy();
    expect(textureDestroy).toHaveBeenCalledTimes(1);
    expect(textureDestroy).toHaveBeenCalledWith(true);
    expect(sourceDestroy).toHaveBeenCalledTimes(1);
    expect(b.texture.destroyed).toBe(false);
    b.destroy();
  });
  it('rejects invalid geometry and bounds allocations even when the owner draws more than32 lakes', () => {
    for (const polygon of [
      [],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ],
      [
        { x: NaN, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      [
        { x: -1e308, y: 0 },
        { x: 1e308, y: 0 },
        { x: 0, y: 1 },
      ],
      Array.from({ length: LAKE_SURFACE.material.maxVertices + 1 }, (_, i) => ({ x: i, y: i % 2 })),
    ]) {
      expect(lakeSurfacePixels(polygon)).toBeNull();
    }
    const water = createWaterFeatures(
      [],
      Array.from({ length: 33 }, (_, i) => ({ id: `lake-${i}`, polygon: lakes[0]!.polygon })),
    );
    const stats = water.getMaterialDiagnostics();
    expect(stats.ownedTextures).toBe(32);
    expect(stats.rgbaBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(stats.lakes.at(-1)!.kind).toBe('solidFallback');
    water.destroy();
    expect(water.getMaterialDiagnostics().ownedTextures).toBe(0);
    expect(water.getMaterialDiagnostics().rgbaBytes).toBe(0);
  });
  it('registers actual national lake surfaces with truthful dimensions and byte totals', () => {
    const terrain = buildTerrainPack();
    const surfaces = terrain.lakes.map((lake) =>
      lakeSurfacePixels(buildDisplayLake(lake.polygon, terrain.rivers))!,
    );
    expect(surfaces.map((s) => [s.width, s.height])).toEqual([
      [40, 128],
      [115, 128],
    ]);
    const water = createWaterFeatures(terrain.rivers, terrain.lakes);
    const stats = water.getMaterialDiagnostics();
    expect(stats).toMatchObject({ ownedTextures: 2, ownedSources: 2, rgbaBytes: 79360 });
    expect(stats.lakes.every((s) => s.kind === 'bankReflection')).toBe(true);
    water.destroy();
  });
  it('fails closed for finite coordinates whose squared edge lengths overflow', () => {
    expect(
      lakeSurfacePixels([
        { x: 0, y: 0 },
        { x: 1e155, y: 0 },
        { x: 1e155, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBeNull();
  });
  it('destroys each real owned GraphicsContext before releasing its referenced surface texture', () => {
    const sharedWhite = Texture.WHITE,
      sharedEmpty = Texture.EMPTY;
    const water = createWaterFeatures([], lakes);
    const contexts = water.container.children.map((child) => (child as Graphics).context);
    const fill = contexts[0]!.instructions.find((i): i is FillInstruction => i.action === 'fill')!;
    const texture = fill.data.style.texture!;
    const original = texture.destroy.bind(texture);
    const destroy = vi.spyOn(texture, 'destroy').mockImplementation((destroySource) => {
      expect(contexts.every((context) => context.destroyed)).toBe(true);
      original(destroySource);
    });
    try {
      water.destroy();
      water.destroy();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(sharedWhite.destroyed).toBe(false);
      expect(sharedWhite.source.destroyed).toBe(false);
      expect(sharedEmpty.destroyed).toBe(false);
      expect(sharedEmpty.source.destroyed).toBe(false);
    } finally {
      destroy.mockRestore();
      if (!texture.destroyed) texture.destroy(true);
    }
  });
  it('registers translated nonrectangular surface UVs and keeps clamp sampling after real Pixi mesh preparation', () => {
    const water = createWaterFeatures([], lakes);
    try {
      const graphics = water.container.children[0] as Graphics;
      const fill = graphics.context.instructions.find(
        (i): i is FillInstruction => i.action === 'fill',
      )!;
      const shape = fill.data.path.shapePath.shapePrimitives[0]!.shape;
      const matrix = generateTextureMatrix(new Matrix(), fill.data.style, shape);
      for (const [u, v] of [
        [0, 0],
        [1, 1],
        [0.25, 0.75],
        [0.75, 0.25],
      ]) {
        const uv = matrix.apply({ x: 100 + 90 * u!, y: -35 + 105 * v! });
        expect(uv.x).toBeCloseTo(u!, 12);
        expect(uv.y).toBeCloseTo(v!, 12);
      }
      expect(fill.data.style.texture!.source.style.addressMode).toBe('clamp-to-edge');
      expect(water.getLakeGeometry()[0]!.originalBounds).toEqual({
        x: 100,
        y: -35,
        width: 90,
        height: 105,
      });
    } finally {
      water.destroy();
    }
  });
  it('removes its exact public clamp listener before destroying the source, with no callback after teardown', () => {
    const on = vi.spyOn(TextureStyle.prototype, 'on'),
      off = vi.spyOn(TextureStyle.prototype, 'off');
    const material = createLakeSurfaceMaterial(lakes[0]!.polygon)!;
    const style = material.source.style;
    try {
      let index = -1;
      on.mock.contexts.forEach((context, i) => {
        if (context === style) index = i;
      });
      const listener = on.mock.calls[index]![1];
      material.source.style.addressMode = 'repeat';
      material.source.style.update();
      expect(material.source.style.addressMode).toBe('clamp-to-edge');
      material.destroy();
      material.destroy();
      const exactOff = off.mock.calls.filter(
        (args, i) => off.mock.contexts[i] === style && args[0] === 'change' && args[1] === listener,
      );
      expect(exactOff).toHaveLength(1);
      style.addressMode = 'repeat';
      style.update();
      expect(style.addressMode).toBe('repeat');
      const empty = createWaterFeatures([], []);
      expect(empty.getMaterialDiagnostics()).toMatchObject({
        ownedTextures: 0,
        ownedSources: 0,
        ownedStyleListeners: 0,
        rgbaBytes: 0,
        lakes: [],
      });
      empty.destroy();
    } finally {
      material.destroy();
      on.mockRestore();
      off.mockRestore();
    }
  });
});
