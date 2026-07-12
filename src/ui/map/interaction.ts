// 地圖互動：命中測試＋idle 模式指標事件＋React `useMapEvents` hook。
//
// 規格：plan/04-map-and-movement.md §3.12.1（命中測試：單一指標事件＋空間查詢，命中半徑與優先序
// 部隊16>城(本城20/支城16)>郡12>無，多候選取最近者，街道邊不可點擊）／§3.12.2（idle 模式事件協定：
// hover→`nodeHover`、左鍵→`nodeClick`/`armyClick`、右鍵→`rightClick`）／§6.1（tooltip 跟隨游標）。
// 18-roadmap.md M2-17（04-T12 部分）：本檔僅落地 **idle 模式**；`orderMarch` 模式（`setMode`、
// hover 即時 `computePath`＋`pathPreviewHover`、左鍵送出行軍、右鍵/ESC 取消回 idle）留待
// M4-14「11-T6、04-T12 剩餘」（出陣編成 modal 隨附地圖直選）與 M2-15 鏡頭補上 `cameraChanged` 節流。
//
// 設計要點：
// - `hitTestWorldPoint`／`screenToWorld` 為**純函式**，只吃世界座標／`MapGraph`／plain transform，
//   不依賴 Pixi 型別（`MapRenderer` 呼叫端把 `FederatedPointerEvent.global` 攤平為 x/y 再傳入），
//   故可在無 pixi.js 執行期的環境單元測試（同 mapDraw.ts 慣例，17 §3.2）。`screenToWorld` 沿用
//   `camera.ts`（M2-15）之 `WorldTransform`（`{scale,x,y}`，即套用於 Pixi `world` 容器的
//   `position`/`scale`）以避免與該檔重複定義同語意型別；`Camera` 已於 `MapRenderer` 接線（滾輪縮放／
//   拖曳平移／慣性／focusOn，每幀經 ticker 套用變換至 `world` 容器），本檔按 `world` 容器「當下」之
//   position/scale 換算命中座標，與鏡頭如何驅動該容器無關、恆正確。
// - `MapInteraction` 持有「目前 idle 命中測試所需的靜態資料」（`graph`／`castleTier`），由
//   `MapRenderer.setMapData` 呼叫 `setStaticData` 同步；未載入資料時一律無命中（`emptyClick`／
//   hover 移出），與 M2-13 既有測試（`init` 後未 `setMapData` 即 tap → `emptyClick`）行為一致。
// - 部隊命中（優先序最高）之資料來源（`MapViewState.armies`）待 M5 armies 層落地才存在；
//   `hitTestWorldPoint` 已依 §3.12.1 完整實作優先序（含 army 分支，供該里程碑直接餵資料、
//   單元測試以合成 fixture 驗證），但 `MapInteraction` 目前恆傳空陣列，故 army 分支現階段不會
//   被觸發（非死碼——型別與測試皆涵蓋，僅待 M5 接線）。

import { useCallback, useRef } from 'react';
import type { MapGraph } from '@core/state/mapGraph';
import type { CastleTier } from '@core/state/enums';
import { MAPVIEW } from './mapViewConfig';
import type { WorldTransform } from './camera';
import type { MapEventHandler, MapRendererEvent } from './mapViewTypes';

export type { WorldTransform };

/** 城 id → 城格；供命中半徑判定（04 §3.12.1）。未列出的城視為支城（較小半徑，保守）。 */
export type CastleTierLookup = Readonly<Record<string, CastleTier>>;

/** 命中測試用的最小部隊形狀（04 §3.12.1 優先序最高；部隊圖層屬 M5，見檔頭說明）。 */
export interface HitTestArmy {
  id: string;
  pos: { x: number; y: number };
}

/** 命中測試結果（04 §3.12.1：部隊／城／郡三種候選 kind）。 */
export type HitResult = { kind: 'army'; id: string } | { kind: 'castle' | 'district'; id: string };

