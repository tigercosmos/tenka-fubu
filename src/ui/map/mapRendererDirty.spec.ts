// MapRenderer dirty-update 整合測試（M6-V4 §7 DoD①②③；決策 D10 panTo；決策 D11 getRebuildCounts）。
//
// 路徑說明（偏離設計文件建議路徑 `tests/ui/mapRendererDirty.spec.ts` 的紀錄）：`vitest.workspace.ts`
// 將 `tests/**/*.spec.ts` 全數歸入 `core`（node 環境）project，僅 `src/ui/**/*.spec.ts(x)` 歸入
// `ui`（jsdom）project。`MapRenderer.init()` 直接讀 `window.matchMedia`/`window.devicePixelRatio`
// （非經 pixi.js），在無 `window` 全域的 node 環境下會直接 ReferenceError；本檔需要真正呼叫
// `init()`（建立 8 圖層／`camera`／`nodeParts` 等）才能驅動 `setMapData`/`updateView`/`panTo`，
// 故比照既有 `MapCanvasHost.spec.tsx`（同樣需要 jsdom＋mock pixi）改置於 `src/ui/map/` 下
// （`.spec.ts`，非 React 元件，沿用 `MapCanvasHost.spec.tsx`「MapRenderer 生命週期」區塊之直接
// `new MapRenderer()` 手法，無需 `.tsx`／RTL）。任務指示「只動 slice 擁有的檔案」與此路徑調整
// 不衝突——`src/ui/map/**` 本就是 Slice B 擁有的目錄。
//
// mock 手法：沿用共用 `tests/helpers/pixiMock.ts`（`createPixiMockClasses`，與
// `MapCanvasHost.spec.tsx`／`MainScreen.spec.tsx` 同源）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const apps: { destroyed: boolean }[] = [];
  // M6-V5（§8.2）：territory 自持 BufferImageSource/Texture 生命週期追蹤（首幀著色／owner 翻轉
  // recolor 之 source.update 次數、重掛對稱 destroy）。
  const bufferSources: { updateCalls: number; destroyed: boolean }[] = [];
  const textures: { destroyed: boolean }[] = [];
  return { apps, bufferSources, textures };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps, {
    bufferSources: hoisted.bufferSources,
    textures: hoisted.textures,
  });
});

import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import type { JapanOutlineFile } from '@data/schemas/outline';
import { MapRenderer } from './MapRenderer';
import type { CastleNodePart } from './sceneParts/castleNode';
import { MapAssetLoader } from '@ui/assets/loader';
import {
  Assets,
  BitmapText,
  Container,
  Geometry,
  Graphics,
  Mesh,
  RendererType,
  Sprite,
  Texture,
} from 'pixi.js';
import type { createTerrainElevatedSurface } from './terrain/terrainElevatedSurface';
import type { MapStaticData, MapViewState } from './mapViewTypes';
import { MAPVIEW, TERRAIN_RELIEF } from './mapViewConfig';
import { TOKENS_NUM } from '@ui/styles/tokens';
import nationalCastles from '@data/scenarios/s1560/castles.json';
import nationalRoads from '@data/scenarios/s1560/roads.json';
import { edgeVisualPolyline } from './roads/roadGeometry';
import {
  ANALYSIS_COLORS,
  analysisSignature,
  buildAnalysisMarks,
  buildFactionPixels,
} from './analysisOverlay/analysisModel';
import type { TerritoryGrid } from './territoryGrid';
import { buildTerritoryGrid } from './territoryGrid';
import { buildDisplayCoast } from './displayCoast';
import { MapInteraction } from './interaction';
import * as terrainRaster from './terrain/terrainRaster';
import * as plateLayout from './armyPlateLayout';
import * as geographyLayout from './geographicLabelLayout';
import { PixiMockRenderRunner } from '../../../tests/helpers/pixiMock';

/**
 * 環繞 fixture 節點（100–300 世界座標）之小型合成 outline（M6-V5，Minor 6／§5.5）：使
 * `buildTerritoryLayer` 的 `buildTerritoryGrid` 掃描線只掃小陸地範圍、hermetic 且快，不啟用完整
 * 470 點 japan outline fallback。（`source:'handcrafted'` 僅為滿足型別；本檔不經 zod 驗證。）
 */
const TEST_OUTLINE: JapanOutlineFile = {
  version: 1,
  source: 'handcrafted',
  polygons: [{ id: 'box', points: [50, 50, 350, 50, 350, 350, 50, 350] }],
};

/** castle.a(100,100) — dist.x(200,100) — castle.b(300,100)：單一連通鏈，供 buildMapGraph 驗證。 */
function fixtureGraph(): ReturnType<typeof buildMapGraph> {
  const castles = {
    'castle.a': { id: 'castle.a' as CastleId, pos: { x: 100, y: 100 } },
    'castle.b': { id: 'castle.b' as CastleId, pos: { x: 300, y: 100 } },
  } as unknown as Parameters<typeof buildMapGraph>[0];
  const districts = {
    'dist.x': {
      id: 'dist.x' as DistrictId,
      pos: { x: 200, y: 100 },
      isPort: false,
      castleId: 'castle.a' as CastleId,
    },
  } as unknown as Parameters<typeof buildMapGraph>[1];
  const road = (id: string, a: string, b: string): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type: 'land',
    grade: 1,
    baseDays: 1,
  });
  const roads = {
    'road.a-x': road('road.a-x', 'castle.a', 'dist.x'),
    'road.x-b': road('road.x-b', 'dist.x', 'castle.b'),
  } as unknown as Parameters<typeof buildMapGraph>[2];
  return buildMapGraph(castles, districts, roads);
}

function staticData(overrides: Partial<MapStaticData> = {}): MapStaticData {
  return {
    graph: fixtureGraph(),
    clanColorIndex: { 'clan.oda': 0, 'clan.imagawa': 1 },
    outline: TEST_OUTLINE, // M6-V5：hermetic 小型 outline（territory grid 快建，Minor 6）
    ...overrides,
  };
}

/** Typed synthetic moving view; reversing the edge really selects the west artwork. */
function paintedArmy(reverse = false): MapViewState['armies'][number] {
  return {
    id: 'army.art',
    clanId: 'clan.oda',
    soldiers: 2000,
    status: 'marching',
    morale: 80,
    foodDays: 20,
    mission: 'march',
    corps: false,
    selected: false,
    relation: 'friendly',
    fromNode: reverse ? ('dist.x' as DistrictId) : ('castle.a' as CastleId),
    toNode: reverse ? ('castle.a' as CastleId) : ('dist.x' as DistrictId),
    edgeT: 0.5,
  };
}

describe('pre-paint screen-layout coalescing', () => {
  it('models actual object runners, duplicate registration and exact observer removal', () => {
    const runner = new PixiMockRenderRunner('prerender');
    const a = {
      calls: 0,
      prerender() {
        this.calls++;
      },
    };
    const b = { prerender: vi.fn() };
    const options = { container: 'scene' };
    runner.add(a).add(a).add(b).emit(options);
    expect(a.calls).toBe(1);
    expect(b.prerender).toHaveBeenCalledWith(options);
    runner.remove(a).emit(options);
    expect(runner.contains(a)).toBe(false);
    expect(a.calls).toBe(1);
    expect(b.prerender).toHaveBeenCalledTimes(2);
    runner.destroy();
    expect(runner.items).toEqual([]);
  });
  it('solves only the latest unpainted army/camera state once before the actual render boundary', async () => {
    const r = await makeRenderer();
    const plates = vi.spyOn(plateLayout, 'layoutArmyPlates');
    const geography = vi.spyOn(geographyLayout, 'layoutGeographicLabels');
    const armies = [paintedArmy(), { ...paintedArmy(), id: 'army.second', edgeT: 0.55 }];
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      r.updateView(baseView({ armies }));
      r.getDiagnostics(); // Public observation settles the initial state.
      plates.mockClear();
      geography.mockClear();
      const latest = baseView({ armies: armies.map((a) => ({ ...a, edgeT: 0.6 })) });
      r.updateView(latest);
      r.setCameraPose({ x: 210, y: 100 }, 1.5);
      expect(plates).not.toHaveBeenCalled();
      expect(geography).not.toHaveBeenCalled();
      r.getApp()!.render();
      expect(plates).toHaveBeenCalledTimes(1);
      expect(geography).toHaveBeenCalledTimes(1);
      const observed = r.getDiagnostics();
      for (const plate of observed.armyPlateLayout.plates)
        expect(plate.fontSizeCss).toBeCloseTo(14);
      r.getApp()!.render();
      expect(plates).toHaveBeenCalledTimes(1);
      expect(geography).toHaveBeenCalledTimes(1);
    } finally {
      r.destroy();
      plates.mockRestore();
      geography.mockRestore();
    }
  });
  it('synchronously flushes public observations and preserves unchanged-day caching', async () => {
    const r = await makeRenderer();
    const solve = vi.spyOn(plateLayout, 'layoutArmyPlates');
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: [paintedArmy()] });
      r.updateView(view);
      r.getDiagnostics();
      solve.mockClear();
      r.updateView({ ...view, armies: [{ ...paintedArmy(), edgeT: 0.65 }] });
      expect(solve).not.toHaveBeenCalled();
      r.getArmyRenderObservation();
      expect(solve).toHaveBeenCalledTimes(1);
      r.getDiagnostics();
      expect(solve).toHaveBeenCalledTimes(1);
      r.setCameraPose({ x: 200, y: 100 }, 1.5);
      expect(solve).toHaveBeenCalledTimes(1);
      r.getLayers();
      expect(solve).toHaveBeenCalledTimes(2);
      r.updateView({ ...view, day: 2, armies: [{ ...paintedArmy(), edgeT: 0.65 }] });
      r.getApp()!.render();
      expect(solve).toHaveBeenCalledTimes(2);
    } finally {
      r.destroy();
      solve.mockRestore();
    }
  });
  it('discards pending old-map work and removes only its own renderer observer on teardown', async () => {
    const first = await makeRenderer();
    const second = await makeRenderer();
    const solve = vi.spyOn(plateLayout, 'layoutArmyPlates');
    try {
      first.setMapData(nameplateStaticData());
      first.updateView(baseView({ armies: [paintedArmy()] }));
      first.setMapData(null);
      first.getApp()!.render();
      expect(first.getDiagnostics().armyPlateLayout.plates).toEqual([]);
      second.setMapData(nameplateStaticData());
      second.setCameraPose({ x: 200, y: 100 }, 1.25);
      second.updateView(baseView({ armies: [paintedArmy()] }));
      second.getDiagnostics();
      const oldApp = first.getApp()!;
      first.updateView(baseView({ armies: [paintedArmy()] }));
      first.destroy();
      expect(oldApp.renderer.runners.prerender.items).toHaveLength(0);
      expect(first.getDiagnostics().resources.eventListeners).toBe(0);
      solve.mockClear();
      oldApp.renderer.runners.prerender.emit({ container: oldApp.stage });
      expect(solve).not.toHaveBeenCalled();
      second.updateView(baseView({ armies: [{ ...paintedArmy(), edgeT: 0.65 }] }));
      const afterPaint = vi.fn();
      second.getApp()!.renderer.runners.postrender.add({ postrender: afterPaint });
      second.getApp()!.render();
      expect(solve).toHaveBeenCalledTimes(1);
      expect(afterPaint).toHaveBeenCalledTimes(1);
      expect(second.getDiagnostics().armyPlateLayout.plates).toHaveLength(1);
    } finally {
      first.destroy();
      second.destroy();
      solve.mockRestore();
    }
  });
});

/** M6-V5：帶 terrain pack（relief/forest asset id＋一河一湖）的 staticData——正向存在斷言用。 */
function staticDataWithTerrain(overrides: Partial<MapStaticData> = {}): MapStaticData {
  return staticData({
    terrain: {
      reliefAssetId: 'texture.terrain.relief@1x',
      forestAssetId: 'texture.terrain.forest@1x',
      rivers: [
        {
          id: 'rv.test',
          points: [
            { x: 100, y: 100 },
            { x: 150, y: 150 },
          ],
          widthClass: 3,
        },
      ],
      lakes: [
        {
          id: 'lk.test',
          polygon: [
            { x: 200, y: 200 },
            { x: 250, y: 200 },
            { x: 225, y: 250 },
          ],
        },
      ],
    },
    ...overrides,
  });
}

function baseView(overrides: Partial<MapViewState> = {}): MapViewState {
  return {
    day: 1,
    districtOwner: { 'dist.x': 'clan.oda' },
    // M6-V9b §1.3：soldiers/relation/isPlayer 為 MapCastleView 必填 UI 推導欄（名牌簽章消費）。
    castles: [
      {
        id: 'castle.a',
        ownerClanId: 'clan.oda',
        durability: 1000,
        maxDurability: 1000,
        tier: 'main',
        terrainKind: 'plain',
        siegeMode: 'none',
        warning: 'none',
        soldiers: 2_000,
        relation: 'friendly',
        isPlayer: true,
      },
      {
        id: 'castle.b',
        ownerClanId: 'clan.imagawa',
        durability: 1000,
        maxDurability: 1000,
        tier: 'main',
        terrainKind: 'plain',
        siegeMode: 'none',
        warning: 'none',
        soldiers: 3_000,
        relation: 'enemy',
        isPlayer: false,
      },
    ],
    armies: [],
    battles: [],
    selection: null,
    analysisMode: 'none',
    ...overrides,
  } as unknown as MapViewState;
}

async function makeRenderer(): Promise<MapRenderer> {
  const r = new MapRenderer();
  await r.init(document.createElement('div'), vi.fn());
  return r;
}

function armyBodyGroup(chip: Container): Container {
  const body = chip.children.find((child) => child.label === 'armyBody');
  if (!body) throw new Error('Missing army body group');
  return body;
}

/** Logical paint content after the intentional ground-only masking partition.
 * The dedicated consumer tests above assert the physical wrapper/clip hierarchy. */
function terrainPaintChildren(renderer: MapRenderer): Container[] {
  return renderer
    .getLayers()!
    .terrainBase.children.flatMap((child) =>
      child.label === 'terrain-ground-surface' ? child.children[0]!.children[0]!.children : [child],
    );
}

function sharedElevatedSurface(renderer: MapRenderer) {
  const surface = (
    renderer as unknown as {
      elevatedSurface: ReturnType<typeof createTerrainElevatedSurface> | null;
    }
  ).elevatedSurface;
  if (!surface) throw new Error('Missing actual owned elevated terrain surface');
  expect(surface.mesh).toBeInstanceOf(Mesh);
  expect(surface.geometry).toBeInstanceOf(Geometry);
  expect(surface.mesh.geometry).toBe(surface.geometry);
  expect(surface.mesh.shader).toBe(surface.shader);
  expect(surface.geometry.getBuffer('aPosition').data).toBe(surface.buffers.vertices);
  expect(surface.geometry.getBuffer('aUV').data).toBe(surface.buffers.vertices);
  expect(surface.geometry.indexBuffer.data).toBe(surface.buffers.indices);
  // Four emitted vertices per cell preserve independent 256-world tile seams.
  expect(surface.buffers.vertices.length).toBe(128 * 128 * 4 * 6);
  expect(surface.buffers.indices.length).toBe(128 * 128 * 6);
  expect(surface.getDiagnostics()).toMatchObject({
    ownedMeshes: 1,
    ownedGeometries: 1,
    ownedBuffers: 2,
    ownedShaders: 1,
    ownedPrograms: 1,
    ownedTextures: 0,
    ownedSources: 0,
    ownedMasks: 0,
    ownedFilters: 0,
    bufferBytes: 1966080,
  });
  return surface;
}

/** A valid coast remains on a map without a terrain pack; no stale terrain is admitted. */
function expectBankOnlyGround(renderer: MapRenderer): void {
  const children = renderer.getLayers()!.terrainBase.children;
  expect(children).toHaveLength(1);
  expect(children[0]!.label).toBe('terrain-ground-surface');
  const content = children[0]!.children[0]!;
  expect(content.children).toHaveLength(2);
  expect(content.children[0]!.children).toHaveLength(0);
  expect(content.children[1]!.label).toBe('coast-bank-slope');
  expect(content.children[1]!.children).toHaveLength(1);
  expect(terrainPaintChildren(renderer)).toHaveLength(0);
}

describe('mountain material input-task yield and generation admission', () => {
  it('uses an immutable same-generation emitted Tenryu contact snapshot, not authored river chords', async () => {
    const shared = new Texture();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(shared);
    const factory = vi.spyOn(terrainRaster, 'createMountainRasterVariants');
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing terrain');
      data.terrain.mountainArtAssetId = 'test.peak';
      data.terrain.mountains = [
        {
          id: 'mt.kiso',
          tier: 1,
          mass: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
            { x: 100, y: 200 },
          ],
          ridges: [
            [
              { x: 120, y: 150 },
              { x: 180, y: 150 },
            ],
          ],
        },
      ];
      data.terrain.rivers = [
        {
          id: 'rv.tenryu',
          widthClass: 3,
          points: [
            { x: 120, y: 110 },
            { x: 150, y: 150 },
            { x: 180, y: 190 },
          ],
        },
        {
          id: 'rv.other',
          widthClass: 3,
          points: [
            { x: 110, y: 120 },
            { x: 190, y: 120 },
          ],
        },
      ];
      const original = JSON.stringify(data.terrain);
      renderer.setMapData(data);
      const water = Reflect.get(renderer, 'waterFeatures') as NonNullable<
        ReturnType<typeof import('./terrain/terrainDraw').createWaterFeatures>
      >;
      const emitted = water
        .getRiverMaterialDiagnostics()
        .rivers.find((river) => river.id === 'rv.tenryu')!;
      const expected = emitted.displaySegments.map((segment) => ({
        id: 'rv.tenryu',
        a: { ...segment.a },
        b: { ...segment.b },
        radius: segment.width / 2,
      }));
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(factory).toHaveBeenCalledTimes(1);
      const contacts = Reflect.get(factory.mock.calls[0]!, '4') as typeof expected;
      expect(contacts).toEqual(expected);
      expect(Object.isFrozen(contacts)).toBe(true);
      for (const contact of contacts) {
        expect(Object.isFrozen(contact)).toBe(true);
        expect(Object.isFrozen(contact.a)).toBe(true);
        expect(Object.isFrozen(contact.b)).toBe(true);
      }
      expect(contacts[0]!.a).not.toBe(emitted.displaySegments[0]!.a);
      expect(JSON.stringify(data.terrain)).toBe(original);
      renderer.updateView(baseView({ day: 2 }));
      expect(factory).toHaveBeenCalledTimes(1);
    } finally {
      renderer.destroy();
      factory.mockRestore();
      acquire.mockRestore();
    }
  });

  it.each(['current', 'swap', 'dispose'] as const)(
    'yields before mountain mask allocation and handles %s during the boundary',
    async (mode) => {
      const shared = new Texture();
      const sharedDestroy = vi.spyOn(shared, 'destroy');
      const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(shared);
      const renderer = await makeRenderer();
      const realSet = globalThis.setTimeout;
      const tasks: Array<() => void> = [];
      const timer = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback, delay, ...args) => {
          if (delay === 0 && typeof callback === 'function') {
            tasks.push(() => callback(...args));
            return 0 as unknown as ReturnType<typeof setTimeout>;
          }
          return realSet(callback, delay, ...args);
        });
      const order: string[] = [];
      const originalFactory = terrainRaster.createMountainRasterVariants;
      const factory = vi
        .spyOn(terrainRaster, 'createMountainRasterVariants')
        .mockImplementation((...args) => {
          order.push('mountain-masks');
          return originalFactory(...args);
        });
      try {
        const data = staticDataWithTerrain();
        if (!data.terrain) throw new Error('Missing terrain');
        data.terrain.mountainArtAssetId = 'test.peak';
        data.terrain.mountainMaterialAssetId = 'test.woodland';
        data.terrain.mountains = [
          {
            id: 'woodland',
            tier: 1,
            mass: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
              { x: 200, y: 200 },
              { x: 100, y: 200 },
            ],
            ridges: [
              [
                { x: 120, y: 150 },
                { x: 180, y: 150 },
              ],
            ],
          },
        ];
        setTimeout(() => order.push('already-ready-input'), 0);
        renderer.setMapData(data);
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(factory).not.toHaveBeenCalled();
        expect(tasks).toHaveLength(2);
        expect(Reflect.get(renderer, 'terrainTexturesPending')).toBe(true);
        tasks.shift()!();
        expect(order).toEqual(['already-ready-input']);
        const oldLayers = renderer.getLayers()!;
        if (mode === 'swap') renderer.setMapData(staticData());
        else if (mode === 'dispose') renderer.destroy();
        const allocated = hoisted.bufferSources.length;
        const attach = vi.spyOn(oldLayers.terrainBase, 'addChild');
        tasks.shift()!();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        if (mode === 'current') {
          expect(order).toEqual(['already-ready-input', 'mountain-masks']);
          expect(factory).toHaveBeenCalledTimes(1);
          expect(
            terrainPaintChildren(renderer).some(
              (child) => child.label === 'mountain-woodland-materials',
            ),
          ).toBe(true);
          expect(hoisted.bufferSources.length).toBeGreaterThan(allocated);
          expect(Reflect.get(renderer, 'terrainTexturesPending')).toBe(false);
        } else {
          expect(factory).not.toHaveBeenCalled();
          expect(hoisted.bufferSources).toHaveLength(allocated);
          expect(attach).not.toHaveBeenCalled();
          if (mode === 'swap') expectBankOnlyGround(renderer);
        }
        expect(sharedDestroy).not.toHaveBeenCalled();
      } finally {
        factory.mockRestore();
        timer.mockRestore();
        renderer.destroy();
        acquire.mockRestore();
      }
    },
  );
});

