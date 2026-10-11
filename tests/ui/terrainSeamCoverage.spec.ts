import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { buildReliefFaces, drawDimensionalTerrain } from '@ui/map/terrain/terrainDraw';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';

describe('opaque continuous terrain surface coverage', () => {
  it('uses real Graphics opaque fills and color-matched narrow hill edge coverage', () => {
    const terrain = buildTerrainPack();
    const faces = buildReliefFaces(terrain);
    const gfx = new Graphics();
    const fill = vi.spyOn(gfx, 'fill');
    const stroke = vi.spyOn(gfx, 'stroke');
    drawDimensionalTerrain(gfx, terrain);
    expect(fill).toHaveBeenCalledTimes(faces.length);
    for (const [style] of fill.mock.calls) expect(style).toMatchObject({ alpha: 1 });
    const hillFaces = faces.filter((face) => face.ground !== undefined);
    expect(stroke).toHaveBeenCalledTimes(hillFaces.length);
    let strokeIndex = 0;
    faces.forEach((face, i) => {
      if (face.ground === undefined) return;
      const fillStyle = fill.mock.calls[i]![0];
      const strokeStyle = stroke.mock.calls[strokeIndex++]![0];
      if (typeof fillStyle !== 'object' || fillStyle === null || !('color' in fillStyle)) {
        throw new Error('Terrain fills must use an explicit color style');
      }
      expect(strokeStyle).toMatchObject({
        color: fillStyle.color,
        alpha: 1,
        width: 0.35,
      });
    });
    expect(gfx.context.instructions.length).toBe(faces.length + hillFaces.length);
    gfx.destroy();
  });
});
