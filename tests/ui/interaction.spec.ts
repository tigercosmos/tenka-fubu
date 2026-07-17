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

describe('hitTestWorldPoint：CSS-px 命中下限（04 §3.12.1 DoD，M6-V6）', () => {
  it('不傳 minHitRadius：既有行為不變（郡半徑仍是原本 12，40wu 外不中）', () => {
    const graph = fixtureGraph([node('dist.a', 'district', 0, 0)]);
    expect(hitTestWorldPoint(40, 0, graph)).toBeNull();
  });

  it('傳 minHitRadius=64：郡於半徑外（40wu，原半徑 12 命不中）仍命中', () => {
    const graph = fixtureGraph([node('dist.a', 'district', 0, 0)]);
    expect(hitTestWorldPoint(40, 0, graph, { minHitRadius: 64 })).toEqual({
      kind: 'district',
      id: 'dist.a',
    });
    // 超出 floor 半徑（64）則仍不中。
    expect(hitTestWorldPoint(65, 0, graph, { minHitRadius: 64 })).toBeNull();
  });

  it('傳 minHitRadius=64：城（支城，原半徑 16）亦受 floor，40wu 命中', () => {
    const graph = fixtureGraph([node('castle.a', 'castle', 0, 0)]);
    expect(hitTestWorldPoint(40, 0, graph, { minHitRadius: 64 })).toEqual({
      kind: 'castle',
      id: 'castle.a',
    });
  });

  it('軍隊不受 minHitRadius floor（即使傳大 minHitRadius，半徑仍固定 16，不吞鄰近城/郡）', () => {
    const graph = fixtureGraph([]);
    const armies: HitTestArmy[] = [{ id: 'army.000001', pos: { x: 0, y: 0 } }];
    // 距軍隊 40wu：若 floor 誤套到軍隊（40≤64）會命中 army；正確行為（軍隊半徑固定 16、
    // 40>16）應無命中——證明 army 半徑未被 floor 放大。
    expect(hitTestWorldPoint(40, 0, graph, { armies, minHitRadius: 64 })).toBeNull();
    // 軍隊固定半徑內（16wu）仍正常命中，證明 army 分支本身未受影響。
    expect(hitTestWorldPoint(16, 0, graph, { armies, minHitRadius: 64 })).toEqual({
      kind: 'army',
      id: 'army.000001',
    });
  });

  it('army 與城重疊於 floor 放大範圍內：軍隊仍優先（未被 floor 吞掉之城搶先），驗證 eng-F4 處置', () => {
    // 軍隊在 (0,0)、城在 (40,0)：查詢點 (40,0) 距城 0（必中，任何半徑），距軍隊 40（固定半徑 16 外，不中）。
    // 若軍隊誤套用 floor（64），army 會搶在城之前被判定命中；正確行為應由城勝出。
    const graph = fixtureGraph([node('castle.a', 'castle', 40, 0)]);
    const armies: HitTestArmy[] = [{ id: 'army.000001', pos: { x: 0, y: 0 } }];
    expect(hitTestWorldPoint(40, 0, graph, { armies, minHitRadius: 64 })).toEqual({
      kind: 'castle',
      id: 'castle.a',
    });
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

  it('setScale(0.25)：遠景縮小之郡節點（有效半徑 hitMinCssRadius/scale=64）仍可命中', () => {
    const { interaction, emit } = setup();
    const graph = fixtureGraph([node('dist.owari', 'district', 200, 200)]);
    interaction.setStaticData({ graph });
    interaction.setScale(0.25);
    // 距節點 40wu：原半徑 12 命不中，floor（16/0.25=64）後應命中。
    interaction.handleTap(240, 200);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'district',
      id: 'dist.owari',
    });
  });

  it('未呼叫 setScale（預設 scale=1）：floor＝hitMinCssRadius(16)，行為與既有一致（郡半徑 12 外不中）', () => {
    const { interaction, emit } = setup();
    const graph = fixtureGraph([node('dist.owari', 'district', 200, 200)]);
    interaction.setStaticData({ graph });
    interaction.handleTap(200 + MAPVIEW.hitMinCssRadius + 1, 200);
    expect(emit).toHaveBeenCalledWith({ type: 'emptyClick' });
  });

  it('setScale(0.25) 時軍隊 query box／半徑不受影響（遠景仍維持固定 16，不吞鄰近城/郡）', () => {
    const { interaction, emit } = setup();
    const graph = fixtureGraph([node('castle.kiyosu', 'castle', 100, 100)]);
    interaction.setStaticData({ graph });
    interaction.setArmies([{ id: 'army.000001', pos: { x: 100, y: 100 } }]);
    interaction.setScale(0.25);
    // 距軍隊 40wu：若軍隊亦受節點 floor 影響會命中 army；正確行為應命中底下的城
    // （軍隊固定半徑 16 外不中，城之 floor 半徑 64 命中）。
    interaction.handleTap(140, 100);
    expect(emit).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'castle',
      id: 'castle.kiyosu',
    });
  });

  it('setScale(0)／負值：回退為 1（保守），不拋錯', () => {
    const { interaction, emit, graph } = setup();
    interaction.setStaticData({ graph });
    expect(() => {
      interaction.setScale(0);
    }).not.toThrow();
    expect(() => {
      interaction.setScale(-2);
    }).not.toThrow();
    interaction.handleTap(200 + MAPVIEW.hitMinCssRadius + 1, 200);
    expect(emit).toHaveBeenCalledWith({ type: 'emptyClick' });
  });
});