describe('DisplayCoast consumer integration, not native GPU clipping proof', () => {
  it('shares display geometry for sea and the owned elevated surface clip while preserving canonical interaction and projected territory', async () => {
    const data = staticDataWithTerrain();
    Object.assign(data.terrain!, {
      rivers: [],
      groundArtAssetId: 'test.ground',
      fieldMaterialAssetId: 'test.field',
      mountainArtAssetId: 'test.peak',
      mountainMaterialAssetId: 'test.woodland',
      forestArtAssetId: 'test.canopy',
      mountains: [
        {
          id: 'm',
          tier: 1,
          mass: [
            { x: 100, y: 100 },
            { x: 130, y: 100 },
            { x: 120, y: 130 },
          ],
          ridges: [],
        },
      ],
      forests: [
        {
          id: 'f',
          polygon: [
            { x: 200, y: 200 },
            { x: 230, y: 200 },
            { x: 220, y: 230 },
          ],
        },
      ],
    });
    const before = JSON.stringify(data.outline);
    const shared = new Map<string, Texture>();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockImplementation((id) => {
      if (!shared.has(id)) shared.set(id, new Texture());
      return Promise.resolve(shared.get(id)!);
    });
    const rawInteraction = vi.spyOn(MapInteraction.prototype, 'setStaticData');
    const polys = vi.spyOn(Graphics.prototype, 'poly');
    const r = await makeRenderer();
    try {
      r.setMapData(data);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const layers = r.getLayers()!;
      const surface = layers.terrainBase.children.find((c) => c.label === 'terrain-ground-surface');
      expect(surface).toBeDefined();
      if (!surface) throw new Error('Missing ground-only display clip');
      const content = surface.children[0]!;
      const paint = content.children[0]!;
      const clip = surface.children[1]!;
      expect(content.mask).toBe(clip);
      const elevated = sharedElevatedSurface(r);
      const foothill = (
        r as unknown as {
          foothillCanopy: {
            mesh: Mesh;
            geometry: Geometry;
            buffers: { vertices: Float32Array; indices: Uint32Array };
            getDiagnostics(): Record<string, number>;
          } | null;
        }
      ).foothillCanopy;
      expect(foothill).not.toBeNull();
      if (!foothill) throw new Error('Missing continuous borrowed-canopy owner');
      // This fixture admits no authored forest patch, but its elevated field still
      // owns continuous coverage independently of the authored forest count.
      expect(paint.children).toEqual([elevated.mesh, foothill.mesh]);
      expect(foothill.mesh).toBeInstanceOf(Mesh);
      expect(foothill.mesh.geometry).toBe(foothill.geometry);
      expect(foothill.mesh.texture).toBe(shared.get('test.canopy'));
      expect(foothill.geometry.getBuffer('aPosition').data).toBe(foothill.buffers.vertices);
      expect(foothill.geometry.getBuffer('aWorld').data).toBe(foothill.buffers.vertices);
      expect(foothill.geometry.getBuffer('aCanopy').data).toBe(foothill.buffers.vertices);
      expect(foothill.geometry.getBuffer('aLight').data).toBe(foothill.buffers.vertices);
      expect(foothill.geometry.attributes.aLight).toMatchObject({ stride: 24, offset: 20 });
      expect(foothill.geometry.indexBuffer.data).toBe(foothill.buffers.indices);
      expect(foothill.buffers.vertices).toHaveLength(129 * 129 * 6);
      expect(foothill.buffers.indices).toHaveLength(128 * 128 * 6);
      expect(foothill.getDiagnostics()).toMatchObject({
        ownedMeshes: 1,
        ownedGeometries: 1,
        ownedBuffers: 2,
        ownedShaders: 1,
        ownedPrograms: 1,
        ownedTextures: 0,
        ownedSources: 0,
        ownedMasks: 0,
        ownedFilters: 0,
        ownedFramebuffers: 0,
        bufferBytes: 792600,
      });
      expect(elevated.mesh.texture).toBe(shared.get('test.ground'));
      expect(elevated.mesh.mask ?? null).toBeNull();
      const rasters = r as unknown as {
        mountainRaster: unknown;
        forestRaster: unknown;
        fieldMaterial: unknown;
      };
      expect(rasters.mountainRaster).toBeNull();
      expect(rasters.forestRaster).toBeNull();
      expect(rasters.fieldMaterial).toBeNull();
      expect(r.getDiagnostics().elevationRendering.territory).toMatchObject({
        ownedMeshes: 1,
        ownedGeometries: 1,
        ownedBuffers: 3,
        ownedTextures: 0,
      });
      const display = buildDisplayCoast(data.outline!, data.graph, data.terrain!.rivers);
      expect(display.polygons[0]!.points).not.toEqual(data.outline!.polygons[0]!.points);
      for (const target of [layers.seaBackground.children.at(-1), clip]) {
        const calls = polys.mock.calls.filter((_, i) => polys.mock.contexts[i] === target);
        expect(
          calls.some(
            (args) => JSON.stringify(args[0]) === JSON.stringify(display.polygons[0]!.points),
          ),
        ).toBe(true);
      }
      expect(rawInteraction).toHaveBeenLastCalledWith(data);
      const identity = [...layers.terrainBase.children];
      r.updateView(baseView({ day: 2 }));
      expect(layers.terrainBase.children).toEqual(identity);
      expect(JSON.stringify(data.outline)).toBe(before);
      const destroy = vi.spyOn(surface, 'destroy');
      const destroyGeometry = vi.spyOn(elevated.geometry, 'destroy');
      const destroyFoothillGeometry = vi.spyOn(foothill.geometry, 'destroy');
      r.setMapData(null);
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroyGeometry).toHaveBeenCalledTimes(1);
      expect(destroyGeometry).toHaveBeenCalledWith(false);
      expect(destroyFoothillGeometry).toHaveBeenCalledTimes(1);
      expect(destroyFoothillGeometry).toHaveBeenCalledWith(false);
      expect(foothill.getDiagnostics()).toMatchObject({
        ownedMeshes: 0,
        ownedBuffers: 0,
        bufferBytes: 0,
      });
      expect(elevated.getDiagnostics()).toMatchObject({
        ownedMeshes: 0,
        ownedBuffers: 0,
        bufferBytes: 0,
      });
      expect(layers.terrainBase.children).toHaveLength(0);
      expect([...shared.values()].every((t) => !t.destroyed)).toBe(true);
    } finally {
      r.destroy();
      acquire.mockRestore();
      rawInteraction.mockRestore();
      polys.mockRestore();
    }
  });

  it('territory uses the same display coast, changing only a narrow coast band, not canonical geography', async () => {
    const data = staticData();
    const before = JSON.stringify(data.outline);
    const raw = buildTerritoryGrid(data.graph, data.outline!);
    const display = buildDisplayCoast(data.outline!, data.graph);
    const expected = buildTerritoryGrid(data.graph, display);
    const r = await makeRenderer();
    try {
      r.setMapData(data);
      const actual = (r as unknown as { territoryGrid: TerritoryGrid }).territoryGrid;
      let differences = 0,
        wrong = 0,
        outsideBand = 0;
      const size = raw.size,
        cell = 4096 / size;
      for (let i = 0; i < raw.nearestDistrict.length; i++) {
        if (actual.nearestDistrict[i] !== expected.nearestDistrict[i]) wrong++;
        if (actual.nearestDistrict[i] === raw.nearestDistrict[i]) continue;
        differences++;
        const x = ((i % size) + 0.5) * cell,
          y = (Math.floor(i / size) + 0.5) * cell;
        // Independent distance to the four original fixture rectangle sides.
        const boundaryDistance = Math.min(
          Math.abs(x - 50),
          Math.abs(x - 350),
          Math.abs(y - 50),
          Math.abs(y - 350),
        );
        if (boundaryDistance > 8) outsideBand++;
      }
      expect(differences).toBeGreaterThan(0);
      expect(wrong).toBe(0);
      expect(outsideBand).toBe(0);
      expect(JSON.stringify(data.outline)).toBe(before);
    } finally {
      r.destroy();
    }
  });
});

it('shared Pixi harness inserts variadic children and reparents indexed children without duplicates', () => {
  const a = new Container();
  const b = new Container();
  const first = new Container();
  const second = new Container();
  expect(a.addChild(first, second)).toBe(first);
  expect(a.children).toEqual([first, second]);
  expect(first.parent).toBe(a);
  expect(second.parent).toBe(a);
  expect(b.addChildAt(second, 0)).toBe(second);
  expect(a.children).toEqual([first]);
  expect(b.children).toEqual([second]);
  expect(second.parent).toBe(b);
  b.addChildAt(first, 0);
  expect(a.children).toEqual([]);
  expect(b.children).toEqual([first, second]);
  b.addChildAt(second, 0);
  expect(b.children).toEqual([second, first]);
  expect(() => b.addChildAt(new Container(), 3)).toThrow();
});

describe('live combat effects (synthetic map views, not gameplay outcome fixtures)', () => {
  function tick(r: MapRenderer, deltaMS: number): void {
    const ticker = r.getApp()!.ticker as unknown as { deltaMS: number; tick(): void };
    ticker.deltaMS = deltaMS;
    ticker.tick();
  }
  it('mounts field icons at nodes/edge midpoints and emits bounded live particles without mutating the view', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const view = baseView({
      battles: [
        { kind: 'field', nodeOrEdgeId: 'castle.a' },
        { kind: 'field', nodeOrEdgeId: 'road.x-b' },
        { kind: 'field', nodeOrEdgeId: 'missing' },
      ],
    });
    const before = JSON.stringify(view);
    r.updateView(view);
    expect(r.getDiagnostics().effects).toEqual({
      fieldContacts: 2,
      assaultEmitters: 0,
      activeParticles: 16,
      particleCapacity: 128,
      motionBlocked: false,
    });
    const icons = r.getLayers()!.effects.children.filter((c) => c.label === 'battleSpark');
    const disposals = icons.map((icon) => vi.spyOn(icon, 'destroy'));
    expect(icons.map((c) => [c.position.x, c.position.y])).toEqual([
      [100, 100],
      [250, 100],
    ]);
    tick(r, 400);
    expect(r.getDiagnostics().effects.activeParticles).toBe(0);
    tick(r, 499);
    expect(r.getDiagnostics().effects.activeParticles).toBe(0);
    tick(r, 1);
    expect(r.getDiagnostics().effects.activeParticles).toBe(16);
    expect(JSON.stringify(view)).toBe(before);
    r.updateView(baseView());
    expect(r.getDiagnostics().effects.activeParticles).toBe(0);
    expect(disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(icons.every((c) => c.parent === null)).toBe(true);
    r.destroy();
  });
  it.each([true, false])(
    'clears active particles immediately on %s OS-reduce/settings-disable and resumes without backlog',
    async (osReduce) => {
      const r = await makeRenderer();
      r.setMapData(staticData());
      r.updateView(
        baseView({
          battles: [{ kind: 'field', nodeOrEdgeId: 'castle.a' }],
          sieges: [
            { id: 'siege.assault', pos: { x: 300, y: 100 }, mode: 'assault' },
            { id: 'siege.encircle', pos: { x: 200, y: 100 }, mode: 'encircle' },
          ],
        }),
      );
      expect(r.getDiagnostics().effects).toMatchObject({
        fieldContacts: 1,
        assaultEmitters: 1,
        activeParticles: 16,
      });
      r.setPresentationSettings({
        mapLabelDensity: 'medium',
        effectsEnabled: osReduce,
        reducedMotion: osReduce,
      });
      expect(r.getDiagnostics().effects).toMatchObject({ motionBlocked: true, activeParticles: 0 });
      const icons = r.getLayers()!.effects.children.filter((c) => c.label === 'battleSpark');
      expect(icons).toHaveLength(2);
      expect(icons[0]!.children[0]!.visible).toBe(true);
      expect(icons[1]!.children[0]!.visible).toBe(false);
      tick(r, 60_000);
      expect(r.getDiagnostics().effects.activeParticles).toBe(0);
      r.setPresentationSettings({
        mapLabelDensity: 'medium',
        effectsEnabled: true,
        reducedMotion: false,
      });
      expect(r.getDiagnostics().effects.activeParticles).toBe(16);
      tick(r, 900);
      expect(r.getDiagnostics().effects.activeParticles).toBe(8);
      tick(r, 300);
      expect(r.getDiagnostics().effects.activeParticles).toBe(16);
      r.destroy();
    },
  );
  it('caps combined contacts at 128 and owns cleanup across map replacement/destroy/remount', async () => {
    const r = await makeRenderer();
    const graph = fixtureGraph();
    const nodes = new Map(graph.nodes);
    for (let i = 0; i < 20; i++)
      nodes.set(`test.${i}` as never, {
        ...graph.nodes.get('castle.a' as never)!,
        id: `test.${i}` as never,
      });
    const data = staticData({ graph: { ...graph, nodes } });
    r.setMapData(data);
    r.updateView(
      baseView({
        battles: Array.from({ length: 20 }, (_, i) => ({
          kind: 'field',
          nodeOrEdgeId: `test.${i}`,
        })),
      }),
    );
    expect(r.getDiagnostics().effects.activeParticles).toBe(128);
    const owned = [...r.getLayers()!.effects.children];
    const disposals = owned.map((part) => vi.spyOn(part, 'destroy'));
    r.setMapData(null);
    expect(r.getDiagnostics().effects).toMatchObject({
      fieldContacts: 0,
      particleCapacity: 0,
      activeParticles: 0,
    });
    expect(disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(owned.every((c) => c.parent === null)).toBe(true);
    const ticker = r.getApp()!.ticker as unknown as { callbacks: unknown[] };
    r.destroy();
    expect(ticker.callbacks).toHaveLength(0);
    const remount = await makeRenderer();
    remount.setMapData(staticData());
    remount.updateView(baseView());
    expect(remount.getDiagnostics().effects.activeParticles).toBe(0);
    remount.destroy();
  });
});

beforeEach(() => {
  hoisted.apps.length = 0;
  hoisted.bufferSources.length = 0;
  hoisted.textures.length = 0;
});

describe('M6-V10 analysis overlay', () => {
  it('shared Assets mock preserves alias identity until loader-owned unload', async () => {
    const first = await Assets.load<Texture>('test.castle.shared-alias');
    expect(await Assets.load('test.castle.shared-alias')).toBe(first);
    expect(Assets.get('test.castle.shared-alias')).toBe(first);
    await Assets.unload('test.castle.shared-alias');
    expect(first.destroyed).toBe(true);
    expect(Assets.get('test.castle.shared-alias')).toBeUndefined();
    const next = await Assets.load<Texture>('test.castle.shared-alias');
    expect(next).not.toBe(first);
    await Assets.unload('test.castle.shared-alias');
  });
  function analysisArmy(
    overrides: Partial<MapViewState['armies'][number]> = {},
  ): MapViewState['armies'][number] {
    return {
      id: 'army.1',
      clanId: 'clan.oda',
      soldiers: 1000,
      status: 'holding',
      morale: 80,
      foodDays: 20,
      mission: 'march',
      fromNode: 'castle.a' as CastleId,
      toNode: null,
      edgeT: 0,
      corps: false,
      selected: false,
      relation: 'friendly',
      ...overrides,
    };
  }
  it('switches mutually exclusive themes, clamps opacity and leaves input view unchanged', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const view = baseView();
    const original = JSON.stringify(view);
    for (const mode of [
      'roadCapacity',
      'supply',
      'terrainAdvantage',
      'castleDefense',
      'faction',
      'none',
    ] as const) {
      r.update(view, { analysisMode: mode, analysisOpacity: 2 });
      const diagnostics = r.getDiagnostics();
      expect(diagnostics.analysisMode).toBe(mode);
      expect(diagnostics.analysisOpacity).toBe(1);
      expect(r.getLayers()!.analysisOverlay.children.length).toBe(1);
      expect(r.getLayers()!.analysisOverlay.children[0]!.visible).toBe(mode !== 'none');
      expect(r.getLayers()!.roads.visible).toBe(mode !== 'faction');
    }
    expect(JSON.stringify(view)).toBe(original);
    r.destroy();
    expect(r.getDiagnostics().resources).toMatchObject({ ownedTextures: 0, eventListeners: 0 });
  });

  it('opacity/day changes do not redraw; relevant defense updates redraw only analysis content', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const view = baseView();
    r.update(view, { analysisMode: 'castleDefense' });
    const count = r.getDiagnostics().layers.analysisOverlay!.rebuildCount;
    r.update({ ...view, day: 2 }, { analysisMode: 'castleDefense', analysisOpacity: 0.2 });
    expect(r.getDiagnostics().layers.analysisOverlay!.rebuildCount).toBe(count);
    r.update(
      { ...view, castles: view.castles.map((c) => ({ ...c, durability: 100 })) },
      { analysisMode: 'castleDefense' },
    );
    expect(r.getDiagnostics().layers.analysisOverlay!.rebuildCount).toBe(count + 1);
    r.destroy();
  });

  it('faction annotations follow castle ownership and healthy army movement without recoloring raster', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ names: { 'clan.oda': '織田家', 'clan.imagawa': '今川家' } }));
    const view = baseView({
      armies: [analysisArmy({ status: 'marching', toNode: 'dist.x' as DistrictId })],
    });
    r.update(view, { analysisMode: 'faction' });
    const annotations = r
      .getLayers()!
      .labels.children.find((c) => c.label === 'factionAnnotations')!;
    expect(annotations.children.length).toBe(3);
    const labelBeforeMove = annotations.children[0];
    const dotBeforeMove = annotations.children[2];
    const source = hoisted.bufferSources[1]!;
    const before = source.updateCalls;
    r.update(
      { ...view, armies: view.armies.map((a) => ({ ...a, edgeT: 0.5 })) },
      { analysisMode: 'faction' },
    );
    expect(annotations.children[2]!.position.x).toBe(150);
    expect(annotations.children[0]).toBe(labelBeforeMove);
    expect(annotations.children[2]).toBe(dotBeforeMove);
    expect(source.updateCalls).toBe(before);
    const dotClear = vi.spyOn(dotBeforeMove as unknown as { clear: () => unknown }, 'clear');
    r.update(
      { ...view, armies: view.armies.map((a) => ({ ...a, relation: 'enemy' as const })) },
      { analysisMode: 'faction' },
    );
    expect(annotations.children[2]).toBe(dotBeforeMove);
    expect(dotClear).toHaveBeenCalledOnce();
    r.update(
      {
        ...view,
        castles: view.castles.map((c) => ({ ...c, ownerClanId: view.castles[0]!.ownerClanId })),
      },
      { analysisMode: 'faction' },
    );
    expect(annotations.children.length).toBe(2);
    r.destroy();
    expect(hoisted.bufferSources.every((s) => s.destroyed)).toBe(true);
    // Shared lazy castle textures unload through the asynchronous Assets owner.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(hoisted.textures.every((t) => t.destroyed)).toBe(true);
  });

  it('reuses halo TextStyle identity across faction redraws and renderer remounts', async () => {
    const data = staticData({ names: { 'clan.oda': '織田家', 'clan.imagawa': '今川家' } });
    const r = await makeRenderer();
    r.setMapData(data);
    r.update(baseView(), { analysisMode: 'faction' });
    const styles = () =>
      r
        .getLayers()!
        .labels.children.find((c) => c.label === 'factionAnnotations')!
        .children.filter((c) => 'text' in c)
        .map((c) => (c as unknown as { style: unknown }).style);
    const before = styles();
    const detach = vi.spyOn(before[0] as { off: () => unknown }, 'off');
    r.setMapData(data);
    r.update(baseView(), { analysisMode: 'faction' });
    expect(styles()[0]).toBe(before[0]);
    expect(detach).toHaveBeenCalledOnce();
    r.destroy();
    expect(detach).toHaveBeenCalledTimes(2);
    const remount = await makeRenderer();
    remount.setMapData(data);
    remount.update(baseView(), { analysisMode: 'faction' });
    const label = remount
      .getLayers()!
      .labels.children.find((c) => c.label === 'factionAnnotations')!.children[0]!;
    expect((label as unknown as { style: unknown }).style).toBe(before[0]);
    remount.destroy();
    expect(detach).toHaveBeenCalledTimes(3);
  });

  it('uses model road grades, castle terrain, durability and supply facts', () => {
    const data = staticData();
    const view = baseView({ armies: [analysisArmy({ foodDays: 2 })] });
    const road = buildAnalysisMarks(data, view, 'roadCapacity')[0]!;
    expect(road).toMatchObject({
      color: ANALYSIS_COLORS.critical,
      width: 7,
      points: [100, 100, 200, 100],
    });
    expect(buildAnalysisMarks(data, view, 'supply')[0]).toMatchObject({
      color: ANALYSIS_COLORS.critical,
      double: true,
    });
    expect(buildAnalysisMarks(data, view, 'terrainAdvantage')).toHaveLength(2);
    expect(buildAnalysisMarks(data, view, 'castleDefense')[0]).toMatchObject({
      color: ANALYSIS_COLORS.healthy,
      double: true,
    });
    expect(analysisSignature(view, 'roadCapacity')).toBe(
      analysisSignature({ ...view, day: 5, armies: [] }, 'roadCapacity'),
    );
  });

  it('clips faction raster to land and distinguishes district/faction borders', () => {
    const grid = {
      size: 2,
      districtIds: ['dist.a', 'dist.b'],
      nearestDistrict: new Uint16Array([0, 1, 0xffff, 0xffff]),
    } as TerritoryGrid;
    const data = staticData();
    const same = buildFactionPixels(
      grid,
      data,
      baseView({ districtOwner: { 'dist.a': 'clan.oda', 'dist.b': 'clan.oda' } }),
    );
    const different = buildFactionPixels(
      grid,
      data,
      baseView({ districtOwner: { 'dist.a': 'clan.oda', 'dist.b': 'clan.imagawa' } }),
    );
    expect([...same.slice(8)]).toEqual(Array(8).fill(0));
    expect(same[3]).toBe(255);
    expect([...same.slice(0, 3)]).not.toEqual([...different.slice(0, 3)]);
  });
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD①：無變更 tick 不重建）', () => {
  it('long province labels reserve their text bounds across adjacent screen cells', async () => {
    const r = await makeRenderer();
    r.setMapData(
      staticData({
        names: { 'prov.a': '甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸', 'prov.b': '第二個地理標籤' },
        provinceLabelPos: { 'prov.a': { x: 0, y: 100 }, 'prov.b': { x: 300, y: 100 } },
      }),
    );
    r.updateView(baseView());
    const labels = r.getLayers()!.labels.children;
    // Controlled text-height model; horizontal width comes from the shared BitmapText mock.
    for (const label of labels) Object.defineProperty(label.children[0]!, 'height', { value: 18 });
    r.setCameraPose({ x: 200, y: 100 }, 0.25);
    expect(labels[0]!.visible).toBe(true);
    expect(labels[1]!.visible).toBe(false);
    r.destroy();
  });

  it('wires static dimensional terrain above baked ground and destroys it on map replacement', async () => {
    const r = await makeRenderer();
    const data = staticDataWithTerrain();
    r.setMapData({
      ...data,
      terrain: {
        ...data.terrain!,
        mountains: [
          {
            id: 'ridge',
            tier: 2,
            mass: [
              { x: 100, y: 100 },
              { x: 120, y: 100 },
              { x: 120, y: 120 },
            ],
            ridges: [
              [
                { x: 105, y: 105 },
                { x: 115, y: 115 },
              ],
            ],
          },
        ],
      },
    });
    r.updateView(baseView());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const children = terrainPaintChildren(r);
    expect(children).toHaveLength(3);
    expect(children[0]).toMatchObject({
      alpha: TERRAIN_RELIEF.bakedReliefAlpha,
      tint: TERRAIN_RELIEF.groundTint,
    });
    const relief = children[2]!;
    expect(relief.label).toBe('atlas-relief-2.5d');
    expect(relief.children).toHaveLength(1);
    const destroy = vi.spyOn(relief, 'destroy');
    r.setMapData(staticData());
    expect(destroy).toHaveBeenCalledWith({ children: true });
    expectBankOnlyGround(r);
    r.destroy();
  });

  it('setMapData 後首次 updateView 全 node 首繪；僅 day 不同的後續 updateView 計數零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    expect(baseline.roads).toBe(1);
    expect(baseline.nodeMarkers).toBe(3); // castle.a／castle.b／dist.x 首繪皆 dirty
    expect(baseline.territory).toBe(1);
    expect(baseline.labels).toBe(0); // 本 fixture 未提供 names
    expect(baseline.nameplates).toBe(0); // M6-V9b：無 names → 無名牌

    r.updateView(baseView({ day: 2 })); // 僅 day 不同，owner/army 全同
    expect(r.getRebuildCounts()).toEqual(baseline);

    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));
    expect(r.getRebuildCounts()).toEqual(baseline); // 連續呼叫亦零增量

    r.destroy();
  });

  it('labels/nameplates 計數只在 buildStaticDataLayers（setMapData）期間增加，updateView 不增（補遺 AD-V4-5／M6-V9b §2.9）', async () => {
    const r = await makeRenderer();
    r.setMapData(
      staticData({
        names: { 'castle.a': '甲城', 'castle.b': '乙城', 'dist.x': '丙郡', 'prov.p': '丁國' },
        provinceLabelPos: { 'prov.p': { x: 250, y: 50 } },
      }),
    );
    const afterSetMapData = r.getRebuildCounts();
    // M6-V9b（§2.9）：城名移出 labelParts → labels 只剩 1 郡 label＋1 省 label；
    // 2 城名改建名牌（nameplates 計數，與 labels 分離）。
    expect(afterSetMapData.labels).toBe(2);
    expect(afterSetMapData.nameplates).toBe(2); // castle.a／castle.b
    r.updateView(baseView());
    r.updateView(baseView({ day: 2 }));
    expect(r.getRebuildCounts().labels).toBe(afterSetMapData.labels);
    expect(r.getRebuildCounts().nameplates).toBe(afterSetMapData.nameplates); // 冪等 update 不計數
    r.destroy();
  });

  it('setMapData 首繪保證（§11.1）：重新 setMapData 後 prevOwnerByNode 重設，下次 updateView 全 dirty', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.setMapData(staticData()); // 模擬換局／reload：graph 換了但 owner 未變
    r.updateView(baseView()); // 與前一次 view 完全相同
    const after = r.getRebuildCounts();
    expect(after.nodeMarkers).toBe(baseline.nodeMarkers + 3); // 全 3 node 視為 dirty 重繪一次
    expect(after.territory).toBe(baseline.territory + 1);

    r.destroy();
  });
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD②：owner 變更只更新受影響 node/territory）', () => {
  it('翻轉一個城的 owner → 恰該 node nodeMarkers/territory +1，其餘 node 不重畫（body Graphics.clear spy，#M1）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    // M6-V7（#M1）：nodeMarkers.children 為 castleNode/districtNode Container（無 clear）；改對其
    // children[0]（castle＝bodyGfx／district＝gfx，皆 Graphics）spy clear。依 id 字典序建立：
    // castle.a(0) < castle.b(1) < dist.x(2)。
    const containers = r.getLayers()!.nodeMarkers.children.slice(1) as unknown as MockGfx[];
    const bodySpies = containers.map((c, index) =>
      vi.spyOn(
        index < 2
          ? (r
              .getLayers()!
              .actorBodies.children.find(
                (body) => body.label === `castle:castle.${index === 0 ? 'a' : 'b'}`,
              )!.children[0]! as unknown as MockGfx)
          : c.children[0]!,
        'clear',
      ),
    );

    const view2 = baseView({
      castles: baseView().castles.map((c) =>
        c.id === 'castle.b' ? { ...c, ownerClanId: 'clan.oda' as never } : c,
      ),
    });
    r.updateView(view2);

    const after = r.getRebuildCounts();
    expect(after.nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(after.territory).toBe(baseline.territory + 1);
    expect(after.roads).toBe(baseline.roads);
    expect(after.labels).toBe(baseline.labels);
    expect(after.armyChips).toBe(baseline.armyChips);

    expect(bodySpies[0]).not.toHaveBeenCalled(); // castle.a 未變，body 不重畫
    expect(bodySpies[1]).toHaveBeenCalledTimes(1); // castle.b 變了，body 恰重畫一次
    expect(bodySpies[2]).not.toHaveBeenCalled(); // dist.x 未變，不重畫

    r.destroy();
  });

  it('district owner 無主化（有主→null）亦視為變更；owner 不變時零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.updateView(baseView({ districtOwner: { 'dist.x': null } }));
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);

    const afterFirstFlip = r.getRebuildCounts();
    r.updateView(baseView({ districtOwner: { 'dist.x': null } })); // 再次相同 → 零增量
    expect(r.getRebuildCounts()).toEqual(afterFirstFlip);

    r.destroy();
  });
});

