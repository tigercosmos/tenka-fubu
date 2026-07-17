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
//   （core → view 的 plain data selector 輸出）。M6-V4 技術設計 §3.1：一次到位對齊 04 §4.6
//   canonical 全量——`MapCastleView`／`MapArmyView`／`MapSiegeView`／`MapBattleView` 直接複用
//   `src/core/state/selectors.ts` 匯出之 core view-model 型別（`MapCastleViewModel` 等），只在此
//   UI 邊界另補 `selected`（army）／`selection`（僅 UI 邊界 `composeMapViewState` 組裝，core
//   selector 不吃 UI selection 型別，見設計 §2.4 決策 D7）。新欄位（`battles`／`terrain`／
//   `analysisMode`／`selection`／`armies[].selected` 等）本階段（V4）一律「攜帶不消費」——繪製輸出
//   不變（硬約束①），消費留給後續里程碑（V5/V7/V8/V9/V10，見各欄位註解）。
//
// 本檔為純型別（`export type`／`interface`），無執行期相依。

import type { Container, Graphics } from 'pixi.js';
import type { MapGraph } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import type { CastleTier } from '@core/state/enums';
import type {
  MapArmyViewModel,
  MapBattleViewModel,
  MapCastleViewModel,
  MapDistrictViewModel,
  MapSiegeViewModel,
} from '@core/state/selectors';
import type { JapanOutlineFile } from '@data/schemas/outline';
import type { DebugOverlayFlags } from '@app/store';
import type { PathResult } from '@core/index';
import type { CameraState } from './camera';

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
  | { type: 'cameraChanged'; camera: CameraState; width: number; height: number }
  | { type: 'pathPick'; nodeId: string }; // 尋路除錯模式下的節點揀選

/** `MapCanvasHost` 注入、渲染器對外發事件的 callback（01 §3.6.2）。 */
export type MapEventHandler = (event: MapRendererEvent) => void;

export type MapInteractionMode = 'idle' | 'orderMarch';

/** Authoritative core path result plus UI-only classification for preview rendering. */
export interface MapPathPreview {
  result: PathResult;
  originNodeId: MapNodeId;
  targetNodeId: MapNodeId;
  /** When true, result ends at the nearest reachable node and the final segment is a red indicator. */
  unreachable: boolean;
  /** Hostile/subjugation nodes only; allied foreign territory is intentionally excluded. */
  hostileNodeIds: readonly MapNodeId[];
}

// ── view-model 型別（複用 core `selectors.ts` 匯出；04 §4.6，M6-V4 §3.1） ──────────────

/** 城/郡結構化 view（= core `MapCastleViewModel`；`terrainKind`/`siegeMode`/`warning` V7 起消費）。 */
export type MapCastleView = MapCastleViewModel;

/** 郡次級狀態 view（= core `MapDistrictViewModel`；M6-V7 AD1：供 DistrictNode 知行/制壓/一揆徽記）。 */
export type MapDistrictView = MapDistrictViewModel;

/** 圍城 view（擴充，驅動現有 `SiegeMarker` 視覺；D5 與 canonical `battles[]` 並存）。 */
export type MapSiegeView = MapSiegeViewModel;

/** 戰鬥 view（canonical 04 §4.6；V4 攜帶不消費，battle badge 留 V8/V10）。 */
export type MapBattleView = MapBattleViewModel;

/** 軍隊對「檢視方（playerClanId）」的外交關係之視覺通道（art-bible §3.3）。純 view 概念，
 *  由 UI 邊界 composeMapViewState 依 getStance 推導；'friendly'＝含己方與同盟，'enemy'＝交戰中，
 *  'neutral'＝停戰/中立/未知（含 playerClanId 未定之旁觀）。（M6-V8，V8D3） */
export type ArmyRelation = 'friendly' | 'neutral' | 'enemy';

/**
 * 部隊 view（= core `MapArmyViewModel` ＋ UI 邊界補 `selected`／`relation`）。`fromNode`/`toNode`/
 * `edgeT` 為 renderer 端內插參數（決策 D6，見 `dirty.ts` 之 `armyWorldPos`），非世界座標；
 * `selected` 由 `composeMapViewState` 依目前 `selection` 組裝；`relation`（M6-V8，V8D3，必填）
 * 由 `composeMapViewState` 依 `getStance`（或注入之 `relationOf`）推導，供 ArmyChip 敵我次級通道。
 */
