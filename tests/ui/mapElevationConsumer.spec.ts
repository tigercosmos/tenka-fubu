// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import type { Container, FederatedPointerEvent } from 'pixi.js';
import { MapRenderer } from '../../src/ui/map/MapRenderer';
import { MapAssetLoader } from '../../src/ui/assets/loader';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import type { CastleId, ClanId, RoadEdgeId } from '../../src/core/state/ids';
import type { MapStaticData, MapViewState, MapRendererEvent } from '../../src/ui/map/mapViewTypes';
import type { SpatialCullIndex } from '../../src/ui/map/lod';
import type { Camera } from '../../src/ui/map/camera';
import type { MapInteraction } from '../../src/ui/map/interaction';
import type { RoadsLayer } from '../../src/ui/map/roads/roadsDraw';
import { createTerrainTopography } from '../../src/ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '../../src/ui/map/terrain/sampledTerrainElevation';

type Point = { x: number; y: number };
type Field = ReturnType<typeof createSampledTerrainElevation>;
// Observe actual private consumer storage, not diagnostic values recomputed from ideal geometry.
interface ConsumerStorage {
  sceneProjection: Field | null;
  projectScenePoint(point: Point): Point;
  terrainProjectionError: string | null;
  camera: Camera;
  nodeParts: Map<string, { part: { container: Container } }>;
  armyParts: Map<string, { container: Container }>;
  nodeCull: SpatialCullIndex<string>;
  armyCull: SpatialCullIndex<string>;
  interaction: MapInteraction;
  roadsLayer: RoadsLayer;
  toWorldPoint(x: number, y: number): Point;
}
const storage = (renderer: MapRenderer) => renderer as unknown as ConsumerStorage;
const land = [
  { x: 0, y: 0 },
  { x: 4096, y: 0 },
  { x: 4096, y: 4096 },
  { x: 0, y: 4096 },
];
const mountain = {
  id: 'hill.test',
  tier: 3 as const,
  mass: [
    { x: 600, y: 600 },
    { x: 1800, y: 600 },
    { x: 1800, y: 1600 },
    { x: 600, y: 1600 },
  ],
  ridges: [
    [
      { x: 900, y: 1000 },
      { x: 1500, y: 1000 },
    ],
  ],
};
function fixture() {
  const graph = buildMapGraph(
    {
      ['castle.a' as CastleId]: { id: 'castle.a' as CastleId, pos: { x: 1000, y: 1000 } },
      ['castle.b' as CastleId]: { id: 'castle.b' as CastleId, pos: { x: 1400, y: 1000 } },
    },
    {},
    {
      ['road.a-b' as RoadEdgeId]: {
        id: 'road.a-b' as RoadEdgeId,
        a: 'castle.a' as CastleId,
        b: 'castle.b' as CastleId,
        type: 'land',
        grade: 2,
        baseDays: 2,
      },
    },
  );
  const data: MapStaticData = {
    graph,
    clanColorIndex: { 'clan.oda': 0 },
    castleTier: { 'castle.a': 'main', 'castle.b': 'main' },
    outline: {
      version: 1,
      source: 'handcrafted',
      polygons: [{ id: 'land', points: land.flatMap((p) => [p.x, p.y]) }],
    },
    terrain: {
      reliefAssetId: 'missing.test.relief',
      forestAssetId: 'missing.test.forest',
      groundArtAssetId: 'missing.test.ground',
      rivers: [],
      lakes: [],
      mountains: [mountain],
    },
  };
  const view: MapViewState = {
    day: 1,
    districtOwner: {},
    castles: ['castle.a', 'castle.b'].map((id) => ({
      id: id as CastleId,
      ownerClanId: 'clan.oda' as ClanId,
      durability: 1000,
      maxDurability: 1000,
      tier: 'main' as const,
      terrainKind: 'plain' as const,
      siegeMode: 'none' as const,
      warning: 'none' as const,
      soldiers: 2000,
      relation: 'friendly' as const,
      isPlayer: true,
    })),
    armies: [
      {
        id: 'army.test',
        clanId: 'clan.oda',
        soldiers: 2000,
        status: 'marching',
        morale: 80,
        foodDays: 20,
        mission: 'march',
        corps: false,
        selected: false,
        relation: 'friendly',
        fromNode: 'castle.a' as CastleId,
        toNode: 'castle.b' as CastleId,
        edgeT: 0.5,
      },
    ],
    battles: [],
    selection: null,
    analysisMode: 'none',
  };
  return { data, view };
}
const snapshot = (data: MapStaticData, view: MapViewState) =>
  JSON.stringify({
    nodes: [...data.graph.nodes],
    edges: [...data.graph.edges],
    terrain: data.terrain,
    view,
  });
