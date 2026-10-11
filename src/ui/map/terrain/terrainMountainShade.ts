import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TERRAIN_RELIEF } from '../mapViewConfig';
import type { MountainMaterialPatch } from './terrainMountainMaterial';
import type { prepareMountainRiverContact } from './mountainRiverContact';

type Point = Readonly<{ x: number; y: number }>;
export const MOUNTAIN_SHADE = {
  size: 128,
  maxPatches: 14,
  maxOpacity: 0.28,
  maxPolygon: 256,
  maxRidgePoints: 2048,
} as const;
const inside = (p: Point, polygon: readonly Point[]) => {
  let result = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
};
function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return { distance: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy), t };
}
/** The existing relief height equation, sampled without projected triangle geometry. */
export function mountainShadeHeight(
  p: Point,
  patch: MountainMaterialPatch,
  ridges: readonly (readonly Point[])[],
  tier: 1 | 2 | 3,
) {
  if (!inside(p, patch.polygon)) return { height: 0, fade: 0 };
  let edge = Infinity;
  for (let i = 0; i < patch.polygon.length; i++)
    edge = Math.min(
      edge,
      distance(p, patch.polygon[i]!, patch.polygon[(i + 1) % patch.polygon.length]!).distance,
    );
  const t = Math.min(1, edge / TERRAIN_RELIEF.hillEdgeFade),
    fade = t * t * (3 - 2 * t);
  let numerator = 0,
    denominator = 0;
  ridges.forEach((ridge, index) => {
    let nearest = Infinity,
      wave = 1,
      arc = 0;
    for (let i = 1; i < ridge.length; i++) {
      const a = ridge[i - 1]!,
        b = ridge[i]!,
        length = Math.hypot(b.x - a.x, b.y - a.y),
        hit = distance(p, a, b);
      if (hit.distance < nearest) {
        nearest = hit.distance;
        wave =
          0.84 +
          0.16 *
            Math.cos((arc + hit.t * length) / TERRAIN_RELIEF.hillRidgeUndulation + index * 0.4);
      }
      arc += length;
    }
    if (Number.isFinite(nearest)) {
      const weight = Math.exp(-((nearest / TERRAIN_RELIEF.hillRidgeWidth) ** 2));
      numerator += weight ** 4 * wave;
      denominator += weight ** 3;
    }
  });
  const crest = ridges.length === 0 ? 0.65 : denominator > 1e-12 ? numerator / denominator : 0;
  return { height: TERRAIN_RELIEF.mountainHeight[tier] * fade * (0.15 + 0.85 * crest), fade };
}
/** Signed diffuse departure from a flat plane under fixed north-west daylight. */
export function mountainShadeLight(dx: number, dy: number) {
  const lightLength = Math.hypot(0.45, 0.55, 0.7);
  return (0.45 * dx + 0.55 * dy + 0.7) / Math.hypot(dx, dy, 1) / lightLength - 0.7 / lightLength;
}
export function mountainShadePixels(
  patch: MountainMaterialPatch,
  ridges: readonly (readonly Point[])[],
  tier: 1 | 2 | 3,
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
) {
  const finite = (p: Point) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
  if (
    ![patch.x, patch.y, patch.width, patch.height].every(Number.isFinite) ||
    Math.abs(patch.x) > 1e6 ||
    Math.abs(patch.y) > 1e6 ||
    patch.width <= 0 ||
    patch.height <= 0 ||
    patch.width > 4096 ||
    patch.height > 4096 ||
    patch.polygon.length < 3 ||
    patch.polygon.length > MOUNTAIN_SHADE.maxPolygon ||
    !patch.polygon.every(finite) ||
    ridges.reduce((n, r) => n + r.length, 0) > MOUNTAIN_SHADE.maxRidgePoints ||
    !ridges.every((r) => r.every(finite)) ||
    ![1, 2, 3].includes(tier)
  )
    return null;
  const size = MOUNTAIN_SHADE.size,
    grid = size + 2,
    heights = new Float64Array(grid * grid),
    fades = new Float64Array(size * size),
    pixels = new Uint8Array(size * size * 4);
  const stepX = patch.width / size,
    stepY = patch.height / size;
  for (let row = 0; row < grid; row++)
    for (let col = 0; col < grid; col++) {
      const sample = mountainShadeHeight(
        { x: patch.x + (col - 0.5) * stepX, y: patch.y + (row - 0.5) * stepY },
        patch,
        ridges,
        tier,
      );
      heights[row * grid + col] = sample.height;
      if (row > 0 && row <= size && col > 0 && col <= size)
        fades[(row - 1) * size + col - 1] = sample.fade;
    }
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const i = (row + 1) * grid + col + 1;
      const light = mountainShadeLight(
        (heights[i + 1]! - heights[i - 1]!) / (2 * stepX),
        (heights[i + grid]! - heights[i - grid]!) / (2 * stepY),
      );
      const color = light > 0 ? [224, 215, 173] : [38, 53, 49],
        offset = (row * size + col) * 4;
      pixels[offset] = color[0]!;
      pixels[offset + 1] = color[1]!;
      pixels[offset + 2] = color[2]!;
      pixels[offset + 3] = Math.round(
        255 *
          Math.min(1, Math.abs(light) * 2.5) *
          MOUNTAIN_SHADE.maxOpacity *
          fades[row * size + col]!,
      );
      if (riverContact) {
        const contact = riverContact(
          { x: patch.x + (col + 0.5) * stepX, y: patch.y + (row + 0.5) * stepY },
          { width: stepX, height: stepY },
        );
        if (contact !== 1) pixels[offset + 3] = Math.round(pixels[offset + 3]! * contact);
      }
    }
  return { size, pixels };
}
export function createMountainShade(
  patch: MountainMaterialPatch,
  ridges: readonly (readonly Point[])[],
  tier: 1 | 2 | 3,
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
) {
  const data = mountainShadePixels(patch, ridges, tier, riverContact);
  if (!data) return null;
  const source = new BufferImageSource({
    resource: data.pixels,
    width: data.size,
    height: data.size,
    scaleMode: 'linear',
  });
  const texture = new Texture({ source }),
    sprite = new Sprite(texture),
    container = new Container();
  container.label = `mountain-foothill-shade:${patch.id}`;
  container.eventMode = 'none';
  sprite.position.set(patch.x, patch.y);
  sprite.width = patch.width;
  sprite.height = patch.height;
  sprite.eventMode = 'none';
  const clip = new Graphics().poly(patch.polygon.flatMap((p) => [p.x, p.y])).fill(0xffffff);
  clip.eventMode = 'none';
  sprite.mask = clip;
  container.addChild(sprite, clip);
  let destroyed = false;
  return {
    container,
    sprite,
    clip,
    texture,
    getDiagnostics: () => ({
      ownedTextures: destroyed ? 0 : 1,
      ownedSources: destroyed ? 0 : 1,
      rgbaBytes: destroyed ? 0 : data.pixels.byteLength,
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      container.parent?.removeChild(container);
      sprite.mask = null;
      sprite.parent?.removeChild(sprite);
      sprite.destroy({ texture: false, textureSource: false });
      clip.parent?.removeChild(clip);
      clip.destroy({ context: true });
      container.destroy({ children: true });
      texture.destroy(true);
    },
  };
}