// ── M6-V7：城池/郡 元件整合、節點簽章 dirty、選取環、聚落（設計 §8.2） ──────────────────

/** 帶 warning／city 狀態欄之 castles（castle.a 本城平城、castle.b 本城；可覆寫 warning/durability/terrainKind）。 */
function castlesWith(
  a: Partial<{
    warning: string;
    durability: number;
    maxDurability: number;
    terrainKind: string;
    ownerClanId: string;
    soldiers: number;
  }> = {},
  b: Partial<{
    warning: string;
    durability: number;
    maxDurability: number;
    terrainKind: string;
    ownerClanId: string;
    soldiers: number;
  }> = {},
): MapViewState['castles'] {
  return [
    {
      id: 'castle.a',
      ownerClanId: a.ownerClanId ?? 'clan.oda',
      durability: a.durability ?? 1000,
      maxDurability: a.maxDurability ?? 1000,
      tier: 'main',
      terrainKind: a.terrainKind ?? 'plain',
      siegeMode: 'none',
      warning: a.warning ?? 'none',
      soldiers: a.soldiers ?? 2_000,
      relation: 'friendly',
      isPlayer: true,
    },
    {
      id: 'castle.b',
      ownerClanId: b.ownerClanId ?? 'clan.imagawa',
      durability: b.durability ?? 1000,
      maxDurability: b.maxDurability ?? 1000,
      tier: 'main',
      terrainKind: b.terrainKind ?? 'plain',
      siegeMode: 'none',
      warning: b.warning ?? 'none',
      soldiers: b.soldiers ?? 3_000,
      relation: 'enemy',
      isPlayer: false,
    },
  ] as unknown as MapViewState['castles'];
}

/** 節點 Container（castle＝[bodyGfx,ringGfx,warnGfx]／district＝[gfx]）之最小形狀。 */
interface NodeContainer {
  label: string;
  visible: boolean;
  children: { visible: boolean; scale: { x: number } }[];
}

describe('城池/郡 元件（M6-V7 §8.2）：不再呼叫占位 marker、簽章 dirty、正向存在', () => {
  it('DoD：mapDraw 不再匯出 drawNodeMarker；nodeMarkers children 為 castleNode/districtNode container', async () => {
    const mod = (await import('./mapDraw')) as Record<string, unknown>;
    expect(mod.drawNodeMarker).toBeUndefined();
    expect(mod.drawNodeMarkers).toBeUndefined();

    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const containers = r.getLayers()!.nodeMarkers.children.slice(1) as unknown as NodeContainer[];
    const labels = containers.map((c) => c.label).sort();
    expect(labels).toEqual(['castleNode', 'castleNode', 'districtNode']); // castle.a/castle.b/dist.x
    r.destroy();
  });

  it('首繪＋正向存在：3 節點各一 container、nodeMarkers 計數===3、critical/threatened 城 warnGfx 顯示', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({ castles: castlesWith({ warning: 'critical' }, { warning: 'threatened' }) }),
    );

    expect(r.getLayers()!.nodeMarkers.children.length).toBe(4);
    expect(r.getRebuildCounts().nodeMarkers).toBe(3); // 首繪：全 3 node 簽章 dirty 各計數一次

    // Original warning Graphics remain mounted independently of model culling.
    expect(r.getLayers()!.effects.children[0]!.children[1]!.visible).toBe(true);
    expect(r.getLayers()!.effects.children[1]!.children[1]!.visible).toBe(true);
    r.destroy();
  });

  it('耐久/警戒/城型 dirty：翻 durability→+1、翻 warning→+1、翻 terrainKind→+1；castle-only 變動不動 territory', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    let baseline = r.getRebuildCounts();

    r.updateView(baseView({ castles: castlesWith({ durability: 500 }) })); // castle.a 耐久變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(r.getRebuildCounts().territory).toBe(baseline.territory); // owner 未變 → territory 不動

    baseline = r.getRebuildCounts();
    r.updateView(baseView({ castles: castlesWith({ durability: 500, warning: 'critical' }) })); // warning 變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);

    baseline = r.getRebuildCounts();
    r.updateView(
      baseView({
        castles: castlesWith({ durability: 500, warning: 'critical', terrainKind: 'mountain' }),
      }),
    ); // terrainKind 變
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1);
    expect(r.getRebuildCounts().territory).toBe(baseline.territory);
    r.destroy();
  });

  it('re-setMapData +3（B3 守門）：重新 setMapData(same)＋同 updateView → nodeMarkers === baseline + 節點數', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.setMapData(staticData()); // prevNodeSig 重設為 null
    r.updateView(baseView()); // 與前一次 view 完全相同（元件 update 冪等短路，但計數由簽章 diff 保證）
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 3);
    r.destroy();
  });

  it('day-only 零增量：僅 day 變連跑 30 日 → nodeMarkers/territory/labels/roads 零增量', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));
    expect(r.getRebuildCounts()).toEqual(baseline);
    r.destroy();
  });

  it('聚落正向存在＋LOD：settlements.container 非空；far→visible false、near→true', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ castleTier: { 'castle.a': 'main', 'castle.b': 'main' } }));
    r.updateView(baseView());

    const settlements = r.getLayers()!.settlements;
    expect(settlements.children.length).toBe(1); // 單一 container（屋頂/田畦繪於其內 Graphics；繪製正確性見 settlementsDraw.spec）

    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far
    expect(settlements.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near
    expect(settlements.visible).toBe(true);
    r.destroy();
  });

  it('選取環 dirty（與 V6 協調）：node 選取→雙環顯＋roadHighlight 更新；day-only→不重更；army→隱；rebuildCounts 全程不動；z-order 中層', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 })); // selection null
    const baseline = r.getRebuildCounts();

    const selPath = r.getLayers()!.selectionAndPath.children as unknown as MockGfx[];
    expect(selPath.length).toBe(2); // [roadHighlight, pathPreview]
    const ringContainer = r.getLayers()!.nodeMarkers.children[0]!.children[0]!;
    expect(ringContainer.label).toBe('selectionRing'); // z-order 中層（壓道路高亮上、march 預覽下）
    const highlightGfx = selPath[0]!.children[0]!;
    const strokeSpy = vi.spyOn(highlightGfx, 'stroke');
    expect(ringContainer.visible).toBe(false); // 初始未選

    r.updateView(baseView({ day: 2, selection: { kind: 'node', id: 'castle.a' } }));
    expect(ringContainer.visible).toBe(true); // 節點選取 → 金色雙環顯
    expect(strokeSpy).toHaveBeenCalled(); // V6 相鄰道路高亮亦更新
    expect(r.getRebuildCounts()).toEqual(baseline); // 選取環/高亮不動計數

    strokeSpy.mockClear();
    r.updateView(baseView({ day: 3, selection: { kind: 'node', id: 'castle.a' } })); // day-only
    expect(strokeSpy).not.toHaveBeenCalled(); // selKey 未變 → 不重更
    expect(ringContainer.visible).toBe(true);

    r.updateView(baseView({ day: 4, selection: { kind: 'army', id: 'army.z' } })); // 選軍隊
    expect(ringContainer.visible).toBe(false); // selKey=null → 節點環隱（軍隊環屬 V8）

    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位全程不動

    // M6-V7 review：graph swap 當下即隱選取環（鏡像 roadHighlight）——否則新選取為 null 時
    // updateView 的 selKey diff 為 null===null 不觸發 updateSelectionRing，舊環殘留於舊座標。
    r.updateView(baseView({ day: 5, selection: { kind: 'node', id: 'castle.a' } }));
    expect(ringContainer.visible).toBe(true); // 先重新選取 → 環顯
    r.setMapData(staticData()); // graph swap
    expect(ringContainer.visible).toBe(false); // swap 當下即隱，不得依賴 selKey diff
    r.updateView(baseView({ day: 6, selection: null })); // selKey=null===prevSelectionKey(null)
    expect(ringContainer.visible).toBe(false); // 仍隱（無殘留）

    // updateSelectionRing 的 node===undefined 防線：選取不存在於當前圖之 id → 環隱。
    r.updateView(baseView({ day: 7, selection: { kind: 'node', id: 'castle.absent' } }));
    expect(ringContainer.visible).toBe(false);

    r.destroy();
  });

  it('StrictMode/destroy：init→setMapData→destroy→重掛，nodeParts/選取環/聚落對稱建立/銷毀，無殘留', async () => {
    const r1 = await makeRenderer();
    r1.setMapData(staticData());
    r1.updateView(baseView());
    expect(r1.getLayers()!.nodeMarkers.children.length).toBe(4);
    expect(r1.getLayers()!.settlements.children.length).toBe(1);
    r1.destroy();
    expect(r1.getLayers()).toBeNull(); // 圖層清空、無殘留參考

    const r2 = await makeRenderer();
    r2.setMapData(staticData());
    r2.updateView(baseView());
    expect(r2.getLayers()!.nodeMarkers.children.length).toBe(4);
    expect(r2.getLayers()!.selectionAndPath.children.length).toBe(2);
    r2.destroy();
  });
});

describe('MapRenderer dirty-update（M6-V4 §7 DoD③：移動只更新相關 ArmyChip）', () => {
  function marchingArmies(edgeTA: number, soldiersB: number): MapViewState['armies'] {
    return [
      {
        id: 'army.a',
        clanId: 'clan.oda',
        soldiers: 1_000,
        status: 'marching',
        morale: 80,
        foodDays: 10,
        mission: 'march',
        fromNode: 'castle.a',
        toNode: 'dist.x',
        edgeT: edgeTA,
        corps: false,
        selected: false,
      },
      {
        id: 'army.b',
        clanId: 'clan.imagawa',
        soldiers: soldiersB,
        status: 'holding',
        morale: 70,
        foodDays: 5,
        mission: 'march',
        fromNode: 'castle.b',
        toNode: null,
        edgeT: 0,
        corps: false,
        selected: false,
      },
    ] as unknown as MapViewState['armies'];
  }

  it.each([false, true])(
    'motionReduced=%s: army movement remains positional and numeric changes redraw',
    async (reducedMotion) => {
      const r = await makeRenderer();
      r.setPresentationSettings({ mapLabelDensity: 'medium', effectsEnabled: true, reducedMotion });
      r.setMapData(staticData());
      r.updateView(baseView({ armies: marchingArmies(0.2, 2_000) }));
      const baseline = r.getRebuildCounts();
      expect(baseline.armyChips).toBe(2); // 首繪兩支

      const armyContainers = r.getLayers()!.armies.children;
      const posAAfterFirst = { x: armyContainers[0]!.position.x, y: armyContainers[0]!.position.y };
      expect(posAAfterFirst).toEqual({ x: 120, y: 100 }); // from(100,100)+((200,100)-(100,100))*0.2

      r.updateView(baseView({ armies: marchingArmies(0.6, 2_000) })); // 只 A 的 edgeT 前進
      expect(r.getRebuildCounts().armyChips).toBe(baseline.armyChips); // 不增：只 reposition
      expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers); // owner 未變，node 不重畫
      expect(armyContainers[0]!.position.x).toBeCloseTo(160, 5); // 100+100*0.6

      r.updateView(baseView({ armies: marchingArmies(0.6, 1_900) })); // B 的 soldiers 變
      expect(r.getRebuildCounts().armyChips).toBe(baseline.armyChips + 1);

      r.destroy();
    },
  );
});

// ── M6-V8：軍隊棋子整合（heading／armyChipStage restage／far 放大／被選取置頂／relation） ──────
//
// 全部以相對增量（Δ）斷言，不釘死 post-init 絕對 armyChips 值（V8D11 §8.3／#9）。chip container 於
// V8D14 為 3 子節點 [graphics, plateGfx, label]；MockGfx.poly 可 vi.spyOn 觀測方向箭頭之額外 poly。

interface SpyableGfx {
  poly: (...a: unknown[]) => unknown;
}

/** V8 軍隊字面量（含必填 relation）；`over` 覆寫任意欄位。以 cast 餵入 MapViewState['armies']。 */
function v8Army(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'army.x',
    clanId: 'clan.oda',
    soldiers: 2_000,
    status: 'holding',
    morale: 70,
    foodDays: 10,
    mission: 'march',
    fromNode: 'castle.a',
    toNode: null,
    edgeT: 0,
    corps: false,
    selected: false,
    relation: 'friendly',
    ...over,
  };
}
function armiesView(list: Record<string, unknown>[]): MapViewState['armies'] {
  return list as unknown as MapViewState['armies'];
}

