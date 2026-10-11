import { BufferImageSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { MountainMaterialPatch } from './terrainMountainMaterial';

export const FOREST_MATERIAL = { maskSize: 128, tileWorldSize: 96, opacity: 0.35 } as const;

/** The approved inward feather, with distance work only for contributing inside pixels. */
export function forestMaterialMask(patch: MountainMaterialPatch) {
  const size = FOREST_MATERIAL.maskSize;
  const pixels = new Uint8Array(size * size * 4);
  const band = Math.min(8, patch.width * 0.12, patch.height * 0.12);
  const edges = patch.polygon.map((a, i) => {
    const b = patch.polygon[(i + 1) % patch.polygon.length]!;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    return { a, b, dx, dy, denominator: dx * dx + dy * dy };
  });
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = patch.x + ((col + 0.5) / size) * patch.width;
      const y = patch.y + ((row + 0.5) / size) * patch.height;
      let inside = false;
      for (const { a, b } of edges)
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      let coverage = 0;
      if (inside && band > 0) {
        let distanceSquared = Infinity;
        for (const { a, dx, dy, denominator } of edges) {
          const t =
            denominator > 0
              ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denominator))
              : 0;
          const offsetX = x - a.x - t * dx;
          const offsetY = y - a.y - t * dy;
          distanceSquared = Math.min(distanceSquared, offsetX * offsetX + offsetY * offsetY);
        }
        const t = Number.isFinite(distanceSquared)
          ? Math.min(1, Math.sqrt(distanceSquared) / band)
          : 0;
        coverage = Math.round(255 * t * t * (3 - 2 * t));
      }
      const offset = (row * size + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = coverage;
      pixels[offset + 3] = 255;
    }
  }
  return { size, pixels };
}

/** Own only the static coverage texture; original artwork remains loader-owned. */
export function createForestMaterial(texture: Texture, patch: MountainMaterialPatch) {
  const container = new Container();
  container.label = `forest-material:${patch.id}`;
  container.eventMode = 'none';
  const sprite = new TilingSprite({
    texture,
    width: patch.width,
    height: patch.height,
    tileScale: {
      x: FOREST_MATERIAL.tileWorldSize / texture.width,
      y: FOREST_MATERIAL.tileWorldSize / texture.width,
    },
    tilePosition: { x: -patch.x, y: -patch.y },
    tileRotation: 0,
  });
  sprite.position.set(patch.x, patch.y);
  sprite.alpha = FOREST_MATERIAL.opacity;
  sprite.eventMode = 'none';
  const { size, pixels } = forestMaterialMask(patch);
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
