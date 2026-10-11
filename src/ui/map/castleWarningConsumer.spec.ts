import { createWasmGeographicScorer } from '@ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../../../tests/helpers/realRenderWasm';
import { describe, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { MapRenderer } from './MapRenderer';
import type { MapViewState } from './mapViewTypes';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId } from '@core/state/ids';

describe('warning camera consumer and actual obstacle envelope (mock renderer, not pixels)', () => {
  it('projects warning-only14CSS without changing anchors, body or idle resources', async () => {
    const r = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
    await r.init(document.createElement('div'), vi.fn());
    try {
      const id = 'castle.test' as CastleId;
      const graph = buildMapGraph({ [id]: { id, pos: { x: 200, y: 200 } } }, {}, {});
      r.setMapData({
        graph,
        clanColorIndex: { 'clan.test': 0 },
        castleTier: { 'castle.test': 'main' },
        outline: {
          version: 1,
          source: 'handcrafted',
          polygons: [{ id: 'box', points: [100, 100, 300, 100, 300, 300, 100, 300] }],
        },
      });
      const view = {
        day: 1,
        districtOwner: {},
        castles: [
          {
            id: 'castle.test',
            ownerClanId: 'clan.test',
            durability: 100,
            maxDurability: 100,
            tier: 'main',
            terrainKind: 'plain',
            siegeMode: 'none',
            warning: 'critical',
            soldiers: 1000,
            relation: 'friendly',
            isPlayer: true,
          },
        ],
        armies: [],
        battles: [],
        selection: null,
        analysisMode: 'none',
      } as unknown as MapViewState;
      r.updateView(view);
      for (const scale of [0.25, 0.5, 1.25]) {
        r.setCameraPose({ x: 200, y: 200 }, scale);
        const first = r.getDiagnostics();
        const castle = first.castleRendering.nodes.find((n) => n.id === 'castle.test')!;
        expect(castle.warning).not.toBeNull();
        expect(castle.warning!.width).toBeCloseTo(14, 10);
        expect(castle.warning!.height).toBeCloseTo(14, 10);
        const obstacle = first.geographicLabelLayout.obstacles.find(
          (o) => o.kind === 'castleWarning' && o.id === 'castle.test',
        );
        expect(obstacle?.rect).toEqual(castle.warning);
        r.updateView({ ...view, day: 2 });
        const second = r.getDiagnostics();
        expect(second.castleRendering).toEqual(first.castleRendering);
        expect(second.resources).toEqual(first.resources);
      }
    } finally {
      r.destroy();
    }
  });
});
