// MiniMap 純繪製輔助函式與世界／小地圖座標換算（12-ui-components.md §3.2.12／§5.5）。
//
// 規格：
// - 座標換算（§5.5）：`s = size / 4096`；`world→mini`：`(wx*s, wy*s)`；`mini→world` 為其逆換算。
//   世界邊長 4096 取自 `@ui/map/mapViewConfig` 之 `WORLD_SIZE`（單一真相見該檔頭註解：
//   投影常數之權威為 `@data/map/projection` `PROJECTION.worldSize`，此處沿用既有 UI 層慣例）。
// - 繪製順序（§5.5）：輪廓多邊形（washi300 填、ink300 0.5px 描）→ 城點（3px 方點，clanColor）
//   → 部隊點（2px 圓點，clanColorBright）→（框層）viewport 矩形（gold 1.5px）。
//
// 本檔為**純函式**：只對傳入的 2D context 呼叫繪製指令，不持有狀態、不建立 canvas、不碰 DOM
// 事件；`MiniMapDrawCtx` 為 `CanvasRenderingContext2D` 的最小子集介面（僅本檔用到的成員），
// 與 `src/ui/map/mapDraw.ts` 對 Pixi `Graphics` 的處理同一手法——可在 node 測試環境以錄製用
// mock 直接驗證繪製指令序列，無需真的 canvas 2D 實作（jsdom 預設不含，17 §3.2）。

import type { MiniMapModel, MiniMapPoint } from '@core/state/selectors';
import { clanColorHex } from '@ui/styles/tokens';
import { TOKENS } from '@ui/styles/tokens';
import { WORLD_SIZE } from '@ui/map/mapViewConfig';

/** 平面座標點（世界或小地圖座標皆用此形狀，依呼叫端上下文區分）。 */
export interface Point2D {
  x: number;
  y: number;
}

/** MiniMap 主鏡頭可視範圍（世界座標；12 §3.2.12 `MiniMapProps.viewport`）。 */
export interface MiniMapViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `CanvasRenderingContext2D` 的最小子集（本檔繪製指令僅用到以下成員）。 */
export interface MiniMapDrawCtx {
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
}

/** 城點方形邊長（px，§5.5「城點（3px 方點）」）。 */
const CASTLE_POINT_SIZE = 3;
/** 部隊點半徑（px，§5.5「部隊點（2px 圓點）」＝直徑 2px）。 */
const ARMY_POINT_RADIUS = 1;
/** 輪廓描邊寬（px，§5.5）。 */
const OUTLINE_STROKE_WIDTH = 0.5;
/** viewport 框線寬（px，§5.5「gold 1.5px」）。 */
const VIEWPORT_FRAME_WIDTH = 1.5;

/** world → mini 座標換算（§5.5：`s = size/4096; mx = wx*s; my = wy*s`）。 */
export function worldToMini(world: Point2D, size: number): Point2D {
  const s = size / WORLD_SIZE;
  return { x: world.x * s, y: world.y * s };
}

/** mini → world 座標換算（§5.5 逆換算）。 */
export function miniToWorld(mini: Point2D, size: number): Point2D {
  const s = size / WORLD_SIZE;
  return { x: mini.x / s, y: mini.y / s };
}

/** owner 勢力色（無主／查無勢力＝中性灰 `TOKENS.color.neutralClanless`）。 */
function pointColor(point: MiniMapPoint, bright: boolean): string {
  return point.colorIndex === null
    ? TOKENS.color.neutralClanless
    : clanColorHex(point.colorIndex, bright);
}

/**
 * 底圖層（§5.5 繪製順序前三項）：輪廓多邊形 → 城點 → 部隊點。呼叫端負責節流
 * （`model.version` 變更且距上次重繪 ≥ `UI.minimapRedrawMs` 時才呼叫本函式，12 §5.5）。
 */
export function drawMiniMapBase(ctx: MiniMapDrawCtx, model: MiniMapModel, size: number): void {
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = TOKENS.color.washi300;
  ctx.strokeStyle = TOKENS.color.ink300;
  ctx.lineWidth = OUTLINE_STROKE_WIDTH;
  for (const polygon of model.outline) {
    const first = polygon[0];
    if (first === undefined) continue;
    const p0 = worldToMini(first, size);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < polygon.length; i += 1) {
      const pt = polygon[i];
      if (pt === undefined) continue;
      const p = worldToMini(pt, size);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  for (const castle of model.castles) {
    ctx.fillStyle = pointColor(castle, false);
    const p = worldToMini(castle, size);
    ctx.fillRect(
      p.x - CASTLE_POINT_SIZE / 2,
      p.y - CASTLE_POINT_SIZE / 2,
      CASTLE_POINT_SIZE,
      CASTLE_POINT_SIZE,
    );
  }

  for (const army of model.armies) {
    ctx.fillStyle = pointColor(army, true);
    const p = worldToMini(army, size);
    ctx.beginPath();
    ctx.arc(p.x, p.y, ARMY_POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 框層（§5.5 繪製順序末項）：viewport 矩形（gold 1.5px）。每幀清除重畫（成本可忽略）。 */
export function drawMiniMapViewportFrame(
  ctx: MiniMapDrawCtx,
  viewport: MiniMapViewport,
  size: number,
): void {
  ctx.clearRect(0, 0, size, size);
  const topLeft = worldToMini({ x: viewport.x, y: viewport.y }, size);
  const s = size / WORLD_SIZE;
  ctx.strokeStyle = TOKENS.color.accentGold;
  ctx.lineWidth = VIEWPORT_FRAME_WIDTH;
  ctx.strokeRect(topLeft.x, topLeft.y, viewport.width * s, viewport.height * s);
}
