// 地圖靜態圖層的純繪製輔助函式（seaBackground）。
//
// 規格：plan/04-map-and-movement.md §3.10.1（圖層 0 海陸背景）、§3.2（世界座標）。
// M2-13（04-T8「outline 與街道繪製」）。
//
// M6-V6（V6D10）：道路繪製（舊 `drawRoads`／`addDashedPath`／`endpointsOf`）已汰除，改由
// `src/ui/map/roads/roadsDraw.ts` 之 `buildRoadsLayer` 承接。
// M6-V7（DoD 硬項）：占位節點標記（`drawNodeMarker`／`drawNodeMarkers`／`regularPolygon`／
// `ownerColor`）已移除，nodeMarkers 改由 `sceneParts/castleNode`／`districtNode` 元件繪製
// （`MapRenderer.buildStaticDataLayers`）。本檔僅保留 seaBackground。
//
// 設計要點：
// - 本檔為**純函式**：只對傳入的 Pixi `Graphics` 呼叫繪製指令，不持有狀態、不建立 Application、
//   不碰 DOM。`Graphics` 僅以 `import type` 引入（verbatimModuleSyntax 下於執行期抹除），故本檔可在
//   node 測試環境以「錄製用 mock」直接驗證繪製指令序列，無需 Pixi 執行期（17 §3.2；jsdom 外亦可跑）。
// - 數值：海陸色走 mapViewConfig（非 BAL，04 §4.5/§8-D8）。

import type { Graphics } from 'pixi.js';
import outlineJson from '@data/map/japan-outline.json';
import { zJapanOutlineFile, type JapanOutlineFile } from '@data/schemas/outline';
import { MAPVIEW, SEA_SURFACE, WORLD_SIZE } from './mapViewConfig';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import type { OutlineGeometry } from './displayCoast';

let cachedOutline: JapanOutlineFile | null = null;

/**
 * 內建日本海岸線 outline（`@data/map/japan-outline.json`，04 §3.3）；經 zod 驗證後快取。
 * 渲染器 init 時繪製 seaBackground 用；亦供無 outline 覆蓋的測試共用。
 */
export function loadOutline(): JapanOutlineFile {
  if (cachedOutline === null) {
    cachedOutline = zJapanOutlineFile.parse(outlineJson);
  }
  return cachedOutline;
}

/**
 * 圖層 0「seaBackground」：全世界海色矩形＋各島陸地多邊形填色（04 §3.10.1）。
 * 靜態一次建立（整局不變）。座標為世界座標（world unit）。
 */
export function drawSeaBackground(
  g: Graphics,
  outline: OutlineGeometry,
  options: { coast?: boolean; land?: boolean; detail?: boolean } = {},
): void {
  g.clear();
  // 海：鋪滿整個 4096×4096 世界空間。
  g.rect(0, 0, WORLD_SIZE, WORLD_SIZE).fill({ color: MAPVIEW.colors.sea });
  // Broad, quiet daylight variation and sparse short swells are static world paint.
  // Land is filled last, so the surface never covers authored islands or changes picking.
  for (let row = 0; row < (options.detail === false ? 0 : SEA_SURFACE.bands); row++) {
    const t = (row + 0.5) / SEA_SURFACE.bands;
    const mix = SEA_SURFACE.lightMix * (0.3 + 0.7 * Math.sin(t * Math.PI));
    const color = [16, 8, 0].reduce(
      (value, shift) =>
        value |
        (Math.round(
          ((MAPVIEW.colors.sea >> shift) & 255) * (1 - mix) +
            ((MAP_PALETTE_NUM.waterRiver >> shift) & 255) * mix,
        ) <<
          shift),
      0,
    );
    g.rect(
      0,
      (row * WORLD_SIZE) / SEA_SURFACE.bands,
      WORLD_SIZE,
      WORLD_SIZE / SEA_SURFACE.bands,
    ).fill({ color });
  }
  for (let row = 0; row < (options.detail === false ? 0 : SEA_SURFACE.swellRows); row++) {
    for (let col = 0; col < SEA_SURFACE.swellColumns; col++) {
      const phase = row * 2.31 + col * 1.73;
      const cellWidth = WORLD_SIZE / SEA_SURFACE.swellColumns;
      const cellHeight = WORLD_SIZE / SEA_SURFACE.swellRows;
      const x = (col + 0.28 + Math.sin(phase) * 0.1) * cellWidth;
      const y = (row + 0.45 + Math.cos(phase * 0.7) * 0.2) * cellHeight;
      const length = cellWidth * (0.28 + 0.14 * (1 + Math.sin(phase * 0.6)));
      g.moveTo(x, y);
      for (let step = 1; step <= 4; step++) {
        const t = step / 4;
        g.lineTo(x + length * t, y + Math.sin(t * Math.PI + phase) * 1.6);
      }
      g.stroke({
        color: MAP_PALETTE_NUM.waterRiver,
        alpha: SEA_SURFACE.swellAlpha,
        width: SEA_SURFACE.swellWidth,
        cap: 'round',
        join: 'round',
      });
    }
  }
  // Water-side coastal fringe follows the supplied display polygon. Canonical
  // geography remains loader/interaction-owned. Draw fringe before opaque land so its landward
  // half is covered, including neighboring islands; no overland shadow remains.
  for (const poly of options.coast === false ? [] : outline.polygons) {
    if (poly.points.length < 6) continue;
    for (const tone of SEA_SURFACE.coast) {
      g.poly([...poly.points]).stroke({
        ...tone,
        color: MAP_PALETTE_NUM.waterRiver,
        join: 'round',
      });
    }
  }
  if (options.land !== false) drawLandBackground(g, outline);
}

/** Opaque land pass, after the water-side shelf and before ground materials. */
export function drawLandBackground(g: Graphics, outline: OutlineGeometry): void {
  // 陸：各島多邊形（points 為扁平世界座標，逆時針纏繞，渲染時自動閉合）。
  for (const poly of outline.polygons) {
    if (poly.points.length >= 6) {
      g.poly([...poly.points]).fill({ color: MAPVIEW.colors.land });
    }
  }
}