describe('軍隊 V8（M6-V8 §8.3）：heading／stage restage／far 放大／置頂／relation', () => {
  it('heading 接線：marching 軍畫方向箭頭（額外 poly），holding 軍無', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
          }),
          v8Army({ id: 'army.2', fromNode: 'castle.b', toNode: null, status: 'holding' }),
        ]),
      }),
    );
    const children = r.getLayers()!.armies.children as unknown as MockGfx[];
    // id 序不變；named bodyGroup 的 child0 是 rear/vector Graphics。
    const gfxMarching = armyBodyGroup(children[0]! as unknown as Container)
      .children[0]! as unknown as SpyableGfx;
    const gfxHolding = armyBodyGroup(children[1]! as unknown as Container)
      .children[0]! as unknown as SpyableGfx;
    const polyMarching = vi.spyOn(gfxMarching, 'poly');
    const polyHolding = vi.spyOn(gfxHolding, 'poly');
    // 改 soldiers 觸發兩軍重繪（drawEqual false）。
    r.updateView(
      baseView({
        day: 2,
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
            soldiers: 2_500,
          }),
          v8Army({
            id: 'army.2',
            fromNode: 'castle.b',
            toNode: null,
            status: 'holding',
            soldiers: 2_500,
          }),
        ]),
      }),
    );
    // marching 多畫一個方向箭頭 poly（旗面 poly 兩軍皆有；箭頭僅 heading!==null）。
    expect(polyMarching.mock.calls.length).toBeGreaterThan(polyHolding.mock.calls.length);
    r.destroy();
  });

  it('painted army heading follows the actual authored road segment, including return direction', async () => {
    const art = new Map<string, Texture>();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockImplementation((id) => {
      const texture = new Texture();
      art.set(id, texture);
      return Promise.resolve(texture);
    });
    const r = await makeRenderer();
    try {
      const graph = fixtureGraph();
      const edges = new Map(graph.edges);
      const id = 'road.a-x' as RoadEdgeId;
      edges.set(id, { ...edges.get(id)!, waypoints: [100, 200, 200, 200] });
      r.setMapData(staticData({ graph: { ...graph, edges } }));
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      r.updateView(baseView({ armies: [{ ...paintedArmy(), edgeT: 0.25 }] }));
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const sprite = r.getLayers()!.actorBodies.children.find((c) => c.label.startsWith('army:'))!
        .children[1] as unknown as {
        texture: Texture;
      };
      expect(sprite.texture).toBe(art.get('texture.army.infantry-south-v1'));
      r.updateView(baseView({ day: 2, armies: [{ ...paintedArmy(), edgeT: 0.75 }] }));
      expect(sprite.texture).toBe(art.get('texture.army.infantry-north-v1'));
      r.updateView(baseView({ day: 3, armies: [{ ...paintedArmy(true), edgeT: 0.75 }] }));
      expect(sprite.texture).toBe(art.get('texture.army.infantry-north-v1'));
    } finally {
      r.destroy();
      acquire.mockRestore();
    }
  });

  it('actual Sunpu curved corner drives the painted Sprite and arrow along the flattened local tangent', async () => {
    const art = new Map<string, Texture>();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockImplementation((id) => {
      const texture = new Texture();
      art.set(id, texture);
      return Promise.resolve(texture);
    });
    const r = await makeRenderer();
    try {
      const road = nationalRoads.edges.find((e) => e.id === 'road.sunpu-kokokuji-01')!;
      const castles = nationalCastles.filter((c) => c.id === road.a || c.id === road.b);
      const graph = buildMapGraph(
        Object.fromEntries(castles.map((c) => [c.id, { id: c.id as CastleId, pos: c.pos }])),
        {},
        {
          [road.id]: {
            ...road,
            id: road.id as RoadEdgeId,
            a: road.a as CastleId,
            b: road.b as CastleId,
            type: 'land' as const,
            grade: 3 as const,
          },
        },
        { [road.id]: road },
      );
      const edge = graph.edges.get(road.id as RoadEdgeId)!;
      const points = edgeVisualPolyline(edge, graph)!;
      // Independent arc walk and local unit vector, not production tangentAtPolyline.
      const lengths = points
        .slice(1)
        .map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      expect(road.waypoints).toBeDefined();
      const index = points.findIndex(
        (p, i) => i > 0 && p.y !== points[i - 1]!.y && p.x > road.waypoints![0]!,
      );
      expect(index).toBeGreaterThan(0);
      const a = points[index - 1]!,
        b = points[index]!,
        length = lengths[index - 1]!;
      const ratio =
        (lengths.slice(0, index - 1).reduce((sum, n) => sum + n, 0) + length / 2) / total;
      const hx = (b.x - a.x) / length,
        hy = (b.y - a.y) / length;
      r.setMapData(staticData({ graph }));
      r.setCameraPose(a, 1.25);
      const army = { ...paintedArmy(), fromNode: edge.a, toNode: edge.b, edgeT: ratio };
      r.updateView(baseView({ armies: [army] }));
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const group = armyBodyGroup(r.getLayers()!.armies.children[0]!);
      const sprite = r.getLayers()!.actorBodies.children.find((c) => c.label.startsWith('army:'))!
        .children[1] as unknown as { texture: Texture };
      expect(sprite.texture).toBe(
        art.get(
          `texture.army.infantry-${Math.abs(hx) >= Math.abs(hy) ? (hx < 0 ? 'west' : 'east') : hy < 0 ? 'north' : 'south'}-v1`,
        ),
      );
      const front = group.children.find((child) => child.label === 'armyHeading')! as unknown as {
        lineTo(x: number, y: number): unknown;
      };
      const line = vi.spyOn(front, 'lineTo');
      r.updateView(baseView({ day: 2, armies: [{ ...army, soldiers: army.soldiers + 1 }] }));
      expect(
        line.mock.calls.some(
          ([x, y]) => Math.abs(x - hx * 15) < 1e-10 && Math.abs(y - hy * 15) < 1e-10,
        ),
      ).toBe(true);
      line.mockClear();
      r.updateView(
        baseView({
          day: 3,
          armies: [{ ...army, fromNode: edge.b, toNode: edge.a, edgeT: 1 - ratio }],
        }),
      );
      expect(
        line.mock.calls.some(
          ([x, y]) => Math.abs(x + hx * 15) < 1e-10 && Math.abs(y + hy * 15) < 1e-10,
        ),
      ).toBe(true);
    } finally {
      r.destroy();
      acquire.mockRestore();
    }
  });

  it('LOD restage Δ 遞增（BLOCKER1 守門）：far→near 落差觸發 syncArmyChips 重繪', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ armies: armiesView([v8Army({ id: 'army.1' })]) }));
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far（已為 far → armyChipStage 落差為 0，不 restage）
    const base = r.getRebuildCounts().armyChips;
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // far→near：armyChipStage 落差 → restage 重繪
    expect(r.getRebuildCounts().armyChips).toBeGreaterThan(base);
    r.destroy();
  });

  it('day-only Δ 零：固定相機（同 stage）連跑 30 日，armyChips 不增', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const mk = (day: number): MapViewState =>
      baseView({
        day,
        armies: armiesView([
          v8Army({
            id: 'army.1',
            fromNode: 'castle.a',
            toNode: 'dist.x',
            edgeT: 0.5,
            status: 'marching',
          }),
        ]),
      });
    r.updateView(mk(1));
    const base = r.getRebuildCounts().armyChips;
    for (let i = 0; i < 30; i += 1) r.updateView(mk(2 + i)); // heading 常數（同邊）＋pos 同 → drawEqual → Δ0
    expect(r.getRebuildCounts().armyChips).toBe(base);
    r.destroy();
  });

  it('far 放大為 transform（不計 armyChips）＋ far/near container scale 切換', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null })]),
      }),
    );
    r.setCameraPose({ x: 100, y: 100 }, 0.25); // far
    const base = r.getRebuildCounts().armyChips;
    const container = r.getLayers()!.armies.children[0]!;
    expect(container.scale.x).toBe(MAPVIEW.armyFarChipScale); // far 反向放大
    r.updateView(
      baseView({
        day: 2,
        armies: armiesView([v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null })]),
      }),
    ); // 同 stage far、props 同
    expect(r.getRebuildCounts().armyChips).toBe(base); // 放大為 transform，不重繪、不計數
    r.setCameraPose({ x: 100, y: 100 }, 1.25); // near
    expect(container.scale.x).toBe(1); // mid/near 恢復 1
    r.destroy();
  });

  it('MapRebuildCounts 恆 6 欄位（toEqual 整物件；M6-V9b 增 nameplates）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ armies: armiesView([v8Army({ id: 'army.1' })]) }));
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // 觸發 restage
    const counts = r.getRebuildCounts();
    expect(Object.keys(counts).sort()).toEqual([
      'armyChips',
      'labels',
      'nameplates', // M6-V9b §2.9：城名牌建/毀新計數欄（與 labels 分離）
      'nodeMarkers',
      'roads',
      'territory',
    ]);
    r.destroy();
  });

  it('被選取置頂（V8D10）：selected 軍 re-append 至 armies.children 末端；換選取換置頂', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const mk = (sel: string | null): MapViewState =>
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.1', fromNode: 'castle.a', toNode: null, selected: sel === 'army.1' }),
          v8Army({ id: 'army.2', fromNode: 'castle.b', toNode: null, selected: sel === 'army.2' }),
        ]),
      });
    r.updateView(mk(null));
    const children = r.getLayers()!.armies.children;
    const c1 = children[0]!; // army.1（id 序在前）
    const c2 = children[1]!; // army.2
    r.updateView(mk('army.1'));
    expect(r.getLayers()!.armies.children.at(-1)).toBe(c1); // army.1 選取 → 置頂
    r.updateView(mk('army.2'));
    expect(r.getLayers()!.armies.children.at(-1)).toBe(c2); // 換 army.2 選取 → 換置頂
    r.destroy();
  });

  it('faction dots register every unstacked position and mode switches restore chip hit positions', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const interaction = (
      r as unknown as {
        interaction: {
          setArmies: (armies: readonly { id: string; pos: { x: number; y: number } }[]) => void;
        };
      }
    ).interaction;
    const spy = vi.spyOn(interaction, 'setArmies');
    const view = baseView({
      armies: armiesView(
        Array.from({ length: 5 }, (_, i) =>
          v8Army({ id: `army.${i}`, fromNode: 'castle.a', toNode: null, foodDays: 10 }),
        ),
      ),
    });
    r.update(view, { analysisMode: 'none' });
    const regular = spy.mock.calls.at(-1)![0];
    expect(regular).toHaveLength(4);
    r.update(view, { analysisMode: 'faction' });
    const faction = spy.mock.calls.at(-1)![0];
    expect(faction).toHaveLength(5);
    expect(faction.every((a) => a.pos.x === 100 && a.pos.y === 100)).toBe(true);
    r.update(view, { analysisMode: 'none' });
    expect(spy.mock.calls.at(-1)![0]).toEqual(regular);
    r.destroy();
  });

  it.each([{ foodDays: 1 }, { status: 'engaged' }, { status: 'sieging' }])(
    'faction keeps a fifth critical chip visible and hittable: %j',
    async (critical) => {
      const r = await makeRenderer();
      r.setMapData(staticData());
      const interaction = (
        r as unknown as {
          interaction: {
            setArmies: (armies: readonly { id: string; pos: { x: number; y: number } }[]) => void;
          };
        }
      ).interaction;
      const spy = vi.spyOn(interaction, 'setArmies');
      const view = baseView({
        armies: armiesView(
          Array.from({ length: 5 }, (_, i) =>
            v8Army({
              id: `army.${i}`,
              fromNode: 'castle.a',
              toNode: null,
              foodDays: 10,
              ...(i === 4 ? critical : {}),
            }),
          ),
        ),
      });
      r.update(view, { analysisMode: 'none' });
      const chip = r.getLayers()!.armies.children[4]!;
      expect(chip.visible).toBe(false);
      expect(spy.mock.calls.at(-1)![0].some((a) => a.id === 'army.4')).toBe(false);
      r.update(view, { analysisMode: 'faction' });
      expect(chip.visible).toBe(true);
      expect(spy.mock.calls.at(-1)![0].find((a) => a.id === 'army.4')?.pos).toEqual({
        x: chip.position.x,
        y: chip.position.y,
      });
      r.update(view, { analysisMode: 'none' });
      expect(chip.visible).toBe(false);
      r.destroy();
    },
  );

  it('被選取軍深埋 5+ 收合區仍破例顯示且置頂（V8D10「永遠置頂」硬約束回歸）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const interaction = (
      r as unknown as { interaction: { setArmies: (armies: readonly { id: string }[]) => void } }
    ).interaction;
    const setArmies = vi.spyOn(interaction, 'setArmies');
    // 5 支 holding 軍同駐 castle.a（同 stackKey）→ 收合：id 序 index>=4 預設隱藏。選取 id 序最末
    // （army.5，index 4）者：修正前會被加入 collapsedArmyIds → container 隱藏、且置頂迴圈以
    // !entry.visible 跳過 → 既不顯示亦不置頂，違反「被選取軍隊永遠置頂／破例顯示」硬約束。
    const ids = ['army.1', 'army.2', 'army.3', 'army.4', 'army.5'];
    r.updateView(
      baseView({
        armies: armiesView(
          ids.map((id) =>
            v8Army({ id, fromNode: 'castle.a', toNode: null, edgeT: 0, selected: id === 'army.5' }),
          ),
        ),
      }),
    );
    const children = r.getLayers()!.armies.children;
    const selected = children[4]!; // 建立序 army.1..army.5 → army.5 = index 4（收合區）
    expect(selected.visible).toBe(true); // 破例顯示（未被 collapsedArmyIds 隱藏）
    expect(r.getLayers()!.armies.children.at(-1)).toBe(selected); // re-append 至末＝置頂
    expect(setArmies.mock.calls.at(-1)![0].some((army) => army.id === 'army.5')).toBe(true);
    r.destroy();
  });

  it('正向存在（堵靜默）：friendly/enemy/neutral 三軍皆建立 chip、各 3 子節點 [graphics,plateGfx,label]', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.1', relation: 'friendly', fromNode: 'castle.a', toNode: null }),
          v8Army({ id: 'army.2', relation: 'enemy', fromNode: 'castle.b', toNode: null }),
          v8Army({ id: 'army.3', relation: 'neutral', fromNode: 'dist.x', toNode: null }),
        ]),
      }),
    );
    const children = r.getLayers()!.armies.children as unknown as MockGfx[];
    expect(children.length).toBe(3);
    for (const c of children) expect(c.children.length).toBe(3); // graphics / plateGfx / label
    r.destroy();
  });
});

describe('MapRenderer.panTo（決策 D10；MiniMap onNavigate 用）', () => {
  it('reorders a moving soldier across a castle foot while flags and selected plates remain foreground', async () => {
    const r = await makeRenderer();
    const original = fixtureGraph();
    const graph = {
      ...original,
      nodes: new Map(
        [...original.nodes].map(([id, node]) => [
          id,
          {
            ...node,
            pos: { ...node.pos, y: id === 'castle.a' ? 80 : id === 'castle.b' ? 110 : 140 },
          },
        ]),
      ),
    };
    r.setMapData(staticData({ graph }));
    r.setCameraPose({ x: 200, y: 110 }, 1.25);
    const moving = { ...paintedArmy(), selected: true, edgeT: 0.2 };
    r.updateView(baseView({ armies: [moving] }));
    const layer = r.getLayers()!.actorBodies;
    const army = layer.children.find((body) => body.label === 'army:army.art')!;
    const castle = layer.children.find((body) => body.label === 'castle:castle.b')!;
    const semantic = r.getLayers()!.armies.children[0]!;
    const hit = semantic.hitArea;
    expect(layer.children.indexOf(army)).toBeLessThan(layer.children.indexOf(castle));
    const redraw = r.getRebuildCounts().armyChips;
    r.updateView(baseView({ armies: [{ ...moving, edgeT: 0.8 }] }));
    expect(layer.children.indexOf(army)).toBeGreaterThan(layer.children.indexOf(castle));
    expect(r.getRebuildCounts().armyChips).toBe(redraw);
    expect(semantic.hitArea).toBe(hit);
    expect(army.position.y).toBe(semantic.position.y);
    r.updateView(baseView({ armies: [{ ...moving, edgeT: 31 / 60 }] }));
    // Exact foot tie: army:army.art sorts before castle:castle.b, regardless of selection.
    expect(army.position.y - army.scale.y).toBe(castle.position.y);
    expect(layer.children.indexOf(army)).toBeLessThan(layer.children.indexOf(castle));
    const stable = layer.children.slice();
    r.updateView(baseView({ day: 2, armies: [{ ...moving, edgeT: 31 / 60 }] }));
    expect(layer.children).toEqual(stable);
    const diagnostics = r.getDiagnostics();
    expect(diagnostics.actorDepth.semanticLayerOrders.army).toBeGreaterThan(
      diagnostics.actorDepth.modelLayerOrder,
    );
    expect(diagnostics.actorDepth.semanticLayerOrders.castle).toBeGreaterThan(
      diagnostics.actorDepth.modelLayerOrder,
    );
    r.setCameraPose({ x: 200, y: 110 }, 0.3);
    expect(
      r.getDiagnostics().actorDepth.bodies.find((body) => body.id === 'army.art')!.visible,
    ).toBe(false);
    const destroyArmy = vi.spyOn(army, 'destroy');
    const destroyCastle = vi.spyOn(castle, 'destroy');
    r.destroy();
    expect(destroyArmy).toHaveBeenCalledTimes(1);
    expect(destroyCastle).toHaveBeenCalledTimes(1);
    expect(army.parent).toBeNull();
    expect(castle.parent).toBeNull();
  });
  it('shares castle and soldier bodies in foot-depth order without lifting a selected body', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.back', fromNode: 'castle.a', toNode: null, selected: true }),
          v8Army({ id: 'army.front', fromNode: 'castle.b', toNode: null }),
        ]),
      }),
    );
    const bodies = r.getLayers()!.world.children.find((c) => c.label === 'actorBodies');
    expect(bodies).toBeDefined();
    expect(bodies!.children.map((c) => c.label)).toContain('army:army.back');
    expect(bodies!.children.map((c) => c.label)).toContain('castle:castle.a');
    const ordered = bodies!.children;
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.position.y).toBeGreaterThanOrEqual(ordered[i - 1]!.position.y - 1);
    }
    const selected = r.getLayers()!.armies.children.at(-1)!;
    expect(selected.position.x).toBe(ordered.find((c) => c.label === 'army:army.back')!.position.x);
    const first = ordered.slice();
    r.updateView(
      baseView({
        armies: armiesView([
          v8Army({ id: 'army.front', fromNode: 'castle.b', toNode: null }),
          v8Army({ id: 'army.back', fromNode: 'castle.a', toNode: null, selected: true }),
        ]),
      }),
    );
    expect(bodies!.children).toEqual(first);
    r.setMapData(null);
    expect(bodies!.children).toHaveLength(0);
    r.destroy();
  });
  it('keeps selection and siege status behind castle bodies through map clear and restore', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    const ground = r.getLayers()!.nodeMarkers.children[0]!;
    expect(ground.label).toBe('castleGroundStatus');
    expect(ground.children.some((c) => c.label === 'selectionRing')).toBe(true);
    r.setMapData(null);
    expect(r.getLayers()!.nodeMarkers.children).toContain(ground);
    r.setMapData(staticData());
    expect(r.getLayers()!.nodeMarkers.children[0]).toBe(ground);
    r.destroy();
  });
  it('frames explicit navigation in a measured CSS viewport without resizing or keyboard autopan', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.setPresentationSettings({ mapLabelDensity: 'medium', effectsEnabled: false });
    r.setCameraPose({ x: 0, y: 0 }, 1);
    r.setFocusViewport({ x: 80, y: 60, width: 500, height: 400 });
    expect(r.getLayers()!.world.position.x).toBe(400);
    r.panToWorld(321, 654);
    const world = r.getLayers()!.world;
    expect(321 * world.scale.x + world.position.x).toBeCloseTo(330);
    expect(654 * world.scale.y + world.position.y).toBeCloseTo(260);
    const before = { x: world.position.x, y: world.position.y };
    r.setFocusViewport({ x: 90, y: 70, width: 450, height: 380 });
    expect(world.position.x).toBe(before.x);
    expect(world.position.y).toBe(before.y);
    r.panByKeyboard(1, 0);
    expect(world.position.x).toBeCloseTo(before.x - 600);
    r.focusNode('castle.a');
    expect(100 * world.scale.x + world.position.x).toBeCloseTo(315);
    expect(100 * world.scale.y + world.position.y).toBeCloseTo(260);
    r.panToWorld(321, 654, { x: 100, y: 80, width: 400, height: 300 });
    expect(321 * world.scale.x + world.position.x).toBeCloseTo(300);
    expect(654 * world.scale.y + world.position.y).toBeCloseTo(230);
    r.update(baseView({ day: 2 }));
    expect(321 * world.scale.x + world.position.x).toBeCloseTo(300);
    expect(654 * world.scale.y + world.position.y).toBeCloseTo(230);
    const app = r.getApp();
    if (app === null) throw new Error('Expected initialized renderer');
    const centerBeforeResize = (400 - world.position.x) / world.scale.x;
    app.screen.width = 640;
    app.screen.height = 480;
    r.resize(640, 480);
    expect((320 - world.position.x) / world.scale.x).toBeCloseTo(centerBeforeResize);
    r.panToWorld(321, 654, { x: 80, y: 50, width: 400, height: 300 });
    expect(321 * world.scale.x + world.position.x).toBeCloseTo(280);
    expect(654 * world.scale.y + world.position.y).toBeCloseTo(200);
    r.setFocusViewport({ x: -1, y: 0, width: 100, height: 100 });
    r.panToWorld(321, 654);
    expect(321 * world.scale.x + world.position.x).toBeCloseTo(320);
    expect(654 * world.scale.y + world.position.y).toBeCloseTo(240);
    r.destroy();
  });
  it('honors pre-init motion settings without reading browser media itself', async () => {
    const r = new MapRenderer();
    r.setPresentationSettings({ mapLabelDensity: 'medium', effectsEnabled: false });
    await r.init(document.createElement('div'), vi.fn());
    r.setMapData(staticData());
    r.focusNode('castle.a');
    expect(r.getLayers()!.world.scale.x).toBe(MAPVIEW.focusScale);
    expect(r.getLayers()!.world.position.x).toBeCloseTo(400 - 100 * MAPVIEW.focusScale);
    r.destroy();
  });
  it('runtime reduced motion completes an active focus immediately and restores ordinary motion later', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.setCameraPose({ x: 0, y: 0 }, 1);
    r.panToWorld(321, 654);
    expect(r.getLayers()!.world.scale.x).toBe(1);
    r.setPresentationSettings({
      mapLabelDensity: 'medium',
      effectsEnabled: true,
      reducedMotion: true,
    });
    const layers = r.getLayers()!;
    expect(layers.world.scale.x).toBe(MAPVIEW.focusScale);
    expect(layers.world.position.x).toBeCloseTo(400 - 321 * MAPVIEW.focusScale);
    expect(layers.world.position.y).toBeCloseTo(300 - 654 * MAPVIEW.focusScale);
    r.focusNode('castle.a');
    expect(layers.world.position.x).toBeCloseTo(400 - 100 * MAPVIEW.focusScale);
    const snapshot = { x: layers.world.position.x, y: layers.world.position.y };
    (r.getApp()!.ticker as unknown as { tick: () => void }).tick();
    expect(layers.world.position.x).toBe(snapshot.x);
    expect(layers.world.position.y).toBe(snapshot.y);
    r.zoomByKeyboard(1);
    expect(layers.world.scale.x).toBeCloseTo(MAPVIEW.focusScale * MAPVIEW.wheelZoomStep);
    const before = layers.world.position.x;
    r.panByKeyboard(1, 0);
    expect(layers.world.position.x).toBeCloseTo(before - 600);
    r.setPresentationSettings({
      mapLabelDensity: 'medium',
      effectsEnabled: true,
      reducedMotion: false,
    });
    const resumed = layers.world.position.x;
    r.panToWorld(800, 800);
    expect(layers.world.position.x).toBe(resumed);
    (r.getApp()!.ticker as unknown as { tick: () => void }).tick();
    expect(layers.world.position.x).not.toBe(resumed);
    r.destroy();
  });
  it('瞬移中心至指定世界座標、維持現 scale；與 setCameraPose({x,y},scale) 效果一致（黑箱驗證）', async () => {
    const r1 = await makeRenderer();
    r1.setCameraPose({ x: 0, y: 0 }, 2);
    const layers1 = r1.getLayers()!;
    const scaleBefore = layers1.world.scale.x;
    expect(scaleBefore).toBe(2);

    r1.panTo(321, 654);
    expect(layers1.world.scale.x).toBe(scaleBefore); // scale 維持不變（04 §3.13.1 無動畫）

    const r2 = await makeRenderer();
    r2.setCameraPose({ x: 0, y: 0 }, 2);
    r2.setCameraPose({ x: 321, y: 654 }, scaleBefore);
    const layers2 = r2.getLayers()!;

    expect(layers1.world.position.x).toBeCloseTo(layers2.world.position.x, 6);
    expect(layers1.world.position.y).toBeCloseTo(layers2.world.position.y, 6);

    r1.destroy();
    r2.destroy();
  });
});

