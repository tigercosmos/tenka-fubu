import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  BufferImageSource,
  Container,
  DOMAdapter,
  Graphics,
  Geometry,
  Mesh,
  RendererType,
  Texture,
} from 'pixi.js';
import { MapRenderer } from '@ui/map/MapRenderer';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import type { createTerrainElevatedSurface } from '@ui/map/terrain/terrainElevatedSurface';
import type { createTerrainProjectedCanopy } from '@ui/map/terrain/terrainProjectedCanopy';
import { forestRasterLayout, mountainRasterPlacement } from '@ui/map/terrain/terrainRaster';

const oldAdapter = DOMAdapter.get();
beforeEach(() =>
  DOMAdapter.set({
    ...oldAdapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  }),
);
afterEach(() => DOMAdapter.set(oldAdapter));
function ground() {
  const png = PNG.sync.read(readFileSync('public/assets/textures/terrain-ground-grass-v1.png'));
  return new Texture({
    source: new BufferImageSource({ resource: png.data, width: png.width, height: png.height }),
  });
}
function canopy() {
  const png = PNG.sync.read(readFileSync('public/assets/textures/terrain-forest-canopy-v1.png'));
  return new Texture({
    source: new BufferImageSource({ resource: png.data, width: png.width, height: png.height }),
  });
}
interface Harness {
  layers: { terrainBase: Container };
  groundSurface: null | {
    container: Container;
    content: Container;
    paint: Container;
    clip: Graphics;
  };
  elevatedSurface: null | ReturnType<typeof createTerrainElevatedSurface>;
  projectedCanopy: null | ReturnType<typeof createTerrainProjectedCanopy>;
  foothillCanopy: null | {
    mesh: Mesh<Geometry>;
    geometry: Geometry;
    buffers: {
      vertices: Float32Array;
      indices: Uint32Array;
      bytes: number;
      cells: number;
      worldSize: number;
    };
    getDiagnostics(): {
      ownedMeshes: number;
      ownedGeometries: number;
      ownedBuffers: number;
      ownedTextures: number;
      ownedSources: number;
      ownedMasks: number;
      ownedFilters: number;
      ownedFramebuffers: number;
      bufferBytes: number;
      positiveVertices: number;
    };
    destroy(): void;
  };
  sceneProjection: ReturnType<typeof createSampledTerrainElevation>;
  terrainLoadGeneration: number;
  terrainTexturesPending: boolean;
  terrainProjectionError: null | string;
  loadTerrainTextures(): void;
  destroyGroundSurface(): void;
}
function harness(acquire: (id: string) => Promise<Texture | null>): Harness & {
  groundMaterial: null;
  mountainRaster: null;
  forestRaster: null;
  reliefSprite: null;
  forestSprite: null;
} {
  const field = createSampledTerrainElevation(
    createTerrainTopography(buildTerrainPack().mountains ?? []),
  );
  return Object.assign(Object.create(MapRenderer.prototype) as Harness, {
    disposed: false,
    terrainLoadGeneration: 0,
    terrainTexturesPending: false,
    terrainProjectionError: null,
    layers: { terrainBase: new Container() },
    groundSurface: null,
    elevatedSurface: null,
    projectedCanopy: null,
    foothillCanopy: null,
    coastSurface: null,
    staticData: { terrain: buildTerrainPack() },
    waterFeatures: null,
    sceneProjection: field,
    terrainLoader: { acquire },
    app: { renderer: { type: RendererType.WEBGL } },
    displayCoast: {
      polygons: [{ id: 'actual-clip-fixture', points: [0, 0, 4096, 0, 4096, 4096, 0, 4096] }],
    },
    mountainRaster: null,
    forestRaster: null,
    groundMaterial: null,
    fieldMaterial: null,
    reliefSprite: null,
    forestSprite: null,
    applyLodAndCulling: vi.fn(),
  });
}
const settle = async (h: Harness) =>
  vi.waitFor(() => expect(h.terrainTexturesPending).toBe(false), { timeout: 2000, interval: 1 });
