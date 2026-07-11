// buildMapGraph() 驗收測試（M2-6；04-T3／04 §4.1／§5.1）。
// 手法：小 fixture 圖（2 城＋2 郡，4 節點），分別構造「連通」「不連通」「街道端點缺失」
// 「街道自環」四種案例；另驗證鄰接表依 edgeId 字典序（決定論，04 §4.1／§5.1）。

import { describe, expect, it } from 'vitest';
import {
  buildMapGraph,
  type CastleNodeInput,
  type DistrictNodeInput,
} from '../../src/core/state/mapGraph';
import type { RoadEdge } from '../../src/core/state/gameState';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '../../src/core/state/ids';

const CASTLE_A = 'castle.a' as CastleId;
const CASTLE_B = 'castle.b' as CastleId;
const DIST_A1 = 'dist.a1' as DistrictId;
const DIST_B1 = 'dist.b1' as DistrictId;

const castles: Record<CastleId, CastleNodeInput> = {
  [CASTLE_A]: { id: CASTLE_A, pos: { x: 0, y: 0 } },
  [CASTLE_B]: { id: CASTLE_B, pos: { x: 100, y: 0 } },
};

const districts: Record<DistrictId, DistrictNodeInput> = {
  [DIST_A1]: { id: DIST_A1, pos: { x: 10, y: 10 }, isPort: false, castleId: CASTLE_A },
  [DIST_B1]: { id: DIST_B1, pos: { x: 110, y: 10 }, isPort: true, castleId: CASTLE_B },
};

function makeRoad(id: string, a: MapNodeId, b: MapNodeId): RoadEdge {
  return { id: id as RoadEdgeId, a, b, type: 'land', grade: 1, baseDays: 1 };
}

describe('buildMapGraph', () => {
  it('連通 fixture：建圖成功，節點/邊/鄰接表內容正確', () => {
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.a-a1' as RoadEdgeId]: makeRoad('road.a-a1', CASTLE_A, DIST_A1),
      ['road.a-b' as RoadEdgeId]: makeRoad('road.a-b', CASTLE_A, CASTLE_B),
      ['road.b-b1' as RoadEdgeId]: makeRoad('road.b-b1', CASTLE_B, DIST_B1),
    };

    const graph = buildMapGraph(castles, districts, roads);

    expect(graph.nodes.size).toBe(4);
    expect(graph.edges.size).toBe(3);
    expect(graph.nodes.get(CASTLE_A)).toEqual({
      id: CASTLE_A,
      kind: 'castle',
      pos: { x: 0, y: 0 },
      isPort: false,
    });
    expect(graph.nodes.get(DIST_B1)).toEqual({
      id: DIST_B1,
      kind: 'district',
      pos: { x: 110, y: 10 },
      isPort: true,
      castleId: CASTLE_B,
    });
    // 每個節點恰有其鄰接邊
    expect(graph.adjacency.get(CASTLE_A)).toEqual(['road.a-a1', 'road.a-b']);
    expect(graph.adjacency.get(CASTLE_B)).toEqual(['road.a-b', 'road.b-b1']);
    expect(graph.adjacency.get(DIST_A1)).toEqual(['road.a-a1']);
    expect(graph.adjacency.get(DIST_B1)).toEqual(['road.b-b1']);
  });

  it('鄰接表依 edgeId 字典序排序，與 Record 插入順序無關（決定論，04 §4.1／§5.1）', () => {
    // 刻意以非字典序插入：'road.z-first' 先於 'road.a-second'。
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.z-first' as RoadEdgeId]: makeRoad('road.z-first', CASTLE_A, CASTLE_B),
      ['road.a-second' as RoadEdgeId]: makeRoad('road.a-second', CASTLE_A, DIST_A1),
      ['road.m-third' as RoadEdgeId]: makeRoad('road.m-third', CASTLE_B, DIST_B1),
    };

    const graph = buildMapGraph(castles, districts, roads);

    // CASTLE_A 同時連到 'road.a-second' 與 'road.z-first'：字典序 'road.a-second' 在前。
    expect(graph.adjacency.get(CASTLE_A)).toEqual(['road.a-second', 'road.z-first']);
  });

  it('不連通 fixture：拔除橋接邊後 buildMapGraph 拋錯，訊息含未連通節點與涉及邊 id', () => {
    // 少了 CASTLE_A↔CASTLE_B 的橋接邊，圖分裂為 {A,A1} 與 {B,B1} 兩個分量。
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.a-a1' as RoadEdgeId]: makeRoad('road.a-a1', CASTLE_A, DIST_A1),
      ['road.b-b1' as RoadEdgeId]: makeRoad('road.b-b1', CASTLE_B, DIST_B1),
    };

    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/不連通/);
    try {
      buildMapGraph(castles, districts, roads);
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      // 未連通分量（依起點選擇，{B,B1} 或 {A,A1} 其一會被列為未連通）與其涉及邊 id 皆須出現。
      expect(message).toMatch(/castle\.(a|b)/);
      expect(message).toMatch(/road\.(a-a1|b-b1)/);
    }
  });

  it('完全孤立節點（無任何邊）：拋錯訊息指出該節點且標示無邊相連', () => {
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.a-a1' as RoadEdgeId]: makeRoad('road.a-a1', CASTLE_A, DIST_A1),
      ['road.a-b' as RoadEdgeId]: makeRoad('road.a-b', CASTLE_A, CASTLE_B),
      // DIST_B1 無任何邊。
    };

    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/dist\.b1/);
    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/無任何街道邊相連/);
  });

  it('街道端點不存在：拋錯訊息指出該邊 id 與缺失端點', () => {
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.bad' as RoadEdgeId]: makeRoad('road.bad', CASTLE_A, 'dist.ghost' as DistrictId),
    };

    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/road\.bad/);
    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/dist\.ghost/);
  });

  it('街道自環（a===b）：拋錯訊息指出該邊 id', () => {
    const roads: Record<RoadEdgeId, RoadEdge> = {
      ['road.loop' as RoadEdgeId]: makeRoad('road.loop', CASTLE_A, CASTLE_A),
    };

    expect(() => buildMapGraph(castles, districts, roads)).toThrow(/road\.loop/);
  });

  it('空圖（無城無郡無路）：回傳空 MapGraph，不拋錯', () => {
    const graph = buildMapGraph({}, {}, {});
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.size).toBe(0);
    expect(graph.adjacency.size).toBe(0);
  });
});