describe('territory sprite dirty（M6-V5 §8.2；VD4 首幀著色＋owner 翻轉）', () => {
  it('owns one shared elevated ground mesh with stable day/camera identity and explicit missing-ground admission failure', async () => {
    const data = staticDataWithTerrain();
    if (!data.terrain) throw new Error('Missing terrain');
    data.terrain.groundArtAssetId = 'test.ground';
    const groundTexture = new Texture();
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(groundTexture);
    const renderer = await makeRenderer();
    renderer.setMapData(data);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const layers = renderer.getLayers()!;
    const elevated = sharedElevatedSurface(renderer);
    expect(terrainPaintChildren(renderer)).toEqual([elevated.mesh]);
    expect(elevated.mesh.texture).toBe(groundTexture);
    const attribute = elevated.geometry.getBuffer('aPosition');
    const index = elevated.geometry.indexBuffer;
    const destroyAttribute = vi.spyOn(attribute, 'destroy');
    const destroyIndex = vi.spyOn(index, 'destroy');
    const destroyProgram = vi.spyOn(elevated.shader.glProgram, 'destroy');
    const original = terrainPaintChildren(renderer);
    renderer.updateView(baseView({ day: 2 }));
    renderer.setCameraPose({ x: 200, y: 100 }, 0.5);
    (renderer.getApp()!.ticker as unknown as { tick: () => void }).tick();
    expect(terrainPaintChildren(renderer)).toEqual(original);
    expect(sharedElevatedSurface(renderer)).toBe(elevated);
    acquire.mockImplementation((id) =>
      id === 'test.ground' ? Promise.reject(new Error('missing')) : Promise.resolve(new Texture()),
    );
    renderer.setMapData(data);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(renderer.getDiagnostics().elevationRendering).toMatchObject({
      active: true,
      error: 'Elevated terrain ground texture unavailable',
      surface: null,
    });
    expect(terrainPaintChildren(renderer)).toHaveLength(0);
    expect(destroyAttribute).toHaveBeenCalledTimes(1);
    expect(destroyIndex).toHaveBeenCalledTimes(1);
    expect(destroyProgram).toHaveBeenCalledTimes(1);
    expect(elevated.getDiagnostics()).toMatchObject({
      ownedMeshes: 0,
      ownedBuffers: 0,
      bufferBytes: 0,
    });
    expect(groundTexture.destroyed).toBe(false);
    expect(layers.terrainBase.children.some((c) => c.label === 'terrain-ground-surface')).toBe(
      true,
    );
    renderer.destroy();
    acquire.mockRestore();
  });
  it('late terrain acquisition cannot attach after map swap or renderer destruction', async () => {
    const waits: Array<(texture: Texture) => void> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation(() => new Promise<Texture>((resolve) => waits.push(resolve)));
    const renderer = await makeRenderer();
    renderer.setMapData(staticDataWithTerrain());
    const layers = renderer.getLayers()!;
    renderer.setMapData(staticData());
    waits.splice(0).forEach((resolve) => resolve(new Texture()));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expectBankOnlyGround(renderer);
    renderer.setMapData(staticDataWithTerrain());
    renderer.destroy();
    waits.splice(0).forEach((resolve) => resolve(new Texture()));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(layers.terrainBase.children).toHaveLength(0);
    acquire.mockRestore();
  });

  it('castle art binds only the current map generation, fails independently, and never attaches after destroy', async () => {
    const waits: Array<{
      id: string;
      resolve: (texture: Texture) => void;
      reject: (error: Error) => void;
    }> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation(
        (id) => new Promise<Texture>((resolve, reject) => waits.push({ id, resolve, reject })),
      );
    const renderer = await makeRenderer();
    try {
      renderer.setMapData(staticData());
      renderer.updateView(baseView());
      renderer.setCameraPose({ x: 200, y: 100 }, 1.25);
      const layers = renderer.getLayers()!;
      const body = layers.actorBodies.children.find((c) => c.label === 'castle:castle.a')!;
      renderer.setMapData(staticData());
      renderer.updateView(baseView());
      const oldCastle = waits.splice(0, 4);
      expect(oldCastle).toHaveLength(4);
      oldCastle.forEach((wait) => wait.resolve(new Texture()));
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(body.children).toHaveLength(1); // stale generation did not attach
      const current = waits.splice(0);
      expect(current).toHaveLength(4);
      current.forEach((wait) =>
        wait.id.includes('plain')
          ? wait.resolve(new Texture())
          : wait.reject(new Error('unavailable')),
      );
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(body.children).toHaveLength(3); // fallback, contact shadow and raster; flag is foreground
      expect(body.children[0]!.visible).toBe(false);
      expect(body.children[1]).toBeInstanceOf(Graphics);
      expect(body.children[2]).toBeInstanceOf(Sprite);
      renderer.updateView({
        ...baseView(),
        castles: baseView().castles.map((castle) =>
          castle.id === 'castle.b' ? { ...castle, tier: 'branch', terrainKind: 'plain' } : castle,
        ),
      });
      const branchBody = layers.actorBodies.children.find((c) => c.label === 'castle:castle.b')!;
      expect(branchBody.children).toHaveLength(3);
      expect(branchBody.children[0]!.visible).toBe(false);
      expect(branchBody.children[1]).toBeInstanceOf(Graphics);
      expect(branchBody.children[2]).toBeInstanceOf(Sprite);
      renderer.updateView({
        ...baseView(),
        castles: baseView().castles.map((castle) =>
          castle.id === 'castle.b'
            ? { ...castle, tier: 'branch', terrainKind: 'mountain' }
            : castle,
        ),
      });
      const missingBody = layers.actorBodies.children.find((c) => c.label === 'castle:castle.b')!;
      expect(missingBody.children[0]!.visible).toBe(true);
      expect(body.children[0]!.visible).toBe(false);
      const children = [...body.children];
      renderer.updateView({ ...baseView(), day: 2 });
      expect(body.children).toEqual(children);
      renderer.setMapData(staticData());
      renderer.updateView(baseView());
      const attach = vi.spyOn(body, 'addChild');
      renderer.destroy();
      waits.splice(0).forEach((wait) => wait.resolve(new Texture()));
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
      const originalRaster = children.find((child) => child instanceof Sprite);
      expect(originalRaster).toBeDefined();
      expect(body.children).not.toContain(originalRaster); // original raster detached before app teardown
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('army art admits four views only on the first army, shares daily updates, and falls back per failed direction', async () => {
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id.includes('infantry-west')
          ? Promise.reject(new Error('missing west'))
          : Promise.resolve(new Texture()),
      );
    const renderer = await makeRenderer();
    renderer.setMapData(staticData());
    renderer.updateView(baseView());
    const armyCalls = () => acquire.mock.calls.filter(([id]) => id.startsWith('texture.army.'));
    expect(armyCalls()).toHaveLength(0);
    const view = baseView({
      armies: [paintedArmy()],
    });
    renderer.updateView(view);
    renderer.setCameraPose({ x: 200, y: 100 }, 1.25);
    expect(armyCalls()).toHaveLength(4);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const group = renderer
      .getLayers()!
      .actorBodies.children.find((c) => c.label.startsWith('army:'))!;
    expect(group.children).toHaveLength(2); // fallback infantry and painted soldiers; signals stay foreground
    const sprite = group.children[1]!;
    expect(sprite.visible).toBe(true);
    renderer.updateView({ ...view, day: 2 });
    expect(group.children[1]).toBe(sprite);
    expect(armyCalls()).toHaveLength(4);
    renderer.updateView(
      baseView({
        armies: [paintedArmy(true)],
      }),
    );
    expect(sprite.visible).toBe(false); // west unavailable: vector remains
    renderer.updateView(baseView());
    expect(group.children).not.toContain(sprite);
    renderer.updateView(view);
    expect(armyCalls()).toHaveLength(4); // no per-day/per-army retry after failure
    renderer.destroy();
    acquire.mockRestore();
  });

  it('actual delayed army promises cannot paint a swapped map or attach after renderer destruction', async () => {
    const waits: Array<{
      id: string;
      resolve: (texture: Texture) => void;
      reject: (error: Error) => void;
    }> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id.startsWith('texture.army.')
          ? new Promise<Texture>((resolve, reject) => waits.push({ id, resolve, reject }))
          : Promise.resolve(new Texture()),
      );
    const renderer = await makeRenderer();
    renderer.setMapData(staticData());
    const view = baseView({
      armies: [paintedArmy()],
    });
    renderer.updateView(view);
    renderer.setCameraPose({ x: 200, y: 100 }, 1.25);
    const group = renderer
      .getLayers()!
      .actorBodies.children.find((c) => c.label.startsWith('army:'))!;
    const old = waits.splice(0);
    expect(old).toHaveLength(4);
    renderer.setMapData(staticData());
    renderer.updateView(view);
    old.forEach((wait) => wait.resolve(new Texture()));
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(group.children).toHaveLength(1);
    waits
      .splice(0)
      .forEach((wait) =>
        wait.id.includes('infantry-east')
          ? wait.resolve(new Texture())
          : wait.reject(new Error('unavailable')),
      );
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(group.children).toHaveLength(2);
    const sprite = group.children[1]!;
    renderer.setMapData(staticData());
    renderer.updateView(view);
    const attach = vi.spyOn(group, 'addChild');
    renderer.destroy();
    waits.splice(0).forEach((wait) => wait.resolve(new Texture()));
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(attach).not.toHaveBeenCalled();
    expect(group.children).not.toContain(sprite);
    acquire.mockRestore();
  });

  it('deduplicates per-ID mountain art and retains axis fallback admission even when all patches override it', async () => {
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(new Texture());
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing terrain fixture');
      data.terrain.mountainArtAssetId = 'test.base';
      data.terrain.mountainArtVariants = {
        horizontal: 'test.horizontal',
        vertical: 'test.vertical',
      };
      data.terrain.mountainArtById = { first: 'test.override', second: 'test.override' };
      data.terrain.mountains = ['first', 'second'].map((id) => ({
        id,
        tier: 1,
        mass: [
          { x: 100, y: 100 },
          { x: 160, y: 100 },
          { x: 160, y: 200 },
          { x: 100, y: 200 },
        ],
        ridges: [
          [
            { x: 130, y: 110 },
            { x: 130, y: 190 },
          ],
        ],
      }));
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      for (const id of ['test.override', 'test.vertical', 'test.base'])
        expect(acquire.mock.calls.filter(([requested]) => requested === id)).toHaveLength(1);
      expect(acquire.mock.calls.some(([id]) => id === 'test.horizontal')).toBe(false);
      const children = terrainPaintChildren(renderer);
      renderer.updateView(baseView());
      renderer.updateView(baseView({ day: 2 }));
      expect(terrainPaintChildren(renderer)).toEqual(children);
      expect(acquire.mock.calls.filter(([id]) => id === 'test.override')).toHaveLength(1);
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it.each(['swap', 'dispose'] as const)(
    'cannot attach a delayed per-ID mountain override after %s',
    async (mode) => {
      let resolveVariant: ((texture: Texture) => void) | undefined;
      const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockImplementation((id) =>
        id === 'test.override'
          ? new Promise<Texture>((resolve) => {
              resolveVariant = resolve;
            })
          : Promise.resolve(new Texture()),
      );
      const renderer = await makeRenderer();
      try {
        const data = staticDataWithTerrain();
        if (!data.terrain) throw new Error('Missing terrain fixture');
        data.terrain.mountainArtAssetId = 'test.base';
        data.terrain.mountainArtVariants = {
          horizontal: 'test.horizontal',
          vertical: 'test.vertical',
        };
        data.terrain.mountainArtById = { first: 'test.override' };
        data.terrain.mountains = [
          {
            id: 'first',
            tier: 1,
            mass: [
              { x: 100, y: 100 },
              { x: 160, y: 100 },
              { x: 160, y: 200 },
              { x: 100, y: 200 },
            ],
            ridges: [
              [
                { x: 130, y: 110 },
                { x: 130, y: 190 },
              ],
            ],
          },
        ];
        renderer.setMapData(data);
        const layers = renderer.getLayers()!;
        if (mode === 'swap') renderer.setMapData(staticData());
        else renderer.destroy();
        const attach = vi.spyOn(layers.terrainBase, 'addChild');
        if (!resolveVariant) throw new Error('Per-ID art was not acquired');
        resolveVariant(new Texture());
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(attach).not.toHaveBeenCalled();
        if (mode === 'swap') expectBankOnlyGround(renderer);
      } finally {
        renderer.destroy();
        acquire.mockRestore();
      }
    },
  );

  it('acquires optional field input once without a duplicate unprojected layer, retaining shared mesh identity and ownership', async () => {
    const fields = new Texture();
    const grass = new Texture();
    const destroyFields = vi.spyOn(fields, 'destroy');
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        Promise.resolve(
          id === 'test.fields' ? fields : id === 'test.grass' ? grass : new Texture(),
        ),
      );
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing fixture terrain');
      data.terrain.groundArtAssetId = 'test.grass';
      data.terrain.fieldMaterialAssetId = 'test.fields';
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(acquire.mock.calls.filter(([id]) => id === 'test.fields')).toHaveLength(1);
      const children = terrainPaintChildren(renderer);
      const elevated = sharedElevatedSurface(renderer);
      expect(children).toEqual([elevated.mesh]);
      expect(elevated.mesh.texture).toBe(grass);
      expect((elevated.shader.resources as unknown as { uTexture: unknown }).uTexture).toBe(
        grass.source,
      );
      expect(renderer.getDiagnostics().elevationRendering.error).toBeNull();
      const destroyGeometry = vi.spyOn(elevated.geometry, 'destroy');
      const destroyAttribute = vi.spyOn(elevated.geometry.getBuffer('aPosition'), 'destroy');
      const destroyIndex = vi.spyOn(elevated.geometry.indexBuffer, 'destroy');
      const destroyShader = vi.spyOn(elevated.shader, 'destroy');
      renderer.updateView(baseView({ day: 2 }));
      expect(terrainPaintChildren(renderer)).toEqual(children);
      expect(acquire.mock.calls.filter(([id]) => id === 'test.fields')).toHaveLength(1);
      renderer.setMapData(staticData());
      expectBankOnlyGround(renderer);
      expect(destroyGeometry).toHaveBeenCalledTimes(1);
      expect(destroyGeometry).toHaveBeenCalledWith(false);
      expect(destroyAttribute).toHaveBeenCalledTimes(1);
      expect(destroyIndex).toHaveBeenCalledTimes(1);
      expect(destroyShader).toHaveBeenCalledTimes(1);
      expect(destroyShader).toHaveBeenCalledWith(true);
      expect(elevated.getDiagnostics()).toMatchObject({
        ownedMeshes: 0,
        ownedBuffers: 0,
        bufferBytes: 0,
      });
      expect(destroyFields).not.toHaveBeenCalled();
      expect(grass.destroyed).toBe(false);
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('optional field rejection preserves the independently loaded shared ground mesh and projected territory', async () => {
    const grass = new Texture();
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id === 'test.fields'
          ? Promise.reject(new Error('Unavailable fields'))
          : Promise.resolve(id === 'test.grass' ? grass : new Texture()),
      );
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing fixture terrain');
      data.terrain.groundArtAssetId = 'test.grass';
      data.terrain.fieldMaterialAssetId = 'test.fields';
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      const children = terrainPaintChildren(renderer);
      const elevated = sharedElevatedSurface(renderer);
      expect(children).toEqual([elevated.mesh]);
      expect(elevated.mesh.texture).toBe(grass);
      expect(renderer.getDiagnostics().elevationRendering).toMatchObject({
        error: null,
        territory: { ownedMeshes: 1, ownedGeometries: 1, ownedBuffers: 3, ownedTextures: 0 },
      });
      expect(children.every((child) => child.label !== 'terrain-field-material')).toBe(true);
      renderer.updateView(baseView({ day: 2 }));
      expect(sharedElevatedSurface(renderer)).toBe(elevated);
      expect(grass.destroyed).toBe(false);
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('actual delayed field Promise cannot attach after map replacement or renderer destruction', async () => {
    const waits: Array<(texture: Texture) => void> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id === 'test.fields'
          ? new Promise<Texture>((resolve) => waits.push(resolve))
          : Promise.resolve(new Texture()),
      );
    const data = staticDataWithTerrain();
    if (!data.terrain) throw new Error('Missing fixture terrain');
    data.terrain.fieldMaterialAssetId = 'test.fields';
    const renderer = await makeRenderer();
    try {
      renderer.setMapData(data);
      const layers = renderer.getLayers()!;
      renderer.setMapData(staticData());
      const attach = vi.spyOn(layers.terrainBase, 'addChild');
      expect(waits).toHaveLength(1);
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
      expectBankOnlyGround(renderer);
      renderer.setMapData(data);
      expect(waits).toHaveLength(1);
      renderer.destroy();
      attach.mockClear();
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('omits unsupported field Sprite masks only for an explicit Canvas renderer type', async () => {
    const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockResolvedValue(new Texture());
    const renderer = await makeRenderer();
    try {
      const app = renderer.getApp();
      if (!app) throw new Error('Missing renderer');
      Object.assign(app.renderer, { type: RendererType.CANVAS });
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing fixture terrain');
      data.terrain.fieldMaterialAssetId = 'test.fields';
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(acquire.mock.calls.some(([id]) => id === 'test.fields')).toBe(false);
      expect(terrainPaintChildren(renderer)).toHaveLength(2);
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it.each(['swap', 'dispose'] as const)(
    'yields before new forest masks and rejects %s during that yield',
    async (mode) => {
      const acquire = vi
        .spyOn(MapAssetLoader.prototype, 'acquire')
        .mockResolvedValue(new Texture());
      const renderer = await makeRenderer();
      const realSet = globalThis.setTimeout;
      const yields: Array<() => void> = [];
      const timer = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation((callback, delay, ...args) => {
          if (delay === 0 && typeof callback === 'function') {
            yields.push(() => callback(...args));
            return 0 as unknown as ReturnType<typeof setTimeout>;
          }
          return realSet(callback, delay, ...args);
        });
      try {
        const data = staticDataWithTerrain();
        if (!data.terrain) throw new Error('Missing terrain');
        data.terrain.mountainMaterialAssetId = 'test.woodland';
        data.terrain.forestArtAssetId = 'test.canopy';
        data.terrain.forests = [
          {
            id: 'forest',
            polygon: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
              { x: 100, y: 200 },
            ],
          },
        ];
        renderer.setMapData(data);
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(yields).toHaveLength(1);
        const layers = renderer.getLayers()!;
        if (mode === 'swap') renderer.setMapData(staticData());
        else renderer.destroy();
        const attach = vi.spyOn(layers.terrainBase, 'addChild');
        yields.shift()!();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        expect(attach).not.toHaveBeenCalled();
        if (mode === 'swap') expectBankOnlyGround(renderer);
      } finally {
        timer.mockRestore();
        renderer.destroy();
        acquire.mockRestore();
      }
    },
  );

  it.each(['missing', 'canvas', 'empty'] as const)(
    'forest %s retains canopy without unsupported material masks',
    async (mode) => {
      const acquire = vi
        .spyOn(MapAssetLoader.prototype, 'acquire')
        .mockImplementation((id) =>
          id === 'test.woodland' && mode === 'missing'
            ? Promise.reject(new Error('missing optional woodland'))
            : Promise.resolve(new Texture()),
        );
      const renderer = await makeRenderer();
      const timer = vi.spyOn(globalThis, 'setTimeout');
      try {
        if (mode === 'canvas') {
          const app = renderer.getApp();
          if (!app) throw new Error('Missing renderer');
          Object.assign(app.renderer, { type: RendererType.CANVAS });
        }
        const data = staticDataWithTerrain();
        if (!data.terrain) throw new Error('Missing terrain');
        data.terrain.mountainMaterialAssetId = 'test.woodland';
        data.terrain.forestArtAssetId = 'test.canopy';
        data.terrain.forests = [
          {
            id: 'forest',
            polygon: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
              { x: 100, y: 200 },
            ],
          },
        ];
        if (mode === 'empty') data.terrain.forests = [];
        renderer.setMapData(data);
        for (let i = 0; i < 30; i++) await Promise.resolve();
        const raster = renderer.getLayers()!.terrainBase.children.at(-1)!;
        expect(raster.children).toHaveLength(mode === 'empty' ? 0 : 2);
        expect(raster.children.every((child) => child.label !== 'forest-woodland-materials')).toBe(
          true,
        );
        if (mode !== 'empty') expect(raster.children[0]).toBeInstanceOf(Sprite);
        expect(timer.mock.calls.some(([, delay]) => delay === 0)).toBe(false);
      } finally {
        timer.mockRestore();
        renderer.destroy();
        acquire.mockRestore();
      }
    },
  );

  it('late shared woodland cannot attach forest masks after terrain swap or disposal', async () => {
    const waits: Array<(texture: Texture) => void> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id === 'test.woodland'
          ? new Promise<Texture>((resolve) => waits.push(resolve))
          : Promise.resolve(new Texture()),
      );
    const renderer = await makeRenderer();
    const data = staticDataWithTerrain();
    if (!data.terrain) throw new Error('Missing terrain');
    data.terrain.mountainMaterialAssetId = 'test.woodland';
    data.terrain.forestArtAssetId = 'test.canopy';
    data.terrain.forests = [
      {
        id: 'forest',
        polygon: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 100, y: 200 },
        ],
      },
    ];
    try {
      renderer.setMapData(data);
      const layers = renderer.getLayers()!;
      renderer.setMapData(staticData());
      const attach = vi.spyOn(layers.terrainBase, 'addChild');
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
      renderer.setMapData(data);
      renderer.destroy();
      attach.mockClear();
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('shares woodland admission with forest coverage below canopy without daily rebuilds', async () => {
    const woodland = new Texture();
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        Promise.resolve(id === 'test.woodland' ? woodland : new Texture()),
      );
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing terrain');
      data.terrain.mountainMaterialAssetId = 'test.woodland';
      data.terrain.forestArtAssetId = 'test.canopy';
      data.terrain.forests = [
        {
          id: 'forest',
          polygon: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 100, y: 200 },
          ],
        },
      ];
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const raster = renderer.getLayers()!.terrainBase.children.at(-1)!;
      const forestMaterial = terrainPaintChildren(renderer).find(
        (child) => child.label === 'forest-woodland-materials',
      );
      expect(forestMaterial).toBeDefined();
      expect(acquire.mock.calls.filter(([id]) => id === 'test.woodland')).toHaveLength(1);
      const materialGroup = forestMaterial!.children[0]!.children[0]!;
      const tile = materialGroup.children[0] as Sprite;
      const softMask = materialGroup.children[1] as Sprite;
      expect(tile.texture).toBe(woodland);
      const maskDestroy = vi.spyOn(softMask.texture, 'destroy');
      const sharedDestroy = vi.spyOn(woodland, 'destroy');
      renderer.updateView(baseView({ day: 2 }));
      expect(renderer.getLayers()!.terrainBase.children.at(-1)).toBe(raster);
      renderer.setMapData(staticData());
      expect(maskDestroy).toHaveBeenCalledTimes(1);
      expect(maskDestroy).toHaveBeenCalledWith(true);
      renderer.destroy();
      expect(maskDestroy).toHaveBeenCalledTimes(1);
      expect(sharedDestroy).not.toHaveBeenCalled();
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('acquires woodland material once and keeps it below peak art without day-only rebuilds', async () => {
    const material = new Texture();
    const peak = new Texture();
    const destroyMaterial = vi.spyOn(material, 'destroy');
    const destroyPeak = vi.spyOn(peak, 'destroy');
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        Promise.resolve(
          id === 'test.woodland' ? material : id === 'test.peak' ? peak : new Texture(),
        ),
      );
    const renderer = await makeRenderer();
    try {
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing fixture terrain');
      data.terrain.mountainArtAssetId = 'test.peak';
      data.terrain.mountainMaterialAssetId = 'test.woodland';
      data.terrain.mountains = [
        {
          id: 'woodland',
          tier: 1,
          mass: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
            { x: 100, y: 200 },
          ],
          ridges: [
            [
              { x: 120, y: 150 },
              { x: 180, y: 150 },
            ],
          ],
        },
      ];
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(acquire.mock.calls.filter(([id]) => id === 'test.woodland')).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const raster = renderer.getLayers()!.terrainBase.children.at(-1)!;
      // Material now belongs to the coast-clipped ground partition; peak remains outside it.
      expect(raster.children).toHaveLength(2);
      const materialLayer = terrainPaintChildren(renderer).find(
        (child) => child.label === 'mountain-woodland-materials',
      );
      expect(materialLayer).toBeDefined();
      const materialGroup = materialLayer!.children[0]!.children[0]!;
      const tile = materialGroup.children[0]!;
      const materialMask = materialGroup.children[1]!;
      const peakSprite = raster.children[0]!.children[0]!;
      expect(tile).toBeInstanceOf(Sprite);
      expect(peakSprite).toBeInstanceOf(Sprite);
      expect(materialMask).toBeInstanceOf(Sprite);
      expect((tile as Sprite).texture).toBe(material);
      expect((peakSprite as Sprite).texture).toBe(peak);
      const destroyMask = vi.spyOn((materialMask as Sprite).texture, 'destroy');
      const children = [...raster.children];
      renderer.updateView(baseView({ day: 2 }));
      expect(raster.children).toEqual(children);
      expect(acquire.mock.calls.filter(([id]) => id === 'test.woodland')).toHaveLength(1);
      renderer.destroy();
      expect(destroyMaterial).not.toHaveBeenCalled(); // caller-owned shared artwork survives
      expect(destroyPeak).not.toHaveBeenCalled();
      expect(destroyMask).toHaveBeenCalledWith(true);
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it.each(['material', 'peak'])(
    'woodland %s failure retains the other assets and original peak fallback contract',
    async (failed) => {
      const acquire = vi
        .spyOn(MapAssetLoader.prototype, 'acquire')
        .mockImplementation((id) =>
          id === `test.${failed}`
            ? Promise.reject(new Error('Unavailable'))
            : Promise.resolve(new Texture()),
        );
      const renderer = await makeRenderer();
      try {
        const data = staticDataWithTerrain();
        if (!data.terrain) throw new Error('Missing fixture terrain');
        data.terrain.mountainArtAssetId = 'test.peak';
        data.terrain.mountainMaterialAssetId = 'test.material';
        data.terrain.mountains = [
          {
            id: 'woodland',
            tier: 1,
            mass: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
              { x: 200, y: 200 },
            ],
            ridges: [
              [
                { x: 110, y: 110 },
                { x: 180, y: 160 },
              ],
            ],
          },
        ];
        renderer.setMapData(data);
        for (let i = 0; i < 30; i++) await Promise.resolve();
        const children = terrainPaintChildren(renderer);
        expect(children).toHaveLength(failed === 'material' ? 4 : 3);
        if (failed === 'material') expect(children.at(-1)!.children).toHaveLength(2);
        else expect(children.at(-1)!.children).toHaveLength(1); // procedural Graphics, no raster
      } finally {
        renderer.destroy();
        acquire.mockRestore();
      }
    },
  );

  it('actual late woodland promises cannot attach to replaced or destroyed map generations', async () => {
    const waits: Array<(texture: Texture) => void> = [];
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id === 'test.material'
          ? new Promise<Texture>((resolve) => waits.push(resolve))
          : Promise.resolve(new Texture()),
      );
    const renderer = await makeRenderer();
    const data = staticDataWithTerrain();
    if (!data.terrain) throw new Error('Missing fixture terrain');
    data.terrain.mountainArtAssetId = 'test.peak';
    data.terrain.mountainMaterialAssetId = 'test.material';
    data.terrain.mountains = [
      {
        id: 'woodland',
        tier: 1,
        mass: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ],
        ridges: [
          [
            { x: 110, y: 110 },
            { x: 180, y: 160 },
          ],
        ],
      },
    ];
    try {
      renderer.setMapData(data);
      const layers = renderer.getLayers()!;
      renderer.setMapData(staticData()); // real map replacement removes the old terrain
      const attach = vi.spyOn(layers.terrainBase, 'addChild');
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
      expectBankOnlyGround(renderer);
      renderer.setMapData(data);
      renderer.destroy();
      attach.mockClear();
      waits.shift()!(new Texture());
      for (let i = 0; i < 30; i++) await Promise.resolve();
      expect(attach).not.toHaveBeenCalled();
    } finally {
      renderer.destroy();
      acquire.mockRestore();
    }
  });

  it('optional raster failure preserves the static vector and both independent ground assets', async () => {
    const acquire = vi
      .spyOn(MapAssetLoader.prototype, 'acquire')
      .mockImplementation((id) =>
        id === 'texture.terrain.missing-art'
          ? Promise.reject(new Error('Controlled absent raster'))
          : Promise.resolve(new Texture()),
      );
    const data = staticDataWithTerrain();
    if (!data.terrain) throw new Error('Missing fixture terrain');
    data.terrain.mountainArtAssetId = 'texture.terrain.missing-art';
    data.terrain.mountains = [
      {
        id: 'test',
        tier: 1,
        mass: [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ],
        ridges: [],
      },
    ];
    const renderer = await makeRenderer();
    renderer.setMapData(data);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(terrainPaintChildren(renderer)).toHaveLength(3);
    renderer.destroy();
    acquire.mockRestore();
  });

  it.each(['mountain', 'forest'])(
    'a failed %s artwork does not suppress the other raster',
    async (failed) => {
      const acquire = vi.spyOn(MapAssetLoader.prototype, 'acquire').mockImplementation((id) => {
        if (id === `test.${failed}`) return Promise.reject(new Error('Artwork unavailable'));
        return Promise.resolve(new Texture());
      });
      const data = staticDataWithTerrain();
      if (!data.terrain) throw new Error('Missing fixture terrain');
      data.terrain.mountainArtAssetId = 'test.mountain';
      data.terrain.forestArtAssetId = 'test.forest';
      data.terrain.mountains = [
        {
          id: 'mountain',
          tier: 1,
          mass: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
          ],
          ridges: [],
        },
      ];
      data.terrain.forests = [
        {
          id: 'forest',
          polygon: [
            { x: 100, y: 100 },
            { x: 200, y: 100 },
            { x: 200, y: 200 },
          ],
        },
      ];
      const renderer = await makeRenderer();
      renderer.setMapData(data);
      for (let i = 0; i < 30; i++) await Promise.resolve();
      const children = terrainPaintChildren(renderer);
      expect(children).toHaveLength(4);
      expect(children.at(-1)?.children).toHaveLength(2);
      renderer.updateView(baseView({ day: 2 }));
      expect(terrainPaintChildren(renderer)).toEqual(children);
      renderer.destroy();
      acquire.mockRestore();
    },
  );
  /** territory 為最後建立之 BufferImageSource（每次 buildTerritoryLayer 建新 source）。 */
  const currentSource = (): { updateCalls: number; destroyed: boolean } => {
    const src = hoisted.bufferSources.at(-1);
    if (src === undefined) throw new Error('尚無 territory BufferImageSource');
    return src;
  };

  it('setMapData＋首 updateView：territory 有 1 sprite child、首幀著色已呼叫 source.update', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));

    expect(r.getLayers()!.territory.children.length).toBe(1); // territory Sprite 掛上
    expect(currentSource().updateCalls).toBeGreaterThanOrEqual(1); // 首幀著色（build 當下）+ 首 updateView
    // 首幀著色不動 rebuildCounts（territory 計數僅由 applyOwnerDirty dirty 訊號驅動）。
    expect(r.getRebuildCounts().territory).toBe(1);

    r.destroy();
  });

  it('翻轉一郡 owner：territory 計數 +1、source.update 再 +1（recolor 每幀至多一次）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();
    const src = currentSource();
    const updatesBefore = src.updateCalls;

    r.updateView(baseView({ districtOwner: { 'dist.x': 'clan.imagawa' } }));

    expect(r.getRebuildCounts().territory).toBe(baseline.territory + 1);
    expect(src.updateCalls).toBe(updatesBefore + 1);

    r.destroy();
  });

  it('僅 day 變：territory 計數不增、source.update 不再呼叫（連續 30 日零增量）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData());
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    const src = currentSource();
    const updatesBefore = src.updateCalls;

    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));

    expect(r.getRebuildCounts().territory).toBe(baseline.territory);
    expect(src.updateCalls).toBe(updatesBefore);

    r.destroy();
  });

  it('無 terrain pack：territory 仍建（sprite 存在）、waterFeatures／terrainBase 空、不崩', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData()); // 無 terrain
    r.updateView(baseView());

    const layers = r.getLayers()!;
    expect(layers.territory.children.length).toBe(1); // territory 與 terrain pack 無關
    expect(layers.waterFeatures.children.length).toBe(0); // 無 river/lake → 無 container
    expect(terrainPaintChildren(r)).toHaveLength(0); // Coast bank remains; no terrain paint is loaded.
    expect(r.getDiagnostics().resources.ownedCoastTextures).toBe(1);

    r.destroy();
  });
});

