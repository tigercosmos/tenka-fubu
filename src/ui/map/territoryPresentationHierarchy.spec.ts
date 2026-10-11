import { expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { MapRenderer } from './MapRenderer';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { MapViewState } from './mapViewTypes';
import type { TerritoryGrid } from './territoryGrid';

it('uses a light normal MID/NEAR ownership wash while retaining the actual FAR/faction consumer and source RGBA', async () => {
  const castle = 'castle.a' as CastleId,
    district = 'dist.a' as DistrictId,
    road = 'road.a' as RoadEdgeId;
  const graph = buildMapGraph(
    { [castle]: { id: castle, pos: { x: 100, y: 100 } } },
    { [district]: { id: district, pos: { x: 200, y: 100 }, castleId: castle, isPort: false } },
    {
      [road]: {
        id: road,
        a: castle,
        b: district,
        type: 'land',
        grade: 2,
        baseDays: 1,
      },
    },
  );
  const renderer = new MapRenderer();
  await renderer.init(document.createElement('div'), vi.fn());
  const view: MapViewState = {
    day: 1,
    districtOwner: { [district]: 'clan.oda' },
    castles: [],
    armies: [],
    battles: [],
    selection: null,
    analysisMode: 'none',
  };
  renderer.updateView(view);
  renderer.setMapData({
    graph,
    clanColorIndex: { 'clan.oda': 5 },
    outline: {
      version: 1,
      source: 'handcrafted',
      polygons: [{ id: 'box', points: [50, 50, 350, 50, 350, 350, 50, 350] }],
    },
  });
  try {
    const layer = renderer.getLayers()!.territory;
    const sprite = layer.children[0]!;
    const grid = Reflect.get(renderer, 'territoryGrid') as TerritoryGrid;
    const before = grid.imageData.data.slice();
    expect(before.some((byte) => byte > 0)).toBe(true);
    const geometry = JSON.stringify([...graph.nodes.values()]);
    for (const [scale, normal] of [
      [1.25, 0.1],
      [0.65, 0.1],
      [0.25, 0.3],
    ] as const) {
      renderer.setCameraPose({ x: 200, y: 100 }, scale);
      renderer.updateView({ ...view, analysisMode: 'none' });
      renderer.getDiagnostics();
      expect(sprite.alpha).toBe(normal);
      renderer.updateView({ ...view, analysisMode: 'faction' });
      renderer.getDiagnostics();
      expect(sprite.alpha).toBe(0.68);
      renderer.updateView({ ...view, analysisMode: 'none' });
      renderer.getDiagnostics();
      expect(sprite.alpha).toBe(normal);
      expect(layer.children).toEqual([sprite]);
      expect(grid.imageData.data.length).toBe(before.length);
      expect(grid.imageData.data.every((byte, index) => byte === before[index])).toBe(true);
      expect(JSON.stringify([...graph.nodes.values()])).toBe(geometry);
    }
  } finally {
    renderer.destroy();
  }
});
