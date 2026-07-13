// 地圖互動（src/ui/map/interaction.ts）純函式與 `MapInteraction` 類別測試。
// 規格：plan/04-map-and-movement.md §3.12.1（命中測試：優先序部隊>城(本城20/支城16)>郡12>無，
// 多候選取最近者）／§3.12.2（idle 模式事件協定：hover→nodeHover、左鍵→nodeClick/armyClick、
// 右鍵→rightClick）；18-roadmap.md M2-17（04-T12 部分）驗收「hover 城出 tooltip；點城開面板事件
// 發出」——以事件斷言驗證（tooltip/面板本身之 React 呈現層由 useMapEvents 另測，見
// src/ui/map/interaction.spec.tsx）。
//
// 無 Pixi／DOM 相依，於 core（node）project 執行（tests/**/*.spec.ts，同 mapDraw.spec.ts／
// camera.spec.ts 慣例）；`useMapEvents`（需 React/jsdom）不在本檔。

import { describe, expect, it, vi } from 'vitest';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import {
  MapInteraction,
  hitTestWorldPoint,
  screenToWorld,
  type HitTestArmy,
} from '@ui/map/interaction';
import type { MapRendererEvent } from '@ui/map/mapViewTypes';

function node(id: string, kind: 'castle' | 'district', x: number, y: number): MapGraphNode {
  return { id: id as MapNodeId, kind, pos: { x, y }, isPort: false };
}

function fixtureGraph(nodes: MapGraphNode[]): MapGraph {
  return { nodes: new Map(nodes.map((n) => [n.id, n])), edges: new Map(), adjacency: new Map() };
}

describe('hitTestWorldPoint（04 §3.12.1）', () => {
  it('城命中：本城半徑 20（castleTier=main）；半徑外無命中', () => {
    const graph = fixtureGraph([node('castle.main', 'castle', 100, 100)]);
    const opts = { castleTier: { 'castle.main': 'main' as const } };
    expect(hitTestWorldPoint(100 + MAPVIEW.hitRadius.castleMain, 100, graph, opts)).toEqual({
      kind: 'castle',
      id: 'castle.main',
    });
    expect(hitTestWorldPoint(100 + MAPVIEW.hitRadius.castleMain + 1, 100, graph, opts)).toBeNull();
  });

  it('城命中：未列於 castleTier 視為支城（半徑 16，較保守）', () => {
    const graph = fixtureGraph([node('castle.branch', 'castle', 0, 0)]);
    expect(hitTestWorldPoint(0, MAPVIEW.hitRadius.castleBranch, graph)).toEqual({
      kind: 'castle',
      id: 'castle.branch',
    });
    expect(hitTestWorldPoint(0, MAPVIEW.hitRadius.castleBranch + 1, graph)).toBeNull();
  });

  it('郡命中：半徑 12；半徑外無命中', () => {
    const graph = fixtureGraph([node('dist.a', 'district', 50, 50)]);
    expect(hitTestWorldPoint(50, 50 + MAPVIEW.hitRadius.district, graph)).toEqual({
      kind: 'district',
      id: 'dist.a',
    });
    expect(hitTestWorldPoint(50, 50 + MAPVIEW.hitRadius.district + 1, graph)).toBeNull();
  });

  it('優先序：城與郡候選重疊時一律取城，不論何者實際距離較近', () => {
    // 郡在原點、城在 (10,0)；查詢點 (2,0) 離郡(2)比離城(8)近，但城優先序更高應勝出。
    const graph = fixtureGraph([
      node('dist.near', 'district', 0, 0),
      node('castle.far', 'castle', 10, 0),
    ]);
    expect(hitTestWorldPoint(2, 0, graph)).toEqual({ kind: 'castle', id: 'castle.far' });
  });

  it('優先序：部隊命中時優先於城（army 半徑 16）', () => {
    const graph = fixtureGraph([node('castle.a', 'castle', 0, 0)]);
    const armies: HitTestArmy[] = [{ id: 'army.000001', pos: { x: 1, y: 0 } }];
    expect(hitTestWorldPoint(0, 0, graph, { armies })).toEqual({ kind: 'army', id: 'army.000001' });
  });

  it('同層多候選：取距離最近者', () => {
    const graph = fixtureGraph([
      node('dist.near', 'district', 0, 0),
      node('dist.far', 'district', 5, 0),
    ]);
    expect(hitTestWorldPoint(2, 0, graph)).toEqual({ kind: 'district', id: 'dist.near' });
  });

  it('街道邊不參與命中（本函式僅吃節點，天然滿足「不可點擊」）；空圖／查無候選回傳 null', () => {
    expect(hitTestWorldPoint(0, 0, fixtureGraph([]))).toBeNull();
    const graph = fixtureGraph([node('dist.a', 'district', 1000, 1000)]);
    expect(hitTestWorldPoint(0, 0, graph)).toBeNull();
  });
});

