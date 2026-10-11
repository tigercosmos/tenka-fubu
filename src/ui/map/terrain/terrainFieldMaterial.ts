import { BufferImageSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { OutlineGeometry } from '../displayCoast';
import type { TerrainPack } from './terrainPack';

/** Decorative fictional parcels, not simulation/economy facts. Fixed world phase. */
export const TERRAIN_FIELD_MATERIAL = {
  worldSize: 4096,
  maskSize: 512,
  tileWorldSize: 384,
  alpha: 0.35,
  fadeWorld: 32,
} as const;

/** Conservative nearest-sampled coverage: every intersected cell is entirely black. */
export function fieldMaterialMask(terrain: TerrainPack) {
  const { worldSize, maskSize: size, fadeWorld } = TERRAIN_FIELD_MATERIAL;
  const cell = worldSize / size,
    guard = (Math.SQRT2 * cell) / 2 + cell;
  const pixels = new Uint8Array(size * size * 4);
  pixels.fill(255);
  const polygons = [
    ...(terrain.mountains ?? []).map((m) => m.mass),
    ...(terrain.forests ?? []).map((f) => f.polygon),
  ];
  for (const points of polygons) {
    if (points.length === 0) continue;
    const minX = Math.min(...points.map((p) => p.x)) - guard - fadeWorld,
      maxX = Math.max(...points.map((p) => p.x)) + guard + fadeWorld;
    const minY = Math.min(...points.map((p) => p.y)) - guard - fadeWorld,
      maxY = Math.max(...points.map((p) => p.y)) + guard + fadeWorld;
    const colStart = Math.max(0, Math.ceil(minX / cell - 0.5)),
      colEnd = Math.min(size - 1, Math.floor(maxX / cell - 0.5));
    const rowStart = Math.max(0, Math.ceil(minY / cell - 0.5)),
      rowEnd = Math.min(size - 1, Math.floor(maxY / cell - 0.5));
    const segments = points.map((a, i) => {
      const b = points[(i + 1) % points.length]!,
        dx = b.x - a.x,
        dy = b.y - a.y;
      return { a, b, dx, dy, inverseLength: 1 / (dx * dx + dy * dy || 1) };
    });
    for (let row = rowStart; row <= rowEnd; row++)
      for (let col = colStart; col <= colEnd; col++) {
        const index = (row * size + col) * 4;
        if (pixels[index] === 0) continue;
        const x = (col + 0.5) * cell,
          y = (row + 0.5) * cell;
        let inside = false,
          distanceSquared = Infinity;
        for (const { a, b, dx, dy, inverseLength } of segments) {
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
            inside = !inside;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) * inverseLength));
          const ex = x - a.x - t * dx,
            ey = y - a.y - t * dy;
          distanceSquared = Math.min(distanceSquared, ex * ex + ey * ey);
        }
        const t = inside
          ? 0
          : Math.max(0, Math.min(1, (Math.sqrt(distanceSquared) - guard) / fadeWorld));
        const value = Math.round(255 * t * t * (3 - 2 * t));
        const coverage = Math.min(pixels[index]!, value);
        pixels[index] = pixels[index + 1] = pixels[index + 2] = coverage;
      }
  }
  return { size, pixels };
}

/** One shared art texture; owns only static exclusion mask and exact outer land clip. */
export function createTerrainFieldMaterial(
  texture: Texture,
  outline: OutlineGeometry,
  terrain: TerrainPack,
  viewportControlled = false,
) {
  const { worldSize, tileWorldSize } = TERRAIN_FIELD_MATERIAL;
  const container = new Container();
  container.label = 'terrain-field-material';
  container.eventMode = 'none';
  const sprite = new TilingSprite({
    texture,
    width: worldSize,
    height: worldSize,
    tileScale: { x: tileWorldSize / texture.width, y: tileWorldSize / texture.width },
    tilePosition: { x: 0, y: 0 },
    tileRotation: 0,
  });
  sprite.alpha = TERRAIN_FIELD_MATERIAL.alpha;
  sprite.eventMode = 'none';
  if (viewportControlled) {
    sprite.visible = false;
    sprite.width = sprite.height = 1;
  }
  const { size, pixels } = fieldMaterialMask(terrain);
  const maskTexture = new Texture({
    source: new BufferImageSource({
      resource: pixels,
      width: size,
      height: size,
      scaleMode: 'nearest',
    }),
  });
  const softMask = new Sprite(maskTexture);
  softMask.width = softMask.height = worldSize;
  softMask.eventMode = 'none';
  const clip = new Graphics();
  clip.eventMode = 'none';
  for (const polygon of outline.polygons) clip.poly([...polygon.points]).fill(0xffffff);
  const group = new Container();
  group.eventMode = 'none';
  group.addChild(sprite, softMask);
  sprite.mask = softMask;
  group.mask = clip;
  container.addChild(group, clip);
  let destroyed = false;
  let left = NaN,
    top = NaN,
    right = NaN,
    bottom = NaN;
  const hide = () => {
    if (sprite.visible || sprite.width !== 1 || sprite.height !== 1) {
      sprite.visible = false;
      sprite.width = sprite.height = 1;
    }
    left = top = right = bottom = NaN;
  };
  return {
    container,
    sprite,
    softMask,
    clip,
    /** Bound filter input only; full-world masks and 384-world texture phase stay static. */
    setViewport: (
      x: number,
      y: number,
      scale: number,
      screenWidth: number,
      screenHeight: number,
    ) => {
      if (destroyed) return;
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(scale) ||
        !Number.isFinite(screenWidth) ||
        !Number.isFinite(screenHeight) ||
        scale <= 0 ||
        screenWidth <= 0 ||
        screenHeight <= 0
      ) {
        hide();
        return;
      }
      // Two CSS pixels include antialiasing/rounding support; camera scale converts to world.
      const nextLeft = Math.max(0, Math.min(worldSize, (-2 - x) / scale));
      const nextTop = Math.max(0, Math.min(worldSize, (-2 - y) / scale));
      const nextRight = Math.max(0, Math.min(worldSize, (screenWidth + 2 - x) / scale));
      const nextBottom = Math.max(0, Math.min(worldSize, (screenHeight + 2 - y) / scale));
      if (nextRight <= nextLeft || nextBottom <= nextTop) {
        hide();
        return;
      }
      if (left === nextLeft && top === nextTop && right === nextRight && bottom === nextBottom)
        return;
      left = nextLeft;
      top = nextTop;
      right = nextRight;
      bottom = nextBottom;
      sprite.position.set(left, top);
      sprite.width = right - left;
      sprite.height = bottom - top;
      sprite.tilePosition.set(-left, -top);
      sprite.visible = true;
    },
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