export type MapArmyView = MapArmyViewModel & { selected: boolean; relation: ArmyRelation };

/**
 * 靜態地圖資料（init 後經 `setMapData` 傳入一次；整局不變）。04 §4.6 `MapStaticData` 全量對齊
 * （M6-V4 §3.1）。
 *
 * `outline` 於本階段由渲染器直接靜態 import `@data/map/japan-outline.json`（見 mapDraw.loadOutline），
 * 此處保留為可選覆蓋（測試以 fixture 傳入）；`clanColorIndex` 供 nodeMarkers／armyChip 依
 * owner/clanId 取勢力色（Clan.colorIndex，值域 0..39，公式見 tokens.clanColorNum）。
 */
export interface MapStaticData {
  /** `edges` 含 `name`/`waypoints`/`bridges`（D1，transient `MapRoadEdge`）；V6：RoadsLayer 消費 name/waypoints/bridges。 */
  graph: MapGraph;
  /** clanId → Clan.colorIndex（0..39）；無主節點以 MAPVIEW.colors.neutral 呈現（02／tokens §5.1）。 */
  clanColorIndex: Readonly<Record<string, number>>;
  /** 可選：覆蓋預設靜態 outline（測試用；缺省時渲染器自帶 japan-outline.json）。 */
  outline?: JapanOutlineFile;
  /**
   * 可選：城 id → 城格（`'main'` 本城／`'branch'` 支城），供命中測試半徑判定
   * （`MAPVIEW.hitRadius.castleMain`/`castleBranch`，04 §3.12.1／M2-17）。未列出的城視為支城
   * （較小半徑，保守）。與 `castles[].tier`（渲染，V4 攜帶不消費）並存（設計 §10 回寫記錄）。
   */
  castleTier?: Readonly<Record<string, CastleTier>>;
  /** nodeId/clanId(+provinceId 擴充)→顯示名（04 §4.6；取代舊 `nodeLabels`）。城/郡/勢力/省名皆含。 */
  names?: Readonly<Record<string, string>>;
  /** provinceId→省名標籤世界座標（04 §4.6；取代舊 `provinceLabels`）；文字來源見 `names`。 */
  provinceLabelPos?: Readonly<Record<string, { x: number; y: number }>>;
  /**
   * V5 terrain pack（地形浮雕／森林／河流／湖泊資產）；V4 攜帶不消費，保持 optional，
   * V5 填值後改必填（04 §8 記錄）。
   */
  terrain?: {
    reliefAssetId: string;
    forestAssetId: string;
    rivers: ReadonlyArray<{
      id: string;
      points: ReadonlyArray<{ x: number; y: number }>;
      widthClass: 1 | 2 | 3;
    }>;
    lakes: ReadonlyArray<{ id: string; polygon: ReadonlyArray<{ x: number; y: number }> }>;
  };
}

/**
 * 每 tick 更新的動態視圖（不含任何函式／類別，可直接結構比對 diff）。04 §4.6 `MapViewState`
 * 全量對齊（M6-V4 §3.1）。`day` 僅供顯示/測試斷言——**任何 dirty 判定一律不看 `day`**（見
 * `dirty.ts`／`MapRenderer.applyOwnerDirty`）。`selection`／`armies[].selected`／`battles`／
 * `analysisMode` 為 V4「攜帶不消費」欄位（選取環/戰鬥標記/勢力圖模式留待後續里程碑）。
 */
export interface MapViewState {
  day: number;
  playerClanId?: string;
  districtOwner: Readonly<Record<string, string | null>>; // districtId → clanId（null=無主）
  castles: readonly MapCastleView[]; // 取代舊 castleOwner（D2 一次到位）
  /** 郡次級狀態（M6-V7 AD1，可選 view-model 擴充；golden 安全）。owner 仍取 `districtOwner`。 */
  readonly districts?: readonly MapDistrictView[];
  armies: readonly MapArmyView[];
  sieges?: readonly MapSiegeView[]; // 擴充：驅動現有 SiegeMarker
  battles: readonly MapBattleView[]; // canonical（V4 攜帶不消費）
  selection: { kind: 'node' | 'army'; id: string } | null; // V6 選取高亮消費（節點選取 → 相鄰道路金色高亮）
  analysisMode:
    'none' | 'faction' | 'supply' | 'roadCapacity' | 'terrainAdvantage' | 'castleDefense';
}

