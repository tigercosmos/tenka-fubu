// 勢力色 TerritoryGrid（src/ui/map/territoryGrid.ts）純函式測試。
// 規格：plan/04-map-and-movement.md §4.4（TerritoryGrid 型別）／§5.5（buildTerritoryGrid／
// recolorTerritory 演算法）；18-roadmap.md M2-14（04-T9）；驗收：翻轉次幀更新（同步呼叫立即反映）。
//
// 於 core（node）project 執行（tests/**/*.spec.ts）：本檔對 pixi.js 無相依，與 mapDraw.spec.ts
// 同慣例，直接以純函式輸出斷言（17 §3.2）。MapGraph 直接建構（不經 buildMapGraph），因
// buildTerritoryGrid 只消費 graph.nodes，不需連通性驗證所需之城/街道。

import { describe, expect, it } from 'vitest';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import type { DistrictId, MapNodeId } from '@core/state/ids';
import type { JapanOutlineFile } from '@data/schemas/outline';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import { clanDyeNum } from '@ui/styles/tokens';
import { buildTerritoryGrid, recolorTerritory, type TerritoryGrid } from '@ui/map/territoryGrid';

const SEA_OR_FAR = 0xffff;
const CELL_W = 4; // WORLD_SIZE(4096) / territoryGridSize(1024)（04 §5.5）

interface DistrictSpec {
  id: string;
  x: number;
  y: number;
}

/** 最小 MapGraph fixture：只放郡節點（buildTerritoryGrid 僅消費 graph.nodes）。 */
function makeGraph(districts: readonly DistrictSpec[]): MapGraph {
  const nodes = new Map<MapNodeId, MapGraphNode>();
  for (const d of districts) {
    const id = d.id as DistrictId;
    nodes.set(id, { id, kind: 'district', pos: { x: d.x, y: d.y }, isPort: false });
  }
  return { nodes, edges: new Map(), adjacency: new Map() };
}

function square(size: number): JapanOutlineFile {
  return {
    version: 1,
    source: 'handcrafted',
    polygons: [{ id: 'test-square', points: [0, 0, size, 0, size, size, 0, size] }],
  };
}

/** cell 中心世界座標對齊之索引（(cx+0.5)*CELL_W == world 座標時的 cx）。 */
function cellIndexAt(worldCoord: number): number {
  return worldCoord / CELL_W - 0.5;
}

function pixelAt(
  grid: TerritoryGrid,
  cx: number,
  cy: number,
): { r: number; g: number; b: number; a: number } {
  const o = (cy * grid.size + cx) * 4;
  const d = grid.imageData.data;
  return { r: d[o] ?? 0, g: d[o + 1] ?? 0, b: d[o + 2] ?? 0, a: d[o + 3] ?? 0 };
}