describe('地形/水系正向存在（M6-V5 §8.2，M2 處置）——堵靜默退回平面圖漏洞', () => {
  it('帶 terrain pack：terrainBase 掛 relief＋forest 2 child、waterFeatures container 非空（4 Graphics）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticDataWithTerrain());
    r.updateView(baseView());
    // loadTerrainTextures 之 mock Assets.load 同步 resolve；等一個 macrotask 讓 async IIFE attach sprite。
    await new Promise((res) => setTimeout(res, 0));

    const layers = r.getLayers()!;
    expect(terrainPaintChildren(r).length).toBe(2); // relief + forest remain inside display clip
    expect(layers.waterFeatures.children.length).toBe(1); // waterFeatures container
    expect(layers.waterFeatures.children[0]!.children.length).toBe(4); // lake + river×3 class Graphics

    r.destroy();
  });

  it('app 序回歸（Blocker 1）：setMapData→updateView→await init，init 後 territory 有 sprite＋首幀著色已跑', async () => {
    const r = new MapRenderer();
    // 實機 effect 序：init(async 未 resolve)→setMapData(initialized===false)→updateView(early-return)。
    r.setMapData(staticData()); // 僅存 staticData
    r.updateView(baseView()); // 僅存 view（early-return）
    await r.init(document.createElement('div'), vi.fn()); // init 內 reconstructTerrainLayers 建 territory

    const layers = r.getLayers()!;
    expect(layers.territory.children.length).toBe(1); // Blocker 1：init 亦建 territory（非只 setMapData 分支）
    expect(hoisted.bufferSources.at(-1)!.updateCalls).toBeGreaterThanOrEqual(1); // Blocker 2：首幀著色已跑

    r.destroy();
  });
});

describe('地形載入失敗與 teardown（M6-V5 §5.1 VD6 優雅退回／§8.2 對稱 destroy）', () => {
  /** reliefAssetId 於 manifest 查無 → loader.acquire reject → loadTerrainTextures catch 退回平面。 */
  function terrainWithBadRelief(): MapStaticData {
    return staticDataWithTerrain({
      terrain: {
        reliefAssetId: 'texture.terrain.relief.__missing__', // manifest 查無 → acquire reject
        forestAssetId: 'texture.terrain.forest@1x',
        rivers: [
          {
            id: 'rv.test',
            points: [
              { x: 100, y: 100 },
              { x: 150, y: 150 },
            ],
            widthClass: 3,
          },
        ],
        lakes: [],
      },
    });
  }

  it('relief acquire reject：仍保留獨立 forest，不丟例外、idle gate 於 finally 重置', async () => {
    const r = await makeRenderer();
    r.setMapData(terrainWithBadRelief());
    r.updateView(baseView());
    // 等一個 macrotask 讓 loadTerrainTextures 之 async IIFE 走完 reject→catch→finally。
    await new Promise((res) => setTimeout(res, 0));

    const layers = r.getLayers()!;
    // (b) 退回平面：relief/forest 皆未掛（seaBackground fallback 生效）；renderer 仍可用。
    expect(layers.terrainBase.children.length).toBe(1);
    expect(layers.territory.children.length).toBe(1); // territory 與 terrain 無關，照常建

    // (c) idle gate 已於 finally 重置（terrainTexturesPending=false）：註冊 waiter＋推進一幀應 resolve；
    //     若失敗路徑漏掉 finally，advanceIdleWaiters 會永久 early-return，waiter 永不 resolve（e2e 懸掛）。
    let resolved = false;
    const p = r.waitForIdleFrames(1).then(() => {
      resolved = true;
    });
    (r.getApp()!.ticker as unknown as { tick: () => void }).tick();
    await p;
    expect(resolved).toBe(true);

    r.destroy();
  });

  it('setMapData(null) teardown：territory/waterFeatures/terrainBase 清空、自持 source/texture 對稱 destroy、不丟例外', async () => {
    const r = await makeRenderer();
    r.setMapData(staticDataWithTerrain());
    r.updateView(baseView());
    await new Promise((res) => setTimeout(res, 0)); // relief/forest attach

    const layers = r.getLayers()!;
    expect(terrainPaintChildren(r).length).toBe(2); // 前置：relief+forest 已掛
    expect(layers.waterFeatures.children.length).toBe(1);
    expect(layers.territory.children.length).toBe(1);

    // Identify the actual territory Sprite's owner, not the last buffer allocation (lakes also own buffers).
    const territorySource = (layers.territory.children[0] as Sprite).texture.source;
    expect(territorySource.destroyed).toBe(false);
    const destroyedTexturesBefore = hoisted.textures.filter((t) => t.destroyed).length;

    // data===null → reconstructTerrainLayers 內部見 null 即清空並 destroy 自持資源。
    expect(() => r.setMapData(null)).not.toThrow();
    await new Promise((res) => setTimeout(res, 0));

    expect(layers.territory.children.length).toBe(0);
    expect(layers.waterFeatures.children.length).toBe(0);
    expect(layers.terrainBase.children.length).toBe(0);
    // 自持 territory BufferImageSource＋Texture 對稱 destroy（relief/forest 共享 texture 不隨之 destroy）。
    expect(territorySource.destroyed).toBe(true);
    expect(hoisted.textures.filter((t) => t.destroyed).length).toBeGreaterThan(
      destroyedTexturesBefore,
    );

    r.destroy();
  });
});

// ── M6-V6：roads／道路名／橋樑／選取高亮（設計 §8.2） ──────────────────────────
//
// mock 手法：共用 pixiMock 之 Graphics 不記錄呼叫，但可 `vi.spyOn(gfx, 'clear'|'stroke')` 觀測
// RoadsLayer per-stage 重描（clear）與選取高亮重畫（stroke）。RoadsLayer 掛為 `layers.roads` 之
// 唯一 child（container），其 5 個具名 tier 依 addChild 序 [sea,path,bridge,minor,arterial]。
// roadHighlight container 為 `layers.selectionAndPath.children[0]`（掛於 pathPreview 之前），其
// 內單一 Graphics 承接金色高亮描繪。

interface MockGfx {
  visible: boolean;
  children: MockGfx[];
  clear(): unknown;
  stroke(): unknown;
}

/** castle.a(100,100)—dist.x(200,100)—castle.b(300,100)：road.a-x 為 grade-3 主幹道（含 name／waypoints／bridge）。 */
function arterialGraph(): ReturnType<typeof buildMapGraph> {
  const castles = {
    'castle.a': { id: 'castle.a' as CastleId, pos: { x: 100, y: 100 } },
    'castle.b': { id: 'castle.b' as CastleId, pos: { x: 300, y: 100 } },
  } as unknown as Parameters<typeof buildMapGraph>[0];
  const districts = {
    'dist.x': {
      id: 'dist.x' as DistrictId,
      pos: { x: 200, y: 100 },
      isPort: false,
      castleId: 'castle.a' as CastleId,
    },
  } as unknown as Parameters<typeof buildMapGraph>[1];
  const road = (id: string, a: string, b: string, grade: 1 | 2 | 3): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type: 'land',
    grade,
    baseDays: 2,
  });
  const roads = {
    'road.a-x': road('road.a-x', 'castle.a', 'dist.x', 3), // 主幹道（arterial）
    'road.x-b': road('road.x-b', 'dist.x', 'castle.b', 1), // 小路
  } as unknown as Parameters<typeof buildMapGraph>[2];
  const roadDisplay = {
    'road.a-x': { name: '東海道', waypoints: [150, 110], bridges: [150, 110] },
  };
  return buildMapGraph(castles, districts, roads, roadDisplay);
}

/** RoadsLayer container 之 5 具名 tier（addChild 序：sea/path/minor/arterial/bridge）。 */
function roadsTiers(r: MapRenderer): {
  container: MockGfx;
  sea: MockGfx;
  path: MockGfx;
  bridge: MockGfx;
  minor: MockGfx;
  arterial: MockGfx;
} {
  const container = r.getLayers()!.roads.children[0] as unknown as MockGfx;
  const c = container.children;
  return {
    container,
    sea: c[0]!,
    path: c[1]!,
    bridge: c[4]!,
    minor: c[2]!,
    arterial: c[3]!,
  };
}

