import { describe, expect, it, vi } from 'vitest';
import { Container, Texture, RendererType } from 'pixi.js';
import { MapRenderer } from './MapRenderer';
import type { createTerrainFieldMaterial } from './terrain/terrainFieldMaterial';
function call(r: Record<string, unknown>, name: string) {
  return Reflect.apply(Reflect.get(MapRenderer.prototype, name) as () => unknown, r, []);
}
describe('field material actual camera consumer', () => {
  it('forwards exact camera/screen scalars on each camera application including resize/replacement', () => {
    const a = vi.fn(),
      b = vi.fn(),
      world = new Container();
    const r = {
      app: { screen: { width: 1280, height: 720 } },
      layers: { world },
      camera: { getWorldTransform: () => ({ x: -1500.125, y: -2400.5, scale: 1.5 }) },
      fieldMaterial: { setViewport: a },
    };
    call(r, 'applyCameraTransform');
    expect(a).toHaveBeenCalledWith(-1500.125, -2400.5, 1.5, 1280, 720);
    r.app.screen.width = 1920;
    r.fieldMaterial = { setViewport: b };
    call(r, 'applyCameraTransform');
    expect(b).toHaveBeenCalledWith(-1500.125, -2400.5, 1.5, 1920, 720);
  });
  it('bounds a newly acquired field before attaching it to the real container', async () => {
    const ground = new Container(),
      world = new Container(),
      observed: number[] = [];
    ground.on('childAdded', (child) => {
      if (child.label === 'terrain-field-material')
        observed.push(
          (r.fieldMaterial as ReturnType<typeof createTerrainFieldMaterial>).sprite.width,
        );
    });
    const r: Record<string, unknown> = {
      terrainLoadGeneration: 0,
      disposed: false,
      terrainTexturesPending: false,
      mountainRaster: null,
      forestRaster: null,
      groundMaterial: null,
      fieldMaterial: null,
      reliefSprite: null,
      forestSprite: null,
      dimensionalTerrain: null,
      coastSurface: null,
      staticData: {
        terrain: {
          reliefAssetId: 'r',
          forestAssetId: 'f',
          fieldMaterialAssetId: 'field',
          mountains: [],
          forests: [],
          rivers: [],
          lakes: [],
        },
      },
      layers: { world, terrainBase: new Container() },
      waterFeatures: null,
      displayCoast: { polygons: [] },
      app: { screen: { width: 1280, height: 720 }, renderer: { type: RendererType.WEBGL } },
      camera: { getWorldTransform: () => ({ x: -1500, y: -2400, scale: 2 }) },
      terrainLoader: {
        acquire: (id: string) => {
          if (id !== 'field') return Promise.reject(new Error('unavailable optional asset'));
          return Promise.resolve(Texture.EMPTY);
        },
      },
      destroyGroundSurface: () => {},
      groundSurfaceContent: () => ground,
      applyCameraTransform: () => call(r, 'applyCameraTransform'),
      applyLodAndCulling: () => {},
    };
    call(r, 'loadTerrainTextures');
    await vi.waitFor(() => expect(observed.length).toBe(1));
    expect(observed).toEqual([642]);
    const field = r.fieldMaterial as ReturnType<typeof createTerrainFieldMaterial>;
    field.destroy();
    ground.destroy({ children: true });
  });
});
