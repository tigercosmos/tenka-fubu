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
// - M6-V6：命中測試 scale-aware CSS-px 下限（04 §3.12.1 DoD，`MAPVIEW.hitMinCssRadius`）。
//   `HitTestOptions.minHitRadius` **僅**套用於城／郡有效半徑（`Math.max(base, minHitRadius)`）；
//   軍隊維持固定半徑不 floor（保優先序，遠景放大會吞掉鄰近城/郡點擊，見 eng-F4）。
//   `MapInteraction.setScale(scale)`（由 `MapRenderer` 隨鏡頭同步）換算
//   `minHit = MAPVIEW.hitMinCssRadius / scale`，並僅擴大節點空間索引 query box 半邊
//   （`Math.max(castleMain, minHit)`）；軍隊 query box 不動。缺省／`scale=1` 時行為不變。

import { useCallback, useRef } from 'react';
import type { MapGraph } from '@core/state/mapGraph';
import type { CastleTier } from '@core/state/enums';
import { MAPVIEW } from './mapViewConfig';
import type { WorldTransform } from './camera';
import type { MapEventHandler, MapRendererEvent } from './mapViewTypes';
import type { MapInteractionMode } from './mapViewTypes';
import { SpatialCullIndex } from './lod';

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
  nodeIds?: readonly string[];
  /**
   * 命中半徑下限（world unit；04 §3.12.1 DoD，M6-V6）：僅套用於城／郡候選之有效半徑
   * （`Math.max(原半徑, minHitRadius)`），使遠景縮小節點仍維持 CSS-px 可點面積。
   * **軍隊半徑不受本欄位影響**（維持固定 `MAPVIEW.hitRadius.army`，保優先序，見 eng-F4）。
   * 缺省（`undefined`）＝三類行為與 M6-V6 前完全相同。
   */
  minHitRadius?: number;
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

  const nodes =
    opts.nodeIds === undefined
      ? [...graph.nodes.values()]
      : opts.nodeIds.flatMap((id) => {
          const node = graph.nodes.get(id as never);
          return node === undefined ? [] : [node];
        });
  const minHit = opts.minHitRadius ?? 0;

  const castles = nodes.filter((n) => n.kind === 'castle');
  const castle = nearestWithinRadius(
    worldX,
    worldY,
    castles,
    (n) => n.pos,
    (n) =>
      Math.max(
        castleTier[n.id] === 'main' ? MAPVIEW.hitRadius.castleMain : MAPVIEW.hitRadius.castleBranch,
        minHit,
      ),
  );
  if (castle !== null) return { kind: 'castle', id: castle.id };

  const districts = nodes.filter((n) => n.kind === 'district');
  const district = nearestWithinRadius(
    worldX,
    worldY,
    districts,
    (n) => n.pos,
    () => Math.max(MAPVIEW.hitRadius.district, minHit),
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
  private armyIndex = new SpatialCullIndex<string>();
  private armyById = new Map<string, HitTestArmy>();
  private nodeIndex = new SpatialCullIndex<string>();
  private mode: MapInteractionMode = 'idle';
  private lastMarchHoverId: string | null | undefined;
  private scale = 1;

  constructor(private readonly opts: MapInteractionOptions) {}

  /**
   * 同步目前鏡頭縮放比例（`camera.ts` `WorldTransform.scale`；M6-V6，04 §3.12.1 DoD）：
   * `hitTest` 據此換算城／郡有效命中半徑下限（`MAPVIEW.hitMinCssRadius/scale`），使遠景
   * （scale 小）之縮小節點仍維持約 32 CSS px 可點面積。非正數視為 1（保守回退）。
   */
  setScale(scale: number): void {
    this.scale = scale > 0 ? scale : 1;
  }

  /** 同步靜態地圖資料（`MapRenderer.setMapData` 呼叫）；`null`＝尚未載入，此時一律無命中。 */
  setStaticData(data: MapInteractionStaticData | null): void {
    this.graph = data?.graph ?? null;
    this.castleTier = data?.castleTier ?? {};
    this.nodeIndex = new SpatialCullIndex<string>();
    for (const node of data?.graph.nodes.values() ?? []) {
      this.nodeIndex.upsert(node.id, node.pos.x, node.pos.y);
    }
  }

  /** 同步每 tick 的部隊命中位置；渲染與命中共用同一 plain view model。 */
  setArmies(armies: readonly HitTestArmy[]): void {
    this.armyIndex = new SpatialCullIndex<string>();
    this.armyById = new Map(armies.map((army) => [army.id, army]));
    for (const army of armies) this.armyIndex.upsert(army.id, army.pos.x, army.pos.y);
  }

  setMode(mode: MapInteractionMode): void {
    this.mode = mode;
    this.lastMarchHoverId = undefined;
  }

  private hitTest(worldX: number, worldY: number, includeArmies = true): HitResult | null {
    if (this.graph === null) return null;
    const minHit = MAPVIEW.hitMinCssRadius / this.scale;
    const radius = Math.max(MAPVIEW.hitRadius.castleMain, minHit);
    const nodeIds = [
      ...this.nodeIndex.query(
        {
          left: worldX - radius,
          top: worldY - radius,
          right: worldX + radius,
          bottom: worldY + radius,
        },
        0,
      ),
    ];
    const armyRadius = MAPVIEW.hitRadius.army;
    const armies = includeArmies
      ? [
          ...this.armyIndex.query(
            {
              left: worldX - armyRadius,
              top: worldY - armyRadius,
              right: worldX + armyRadius,
              bottom: worldY + armyRadius,
            },
            0,
          ),
        ].flatMap((id) => {
          const army = this.armyById.get(id);
          return army === undefined ? [] : [army];
        })
      : [];
    return hitTestWorldPoint(worldX, worldY, this.graph, {
      castleTier: this.castleTier,
      armies,
      nodeIds,
      minHitRadius: minHit,
    });
  }

  /**
   * pointermove（世界座標＋原始螢幕座標）：發 `nodeHover`（含 `screenX`/`screenY` 供 React tooltip
   * 定位，§6.1「跟隨游標右下 16px」由 React 端套用偏移）。命中部隊時尚無專屬 hover 事件（04 §4.3
   * 僅定義 `armyClick`，見檔頭 army 分支說明），比照「移出」處理（`nodeKind`/`id` 皆為 `null`）。
   */
  handleMove(worldX: number, worldY: number, screenX: number, screenY: number): void {
    const hit = this.hitTest(worldX, worldY, this.mode === 'idle');
    if (this.mode === 'orderMarch') {
      const id = hit !== null && hit.kind !== 'army' ? hit.id : null;
      if (id === this.lastMarchHoverId) return;
      this.lastMarchHoverId = id;
    }
    if (hit === null || hit.kind === 'army') {
      this.opts.emit({ type: 'nodeHover', nodeKind: null, id: null, screenX, screenY });
      return;
    }
    this.opts.emit({ type: 'nodeHover', nodeKind: hit.kind, id: hit.id, screenX, screenY });
  }

  /** 左鍵點擊（世界座標）：命中城/郡 → `nodeClick`；命中部隊 → `armyClick`；否則 `emptyClick`。 */
  handleTap(worldX: number, worldY: number): void {
    const hit = this.hitTest(worldX, worldY, this.mode === 'idle');
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
  onCameraChanged?: (e: Extract<MapRendererEvent, { type: 'cameraChanged' }>) => void;
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
      case 'cameraChanged':
        h.onCameraChanged?.(event);
        break;
      case 'pathPick':
        h.onPathPick?.(event);
        break;
    }
  }, []);
}
