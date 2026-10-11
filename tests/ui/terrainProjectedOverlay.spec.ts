import { afterEach, expect, it, vi } from 'vitest';
import { Buffer, BufferImageSource, Mesh, MeshGeometry, Rectangle, Texture } from 'pixi.js';
import { createTerrainSprite } from '@ui/map/terrain/terrainDraw';
import {
  createProjectedTerrainOverlay,
  type ProjectedOverlayField,
} from '@ui/map/terrain/terrainProjectedOverlay';
afterEach(() => vi.restoreAllMocks());

function field(cells = 128, worldSize = 4096): ProjectedOverlayField {
  const heights = Array.from({ length: (cells + 1) ** 2 }, (_, i) => {
    const x = (i % (cells + 1)) / cells,
      y = Math.floor(i / (cells + 1)) / cells;
    return 8 * Math.sin(Math.PI * x) * Math.sin(Math.PI * y);
  });
  return {
    vertexHeights: Object.freeze(heights),
    bounds: { worldSize, cells, displacementLipschitz: 0.3 },
    project: (p) => {
      const h = 8 * Math.sin((Math.PI * p.x) / worldSize) * Math.sin((Math.PI * p.y) / worldSize);
      return { x: p.x - 0.18 * h, y: p.y - h };
    },
  };
}

it('actual raster producer follows the sampled ground instead of remaining a flat Sprite', () => {
  const surface = field(2, 64);
  // The authentic old-producer RED passed this surface as an extra JS argument;
  // it was ignored. Retain that producer's flat output as a typed negative control.
  const old = createTerrainSprite(Texture.EMPTY);
  expect(old).not.toBeInstanceOf(Mesh);
  old.destroy({ texture: false });
  const actual = createProjectedTerrainOverlay(Texture.EMPTY, surface);
  try {
    expect(actual.mesh).toBeInstanceOf(Mesh);
    expect(actual.mesh.geometry.positions[8]).toBeCloseTo(30.56, 5);
    expect(actual.mesh.geometry.positions[9]).toBe(24);
  } finally {
    actual.destroy();
  }
});

it('uses the exact source-UV grid and 00→11 diagonal with bounded real Pixi ownership', () => {
  const input = field(),
    callback = vi.spyOn(input, 'project');
  const actual = createProjectedTerrainOverlay(Texture.EMPTY, input),
    g = actual.mesh.geometry;
  try {
    expect(g).toBeInstanceOf(MeshGeometry);
    expect(actual.mesh.shader).toBeNull();
    expect(actual.mesh.eventMode).toBe('none');
    expect(g.indices).toBeInstanceOf(Uint16Array);
    expect(g.indices.length).toBe(98304);
    expect(Array.from(g.indices.slice(0, 6))).toEqual([0, 1, 130, 0, 130, 129]);
    expect(actual.getDiagnostics()).toMatchObject({
      vertices: 16641,
      triangles: 32768,
      bufferBytes: 462864,
      ownedMeshes: 1,
      ownedGeometries: 1,
      ownedBuffers: 3,
      ownedTextures: 0,
      ownedTextureSources: 0,
      ownedShaders: 0,
    });
    expect(new Set(g.buffers).size).toBe(3);
    expect(callback).toHaveBeenCalledTimes(16641);
    for (let y = 0; y <= 128; y++)
      for (let x = 0; x <= 128; x++) {
        const i = (y * 129 + x) * 2;
        expect(g.uvs[i]).toBe(x / 128);
        expect(g.uvs[i + 1]).toBe(y / 128);
        const p = input.project({ x: x * 32, y: y * 32 });
        expect(g.positions[i]).toBe(Math.fround(p.x));
        expect(g.positions[i + 1]).toBe(Math.fround(p.y));
      }
  } finally {
    actual.destroy();
  }
});

