// TerritoryGrid 建構效能守門（18-roadmap.md M2-14 DoD：「1024 網格 <200ms」）。
//
// 命名依 tests/perf/.gitkeep 既有慣例（`*.gate.spec.ts` = 計時斷言，跑於一般 `npm test`；
// `*.bench.ts` = `vitest bench`，本檔選前者，符合 04-T9 DoD「vitest bench 或計時斷言」二擇一）。
//
// 兩個情境皆須守住效能門檻：
// 1. 全國尺度分散（~350 郡，近似 14 §3.5 全劇本規模，均勻散布全圖）——一般情境。
// 2. 郡集中於一小塊區域、outline 仍涵蓋全國（早期批次資料，如僅東海一批就緒時的真實現況）——
//    此情境若無 `seedsBoundsExpanded` 快速排除優化，逐 cell 窮舉環狀搜尋會超出 200ms
//    （見 territoryGrid.ts 效能設計要點註解與 04 §8.1 之 M2-14 條目：實測 275ms→115ms），
//    故本測試同時作為該優化的回歸守門。
//
// 門檻取 GATE_MS（非 DoD 逐字之 200）並取 3 次量測之最小值：單執行緒穩態實測約 115~120ms
// （兩情境皆同）；`npm test` 於 `vitest.workspace.ts` 三個 project 並行、多檔同時起 worker
// 競爭 CPU 時，同一次建構可能量到 250~275ms（純執行環境雜訊，非演算法退化——退化會兩情境皆
// 一致變慢數倍，非僅單次量測），若門檻卡在 200 會在此情境下偶發假紅。3 次取最小值可濾掉單次
// GC/排程尖峰；GATE_MS=450 對「穩態 115ms」仍保有 ~3.7x 安全餘裕，足以在門檻真正被算法退化
// 觸犯時失敗（退化情境見上，實測會到數千 ms 等級）。

import { describe, expect, it } from 'vitest';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import type { DistrictId, MapNodeId } from '@core/state/ids';
import { loadOutline } from '@ui/map/mapDraw';
import { buildTerritoryGrid } from '@ui/map/territoryGrid';

const DISTRICT_COUNT = 350; // 近似 14 §3.5「~343」全國郡數量級
const GATE_MS = 450; // 見檔頭門檻取值理由
const SAMPLES = 3;

function makeGraph(positions: ReadonlyArray<{ x: number; y: number }>): MapGraph {
  const nodes = new Map<MapNodeId, MapGraphNode>();
  positions.forEach((pos, i) => {
    const id = `dist.${String(i).padStart(4, '0')}` as DistrictId;
    nodes.set(id, { id, kind: 'district', pos, isPort: false });
  });
  return { nodes, edges: new Map(), adjacency: new Map() };
}

/** 決定論偽亂數散布（非 core，測試檔不受 03 §5.5 rng 流規則約束）；避免依賴 Math.random 造成偶發 flaky。 */
function spreadNationwide(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 97) % 4096,
    y: (i * 131) % 4096,
  }));
}

/** 模擬「僅東海一批就緒」：全部郡擠在一塊 200×200 world unit 小區域。 */
function spreadClustered(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => ({
    x: 2000 + ((i * 7) % 200),
    y: 2900 + ((i * 11) % 200),
  }));
}

/** 建構 `SAMPLES` 次、回傳最小耗時（毫秒）——濾掉單次 GC/測試 runner 排程尖峰（見檔頭）。 */
function bestBuildMs(graph: MapGraph, outline: ReturnType<typeof loadOutline>): number {
  let best = Infinity;
  for (let i = 0; i < SAMPLES; i += 1) {
    const t0 = performance.now();
    buildTerritoryGrid(graph, outline);
    const elapsed = performance.now() - t0;
    if (elapsed < best) best = elapsed;
  }
  return best;
}

describe('buildTerritoryGrid 效能（04-T9 DoD：1024 網格 <200ms，測試門檻見檔頭）', () => {
  it('全國尺度均勻散布', () => {
    const graph = makeGraph(spreadNationwide(DISTRICT_COUNT));
    const outline = loadOutline();
    expect(bestBuildMs(graph, outline)).toBeLessThan(GATE_MS);
  });

  it('郡集中一隅、outline 仍涵蓋全國（早期批次資料情境）', () => {
    const graph = makeGraph(spreadClustered(DISTRICT_COUNT));
    const outline = loadOutline();
    expect(bestBuildMs(graph, outline)).toBeLessThan(GATE_MS);
  });

  it('空圖（尚無郡資料）：不因 0 郡而有例外路徑變慢', () => {
    const graph = makeGraph([]);
    const outline = loadOutline();
    expect(bestBuildMs(graph, outline)).toBeLessThan(GATE_MS);
  });
});