/**
 * 場景圖固定圖層容器（04 §3.10.1 由下而上層序，各為一個 `Container`）。
 * 全部掛在 `world`（鏡頭變換根）之下，供平行 agent（M2-14 territory／M2-16 nodeMarkers・
 * selectionAndPath／M5 armies・effects／labels）以 `renderer.getLayers()` 取得後掛入自己的
 * display object。
 *
 * M6-V5（VD2）：一次補齊 04 §3.10.1 全 13 層——新增 `terrainBase`(1)／`waterFeatures`(2)／
 * `analysisOverlay`(4)／`settlements`(6)／`debug`(12)。`terrainBase`（relief／forest 烘焙紋理
 * Sprite）與 `waterFeatures`（河川／湖泊向量）本階段有實繪內容；`territory`(3) 亦於本階段掛
 * `TerritoryGrid` Sprite；`settlements`（V7 城下聚落）本階段起有實繪內容；`analysisOverlay`
 * （V10 勢力圖）／`debug`（DEV overlay）為空容器占位，避免 V6–V10 反覆改層序。
 */
export interface MapLayers {
  /** 鏡頭變換根：13 圖層之父容器；scale/position 由 camera.ts（M2-15，04-T10）驅動。 */
  readonly world: Container;
  /** 0 海陸背景：海色矩形＋japan-outline 陸地多邊形（靜態一次建立；relief 未載入時之 fallback 底）。 */
  readonly seaBackground: Container;
  /** 1 地形浮雕：relief／forest 烘焙紋理 Sprite（M6-V5，04-T15）。 */
  readonly terrainBase: Container;
  /** 2 水系：河川（widthClass 線寬＋taper）／湖泊向量（M6-V5，04-T15）。 */
  readonly waterFeatures: Container;
  /** 3 勢力色郡域紋理（M2-14／M6-V5，04-T9／T15；柵格化 Voronoi Sprite）。 */
  readonly territory: Container;
  /** 4 分析 overlay：勢力圖／補給／道路容量等（V10 空容器占位）。 */
  readonly analysisOverlay: Container;
  /** 5 街道線（V6 RoadsLayer 子容器：casing＋內線、waypoints 多段線、道級分批、海路波節、橋面；主幹道 far 保留；per-stage 線寬）。 */
  readonly roads: Container;
  /** 6 聚落標記（V7：本城城下屋頂群＋田畦，程序生成、close only、繪於 nodeMarkers 之下）。 */
  readonly settlements: Container;
  /** 7 城／郡標記（V7：CastleNode/DistrictNode 元件取代占位 drawNodeMarker）。 */
  readonly nodeMarkers: Container;
  /** 8 部隊 sprite（M5）。 */
  readonly armies: Container;
  /** 9 選取高亮環／行軍路徑預覽（V7 節點選取環金色雙環，錨點置中＋V6 相鄰道路高亮；M4-14 orderMarch 預覽）。 */
  readonly selectionAndPath: Container;
  /** 10 特效：威風環／交鋒 icon（M5）。 */
  readonly effects: Container;
  /** 11 文字標籤（BitmapText；城名／郡名／國名／勢力名）。 */
  readonly labels: Container;
  /** 12 除錯 overlay（DEV 空容器占位；AI 意圖／尋路除錯繪製屬後續里程碑）。 */
  readonly debug: Container;
}

/** `MapLayers` 的圖層 key（不含 `world` 根）——依 04 §3.10.1 由下而上層序（M6-V5：13 層）。 */
export const LAYER_ORDER = [
  'seaBackground',
  'terrainBase',
  'waterFeatures',
  'territory',
  'analysisOverlay',
  'roads',
  'settlements',
  'nodeMarkers',
  'armies',
  'selectionAndPath',
  'effects',
  'labels',
  'debug',
] as const satisfies ReadonlyArray<Exclude<keyof MapLayers, 'world'>>;

/**
 * 供繪製輔助函式接收的最小 Graphics 介面別名（本檔僅為型別，`Graphics`／`Container` 於執行期
 * 由 pixi.js 提供）。以型別匯出集中，避免各繪製檔重複 import。
 */
export type { Container, Graphics };
export type { MapNodeId };