describe('roads／道路名／橋樑／選取高亮（M6-V6，設計 §8.2）', () => {
  it('靜態建構＋正向存在：roads 單一 container（5 tier）、labels 含 road:<edgeId>（東海道）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    const layers = r.getLayers()!;
    expect(layers.roads.children.length).toBe(1); // RoadsLayer 子容器（V6D2）
    expect(roadsTiers(r).container.children.length).toBe(5); // sea/path/bridge/minor/arterial

    // M6-V9（§2.1）：labels.children 為 per-label container（pixel-lock），BitmapText 為其 children[0]。
    const labelTexts = (
      layers.labels.children as unknown as { children: { text?: string }[] }[]
    ).map((c) => c.children[0]?.text);
    expect(labelTexts).toContain('東海道'); // 道路名標籤已建（堵靜默無名）

    r.destroy();
  });

  it('roads 靜態化＋setStage 不動計數：僅 day 變（stage 不變）連跑 30 日，roads/labels 零增量、arterial 不重描', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));
    const baseline = r.getRebuildCounts();
    expect(baseline.roads).toBe(1);
    expect(baseline.labels).toBe(1); // 唯一道路名（東海道）；本 graph 未提供 node names

    const clearSpy = vi.spyOn(roadsTiers(r).arterial, 'clear');
    for (let i = 0; i < 30; i += 1) r.updateView(baseView({ day: 2 + i }));

    expect(clearSpy).not.toHaveBeenCalled(); // stage 未變 → setStage 早退（零重描）
    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位整物件不變

    r.destroy();
  });

  it('far 保留主幹道＋海路（tier 能見度矩陣）；near→far 之 stage 轉場觸發一次重描、不動 roads 計數', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near：全 tier 顯
    const tiers = roadsTiers(r);
    expect(tiers.path.visible).toBe(true); // 小路 near 顯
    const roadsBefore = r.getRebuildCounts().roads;

    const clearSpy = vi.spyOn(tiers.arterial, 'clear');
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far

    expect(tiers.arterial.visible).toBe(true); // 主幹道 far 保留（DoD 核心）
    expect(tiers.sea.visible).toBe(true); // 海路 far 保留
    expect(tiers.minor.visible).toBe(false); // 次道 far 隱
    expect(tiers.path.visible).toBe(false); // 小路 far 隱
    expect(tiers.bridge.visible).toBe(false); // 橋樑 far 隱
    expect(clearSpy).toHaveBeenCalledTimes(1); // near→far：per-stage 倍率重描一次
    expect(r.getRebuildCounts().roads).toBe(roadsBefore); // 重描為 LOD 轉場，不動 rebuildCounts

    r.destroy();
  });

  it('道路名標籤：深墨色與薄暖描邊的次層級＋near-only LOD（04 §3.10.3）', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 }));

    // M6-V9（§2.1）：labels.children 為 per-label container；顯隱切於 container、字樣式在 children[0]。
    const labels = r.getLayers()!.labels.children as unknown as {
      visible: boolean;
      children: {
        text?: string;
        style?: { fill?: number; stroke?: { color: number; width: number } };
      }[];
    }[];
    const roadLabel = labels.find((c) => c.children[0]?.text === '東海道');
    expect(roadLabel).toBeDefined();
    // Redesign preserves dark ink, not white glyph fill, and narrows the warm halo.
    expect(roadLabel!.children[0]!.style?.fill).toBe(TOKENS_NUM.ink900);
    expect(roadLabel!.children[0]!.style?.stroke).toMatchObject({
      color: TOKENS_NUM.washi300,
      width: 1.5,
    });

    // near-only（04 §3.10.3）：near 顯、mid／far 隱（label 位於 (150,110) 附近，三 pose 皆在視域內，
    // 差異純由 LOD detail 閘控，非 culling）。setCameraPose 以 lodStageForScale 決定論設段。
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near（scale>=1.0）
    expect(roadLabel!.visible).toBe(true);
    r.setCameraPose({ x: 200, y: 100 }, 0.75); // mid（0.5<=scale<1.0）
    expect(roadLabel!.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far（scale<0.5）
    expect(roadLabel!.visible).toBe(false);

    r.destroy();
  });

  it('選取高亮 dirty：node 選取→重畫；day-only→不重畫；graph swap 後同選取仍重算；rebuildCounts 全程不變', async () => {
    const r = await makeRenderer();
    r.setMapData(staticData({ graph: arterialGraph() }));
    r.updateView(baseView({ day: 1 })); // selection null → 不觸發高亮
    const baseline = r.getRebuildCounts();

    // roadHighlight container = selectionAndPath.children[0]，其內單一 Graphics。
    const highlightGfx = (r.getLayers()!.selectionAndPath.children[0] as unknown as MockGfx)
      .children[0]!;
    const strokeSpy = vi.spyOn(highlightGfx, 'stroke');

    // null → 選取 castle.a（node）：相鄰道路（road.a-x）重畫；選取高亮為動態層，零計數增量。
    r.updateView(baseView({ day: 2, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).toHaveBeenCalled();
    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 5 欄位不變（高亮不動計數）

    // day-only（選取不變）：不重畫、計數仍不變。
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 3, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).not.toHaveBeenCalled();
    expect(r.getRebuildCounts()).toEqual(baseline);

    // graph swap（非 null setMapData）→ prevSelectionKey 重設；同選取下次 updateView 仍重算。
    r.setMapData(staticData({ graph: arterialGraph() }));
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 4, selection: { kind: 'node', id: 'castle.a' } }));
    expect(strokeSpy).toHaveBeenCalled(); // 陳舊高亮杜絕：prevSelectionKey 已重設 → 重算
    expect(r.getRebuildCounts().roads).toBe(baseline.roads + 1); // 靜態重建 +1（高亮本身仍不動計數）

    // graph swap 後新選取為 null：swap 當下即清舊高亮（clear），不得依賴 selKey diff
    //（null===null 不觸發 update）而殘留舊圖 gold strokes（M6-V6 review：stale-strokes gap）。
    const clearSpy = vi.spyOn(highlightGfx, 'clear');
    r.setMapData(staticData({ graph: arterialGraph() }));
    expect(clearSpy).toHaveBeenCalled(); // swap 當下鏡像 data===null 分支之 update(null)
    clearSpy.mockClear();
    strokeSpy.mockClear();
    r.updateView(baseView({ day: 5, selection: null }));
    expect(strokeSpy).not.toHaveBeenCalled(); // null 選取不重畫（且無殘留可言）

    r.destroy();
  });
});

// ── M6-V9b：城名牌（docs/design/m6-v9b-map-plates.md §7-S1 硬 DoD）──────────────────
//
// 名牌走**名牌專屬簽章**（buildNameplateSig 含 soldiers/relation/isPlayer/name）＋獨立
// prevNameplateSig 快取＋第二 diff loop（§2.9，評審 Blocker 1）；建/毀計入新增
// rebuildCounts.nameplates（與 labels 分離），冪等 update／pixel-lock／declutter 不計數。
// nameplates 層 children＝[castle.a, castle.b]（node 迴圈依 id 字典序建立）；名牌 container
// 4 子節點 [gfx, nameText, troopsText, highlightGfx]（castleNameplate.ts 工廠註解）。

function nameplateStaticData(): MapStaticData {
  return staticData({
    castleTier: { 'castle.a': 'main', 'castle.b': 'main' },
    names: { 'castle.a': '甲城', 'castle.b': '乙城', 'dist.x': '丙郡', 'prov.p': '丁國' },
    provinceLabelPos: { 'prov.p': { x: 250, y: 50 } },
  });
}

it('caches emitted town world extrema once and retains exact projected goals across lifecycle changes', async () => {
  const r = await makeRenderer();
  const h = r as unknown as {
    settlements: {
      container: Container;
      getGeometry(): {
        houses: { roofs: { x: number; y: number }[][]; walls: { x: number; y: number }[][] }[];
      };
    } | null;
    settlementModelBounds: readonly { minX: number; minY: number; maxX: number; maxY: number }[];
    castleRibbonInputs(): {
      townContent: { x: number; y: number; width: number; height: number }[];
    };
  };
  try {
    r.setMapData(nameplateStaticData());
    r.setCameraPose({ x: 200, y: 100 }, 1.25);
    const owner = h.settlements!;
    const houses = owner.getGeometry().houses;
    expect(houses.length).toBeGreaterThan(0);
    const extrema = houses.map((house) => {
      const points = [...house.roofs.flat(), ...house.walls.flat()];
      return {
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
      };
    });
    expect(h.settlementModelBounds).toEqual(extrema);
    expect(Object.isFrozen(h.settlementModelBounds)).toBe(true);
    expect(h.settlementModelBounds.every(Object.isFrozen)).toBe(true);
    const read = vi.spyOn(owner, 'getGeometry');
    const before = h.castleRibbonInputs().townContent;
    expect(before.length).toBeGreaterThan(0);
    for (const rect of before)
      expect(
        extrema.some(
          (b) =>
            rect.x === b.minX * 1.25 &&
            rect.y === b.minY * 1.25 &&
            rect.width === b.maxX * 1.25 - b.minX * 1.25 &&
            rect.height === b.maxY * 1.25 - b.minY * 1.25,
        ),
      ).toBe(true);
    expect(h.castleRibbonInputs().townContent).toEqual(before);
    expect(read).not.toHaveBeenCalled();
    const cache = h.settlementModelBounds;
    r.setMapData(nameplateStaticData());
    expect(h.settlementModelBounds).not.toBe(cache);
    expect(h.settlementModelBounds).toEqual(extrema);
    r.setMapData(null);
    expect(h.settlementModelBounds).toEqual([]);
    expect(h.castleRibbonInputs().townContent).toEqual([]);
    r.setMapData(nameplateStaticData());
    expect(h.settlementModelBounds.length).toBeGreaterThan(0);
    r.destroy();
    expect(h.settlementModelBounds).toEqual([]);
  } finally {
    r.destroy();
  }
});

it('retains one original layout across contained paint and full-detail interaction modes', async () => {
  const r = await makeRenderer();
  const h = r as unknown as {
    castleRibbonSeedOffsets: Map<string, { x: number; y: number }>;
    emit(event: { type: 'nodeHover'; id: string } | { type: 'hoverEnd' }): void;
    nameplateParts: Map<
      string,
      {
        part: {
          getPaintBounds(): { x: number; y: number; width: number; height: number };
          getOriginalPresentationGeometry(): {
            paint: { x: number; y: number; width: number; height: number };
          };
          container: Container;
        };
      }
    >;
  };
  try {
    r.setMapData(nameplateStaticData());
    r.setCameraPose({ x: 200, y: 100 }, 1.25);
    r.updateView(baseView({ analysisMode: 'castleDefense' }));
    const full = r.getDiagnostics();
    const originalOffsets = full.castleRibbonLayout.ribbons.map(({ id, offset, leader }) => ({
      id,
      offset,
      leader,
    }));
    const seeds = [...h.castleRibbonSeedOffsets];
    const originalCastleProxies = full.armyPlateLayout.castles.map(({ id, rect }) => ({
      id,
      rect,
    }));
    const counts = r.getRebuildCounts();
    r.updateView(baseView());
    const compact = r.getDiagnostics();
    expect(
      compact.castleRibbonLayout.ribbons.map(({ id, offset, leader }) => ({ id, offset, leader })),
    ).toEqual(originalOffsets);
    expect([...h.castleRibbonSeedOffsets]).toEqual(seeds);
    expect(compact.armyPlateLayout.castles.map(({ id, rect }) => ({ id, rect }))).toEqual(
      originalCastleProxies,
    );
    for (const ribbon of compact.castleRibbonLayout.ribbons) {
      const before = full.castleRibbonLayout.ribbons.find(({ id }) => id === ribbon.id)!;
      expect(ribbon.rect.x).toBeGreaterThanOrEqual(before.rect.x);
      expect(ribbon.rect.y).toBeGreaterThanOrEqual(before.rect.y);
      expect(ribbon.rect.x + ribbon.rect.width).toBeLessThanOrEqual(
        before.rect.x + before.rect.width,
      );
      expect(ribbon.rect.y + ribbon.rect.height).toBeLessThanOrEqual(
        before.rect.y + before.rect.height,
      );
    }
    const a = h.nameplateParts.get('castle.a')!.part;
    expect(a.getPaintBounds().width).toBeLessThan(a.getOriginalPresentationGeometry().paint.width);
    h.emit({ type: 'nodeHover', id: 'castle.a' });
    r.getDiagnostics();
    expect(a.getPaintBounds()).toEqual(a.getOriginalPresentationGeometry().paint);
    h.emit({ type: 'hoverEnd' });
    r.getDiagnostics();
    expect(a.getPaintBounds().width).toBeLessThan(a.getOriginalPresentationGeometry().paint.width);
    for (const analysisMode of ['supply', 'faction', 'castleDefense'] as const) {
      r.updateView(baseView({ analysisMode }));
      r.getDiagnostics();
      for (const { part } of h.nameplateParts.values())
        expect(part.getPaintBounds()).toEqual(part.getOriginalPresentationGeometry().paint);
    }
    r.updateView(baseView());
    const normal = r.getDiagnostics();
    r.updateView(baseView({ day: 2 }));
    expect(r.getDiagnostics().castleRibbonLayout).toEqual(normal.castleRibbonLayout);
    expect(r.getRebuildCounts()).toEqual(counts);
  } finally {
    r.destroy();
  }
});

it('collects one fresh army snapshot per ribbon pass without changing observer signature shape', async () => {
  const r = await makeRenderer();
  const h = r as unknown as {
    armyPlateInputs(): unknown;
    castleRibbonInputs(snapshot?: unknown): unknown;
    castleRibbonLayoutSignature: string | null;
    placeCastleRibbons(): void;
  };
  try {
    r.setMapData(nameplateStaticData());
    r.setCameraPose({ x: 200, y: 100 }, 1.25);
    const snapshot = h.armyPlateInputs();
    const signature = JSON.stringify(h.castleRibbonInputs());
    expect(JSON.stringify(h.castleRibbonInputs(snapshot))).toBe(signature);
    const reads = vi.spyOn(h, 'armyPlateInputs');
    h.castleRibbonLayoutSignature = null;
    h.placeCastleRibbons();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(h.castleRibbonLayoutSignature).toBe(signature);
    reads.mockClear();
    h.placeCastleRibbons();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(h.castleRibbonLayoutSignature).toBe(signature);
    reads.mockClear();
    h.castleRibbonInputs();
    expect(reads).toHaveBeenCalledTimes(1);
    r.setCameraPose({ x: 240, y: 120 }, 1.5);
    const changed = JSON.stringify(h.castleRibbonInputs());
    expect(changed).not.toBe(signature);
    reads.mockClear();
    h.castleRibbonLayoutSignature = null;
    h.placeCastleRibbons();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(h.castleRibbonLayoutSignature).toBe(changed);
    r.setMapData(null);
    expect(h.castleRibbonInputs()).not.toEqual(JSON.parse(signature));
  } finally {
    r.destroy();
  }
});

/** 第 index 座名牌之繪製 Graphics（children[0]＝gfx；clear spy＝重繪觀測錨點）。 */
function nameplateGfx(r: MapRenderer, index: number): MockGfx {
  return (r.getLayers()!.nameplates.children[index] as unknown as MockGfx).children[0]!;
}

it('places visible geographic text around measured body bounds without drifting anchors or repeating idle work', async () => {
  const r = await makeRenderer();
  try {
    r.setMapData(nameplateStaticData());
    r.setCameraPose({ x: 200, y: 100 }, 1.25);
    const label = r.getLayers()!.labels.children.find((c) => c.label === 'label:district')!;
    const text = label.children[0]!;
    Object.defineProperty(text, 'getLocalBounds', {
      value: () => ({ x: -14, y: 0, width: 28, height: 14 }),
    });
    const view = baseView({
      armies: [{ ...paintedArmy(), id: 'army.geo', edgeT: 1 }],
    });
    r.updateView(view);
    const body = r.getLayers()!.armies.children[0]!.children.find((c) => c.label === 'armyBody')!;
    Object.defineProperty(body, 'getLocalBounds', {
      value: () => ({ x: -18, y: 0, width: 36, height: 35 }),
    });
    r.updateView({ ...view, day: 2 });
    const observed = r.getDiagnostics().geographicLabelLayout;
    expect(observed.labels).toHaveLength(1);
    const placed = observed.labels[0]!;
    const obstacle = observed.obstacles.find((o) => o.kind === 'armyBody')!;
    const overlap = (a: typeof placed.rect, b: typeof placed.rect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    expect(overlap(placed.baseline, obstacle.rect)).toBeGreaterThan(0);
    expect(overlap(placed.rect, obstacle.rect)).toBe(0);
    expect(Math.hypot(placed.offset.x, placed.offset.y)).toBeLessThanOrEqual(48);
    expect(label.position).toMatchObject({ x: 200, y: 100 });
    expect(text.position).toMatchObject({ x: placed.offset.x, y: 14 + placed.offset.y });
    const rebuilds = r.getRebuildCounts();
    r.updateView({ ...view, day: 3 });
    expect(r.getDiagnostics().geographicLabelLayout).toEqual(observed);
    expect(r.getRebuildCounts()).toEqual(rebuilds);
    r.panTo(210, 100);
    expect(r.getDiagnostics().geographicLabelLayout.runs).toBe(observed.runs);
    r.setCameraPose({ x: 210, y: 100 }, 1.5);
    expect(r.getDiagnostics().geographicLabelLayout.runs).toBeGreaterThan(observed.runs);
  } finally {
    r.destroy();
  }
});

it('reserves individual measured HUD and canvas edges without moving anchors or hiding labels', async () => {
  const r = await makeRenderer();
  try {
    r.setMapData(nameplateStaticData());
    r.setCameraPose({ x: 200, y: 100 }, 1.25);
    const label = r.getLayers()!.labels.children.find((part) => part.label === 'label:district')!;
    Object.defineProperty(label.children[0]!, 'getLocalBounds', {
      value: () => ({ x: -14, y: 0, width: 28, height: 14 }),
    });
    const view = baseView({ armies: [{ ...paintedArmy(), id: 'army.hud-geo', edgeT: 1 }] });
    r.updateView(view);
    const initial = r.getDiagnostics().geographicLabelLayout;
    const rects = [{ ...initial.labels[0]!.rect }, { x: 650, y: 450, width: 120, height: 120 }];
    const saved = structuredClone(rects);
    r.setScreenOcclusions(rects);
    const placed = r.getDiagnostics().geographicLabelLayout;
    expect(placed.labels.map((part) => part.id)).toEqual(initial.labels.map((part) => part.id));
    expect(placed.obstacles.filter((part) => part.kind === 'hud').map((part) => part.rect)).toEqual(
      saved,
    );
    expect(placed.obstacles.filter((part) => part.kind === 'canvasEdge')).toHaveLength(4);
    const area = (a: (typeof rects)[number], b: (typeof rects)[number]) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    for (const obstacle of placed.obstacles.filter(
      (part) => part.kind === 'hud' || part.kind === 'canvasEdge',
    ))
      expect(area(placed.labels[0]!.rect, obstacle.rect)).toBeLessThanOrEqual(
        area(placed.labels[0]!.baseline, obstacle.rect),
      );
    expect(placed.labels[0]!.anchor).toEqual(initial.labels[0]!.anchor);
    expect(label.position).toMatchObject({ x: 200, y: 100 });
    expect(label.visible).toBe(true);
    const runs = placed.runs;
    r.setScreenOcclusions([...saved].reverse());
    r.updateView({ ...view, day: 2 });
    expect(r.getDiagnostics().geographicLabelLayout.runs).toBe(runs);
    rects[0]!.x = -999;
    expect(
      r
        .getDiagnostics()
        .geographicLabelLayout.obstacles.filter((part) => part.kind === 'hud')
        .map((part) => part.rect),
    ).toEqual(saved);
    r.panTo(210, 100);
    expect(r.getDiagnostics().geographicLabelLayout.runs).toBeGreaterThan(runs);
    expect(
      r
        .getDiagnostics()
        .geographicLabelLayout.obstacles.filter((part) => part.kind === 'hud')
        .map((part) => part.rect),
    ).toEqual(saved);
    r.setScreenOcclusions([]);
    expect(
      r
        .getDiagnostics()
        .geographicLabelLayout.obstacles.some(
          (part) => part.kind === 'hud' || part.kind === 'canvasEdge',
        ),
    ).toBe(false);
    for (const rect of [
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: -1, height: 1 },
    ])
      expect(() => r.setScreenOcclusions([rect])).toThrow(RangeError);
  } finally {
    r.destroy();
  }
});

describe('geographic castle-component reservation: mocked bounds, not native pixel proof', () => {
  for (const kind of ['castleBody', 'castleDurability', 'castleWarning'] as const) {
    it(`reserves visible ${kind} without moving anchors, and omits hidden component layers`, async () => {
      const r = await makeRenderer();
      try {
        r.setMapData(nameplateStaticData());
        r.setCameraPose({ x: 200, y: 100 }, 1.25);
        const label = r.getLayers()!.labels.children.find((c) => c.label === 'label:district')!;
        Object.defineProperty(label.children[0]!, 'getLocalBounds', {
          value: () => ({ x: -14, y: 0, width: 28, height: 14 }),
        });
        const harness = r as unknown as {
          nodeParts: Map<string, { part: CastleNodePart }>;
        };
        const castle = harness.nodeParts.get('castle.a')!.part;
        const clear = { x: -10, y: -100, width: 20, height: 3 };
        const collision = { x: 90, y: 14, width: 20, height: 10 };
        vi.spyOn(castle, 'getPresentationGeometry').mockReturnValue({
          painted: true,
          body: kind === 'castleBody' ? collision : clear,
          durability: kind === 'castleDurability' ? collision : clear,
          warning: kind === 'castleWarning' ? collision : null,
        });
        vi.spyOn(castle, 'durabilityVisible', 'get').mockReturnValue(true);
        vi.spyOn(castle, 'warningVisible', 'get').mockReturnValue(kind === 'castleWarning');
        const view = baseView();
        r.updateView(view);
        const observed = r.getDiagnostics().geographicLabelLayout;
        const component = observed.obstacles.find(
          (o) => String(o.kind) === kind && o.id === 'castle.a',
        );
        expect(
          component,
          'actual castle component must enter geographic reservation',
        ).toBeDefined();
        const placed = observed.labels[0]!;
        const area = (a: typeof placed.rect, b: typeof placed.rect) =>
          Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
          Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        expect(area(placed.baseline, component!.rect)).toBeGreaterThan(0);
        expect(area(placed.rect, component!.rect)).toBe(0);
        expect(label.position).toMatchObject({ x: 200, y: 100 });
        expect(Math.hypot(placed.offset.x, placed.offset.y)).toBeLessThanOrEqual(48);
        r.updateView({ ...view, day: 2 });
        expect(r.getDiagnostics().geographicLabelLayout).toEqual(observed);
        const layer = kind === 'castleBody' ? r.getLayers()!.actorBodies : r.getLayers()!.effects;
        layer.visible = false;
        r.updateView({ ...view, day: 3 });
        expect(
          r.getDiagnostics().geographicLabelLayout.obstacles.some((o) => String(o.kind) === kind),
        ).toBe(false);
      } finally {
        r.destroy();
      }
    });
  }
});

describe('army signal input-cap admission: mocked Pixi, not native pixel proof', () => {
  for (const [name, count, obstacleCount] of [
    ['257 painted candidates', 257, 0],
    ['1025 fixed obstacles', 1, 1025],
  ] as const) {
    it(`retains every banner at baseline without throwing for ${name}`, async () => {
      const r = await makeRenderer();
      const bounds = { x: 0, y: -24, width: 12, height: 24 };
      const parts = new Map(
        Array.from({ length: count }, (_, index) => {
          const id = `army.cap-${index}`;
          return [
            id,
            {
              container: {
                visible: true,
                position: { x: index * 40, y: 100 },
                scale: { x: 1, y: 1 },
              },
              getPaintedProfile: () => ({ painted: true, signalBaselineBounds: bounds }),
              setSignalOffset: vi.fn<(offset: { x: number; y: number }) => void>(),
            },
          ] as const;
        }),
      );
      // Isolate renderer admission from stack/culling rules. These are finite measured
      // visible parts, not an injected core state or a native workload claim.
      const harness = r as unknown as {
        armyParts: typeof parts;
        view: MapViewState;
        armyPlateInputs(): {
          scale: number;
          candidates: [];
          castles: { rect: typeof bounds }[];
          castleBodies: [];
          foregroundBodies: [];
        };
        placeArmySignals(): void;
      };
      const originalParts = harness.armyParts;
      const originalView = harness.view;
      const inputs = vi.spyOn(harness, 'armyPlateInputs').mockReturnValue({
        scale: 1,
        candidates: [],
        castles: Array.from({ length: obstacleCount }, () => ({ rect: { ...bounds } })),
        castleBodies: [],
        foregroundBodies: [],
      });
      try {
        harness.armyParts = parts;
        harness.view = baseView({
          armies: [...parts.keys()].map((id) => ({ ...paintedArmy(), id, selected: false })),
        });
        expect(() => harness.placeArmySignals()).not.toThrow();
        for (const part of parts.values()) {
          expect(part.setSignalOffset).toHaveBeenCalledTimes(1);
          expect(part.setSignalOffset).toHaveBeenCalledWith({ x: 0, y: 0 });
        }
        expect(() => harness.placeArmySignals()).not.toThrow();
        for (const part of parts.values()) expect(part.setSignalOffset).toHaveBeenCalledTimes(1);
      } finally {
        harness.armyParts = originalParts;
        harness.view = originalView;
        inputs.mockRestore();
        r.destroy();
      }
    });
  }
});