describe('screenToWorld', () => {
  it('反套用 world 容器 position/scale（camera.ts WorldTransform 同構）', () => {
    expect(screenToWorld(300, 150, { x: 100, y: 50, scale: 2 })).toEqual({ x: 100, y: 50 });
  });

  it('scale=1、position=0 時螢幕座標即世界座標', () => {
    expect(screenToWorld(42, 7, { x: 0, y: 0, scale: 1 })).toEqual({ x: 42, y: 7 });
  });
});

describe('MapInteraction（idle 模式，04 §3.12.2；M2-17 驗收）', () => {
  function setup(): {
    interaction: MapInteraction;
    emit: ReturnType<typeof vi.fn<(e: MapRendererEvent) => void>>;
    graph: MapGraph;
  } {
    const emit = vi.fn<(e: MapRendererEvent) => void>();
    const interaction = new MapInteraction({ emit });
    const graph = fixtureGraph([
      node('castle.kiyosu', 'castle', 100, 100),
      node('dist.owari', 'district', 200, 200),
    ]);
    return { interaction, emit, graph };
  }

  it('未 setStaticData：一律無命中（tap→emptyClick；move→nodeHover(null)）', () => {
    const { interaction, emit } = setup();
    interaction.handleTap(100, 100);
    expect(emit).toHaveBeenCalledWith({ type: 'emptyClick' });

    emit.mockClear();
    interaction.handleMove(100, 100, 10, 20);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeHover',
      nodeKind: null,
      id: null,
      screenX: 10,
      screenY: 20,
    });
  });

  it('hover 城：發 nodeHover(castle) 含游標螢幕座標（tooltip 定位用）', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph, castleTier: { 'castle.kiyosu': 'main' } });
    interaction.handleMove(100, 100, 500, 300);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeHover',
      nodeKind: 'castle',
      id: 'castle.kiyosu',
      screenX: 500,
      screenY: 300,
    });
  });

  it('hover 移出節點：發 nodeHover(id:null)', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.handleMove(9999, 9999, 1, 1);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeHover',
      nodeKind: null,
      id: null,
      screenX: 1,
      screenY: 1,
    });
  });

  it('點城：發 nodeClick(castle)（React 開啟城面板之觸發事件）', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.handleTap(100, 100);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'castle',
      id: 'castle.kiyosu',
    });
  });

  it('點郡：發 nodeClick(district)', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.handleTap(200, 200);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'district',
      id: 'dist.owari',
    });
  });

  it('點空白處：發 emptyClick', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.handleTap(9999, 9999);
    expect(emit).toHaveBeenCalledWith({ type: 'emptyClick' });
  });

  it('右鍵：發 rightClick（idle 清除選取）', () => {
    const { interaction, emit } = setup();
    interaction.handleRightClick();
    expect(emit).toHaveBeenCalledWith({ type: 'rightClick' });
  });

  it('orderMarch 忽略城上部隊，hover/tap 皆選到底層城，且相同 hover 不重算', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.setArmies([{ id: 'army.000001', pos: { x: 100, y: 100 } }]);
    interaction.setMode('orderMarch');

    interaction.handleMove(100, 100, 20, 30);
    interaction.handleMove(100, 100, 21, 31);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'nodeHover', id: 'castle.kiyosu' }),
    );

    emit.mockClear();
    interaction.handleTap(100, 100);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'castle',
      id: 'castle.kiyosu',
    });
  });

  it('setStaticData(null)：回到未載入狀態，重新一律無命中', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    interaction.setStaticData(null);
    interaction.handleTap(100, 100);
    expect(emit).toHaveBeenCalledWith({ type: 'emptyClick' });
  });
});
