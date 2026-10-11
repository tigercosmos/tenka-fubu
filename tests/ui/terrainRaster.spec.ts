import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture, BufferImageSource } from 'pixi.js';
import {
  createMountainRaster,
  mountainRasterLayout,
  createForestRaster,
  forestRasterLayout,
  mountainRasterPlacement,
  createMountainRasterVariants,
  mountainFeatherMask,
} from '@ui/map/terrain/terrainRaster';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { prepareMountainRiverContact } from '@ui/map/terrain/mountainRiverContact';

it('measures the candidate Akaishi v3 alpha frame without altering its source pixels', () => {
  const bytes = readFileSync('public/assets/textures/terrain-mountain-akaishi-massif-v3.png');
  expect(bytes.length).toBe(2728303);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'b2eb8a4c72513e82391045620d3fbcf764ff3b23e951552995fda8e8480154a3',
  );
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([1024, 1536]);
  let left = png.width,
    top = png.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  expect({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }).toEqual({
    x: 142,
    y: 23,
    width: 787,
    height: 1495,
  });
});

it('measures the unchanged original Akaishi v2 alpha frame before uniform placement', () => {
  const bytes = readFileSync('public/assets/textures/terrain-mountain-akaishi-massif-v2.png');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '50b4093f27e9387090284241013fa7672c8b3288b2e9404a7af40aff854259bf',
  );
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([1024, 1536]);
  let left = png.width,
    top = png.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  expect({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }).toEqual({
    x: 143,
    y: 25,
    width: 791,
    height: 1497,
  });
});

it('attenuates actual painted-peak RED mask without changing opaque alpha or mask dimensions', () => {
  const patch = {
    id: 'mt.kiso',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ridge: undefined,
    assetId: undefined,
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  const contact = prepareMountainRiverContact([
    { id: 'river', a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, radius: 2 },
  ]);
  const old = mountainFeatherMask(patch);
  const actual = mountainFeatherMask(patch, undefined, contact);
  const center = (64 * 128 + 64) * 4;
  expect(old.pixels[center]).toBe(255);
  expect(actual.pixels[center]).toBe(0);
  expect(actual.pixels[center + 3]).toBe(255);
  expect(actual.pixels.length).toBe(old.pixels.length);
});

it('uses the complete original Kiso alpha frame with uniform containment and shared-source-safe fallback', () => {
  const terrain = buildTerrainPack();
  const id = 'texture.terrain.mountain-kiso-massif-v1';
  const bytes = readFileSync('public/assets/textures/terrain-mountain-kiso-massif-v1.png');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'b77c046310079a85eaf11546aa1915557e3bf70a643a258b2e933244bc8375b2',
  );
  expect(bytes.length).toBe(1408725);
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([974, 1615]);
  let x0 = png.width,
    y0 = png.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const frame = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  expect(frame).toEqual({ x: 205, y: 34, width: 598, height: 1557 });
  expect(terrain.mountainArtContentBounds?.[id]).toEqual(frame);
  const patches = mountainRasterLayout(terrain);
  const patch = patches.find((p) => p.id === 'mt.kiso')!;
  expect(patch.assetId).toBe(id);
  expect([patch.x, patch.y, patch.width, patch.height]).toEqual([2128, 2651, 91, 242]);
  const old = mountainRasterLayout({
    ...terrain,
    mountainArtById: {
      ...terrain.mountainArtById,
      'mt.kiso': 'texture.terrain.mountain-vertical-v5',
    },
  });
  expect(patches.filter((p) => p.id !== 'mt.kiso')).toEqual(old.filter((p) => p.id !== 'mt.kiso'));
  const make = (width: number, height: number) =>
    new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(width * height * 4),
        width,
        height,
      }),
    });
  const art = make(974, 1615),
    axis = make(1024, 1536),
    base = make(1024, 1536);
  const only = {
    ...terrain,
    mountains: terrain.mountains?.filter((m) => m.id === 'mt.kiso') ?? [],
  };
  for (const [chosenId, chosen, textures] of [
    [
      id,
      art,
      new Map([
        [id, art],
        ['texture.terrain.mountain-vertical-v4', axis],
        [terrain.mountainArtAssetId!, base],
      ]),
    ],
    [
      'texture.terrain.mountain-vertical-v4',
      axis,
      new Map([
        ['texture.terrain.mountain-vertical-v4', axis],
        [terrain.mountainArtAssetId!, base],
      ]),
    ],
    [terrain.mountainArtAssetId!, base, new Map([[terrain.mountainArtAssetId!, base]])],
  ] as const) {
    const raster = createMountainRasterVariants(textures, only);
    const sprite = raster.container.children[0]?.children[0];
    if (!(sprite instanceof Sprite)) throw new Error('Missing Kiso public Sprite');
    expect(sprite.texture).toBe(chosen);
    expect(sprite.scale.x).toBe(sprite.scale.y);
    expect(sprite.rotation).toBe(0);
    const placement = mountainRasterPlacement(
      patch,
      chosen.width,
      chosen.height,
      terrain.mountainArtContentBounds?.[chosenId],
    );
    expect(sprite.position).toMatchObject({ x: placement.x, y: placement.y });
    expect(sprite.scale.x).toBeCloseTo(placement.scale, 12);
    if (chosenId === id) {
      expect(frame.height * sprite.scale.y).toBeCloseTo(212.96, 12);
      expect(frame.width * sprite.scale.x).toBeCloseTo((212.96 * 598) / 1557, 12);
      expect(frame.width * sprite.scale.x).toBeLessThan(91 * 0.96);
    }
    expect(raster.coveredIds).toEqual(new Set(['mt.kiso']));
    raster.destroy();
    raster.destroy();
    expect([art, axis, base].every((t) => !t.destroyed && !t.source.destroyed)).toBe(true);
  }
  const missing = createMountainRasterVariants(new Map(), only);
  expect(missing.coveredIds.size).toBe(0);
  missing.destroy();
  for (const texture of [art, axis, base]) texture.destroy(true);
});