describe('army plate placement consumer: mocked Pixi, not native pixel proof', () => {
  function armyPair(): MapViewState['armies'] {
    return ['army.plate-a', 'army.plate-b'].map((id, index) => ({
      ...paintedArmy(),
      id,
      selected: index === 0,
      fromNode: 'castle.a' as CastleId,
      toNode: null,
      edgeT: 0,
    }));
  }
  function overlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): number {
    return (
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
    );
  }
  it('consumes measured signal bounds with camera scale, preserves anchors and reuses idle placement', async () => {
    const r = await makeRenderer();
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: armyPair() });
      r.updateView(view);
      const chip = r.getLayers()!.armies.children.at(-1)!; // selected army re-appends its semantic container
      const signals = chip.children.find((child) => child.label === 'armyBody')!.children[0]!;
      Object.defineProperty(signals, 'getLocalBounds', {
        value: () => ({ x: 8, y: -4, width: 18, height: 20 }),
      });
      const anchor = { x: chip.position.x, y: chip.position.y };
      const hit = chip.hitArea;
      r.updateView({ ...view, day: 2 });
      const observed = r.getDiagnostics().armyPlateLayout;
      const signal = r
        .getDiagnostics()
        .armyRendering.signals.find((entry) => entry.id === 'army.plate-a')!;
      expect(
        observed.foregroundBodies.find(
          (entry) => entry.id === 'army.plate-a' && entry.kind === 'signal',
        )?.rect,
      ).toEqual(signal.rect);
      expect(signal.rect?.width).toBeCloseTo(18 * 1.25);
      expect(signal.rect?.height).toBeCloseTo(20 * 1.25);
      for (const plate of observed.plates) {
        const area = (rect: typeof plate.rect, bodies: typeof observed.foregroundBodies) =>
          bodies.reduce((sum, body) => sum + overlap(rect, body.rect), 0);
        const castleArea = (rect: typeof plate.rect) =>
          observed.castleBodies.reduce((sum, body) => sum + overlap(rect, body.rect), 0);
        expect(castleArea(plate.rect)).toBeLessThanOrEqual(castleArea(plate.baseline));
        if (castleArea(plate.rect) === castleArea(plate.baseline))
          expect(area(plate.rect, observed.foregroundBodies)).toBeLessThanOrEqual(
            area(plate.baseline, observed.foregroundBodies),
          );
        expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(48);
      }
      expect(chip.position).toMatchObject(anchor);
      expect(chip.hitArea).toBe(hit);
      r.updateView({ ...view, day: 3 });
      expect(r.getDiagnostics().armyPlateLayout).toEqual(observed);
      r.panTo(210, 100);
      expect(r.getDiagnostics().armyPlateLayout.runs).toBe(observed.runs);
      r.updateView(baseView());
      expect(r.getDiagnostics().armyPlateLayout.foregroundBodies).toEqual([]);
    } finally {
      r.destroy();
    }
  });
  it('protects final independent army seed slots from displaced ribbons without day-only churn', async () => {
    const r = await makeRenderer();
    const hit = vi.spyOn(MapInteraction.prototype, 'setArmies');
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: armyPair() });
      const input = JSON.stringify(view);
      r.updateView(view);
      const observed = r.getDiagnostics();
      const seeds = observed.castleRibbonLayout.obstacles.filter(
        (obstacle) => obstacle.kind === 'armyPlateSeed',
      );
      expect(seeds).toHaveLength(2);
      expect(seeds.map(({ id, rect }) => ({ id, rect }))).toEqual(
        observed.armyPlateLayout.plates.map(({ id, rect }) => ({ id, rect })),
      );
      for (const ribbon of observed.castleRibbonLayout.ribbons)
        for (const seed of seeds)
          expect(overlap(ribbon.rect, seed.rect)).toBeLessThanOrEqual(
            overlap(ribbon.baseline, seed.rect),
          );
      const hitAnchors = hit.mock.calls.at(-1)![0];
      expect(hitAnchors).toEqual([
        { id: 'army.plate-a', pos: { x: 100, y: 100 } },
        { id: 'army.plate-b', pos: { x: 114, y: 100 } },
      ]);
      r.updateView({ ...view, day: view.day + 1 });
      const repeated = r.getDiagnostics();
      expect(repeated.castleRibbonLayout).toEqual(observed.castleRibbonLayout);
      expect(repeated.armyPlateLayout).toEqual(observed.armyPlateLayout);
      expect(repeated.armyRendering.signals).toEqual(observed.armyRendering.signals);
      expect(hit.mock.calls.at(-1)![0]).toEqual(hitAnchors);
      expect(JSON.stringify(view)).toBe(input);
    } finally {
      hit.mockRestore();
      r.destroy();
    }
  });
  it('reserves displaced castle ribbons and preserves army hit anchors', async () => {
    const r = await makeRenderer();
    const hit = vi.spyOn(MapInteraction.prototype, 'setArmies');
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: armyPair() });
      const original = JSON.stringify(view);
      r.updateView(view);
      const diagnostics = r.getDiagnostics();
      const { plates, castles } = diagnostics.armyPlateLayout;
      const originalCastles = castles.map((castle) => {
        const ribbon = diagnostics.castleRibbonLayout.ribbons.find(
          (entry) => entry.id === castle.id,
        )!;
        expect(ribbon).toBeDefined();
        return {
          ...castle.rect,
          x: castle.rect.x - ribbon.offset.x,
          y: castle.rect.y - ribbon.offset.y,
        };
      });
      expect(plates).toHaveLength(2);
      expect(castles.length).toBeGreaterThan(0);
      const before = plates.reduce(
        (sum, p) => sum + originalCastles.reduce((s, c) => s + overlap(p.baseline, c), 0),
        0,
      );
      const after = plates.reduce(
        (sum, p) => sum + castles.reduce((s, c) => s + overlap(p.rect, c.rect), 0),
        0,
      );
      expect(before).toBeGreaterThan(0);
      expect(after).toBe(0);
      const displaced = diagnostics.castleRibbonLayout.ribbons.filter(
        (ribbon) => Math.hypot(ribbon.offset.x, ribbon.offset.y) > 0,
      );
      expect(displaced.length).toBeGreaterThan(0);
      for (const ribbon of displaced) {
        expect(ribbon.rect.x).toBeCloseTo(ribbon.baseline.x + ribbon.offset.x);
        expect(ribbon.rect.y).toBeCloseTo(ribbon.baseline.y + ribbon.offset.y);
      }
      expect(hit.mock.calls.at(-1)![0]).toEqual([
        { id: 'army.plate-a', pos: { x: 100, y: 100 } },
        { id: 'army.plate-b', pos: { x: 114, y: 100 } },
      ]);
      for (const p of plates) expect(Math.hypot(p.offset.x, p.offset.y)).toBeLessThanOrEqual(48);
      expect(JSON.stringify(view)).toBe(original);
    } finally {
      r.destroy();
      hit.mockRestore();
    }
  });
  it('reuses a placement on day-only ticks and pan, recomputes changed scale and ribbon width', async () => {
    const r = await makeRenderer();
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: armyPair() });
      r.updateView(view);
      const before = r.getDiagnostics().armyPlateLayout;
      const redraw = r.getRebuildCounts().armyChips;
      r.updateView({ ...view, day: 2 });
      expect(r.getDiagnostics().armyPlateLayout).toEqual(before);
      expect(r.getRebuildCounts().armyChips).toBe(redraw);
      r.panTo(210, 100);
      expect(r.getDiagnostics().armyPlateLayout.runs).toBe(before.runs);
      r.setCameraPose({ x: 210, y: 100 }, 1.5);
      const scaled = r.getDiagnostics().armyPlateLayout;
      expect(scaled.runs).toBeGreaterThan(before.runs);
      r.updateView({ ...view, castles: view.castles.map((c) => ({ ...c, soldiers: 99999999 })) });
      expect(r.getDiagnostics().armyPlateLayout.runs).toBeGreaterThan(scaled.runs);
    } finally {
      r.destroy();
    }
  });
  it('pixel-locks only number plates across real camera scales without rebuilding army bodies', async () => {
    const r = await makeRenderer();
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      r.updateView(baseView({ armies: armyPair() }));
      const before = r.getDiagnostics().armyPlateLayout;
      const redraw = r.getRebuildCounts().armyChips;
      for (const plate of before.plates) expect(plate.fontSizeCss).toBeCloseTo(14);
      r.setCameraPose({ x: 200, y: 100 }, 1.5);
      const after = r.getDiagnostics().armyPlateLayout;
      expect(after.plates.map((plate) => plate.id)).toEqual(before.plates.map((plate) => plate.id));
      for (const plate of after.plates) {
        const original = before.plates.find((entry) => entry.id === plate.id)!;
        expect(plate.fontSizeCss).toBeCloseTo(14);
        expect(plate.baseline.width).toBeCloseTo(original.baseline.width);
        expect(plate.baseline.height).toBeCloseTo(original.baseline.height);
        expect(Math.hypot(plate.offset.x, plate.offset.y)).toBeLessThanOrEqual(48);
      }
      expect(r.getRebuildCounts().armyChips).toBe(redraw);
    } finally {
      r.destroy();
    }
  });
  it('opts into bounded plate reflow with actual canvas-local HUD, preserving day-only cache and world anchors', async () => {
    const r = await makeRenderer();
    const layout = vi.spyOn(plateLayout, 'layoutArmyPlates');
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 1.25);
      const view = baseView({ armies: armyPair() });
      r.updateView(view);
      const before = r.getDiagnostics().armyPlateLayout;
      const hud = [{ x: 650, y: 450, width: 120, height: 120 }];
      r.setScreenOcclusions(hud);
      const after = r.getDiagnostics().armyPlateLayout;
      expect(after.runs).toBeGreaterThan(before.runs);
      const options = layout.mock.calls.at(-1)?.[4];
      expect(options?.maxOffset).toBe(80);
      expect(options?.canvas).toBeDefined();
      for (const candidate of layout.mock.calls.at(-1)![0]) {
        const plate = after.plates.find((p) => p.id === candidate.id)!;
        expect(candidate.anchor?.x).toBeCloseTo(plate.anchor.x + options!.canvas!.x);
        expect(candidate.anchor?.y).toBeCloseTo(plate.anchor.y + options!.canvas!.y);
      }
      expect(options?.screenOcclusions?.[0]).toMatchObject({
        x: 650 + options!.canvas!.x,
        y: 450 + options!.canvas!.y,
        width: 120,
        height: 120,
      });
      expect(after.plates.map((p) => p.anchor)).toEqual(before.plates.map((p) => p.anchor));
      for (const p of after.plates) {
        expect(p.fontSizeCss).toBeCloseTo(14);
        expect(Math.hypot(p.offset.x, p.offset.y)).toBeLessThanOrEqual(80 + 1e-8);
        expect(p.leader.start).toEqual(p.anchor);
      }
      r.updateView({ ...view, day: 2 });
      r.setScreenOcclusions(hud);
      expect(r.getDiagnostics().armyPlateLayout.runs).toBe(after.runs);
      r.panTo(210, 100);
      expect(r.getDiagnostics().armyPlateLayout.runs).toBeGreaterThan(after.runs);
      r.setScreenOcclusions([]);
      r.getDiagnostics(); // Explicit observation flushes the pending public presentation change.
      expect(layout.mock.calls.at(-1)?.[4]).toBeUndefined();
      expect(view).toEqual(baseView({ armies: armyPair() }));
    } finally {
      layout.mockRestore();
      r.destroy();
    }
  });
  it('keeps selected and aggregate far plates, resets after removal and retains local-to-CSS scale', async () => {
    const r = await makeRenderer();
    try {
      r.setMapData(nameplateStaticData());
      r.setCameraPose({ x: 200, y: 100 }, 0.3);
      const pair = armyPair();
      const armies = Array.from({ length: 6 }, (_, i) => ({
        ...pair[0]!,
        id: `army.far-${i}`,
        selected: i === 5,
      }));
      r.updateView(baseView({ armies }));
      const observation = r.getDiagnostics().armyPlateLayout;
      expect(observation.plates.some((p) => p.id === 'army.far-5' && p.selected)).toBe(true);
      expect(observation.plates.some((p) => p.collapsed)).toBe(true);
      for (const p of observation.plates) {
        const factor = 0.3 * MAPVIEW.armyFarChipScale;
        // Relation cell 12 + numeral (selected 41 / aggregate 20 / ordinary 0) + stroke 1.
        expect(p.baseline.width).toBeCloseTo((p.selected ? 54 : p.collapsed ? 33 : 13) * (14 / 12));
        expect(p.fontSizeCss).toBeCloseTo(14);
        expect(Math.hypot(p.offset.x, p.offset.y)).toBeLessThanOrEqual(48);
        const chip = r.getLayers()!.armies.children[Number(p.id.slice(-1))]!;
        expect(chip.scale.x).toBe(MAPVIEW.armyFarChipScale);
        const plate = chip.children.find((c) => c.label === 'armyPlate')!;
        const number = plate.children[1]! as BitmapText;
        expect(number.visible).toBe(p.selected || p.collapsed);
        expect(number.text).toBe(p.collapsed ? '+3' : '2,000');
        expect(plate.scale.x * factor * 12).toBeCloseTo(14);
        expect(plate.position.x * factor).toBeCloseTo(p.offset.x);
        expect(plate.position.y * factor).toBeCloseTo(p.offset.y);
      }
      r.updateView(baseView());
      expect(r.getDiagnostics().armyPlateLayout.plates).toEqual([]);
      r.updateView(baseView({ armies }));
      expect(r.getDiagnostics().armyPlateLayout.plates.map((p) => [p.id, p.rect])).toEqual(
        observation.plates.map((p) => [p.id, p.rect]),
      );
    } finally {
      r.destroy();
    }
  });
});

describe('城名牌（M6-V9b §7-S1）：獨立簽章 diff／只兵數變／LOD／pixel-lock／目標高亮', () => {
  it('正向存在：2 城名牌建於 nameplates 層、labels 只剩郡/省、城名/兵數（千分位）已填', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    r.updateView(baseView());
    const layers = r.getLayers()!;
    expect(layers.nameplates.children.length).toBe(2); // castle.a／castle.b
    expect(layers.labels.children.length).toBe(2); // 丙郡＋丁國（城名已移出 labelParts）
    expect(r.getRebuildCounts().nameplates).toBe(2);
    const plateA = layers.nameplates.children[0] as unknown as {
      children: { text?: string }[];
    };
    expect(plateA.children.length).toBe(5); // First four unchanged; fifth is presentation leader.
    expect(plateA.children[1]!.text).toBe('甲城');
    expect(plateA.children[2]!.text).toBe('2,000'); // formatSoldierChip：千分位、不縮寫（§2.10）
    r.destroy();
  });

  it('只兵數變（Blocker 1 核心）：nodeMarkers 零增量、只該城名牌重繪一次、nameplates 計數不動', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();
    const clearA = vi.spyOn(nameplateGfx(r, 0), 'clear');
    const clearB = vi.spyOn(nameplateGfx(r, 1), 'clear');

    // 只 castle.a 的 soldiers 變：node 簽章（不含 soldiers）不變 → castleNode 不動。
    r.updateView(baseView({ day: 2, castles: castlesWith({ soldiers: 1_500 }) }));
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers); // 零污染（§2.9）
    expect(r.getRebuildCounts().nameplates).toBe(baseline.nameplates); // 重繪不進計數（只建/毀）
    expect(clearA).toHaveBeenCalledTimes(1); // 該城名牌恰重繪一次（chip 文字＋綬帶寬）
    expect(clearB).not.toHaveBeenCalled(); // 另一城名牌不動

    clearA.mockClear();
    r.updateView(baseView({ day: 3, castles: castlesWith({ soldiers: 1_500 }) })); // day-only
    expect(clearA).not.toHaveBeenCalled(); // 簽章不變 → diff 空集 → 零 update
    expect(r.getRebuildCounts()).toEqual(baseline); // MapRebuildCounts 6 欄位全程不動
    r.destroy();
  });

  it('owner 翻轉：該城節點 +1 且該城名牌重繪一次（印記色/關係/dye 變）——不全量', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();
    const clearA = vi.spyOn(nameplateGfx(r, 0), 'clear');
    const clearB = vi.spyOn(nameplateGfx(r, 1), 'clear');

    r.updateView(baseView({ day: 2, castles: castlesWith({}, { ownerClanId: 'clan.oda' }) }));
    expect(r.getRebuildCounts().nodeMarkers).toBe(baseline.nodeMarkers + 1); // 既有 node 路徑
    expect(clearB).toHaveBeenCalledTimes(1); // castle.b 名牌恰重繪一次
    expect(clearA).not.toHaveBeenCalled(); // castle.a 名牌不動
    expect(r.getRebuildCounts().nameplates).toBe(baseline.nameplates);
    r.destroy();
  });

  it('LOD 顯隱（§2.7）：far 全隱（剪影 ensign 獨撐）／mid 本城顯支城隱／near 全顯；pixel-lock 1/scale', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    // castle.b 改支城（tier 由 view 權威）→ mid 應隱。
    const castles = baseView().castles.map((c) =>
      c.id === 'castle.b' ? { ...c, tier: 'branch' as const } : c,
    );
    r.updateView(baseView({ castles }));
    const plates = r.getLayers()!.nameplates.children as unknown as {
      visible: boolean;
      scale: { x: number };
    }[];

    r.setCameraPose({ x: 200, y: 100 }, 0.25); // far：全隱
    expect(plates[0]!.visible).toBe(false);
    expect(plates[1]!.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 0.75); // mid：本城顯、支城隱
    expect(plates[0]!.visible).toBe(true);
    expect(plates[1]!.visible).toBe(false);
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near：全顯
    expect(plates[0]!.visible).toBe(true);
    expect(plates[1]!.visible).toBe(true);
    expect(plates[0]!.scale.x).toBeCloseTo(1 / 1.25, 6); // pixel-lock 反向縮放（camera-dirty）
    r.destroy();
  });

  it('目標高亮（§3.4）：compact numeric detail restores once; identical targets reuse paint and layout', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    r.updateView(baseView());
    r.setCameraPose({ x: 200, y: 100 }, 1.25); // near（名牌顯示中）
    const baseline = r.getRebuildCounts();
    const plateA = r.getLayers()!.nameplates.children[0] as unknown as MockGfx;
    const highlight = plateA.children[3]!; // [gfx, nameText, troopsText, highlightGfx]
    const clearA = vi.spyOn(plateA.children[0]!, 'clear');
    const troops = plateA.children[2] as unknown as { visible: boolean; text: string };
    const part = (
      r as unknown as {
        nameplateParts: Map<
          string,
          {
            part: {
              getRibbonSize(): { w: number; h: number };
              getOriginalPresentationGeometry(): { ribbon: { w: number; h: number } };
            };
          }
        >;
      }
    ).nameplateParts.get('castle.a')!.part;
    const originalWidth = part.getOriginalPresentationGeometry().ribbon.w;
    expect(part.getRibbonSize().w).toBeLessThan(originalWidth);
    expect(troops.visible).toBe(false);
    expect(troops.text).toBe('2,000');
    expect(highlight.visible).toBe(false);

    r.setMarchTarget('castle.a');
    expect(highlight.visible).toBe(true); // 金框開（既繪子物件，只切 visible）
    expect(clearA).toHaveBeenCalledTimes(1); // one real compact→full numeric repaint
    expect(troops.visible).toBe(true);
    expect(troops.text).toBe('2,000');
    expect(part.getRibbonSize().w).toBe(originalWidth);
    expect(r.getRebuildCounts()).toEqual(baseline); // 不進任何計數
    const targetLayout = r.getDiagnostics().castleRibbonLayout.runs;
    clearA.mockClear();
    r.setMarchTarget('castle.a');
    expect(clearA).not.toHaveBeenCalled();
    expect(r.getDiagnostics().castleRibbonLayout.runs).toBe(targetLayout);
    expect(r.getRebuildCounts()).toEqual(baseline);

    r.setMarchTarget(null);
    expect(highlight.visible).toBe(false);
    r.getDiagnostics();
    expect(clearA.mock.calls.length).toBeLessThanOrEqual(1);
    expect(part.getRibbonSize().w).toBeLessThan(originalWidth);
    expect(troops.visible).toBe(false);
    const clearedLayout = r.getDiagnostics().castleRibbonLayout.runs;
    clearA.mockClear();
    r.setMarchTarget(null);
    expect(clearA).not.toHaveBeenCalled();
    expect(r.getDiagnostics().castleRibbonLayout.runs).toBe(clearedLayout);
    expect(r.getRebuildCounts()).toEqual(baseline);
    r.destroy();
  });

  it('re-setMapData：名牌重建計數 +2（建/毀口徑，比照 labels）；後續同 view updateView 不再增', async () => {
    const r = await makeRenderer();
    r.setMapData(nameplateStaticData());
    r.updateView(baseView());
    const baseline = r.getRebuildCounts();

    r.setMapData(nameplateStaticData()); // 同圖重建（parts 依 id 重用、每名牌仍計 +1）
    expect(r.getRebuildCounts().nameplates).toBe(baseline.nameplates + 2);
    r.updateView(baseView()); // prevNameplateSig 已重設 null → 全 dirty（冪等 update 早退，不計數）
    expect(r.getRebuildCounts().nameplates).toBe(baseline.nameplates + 2);
    r.destroy();
  });
});
