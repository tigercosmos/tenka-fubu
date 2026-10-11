import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Container, Texture, TilingSprite, Graphics } from 'pixi.js';
import { createTerrainGround, TERRAIN_GROUND_ART } from '@ui/map/terrain/terrainGround';
import { loadOutline } from '@ui/map/mapDraw';

describe('static NPOT ground material', () => {
  it('uses the real public NPOT TilingSprite with fixed phase and exact authored coast mask', () => {
    const source = new BufferImageSource({
      resource: new Uint8Array(1254 * 1254 * 4),
      width: 1254,
      height: 1254,
    });
    const texture = new Texture({ source });
    expect(source.isPowerOfTwo).toBe(false);
    const outline = loadOutline();
    const snapshot = JSON.stringify(outline);
    const poly = vi.spyOn(Graphics.prototype, 'poly');
    const a = createTerrainGround(texture, outline);
    const b = createTerrainGround(texture, outline);
    expect(a.sprite).toBeInstanceOf(TilingSprite);
    expect(a.sprite.texture).toBe(texture);
    expect(a.sprite.width).toBe(4096);
    expect(a.sprite.height).toBe(4096);
    expect(a.sprite.tileScale.x * texture.width).toBe(256);
    expect(a.sprite.tileScale.y).toBe(a.sprite.tileScale.x);
    expect(a.sprite.tilePosition.x).toBe(0);
    expect(a.sprite.tilePosition.y).toBe(0);
    expect(a.sprite.tileRotation).toBe(0);
    expect(a.sprite.alpha).toBe(TERRAIN_GROUND_ART.alpha);
    expect(a.sprite.mask).toBe(a.mask);
    expect(a.mask.context.instructions).toHaveLength(outline.polygons.length);
    outline.polygons.forEach((polygon, index) =>
      expect(poly.mock.calls[index]?.[0]).toEqual(polygon.points),
    );
    expect(a.mask.context.bounds.width).toBeGreaterThan(0);
    const world = new Container();
    world.addChild(a.container);
    world.scale.set(2);
    world.position.set(45, 75);
    expect(a.sprite.tilePosition.x).toBe(0);
    expect(a.sprite.tileRotation).toBe(0);
    expect(a.container.eventMode).toBe('none');
    expect(a.mask.eventMode).toBe('none');
    expect(JSON.stringify(outline)).toBe(snapshot);
    a.destroy();
    expect(texture.destroyed).toBe(false);
    expect(b.sprite.destroyed).toBe(false);
    b.destroy();
    texture.destroy(true);
    world.destroy();
    poly.mockRestore();
  });
});