const position = (container: Container) => ({ x: container.position.x, y: container.position.y });
function expectedField() {
  return createSampledTerrainElevation(createTerrainTopography([mountain], [land]), {
    worldSize: 4096,
    cells: 128,
    protectedCells: new Uint8Array(128 * 128),
  });
}
beforeEach(() => {
  vi.spyOn(MapAssetLoader.prototype, 'acquire').mockRejectedValue(
    new Error('intentional missing raster: coordinate consumer test has no GPU'),
  );
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

describe('actual shared-elevation renderer coordinate consumers', () => {
  it('clears disposed projection diagnostics and callback without changing canonical inputs, including repeated teardown', async () => {
    const { data, view } = fixture(),
      before = snapshot(data, view),
      renderer = new MapRenderer();
    await renderer.init(document.createElement('div'), vi.fn());
    try {
      renderer.setMapData(data);
      renderer.updateView(view);
      const actual = storage(renderer),
        point = { x: 1000, y: 1000 };
      expect(actual.sceneProjection!.sample(point)).toBeGreaterThan(0);
      expect(actual.projectScenePoint(point)).not.toEqual(point);
      expect(renderer.getDiagnostics().elevationRendering.active).toBe(true);
      expect(renderer.getDiagnostics().elevationRendering.field).not.toBeNull();
      // An independent retained error must be reset, not merely hidden by ready:false.
      actual.terrainProjectionError = 'retained teardown sentinel';
      for (let repeat = 0; repeat < 2; repeat += 1) {
        renderer.destroy();
        const diagnostics = renderer.getDiagnostics();
        expect(diagnostics.ready).toBe(false);
        expect(diagnostics.elevationRendering).toMatchObject({
          active: false,
          error: null,
          field: null,
          surface: null,
          territory: null,
          territoryAlpha: null,
          analysis: null,
          canopy: null,
          foothillCanopy: null,
          roads: [],
          nodes: [],
          armies: [],
        });
        expect(actual.sceneProjection).toBeNull();
        expect(actual.terrainProjectionError).toBeNull();
        const flat = actual.projectScenePoint(point);
        expect(flat).toEqual(point);
        expect(flat).not.toBe(point);
        expect(snapshot(data, view)).toBe(before);
      }
    } finally {
      renderer.destroy();
      vi.restoreAllMocks();
    }
  });
  it('resets retained field, error and callback even when disposing before application initialization', () => {
    const renderer = new MapRenderer(),
      actual = storage(renderer),
      field = expectedField(),
      point = { x: 1000, y: 1000 };
    actual.sceneProjection = field;
    actual.projectScenePoint = field.project;
    actual.terrainProjectionError = 'before-init sentinel';
    expect(renderer.getApp()).toBeNull();
    expect(actual.projectScenePoint(point)).not.toEqual(point);
    try {
      renderer.destroy();
      expect(renderer.getDiagnostics().ready).toBe(false);
      expect(renderer.getDiagnostics().elevationRendering).toMatchObject({
        active: false,
        field: null,
        error: null,
      });
      expect(actual.sceneProjection).toBeNull();
      expect(actual.terrainProjectionError).toBeNull();
      expect(actual.projectScenePoint(point)).toEqual(point);
      renderer.destroy();
      expect(renderer.getDiagnostics().elevationRendering.active).toBe(false);
    } finally {
      renderer.destroy();
      vi.restoreAllMocks();
    }
  });
  it('places real cached node props and army feet in the same sampled scene while preserving canonical graph/view', async () => {
    const { data, view } = fixture(),
      before = snapshot(data, view),
      renderer = new MapRenderer();
    await renderer.init(document.createElement('div'), vi.fn());
    try {
      renderer.setMapData(data);
      renderer.updateView(view);
      renderer.setCameraPose({ x: 1200, y: 1000 }, 1.25);
      const actual = storage(renderer),
        expected = expectedField();
      expect(expected.sample({ x: 1000, y: 1000 })).toBeGreaterThan(1);
      expect(position(actual.nodeParts.get('castle.a')!.part.container)).toEqual(
        expected.project({ x: 1000, y: 1000 }),
      );
      expect(position(actual.nodeParts.get('castle.b')!.part.container)).toEqual(
        expected.project({ x: 1400, y: 1000 }),
      );
      expect(position(actual.armyParts.get('army.test')!.container)).toEqual(
        expected.project({ x: 1200, y: 1000 }),
      );
      // Actual spatial index inputs use scene coordinates; interaction keeps canonical coordinates.
      const nodePositions = (actual.nodeCull as unknown as { positions: Map<string, Point> })
        .positions;
      const armyPositions = (actual.armyCull as unknown as { positions: Map<string, Point> })
        .positions;
      expect(nodePositions.get('castle.a')).toEqual(expected.project({ x: 1000, y: 1000 }));
      expect(armyPositions.get('army.test')).toEqual(expected.project({ x: 1200, y: 1000 }));
      const diagnostics = renderer.getDiagnostics().elevationRendering;
      expect(diagnostics.error).toBeNull();
      expect(diagnostics.nodes.find((node) => node.id === 'castle.a')).toEqual({
        id: 'castle.a',
        canonical: { x: 1000, y: 1000 },
        scene: position(actual.nodeParts.get('castle.a')!.part.container),
      });
      expect(diagnostics.armies.find((army) => army.id === 'army.test')?.scene).toEqual(
        position(actual.armyParts.get('army.test')!.container),
      );
      expect(snapshot(data, view)).toBe(before);
    } finally {
      renderer.destroy();
      vi.restoreAllMocks();
    }
  });
  it('recovers canonical coordinates through the real pointer callback and keeps both native hit identities', async () => {
    const { data, view } = fixture(),
      renderer = new MapRenderer(),
      events: MapRendererEvent[] = [];
    await renderer.init(document.createElement('div'), (event) => events.push(event));
    try {
      renderer.setMapData(data);
      renderer.updateView(view);
      renderer.setCameraPose({ x: 1200, y: 1000 }, 1.25);
      const actual = storage(renderer),
        field = expectedField();
      // Explicit field injection also exercises the old consumer in isolation: the old
      // flat toWorldPoint returns raised scene coordinates instead of canonical coordinates.
      actual.sceneProjection = field;
      actual.camera.setPresentationProjection(field);
      const app = renderer.getApp()!,
        transform = actual.camera.getWorldTransform(app.screen);
      const world = renderer.getLayers()!.world;
      world.position.set(transform.x, transform.y);
      world.scale.set(transform.scale);
      for (const canonical of [
        { x: 1000, y: 1000 },
        { x: 1200, y: 1000 },
      ]) {
        const scene = field.project(canonical),
          screen = {
            x: scene.x * transform.scale + transform.x,
            y: scene.y * transform.scale + transform.y,
          };
        const inverse = actual.toWorldPoint(screen.x, screen.y);
        expect(inverse.x).toBeCloseTo(canonical.x, 8);
        expect(inverse.y).toBeCloseTo(canonical.y, 8);
        // Actual registered Pixi pointer callback, not direct interaction.handleTap.
        app.stage.emit('pointertap', {
          global: screen,
          pointerId: 1,
        } as unknown as FederatedPointerEvent);
      }
      expect(events).toContainEqual({ type: 'nodeClick', nodeKind: 'castle', id: 'castle.a' });
      expect(events).toContainEqual({ type: 'armyClick', id: 'army.test' });
    } finally {
      renderer.destroy();
      vi.restoreAllMocks();
    }
  });
  it('replaces the road projection cache lease on field changes, resets to flat and updates existing node containers', async () => {
    const { data, view } = fixture(),
      renderer = new MapRenderer();
    await renderer.init(document.createElement('div'), vi.fn());
    try {
      renderer.setMapData(data);
      renderer.updateView(view);
      const actual = storage(renderer),
        firstNode = actual.nodeParts.get('castle.a')!.part.container,
        expected = expectedField();
      const first = actual.roadsLayer.getProjectionDiagnostics();
      const stations = first.flatMap((road) => road.stations);
      expect(stations.some((station) => station.source.y - station.scene.y > 1)).toBe(true);
      for (const station of stations)
        expect(station.scene).toEqual(expected.project(station.source));
      const flat = { ...data, terrain: { ...data.terrain!, mountains: [] } };
      renderer.setMapData(flat);
      renderer.updateView(view);
      const second = actual.roadsLayer.getProjectionDiagnostics();
      expect(second).not.toBe(first);
      for (const station of second.flatMap((road) => road.stations))
        expect(station.scene).toEqual(station.source);
      expect(actual.nodeParts.get('castle.a')!.part.container).toBe(firstNode);
      expect(position(firstNode)).toEqual({ x: 1000, y: 1000 });
      renderer.setMapData(data);
      renderer.updateView(view);
      expect(position(firstNode)).toEqual(expected.project({ x: 1000, y: 1000 }));
      expect(actual.roadsLayer.getProjectionDiagnostics()).toEqual(first);
      renderer.updateView({ ...view, day: 2 });
      expect(actual.roadsLayer.getProjectionDiagnostics()).toEqual(first);
    } finally {
      renderer.destroy();
      vi.restoreAllMocks();
    }
  });
});
