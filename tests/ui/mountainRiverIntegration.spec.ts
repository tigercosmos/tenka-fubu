import { describe, expect, it } from 'vitest';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import {
  prepareMountainRiverContact,
  type MountainRiverCapsule,
} from '@ui/map/terrain/mountainRiverContact';
import {
  createMountainRasterVariants,
  mountainFeatherMask,
  mountainRasterLayout,
} from '@ui/map/terrain/terrainRaster';
import { mountainMaterialMask } from '@ui/map/terrain/terrainMountainMaterial';
import { mountainShadePixels } from '@ui/map/terrain/terrainMountainShade';

const terrain = buildTerrainPack();
const patch = mountainRasterLayout(terrain).find((p) => p.id === 'mt.kiso')!;
const mountain = terrain.mountains!.find((m) => m.id === patch.id)!;
type Contact = ReturnType<typeof prepareMountainRiverContact>;
// Optional extra arguments let the same real old producers execute the requirement
// RED before integration, rather than failing due to missing module/API syntax.
const feather: (
  p: typeof patch,
  land?: readonly (readonly number[])[],
  contact?: Contact,
) => ReturnType<typeof mountainFeatherMask> = mountainFeatherMask;
const material: (
  p: typeof patch,
  ridges: typeof mountain.ridges,
  contact?: Contact,
) => ReturnType<typeof mountainMaterialMask> = mountainMaterialMask;
const shade: (
  p: typeof patch,
  ridges: typeof mountain.ridges,
  tier: 1 | 2 | 3,
  contact?: Contact,
) => ReturnType<typeof mountainShadePixels> = mountainShadePixels;
const raster: (
  textures: ReadonlyMap<string, Texture>,
  t: typeof terrain,
  woodland?: Texture,
  land?: readonly (readonly number[])[],
  contacts?: readonly MountainRiverCapsule[],
) => ReturnType<typeof createMountainRasterVariants> = createMountainRasterVariants;

