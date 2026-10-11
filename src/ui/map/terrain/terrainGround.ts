import { Container, Graphics, TilingSprite, type Texture } from 'pixi.js';
import type { OutlineGeometry } from '../displayCoast';

/** Original ground material: fixed world phase, no simulation/state-dependent variation. */
export const TERRAIN_GROUND_ART = { worldSize: 4096, tileWorldSize: 256, alpha: 0.28 } as const;

export function createTerrainGround(texture: Texture, outline: OutlineGeometry) {
  const container = new Container();
  container.label = 'terrain-ground-material';
  container.eventMode = 'none';
  const sprite = new TilingSprite({
    texture,
    width: TERRAIN_GROUND_ART.worldSize,
    height: TERRAIN_GROUND_ART.worldSize,
    tileScale: {
      x: TERRAIN_GROUND_ART.tileWorldSize / texture.width,
      y: TERRAIN_GROUND_ART.tileWorldSize / texture.width,
    },
    tilePosition: { x: 0, y: 0 },
    tileRotation: 0,
  });
  sprite.alpha = TERRAIN_GROUND_ART.alpha;
  sprite.eventMode = 'none';
  const mask = new Graphics();
  mask.eventMode = 'none';
  for (const polygon of outline.polygons) mask.poly([...polygon.points]).fill(0xffffff);
  container.addChild(sprite);
  container.addChild(mask);
  sprite.mask = mask;
  return {
    container,
    sprite,
    mask,
    destroy: () => {
      container.parent?.removeChild(container);
      sprite.mask = null;
      sprite.parent?.removeChild(sprite);
      sprite.destroy({ texture: false, textureSource: false });
      container.destroy({ children: true });
    },
  };
}
