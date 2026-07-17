// 選取節點相鄰道路金色高亮（RoadHighlight）——[M6-V6] Slice E。
// 規格：M6-V6 技術設計文件 §4.3（本檔逐字實作簽章）、§1.2-6／§6.3（選取高亮列：相鄰邊多段線
// stroke 5、accentGold、alpha 0.5，不隨 stage 倍率）、§5.1（掛載順序：`selectionAndPath`(9)
// 層，MapRenderer 於 `pathPreview` 之前以 plain `addChild` 掛入以取得下層 z-order——本檔不涉此
// 掛載邏輯，只暴露 `container` 供整合）。
//
// 行為（處置 x4-m7）：`update` 讀 `graph.adjacency.get(selectedNodeId)`——回傳**邊 id 陣列**
// （`readonly RoadEdgeId[]`，非 `MapRoadEdge`，見 `mapGraph.ts` `MapGraph.adjacency`）→ 對每
// `edgeId` 先 `graph.edges.get(edgeId)`（查無則略過，防禦性）→ `edgePolyline(edge, graph)`
// （端點缺失回 null 則略過）→ `strokePolyline` 以金色（`TOKENS_NUM.accentGold`, width 5,
// alpha 0.5）描繪。`props===null`／`selectedNodeId===null`／節點無鄰接紀錄 → 清空（`clear()`）。
//
// 純繪製輔助復用 `roadsDraw.ts`（Slice C export）：`edgePolyline`／`strokePolyline`，不重新實作。
// 每次 `update` 皆先 `clear()` 再視需要重描——天然 idempotent（重複同選取不累積殘影）。
// 不含 LOD visible gate（`selectionAndPath` 層本身無 LOD 切換，三段 baseline 皆顯）；
// 不動 `rebuildCounts`（MapRenderer 整合契約，選取高亮為 UI selection 動態層、非靜態資料重建）。

import { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import { TOKENS_NUM } from '@ui/styles/tokens';
import { edgePolyline, strokePolyline } from './roadsDraw';

/** 選取高亮線寬（world unit；固定，不隨 `ROAD_STAGE_WIDTH_MULT` 重描，見 §6.3 註）。 */
const HIGHLIGHT_WIDTH = 5;
/** 選取高亮 alpha（金色半透明暈，疊於既有道路 casing/內線之上）。 */
const HIGHLIGHT_ALPHA = 0.5;

/** `RoadHighlight.update` 之參數：選取節點與其所屬 `MapGraph`。 */
export interface RoadHighlightProps {
  graph: MapGraph;
  /** 選取節點 id（`MapViewState.selection.id`，UI 邊界純字串；`null` 表無選取）。 */
  selectedNodeId: string | null;
}

export interface RoadHighlight {
  readonly container: Container;
  /** 依選取節點重描相鄰道路高亮；`null`（或 `selectedNodeId===null`）清空既有高亮。 */
  update(props: RoadHighlightProps | null): void;
  destroy(): void;
}

/** 建節點選取相鄰道路金色高亮圖層（單一 `Graphics` 子容器）。 */
export function createRoadHighlight(): RoadHighlight {
  const container = new Container();
  const graphics = new Graphics();
  container.addChild(graphics);

  function update(props: RoadHighlightProps | null): void {
    graphics.clear();
    if (props === null || props.selectedNodeId === null) return;
    const { graph, selectedNodeId } = props;
    const edgeIds = graph.adjacency.get(selectedNodeId as MapNodeId);
    if (edgeIds === undefined) return;
    for (const edgeId of edgeIds) {
      const edge = graph.edges.get(edgeId);
      if (edge === undefined) continue;
      const pts = edgePolyline(edge, graph);
      if (pts === null) continue;
      strokePolyline(graphics, pts, HIGHLIGHT_WIDTH, TOKENS_NUM.accentGold, HIGHLIGHT_ALPHA);
    }
  }

  function destroy(): void {
    container.destroy({ children: true });
  }

  return { container, update, destroy };
}