describe('buildTerritoryGrid（04 §5.5）', () => {
  it('回傳 size=MAPVIEW.territoryGridSize、districtIds 依 id 字典序、nearestDistrict 長度= size²', () => {
    const graph = makeGraph([
      { id: 'dist.bb', x: 10, y: 10 },
      { id: 'dist.aa', x: 20, y: 20 },
    ]);
    const grid = buildTerritoryGrid(graph, square(100));
    expect(grid.size).toBe(MAPVIEW.territoryGridSize);
    expect(grid.districtIds).toEqual(['dist.aa', 'dist.bb']); // 字典序，非輸入順序
    expect(grid.nearestDistrict.length).toBe(grid.size * grid.size);
  });

  it('cell 中心不在任何 outline polygon 內 → SEA_OR_FAR（0xFFFF）', () => {
    const graph = makeGraph([{ id: 'dist.aa', x: 10, y: 10 }]);
    const grid = buildTerritoryGrid(graph, square(100)); // outline 僅涵蓋 0..100
    // 世界座標 (500,500) 遠在 outline 之外。
    const cx = Math.floor(cellIndexAt(500));
    const cy = cx;
    expect(grid.nearestDistrict[cy * grid.size + cx]).toBe(SEA_OR_FAR);
  });

  it('陸地但最近郡距離 > territoryMaxDist → SEA_OR_FAR', () => {
    // 大範圍 outline（0..2000），單一郡在角落；遠端另一角落陸地 cell 距離必超過 260。
    const graph = makeGraph([{ id: 'dist.aa', x: 100, y: 100 }]);
    const grid = buildTerritoryGrid(graph, square(2000));
    const cx = Math.floor(cellIndexAt(1900));
    const cy = cx;
    const px = (cx + 0.5) * CELL_W;
    const py = (cy + 0.5) * CELL_W;
    expect(Math.hypot(px - 100, py - 100)).toBeGreaterThan(MAPVIEW.territoryMaxDist);
    expect(grid.nearestDistrict[cy * grid.size + cx]).toBe(SEA_OR_FAR);
  });

  it('陸地且距離在 territoryMaxDist 內 → 標記最近郡索引', () => {
    const graph = makeGraph([
      { id: 'dist.aa', x: 10, y: 10 },
      { id: 'dist.bb', x: 190, y: 10 },
    ]);
    const grid = buildTerritoryGrid(graph, square(200));
    const cxA = cellIndexAt(10);
    const cyA = cellIndexAt(10);
    expect(Number.isInteger(cxA)).toBe(true); // seed 精確對齊 cell 中心，斷言精確索引
    expect(grid.nearestDistrict[cyA * grid.size + cxA]).toBe(grid.districtIds.indexOf('dist.aa'));
  });

  it('無郡節點（空圖）→ 全網格皆 SEA_OR_FAR，不 throw', () => {
    const grid = buildTerritoryGrid(makeGraph([]), square(200));
    expect(grid.districtIds).toEqual([]);
    // 抽樣檢查幾個 cell 皆為 SEA_OR_FAR。
    for (const i of [0, 1000, grid.size * grid.size - 1]) {
      expect(grid.nearestDistrict[i]).toBe(SEA_OR_FAR);
    }
  });
});

