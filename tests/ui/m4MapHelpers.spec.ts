import { describe, expect, it } from 'vitest';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from '@core/state/ids';
import { SpatialCullIndex, lodModeForScale, shouldShowDetailLabels } from '@ui/map/lod';
import {
  drawArmyChip,
  formatArmyTroops,
  layoutArmyStacks,
  moralePips,
} from '@ui/map/sceneParts/armyChip';
import { drawPathPreview, pathSegments } from '@ui/map/sceneParts/pathPreview';
import { siegeRotation } from '@ui/map/sceneParts/siegeMarker';
import { makeRec } from './sceneParts/recordingGraphics';

describe('M4 map helpers', () => {
  it('部隊旗標格式化萬位兵數並將士氣映射成三段燈號', () => {
    expect(formatArmyTroops(9_999)).toBe('9,999');
    expect(formatArmyTroops(12_500)).toBe('12,500');
    expect(moralePips(90).lit).toBe(3);
    expect(moralePips(50).lit).toBe(2);
    expect(moralePips(10).lit).toBe(1);

    const { rec, g } = makeRec();
    drawArmyChip(g, {
      pos: { x: 0, y: 0 },
      colorIndex: 2,
      soldiers: 2_000,
      morale: 80,
      corps: false,
      // M6-V8：drawArmyChip 契約擴充（ArmyChipProps 新增必填欄位）。此處以最小組合驗證旗面＋士氣：
      // friendly 於 near 時＝旗面(1 poly) ＋ 友軍靛藍雙環(2 circle) ＋ 三點士氣 pip(3 circle)。
      status: 'holding',
      foodDays: 20,
      relation: 'friendly',
      selected: false,
      heading: null,
      stage: 'near',
      labelStagger: 0,
    });
    expect(rec.countOf('circle')).toBe(5); // 友軍雙環 2 ＋ 士氣 pip 3
    expect(rec.countOf('poly')).toBe(1); // 旗面（corps false → 無腰帶；friendly → 無菱形/尾角）
  });

  it('路徑區分陸路、敵境與海路', () => {
    const a = 'castle.a' as CastleId;
    const b = 'dist.b' as DistrictId;
    const c = 'castle.c' as CastleId;
    const land = 'road.a-b-01' as RoadEdgeId;
    const sea = 'road.b-c-01' as RoadEdgeId;
    const graph: MapGraph = {
      nodes: new Map<MapNodeId, MapGraphNode>([
        [a, { id: a, kind: 'castle' as const, pos: { x: 0, y: 0 }, isPort: false }],
        [b, { id: b, kind: 'district' as const, pos: { x: 10, y: 0 }, isPort: true, castleId: a }],
        [c, { id: c, kind: 'castle' as const, pos: { x: 20, y: 0 }, isPort: false }],
      ]),
      edges: new Map([
        [land, { id: land, a, b, type: 'land' as const, grade: 1 as const, baseDays: 1 }],
        [sea, { id: sea, a: b, b: c, type: 'sea' as const, grade: 1 as const, baseDays: 1 }],
      ]),
      adjacency: new Map<MapNodeId, readonly RoadEdgeId[]>([
        [a, [land]],
        [b, [land, sea]],
        [c, [sea]],
      ]),
    };

    const result = {
      found: true,
      nodes: [a, b, c],
      edgeIds: [land, sea],
      travelDays: 2,
      subjugateDays: 2,
      totalDays: 4,
      steps: [
        { nodeId: a, etaDays: 0, needsSubjugate: false },
        { nodeId: b, etaDays: 3, needsSubjugate: true },
        { nodeId: c, etaDays: 4, needsSubjugate: false },
      ],
    };
    expect(
      pathSegments({ graph, result, originNodeId: a, targetNodeId: c }).map((s) => s.kind),
    ).toEqual(['hostile', 'sea']);
    const { rec, g } = makeRec();
    drawPathPreview(g, { graph, result, originNodeId: a, targetNodeId: c });
    expect(rec.countOf('circle')).toBe(4); // authoritative cumulative ETA includes subjugation

    const unreachable = pathSegments({
      graph,
      result: {
        found: true,
        nodes: [a],
        edgeIds: [],
        travelDays: 0,
        subjugateDays: 0,
        totalDays: 0,
        steps: [{ nodeId: a, etaDays: 0, needsSubjugate: false }],
      },
      originNodeId: a,
      targetNodeId: c,
      unreachable: true,
    });
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]).toMatchObject({ kind: 'hostile', unreachable: true });
  });

  it('LOD 門檻、空間桶查詢與攻城環轉速皆為決定論', () => {
    expect(lodModeForScale(0.49)).toBe('far');
    expect(lodModeForScale(0.5)).toBe('near');
    expect(shouldShowDetailLabels(1)).toBe(true);

    const index = new SpatialCullIndex<'a' | 'b'>();
    index.upsert('a', 10, 10);
    index.upsert('b', 2_000, 2_000);
    expect([...index.query({ left: 0, top: 0, right: 100, bottom: 100 })]).toEqual(['a']);

    expect(siegeRotation('encircle', 4_000)).toBeCloseTo(Math.PI);
    expect(siegeRotation('assault', 2_000)).toBeCloseTo(Math.PI);
    expect(siegeRotation('assault', 2_000, true)).toBe(0);
  });

  it('空間桶可承載 500 節點與 120 支移動部隊，換桶後查詢不殘留舊位置', () => {
    const index = new SpatialCullIndex<string>();
    for (let i = 0; i < 500; i += 1) {
      index.upsert(`node.${i}`, (i % 25) * 200, Math.floor(i / 25) * 200);
    }
    for (let i = 0; i < 120; i += 1) index.upsert(`army.${i}`, 3_000, 3_000);
    const origin = { left: 0, top: 0, right: 100, bottom: 100 };
    expect([...index.query(origin)].some((id) => id.startsWith('army.'))).toBe(false);

    for (let i = 0; i < 120; i += 1) index.upsert(`army.${i}`, 10, 10);
    expect([...index.query(origin)].filter((id) => id.startsWith('army.'))).toHaveLength(120);
  });

  it('500 節點/120 部隊的平移查詢有實測預算，且 5+ stack 只暴露四個命中位置', () => {
    const index = new SpatialCullIndex<string>();
    for (let i = 0; i < 620; i += 1)
      index.upsert(`item.${i}`, (i % 31) * 128, Math.floor(i / 31) * 128);
    const started = performance.now();
    for (let frame = 0; frame < 600; frame += 1) {
      const x = (frame * 17) % 3_000;
      index.query({ left: x, top: 500, right: x + 1_920, bottom: 1_580 });
    }
    expect(performance.now() - started).toBeLessThan(250);

    const layout = layoutArmyStacks(
      Array.from({ length: 6 }, (_, i) => ({
        id: `army.${i}`,
        stackKey: 'castle.a',
        pos: { x: 10, y: 20 },
      })),
    );
    expect(layout.filter((entry) => entry.visible)).toHaveLength(4);
    expect(layout[3]).toMatchObject({ pos: { x: 52, y: 20 }, collapsedCount: 3 });
  });
});