it('uses the original Hida PNG alpha frame with uniform full-height placement and V4 fallback', () => {
  const terrain = buildTerrainPack();
  const id = 'texture.terrain.mountain-hida-massif-v2';
  const bytes = readFileSync('public/assets/textures/terrain-mountain-hida-massif-v2.png');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '8db9a571f4dffbfedcba8eae85aaa46ed5972515c26c2de29348ecd885747416',
  );
  const png = PNG.sync.read(bytes);
  expect([png.width, png.height]).toEqual([1024, 1536]);
  let minX = png.width,
    minY = png.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  const frame = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  expect(frame).toEqual({ x: 244, y: 77, width: 582, height: 1376 });
  expect(terrain.mountainArtContentBounds?.[id]).toEqual(frame);
  const patches = mountainRasterLayout(terrain);
  const patch = patches.find((p) => p.id === 'mt.hida')!;
  expect(patch.assetId).toBe(id);
  expect([patch.x, patch.y, patch.width, patch.height]).toEqual([2068, 2463, 124, 300]);
  const legacy = mountainRasterLayout({
    ...terrain,
    mountainArtById: Object.fromEntries(
      Object.entries(terrain.mountainArtById ?? {}).filter(([key]) => key !== 'mt.hida'),
    ),
  });
  expect(patches.filter((p) => p.id !== 'mt.hida')).toEqual(
    legacy.filter((p) => p.id !== 'mt.hida'),
  );
  const texture = new Texture({
    source: new BufferImageSource({ resource: png.data, width: png.width, height: png.height }),
  });
  const fallback = new Texture({
    source: new BufferImageSource({
      resource: new Uint8Array(1024 * 1536 * 4),
      width: 1024,
      height: 1536,
    }),
  });
  for (const available of [
    new Map([[id, texture]]),
    new Map([['texture.terrain.mountain-vertical-v4', fallback]]),
  ]) {
    const selected = patches.filter((p) =>
      [p.assetId, p.axisAssetId].some((key) => key && available.has(key)),
    );
    const raster = createMountainRasterVariants(available, terrain);
    const sprite =
      raster.container.children[selected.findIndex((p) => p.id === 'mt.hida') * 2]?.children[0];
    if (!(sprite instanceof Sprite)) throw new Error('Missing actual Hida Sprite');
    const adopted = available.has(id);
    const usedFrame = adopted
      ? frame
      : terrain.mountainArtContentBounds!['texture.terrain.mountain-vertical-v4']!;
    expect(sprite.texture).toBe(adopted ? texture : fallback);
    expect(sprite.rotation).toBe(0);
    expect(sprite.scale.y).toBe(sprite.scale.x);
    expect(usedFrame.height * sprite.scale.x).toBeCloseTo(264);
    if (adopted) expect(usedFrame.width * sprite.scale.x).toBeCloseTo((264 * 582) / 1376);
    expect(sprite.position.x + usedFrame.x * sprite.scale.x).toBeGreaterThanOrEqual(patch.x);
    expect(sprite.position.y + usedFrame.y * sprite.scale.y).toBeGreaterThanOrEqual(patch.y);
    raster.destroy();
    raster.destroy();
    expect(texture.destroyed).toBe(false);
    expect(fallback.destroyed).toBe(false);
  }
  texture.destroy(true);
  fallback.destroy(true);
});

it.each(['mountain', 'forest'])(
  'owns a reparented %s ground material layer and destroys every owned mask once without destroying shared textures',
  (kind) => {
    const base = buildTerrainPack();
    const terrain = {
      ...base,
      mountains: base.mountains!.slice(0, 1),
      forests: base.forests!.slice(0, 1),
    };
    const make = () =>
      new Texture({
        source: new BufferImageSource({
          resource: new Uint8Array(64 * 64 * 4),
          width: 64,
          height: 64,
        }),
      });
    const art = make(),
      woodland = make();
    const textures = new Map(
      mountainRasterLayout(terrain).flatMap((p) =>
        [p.assetId, p.axisAssetId, terrain.mountainArtAssetId]
          .filter((id): id is string => !!id)
          .map((id) => [id, art] as const),
      ),
    );
    const raster =
      kind === 'mountain'
        ? createMountainRasterVariants(textures, terrain, woodland)
        : createForestRaster(art, terrain, woodland);
    const ground = new Container();
    expect(raster.coveredIds.size).toBe(1);
    expect(raster.materialLayer).not.toBeNull();
    const layer = raster.materialLayer!;
    const owned = new Set<Texture>();
    const visit = (c: Container) => {
      if (c instanceof Sprite && c.texture !== art && c.texture !== woodland) owned.add(c.texture);
      for (const child of c.children) visit(child);
    };
    visit(raster.container);
    expect(owned.size).toBeGreaterThan(0);
    const maskDestroy = [...owned].map((t) => vi.spyOn(t, 'destroy'));
    const sourceDestroy = [...owned].map((t) => vi.spyOn(t.source, 'destroy'));
    const layerDestroy = vi.spyOn(layer, 'destroy');
    ground.addChild(layer);
    raster.destroy();
    raster.destroy();
    expect(ground.children).toHaveLength(0);
    expect(layerDestroy).toHaveBeenCalledTimes(1);
    for (const spy of maskDestroy) {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(true);
    }
    for (const spy of sourceDestroy) expect(spy).toHaveBeenCalledTimes(1);
    expect(art.destroyed).toBe(false);
    expect(woodland.destroyed).toBe(false);
    const missing = createMountainRasterVariants(new Map(), terrain, woodland);
    expect(missing.coveredIds.size).toBe(0);
    expect(missing.materialLayer).toBeNull();
    missing.destroy();
    ground.destroy();
    art.destroy(true);
    woodland.destroy(true);
  },
);
import { buildReliefFaces, drawDimensionalTerrain } from '@ui/map/terrain/terrainDraw';

