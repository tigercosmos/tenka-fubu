import { createWasmGeographicScorer } from '@ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
// @vitest-environment jsdom
// Scene-graph/lifecycle contracts with shared Pixi mocks, not native pixel proof.
import { describe, expect, it, vi } from 'vitest';
const tracked = vi.hoisted(() => ({ textures: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([], tracked);
});
import { MapRenderer } from '@ui/map/MapRenderer';
import * as bridgeFootprints from '@ui/map/constrainedCoast';
import { MapAssetLoader } from '@ui/assets/loader';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId } from '@core/state/ids';
import type { MapStaticData, MapViewState } from '@ui/map/mapViewTypes';
import { Mesh, Sprite, Texture } from 'pixi.js';

function data(): MapStaticData {
  const id = 'castle.test' as CastleId;
  return {
    graph: buildMapGraph({ [id]: { id, pos: { x: 150, y: 150 } } }, {}, {}),
    clanColorIndex: {},
    outline: {
      version: 1,
      source: 'handcrafted',
      polygons: [{ id: 'island', points: [100, 100, 300, 100, 300, 300, 100, 300] }],
    },
    terrain: { reliefAssetId: 'test.relief', forestAssetId: 'test.forest', rivers: [], lakes: [] },
  };
}
const view: MapViewState = {
  day: 1,
  districtOwner: {},
  castles: [],
  armies: [],
  battles: [],
  selection: null,
  analysisMode: 'none',
};
async function start() {
  const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
  await renderer.init(document.createElement('div'), vi.fn());
  return renderer;
}
function parts(renderer: MapRenderer) {
  const layers = renderer.getLayers()!;
  const sea = layers.seaBackground.children.find((c) => c.label === 'coast-shallow-shelf');
  const ground = layers.terrainBase.children.find((c) => c.label === 'terrain-ground-surface');
  if (!sea || !ground) throw new Error('Missing actual coast scene partition');
  const content = ground.children[0]!;
  const bank = content.children.find((c) => c.label === 'coast-bank-slope');
  if (!bank) throw new Error('Missing bank');
  return {
    layers,
    sea,
    ground,
    content,
    bank,
    seaMesh: sea.children[0] as Mesh,
    bankMesh: bank.children[0] as Mesh,
  };
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
describe('coast renderer mock scene ordering and resource ownership', () => {
  it('collects current-map bridge protection on every rebuild and keeps raw rivers when collection fails', async () => {
    const r = await start();
    const input = data();
    input.terrain!.rivers = [
      {
        id: 'rv.bridge-guard',
        widthClass: 3,
        points: [
          { x: 140, y: 150 },
          { x: 210, y: 150 },
          { x: 210, y: 230 },
          { x: 260, y: 230 },
        ],
      },
    ];
    const collector = vi.spyOn(bridgeFootprints, 'collectRiverBridgeFootprints');
    const before = structuredClone(input.terrain!.rivers);
    try {
      collector.mockReturnValueOnce([
        { id: 'bridge:test', a: { x: 210, y: 150 }, b: { x: 210, y: 150 }, radius: 36 },
      ]);
      r.setMapData(input);
      expect(collector).toHaveBeenLastCalledWith(input.graph);
      const protectedRiver = r.getDiagnostics().riverRendering.materials.rivers[0]!;
      expect(protectedRiver.curvedCorners).toBe(0);
      expect(protectedRiver.displaySegments).toEqual(
        protectedRiver.segments.map((segment, sourceSegment) => ({ ...segment, sourceSegment })),
      );
      collector.mockReturnValueOnce(null);
      const invalid = { ...input, graph: { ...input.graph, edges: new Map(input.graph.edges) } };
      r.setMapData(invalid);
      expect(collector).toHaveBeenLastCalledWith(invalid.graph);
      expect(r.getDiagnostics().riverRendering.materials.rivers[0]!.curvedCorners).toBe(0);
      collector.mockReturnValueOnce([]);
      r.setMapData(input);
      const unprotected = r.getDiagnostics().riverRendering.materials;
      expect(unprotected.rivers[0]!.curvedCorners).toBeGreaterThan(0);
      expect(unprotected.ownedMaskGraphics).toBe(1);
      expect(unprotected.ownedDisplayGraphics).toBe(1);
      expect(input.terrain!.rivers).toEqual(before);
      r.setMapData(null);
      expect(r.getDiagnostics().riverRendering.materials).toMatchObject({
        ownedMaskGraphics: 0,
        ownedDisplayGraphics: 0,
        rivers: [],
      });
    } finally {
      r.destroy();
      collector.mockRestore();
    }
  });
  it('keeps river-only owner resources stable on day and LOD changes and releases the exact river source on replacement', async () => {
    const r = await start();
    const shared = new Texture();
    const sharedDestroy = vi.spyOn(shared, 'destroy');
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(shared);
    const riverData = data();
    riverData.terrain!.rivers = [
      {
        id: 'rv.owner',
        widthClass: 3,
        points: [
          { x: 150, y: 150 },
          { x: 210, y: 180 },
          { x: 240, y: 210 },
        ],
      },
    ];
    const before = structuredClone(riverData.terrain!.rivers);
    const findRiverTexture = () =>
      tracked.textures
        .map((t) => t as Texture)
        .find((t) => {
          if (t.destroyed || !t.source?.style) return false;
          const listeners: unknown = Reflect.get(t.source.style, 'listeners');
          return listeners instanceof Set && listeners.size === 1;
        });
    try {
      r.setMapData(riverData);
      await settle();
      const texture = findRiverTexture();
      expect(texture).toBeDefined();
      const destroyTexture = vi.spyOn(texture!, 'destroy');
      const destroySource = vi.spyOn(texture!.source, 'destroy');
      const removeListener = vi.spyOn(texture!.source.style, 'off');
      const water = r.getLayers()!.waterFeatures.children[0];
      expect(water!.children).toHaveLength(4);
      const initial = r.getDiagnostics().riverRendering.materials;
      expect(initial).toMatchObject({ ownedTextures: 1, ownedSources: 1, ownedStyleListeners: 1 });
      expect(initial.rivers[0]).toMatchObject({
        id: 'rv.owner',
        points: before[0]!.points,
        kind: 'bankReflection',
      });
      expect(r.getDiagnostics().resources).toMatchObject({
        ownedRiverTextures: 1,
        ownedRiverSources: 1,
        riverStyleListeners: 1,
        riverRgbaBytes: initial.rgbaBytes,
      });
      expect(r.getDiagnostics().waterRendering.materials.ownedTextures).toBe(0);
      for (const [day, scale] of [
        [1, 0.4],
        [2, 0.7],
        [3, 1.5],
        [4, 0.4],
      ] as const) {
        r.setCameraPose({ x: 200, y: 200 }, scale);
        r.updateView({ ...view, day });
        expect(r.getLayers()!.waterFeatures.children[0]).toBe(water);
        expect(findRiverTexture()).toBe(texture);
        expect(destroyTexture).not.toHaveBeenCalled();
        expect(r.getDiagnostics().riverRendering.materials).toEqual(initial);
      }
      r.setMapData(data());
      await settle();
      expect(destroyTexture).toHaveBeenCalledTimes(1);
      expect(destroyTexture).toHaveBeenCalledWith(true);
      expect(destroySource).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(findRiverTexture()).toBeUndefined();
      expect(r.getDiagnostics().resources).toMatchObject({
        ownedRiverTextures: 0,
        ownedRiverSources: 0,
        riverStyleListeners: 0,
        riverRgbaBytes: 0,
      });
      expect(riverData.terrain!.rivers).toEqual(before);
      r.setMapData(null);
      r.destroy();
      r.destroy();
      expect(destroyTexture).toHaveBeenCalledTimes(1);
      expect(sharedDestroy).not.toHaveBeenCalled();
    } finally {
      r.destroy();
      acquire.mockRestore();
    }
  });
  it('owns one static sea surface below shelf and land, with stable identity and symmetric teardown', async () => {
    const r = await start();
    r.setMapData(data());
    await settle();
    const layers = r.getLayers()!;
    const findSea = () =>
      layers.seaBackground.children[0]!.children.find(
        (child) => child.label === 'sea-surface-material',
      );
    const first = findSea();
    expect(first).toBeDefined();
    const sprite = first!.children[0] as Sprite;
    const texture = sprite.texture;
    const destroyTexture = vi.spyOn(texture, 'destroy');
    const destroySource = vi.spyOn(texture.source, 'destroy');
    const diagnostics = r.getDiagnostics();
    expect(diagnostics.resources.ownedSeaTextures).toBe(1);
    expect(diagnostics.resources.ownedSeaSources).toBe(1);
    expect(diagnostics.resources.seaRgbaBytes).toBe(1_048_576);
    r.updateView(view);
    r.updateView({ ...view, day: 2 });
    expect(findSea()).toBe(first);
    expect(r.getDiagnostics().seaRendering).toEqual(diagnostics.seaRendering);
    r.setMapData(data());
    await settle();
    expect(findSea()).not.toBe(first);
    expect(destroyTexture).toHaveBeenCalledTimes(1);
    expect(destroySource).toHaveBeenCalledTimes(1);
    const second = findSea()!.children[0] as Sprite;
    const secondDestroy = vi.spyOn(second.texture, 'destroy');
    r.setMapData(null);
    await settle();
    expect(findSea()).toBeUndefined();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
    expect(r.getDiagnostics().seaRendering).toBeNull();
    expect(r.getDiagnostics().resources.seaRgbaBytes).toBe(0);
    r.destroy();
    r.destroy();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
    // Shared WHITE safety is checked with real Pixi in seaSurface.spec.ts, not this scene mock.
  });
  it('places the shelf between sea base and opaque land, with ground paint below the clipped bank', async () => {
    const shared = new Texture();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(shared);
    const r = await start();
    try {
      const map = data();
      map.terrain!.groundArtAssetId = 'test.grass';
      map.terrain!.fieldMaterialAssetId = 'test.fields';
      r.setMapData(map);
      await settle();
      const p = parts(r);
      expect(p.layers.seaBackground.children[0]).not.toBe(p.sea);
      expect(p.layers.seaBackground.children.indexOf(p.sea)).toBe(1);
      expect(p.layers.seaBackground.children).toHaveLength(3);
      expect(p.content.mask).toBe(p.ground.children[1]);
      expect(p.content.children).toHaveLength(2);
      const paint = p.content.children[0]!.children;
      // The active shared projection owns one global surface, not the old
      // independent flat ground/field/material/shade children. Coast clips
      // and ordering below still apply to this exact borrowed-texture owner.
      expect(paint).toHaveLength(1);
      expect(paint[0]).toBeInstanceOf(Mesh);
      const elevated = paint[0] as Mesh;
      expect(elevated.label).toBe('terrain-elevated-surface');
      expect(elevated.texture).toBe(shared);
      const attributes = elevated.geometry.attributes;
      expect(attributes.aPosition!.stride).toBe(24);
      expect(attributes.aUV!.stride).toBe(24);
      expect(attributes.aUV!.offset).toBe(8);
      expect(attributes.aLight!.offset).toBe(16);
      expect(attributes.aSubstrate!.offset).toBe(20);
      const attributeBuffer = elevated.geometry.getBuffer('aPosition');
      expect(elevated.geometry.getBuffer('aUV')).toBe(attributeBuffer);
      expect(elevated.geometry.getBuffer('aLight')).toBe(attributeBuffer);
      expect(elevated.geometry.getBuffer('aSubstrate')).toBe(attributeBuffer);
      const indexBuffer = elevated.geometry.indexBuffer;
      expect(indexBuffer).toBeDefined();
      expect(indexBuffer).not.toBe(attributeBuffer);
      expect(attributeBuffer.data).toBeInstanceOf(Float32Array);
      expect(indexBuffer.data).toBeInstanceOf(Uint32Array);
      const bytes = attributeBuffer.data.byteLength + indexBuffer.data.byteLength;
      expect(bytes).toBe(1_966_080);
      expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
      const projection = r.getDiagnostics().elevationRendering;
      expect(projection.active).toBe(true);
      expect(projection.error).toBeNull();
      expect(projection.surface).toEqual({
        ownedMeshes: 1,
        ownedGeometries: 1,
        ownedBuffers: 2,
        ownedShaders: 1,
        ownedPrograms: 1,
        ownedTextures: 0,
        ownedSources: 0,
        ownedMasks: 0,
        ownedFilters: 0,
        bufferBytes: 1_966_080,
      });
      const meshDestroy = vi.spyOn(elevated, 'destroy');
      const geometryDestroy = vi.spyOn(elevated.geometry, 'destroy');
      const attributeDestroy = vi.spyOn(attributeBuffer, 'destroy');
      const indexDestroy = vi.spyOn(indexBuffer, 'destroy');
      const shader = elevated.shader;
      if (!shader) throw new Error('Missing actual elevated shader');
      const shaderDestroy = vi.spyOn(shader, 'destroy');
      const program = shader.glProgram;
      expect(program).toBeDefined();
      const programDestroy = vi.spyOn(program, 'destroy');
      expect(p.content.children[1]).toBe(p.bank);
      expect(p.seaMesh.texture).toBe(p.bankMesh.texture);
      expect(p.seaMesh.texture).not.toBe(shared);
      expect(r.getDiagnostics().coastRendering.groundClipPolygons).toEqual(
        r.getDiagnostics().coastRendering.displayPolygons,
      );
      r.destroy();
      r.destroy();
      expect(meshDestroy).toHaveBeenCalledTimes(1);
      expect(geometryDestroy).toHaveBeenCalledTimes(1);
      expect(attributeDestroy).toHaveBeenCalledTimes(1);
      expect(indexDestroy).toHaveBeenCalledTimes(1);
      expect(shaderDestroy).toHaveBeenCalledTimes(1);
      expect(programDestroy).toHaveBeenCalledTimes(1);
      expect(shared.destroyed).toBe(false);
    } finally {
      r.destroy();
      acquire.mockRestore();
    }
    expect(shared.destroyed).toBe(false);
  });
  it('keeps the coast meshes and resource identities unchanged on ordinary view/idle frames', async () => {
    const r = await start();
    try {
      r.setMapData(data());
      await settle();
      const before = parts(r),
        diagnostics = r.getDiagnostics().coastRendering.surface;
      r.updateView(view);
      r.updateView({ ...view, day: 2 });
      const internal = r as unknown as { app: { ticker: { tick(): void } } };
      internal.app.ticker.tick();
      internal.app.ticker.tick();
      const after = parts(r);
      expect(after.sea).toBe(before.sea);
      expect(after.bank).toBe(before.bank);
      expect(after.seaMesh.texture).toBe(before.seaMesh.texture);
      expect(r.getDiagnostics().coastRendering.surface).toEqual(diagnostics);
    } finally {
      r.destroy();
    }
  });
  it('releases each superseded coast owner once and retains the successor until final destroy', async () => {
    const r = await start();
    r.setMapData(data());
    await settle();
    const first = parts(r),
      texture = first.seaMesh.texture;
    const textureDestroy = vi.spyOn(texture, 'destroy');
    const sourceDestroy = vi.spyOn(texture.source, 'destroy');
    const seaDestroy = vi.spyOn(first.seaMesh.geometry, 'destroy');
    const bankDestroy = vi.spyOn(first.bankMesh.geometry, 'destroy');
    r.setMapData(data());
    await settle();
    const second = parts(r);
    expect(second.seaMesh.texture).not.toBe(texture);
    expect(textureDestroy).toHaveBeenCalledTimes(1);
    expect(sourceDestroy).toHaveBeenCalledTimes(1);
    expect(seaDestroy).toHaveBeenCalledTimes(1);
    expect(bankDestroy).toHaveBeenCalledTimes(1);
    expect(second.seaMesh.texture.destroyed).toBe(false);
    r.destroy();
    r.destroy();
    expect(second.seaMesh.texture.destroyed).toBe(true);
    expect(textureDestroy).toHaveBeenCalledTimes(1);
  });
  it('removes the previous opaque land node when the next profile fails closed', async () => {
    const r = await start();
    try {
      r.setMapData(data());
      await settle();
      const layers = r.getLayers()!,
        oldLand = layers.seaBackground.children[2]!;
      const invalid = data();
      invalid.outline = { version: 1, source: 'handcrafted', polygons: [] };
      r.setMapData(invalid);
      await settle();
      expect(layers.seaBackground.children).not.toContain(oldLand);
      expect(layers.seaBackground.children.some((c) => c.label === 'coast-shallow-shelf')).toBe(
        false,
      );
      expect(r.getDiagnostics().coastRendering.surface).toBeNull();
    } finally {
      r.destroy();
    }
  });
  it('clears owned coast resources and ground groups when static map data is removed', async () => {
    const r = await start();
    try {
      r.setMapData(data());
      await settle();
      const old = parts(r),
        texture = old.seaMesh.texture;
      r.setMapData(null);
      await settle();
      expect(texture.destroyed).toBe(true);
      expect(
        r.getLayers()!.terrainBase.children.some((c) => c.label === 'terrain-ground-surface'),
      ).toBe(false);
      expect(r.getDiagnostics().coastRendering.surface).toBeNull();
    } finally {
      r.destroy();
    }
  });
});