it('cleans actual allocated geometry if the real Mesh texture subscription throws', () => {
  const texture = new Texture({ source: Texture.EMPTY.source, dynamic: true });
  const textureDestroy = vi.spyOn(texture, 'destroy');
  const subscribe = vi.spyOn(texture, 'on').mockImplementationOnce(() => {
    throw new Error('injected texture subscription failure');
  });
  const geometryDestroy = vi.spyOn(MeshGeometry.prototype, 'destroy');
  const bufferDestroy = vi.spyOn(Buffer.prototype, 'destroy');
  expect(() => createProjectedTerrainOverlay(texture, field())).toThrow(
    'injected texture subscription failure',
  );
  expect(subscribe).toHaveBeenCalled();
  expect(geometryDestroy).toHaveBeenCalledTimes(1);
  expect(geometryDestroy).toHaveBeenCalledWith(false);
  expect(bufferDestroy).toHaveBeenCalledTimes(3);
  expect(new Set(bufferDestroy.mock.instances).size).toBe(3);
  expect(textureDestroy).not.toHaveBeenCalled();
  texture.destroy(false);
});

it('retains shared full-frame RGBA, alpha upload semantics and idempotently releases three buffers once', () => {
  const rgba = new Uint8Array([
    20, 30, 40, 0, 50, 60, 70, 128, 80, 90, 100, 255, 110, 120, 130, 200,
  ]);
  const source = new BufferImageSource({
    resource: rgba,
    width: 2,
    height: 2,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  const texture = new Texture({ source }),
    before = rgba.slice();
  const actual = createProjectedTerrainOverlay(texture, field()),
    geometry = actual.mesh.geometry;
  const buffers = geometry.buffers.map((buffer) => vi.spyOn(buffer, 'destroy'));
  const meshDestroy = vi.spyOn(actual.mesh, 'destroy'),
    geometryDestroy = vi.spyOn(geometry, 'destroy');
  const textureDestroy = vi.spyOn(texture, 'destroy'),
    sourceDestroy = vi.spyOn(source, 'destroy');
  expect(actual.mesh.texture).toBe(texture);
  expect(actual.mesh.texture.source).toBe(source);
  expect(source.resource).toBe(rgba);
  expect(rgba).toEqual(before);
  actual.destroy();
  actual.destroy();
  expect(meshDestroy).toHaveBeenCalledTimes(1);
  expect(geometryDestroy).toHaveBeenCalledTimes(1);
  for (const destroy of buffers) expect(destroy).toHaveBeenCalledTimes(1);
  expect(textureDestroy).not.toHaveBeenCalled();
  expect(sourceDestroy).not.toHaveBeenCalled();
  expect(actual.getDiagnostics()).toMatchObject({
    ownedMeshes: 0,
    ownedGeometries: 0,
    ownedBuffers: 0,
    bufferBytes: 0,
  });
  texture.destroy(true);
});

it('fails closed on invalid budgets, heights, projection, fold or non-full-frame input before Mesh construction', () => {
  const input = field(2, 64),
    project = vi.spyOn(input, 'project');
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, {
      ...input,
      bounds: { ...input.bounds, cells: 129 },
    }),
  ).toThrow(RangeError);
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, { ...input, vertexHeights: [NaN] }),
  ).toThrow(RangeError);
  expect(project).not.toHaveBeenCalled();
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, { ...input, project: () => ({ x: NaN, y: 0 }) }),
  ).toThrow(RangeError);
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, {
      ...input,
      project: (p) => ({ x: -p.x, y: p.y }),
    }),
  ).toThrow(/folded/);
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, { ...input, project: () => ({ x: 1, y: 1 }) }),
  ).toThrow(/folded/);
  const cropSource = new BufferImageSource({ resource: new Uint8Array(16), width: 2, height: 2 });
  const cropped = new Texture({ source: cropSource, frame: new Rectangle(0, 0, 1, 1) });
  expect(() => createProjectedTerrainOverlay(cropped, input)).toThrow(/full-frame/);
  cropped.destroy(true);
});