function clean(h: Harness, texture: Texture, canopyTexture?: Texture) {
  h.foothillCanopy?.destroy();
  h.projectedCanopy?.destroy();
  h.elevatedSurface?.destroy();
  h.destroyGroundSurface();
  h.layers.terrainBase.destroy({ children: true });
  texture.destroy(true);
  canopyTexture?.destroy(true);
}
it('actual loader emits continuous foothill Mesh from the borrowed original canopy and same sampled field', async () => {
  const texture = ground(),
    canopyTexture = canopy(),
    terrain = buildTerrainPack();
  const style = canopyTexture.source.style;
  const h = harness((id) =>
    Promise.resolve(
      id === terrain.groundArtAssetId
        ? texture
        : id === terrain.forestArtAssetId
          ? canopyTexture
          : null,
    ),
  );
  try {
    h.loadTerrainTextures();
    await settle(h);
    expect(h.terrainProjectionError).toBeNull();
    expect(h.foothillCanopy?.mesh).toBeInstanceOf(Mesh);
    const foothill = h.foothillCanopy!;
    expect(h.groundSurface!.paint.children).toEqual([
      h.elevatedSurface!.mesh,
      foothill.mesh,
      h.projectedCanopy!.container,
    ]);
    expect(foothill.mesh.parent).toBe(h.groundSurface!.paint);
    expect(h.groundSurface!.content.mask).toBe(h.groundSurface!.clip);
    expect(foothill.mesh.texture).toBe(canopyTexture);
    expect(canopyTexture.source.style).toBe(style);
    expect(foothill.geometry.getAttribute('aPosition').buffer.data).toBe(foothill.buffers.vertices);
    expect(foothill.geometry.indexBuffer.data).toBe(foothill.buffers.indices);
    const { vertices, indices, cells, worldSize } = foothill.buffers;
    expect(cells).toBe(128);
    expect(worldSize).toBe(4096);
    expect(vertices.length).toBe(129 * 129 * 6);
    expect(indices.length).toBe(128 * 128 * 6);
    let raised = 0;
    for (let row = 0; row <= cells; row++)
      for (let col = 0; col <= cells; col++) {
        const i = (row * (cells + 1) + col) * 6,
          p = { x: (col * worldSize) / cells, y: (row * worldSize) / cells };
        const scene = h.sceneProjection.project(p);
        expect(vertices[i]).toBe(Math.fround(scene.x));
        expect(vertices[i + 1]).toBe(Math.fround(scene.y));
        expect(vertices[i + 2]).toBe(p.x);
        expect(vertices[i + 3]).toBe(p.y);
        expect(vertices[i + 4]).toBeGreaterThanOrEqual(0);
        expect(vertices[i + 4]).toBeLessThanOrEqual(1);
        if (p.y - scene.y > 0 && vertices[i + 4]! > 0) raised++;
      }
    expect(raised).toBeGreaterThan(0);
    expect(foothill.getDiagnostics()).toMatchObject({
      ownedMeshes: 1,
      ownedGeometries: 1,
      ownedBuffers: 2,
      ownedTextures: 0,
      ownedSources: 0,
      ownedMasks: 0,
      ownedFilters: 0,
      ownedFramebuffers: 0,
      bufferBytes: 792600,
    });
    expect(foothill.getDiagnostics().positiveVertices).toBeGreaterThan(0);
    const geometryDestroy = vi.spyOn(foothill.geometry, 'destroy');
    const vertexDestroy = vi.spyOn(foothill.geometry.getAttribute('aPosition').buffer, 'destroy');
    const indexDestroy = vi.spyOn(foothill.geometry.indexBuffer, 'destroy');
    foothill.destroy();
    foothill.destroy();
    expect(geometryDestroy).toHaveBeenCalledTimes(1);
    expect(vertexDestroy).toHaveBeenCalledTimes(1);
    expect(indexDestroy).toHaveBeenCalledTimes(1);
    expect(foothill.getDiagnostics()).toMatchObject({
      ownedMeshes: 0,
      ownedBuffers: 0,
      bufferBytes: 0,
    });
    expect(canopyTexture.destroyed).toBe(false);
    expect(canopyTexture.source.destroyed).toBe(false);
  } finally {
    clean(h, texture, canopyTexture);
  }
});
it('uses the real loader consumer to admit an actual Mesh beneath the existing actual Graphics land clip', async () => {
  const texture = ground(),
    canopyTexture = canopy(),
    terrain = buildTerrainPack(),
    acquire = vi.fn((id: string) =>
      Promise.resolve(
        id === terrain.groundArtAssetId
          ? texture
          : id === terrain.forestArtAssetId
            ? canopyTexture
            : null,
      ),
    ),
    h = harness(acquire);
  try {
    h.loadTerrainTextures();
    await settle(h);
    expect(h.terrainProjectionError).toBeNull();
    expect(h.elevatedSurface?.mesh).toBeInstanceOf(Mesh);
    expect(h.groundSurface?.paint.children).toEqual([
      h.elevatedSurface!.mesh,
      h.foothillCanopy!.mesh,
      h.projectedCanopy!.container,
    ]);
    expect(h.groundSurface?.content.mask).toBe(h.groundSurface?.clip);
    expect(h.groundSurface?.clip).toBeInstanceOf(Graphics);
    expect(h.groundSurface?.container.parent).toBe(h.layers.terrainBase);
    expect(h.elevatedSurface!.mesh.texture).toBe(texture);
    expect(acquire).toHaveBeenCalledWith(terrain.forestArtAssetId);
    expect(h.projectedCanopy!.container.children).toHaveLength(10);
    expect(h.projectedCanopy!.container.parent).toBe(h.groundSurface!.paint);
    for (const child of h.projectedCanopy!.container.children) {
      expect(child).toBeInstanceOf(Mesh);
      const mesh = child as Mesh<Geometry>;
      expect(mesh.geometry).toBeInstanceOf(Geometry);
      expect(mesh.texture).toBe(canopyTexture);
    }
    for (const record of h.projectedCanopy!.getDiagnostics().forests) {
      const patch = forestRasterLayout(terrain).find((p) => p.id === record.id)!;
      const placement = mountainRasterPlacement(patch, canopyTexture.width, canopyTexture.height);
      expect(record.placement).toEqual(placement);
      for (let i = 0; i < record.sourceGround.length; i += 2) {
        const p = { x: record.sourceGround[i]!, y: record.sourceGround[i + 1]! },
          scene = h.sceneProjection.project(p),
          j = i * 2;
        expect(record.projectedUV[j]).toBe(Math.fround(scene.x));
        expect(record.projectedUV[j + 1]).toBe(Math.fround(scene.y));
        expect(record.projectedUV[j + 2]).toBe(
          Math.fround((p.x - placement.x) / (canopyTexture.width * placement.scale)),
        );
        expect(record.projectedUV[j + 3]).toBe(
          Math.fround((p.y - placement.y) / (canopyTexture.height * placement.scale)),
        );
      }
    }
    expect(h.elevatedSurface!.getDiagnostics()).toMatchObject({
      ownedMeshes: 1,
      ownedShaders: 1,
      ownedPrograms: 1,
      ownedTextures: 0,
      ownedSources: 0,
    });
    expect(
      h.elevatedSurface!.buffers.vertices.some(
        (value, index) => index % 6 === 1 && value % 32 !== 0,
      ),
    ).toBe(true);
    expect(h.groundMaterial).toBeNull();
    expect(h.mountainRaster).toBeNull();
    expect(h.forestRaster).toBeNull();
    h.elevatedSurface!.destroy();
    expect(texture.destroyed).toBe(false);
    expect(texture.source.destroyed).toBe(false);
    h.projectedCanopy!.destroy();
    expect(h.projectedCanopy!.getDiagnostics()).toMatchObject({
      ownedMeshes: 0,
      ownedGeometries: 0,
      ownedBuffers: 0,
    });
    expect(canopyTexture.destroyed).toBe(false);
    expect(canopyTexture.source.destroyed).toBe(false);
  } finally {
    clean(h, texture, canopyTexture);
  }
});
it('reports missing projected ground and never falls through to old flat paint', async () => {
  const texture = ground(),
    h = harness((id) => {
      if (id === buildTerrainPack().groundArtAssetId)
        return Promise.reject(new Error('ground unavailable'));
      return Promise.resolve(texture);
    });
  try {
    h.loadTerrainTextures();
    await settle(h);
    expect(h.terrainProjectionError).toBe('Elevated terrain ground texture unavailable');
    expect(h.elevatedSurface).toBeNull();
    expect(h.projectedCanopy).toBeNull();
    expect(h.foothillCanopy).toBeNull();
    expect(h.reliefSprite).toBeNull();
    expect(h.forestSprite).toBeNull();
    expect(h.groundMaterial).toBeNull();
  } finally {
    clean(h, texture);
  }
});
it('reports actual native-factory admission failure instead of hiding it or emitting old sprites', async () => {
  const texture = ground();
  texture.frame.x = 1;
  const h = harness(() => Promise.resolve(texture));
  try {
    h.loadTerrainTextures();
    await settle(h);
    expect(h.terrainProjectionError).toBe('elevated surface requires original full ground texture');
    expect(h.elevatedSurface).toBeNull();
    expect(h.projectedCanopy).toBeNull();
    expect(h.foothillCanopy).toBeNull();
    expect(h.reliefSprite).toBeNull();
    expect(h.forestSprite).toBeNull();
  } finally {
    clean(h, texture);
  }
});
it('rejects a stale async generation before surface allocation and retains shared inputs', async () => {
  const texture = ground();
  let resolve!: (texture: Texture) => void;
  const pending = new Promise<Texture>((r) => {
    resolve = r;
  });
  const h = harness(async () => pending);
  try {
    h.loadTerrainTextures();
    expect(h.terrainTexturesPending).toBe(true);
    h.terrainLoadGeneration++;
    resolve(texture);
    await Promise.resolve();
    await new Promise<void>((r) => setTimeout(r, 5));
    expect(h.elevatedSurface).toBeNull();
    expect(h.projectedCanopy).toBeNull();
    expect(h.foothillCanopy).toBeNull();
    expect(h.groundSurface).toBeNull();
    expect(texture.destroyed).toBe(false);
  } finally {
    clean(h, texture);
  }
});
it('keeps projected ground when the optional canopy acquisition is unavailable', async () => {
  const texture = ground(),
    terrain = buildTerrainPack(),
    h = harness((id) =>
      id === terrain.forestArtAssetId
        ? Promise.reject(new Error('optional canopy unavailable'))
        : Promise.resolve(id === terrain.groundArtAssetId ? texture : null),
    );
  try {
    h.loadTerrainTextures();
    await settle(h);
    expect(h.terrainProjectionError).toBeNull();
    expect(h.elevatedSurface?.mesh).toBeInstanceOf(Mesh);
    expect(h.projectedCanopy).toBeNull();
    expect(h.foothillCanopy).toBeNull();
    expect(h.groundSurface!.paint.children).toEqual([h.elevatedSurface!.mesh]);
    expect(h.reliefSprite).toBeNull();
    expect(h.forestSprite).toBeNull();
  } finally {
    clean(h, texture);
  }
});
it('actual loader reload disposes the previous continuous canopy once before admitting its replacement', async () => {
  const texture = ground(),
    canopyTexture = canopy(),
    terrain = buildTerrainPack();
  const h = harness((id) =>
    Promise.resolve(
      id === terrain.groundArtAssetId
        ? texture
        : id === terrain.forestArtAssetId
          ? canopyTexture
          : null,
    ),
  );
  try {
    h.loadTerrainTextures();
    await settle(h);
    const previous = h.foothillCanopy!;
    expect(previous.mesh).toBeInstanceOf(Mesh);
    const geometryDestroy = vi.spyOn(previous.geometry, 'destroy');
    h.loadTerrainTextures();
    expect(h.foothillCanopy).toBeNull();
    expect(geometryDestroy).toHaveBeenCalledTimes(1);
    expect(previous.getDiagnostics()).toMatchObject({
      ownedMeshes: 0,
      ownedBuffers: 0,
      bufferBytes: 0,
    });
    expect(canopyTexture.destroyed).toBe(false);
    await settle(h);
    expect(h.foothillCanopy?.mesh).toBeInstanceOf(Mesh);
    expect(h.foothillCanopy).not.toBe(previous);
    expect(h.groundSurface!.paint.children).toEqual([
      h.elevatedSurface!.mesh,
      h.foothillCanopy!.mesh,
      h.projectedCanopy!.container,
    ]);
    expect(geometryDestroy).toHaveBeenCalledTimes(1);
  } finally {
    clean(h, texture, canopyTexture);
  }
});