describe('static authored mountain raster masks', () => {
  it('uses the unchanged Kii PNG frame and preserves all thirteen other placements', () => {
    const bytes = readFileSync('public/assets/textures/terrain-mountain-kii-massif-v1.png');
    expect(bytes.byteLength).toBe(1869014);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '108752be5518f5385cd3e7be31fb4df9566264169435120656599a86734515b4',
    );
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([1902, 827]);
    let left = png.width,
      top = png.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++)
        if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    const frame = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    expect(frame).toEqual({ x: 43, y: 100, width: 1827, height: 677 });
    const terrain = buildTerrainPack();
    const actual = mountainRasterLayout(terrain);
    const prior = mountainRasterLayout({
      ...terrain,
      mountainArtById: {
        ...terrain.mountainArtById,
        'mt.kii': 'texture.terrain.mountain-horizontal-v3',
      },
    });
    expect(actual.filter((patch) => patch.id !== 'mt.kii')).toEqual(
      prior.filter((patch) => patch.id !== 'mt.kii'),
    );
    expect(actual.filter((patch) => patch.id !== 'mt.kii')).toHaveLength(13);
    const patch = actual.find((patch) => patch.id === 'mt.kii')!;
    expect(patch.assetId).toBe('texture.terrain.mountain-kii-massif-v1');
    expect(terrain.mountainArtContentBounds?.[patch.assetId!]).toEqual(frame);
    expect(patch.polygon).toBe(
      terrain.mountains!.find((mountain) => mountain.id === patch.id)!.mass,
    );
    const placement = mountainRasterPlacement(patch, png.width, png.height, frame);
    expect(frame.width * placement.scale).toBeCloseTo(226.16, 10);
    expect(frame.height * placement.scale).toBeCloseTo((226.16 * 677) / 1827, 10);
  });
  it('uniformly fits original Shikoku without changing any other thirteen mountain patches', () => {
    const bytes = readFileSync('public/assets/textures/terrain-mountain-shikoku-massif-v1.png');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '194ed39bad1c2e6a4eda0d52302f65c7b3013c486b6269fef66fb55216530c67',
    );
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([1959, 803]);
    const terrain = buildTerrainPack();
    const actual = mountainRasterLayout(terrain);
    const prior = mountainRasterLayout({
      ...terrain,
      mountainArtById: {
        ...terrain.mountainArtById,
        'mt.shikoku': 'texture.terrain.mountain-horizontal-v3',
      },
    });
    expect(actual.filter((p) => p.id !== 'mt.shikoku')).toEqual(
      prior.filter((p) => p.id !== 'mt.shikoku'),
    );
    expect(actual.filter((p) => p.id !== 'mt.shikoku')).toHaveLength(13);
    const patch = actual.find((p) => p.id === 'mt.shikoku')!;
    expect(patch.assetId).toBe('texture.terrain.mountain-shikoku-massif-v1');
    const frame = terrain.mountainArtContentBounds!['texture.terrain.mountain-shikoku-massif-v1']!;
    expect(frame).toEqual({ x: 23, y: 122, width: 1926, height: 565 });
    const placement = mountainRasterPlacement(patch, png.width, png.height, frame);
    expect(frame.width * placement.scale).toBeCloseTo(270.16, 10);
    expect(frame.height * placement.scale).toBeCloseTo((270.16 * 565) / 1926, 10);
    const left = placement.x + frame.x * placement.scale;
    const top = placement.y + frame.y * placement.scale;
    expect(left).toBeGreaterThanOrEqual(patch.x);
    expect(top).toBeGreaterThanOrEqual(patch.y);
    expect(left + frame.width * placement.scale).toBeLessThanOrEqual(patch.x + patch.width);
    expect(top + frame.height * placement.scale).toBeLessThanOrEqual(patch.y + patch.height);
    expect(patch.polygon).toBe(terrain.mountains!.find((m) => m.id === patch.id)!.mass);
  });
  it('uniformly fits only the original Chugoku frame while preserving all thirteen other patches', () => {
    const terrain = buildTerrainPack();
    const actual = mountainRasterLayout(terrain);
    const prior = mountainRasterLayout({
      ...terrain,
      mountainArtById: {
        ...terrain.mountainArtById,
        'mt.chugoku': 'texture.terrain.mountain-horizontal-v3',
      },
    });
    expect(actual.filter((p) => p.id !== 'mt.chugoku')).toEqual(
      prior.filter((p) => p.id !== 'mt.chugoku'),
    );
    expect(actual.filter((p) => p.id !== 'mt.chugoku')).toHaveLength(13);
    const patch = actual.find((p) => p.id === 'mt.chugoku')!;
    expect(patch.assetId).toBe('texture.terrain.mountain-chugoku-massif-v1');
    const placement = mountainRasterPlacement(patch, 1918, 820, {
      x: 28,
      y: 152,
      width: 1862,
      height: 585,
    });
    expect(placement.scale).toBeCloseTo(0.18857142857142858, 12);
    expect(1862 * placement.scale).toBeCloseTo(351.12, 10);
    expect(585 * placement.scale).toBeCloseTo(110.31428571428572, 10);
    expect(placement.x + 28 * placement.scale).toBeCloseTo(946.4879593185917, 10);
    expect(placement.y + 152 * placement.scale).toBeCloseTo(2803.6857142857143, 10);
    expect(patch.polygon).toBe(terrain.mountains!.find((m) => m.id === patch.id)!.mass);
  });
  it('uses the unchanged final Echigo PNG alpha frame and preserves all other thirteen placements', () => {
    const bytes = readFileSync('public/assets/textures/terrain-mountain-echigo-massif-v1.png');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '74089743b3a29285d258c4a668fc8406fa6272b8990cf67f66ffbea6635f588c',
    );
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([1091, 1442]);
    expect(Math.max(png.width, png.height)).toBeLessThanOrEqual(2048);
    let minX = png.width,
      minY = png.height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3]! <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    expect([minX, minY, maxX - minX + 1, maxY - minY + 1]).toEqual([26, 20, 1047, 1407]);
    const terrain = buildTerrainPack();
    const old = mountainRasterLayout({
      ...terrain,
      mountainArtById: {
        ...terrain.mountainArtById,
        'mt.echigo': 'texture.terrain.mountain-vertical-v5',
      },
    });
    const actual = mountainRasterLayout(terrain);
    expect(actual.filter((p) => p.id !== 'mt.echigo')).toEqual(
      old.filter((p) => p.id !== 'mt.echigo'),
    );
    expect(actual.filter((p) => p.id !== 'mt.echigo')).toHaveLength(13);
    const patch = actual.find((p) => p.id === 'mt.echigo')!;
    const frame = terrain.mountainArtContentBounds!['texture.terrain.mountain-echigo-massif-v1']!;
    const placement = mountainRasterPlacement(patch, png.width, png.height, frame);
    expect(frame.width * placement.scale).toBeGreaterThan(140);
    expect(frame.height * placement.scale).toBeCloseTo(194.48, 10);
    expect(frame.width / frame.height).toBeGreaterThan(0.74);
    expect(frame.width / frame.height).toBeLessThan(0.75);
  });
  it.each([
    {
      id: 'mt.echigo',
      asset: 'texture.terrain.mountain-echigo-massif-v1',
      dimensions: [1091, 1442],
      frame: { x: 26, y: 20, width: 1047, height: 1407 },
      mass: [167, 221],
      expectedScale: 194.48 / 1407,
      axis: 'texture.terrain.mountain-vertical-v4',
      axisDimensions: [1024, 1536],
      axisFrame: { x: 359, y: 48, width: 339, height: 1381 },
    },
    {
      id: 'mt.akaishi',
      asset: 'texture.terrain.mountain-akaishi-massif-v1',
      dimensions: [1024, 1536],
      frame: { x: 204, y: 13, width: 623, height: 1511 },
      mass: [115, 235],
      expectedScale: 206.8 / 1511,
      axis: 'texture.terrain.mountain-vertical-v4',
      axisDimensions: [1024, 1536],
      axisFrame: { x: 359, y: 48, width: 339, height: 1381 },
    },
    {
      id: 'mt.akaishi',
      asset: 'texture.terrain.mountain-akaishi-massif-v2',
      dimensions: [1024, 1536],
      frame: { x: 143, y: 25, width: 791, height: 1497 },
      mass: [115, 235],
      expectedScale: 206.8 / 1497,
      axis: 'texture.terrain.mountain-vertical-v4',
      axisDimensions: [1024, 1536],
      axisFrame: { x: 359, y: 48, width: 339, height: 1381 },
    },
    {
      id: 'mt.akaishi',
      asset: 'texture.terrain.mountain-akaishi-massif-v3',
      dimensions: [1024, 1536],
      frame: { x: 142, y: 23, width: 787, height: 1495 },
      mass: [115, 235],
      expectedScale: 206.8 / 1495,
      axis: 'texture.terrain.mountain-vertical-v4',
      axisDimensions: [1024, 1536],
      axisFrame: { x: 359, y: 48, width: 339, height: 1381 },
    },
    {
      id: 'mt.kyushu-aso',
      asset: 'texture.terrain.mountain-aso-massif-v1',
      dimensions: [1254, 1254],
      frame: { x: 17, y: 125, width: 1230, height: 1025 },
      mass: [177, 170],
      expectedScale: 155.76 / 1230,
      axis: 'texture.terrain.mountain-horizontal-v3',
      axisDimensions: [1774, 887],
      axisFrame: { x: 12, y: 213, width: 1752, height: 480 },
    },
    {
      id: 'mt.kii',
      asset: 'texture.terrain.mountain-kii-massif-v1',
      dimensions: [1902, 827],
      frame: { x: 43, y: 100, width: 1827, height: 677 },
      mass: [257, 109],
      expectedScale: 226.16 / 1827,
      axis: 'texture.terrain.mountain-horizontal-v3',
      axisDimensions: [1774, 887],
      axisFrame: { x: 12, y: 213, width: 1752, height: 480 },
    },
  ])(
    'fits actual $id massif uniformly and falls back using only the successfully resolved frame',
    (spec) => {
      const base = buildTerrainPack();
      const terrain = {
        ...base,
        mountains: base.mountains!.filter((m) => m.id === spec.id),
        ...(spec.asset === 'texture.terrain.mountain-akaishi-massif-v1' ||
        spec.asset === 'texture.terrain.mountain-akaishi-massif-v2'
          ? { mountainArtById: { ...base.mountainArtById, 'mt.akaishi': spec.asset } }
          : {}),
      };
      const patch = mountainRasterLayout(terrain)[0]!;
      expect([patch.width, patch.height]).toEqual(spec.mass);
      expect(patch.assetId).toBe(spec.asset);
      expect(base.mountainArtContentBounds?.[spec.asset]).toEqual(spec.frame);
      const make = (width: number, height: number) =>
        new Texture({
          source: new BufferImageSource({
            resource: new Uint8Array(width * height * 4),
            width,
            height,
          }),
        });
      const art = make(spec.dimensions[0]!, spec.dimensions[1]!),
        axis = make(spec.axisDimensions[0]!, spec.axisDimensions[1]!),
        old = make(1024, 1536);
      try {
        for (const [textures, resolved, frame] of [
          [
            new Map([
              [spec.asset, art],
              [spec.axis, axis],
              [base.mountainArtAssetId!, old],
            ]),
            art,
            spec.frame,
          ],
          [
            new Map([
              [spec.axis, axis],
              [base.mountainArtAssetId!, old],
            ]),
            axis,
            spec.axisFrame,
          ],
          [
            new Map([[base.mountainArtAssetId!, old]]),
            old,
            { x: 0, y: 0, width: 1024, height: 1536 },
          ],
        ] as const) {
          const raster = createMountainRasterVariants(textures, terrain);
          try {
            const sprite = raster.container.children[0]!.children[0];
            if (!(sprite instanceof Sprite)) throw new Error('Missing actual massif Sprite');
            expect(sprite.texture).toBe(resolved);
            expect(sprite.scale.x).toBe(sprite.scale.y);
            expect(sprite.rotation).toBe(0);
            if (resolved === art) expect(sprite.scale.x).toBeCloseTo(spec.expectedScale, 12);
            const scale = Math.min(
              patch.ridge!.axis === 'vertical'
                ? Math.max(patch.ridge!.spanY * 1.05, patch.height * 0.88) / frame.height
                : Math.max(patch.ridge!.spanX * 1.05, patch.width * 0.88) / frame.width,
              (patch.width * 0.96) / frame.width,
              (patch.height * 0.96) / frame.height,
            );
            expect(sprite.scale.x).toBeCloseTo(scale, 12);
            const left = sprite.x + frame.x * scale,
              top = sprite.y + frame.y * scale;
            expect(left).toBeGreaterThanOrEqual(patch.x - 1e-9);
            expect(top).toBeGreaterThanOrEqual(patch.y - 1e-9);
            expect(left + frame.width * scale).toBeLessThanOrEqual(patch.x + patch.width + 1e-9);
            expect(top + frame.height * scale).toBeLessThanOrEqual(patch.y + patch.height + 1e-9);
            expect(raster.coveredIds).toEqual(new Set([spec.id]));
          } finally {
            raster.destroy();
          }
        }
        const missing = createMountainRasterVariants(new Map(), terrain);
        expect(missing.coveredIds.size).toBe(0);
        missing.destroy();
        expect([art, axis, old].every((texture) => !texture.destroyed)).toBe(true);
      } finally {
        for (const texture of [art, axis, old]) texture.destroy(true);
      }
    },
  );
  it('retains horizontal v3 except the original Aso, Chugoku, Shikoku and Kii massifs', () => {
    const patches = mountainRasterLayout(buildTerrainPack());
    for (const patch of patches.filter(
      (p) =>
        p.ridge?.axis === 'horizontal' &&
        !['mt.kyushu-aso', 'mt.chugoku', 'mt.shikoku', 'mt.kii'].includes(p.id),
    ))
      expect(patch.assetId).toBe('texture.terrain.mountain-horizontal-v3');
    expect(patches.find((p) => p.id === 'mt.kyushu-aso')?.assetId).toBe(
      'texture.terrain.mountain-aso-massif-v1',
    );
    expect(patches.filter((p) => p.ridge?.axis === 'horizontal')).toHaveLength(7);
  });

  it('retains Suzuka v5 with distinct original Kiso, Echigo, Akaishi and Ibuki without changing authored geometry', () => {
    const terrain = buildTerrainPack();
    const patches = mountainRasterLayout(terrain);
    expect(patches.find((p) => p.id === 'mt.kiso')?.assetId).toBe(
      'texture.terrain.mountain-kiso-massif-v1',
    );
    for (const id of ['mt.suzuka'])
      expect(patches.find((p) => p.id === id)?.assetId).toBe(
        'texture.terrain.mountain-vertical-v5',
      );
    expect(patches.find((p) => p.id === 'mt.echigo')?.assetId).toBe(
      'texture.terrain.mountain-echigo-massif-v1',
    );
    expect(patches.find((p) => p.id === 'mt.akaishi')?.assetId).toBe(
      'texture.terrain.mountain-akaishi-massif-v3',
    );
    expect(patches.find((p) => p.id === 'mt.ibuki')?.assetId).toBe(
      'texture.terrain.mountain-foothills-v1',
    );
    expect(patches.find((p) => p.id === 'mt.hida')?.assetId).toBe(
      'texture.terrain.mountain-hida-massif-v2',
    );
    for (const id of ['mt.ou'])
      expect(patches.find((p) => p.id === id)?.assetId).toBe(
        'texture.terrain.mountain-vertical-v4',
      );
    expect(patches).toHaveLength(14);
    for (const patch of patches)
      expect(patch.polygon).toBe(terrain.mountains?.find((m) => m.id === patch.id)?.mass);
  });

  it('resolves per-ID art, then axis art, then v1 using only the actual chosen content frame', () => {
    const base = buildTerrainPack();
    const terrain = {
      ...base,
      mountains: base.mountains?.filter((m) => m.id === 'mt.kiso') ?? [],
      mountainArtById: { 'mt.kiso': 'texture.terrain.mountain-vertical-v5' },
      mountainArtContentBounds: {
        ...base.mountainArtContentBounds,
        'texture.terrain.mountain-vertical-v5': { x: 248, y: 29, width: 482, height: 1570 },
      },
    };
    const make = (width: number, height: number) =>
      new Texture({
        source: new BufferImageSource({
          resource: new Uint8Array(width * height * 4),
          width,
          height,
        }),
      });
    const v5 = make(967, 1626),
      v4 = make(1024, 1536),
      v1 = make(1024, 1536);
    const patch = mountainRasterLayout(terrain)[0]!;
    try {
      for (const [chosenId, textures, chosen] of [
        [
          'texture.terrain.mountain-vertical-v5',
          new Map([
            ['texture.terrain.mountain-vertical-v5', v5],
            ['texture.terrain.mountain-vertical-v4', v4],
            [terrain.mountainArtAssetId!, v1],
          ]),
          v5,
        ],
        [
          'texture.terrain.mountain-vertical-v4',
          new Map([
            ['texture.terrain.mountain-vertical-v4', v4],
            [terrain.mountainArtAssetId!, v1],
          ]),
          v4,
        ],
        [terrain.mountainArtAssetId!, new Map([[terrain.mountainArtAssetId!, v1]]), v1],
      ] as const) {
        const raster = createMountainRasterVariants(textures, terrain);
        try {
          const sprite = raster.container.children[0]?.children[0];
          if (!(sprite instanceof Sprite)) throw new Error('Missing selected public Sprite');
          const frame =
            chosenId === 'texture.terrain.mountain-vertical-v5'
              ? terrain.mountainArtContentBounds['texture.terrain.mountain-vertical-v5']
              : base.mountainArtContentBounds?.[chosenId];
          const placement = mountainRasterPlacement(patch, chosen.width, chosen.height, frame);
          expect(sprite.texture).toBe(chosen);
          expect(sprite.position.x).toBeCloseTo(placement.x);
          expect(sprite.position.y).toBeCloseTo(placement.y);
          expect(sprite.scale.x).toBeCloseTo(placement.scale);
          expect(sprite.scale.y).toBe(sprite.scale.x);
          expect(sprite.rotation).toBe(0);
          expect(raster.coveredIds).toEqual(new Set(['mt.kiso']));
        } finally {
          raster.destroy();
        }
      }
      const missing = createMountainRasterVariants(new Map(), terrain);
      expect(missing.coveredIds.size).toBe(0);
      missing.destroy();
      expect([v5, v4, v1].every((t) => !t.destroyed)).toBe(true);
    } finally {
      for (const t of [v5, v4, v1]) t.destroy(true);
    }
  });

  it('feathers authored interiors with bounded deterministic red coverage, opaque alpha and degenerate safety', () => {
    const patch = {
      id: 'triangle',
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      assetId: undefined,
      ridge: undefined,
    };
    const before = JSON.stringify(patch);
    const mask = mountainFeatherMask(patch);
    expect(mask).toEqual(mountainFeatherMask(patch));
    expect(mask.size).toBe(128);
    expect(mask.pixels).toHaveLength(128 * 128 * 4);
    const red = (x: number, y: number) => mask.pixels[(y * mask.size + x) * 4]!;
    expect(red(32, 32)).toBe(255);
    expect(red(0, 0)).toBeLessThan(3);
    expect(red(110, 110)).toBe(0);
    expect(red(3, 32)).toBeGreaterThan(0);
    expect(red(3, 32)).toBeLessThan(255);
    for (let i = 0; i < mask.pixels.length; i += 4) {
      expect(mask.pixels[i + 1]).toBe(mask.pixels[i]);
      expect(mask.pixels[i + 2]).toBe(mask.pixels[i]);
      expect(mask.pixels[i + 3]).toBe(255);
    }
    expect(JSON.stringify(patch)).toBe(before);
    for (const polygon of [
      [],
      [{ x: 0, y: 0 }],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    ]) {
      const degenerate = mountainFeatherMask({ ...patch, polygon });
      expect(
        degenerate.pixels.filter((_, index) => index % 4 === 0).every((value) => value === 0),
      ).toBe(true);
    }
  });

  it('keeps exact polygon clip around the public red-channel mask and owns only its mask texture', () => {
    const terrain = buildTerrainPack();
    const texture = new Texture({ source: Texture.WHITE.source });
    const raster = createMountainRasterVariants(
      new Map([[terrain.mountainArtAssetId!, texture]]),
      terrain,
    );
    const group = raster.container.children[0];
    const clip = raster.container.children[1];
    if (!(group instanceof Container) || !(clip instanceof Graphics))
      throw new Error('Missing exact outer clip');
    const art = group.children[0];
    const mask = group.children[1];
    if (!(art instanceof Sprite) || !(mask instanceof Sprite)) throw new Error('Missing soft mask');
    expect(group.mask).toBe(clip);
    expect(art.mask).toBe(mask);
    expect(art.effects?.some((effect) => 'channel' in effect && effect.channel === 'red')).toBe(
      true,
    );
    const source = mask.texture.source;
    const owned = mask.texture;
    expect(source.width).toBe(128);
    expect(source.height).toBe(128);
    expect(raster.container.children).toHaveLength(28);
    raster.destroy();
    expect(owned.destroyed).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(texture.destroyed).toBe(false);
    texture.destroy(false);
  });
  it('compensates actual square PNG transparent margins using the authored content frame', () => {
    // Keep the supported v2 square-canvas margin regression, independent of the selected v3 art.
    const terrain = {
      ...buildTerrainPack(),
      mountainArtById: {},
      mountainArtVariants: {
        vertical: 'texture.terrain.mountain-vertical-v2',
        horizontal: 'texture.terrain.mountain-horizontal-v2',
      },
    };
    const patch = mountainRasterLayout(terrain).find((p) => p.id === 'mt.chugoku');
    const frame = terrain.mountainArtContentBounds?.['texture.terrain.mountain-horizontal-v2'];
    if (!patch || !frame) throw new Error('Missing authored horizontal metadata');
    const layout = mountainRasterPlacement(patch, 1254, 1254, frame);
    const whole = mountainRasterPlacement(patch, 1254, 1254);
    expect(layout.scale * frame.width).toBeGreaterThan(whole.scale * 1254 * 2);
    const left = layout.x + frame.x * layout.scale;
    const top = layout.y + frame.y * layout.scale;
    expect(left).toBeGreaterThanOrEqual(patch.x);
    expect(left + frame.width * layout.scale).toBeLessThanOrEqual(patch.x + patch.width);
    expect(top).toBeGreaterThanOrEqual(patch.y);
    expect(top + frame.height * layout.scale).toBeLessThanOrEqual(patch.y + patch.height);
    expect(layout.y).toBeLessThan(top);
    for (const invalid of [
      { ...frame, x: -1 },
      { ...frame, width: 0 },
      { ...frame, x: NaN },
      { ...frame, width: 2000 },
    ]) {
      expect(mountainRasterPlacement(patch, 1254, 1254, invalid)).toEqual(whole);
    }
    const source = new BufferImageSource({
      resource: new Uint8Array(1254 * 1254 * 4),
      width: 1254,
      height: 1254,
    });
    const texture = new Texture({ source });
    const raster = createMountainRasterVariants(
      new Map([['texture.terrain.mountain-horizontal-v2', texture]]),
      terrain,
    );
    const index = mountainRasterLayout(terrain)
      .filter((p) => p.assetId === 'texture.terrain.mountain-horizontal-v2')
      .findIndex((p) => p.id === patch.id);
    const sprite = raster.container.children[index * 2]?.children[0];
    if (!(sprite instanceof Sprite)) throw new Error('Missing actual public Sprite');
    expect(sprite.position.x).toBeCloseTo(layout.x);
    expect(sprite.position.y).toBeCloseTo(layout.y);
    expect(sprite.scale.x).toBeCloseTo(layout.scale);
    expect(sprite.scale.y).toBe(sprite.scale.x);
    expect(sprite.rotation).toBe(0);
    raster.destroy();
    expect(texture.destroyed).toBe(false);
    texture.destroy(true);
  });

  it('uses the actual adopted horizontal v3 dimensions uniformly without shortening its ridge span', () => {
    // Retain the supported h3 geometry regression independently of the new per-ID overrides.
    const terrain = { ...buildTerrainPack(), mountainArtById: {} };
    const id = 'texture.terrain.mountain-horizontal-v3';
    const frame = terrain.mountainArtContentBounds?.[id];
    const patch = mountainRasterLayout(terrain).find((p) => p.id === 'mt.chugoku');
    if (!frame || !patch) throw new Error('Missing adopted horizontal metadata');
    expect(patch.assetId).toBe(id);
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(1774 * 887 * 4),
        width: 1774,
        height: 887,
      }),
    });
    const raster = createMountainRasterVariants(new Map([[id, texture]]), terrain);
    const selected = mountainRasterLayout(terrain).filter((p) => p.assetId === id);
    const index = selected.findIndex((p) => p.id === patch.id);
    const sprite = raster.container.children[index * 2]?.children[0];
    if (!(sprite instanceof Sprite)) throw new Error('Missing adopted original Sprite');
    const placement = mountainRasterPlacement(patch, 1774, 887, frame);
    expect(sprite.texture).toBe(texture);
    expect(sprite.scale.x).toBeCloseTo(placement.scale);
    expect(sprite.scale.y).toBe(sprite.scale.x);
    expect(sprite.rotation).toBe(0);
    expect(sprite.position.x).toBeCloseTo(placement.x);
    expect(sprite.position.y).toBeCloseTo(placement.y);
    const legacyFrame =
      terrain.mountainArtContentBounds?.['texture.terrain.mountain-horizontal-v2'];
    if (!legacyFrame) throw new Error('Missing retained legacy frame');
    const legacy = mountainRasterPlacement(patch, 1254, 1254, legacyFrame);
    expect(frame.width * placement.scale).toBeCloseTo(legacyFrame.width * legacy.scale);
    expect(frame.height * placement.scale).toBeLessThanOrEqual(patch.height * 0.96);
    expect(raster.coveredIds.size).toBe(selected.length);
    raster.destroy();
    expect(texture.destroyed).toBe(false);
    texture.destroy(true);
  });

  it.each([
    ['mt.hida', 264],
    ['mt.kiso', 212.96],
  ] as const)(
    'retains %s full ridge length with real vertical v4 Sprite geometry',
    (id, height) => {
      // Preserve the v4 supported-asset geometry regression independently of the new overrides.
      const terrain = { ...buildTerrainPack(), mountainArtById: {} };
      const assetId = 'texture.terrain.mountain-vertical-v4';
      const frame = terrain.mountainArtContentBounds?.[assetId];
      const selected = mountainRasterLayout(terrain).filter((p) => p.assetId === assetId);
      const index = selected.findIndex((p) => p.id === id);
      const patch = selected[index];
      const legacyFrame =
        terrain.mountainArtContentBounds?.['texture.terrain.mountain-vertical-v2'];
      if (!frame || !patch || !legacyFrame) throw new Error('Missing inspected vertical metadata');
      const texture = new Texture({
        source: new BufferImageSource({
          resource: new Uint8Array(1024 * 1536 * 4),
          width: 1024,
          height: 1536,
        }),
      });
      const raster = createMountainRasterVariants(new Map([[assetId, texture]]), terrain);
      const sprite = raster.container.children[index * 2]?.children[0];
      if (!(sprite instanceof Sprite)) throw new Error('Missing actual vertical Sprite');
      const placement = mountainRasterPlacement(patch, 1024, 1536, frame);
      const legacy = mountainRasterPlacement(patch, 1024, 1536, legacyFrame);
      expect(sprite.texture).toBe(texture);
      expect(sprite.rotation).toBe(0);
      expect(sprite.scale.x).toBeCloseTo(placement.scale);
      expect(sprite.scale.y).toBe(sprite.scale.x);
      expect(sprite.position.x).toBeCloseTo(placement.x);
      expect(sprite.position.y).toBeCloseTo(placement.y);
      expect(frame.height * placement.scale).toBeCloseTo(height);
      expect(frame.height * placement.scale).toBeCloseTo(legacyFrame.height * legacy.scale);
      expect(frame.width * placement.scale).toBeLessThan(legacyFrame.width * legacy.scale);
      expect(raster.coveredIds.size).toBe(selected.length);
      raster.destroy();
      expect(texture.destroyed).toBe(false);
      texture.destroy(true);
    },
  );

  it('failed variant uses only fallback texture geometry, never the failed content frame', () => {
    const terrain = buildTerrainPack();
    const texture = new Texture({ source: Texture.WHITE.source });
    const raster = createMountainRasterVariants(
      new Map([[terrain.mountainArtAssetId!, texture]]),
      terrain,
    );
    mountainRasterLayout(terrain).forEach((patch, index) => {
      const sprite = raster.container.children[index * 2]?.children[0];
      if (!(sprite instanceof Sprite)) throw new Error('Missing fallback Sprite');
      const expected = mountainRasterPlacement(patch, texture.width, texture.height);
      expect(sprite.position.x).toBeCloseTo(expected.x);
      expect(sprite.position.y).toBeCloseTo(expected.y);
      expect(sprite.scale.x).toBeCloseTo(expected.scale);
    });
    expect(raster.coveredIds.size).toBe(14);
    raster.destroy();
    texture.destroy(false);
  });
  it('selects the longest authored ridge direction and covers its span without rotation or stretch', () => {
    const authored = new Map(mountainRasterLayout(buildTerrainPack()).map((p) => [p.id, p]));
    expect(authored.get('mt.chugoku')?.ridge?.axis).toBe('horizontal');
    expect(authored.get('mt.kii')?.ridge?.axis).toBe('horizontal');
    expect(authored.get('mt.ou')?.ridge?.axis).toBe('vertical');
    const terrain = {
      ...buildTerrainPack(),
      mountainArtVariants: { horizontal: 'art.horizontal', vertical: 'art.vertical' },
      mountains: [
        {
          id: 'wide',
          tier: 1 as const,
          mass: [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
            { x: 300, y: 140 },
            { x: 0, y: 140 },
          ],
          ridges: [
            [
              { x: 20, y: 20 },
              { x: 20, y: 100 },
            ],
            [
              { x: 40, y: 90 },
              { x: 260, y: 90 },
            ],
          ],
        },
      ],
    };
    const [patch] = mountainRasterLayout(terrain);
    if (!patch) throw new Error('Missing authored patch');
    expect(patch.assetId).toBe('art.horizontal');
    expect(patch.ridge).toMatchObject({
      axis: 'horizontal',
      centerX: 150,
      centerY: 90,
      spanX: 220,
    });
    const fitted = mountainRasterPlacement(patch, 3000, 1000);
    expect(fitted.scale * 3000).toBeCloseTo(264);
    expect(fitted.y + (fitted.scale * 1000) / 2).toBeCloseTo(90);
    expect(fitted.x).toBeGreaterThanOrEqual(patch.x);
    expect(fitted.y + fitted.scale * 1000).toBeLessThanOrEqual(patch.y + patch.height);
    const portraitFallback = mountainRasterPlacement(patch, 1024, 1536);
    expect(fitted.scale * 3000).toBeGreaterThan(portraitFallback.scale * 1024 * 2);
    const vertical = mountainRasterLayout({
      ...terrain,
      mountains: [
        {
          ...terrain.mountains[0]!,
          ridges: [
            [
              { x: 100, y: 10 },
              { x: 100, y: 130 },
            ],
          ],
        },
      ],
    })[0]!;
    expect(vertical.assetId).toBe('art.vertical');
    expect(vertical.ridge?.axis).toBe('vertical');
  });

  it('keeps segment subdivision invariant and falls back per patch without hiding unavailable geometry', () => {
    const base = buildTerrainPack();
    const terrain = {
      ...base,
      mountainArtAssetId: 'fallback',
      mountainArtVariants: { horizontal: 'horizontal', vertical: 'vertical' },
      // This legacy axis-only fixture intentionally excludes the production per-ID overrides.
      mountainArtById: {},
    };
    const a = new Texture({ source: Texture.WHITE.source });
    const raster = createMountainRasterVariants(new Map([['horizontal', a]]), terrain);
    const expected = mountainRasterLayout(terrain).filter((p) => p.assetId === 'horizontal');
    expect([...raster.coveredIds]).toEqual(expected.map((p) => p.id));
    expect(raster.container.children).toHaveLength(expected.length * 2);
    raster.destroy();
    expect(a.destroyed).toBe(false);
    const fallback = createMountainRasterVariants(new Map([['fallback', a]]), terrain);
    expect(fallback.coveredIds.size).toBe(14);
    fallback.destroy();
    a.destroy(false);
    const mass = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 140 },
      { x: 0, y: 140 },
    ];
    const simple = {
      ...base,
      mountains: [
        {
          id: 'line',
          tier: 1 as const,
          mass,
          ridges: [
            [
              { x: 40, y: 90 },
              { x: 260, y: 90 },
            ],
          ],
        },
      ],
    };
    const split = {
      ...simple,
      mountains: [
        {
          ...simple.mountains[0]!,
          ridges: [
            [
              { x: 40, y: 90 },
              { x: 150, y: 90 },
              { x: 260, y: 90 },
            ],
          ],
        },
      ],
    };
    expect(mountainRasterLayout(split)).toEqual(mountainRasterLayout(simple));
  });
  it('caps pure forest artwork separately, shares texture safely and suppresses only forest cones', () => {
    const terrain = buildTerrainPack();
    const layout = forestRasterLayout(terrain);
    expect(layout).toHaveLength(10);
    const texture = new Texture({ source: Texture.WHITE.source });
    const raster = createForestRaster(texture, terrain);
    expect(raster.container.children).toHaveLength(20);
    const gfx = new Graphics();
    const fill = vi.spyOn(gfx, 'fill');
    drawDimensionalTerrain(gfx, terrain, new Set(), new Set(layout.map((p) => p.id)));
    const retained = buildReliefFaces(terrain).filter((face) => face.forestId === undefined);
    expect(fill).toHaveBeenCalledTimes(retained.length);
    expect(retained.some((face) => face.ground !== undefined)).toBe(true);
    raster.destroy();
    expect(texture.destroyed).toBe(false);
    texture.destroy(false);
    gfx.destroy();
  });
  it('replaces only successful patch faces, leaving uncovered mountains and flat forest fallback', () => {
    const terrain = buildTerrainPack();
    const faces = buildReliefFaces(terrain);
    const covered = new Set([terrain.mountains![0]!.id]);
    const gfx = new Graphics();
    const fill = vi.spyOn(gfx, 'fill');
    drawDimensionalTerrain(gfx, terrain, covered);
    const retained = faces.filter(
      (face) => face.mountainId === undefined || !covered.has(face.mountainId),
    );
    expect(fill).toHaveBeenCalledTimes(retained.length);
    expect(retained.length).toBeLessThan(faces.length);
    expect(retained.some((face) => face.mountainId === undefined)).toBe(true);
    expect(retained.some((face) => face.ground !== undefined)).toBe(true);
    gfx.destroy();
  });
  it('uses actual public Graphics masks, equal-scale containment and bounded static geometry', () => {
    const terrain = buildTerrainPack();
    const layout = mountainRasterLayout(terrain);
    expect(layout).toHaveLength(14);
    const texture = new Texture({ source: Texture.WHITE.source });
    const a = createMountainRaster(texture, terrain);
    const b = createMountainRaster(texture, terrain);
    expect(a.container.eventMode).toBe('none');
    expect(a.container.children).toHaveLength(28);
    layout.forEach((patch, index) => {
      const sprite = a.container.children[index * 2];
      const mask = a.container.children[index * 2 + 1];
      expect(sprite).toBeInstanceOf(Sprite);
      expect(mask).toBeInstanceOf(Graphics);
      if (!(sprite instanceof Sprite) || !(mask instanceof Graphics)) throw new Error('Bad batch');
      expect(sprite.mask).toBe(mask);
      expect(sprite.scale.x).toBe(sprite.scale.y);
      expect(sprite.rotation).toBe(0);
      expect(sprite.width).toBeLessThanOrEqual(patch.width);
      expect(sprite.height).toBeLessThanOrEqual(patch.height);
      expect(mask.context.instructions).toHaveLength(1);
    });
    a.destroy();
    expect(texture.destroyed).toBe(false);
    expect(b.container.children).toHaveLength(28);
    b.destroy();
    texture.destroy(false);
  });

  it('retains authored coordinates and deterministic fourteen-patch limit', () => {
    const terrain = buildTerrainPack();
    const original = JSON.stringify(terrain);
    const first = mountainRasterLayout(terrain);
    expect(mountainRasterLayout(terrain)).toEqual(first);
    expect(JSON.stringify(terrain)).toBe(original);
    expect(
      mountainRasterLayout({
        ...terrain,
        mountains: [...terrain.mountains!, ...terrain.mountains!],
      }),
    ).toHaveLength(14);
  });
});