interface HitTestOptions {
  castleTier?: CastleTierLookup;
  armies?: readonly HitTestArmy[];
}

/** 平面上兩點距離（world unit）。 */
function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 在候選集合中找出「距離 ≤ 半徑」且最近的一個；查無回傳 `null`（§3.12.1「多個候選時取距離最近者」）。 */
function nearestWithinRadius<T>(
  worldX: number,
  worldY: number,
  items: readonly T[],
  posOf: (item: T) => { x: number; y: number },
  radiusOf: (item: T) => number,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    const p = posOf(item);
    const d = distance(worldX, worldY, p.x, p.y);
    if (d <= radiusOf(item) && d < bestDist) {
      best = item;
      bestDist = d;
    }
  }
  return best;
}

/**
 * 世界座標下的命中測試（04 §3.12.1）：依優先序（高→低）部隊 > 城 > 郡，同層有多個候選時取最近者；
 * 街道邊不參與命中（不可點擊）。城半徑依 `castleTier` 查表分本城 20／支城 16（缺省視為支城）。
 */
export function hitTestWorldPoint(
  worldX: number,
  worldY: number,
  graph: MapGraph,
  opts: HitTestOptions = {},
): HitResult | null {
  const armies = opts.armies ?? [];
  const castleTier = opts.castleTier ?? {};

  const army = nearestWithinRadius(
    worldX,
    worldY,
    armies,
    (a) => a.pos,
    () => MAPVIEW.hitRadius.army,
  );
  if (army !== null) return { kind: 'army', id: army.id };

  const nodes = [...graph.nodes.values()];
  const castles = nodes.filter((n) => n.kind === 'castle');
  const castle = nearestWithinRadius(
    worldX,
    worldY,
    castles,
    (n) => n.pos,
    (n) =>
      castleTier[n.id] === 'main' ? MAPVIEW.hitRadius.castleMain : MAPVIEW.hitRadius.castleBranch,
  );
  if (castle !== null) return { kind: 'castle', id: castle.id };

  const districts = nodes.filter((n) => n.kind === 'district');
  const district = nearestWithinRadius(
    worldX,
    worldY,
    districts,
    (n) => n.pos,
    () => MAPVIEW.hitRadius.district,
  );
  if (district !== null) return { kind: 'district', id: district.id };

  return null;
}

/**
 * 螢幕（stage 全域）座標 → 世界座標：反套用鏡頭根容器目前的平移／縮放（04 §3.12.1）。
 * `world` 為 `camera.ts` 之 `WorldTransform`（`{scale,x,y}`，與 Pixi `Container.position`/
 * `scale.x`/`scale.y`〔恆同值，本專案無非等比縮放〕同構）。
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  world: WorldTransform,
): { x: number; y: number } {
  return {
    x: (screenX - world.x) / world.scale,
    y: (screenY - world.y) / world.scale,
  };
}

export interface MapInteractionOptions {
  emit: (event: MapRendererEvent) => void;
}

interface MapInteractionStaticData {
  graph: MapGraph;
  castleTier?: CastleTierLookup;
}

/**
 * idle 模式指標事件控制器（04 §3.12.2 節錄）。`MapRenderer` 於 `attachEvents` 把已轉換為世界座標的
 * 指標事件轉呼叫本類別，本類別純粹依命中測試結果 `emit` 對應 `MapRendererEvent`，不持有 Pixi 依賴、
 * 不碰 GameState（渲染器永不直接改狀態，04 §3.12.2）。`orderMarch` 模式留待 M4-14，見檔頭說明。
 */
export class MapInteraction {
  private graph: MapGraph | null = null;
  private castleTier: CastleTierLookup = {};

  constructor(private readonly opts: MapInteractionOptions) {}

  /** 同步靜態地圖資料（`MapRenderer.setMapData` 呼叫）；`null`＝尚未載入，此時一律無命中。 */
  setStaticData(data: MapInteractionStaticData | null): void {
    this.graph = data?.graph ?? null;
    this.castleTier = data?.castleTier ?? {};
  }