describe('recolorTerritory（04 §5.5：pass1 勢力索引／pass2 base 色＋界線烘焙）', () => {
  // 三郡精確對齊 cell 中心（座標為 4 的倍數＋2，見 cellIndexAt），避免浮點最近鄰邊界疑義。
  const A = { id: 'dist.aa', x: 10, y: 10 }; // clan.oda（colorIndex 0）
  const B = { id: 'dist.bb', x: 190, y: 10 }; // clan.imagawa（colorIndex 5）
  const C = { id: 'dist.cc', x: 10, y: 190 }; // 無主

  function fixture(): {
    grid: TerritoryGrid;
    cxA: number;
    cyA: number;
    cxB: number;
    cyB: number;
    cxC: number;
    cyC: number;
  } {
    const graph = makeGraph([A, B, C]);
    const grid = buildTerritoryGrid(graph, square(200));
    return {
      grid,
      cxA: cellIndexAt(A.x),
      cyA: cellIndexAt(A.y),
      cxB: cellIndexAt(B.x),
      cyB: cellIndexAt(B.y),
      cxC: cellIndexAt(C.x),
      cyC: cellIndexAt(C.y),
    };
  }

  it('owner cell → clanDyeNum(colorIndex)（染紙軌），alpha=255；無主 → MAPVIEW.colors.neutral', () => {
    const { grid, cxA, cyA, cxB, cyB, cxC, cyC } = fixture();
    recolorTerritory(
      grid,
      { 'dist.aa': 'clan.oda', 'dist.bb': 'clan.imagawa', 'dist.cc': null },
      { 'clan.oda': 0, 'clan.imagawa': 5 },
    );

    const pxA = pixelAt(grid, cxA, cyA);
    const oda = clanDyeNum(0);
    expect(pxA).toEqual({
      r: (oda >> 16) & 0xff,
      g: (oda >> 8) & 0xff,
      b: oda & 0xff,
      a: 255,
    });

    const pxB = pixelAt(grid, cxB, cyB);
    const imagawa = clanDyeNum(5);
    expect(pxB).toEqual({
      r: (imagawa >> 16) & 0xff,
      g: (imagawa >> 8) & 0xff,
      b: imagawa & 0xff,
      a: 255,
    });

    const pxC = pixelAt(grid, cxC, cyC);
    const neutral = MAPVIEW.colors.neutral;
    expect(pxC).toEqual({
      r: (neutral >> 16) & 0xff,
      g: (neutral >> 8) & 0xff,
      b: neutral & 0xff,
      a: 255,
    });
  });

  it('海 cell → 全透明（alpha=0），不受 owner 影響', () => {
    const { grid } = fixture();
    recolorTerritory(grid, { 'dist.aa': 'clan.oda' }, { 'clan.oda': 0 });
    // (500,500) 遠在 outline（0..200）之外，恆為海。
    const cx = Math.floor(cellIndexAt(500));
    const cy = cx;
    const px = pixelAt(grid, cx, cy);
    expect(px.a).toBe(0);
  });

  it('兩勢力邊界：交界兩側 cell 朝 borderInk 以 borderInkMix 混合（紙墨邊），非邊界 cell 維持原色', () => {
    const { grid, cxA, cyA } = fixture();
    recolorTerritory(
      grid,
      { 'dist.aa': 'clan.oda', 'dist.bb': 'clan.imagawa', 'dist.cc': null },
      { 'clan.oda': 0, 'clan.imagawa': 5 },
    );
    // A(10,10)/B(190,10) 等距點在 x=100；cellW=4 時邊界恰落在 cx=24（center 98，較近 A）與
    // cx=25（center 102，較近 B）之間（見模組內 findNearestDistrict／本測試已知世界座標推導）。
    const cyRow = cyA; // y=10 所在列
    const left = pixelAt(grid, 24, cyRow);
    const right = pixelAt(grid, 25, cyRow);
    const oda = clanDyeNum(0);
    const inkNum = MAPVIEW.colors.borderInk;
    const inkMix = MAPVIEW.colors.borderInkMix;
    // M6-V9 §1.4：edge.rgb = round(dye.rgb × (1 − borderInkMix) + borderInk.rgb × borderInkMix)。
    const mixToward = (channel: number, inkChannel: number): number =>
      Math.round(channel * (1 - inkMix) + inkChannel * inkMix);
    const expectedLeft = {
      r: mixToward((oda >> 16) & 0xff, (inkNum >> 16) & 0xff),
      g: mixToward((oda >> 8) & 0xff, (inkNum >> 8) & 0xff),
      b: mixToward(oda & 0xff, inkNum & 0xff),
      a: 255,
    };
    expect(left).toEqual(expectedLeft);
    expect(right).not.toEqual(expectedLeft); // 另一側是 imagawa 染紙色（已各自上墨）

    // 非邊界 cell（緊鄰 dist.aa seed 本身）維持原色，不變暗。
    const untouched = pixelAt(grid, cxA, cyA);
    expect(untouched).toEqual({
      r: (oda >> 16) & 0xff,
      g: (oda >> 8) & 0xff,
      b: oda & 0xff,
      a: 255,
    });
  });

  it('郡歸屬翻轉：立即再次呼叫 recolorTerritory 即反映新色（次幀更新之純函式基礎）', () => {
    const { grid, cxA, cyA } = fixture();
    recolorTerritory(
      grid,
      { 'dist.aa': 'clan.oda', 'dist.bb': 'clan.imagawa', 'dist.cc': null },
      { 'clan.oda': 0, 'clan.imagawa': 5 },
    );
    const before = pixelAt(grid, cxA, cyA);
    const oda = clanDyeNum(0);
    expect(before).toEqual({ r: (oda >> 16) & 0xff, g: (oda >> 8) & 0xff, b: oda & 0xff, a: 255 });

    // 制壓：dist.aa 翻轉為 imagawa。
    recolorTerritory(
      grid,
      { 'dist.aa': 'clan.imagawa', 'dist.bb': 'clan.imagawa', 'dist.cc': null },
      { 'clan.oda': 0, 'clan.imagawa': 5 },
    );
    const after = pixelAt(grid, cxA, cyA);
    const imagawa = clanDyeNum(5);
    expect(after).toEqual({
      r: (imagawa >> 16) & 0xff,
      g: (imagawa >> 8) & 0xff,
      b: imagawa & 0xff,
      a: 255,
    });
  });

  it('clanColorIndex 缺 owner 對照或索引非法 → 退回中性灰（不 throw，同 mapDraw ownerColor 慣例）', () => {
    const { grid, cxA, cyA } = fixture();
    recolorTerritory(grid, { 'dist.aa': 'clan.unknown' }, {});
    const px = pixelAt(grid, cxA, cyA);
    const neutral = MAPVIEW.colors.neutral;
    expect(px).toEqual({
      r: (neutral >> 16) & 0xff,
      g: (neutral >> 8) & 0xff,
      b: neutral & 0xff,
      a: 255,
    });
  });
});