function emittedTenryu() {
  const water = createWaterFeatures(terrain.rivers, []);
  try {
    const river = water.getRiverMaterialDiagnostics().rivers.find((r) => r.id === 'rv.tenryu');
    expect(river).toBeDefined();
    return river!.displaySegments.map((s) => ({
      id: river!.id,
      a: { ...s.a },
      b: { ...s.b },
      radius: s.width / 2,
    }));
  } finally {
    water.destroy();
  }
}
function bankDistance(x: number, y: number, contacts: readonly MountainRiverCapsule[]) {
  return Math.min(
    ...contacts.map((s) => {
      const dx = s.b.x - s.a.x,
        dy = s.b.y - s.a.y;
      const t = Math.max(
        0,
        Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(x - s.a.x - t * dx, y - s.a.y - t * dy) - s.radius;
    }),
  );
}
function buffers(container: Container): Uint8Array[] {
  const result: Uint8Array[] = [];
  for (const child of container.children) {
    if (child instanceof Sprite && child.texture.source instanceof BufferImageSource) {
      const value = child.texture.source.resource;
      if (value instanceof Uint8Array) result.push(value.slice());
    }
    if (child instanceof Container) result.push(...buffers(child));
  }
  return result;
}
function perPatch(value: ReturnType<typeof createMountainRasterVariants>) {
  return [...value.coveredIds].map((id, i) => ({
    id,
    pixels: [
      ...buffers(value.container.children[1 + i * 2] as Container),
      ...buffers(value.materialLayer!.children[i] as Container),
    ],
  }));
}

describe('actual emitted Tenryu to relief producer integration, not native valley acceptance', () => {
  it('attenuates all three Kiso contributors, preserving every outside filter basis and shade RGB', () => {
    const contacts = emittedTenryu();
    const input = JSON.stringify({ terrain, contacts });
    const gain = prepareMountainRiverContact(contacts);
    const before = [
      feather(patch),
      material(patch, mountain.ridges),
      shade(patch, mountain.ridges, mountain.tier)!,
    ];
    const after = [
      feather(patch, undefined, gain),
      material(patch, mountain.ridges, gain),
      shade(patch, mountain.ridges, mountain.tier, gain)!,
    ];
    for (let contribution = 0; contribution < 3; contribution++) {
      const old = before[contribution]!,
        next = after[contribution]!;
      expect(next.size).toBe(old.size);
      let changes = 0,
        strengthened = 0,
        escaped = 0,
        outsideChanges = 0,
        rgbChanges = 0;
      const support = Math.hypot(patch.width / old.size, patch.height / old.size);
      for (let row = 0; row < old.size; row++)
        for (let col = 0; col < old.size; col++) {
          const offset = (row * old.size + col) * 4;
          const distance = bankDistance(
            patch.x + ((col + 0.5) * patch.width) / old.size,
            patch.y + ((row + 0.5) * patch.height) / old.size,
            contacts,
          );
          const channel = contribution === 2 ? 3 : 0;
          if (next.pixels[offset + channel]! > old.pixels[offset + channel]!) strengthened++;
          if (next.pixels[offset + channel] !== old.pixels[offset + channel]) {
            changes++;
            if (distance + support >= 8) escaped++;
          }
          for (let c = 0; c < 4; c++) {
            if (next.pixels[offset + c] !== old.pixels[offset + c]) {
              if (distance + support >= 8) outsideChanges++;
              if (contribution === 2 && c < 3) rgbChanges++;
            }
          }
        }
      expect(
        changes,
        `Real contributor ${contribution} must change, not merely metadata`,
      ).toBeGreaterThan(0);
      expect({ strengthened, escaped, outsideChanges, rgbChanges }).toEqual({
        strengthened: 0,
        escaped: 0,
        outsideChanges: 0,
        rgbChanges: 0,
      });
    }
    expect(JSON.stringify({ terrain, contacts })).toBe(input);
  });

  it('factory gates contacts to Kiso; other thirteen complete buffers and resources stay identical', () => {
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
    });
    const textures = new Map([[terrain.mountainArtAssetId!, texture]]);
    const contacts = emittedTenryu();
    const legacy = raster(textures, terrain, texture);
    const current = raster(textures, terrain, texture, undefined, contacts);
    try {
      const a = perPatch(legacy),
        b = perPatch(current);
      expect(a).toHaveLength(14);
      expect(b.map((p) => p.id)).toEqual(a.map((p) => p.id));
      for (let i = 0; i < a.length; i++) {
        expect(b[i]!.pixels.length).toBe(a[i]!.pixels.length);
        const exactBytes = b[i]!.pixels.map((p, j) =>
          Buffer.from(p).equals(Buffer.from(a[i]!.pixels[j]!)),
        );
        if (a[i]!.id === 'mt.kiso') expect(exactBytes).toContain(false);
        else expect(exactBytes.every(Boolean)).toBe(true);
      }
      expect(current.getShadeDiagnostics()).toEqual(legacy.getShadeDiagnostics());
    } finally {
      legacy.destroy();
      current.destroy();
      current.destroy();
      expect(current.getShadeDiagnostics().ownedTextures).toBe(0);
      expect(texture.destroyed).toBe(false);
      texture.destroy(true);
    }
  });

  it('empty and invalid prepared contexts retain complete legacy producer bytes', () => {
    for (const contacts of [
      [],
      [{ id: 'invalid', a: { x: NaN, y: 0 }, b: { x: 0, y: 0 }, radius: 2 }],
    ]) {
      const gain = prepareMountainRiverContact(contacts);
      expect(feather(patch, undefined, gain)).toEqual(feather(patch));
      expect(material(patch, mountain.ridges, gain)).toEqual(material(patch, mountain.ridges));
      expect(shade(patch, mountain.ridges, mountain.tier, gain)).toEqual(
        shade(patch, mountain.ridges, mountain.tier),
      );
    }
  });

  it('factory empty/invalid raw input retains complete legacy bytes and never mutates inputs', () => {
    const inputTerrain = { ...terrain, mountains: [mountain] };
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
    });
    const textures = new Map([[terrain.mountainArtAssetId!, texture]]);
    const legacy = raster(textures, inputTerrain, texture);
    const expected = perPatch(legacy)[0]!.pixels;
    try {
      for (const contacts of [
        [],
        [{ id: 'invalid', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, radius: -1 }],
      ]) {
        const before = JSON.stringify({ inputTerrain, contacts });
        const current = raster(textures, inputTerrain, texture, undefined, contacts);
        try {
          const actual = perPatch(current)[0]!.pixels;
          expect(actual.length).toBe(expected.length);
          expect(actual.every((p, i) => Buffer.from(p).equals(Buffer.from(expected[i]!)))).toBe(
            true,
          );
          expect(current.getShadeDiagnostics()).toEqual(legacy.getShadeDiagnostics());
          expect(JSON.stringify({ inputTerrain, contacts })).toBe(before);
        } finally {
          current.destroy();
        }
      }
    } finally {
      legacy.destroy();
      expect(texture.destroyed).toBe(false);
      texture.destroy(true);
    }
  });
});
