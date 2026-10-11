import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import {
  createMountainMaterial,
  mountainMaterialMask,
  MOUNTAIN_MATERIAL,
  type MountainMaterialPatch,
} from '@ui/map/terrain/terrainMountainMaterial';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createMountainRasterVariants, mountainRasterLayout } from '@ui/map/terrain/terrainRaster';
import { prepareMountainRiverContact } from '@ui/map/terrain/mountainRiverContact';

const patch = {
  id: 'diagnostic-triangle',
  x: 100,
  y: 200,
  width: 96,
  height: 96,
  polygon: [
    { x: 100, y: 200 },
    { x: 196, y: 200 },
    { x: 100, y: 296 },
  ],
};
const ridges = [
  [
    { x: 116, y: 216 },
    { x: 144, y: 244 },
  ],
];
const sharedTexture = () =>
  new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(8 * 8 * 4), width: 8, height: 8 }),
  });

/** Independent pre-optimization algorithm: hypot per edge/ridge, preserving its arithmetic order. */
function originalMask(
  patch: MountainMaterialPatch,
  ridges: readonly (readonly { x: number; y: number }[])[],
  candidate = false,
) {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  const segments = ridges.flatMap((line) => line.slice(1).map((b, i) => [line[i]!, b] as const));
  const radius = Math.min(patch.width, patch.height) * 0.48;
  const band = candidate
    ? Math.min(40, Math.min(patch.width, patch.height) * 0.25)
    : Math.min(26, Math.min(patch.width, patch.height) * 0.15);
  const distance = (
    x: number,
    y: number,
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const x = patch.x + ((col + 0.5) / size) * patch.width;
      const y = patch.y + ((row + 0.5) / size) * patch.height;
      let inside = false,
        edge = Infinity;
      for (let i = 0; i < patch.polygon.length; i++) {
        const a = patch.polygon[i]!,
          b = patch.polygon[(i + 1) % patch.polygon.length]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
        edge = Math.min(edge, distance(x, y, a, b));
      }
      let coverage = 0;
      if (inside && radius > 0 && band > 0 && segments.length > 0) {
        let ridgeDistance = Infinity;
        for (const [a, b] of segments)
          ridgeDistance = Math.min(ridgeDistance, distance(x, y, a, b));
        const height = Math.exp(-Math.pow(ridgeDistance / radius, 2) * 1.4);
        const fade = Math.min(1, edge / band);
        if (candidate) {
          const support = Math.max(0, Math.min(1, 1 - ridgeDistance ** 2 / (radius ** 2 * 2.25)));
          const edgeRamp = 6 * fade ** 5 - 15 * fade ** 4 + 10 * fade ** 3;
          const ridgeRamp = 6 * support ** 5 - 15 * support ** 4 + 10 * support ** 3;
          coverage = Math.round(255 * edgeRamp * Math.pow(height, 1.7) * ridgeRamp * 0.62);
        } else
          coverage = Math.round(255 * fade * fade * (3 - 2 * fade) * Math.pow(height, 1.7) * 0.62);
      }
      const offset = (row * size + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = coverage;
      pixels[offset + 3] = 255;
    }
  return pixels;
}

describe('static original wooded foothill material', () => {
  it('attenuates actual woodland RED coverage at river contact without changing allocation', () => {
    const contact = prepareMountainRiverContact([
      { id: 'river', a: { x: 100, y: 230 }, b: { x: 180, y: 230 }, radius: 2 },
    ]);
    const old = mountainMaterialMask(patch, ridges);
    const actual = mountainMaterialMask(patch, ridges, contact);
    let reduced = 0,
      changedAlpha = 0;
    for (let i = 0; i < old.pixels.length; i += 4) {
      if (actual.pixels[i]! < old.pixels[i]!) reduced++;
      if (actual.pixels[i + 3] !== 255) changedAlpha++;
    }
    expect(reduced).toBeGreaterThan(0);
    expect(changedAlpha).toBe(0);
    expect(actual.pixels.length).toBe(old.pixels.length);
  });
  it('softens a straight foothill edge while keeping the ridge and removing distant polygon shoulders', () => {
    const square = {
      id: 'continuous-foothill',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      polygon: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ],
    };
    const crest = [
      [
        { x: 100, y: 70 },
        { x: 100, y: 130 },
      ],
    ];
    const actual = mountainMaterialMask(square, crest).pixels;
    const before = originalMask(square, crest);
    const at = (data: Uint8Array, x: number, y: number) =>
      data[(Math.floor((y / 200) * 256) * 256 + Math.floor((x / 200) * 256)) * 4]!;
    // Fixed independent cross-section, not the implementation's band constant.
    for (const y of [3, 6, 9, 12]) {
      expect(at(before, 100, y)).toBeGreaterThan(0);
      expect(at(actual, 100, y)).toBeLessThanOrEqual(at(before, 100, y) * 0.55);
    }
    expect(at(actual, 100, 100)).toBeGreaterThan(150);
    const narrowCrest = [
      [
        { x: 20, y: 70 },
        { x: 20, y: 130 },
      ],
    ];
    const shoulder = mountainMaterialMask(square, narrowCrest).pixels;
    expect(at(originalMask(square, narrowCrest), 166, 100)).toBeGreaterThan(0);
    expect(at(shoulder, 166, 100)).toBe(0);
  });
  it.each(['no-ridges', 'zero-extent'] as const)(
    'does no nearest-edge work for %s when no pixels can contribute coverage',
    (kind) => {
      const min = Math.min;
      let minCalls = 0;
      let mask: ReturnType<typeof mountainMaterialMask>;
      // A non-recording counter avoids storing hundreds of thousands of mock argument arrays.
      Math.min = (...values: number[]) => {
        minCalls++;
        return min(...values);
      };
      try {
        mask = mountainMaterialMask(
          kind === 'zero-extent' ? { ...patch, width: 0, height: 0 } : patch,
          kind === 'no-ridges' ? [] : ridges,
        );
      } finally {
        Math.min = min;
      }
      expect(minCalls).toBe(3); // Only radius/band setup; no per-pixel distance minima.
      expect(mask.pixels.filter((_, i) => i % 4 === 0).every((v) => v === 0)).toBe(true);
      expect(mask.pixels.filter((_, i) => i % 4 === 3).every((v) => v === 255)).toBe(true);
    },
  );

  it('bounds square-root work per pixel instead of calling hypot for every segment', () => {
    const hypot = vi.spyOn(Math, 'hypot');
    const sqrt = vi.spyOn(Math, 'sqrt');
    try {
      mountainMaterialMask(patch, ridges);
      expect(hypot).not.toHaveBeenCalled();
      expect(sqrt.mock.calls.length).toBeGreaterThan(0);
      expect(sqrt.mock.calls.length).toBeLessThanOrEqual(256 * 256);
    } finally {
      hypot.mockRestore();
      sqrt.mockRestore();
    }
  });

  it('matches the independent candidate reference byte-for-byte across all fourteen authored patches without stronger historical coverage', () => {
    const terrain = buildTerrainPack();
    const patches = mountainRasterLayout(terrain);
    expect(patches).toHaveLength(14);
    for (const actual of patches) {
      const mountain = terrain.mountains?.find((item) => item.id === actual.id);
      if (!mountain) throw new Error(`Missing actual mountain ${actual.id}`);
      const expected = originalMask(actual, mountain.ridges, true);
      const historical = originalMask(actual, mountain.ridges);
      let changed = 0,
        expanded = 0;
      for (let i = 0; i < expected.length; i += 4) {
        if (expected[i]! > historical[i]!) expanded++;
        if (expected[i] !== historical[i]) changed++;
      }
      expect(expanded, actual.id).toBe(0);
      expect(changed, actual.id).toBeGreaterThan(0);
      expect(
        Buffer.from(mountainMaterialMask(actual, mountain.ridges).pixels).equals(
          Buffer.from(expected),
        ),
        actual.id,
      ).toBe(true);
    }
  });

  it('matches independent candidate bytes for reversed, negative-world and degenerate polygons/segments', () => {
    const negative = {
      ...patch,
      x: -113,
      y: -227,
      polygon: patch.polygon.map((p) => ({ x: p.x - 213, y: p.y - 427 })),
    };
    const negativeRidges = ridges.map((line) => line.map((p) => ({ x: p.x - 213, y: p.y - 427 })));
    const cases: Array<{ patch: MountainMaterialPatch; ridges: typeof ridges }> = [
      { patch: { ...patch, polygon: [...patch.polygon].reverse() }, ridges },
      { patch: negative, ridges: negativeRidges },
      {
        patch: { ...patch, polygon: [patch.polygon[0]!, patch.polygon[0]!, patch.polygon[1]!] },
        ridges,
      },
      { patch, ridges: [[ridges[0]![0]!, ridges[0]![0]!]] },
      { patch: { ...patch, width: 0, height: 0 }, ridges },
      { patch: { ...patch, polygon: [] }, ridges: [] },
    ];
    for (const item of cases) {
      expect(
        Buffer.from(mountainMaterialMask(item.patch, item.ridges).pixels).equals(
          Buffer.from(originalMask(item.patch, item.ridges, true)),
        ),
      ).toBe(true);
    }
  });

  it('generates bounded deterministic height/edge coverage only inside the original polygon', () => {
    const before = JSON.stringify({ patch, ridges });
    const mask = mountainMaterialMask(patch, ridges);
    expect(
      Buffer.from(mask.pixels).equals(Buffer.from(mountainMaterialMask(patch, ridges).pixels)),
    ).toBe(true);
    expect(
      Buffer.from(mask.pixels).equals(
        Buffer.from(
          mountainMaterialMask({ ...patch, polygon: [...patch.polygon].reverse() }, ridges).pixels,
        ),
      ),
    ).toBe(true);
    expect(mask.size).toBe(256);
    expect(mask.pixels).toHaveLength(256 * 256 * 4);
    const red = (col: number, row: number) => mask.pixels[(row * 256 + col) * 4]!;
    expect(red(80, 80)).toBeGreaterThan(150);
    expect(red(150, 40)).toBeLessThan(red(80, 80));
    expect(red(0, 0)).toBeLessThan(1);
    expect(red(240, 240)).toBe(0);
    let validCoverage = true;
    for (let i = 0; i < mask.pixels.length; i += 4) {
      validCoverage &&=
        mask.pixels[i]! <= Math.round(255 * 0.62) &&
        mask.pixels[i + 1] === mask.pixels[i] &&
        mask.pixels[i + 2] === mask.pixels[i] &&
        mask.pixels[i + 3] === 255;
    }
    expect(validCoverage).toBe(true);
    for (const invalid of [[], [[{ x: 110, y: 210 }]]]) {
      expect(
        mountainMaterialMask(patch, invalid)
          .pixels.filter((_, i) => i % 4 === 0)
          .every((v) => v === 0),
      ).toBe(true);
    }
    expect(JSON.stringify({ patch, ridges })).toBe(before);
  });

  it('uses actual shared TilingSprite with fixed global world phase and exact outer clip', () => {
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(1254 * 1254 * 4),
        width: 1254,
        height: 1254,
      }),
    });
    const material = createMountainMaterial(texture, patch, ridges);
    const sibling = createMountainMaterial(texture, { ...patch, x: 137, y: 249 }, ridges);
    expect(material.sprite).toBeInstanceOf(TilingSprite);
    expect(material.sprite.texture).toBe(texture);
    expect(material.sprite.position.x + material.sprite.tilePosition.x).toBe(0);
    expect(material.sprite.position.y + material.sprite.tilePosition.y).toBe(0);
    expect(sibling.sprite.position.x + sibling.sprite.tilePosition.x).toBe(0);
    expect(sibling.sprite.position.y + sibling.sprite.tilePosition.y).toBe(0);
    // Installed Pixi Transform's actual inverse mapping: distinct origins sample identical world UV.
    for (const world of [
      { x: 173, y: 263 },
      { x: -41, y: -109 },
      { x: 192, y: 384 },
    ]) {
      const uv = (sprite: TilingSprite) =>
        sprite.tileTransform.matrix.applyInverse({ x: world.x - sprite.x, y: world.y - sprite.y });
      const a = uv(material.sprite);
      const b = uv(sibling.sprite);
      expect(a.x / texture.width).toBeCloseTo(b.x / texture.width, 12);
      expect(a.y / texture.height).toBeCloseTo(b.y / texture.height, 12);
      expect(a.x / texture.width).toBeCloseTo(world.x / 96, 12);
      expect(a.y / texture.height).toBeCloseTo(world.y / 96, 12);
    }
    expect(material.sprite.tileScale.x * texture.width).toBe(96);
    expect(material.sprite.tileScale.y).toBe(material.sprite.tileScale.x);
    expect(material.sprite.tileRotation).toBe(0);
    expect(material.sprite.rotation).toBe(0);
    expect(material.sprite.width).toBe(patch.width);
    expect(material.sprite.height).toBe(patch.height);
    expect(material.container.children[0]?.mask).toBe(material.clip);
    expect(material.sprite.mask).toBe(material.softMask);
    expect(
      material.sprite.effects?.some((effect) => 'channel' in effect && effect.channel === 'red'),
    ).toBe(true);
    for (const node of [material.container, material.sprite, material.softMask, material.clip])
      expect(node.eventMode).toBe('none');
    const maskTexture = material.softMask.texture;
    const source = maskTexture.source;
    material.destroy();
    material.destroy();
    expect(maskTexture.destroyed).toBe(true);
    expect(source.destroyed).toBe(true);
    expect(texture.destroyed).toBe(false);
    expect(sibling.sprite.destroyed).toBe(false);
    sibling.destroy();
    texture.destroy(true);
  });

  it('admits all fourteen actual patches beneath unchanged peak art without changing source data', () => {
    const terrain = buildTerrainPack();
    const before = JSON.stringify(terrain);
    const peak = sharedTexture();
    const wood = sharedTexture();
    const assets = new Map([[terrain.mountainArtAssetId!, peak]]);
    const legacy = createMountainRasterVariants(assets, terrain);
    const actual = createMountainRasterVariants(assets, terrain, wood);
    const layer = actual.container.children[0];
    expect(layer).toBeInstanceOf(Container);
    expect(layer?.label).toBe('mountain-woodland-materials');
    expect(layer?.children).toHaveLength(14);
    expect(actual.coveredIds).toEqual(legacy.coveredIds);
    expect(actual.container.children).toHaveLength(29);
    for (let i = 0; i < legacy.container.children.length; i++) {
      const a = actual.container.children[i + 1]!;
      const b = legacy.container.children[i]!;
      expect(a.constructor).toBe(b.constructor);
      if (!(a instanceof Graphics)) {
        expect(a.children[0]?.position.x).toBe(b.children[0]?.position.x);
        expect(a.children[0]?.position.y).toBe(b.children[0]?.position.y);
        expect(a.children[0]?.scale.x).toBe(b.children[0]?.scale.x);
        expect(a.children[0]?.scale.y).toBe(b.children[0]?.scale.y);
      }
    }
    expect(mountainRasterLayout(terrain)).toHaveLength(14);
    expect(14 * MOUNTAIN_MATERIAL.maskSize ** 2 * 4).toBe(3_670_016);
    const destroy = vi.spyOn(wood, 'destroy');
    actual.destroy();
    legacy.destroy();
    expect(destroy).not.toHaveBeenCalled();
    expect(JSON.stringify(terrain)).toBe(before);
    wood.destroy(true);
    peak.destroy(true);
  });

  it('does not replace vector fallback or claim covered terrain when only woodland loads', () => {
    const wood = sharedTexture();
    const raster = createMountainRasterVariants(new Map(), buildTerrainPack(), wood);
    expect(raster.container.children).toHaveLength(0);
    expect(raster.coveredIds.size).toBe(0);
    raster.destroy();
    expect(wood.destroyed).toBe(false);
    wood.destroy(true);
  });
});
