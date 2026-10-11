import { Sprite, Texture, Container, BufferImageSource, Graphics } from 'pixi.js';
import type { FillInstruction } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createForestRaster, forestRasterLayout } from '@ui/map/terrain/terrainRaster';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { MapRenderer } from '@ui/map/MapRenderer';
import { Camera } from '@ui/map/camera';

const valid = {
  id: 'fo.valid',
  polygon: [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 50, y: 50 },
    { x: 10, y: 50 },
  ],
};
const empty = {
  id: 'fo.empty',
  polygon: [
    { x: 60, y: 60 },
    { x: 70, y: 70 },
    { x: 80, y: 80 },
  ],
};
const terrain = { ...buildTerrainPack(), forests: [valid, empty] };

describe('actual emitted forest coverage, not planned patches', () => {
  it('does not claim a zero-area clip as painted just because its bounding box is positive', () => {
    const raster = createForestRaster(Texture.EMPTY, terrain);
    try {
      expect([...raster.coveredIds]).toEqual(['fo.valid']);
    } finally {
      raster.destroy();
    }
  });
  it('retains baked fallback for a missing actual forest and requires every original ID', () => {
    const raster = createForestRaster(Texture.EMPTY, terrain);
    const renderer = new MapRenderer();
    Object.defineProperties(renderer, {
      forestRaster: { value: raster, configurable: true },
      staticData: { value: { terrain }, configurable: true },
    });
    const complete = Reflect.get(renderer, 'hasCompleteForestCoverage') as
      (() => boolean) | undefined;
    expect(complete).toBeTypeOf('function');
    if (typeof complete !== 'function') throw new Error('Missing forest coverage seam');
    expect(Reflect.apply(complete, renderer, [])).toBe(false);
    Object.defineProperty(renderer, 'staticData', {
      value: { terrain: { ...terrain, forests: [valid] } },
      configurable: true,
    });
    expect(Reflect.apply(complete, renderer, [])).toBe(true);
    Object.defineProperty(renderer, 'staticData', {
      value: { terrain: { ...terrain, forests: [empty] } },
      configurable: true,
    });
    expect(Reflect.apply(complete, renderer, [])).toBe(false);
    raster.destroy();
    expect(Reflect.apply(complete, renderer, [])).toBe(false);
  });
  it('keeps the actual baked Sprite visible through the real LOD method until all original forests are painted', () => {
    const renderer = new MapRenderer();
    const raster = createForestRaster(Texture.EMPTY, terrain);
    const baked = new Sprite(Texture.EMPTY);
    Object.defineProperties(renderer, {
      forestRaster: { value: raster, configurable: true },
      staticData: { value: { terrain }, configurable: true },
      forestSprite: { value: baked, configurable: true },
      camera: { value: new Camera({ x: 0, y: 0, scale: 1.25 }), configurable: true },
      app: { value: { screen: { width: 1280, height: 720 } }, configurable: true },
      layers: {
        value: {
          armies: new Container(),
          actorBodies: new Container(),
          roads: new Container(),
          labels: new Container(),
          settlements: new Container(),
        },
        configurable: true,
      },
      lodStage: { value: 'near', configurable: true },
      armyChipStage: { value: 'near', configurable: true },
      lastLabelScale: { value: 1.25, configurable: true },
      lastNameplateScale: { value: 1.25, configurable: true },
      lastCameraIdle: { value: true, configurable: true },
    });
    const apply = Reflect.get(renderer, 'applyLodAndCulling') as () => void;
    Reflect.apply(apply, renderer, []);
    expect(baked.visible).toBe(true);
    Object.defineProperty(renderer, 'staticData', {
      value: { terrain: { ...terrain, forests: [valid] } },
      configurable: true,
    });
    Reflect.apply(apply, renderer, []);
    expect(baked.visible).toBe(false);
    raster.destroy();
    Reflect.apply(apply, renderer, []);
    expect(baked.visible).toBe(true);
    baked.destroy({ texture: false, textureSource: false });
  });
  it('retains every legacy uniform placement and mask instruction for all ten normal forests using a real nonsquare texture', () => {
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(20 * 10 * 4).fill(255),
        width: 20,
        height: 10,
      }),
    });
    const original = buildTerrainPack();
    const raster = createForestRaster(texture, original);
    const patches = forestRasterLayout(original);
    expect(raster.coveredIds.size).toBe(10);
    patches.forEach((patch, index) => {
      const actual = raster.container.children[index * 2] as Sprite;
      const clip = raster.container.children[index * 2 + 1] as Graphics;
      const legacyScale = Math.min(patch.width / 20, patch.height / 10) * 0.9;
      expect(actual.scale).toMatchObject({ x: legacyScale, y: legacyScale });
      expect(actual.position).toMatchObject({
        x: patch.x + patch.width / 2 - (20 * legacyScale) / 2,
        y: patch.y + patch.height / 2 - (10 * legacyScale) / 2,
      });
      expect(actual.rotation).toBe(0);
      expect(actual.texture).toBe(texture);
      expect(actual.mask).toBe(clip);
      const legacyClip = new Graphics()
        .poly(patch.polygon.flatMap((p) => [p.x, p.y]))
        .fill(0xffffff);
      const shapes = (g: Graphics) =>
        g.context.instructions
          .filter((i): i is FillInstruction => i.action === 'fill')
          .map((i) => i.data.path.shapePath.shapePrimitives.map((p) => p.shape));
      expect(shapes(clip)).toEqual(shapes(legacyClip));
      legacyClip.destroy({ context: true });
    });
    raster.destroy();
    expect(texture.destroyed).toBe(false);
    texture.destroy(true);
  });
  it('records all ten actual V1 placements with immutable source-independent clips and clears after teardown', () => {
    const original = buildTerrainPack();
    const raster = createForestRaster(Texture.EMPTY, original);
    const get = Reflect.get(raster, 'getPresentationGeometry');
    expect(get).toBeTypeOf('function');
    if (typeof get !== 'function') throw new Error('Missing emitted forest records');
    const records = Reflect.apply(get, raster, []) as readonly {
      id: string;
      assetId: string;
      sourcePixelSize: { width: number; height: number };
      position: { x: number; y: number };
      scale: number;
      clipId: string;
      clipPolygon: readonly { x: number; y: number }[];
      worldPaintFrame: { x: number; y: number; width: number; height: number };
    }[];
    expect(records).toHaveLength(10);
    expect(records.map((r) => r.id)).toEqual([...raster.coveredIds]);
    const sprites = raster.container.children.filter((c): c is Sprite => c instanceof Sprite);
    expect(sprites).toHaveLength(10);
    for (const record of records) {
      const sprite = sprites[records.indexOf(record)]!;
      expect(record.position).toEqual({ x: sprite.position.x, y: sprite.position.y });
      expect(record.scale).toBe(sprite.scale.x);
      expect(sprite.scale.x).toBe(sprite.scale.y);
      expect(sprite.rotation).toBe(0);
      expect(record.assetId).toBe('texture.terrain.forest-canopy-v1');
      expect(record.sourcePixelSize).toEqual({ width: 1, height: 1 });
      expect(record.worldPaintFrame).toEqual({
        ...record.position,
        width: record.scale,
        height: record.scale,
      });
      expect(record.clipPolygon).toEqual(
        original.forests!.find((f) => f.id === record.id)!.polygon,
      );
      expect(record.clipPolygon).not.toBe(
        original.forests!.find((f) => f.id === record.id)!.polygon,
      );
      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.clipPolygon[0])).toBe(true);
      expect(raster.container.children.some((c) => c.label === record.clipId)).toBe(true);
    }
    expect(Object.isFrozen(records)).toBe(true);
    expect(Reflect.apply(get, raster, [])).toBe(records);
    raster.destroy();
    raster.destroy();
    expect(Reflect.apply(get, raster, [])).toEqual([]);
    expect(raster.coveredIds.size).toBe(0);
    expect(Texture.EMPTY.destroyed).toBe(false);
  });
});
