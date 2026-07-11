// 地圖渲染器的 view 側資料契約與事件型別。
//
// 規格：
// - 事件（`MapRendererEvent`）／`DebugOverlayFlags`：plan/01-architecture.md §4.3（MapRenderer 契約）
//   為 M2-13 落地之 canonical 對外事件集基底。plan/04-map-and-movement.md §3.12.2 定義一組較豐富、
//   含 screenX/screenY／`rightClick`／`cameraChanged`／`pathPreviewHover` 的事件聯集，歸互動層
//   （M2-17，04-T12 部分）。本次（M2-17）已將 idle 模式所需之 `screenX`/`screenY`（nodeHover，供
//   React 端 tooltip 定位）與 `rightClick`（idle 清除選取）併入本檔 canonical 事件集；`cameraChanged`
//   （待 M2-15 `camera.ts` 落地鏡頭後才有意義）與 `pathPreviewHover`（`orderMarch` 模式路徑預覽，
//   歸 M4-14「04-T12 剩餘」）仍延後。裁定依據見 04 §8.1 之 M2-13 記錄與本檔本輪備忘。
// - 靜態／動態視圖資料（`MapStaticData`／`MapViewState`）：plan/04-map-and-movement.md §4.6
//   （core → view 的 plain data selector 輸出；本檔取 M2-13 骨架實際消費之欄位子集）。
//   §4.6 明訂此二型別最終由 `src/core/state/selectors.ts` 之 selector 產出；劇本批次資料
//   （M2-9 東海／M2-10 近畿起）就緒後補上該 selector 並改為自 core 匯入，屆時回寫本檔與 04 §8.1。
//   M2-17 另補 `castleTier`（見下）供命中測試半徑判定，同屬待該 selector 補齊之欄位。
//
// 本檔為純型別（`export type`／`interface`），無執行期相依。

