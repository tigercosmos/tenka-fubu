// 命令式（imperative）PixiJS 地圖渲染器——純 view，非 React。
//
// 規格：
// - 生命週期契約（`init`/`focusNode`/`setDebugOverlay`/`showDebugPath`/`destroy`、對外事件）：
//   plan/01-architecture.md §3.6.1（imperative renderer、Application.init 選項）／§3.6.2（React 掛載
//   與 destroy 冪等）／§4.3（MapRenderer 契約與 MapRendererEvent）。M2-13（01-A10）。
// - 圖層與內容：plan/04-map-and-movement.md §3.10.1（8 圖層由下而上層序）／§4.5（MAPVIEW 渲染常數）／
//   §4.6（core→view plain data）。04-T8（Pixi 初始化、8 圖層、outline 與街道繪製、view diff 更新）。
//
// 對外 API 裁定（01 §4.3 vs 04 §3.12.3 之衝突）：本檔以 **01 §4.3** 的生命週期方法為 canonical
// 骨架（init(host,onEvent) / focusNode / setDebugOverlay / showDebugPath / destroy），另加平行 agent
// 掛層與資料流所需之擴充方法（setMapData / updateView / resize / getLayers / getApp）。04 §3.12.3 之
// 較豐富 view API（update / setMode / setFactionMapMode / playAweEffect …）屬後續里程碑（M2-18 勢力圖、
// M5 特效）逐步補上，其 init(canvas,staticData) 形態與 01 §3.6.2 之 init(host,onEvent) 衝突——本骨架
// 取 01（掛載契約），staticData 改由 setMapData 傳入。記錄見 04 §8.1 之 M2-13 裁定。
// M2-17（idle 模式命中測試＋事件協定，04 §3.12）已落地：見下方 `interaction` 欄位／attachEvents；
// `setMode`／orderMarch 模式（hover 即時尋路預覽、左鍵送出行軍）留待 M4-14「04-T12 剩餘」。
// M6-V2（17 §3.9.3）新增 `setCameraPose`／`waitForIdleFrames`：供 e2e／`TenkaDebugApi`
// （src/app/debug.ts）驅動決定論截圖之三段鏡頭 preset 與 renderer idle 訊號；本檔以外的活躍實例
// 取得方式見 `src/ui/map/debugMapBridge.ts`（`MapCanvasHost` 掛載時登記）。
//
// Pixi 生命週期防護（本檔最易錯處，01 §3.6.2）：
// - `init` 於 `await app.init(...)` 後**再次檢查**是否已 destroy（StrictMode 雙掛載：cleanup 可能在
//   init 尚未 resolve 前先跑）；若已 destroy 則立即銷毀剛建立的 Application 並返回，不掛入 DOM。
// - `destroy` 冪等：可在 init 前／中／後、重複呼叫皆安全（全程 null-guard）。