  private hitTest(worldX: number, worldY: number): HitResult | null {
    if (this.graph === null) return null;
    return hitTestWorldPoint(worldX, worldY, this.graph, { castleTier: this.castleTier });
  }

  /**
   * pointermove（世界座標＋原始螢幕座標）：發 `nodeHover`（含 `screenX`/`screenY` 供 React tooltip
   * 定位，§6.1「跟隨游標右下 16px」由 React 端套用偏移）。命中部隊時尚無專屬 hover 事件（04 §4.3
   * 僅定義 `armyClick`，見檔頭 army 分支說明），比照「移出」處理（`nodeKind`/`id` 皆為 `null`）。
   */
  handleMove(worldX: number, worldY: number, screenX: number, screenY: number): void {
    const hit = this.hitTest(worldX, worldY);
    if (hit === null || hit.kind === 'army') {
      this.opts.emit({ type: 'nodeHover', nodeKind: null, id: null, screenX, screenY });
      return;
    }
    this.opts.emit({ type: 'nodeHover', nodeKind: hit.kind, id: hit.id, screenX, screenY });
  }

  /** 左鍵點擊（世界座標）：命中城/郡 → `nodeClick`；命中部隊 → `armyClick`；否則 `emptyClick`。 */
  handleTap(worldX: number, worldY: number): void {
    const hit = this.hitTest(worldX, worldY);
    if (hit === null) {
      this.opts.emit({ type: 'emptyClick' });
    } else if (hit.kind === 'army') {
      this.opts.emit({ type: 'armyClick', id: hit.id });
    } else {
      this.opts.emit({ type: 'nodeClick', nodeKind: hit.kind, id: hit.id });
    }
  }

  /** 右鍵：idle 模式清除選取（04 §3.12.2）。 */
  handleRightClick(): void {
    this.opts.emit({ type: 'rightClick' });
  }
}

/**
 * React 端事件協定：對應 `MapRendererEvent` 每個 `type` 的具名 handler（04 §3.12.2「React 以 hook
 * `useMapEvents` 訂閱」）。省略的 handler 該事件即無操作。
 */
export interface MapEventHandlers {
  onNodeHover?: (e: Extract<MapRendererEvent, { type: 'nodeHover' }>) => void;
  onNodeClick?: (e: Extract<MapRendererEvent, { type: 'nodeClick' }>) => void;
  onArmyClick?: (e: Extract<MapRendererEvent, { type: 'armyClick' }>) => void;
  onEmptyClick?: () => void;
  onRightClick?: () => void;
  onPathPick?: (e: Extract<MapRendererEvent, { type: 'pathPick' }>) => void;
}

/**
 * `useMapEvents(handlers)`：把具名 handler 表轉成單一穩定的 `MapEventHandler`，供
 * `<MapCanvasHost onMapEvent={...} />` 使用（01 §3.6.2）。以 ref 保存最新 handlers，
 * 回傳的 callback 參考在整個掛載期間不變（`useCallback([])`），呼叫端據此可安全略過
 * `MapCanvasHost` 的重掛依賴。渲染器收到後續事件仍一律只轉 Command／UI 狀態，不直接改
 * GameState（04 §3.12.2）。
 */
export function useMapEvents(handlers: MapEventHandlers): MapEventHandler {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  return useCallback<MapEventHandler>((event) => {
    const h = handlersRef.current;
    switch (event.type) {
      case 'nodeHover':
        h.onNodeHover?.(event);
        break;
      case 'nodeClick':
        h.onNodeClick?.(event);
        break;
      case 'armyClick':
        h.onArmyClick?.(event);
        break;
      case 'emptyClick':
        h.onEmptyClick?.();
        break;
      case 'rightClick':
        h.onRightClick?.();
        break;
      case 'pathPick':
        h.onPathPick?.(event);
        break;
    }
  }, []);
}