import type { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import type { CastleTier } from '@core/state/enums';
import type { JapanOutlineFile } from '@data/schemas/outline';
import type { DebugOverlayFlags } from '@app/store';

export type { DebugOverlayFlags };

/**
 * 渲染器對外事件（01 §4.3 基底＋04 §3.12.2 idle 模式擴充，M2-17）；
 * React 世界經 `MapCanvasHost` 注入的 handler／`useMapEvents`（見 `interaction.ts`）接收。
 * `nodeHover` 之 `nodeKind`/`id` 於移出任何節點（含目前未支援 hover 事件的部隊）時同為 `null`；
 * `screenX`/`screenY` 為指標之全域（stage）座標，供 tooltip 依 §6.1「跟隨游標右下 16px」定位。
 */
export type MapRendererEvent =
  | { type: 'nodeClick'; nodeKind: 'castle' | 'district'; id: string }
  | { type: 'armyClick'; id: string }
  | { type: 'emptyClick' } // 點空白處 → 清除選取
  | { type: 'rightClick' } // 右鍵：idle 清除選取；orderMarch 取消回 idle 留待 M4-14
  | {
      type: 'nodeHover';
      nodeKind: 'castle' | 'district' | null;
      id: string | null;
      screenX: number;
      screenY: number;
    }
  | { type: 'pathPick'; nodeId: string }; // 尋路除錯模式下的節點揀選

/** `MapCanvasHost` 注入、渲染器對外發事件的 callback（01 §3.6.2）。 */
export type MapEventHandler = (event: MapRendererEvent) => void;

/**
 * 靜態地圖資料（init 後經 `setMapData` 傳入一次；整局不變）。04 §4.6 `MapStaticData` 的 M2-13 子集。
 *
 * `outline` 於本階段由渲染器直接靜態 import `@data/map/japan-outline.json`（見 mapDraw.loadOutline），
 * 此處保留為可選覆蓋（測試以 fixture 傳入）；`clanColorIndex` 供 nodeMarkers 依 owner 取勢力色
 * （Clan.colorIndex，值域 0..39，公式見 tokens.clanColorNum）。
 */
export interface MapStaticData {
  graph: MapGraph;
  /** clanId → Clan.colorIndex（0..39）；無主節點以 MAPVIEW.colors.neutral 呈現（02／tokens §5.1）。 */
  clanColorIndex: Readonly<Record<string, number>>;
  /** 可選：覆蓋預設靜態 outline（測試用；缺省時渲染器自帶 japan-outline.json）。 */
  outline?: JapanOutlineFile;
  /**
   * 可選：城 id → 城格（`'main'` 本城／`'branch'` 支城），供命中測試半徑判定
   * （`MAPVIEW.hitRadius.castleMain`/`castleBranch`，04 §3.12.1／M2-17）。未列出的城視為支城
   * （較小半徑，保守）。`Castle.tier`（02 §4.5）直接可用；待 §4.6 selector 補齊後由該處產出。
   */
  castleTier?: Readonly<Record<string, CastleTier>>;
}

/**
 * 每 tick 更新的動態視圖（不含任何函式／類別，可直接結構比對 diff）。04 §4.6 `MapViewState`
 * 的 M2-13 子集：本階段僅消費 `districtOwner`／`castleOwner`（nodeMarkers 勢力色）與 `selection`。
 * `armies`／`battles` 等於 armies／effects 層（M5）落地時補齊。
 */
export interface MapViewState {
  day: number; // 遊戲日序號（diff 用）
  districtOwner: Readonly<Record<string, string | null>>; // districtId → clanId（null=無主）
  castleOwner: Readonly<Record<string, string>>; // castleId → clanId
  selection: { kind: 'node' | 'army'; id: string } | null;
}

/**
 * 場景圖固定圖層容器（04 §3.10.1 由下而上層序，各為一個 `Container`）。
 * 全部掛在 `world`（鏡頭變換根）之下，供平行 agent（M2-14 territory／M2-16 nodeMarkers・
 * selectionAndPath／M5 armies・effects／labels）以 `renderer.getLayers()` 取得後掛入自己的
 * display object。本階段（M2-13）僅 `seaBackground`／`roads` 有實繪內容，其餘為空容器。
 */
export interface MapLayers {
  /** 鏡頭變換根：8 圖層之父容器；scale/position 由 camera.ts（M2-15，04-T10）驅動。 */
  readonly world: Container;
  /** 0 海陸背景：海色矩形＋japan-outline 陸地多邊形（靜態一次建立）。 */
  readonly seaBackground: Container;
  /** 1 勢力色郡域紋理（M2-14，04-T9）。 */
  readonly territory: Container;
  /** 2 街道線（依 grade 線寬、海路虛線）。 */
  readonly roads: Container;
  /** 3 城／郡標記（M2-16 sceneParts 取代骨架占位）。 */
  readonly nodeMarkers: Container;
  /** 4 部隊 sprite（M5）。 */
  readonly armies: Container;
  /** 5 選取高亮環／行軍路徑預覽（M2-16 SelectionRing／M4-14 orderMarch 路徑預覽）。 */
  readonly selectionAndPath: Container;
  /** 6 特效：威風環／交鋒 icon（M5）。 */
  readonly effects: Container;
  /** 7 文字標籤（BitmapText；城名／郡名／國名／勢力名）。 */
  readonly labels: Container;
}

/** `MapLayers` 的圖層 key（不含 `world` 根）——依 04 §3.10.1 由下而上層序。 */
export const LAYER_ORDER = [
  'seaBackground',
  'territory',
  'roads',
  'nodeMarkers',
  'armies',
  'selectionAndPath',
  'effects',
  'labels',
] as const satisfies ReadonlyArray<Exclude<keyof MapLayers, 'world'>>;

/**
 * 供繪製輔助函式接收的最小 Graphics 介面別名（本檔僅為型別，`Graphics`／`Container` 於執行期
 * 由 pixi.js 提供）。以型別匯出集中，避免各繪製檔重複 import。
 */
export type { Container, Graphics };
export type { MapNodeId };