import { Application, BitmapText, Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { BAL } from '@core/balance';
import { MAPVIEW, WORLD_SIZE } from './mapViewConfig';
import { drawNodeMarker, drawRoads, drawSeaBackground, loadOutline } from './mapDraw';
import { armyStackKey, armyWorldPos, buildOwnerByNode, diffOwnerByNode } from './dirty';
import { LAYER_ORDER } from './mapViewTypes';
import { MapInteraction, screenToWorld } from './interaction';
import { Camera } from './camera';
import { createPathPreview } from './sceneParts/pathPreview';
import { createArmyChip, layoutArmyStacks } from './sceneParts/armyChip';
import { createSiegeMarker } from './sceneParts/siegeMarker';
import { lodModeForScale, shouldShowDetailLabels, SpatialCullIndex } from './lod';
import type {
  DebugOverlayFlags,
  MapEventHandler,
  MapInteractionMode,
  MapLayers,
  MapPathPreview,
  MapRendererEvent,
  MapStaticData,
  MapViewState,
} from './mapViewTypes';

/** 空的動態視圖（無主全圖）；setMapData 早於 updateView 到達時的預設，使 nodeMarkers 可先以中性色繪出。 */
const EMPTY_VIEW: MapViewState = {
  day: 0,
  districtOwner: {},
  castles: [],
  armies: [],
  battles: [],
  selection: null,
  analysisMode: 'none',
};

/**
 * `MapRenderer` 重繪計數診斷（M6-V4 決策 D11）：供 dirty-update DoD 測試斷言、V11 layer-presence
 * smoke 雛形。純幾個整數累加，恆開，成本可忽略。`getRebuildCounts()` 回傳唯讀複本。
 */
export interface MapRebuildCounts {
  roads: number;
  labels: number;
  nodeMarkers: number;
  territory: number;
  armyChips: number;
}

export class MapRenderer {
  private app: Application | null = null;
  private onEvent: MapEventHandler | null = null;
  private layers: MapLayers | null = null;

  /** 冪等/StrictMode 防護旗標：一旦呼叫 destroy 即為 true，init 的 await 後檢查據此放棄掛載。 */
  private disposed = false;
  private initialized = false;

  private staticData: MapStaticData | null = null;
  private view: MapViewState = EMPTY_VIEW;
  /** 除錯狀態（01 §4.3 setDebugOverlay/showDebugPath 存放處）；overlay 圖層與路徑繪製屬後續里程碑。 */
  private debug: { overlay: DebugOverlayFlags; path: string[] | null; costLabel: string | null } = {
    overlay: { aiIntent: false, pathfinding: false },
    path: null,
    costLabel: null,
  };

  private seaGfx: Graphics | null = null;
  private roadsGfx: Graphics | null = null;
  private pathPreview: ReturnType<typeof createPathPreview> | null = null;
  private marchPathPreview: MapPathPreview | null = null;
  private readonly nodeParts = new Map<
    string,
    { graphics: Graphics; kind: 'castle' | 'district' }
  >();
  private readonly labelParts = new Map<
    string,
    { label: BitmapText; kind: 'castle' | 'district' | 'province' }
  >();
  private readonly armyParts = new Map<string, ReturnType<typeof createArmyChip>>();
  private readonly siegeParts = new Map<string, ReturnType<typeof createSiegeMarker>>();
  private readonly armyCull = new SpatialCullIndex<string>();
  private readonly siegeCull = new SpatialCullIndex<string>();
  private readonly nodeCull = new SpatialCullIndex<string>();
  private readonly labelCull = new SpatialCullIndex<string>();
  private collapsedArmyIds = new Set<string>();
  /**
   * nodeMarkers owner dirty 判定用之前一 view owner 查表（M6-V4 §3.3.3）；`null` 視為「全部
   * dirty」。`setMapData` 完成後重設為 `null`，保證下一次 `updateView` 全 node 首繪上真色（§11.1）。
   */
  private prevOwnerByNode: Map<string, string | null> | null = null;
  /** 重繪計數診斷（決策 D11）；`getRebuildCounts()` 對外唯讀存取。 */
  private rebuildCounts: MapRebuildCounts = {
    roads: 0,
    labels: 0,
    nodeMarkers: 0,
    territory: 0,
    armyChips: 0,
  };
  private siegeElapsedMs = 0;
  private reducedMotion = false;
  /**
   * `waitForIdleFrames` 待決佇列（M6-V2，17 §3.9.3）：每 tick 遞減，歸零即 resolve；
   * `destroy` 時全數立即 resolve（非 reject）以避免懸掛 Promise／未預期例外（見該方法註解）。
   */
  private idleWaiters: { framesLeft: number; resolve: () => void }[] = [];
  private cameraEventElapsedMs = 100;
  private lastCameraEvent = '';

  /** idle 模式命中測試與事件協定（M2-17，04 §3.12）；純邏輯，見 interaction.ts。 */
  private readonly interaction = new MapInteraction({ emit: (e) => this.emit(e) });

  /** 正式鏡頭（M2-15，04-T10／§3.11）：縮放錨點／拖曳平移／慣性／focusOn；init 建立、destroy 清除。 */
  private camera: Camera | null = null;
  /** 拖曳平移狀態：進行中的指標 id（null＝未拖曳）、上一幀與按下起點螢幕座標、是否已越過拖曳判別門檻。 */
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private downPointerX = 0;
  private downPointerY = 0;
  private pointerDragged = false;

  private readonly onPointerDown = (event?: FederatedPointerEvent): void => {
    if (event === undefined || this.camera === null) return;
    if (event.button !== 0 && event.button !== 1) return; // 僅左鍵／中鍵拖曳平移（04 §3.11）
    const g = event.global;
    this.dragPointerId = event.pointerId;
    this.downPointerX = this.lastPointerX = g.x;
    this.downPointerY = this.lastPointerY = g.y;
    this.pointerDragged = false;
    this.camera.startDrag();
  };

  private readonly onPointerMove = (event?: FederatedPointerEvent): void => {
    const g = event?.global;
    const gx = g?.x ?? 0;
    const gy = g?.y ?? 0;
    // 拖曳中：以螢幕位移驅動鏡頭平移，暫停 hover 命中測試（04 §3.11）。
    if (this.dragPointerId !== null && this.camera !== null) {
      this.camera.dragMove(gx - this.lastPointerX, gy - this.lastPointerY);
      this.lastPointerX = gx;
      this.lastPointerY = gy;
      if (Math.hypot(gx - this.downPointerX, gy - this.downPointerY) > MAPVIEW.dragTapThresholdPx) {
        this.pointerDragged = true;
      }
      return;
    }
    const world = this.toWorldPoint(gx, gy);
    this.interaction.handleMove(world.x, world.y, gx, gy);
  };

  private readonly onPointerUp = (): void => {
    if (this.dragPointerId === null) return;
    this.dragPointerId = null;
    this.camera?.endDrag(); // 達門檻速度則起始慣性（由 onTick 推進）
  };

  private readonly onPointerTap = (event?: FederatedPointerEvent): void => {
    // 拖曳結束時 Pixi 仍補一發 pointertap；本次按下若已判定為拖曳則吞掉，避免誤觸點選（04 §3.11／§3.12.2）。
    if (this.pointerDragged) {
      this.pointerDragged = false;
      return;
    }
    const g = event?.global;
    const world = this.toWorldPoint(g?.x ?? 0, g?.y ?? 0);
    this.interaction.handleTap(world.x, world.y);
  };

  private readonly onRightClick = (): void => this.interaction.handleRightClick();
  private readonly onRendererResize = (): void => this.applyCameraTransform();

  /**
   * 滑鼠滾輪縮放（原生 DOM `wheel`；游標錨點不漂移，04 §5.7）。以 native 監聽而非 Pixi federated
   * 事件，方能 `preventDefault` 阻止瀏覽器頁面縮放／捲動；canvas 為滿版 fixed，`offsetX/Y`（CSS px）
   * 與 `app.screen`（autoDensity）同座標空間。
   */
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.camera === null || this.app === null) return;
    event.preventDefault();
    this.camera.onWheel(
      event.deltaY,
      { x: event.offsetX, y: event.offsetY },
      { width: this.app.screen.width, height: this.app.screen.height },
    );
    this.applyCameraTransform(); // 立即回饋（不必等下一 tick）
  };

  /** Pixi ticker 每幀回呼：推進鏡頭（慣性衰減／focusOn 補間）並套用變換至 world 容器。 */
  private readonly onTick = (): void => {
    if (this.app === null || this.camera === null) return;
    const deltaMs = this.app.ticker.deltaMS;
    this.camera.update(deltaMs);
    this.cameraEventElapsedMs += deltaMs;
    this.siegeElapsedMs += deltaMs;
    this.updateSiegeAnimations();
    this.applyCameraTransform();
    this.applyLodAndCulling();
    this.emitCameraChanged();
    this.advanceIdleWaiters();
  };

  /** 每幀推進 `waitForIdleFrames` 待決佇列（M6-V2）：frame 計數即可，見該方法註解。 */
  private advanceIdleWaiters(): void {
    if (this.idleWaiters.length === 0) return;
    const remaining: typeof this.idleWaiters = [];
    for (const waiter of this.idleWaiters) {
      waiter.framesLeft -= 1;
      if (waiter.framesLeft <= 0) waiter.resolve();
      else remaining.push(waiter);
    }
    this.idleWaiters = remaining;
  }

  private emitCameraChanged(): void {
    if (this.cameraEventElapsedMs < 100 || this.camera === null || this.app === null) return;
    const camera = this.camera.getState();
    const key = `${camera.x}:${camera.y}:${camera.scale}:${this.app.screen.width}:${this.app.screen.height}`;
    if (key === this.lastCameraEvent) return;
    this.cameraEventElapsedMs = 0;
    this.lastCameraEvent = key;
    this.emit({
      type: 'cameraChanged',
      camera,
      width: this.app.screen.width,
      height: this.app.screen.height,
    });
  }

  private updateSiegeAnimations(): void {
    for (const siege of this.view.sieges ?? []) {
      this.siegeParts.get(siege.id)?.update({
        pos: siege.pos,
        mode: siege.mode,
        elapsedMs: this.siegeElapsedMs,
        reducedMotion: this.reducedMotion,
      });
    }
  }

  /** stage 全域座標（event.global）→ 世界座標：反套用 `world` 容器目前的平移／縮放（04 §3.12.1）。 */
  private toWorldPoint(screenX: number, screenY: number): { x: number; y: number } {
    if (this.layers === null) return { x: screenX, y: screenY };
    const { position, scale } = this.layers.world;
    return screenToWorld(screenX, screenY, { x: position.x, y: position.y, scale: scale.x });
  }

  /**
   * 建立 Pixi Application、載入 8 圖層容器、繪製靜態層（海陸背景＋若已有資料則街道/標記）、
   * 開始事件管線；`host` 為滿版容器 div（01 §3.6.2）。可安全並發於 destroy（見檔頭防護）。
   */
  async init(host: HTMLElement, onEvent: MapEventHandler): Promise<void> {
    if (this.disposed || this.initialized || this.app !== null) return;
    this.onEvent = onEvent;

    const app = new Application();
    await app.init({
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio || 1, BAL.uiDprMax),
      autoDensity: true, // CSS 尺寸與實際像素解耦
      antialias: true,
      preference: 'webgl',
      background: MAPVIEW.colors.sea, // tokens 未定義地圖海色，取 MAPVIEW.colors.sea（04 §4.5）
    });

    // StrictMode 雙掛載防護：init 完成前已卸載 → 直接銷毀剛建立的 Application，不掛入 DOM。
    if (this.disposed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }

    this.app = app;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    host.appendChild(app.canvas);

    this.layers = this.buildLayers(app);
    this.pathPreview = createPathPreview();
    this.layers.selectionAndPath.addChild(this.pathPreview.container);
    this.drawStaticBackground();
    this.buildStaticDataLayers();
    this.prevOwnerByNode = null; // 首繪保證（§11.1）：下一次 updateView 視全部 node 為 dirty
    this.redrawMilitaryObjects();
    this.redrawPathPreview();
    // 鏡頭：初始置中全圖（fit scale），使用者以滾輪／拖曳操作，focusNode 補間聚焦（04 §3.11）。
    this.camera = new Camera({
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      scale: this.computeFitScale(),
    });
    this.applyCameraTransform();
    this.applyLodAndCulling();
    this.attachEvents(app);
    app.renderer.on('resize', this.onRendererResize);
    app.ticker.add(this.onTick);
    this.initialized = true;
  }

  /** 建立鏡頭根 `world` 與 8 個圖層容器（04 §3.10.1 由下而上層序，以 LAYER_ORDER 保證順序）。 */
  private buildLayers(app: Application): MapLayers {
    const world = new Container();
    world.label = 'world';
    const containers: Record<string, Container> = {};
    for (const key of LAYER_ORDER) {
      const c = new Container();
      c.label = key;
      world.addChild(c);
      containers[key] = c;
    }
    app.stage.addChild(world);
    return {
      world,
      seaBackground: containers.seaBackground as Container,
      territory: containers.territory as Container,
      roads: containers.roads as Container,
      nodeMarkers: containers.nodeMarkers as Container,
      armies: containers.armies as Container,
      selectionAndPath: containers.selectionAndPath as Container,
      effects: containers.effects as Container,
      labels: containers.labels as Container,
    };
  }

  /** 圖層 0 seaBackground：海色矩形＋japan-outline 陸地多邊形（靜態一次建立）。 */
  private drawStaticBackground(): void {
    if (this.layers === null) return;
    if (this.seaGfx === null) {
      this.seaGfx = new Graphics();
      this.layers.seaBackground.addChild(this.seaGfx);
    }
    const outline = this.staticData?.outline ?? loadOutline();
    drawSeaBackground(this.seaGfx, outline);
  }

  /**
   * 靜態圖層建立（M6-V4 決策 D9）：roads（批次）＋node（個別 Graphics，供裁剪）初繪＋labels
   * （BitmapText，文字整局不變）。**只由 `setMapData` 呼叫，整局一次**；node 初繪之 owner 取「當前
   * `this.view`」（通常為呼叫端隨後立即 `updateView` 帶入真實 owner；即使此處用到舊/空 view，
   * `setMapData` 會把 `prevOwnerByNode` 重設為 `null`，保證下一次 `updateView` 全 node 視為 dirty
   * 而重繪出正確 owner，見 §11.1「首繪保證」）。`updateView` 之後永不呼叫本函式（roads/labels 靜態化）。
   */
  private buildStaticDataLayers(): void {
    if (this.layers === null) return;
    const data = this.staticData;
    if (this.roadsGfx === null) {
      this.roadsGfx = new Graphics();
      this.layers.roads.addChild(this.roadsGfx);
    }
    if (data === null) {
      this.roadsGfx.clear();
      for (const part of this.nodeParts.values()) part.graphics.destroy();
      for (const part of this.labelParts.values()) part.label.destroy();
      this.layers.nodeMarkers.removeChildren();
      this.layers.labels.removeChildren();
      this.nodeParts.clear();
      this.labelParts.clear();
      return;
    }
    drawRoads(this.roadsGfx, data.graph);
    this.rebuildCounts.roads += 1;
    const ownerByNode = buildOwnerByNode(this.view);
    const names = data.names ?? {};
    const active = new Set<string>();
    const activeLabels = new Set<string>();
    for (const node of [...data.graph.nodes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      active.add(node.id);
      let part = this.nodeParts.get(node.id);
      if (part === undefined) {
        const graphics = new Graphics();
        graphics.position.set(node.pos.x, node.pos.y);
        this.layers.nodeMarkers.addChild(graphics);
        part = { graphics, kind: node.kind };
        this.nodeParts.set(node.id, part);
      }
      part.graphics.clear();
      drawNodeMarker(part.graphics, node, ownerByNode.get(node.id) ?? null, data.clanColorIndex);
      this.nodeCull.upsert(node.id, node.pos.x, node.pos.y);

      const text = names[node.id];
      if (text !== undefined) {
        activeLabels.add(node.id);
        let labelPart = this.labelParts.get(node.id);
        if (labelPart === undefined) {
          const label = new BitmapText({
            text,
            style: { fontFamily: 'Noto Serif TC', fontSize: 12 },
          });
          label.position.set(node.pos.x, node.pos.y + 18);
          this.layers.labels.addChild(label);
          labelPart = { label, kind: node.kind };
          this.labelParts.set(node.id, labelPart);
        }
        labelPart.label.text = text;
        this.labelCull.upsert(node.id, node.pos.x, node.pos.y);
        this.rebuildCounts.labels += 1;
      }
    }
    for (const [provinceId, pos] of Object.entries(data.provinceLabelPos ?? {})) {
      const text = names[provinceId];
      if (text === undefined) continue;
      const id = `province:${provinceId}`;
      activeLabels.add(id);
      let part = this.labelParts.get(id);
      if (part === undefined) {
        const label = new BitmapText({
          text,
          style: { fontFamily: 'Noto Serif TC', fontSize: 14 },
        });
        label.position.set(pos.x, pos.y);
        this.layers.labels.addChild(label);
        part = { label, kind: 'province' };
        this.labelParts.set(id, part);
      }
      part.label.text = text;
      this.labelCull.upsert(id, pos.x, pos.y);
      this.rebuildCounts.labels += 1;
    }
    for (const [id, part] of this.nodeParts) {
      if (active.has(id)) continue;
      this.layers.nodeMarkers.removeChild(part.graphics);
      part.graphics.destroy();
      this.nodeParts.delete(id);
      this.nodeCull.remove(id);
    }
    for (const [id, part] of this.labelParts) {
      if (activeLabels.has(id)) continue;
      this.layers.labels.removeChild(part.label);
      part.label.destroy();
      this.labelParts.delete(id);
      this.labelCull.remove(id);
    }
  }

  /**
   * nodeMarkers owner dirty-update（M6-V4 §3.3.3）：只重畫 owner 相對前一次 view 真的變了的
   * node。`day`／`selection`／`analysisMode`／`battles`／`durability`/`siegeMode`/`warning`/
   * `terrainKind` 等其餘欄位變化一律不觸發（§3.3.5 dirty 判定條件表）。V4 `territory` 圖層容器仍空
   * （V5 掛 `TerritoryGrid`），`rebuildCounts.territory` 僅作為 dirty 訊號雛形計數（§3.3.3 觀測口徑）。
   */
  private applyOwnerDirty(view: MapViewState): void {
    const next = buildOwnerByNode(view);
    const dirty = diffOwnerByNode(this.prevOwnerByNode, next);
    if (dirty.size > 0) this.rebuildCounts.territory += 1;
    const data = this.staticData;
    if (data !== null) {
      for (const nodeId of dirty) {
        const part = this.nodeParts.get(nodeId);
        if (part === undefined) continue;
        const node = data.graph.nodes.get(nodeId as never);
        if (node === undefined) continue;
        const owner = next.get(nodeId) ?? null;
        part.graphics.clear();
        drawNodeMarker(part.graphics, node, owner, data.clanColorIndex);
        this.rebuildCounts.nodeMarkers += 1;
      }
    }
    this.prevOwnerByNode = next;
  }

  /**
   * 事件管線（01 §3.6.1「事件流出」）：單一 canvas 指標事件 + 空間查詢（04 §3.12.1）——stage 收
   * pointermove/pointertap/rightclick → 轉世界座標 → `MapInteraction` 命中測試 → 轉 MapRendererEvent
   * → onEvent callback（M2-17）。
   */
  private attachEvents(app: Application): void {
    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen; // 全螢幕命中；逐節點命中測試為空間查詢，非逐物件監聽（04 §3.12.1）
    stage.on('pointermove', this.onPointerMove);
    stage.on('pointerdown', this.onPointerDown);
    stage.on('pointerup', this.onPointerUp);
    stage.on('pointerupoutside', this.onPointerUp);
    stage.on('pointertap', this.onPointerTap);
    stage.on('rightclick', this.onRightClick);
    app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private emit(event: MapRendererEvent): void {
    this.onEvent?.(event);
  }

  /** 初始「置中全圖」縮放：把 4096 世界縮進視窗，夾限於 MAPVIEW.min/maxScale（camera 初始 scale）。 */
  private computeFitScale(): number {
    if (this.app === null) return MAPVIEW.minScale;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    if (sw <= 0 || sh <= 0) return MAPVIEW.minScale;
    const fit = Math.min(sw / WORLD_SIZE, sh / WORLD_SIZE);
    return Math.max(MAPVIEW.minScale, Math.min(MAPVIEW.maxScale, fit));
  }

  /** 取鏡頭當下變換套用至 world 容器（scale.set／position.set）；每幀（onTick）與 resize 時呼叫。 */
  private applyCameraTransform(): void {
    if (this.app === null || this.layers === null || this.camera === null) return;
    const t = this.camera.getWorldTransform({
      width: this.app.screen.width,
      height: this.app.screen.height,
    });
    this.layers.world.scale.set(t.scale);
    this.layers.world.position.set(t.x, t.y);
  }

  /** Camera-driven LOD switches plus bucket culling for dynamic scene objects. */
  private applyLodAndCulling(): void {
    if (this.app === null || this.layers === null || this.camera === null) return;
    const camera = this.camera.getState();
    const halfWidth = this.app.screen.width / (2 * camera.scale);
    const halfHeight = this.app.screen.height / (2 * camera.scale);
    const rect = {
      left: camera.x - halfWidth,
      right: camera.x + halfWidth,
      top: camera.y - halfHeight,
      bottom: camera.y + halfHeight,
    };
    const visibleArmies = this.armyCull.query(rect);
    const visibleSieges = this.siegeCull.query(rect);
    const visibleNodes = this.nodeCull.query(rect);
    const visibleLabels = this.labelCull.query(rect);
    for (const [id, part] of this.armyParts) {
      part.container.visible = visibleArmies.has(id) && !this.collapsedArmyIds.has(id);
    }
    for (const [id, part] of this.siegeParts) part.container.visible = visibleSieges.has(id);
    const near = lodModeForScale(camera.scale) === 'near';
    for (const [id, part] of this.nodeParts) {
      const mainCastle = part.kind === 'castle' && this.staticData?.castleTier?.[id] === 'main';
      part.graphics.visible = visibleNodes.has(id) && (near || part.kind === 'castle');
      part.graphics.scale.set(!near && mainCastle ? 1.4 : 1);
    }
    for (const [id, part] of this.labelParts) {
      const mainCastle = part.kind === 'castle' && this.staticData?.castleTier?.[id] === 'main';
      const lodVisible =
        part.kind === 'province'
          ? !near
          : near &&
            ((part.kind === 'castle' && mainCastle) || shouldShowDetailLabels(camera.scale));
      part.label.visible = visibleLabels.has(id) && lodVisible;
    }
    this.layers.roads.visible = near;
    this.layers.labels.visible = true;
  }

  /**
   * armies：per-id diff（M6-V4 §3.3.4）。pos 由 `armyWorldPos`（`dirty.ts`，決策 D6）內插——
   * `MapArmyView` 座標無關，只帶 `fromNode`/`toNode`/`edgeT`；`stackKey`（UI 疊放概念，不進 core
   * 契約）由 `armyStackKey` 導出，逐字等價改前 `MainScreen` 內插語意（補遺 AD-V4-4）。`colorIndex`
   * 查 `staticData.clanColorIndex[clanId] ?? 0`（對齊現行 `?? 0` fallback，視覺不變）。`ArmyChip.update`
   * 冪等（§3.4）：只 pos 變→僅 reposition，回傳 `false`，累計 `rebuildCounts.armyChips` 不增；繪製
   * 欄位變→重繪，回傳 `true`，計數 +1（DoD③）。互動命中測試資料（`interaction.setArmies`）維持餵入
   * 不變（補遺 AD-V4-1：不得斷線）。sieges 維持現狀：建立/銷毀 diff＋逐幀動畫（onTick）不套用冪等。
   */
  private redrawMilitaryObjects(): void {
    if (this.layers === null) return;
    const graph = this.staticData?.graph;
    const clanColorIndex = this.staticData?.clanColorIndex ?? {};
    const viewArmies = this.view.armies;
    const layoutSource = viewArmies.map((a) => ({
      ...a,
      stackKey: armyStackKey(a),
      pos: graph === undefined ? { x: 0, y: 0 } : armyWorldPos(a, graph),
    }));
    const layout = layoutArmyStacks(layoutSource);
    const activeArmyIds = new Set(viewArmies.map((army) => army.id));
    for (const [id, part] of this.armyParts) {
      if (activeArmyIds.has(id)) continue;
      this.layers.armies.removeChild(part.container);
      part.container.destroy({ children: true });
      this.armyParts.delete(id);
      this.armyCull.remove(id);
    }
    this.collapsedArmyIds = new Set<string>();
    for (const entry of layout) {
      const army = entry.army;
      let part = this.armyParts.get(army.id);
      if (part === undefined) {
        part = createArmyChip();
        this.armyParts.set(army.id, part);
        this.layers?.armies.addChild(part.container);
      }
      if (!entry.visible) this.collapsedArmyIds.add(army.id);
      const pos = entry.pos;
      const redrew = part.update({
        pos,
        colorIndex: clanColorIndex[army.clanId] ?? 0,
        soldiers: army.soldiers,
        morale: army.morale,
        corps: army.corps,
        ...(entry.collapsedCount === undefined ? {} : { collapsedCount: entry.collapsedCount }),
      });
      if (redrew) this.rebuildCounts.armyChips += 1;
      this.armyCull.upsert(army.id, pos.x, pos.y);
    }
    this.interaction.setArmies(
      layout
        .filter((entry) => entry.visible)
        .map((entry) => ({ id: entry.army.id, pos: entry.pos })),
    );

    const sieges = this.view.sieges ?? [];
    const activeSiegeIds = new Set(sieges.map((siege) => siege.id));
    for (const [id, part] of this.siegeParts) {
      if (activeSiegeIds.has(id)) continue;
      this.layers.effects.removeChild(part.container);
      part.container.destroy({ children: true });
      this.siegeParts.delete(id);
      this.siegeCull.remove(id);
    }
    for (const siege of sieges) {
      let part = this.siegeParts.get(siege.id);
      if (part === undefined) {
        part = createSiegeMarker();
        this.siegeParts.set(siege.id, part);
        this.layers.effects.addChild(part.container);
      }
      part.update({
        pos: siege.pos,
        mode: siege.mode,
        elapsedMs: this.siegeElapsedMs,
        reducedMotion: this.reducedMotion,
      });
      this.siegeCull.upsert(siege.id, siege.pos.x, siege.pos.y);
    }
    this.applyLodAndCulling();
  }

  // ── 01 §4.3 契約方法 ──────────────────────────────────────────────

  /** 鏡頭平滑移至節點（UI「前往」按鈕／開局聚焦居城，01 §4.3）：交由 camera.focusOn 補間（04 §3.11，onTick 推進）。 */
  focusNode(nodeId: string): void {
    if (this.camera === null || this.staticData === null) return;
    const node = this.staticData.graph.nodes.get(nodeId as never);
    if (node === undefined) return;
    void this.camera.focusOn(node.pos);
  }

  /**
   * 瞬移鏡頭至指定世界座標／縮放（M6-V2，17 §3.9.3：三段鏡頭 preset 供 e2e 決定論截圖，
   * 由 `TenkaDebugApi.setMapCameraPreset` 呼叫，見 src/app/debug.ts）。`scale` 依
   * `MAPVIEW.minScale..maxScale` 夾限。以 `camera.focusOn(..., { durationMs: 0 })` 實作——見
   * `Camera.focusOn`：`durationMs<=0` 時直接寫入終態並同步 resolve，無補間、無殘留動畫狀態。
   */
  setCameraPose(center: { x: number; y: number }, scale: number): void {
    if (this.camera === null) return;
    const clampedScale = Math.max(MAPVIEW.minScale, Math.min(MAPVIEW.maxScale, scale));
    void this.camera.focusOn(center, { scale: clampedScale, durationMs: 0 });
    this.applyCameraTransform();
    this.applyLodAndCulling();
  }

  /**
   * 等待 n 個連續 Pixi ticker frame 後 resolve（M6-V2：供 e2e 在截圖前確保 renderer 已推進過
   * 「靜止」畫面，17 §3.9.3「連續兩幀 renderer idle」）；frame 計數即可，`prefers-reduced-motion`
   * 下雖無動畫但 ticker 仍每幀 tick，不受影響。`n<=0` 立即 resolve。`destroy()` 呼叫時所有未決
   * waiter 直接 resolve（非 reject）：teardown 視同「已達成 idle 前提」，避免呼叫端因渲染器提前
   * 卸載而收到未預期例外／懸掛 Promise。
   */
  waitForIdleFrames(n: number): Promise<void> {
    if (n <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idleWaiters.push({ framesLeft: n, resolve });
    });
  }

  /** 除錯 overlay 開關（01 §4.3）；debugOverlay 圖層內容屬後續里程碑，本階段僅保存旗標。 */
  setDebugOverlay(flags: Partial<DebugOverlayFlags>): void {
    this.debug = { ...this.debug, overlay: { ...this.debug.overlay, ...flags } };
  }

  /** 尋路／行軍預覽結果（01 §4.3；null 清除），繪於 selectionAndPath 層。 */
  showDebugPath(path: string[] | null, costLabel: string | null): void {
    this.debug = { ...this.debug, path, costLabel };
    this.redrawPathPreview();
  }

  showPathPreview(preview: MapPathPreview | null): void {
    this.marchPathPreview = preview;
    this.redrawPathPreview();
  }

  setMode(mode: MapInteractionMode): void {
    this.interaction.setMode(mode);
  }

  private redrawPathPreview(): void {
    if (this.pathPreview === null || this.staticData === null) return;
    const debugNodes = (this.debug.path ?? []) as MapPathPreview['result']['nodes'];
    const preview: MapPathPreview | null =
      this.marchPathPreview ??
      (debugNodes.length === 0
        ? null
        : {
            result: {
              found: true,
              nodes: debugNodes,
              edgeIds: [],
              travelDays: 0,
              subjugateDays: 0,
              totalDays: 0,
              steps: debugNodes.map((nodeId) => ({
                nodeId,
                etaDays: 0,
                needsSubjugate: false,
              })),
            },
            originNodeId: debugNodes[0]!,
            targetNodeId: debugNodes.at(-1)!,
            unreachable: false,
            hostileNodeIds: [],
          });
    if (preview === null) {
      this.pathPreview?.update(null);
      return;
    }
    this.pathPreview.update({
      graph: this.staticData.graph,
      result: preview.result,
      originNodeId: preview.originNodeId,
      targetNodeId: preview.targetNodeId,
      unreachable: preview.unreachable,
      hostileNodeIds: new Set(preview.hostileNodeIds),
    });
  }

  /** 冪等銷毀（01 §3.6.2）：移除事件與 canvas、銷毀 Pixi Application 與所有 texture；可重複呼叫。 */
  destroy(): void {
    this.disposed = true;
    const app = this.app;
    if (app !== null) {
      app.stage.off('pointermove', this.onPointerMove);
      app.stage.off('pointerdown', this.onPointerDown);
      app.stage.off('pointerup', this.onPointerUp);
      app.stage.off('pointerupoutside', this.onPointerUp);
      app.stage.off('pointertap', this.onPointerTap);
      app.stage.off('rightclick', this.onRightClick);
      app.renderer.off('resize', this.onRendererResize);
      app.ticker.remove(this.onTick);
      app.canvas.removeEventListener('wheel', this.onWheel);
      app.destroy({ removeView: true }, { children: true, texture: true });
    }
    this.app = null;
    this.layers = null;
    this.camera = null;
    this.dragPointerId = null;
    this.seaGfx = null;
    this.roadsGfx = null;
    this.pathPreview = null;
    this.marchPathPreview = null;
    this.nodeParts.clear();
    this.labelParts.clear();
    this.armyParts.clear();
    this.siegeParts.clear();
    this.collapsedArmyIds.clear();
    this.siegeElapsedMs = 0;
    this.initialized = false;
    // waitForIdleFrames 待決佇列（M6-V2）：teardown 視同已達成 idle，直接 resolve（見該方法註解）。
    for (const waiter of this.idleWaiters) waiter.resolve();
    this.idleWaiters = [];
  }

  // ── 平行 agent 掛層／資料流擴充（見檔頭裁定） ──────────────────────

  /**
   * 傳入靜態地圖資料（整局一次）；建立/重繪 roads/nodeMarkers/labels（`buildStaticDataLayers`，
   * D9 靜態化：此後 `updateView` 不再碰它們）、同步互動命中測試資料。`prevOwnerByNode` 重設為
   * `null`，保證下一次 `updateView` 視全部 node 為 dirty（首繪保證，§11.1）。init 前呼叫亦可，
   * init 完成時會套用。
   */
  setMapData(data: MapStaticData | null): void {
    this.staticData = data;
    this.interaction.setStaticData(data);
    if (this.initialized) {
      this.drawStaticBackground(); // outline 可能被 data.outline 覆蓋
      this.buildStaticDataLayers();
      this.prevOwnerByNode = null;
      this.redrawPathPreview(); // graph 換了要重畫 path preview（D9 保留在此，非 updateView）
      this.applyLodAndCulling();
    }
  }

  /**
   * 每 tick 動態視圖更新（04 §4.6）。M6-V4（決策 D8/D9）：不再每次全量重畫——只做 nodeMarkers owner
   * 結構 diff（`applyOwnerDirty`）＋ armies/sieges per-id diff（`redrawMilitaryObjects`）；roads／
   * labels／`redrawPathPreview` 一律不在此呼叫（靜態化／獨立 prop 驅動，見 `setMapData`／
   * `showPathPreview`）。
   */
  updateView(view: MapViewState): void {
    this.view = view;
    if (!this.initialized) return;
    this.applyOwnerDirty(view);
    this.redrawMilitaryObjects();
  }

  /**
   * MiniMap `onNavigate` 用（決策 D10）：瞬移主鏡頭中心至世界座標，維持現縮放（04 §3.13.1
   * 無動畫）。V4 只交付本方法，MiniMap 尚未掛載，接線留 V9（建議 `MapCanvasHost` 以
   * `forwardRef`+`useImperativeHandle` 對外露出，非 remount）。
   */
  panTo(worldX: number, worldY: number): void {
    if (this.camera === null) return;
    const { scale } = this.camera.getState();
    this.setCameraPose({ x: worldX, y: worldY }, scale);
  }

  /** 重繪計數診斷（決策 D11）：供 dirty-update 測試斷言與 V11 layer-presence smoke 沿用。 */
  getRebuildCounts(): Readonly<MapRebuildCounts> {
    return { ...this.rebuildCounts };
  }

  /** 手動 resize（04 §3.12.3）；平時由 Application `resizeTo` 自動處理，此為顯式入口。 */
  resize(width: number, height: number): void {
    if (this.app === null) return;
    this.app.renderer.resize(width, height);
    this.applyCameraTransform();
  }

  /** 供平行 agent（M2-14/16/…）取得圖層容器以掛入自己的 display object；init 前為 null。 */
  getLayers(): MapLayers | null {
    return this.layers;
  }

  /** 供測試／橋接層取用底層 Application（init 前或 destroy 後為 null）。 */
  getApp(): Application | null {
    return this.app;
  }

  /** 是否已完成 init 且未 destroy。 */
  isReady(): boolean {
    return this.initialized && this.app !== null;
  }
}
