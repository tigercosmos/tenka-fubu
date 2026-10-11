import { BufferImageSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { prepareMountainRiverContact } from './mountainRiverContact';

type Point = Readonly<{ x: number; y: number }>;
export type MountainMaterialPatch = Readonly<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon: readonly Point[];
}>;

/** Static original canopy material. World phase and the painted NW lighting never rotate. */
export const MOUNTAIN_MATERIAL = { maskSize: 256, tileWorldSize: 96, opacity: 0.62 } as const;

function prepareSegment(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { a, b, dx, dy, denominator: dx * dx + dy * dy || 1 };
}

function segmentDistanceSquared(
  x: number,
  y: number,
  segment: ReturnType<typeof prepareSegment>,
): number {
  const { a, dx, dy, denominator } = segment;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denominator));
  const offsetX = x - a.x - t * dx;
  const offsetY = y - a.y - t * dy;
  return offsetX * offsetX + offsetY * offsetY;
}

/** Red coverage with opaque alpha, matching Pixi's red-channel Sprite mask contract. */
export function mountainMaterialMask(
  patch: MountainMaterialPatch,
  ridges: readonly (readonly Point[])[],
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
) {
  const size = MOUNTAIN_MATERIAL.maskSize;
  const pixels = new Uint8Array(size * size * 4);
  const edges = patch.polygon.map((a, i) =>
    prepareSegment(a, patch.polygon[(i + 1) % patch.polygon.length]!),
  );
  const segments = ridges.flatMap((line) =>
    line.slice(1).map((b, i) => prepareSegment(line[i]!, b)),
  );
  const radius = Math.min(patch.width, patch.height) * 0.48;
  const band = Math.min(40, Math.min(patch.width, patch.height) * 0.25);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = patch.x + ((col + 0.5) / size) * patch.width;
      const y = patch.y + ((row + 0.5) / size) * patch.height;
      let inside = false;
      for (const segment of edges) {
        const { a, b } = segment;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      let coverage = 0;
      if (inside && radius > 0 && band > 0 && segments.length > 0) {
        let edgeSquared = Infinity;
        for (const segment of edges)
          edgeSquared = Math.min(edgeSquared, segmentDistanceSquared(x, y, segment));
        let ridgeSquared = Infinity;
        for (const segment of segments)
          ridgeSquared = Math.min(ridgeSquared, segmentDistanceSquared(x, y, segment));
        const height = Math.exp(-(ridgeSquared / (radius * radius)) * 1.4);
        const fade = Math.min(1, Math.sqrt(edgeSquared) / band);
        // C2 inward contact and ridge-connected support remove polygon-shaped distant aprons.
        // No displaced boundary, added texture, random contour or stronger coverage.
        const support = Math.max(0, Math.min(1, 1 - ridgeSquared / (radius * radius * 2.25)));
        const edgeRamp = fade * fade * fade * (fade * (fade * 6 - 15) + 10);
        const ridgeRamp = support * support * support * (support * (support * 6 - 15) + 10);
        coverage = Math.round(
          255 * edgeRamp * Math.pow(height, 1.7) * ridgeRamp * MOUNTAIN_MATERIAL.opacity,
        );
        if (riverContact) {
          const contact = riverContact(
            { x, y },
            { width: patch.width / size, height: patch.height / size },
          );
          if (contact !== 1) coverage = Math.round(coverage * contact);
        }
      }
      const offset = (row * size + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = coverage;
      pixels[offset + 3] = 255;
    }
  }
  return { size, pixels };
}

/** One shared original texture; each admitted patch owns only its static mask texture. */
export function createMountainMaterial(
  texture: Texture,
  patch: MountainMaterialPatch,
  ridges: readonly (readonly Point[])[],
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
) {
  const container = new Container();
  container.label = `mountain-material:${patch.id}`;
  container.eventMode = 'none';
  const sprite = new TilingSprite({
    texture,
    width: patch.width,
    height: patch.height,
    tileScale: {
      x: MOUNTAIN_MATERIAL.tileWorldSize / texture.width,
      y: MOUNTAIN_MATERIAL.tileWorldSize / texture.width,
    },
    tilePosition: { x: -patch.x, y: -patch.y },
    tileRotation: 0,
  });
  sprite.position.set(patch.x, patch.y);
  sprite.eventMode = 'none';
  const { size, pixels } = mountainMaterialMask(patch, ridges, riverContact);
  const maskTexture = new Texture({
    source: new BufferImageSource({
      resource: pixels,
      width: size,
      height: size,
      scaleMode: 'linear',
    }),
  });
  const softMask = new Sprite(maskTexture);
  softMask.position.set(patch.x, patch.y);
  softMask.width = patch.width;
  softMask.height = patch.height;
  softMask.eventMode = 'none';
  const clip = new Graphics().poly(patch.polygon.flatMap((p) => [p.x, p.y])).fill(0xffffff);
  clip.eventMode = 'none';
  const group = new Container();
  group.eventMode = 'none';
  group.addChild(sprite, softMask);
  sprite.mask = softMask;
  group.mask = clip;
  container.addChild(group, clip);
  let destroyed = false;
  return {
    container,
    sprite,
    softMask,
    clip,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      container.parent?.removeChild(container);
      sprite.mask = null;
      group.mask = null;
      sprite.parent?.removeChild(sprite);
      sprite.destroy({ texture: false, textureSource: false });
      softMask.parent?.removeChild(softMask);
      softMask.destroy({ texture: false, textureSource: false });
      container.destroy({ children: true });
      maskTexture.destroy(true);
    },
  };
}
