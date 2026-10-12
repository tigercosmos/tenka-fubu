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

import { hudFocusTarget, type FocusViewport } from './hudFocus';
import {
  Application,
  BitmapText,
  BufferImageSource,
  Container,
  Graphics,
  Geometry,
  Mesh,
  RendererType,
  Sprite,
  Texture,
} from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import { UI } from '../uiConstants';
import { pointInPolygon } from '@data/map/outlineGeometry';
import { FOREST_ALPHA, MAPVIEW, WORLD_SIZE, TERRAIN_RELIEF } from './mapViewConfig';
import { ROAD_CASING_WIDTH, ROAD_STAGE_WIDTH_MULT } from './mapViewConfig';
import { roadLabelBaselineOffset } from './roadLabelClearance';
import {
  prepareRoadLabelSegments,
  nearbyRoadLabelCapsules,
  roadLabelClearsCapsules,
  type RoadLabelSegment,
} from './roadLabelCapsules';
import {
  LABEL_DECLUTTER_CELL_PX,
  LABEL_STYLE,
  sharedLabelTextStyle,
  bindSharedLabelStyleLifecycle,
  type LabelStyleSpec,
} from './labelStyle';
import { drawSeaBackground, drawLandBackground, loadOutline } from './mapDraw';
import { createCoastSurface } from './terrain/coastSurface';
import { collectRiverBridgeFootprints } from './constrainedCoast';
import { collectRiverDisplayConstraints } from './terrain/riverDisplayConstraints';
import { createSeaSurface } from './terrain/seaSurface';
import { buildRoadsLayer, polylineMidpoint, type SeaTest } from './roads/roadsDraw';
import { edgeBetween, edgeVisualPolyline, tangentAtPolyline } from './roads/roadGeometry';
import { createRoadHighlight } from './roads/roadHighlight';
import { projectPolyline } from './roads/projectPolyline';
import { projectedPolylineHeading } from './roads/projectedHeading';
import {
  armyStackKey,
  armyWorldPos,
  buildNameplateSig,
  buildNodeSig,
  buildOwnerByNode,
  diffNameplateSig,
  diffNodeSig,
  diffOwnerByNode,
} from './dirty';
import {
  createCastleNameplate,
  type CastleNameplatePart,
  type CastleNameplateProps,
} from './sceneParts/castleNameplate';
import { NAMEPLATE_GEOMETRY } from './sceneParts/nameplateStyle';
import { CASTLE_BODY_ART_BY_TIER, castleBodyArtPlacement } from './sceneParts/castleBodyArt';
import { collectCoastFootprints } from './constrainedCoast';
import {
  CASTLE_WARNING_PRESENTATION,
  createCastleNode,
  CASTLE_NODE_GEOMETRY,
  type CastleNodePart,
  type CastleNodeProps,
} from './sceneParts/castleNode';
import {
  createDistrictNode,
  DISTRICT_NODE_GEOMETRY,
  type DistrictNodePart,
  type DistrictNodeProps,
} from './sceneParts/districtNode';
import { createSelectionRing, SELECTION_RING_GEOMETRY } from './sceneParts/selectionRing';
import { buildSettlements } from './settlements/settlementsDraw';
import type { TownCapsule, TownCrest } from './settlements/settlementGeometry';
import { LAYER_ORDER } from './mapViewTypes';
import { MapInteraction, screenToWorld } from './interaction';
import { Camera } from './camera';
import { createPathPreview } from './sceneParts/pathPreview';
import { createArmyChip, layoutArmyStacks } from './sceneParts/armyChip';
import {
  layoutArmyPlates,
  refineArmyPlateSeedReadability,
  type ArmyPlateCandidate,
  type PlateRect,
} from './armyPlateLayout';
import {
  ARMY_SIGNAL_LAYOUT,
  layoutArmySignals,
  type ArmySignalCandidate,
} from './armySignalLayout';
import {
  createGeographicLabelLayouter,
  type GeographicLabelCandidate,
} from './geographicLabelLayout';
import { createWasmGeographicScorer, type WasmGeographicScorer } from './wasmGeographicScorer';
import {
  prioritizeGeographicLabels,
  type GeographicPriorityDecision,
} from './geographicLabelPriority';
import { geographicDeclutterEnvelope } from './geographicDeclutterEnvelope';
import {
  admitContainedCastleRibbons,
  type CastleRibbonPlacement,
} from './sceneParts/castleRibbonLayout';
import { filterCastleRibbonLeaderObstacles } from './sceneParts/castleRibbonLeader';
import { ARMY_BODY_ART, type ArmyBodyArt, type ArmyFacing } from './sceneParts/armyBodyArt';
import { createSiegeMarker, SIEGE_MARKER_GEOMETRY } from './sceneParts/siegeMarker';
import { createBattleSpark, BATTLE_SPARK_TIMING } from './sceneParts/battleSpark';
import { createParticlePool, type ParticlePool } from './sceneParts/particles';
import { lodStageForScale, lodStageWithHysteresis, SpatialCullIndex, type LodStage } from './lod';
import { buildTerritoryGrid, recolorTerritory, type TerritoryGrid } from './territoryGrid';
import {
  createTerrainSprite,
  createWaterFeatures,
  createDimensionalTerrain,
} from './terrain/terrainDraw';
import { MapAssetLoader } from '@ui/assets/loader';
import { createTerrainGround } from './terrain/terrainGround';
import { createTerrainTopography } from './terrain/terrainTopography';
import { createProjectedTerrainOverlay } from './terrain/terrainProjectedOverlay';
import { createTerrainProjectedCanopy } from './terrain/terrainProjectedCanopy';
import { createTerrainFoothillCanopy } from './terrain/terrainFoothillCanopy';
import { createSampledTerrainElevation } from './terrain/sampledTerrainElevation';
import { createTerrainElevatedSurface } from './terrain/terrainElevatedSurface';
import { createTerrainProtectedCells } from './terrain/terrainProtectedCells';
import { createTerrainFieldMaterial } from './terrain/terrainFieldMaterial';
import { buildDisplayCoast, type OutlineGeometry } from './displayCoast';
import {
  createMountainRaster,
  createMountainRasterVariants,
  mountainRasterLayout,
  createForestRaster,
  forestRasterLayout,
} from './terrain/terrainRaster';
import { createAnalysisOverlay } from './analysisOverlay/analysisDraw';
import type { MapAnalysisMode } from './analysisOverlay/analysisModel';
import type { CastleTier } from '@core/state/enums';
import type { MapGraph } from '@core/state/mapGraph';
import {
  allowsSecondaryLabels,
  labelStageForDensity,
  mapMotionReduced,
  type MapPresentationSettings,
} from './presentationSettings';
import type {
  DebugOverlayFlags,
  MapArmyView,
  MapEventHandler,
  MapInteractionMode,
  MapLayers,
  MapPathPreview,
  MapRendererEvent,
  MapStaticData,
  MapViewState,
} from './mapViewTypes';

/**
 * 標籤條目（M6-V9 §2.1）：per-label `Container` 掛節點世界座標（隨 world 平移「免費」正確），
 * `BitmapText` 為其子（anchor 頂-中、局部偏移＝螢幕 px）；相機縮放時 container `scale=1/s`
 * （pixel-lock，字級恆 CSS px）。`lodVisible`/`cullVisible`/`declutterHidden` 三旗標於
 * `applyLodAndCulling` 合成最終 `container.visible`（§2.5 步驟 5）。
 */
interface LabelPart {
  container: Container;
  text: BitmapText;
  kind: 'castle' | 'district' | 'province' | 'road';
  /** 標籤錨點世界座標（declutter worldToScreen 用）。 */
  pos: { x: number; y: number };
  canonicalPos: { x: number; y: number };
  lodVisible: boolean;
  cullVisible: boolean;
  declutterHidden: boolean;
  baselineGap: number;
  baselineShift?: { x: number; y: number };
  roadLine?: {
    normal: { x: number; y: number };
    grade: 1 | 2 | 3;
    segments: readonly RoadLabelSegment[] | null;
  };
}

/**
 * 名牌條目（M6-V9b §2.9）：per-castle `CastleNameplatePart` 掛 `layers.nameplates`（世界座標＋
 * pixel-lock 反向縮放，平行 `lastNameplateScale`）。`lodVisible`/`cullVisible`/`declutterHidden`
 * 三旗標於 `applyLodAndCulling` 合成最終 `container.visible`（比照 LabelPart）；`tier`/`warning`/
 * `isPlayer` 為 declutter 優先序與破例（§2.8：選取我方城/告急/目標恆顯）之快取。
 */
interface NameplateEntry {
  part: CastleNameplatePart;
  /** 節點錨點世界座標（declutter worldToScreen 用；名牌容器另加 worldGap 偏移）。 */
  pos: { x: number; y: number };
  tier: CastleTier;
  warning: 'none' | 'threatened' | 'critical';
  isPlayer: boolean;
  lodVisible: boolean;
  cullVisible: boolean;
  declutterHidden: boolean;
}

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
  /** M6-V9b §2.9：城名牌建/毀（`buildStaticDataLayers`）以名牌 id 為單位計數；與 `labels` 分離。
   *  每 tick 名牌簽章 diff 之冪等 `update` 與反向縮放/declutter（camera-dirty）**不**計入。 */
  nameplates: number;
}

export class MapRenderer {
  private readonly geographicLayouter: ReturnType<typeof createGeographicLabelLayouter>;
  private initialization: Promise<void> | null = null;

  constructor(
    private readonly geographicScorer: Pick<
      WasmGeographicScorer,
      | 'score'
      | 'initialize'
      | 'isReady'
      | 'dispose'
      | 'prepareCastlePlanner'
      | 'layoutCastleRibbons'
    > = createWasmGeographicScorer(),
  ) {
    this.geographicLayouter = createGeographicLabelLayouter(geographicScorer);
  }
  private app: Application | null = null;
  private onEvent: MapEventHandler | null = null;
  private layers: MapLayers | null = null;

  /** 冪等/StrictMode 防護旗標：一旦呼叫 destroy 即為 true，init 的 await 後檢查據此放棄掛載。 */
  private disposed = false;
  private initialized = false;

  private staticData: MapStaticData | null = null;
  private view: MapViewState = EMPTY_VIEW;
  private analysisOpacity = 0.55;
  private analysisOverlay: ReturnType<typeof createAnalysisOverlay> | null = null;
  private registeredListenerCount = 0;
  /** 除錯狀態（01 §4.3 setDebugOverlay/showDebugPath 存放處）；overlay 圖層與路徑繪製屬後續里程碑。 */
  private debug: { overlay: DebugOverlayFlags; path: string[] | null; costLabel: string | null } = {
    overlay: { aiIntent: false, pathfinding: false },
    path: null,
    costLabel: null,
  };

  private seaGfx: Graphics | null = null;
  /**
   * M6-V6：`roads`(5) 圖層改掛單一 `RoadsLayer` 子容器（取代舊 `roadsGfx`＋`drawRoads`）；
   * casing＋內線、waypoints 多段線、道級分批、海路波節、橋樑、per-stage 線寬。只於 `setMapData`
   * 重建（`rebuildCounts.roads` +1／次）；`applyLodAndCulling` 以 `setStage(stage)` 切能見度／依
   * stage 倍率重描（LOD 轉場，非 tick，不動 rebuildCounts；stage 未變則內部早退，守 dirty 契約）。
   */
  private roadsLayer: ReturnType<typeof buildRoadsLayer> | null = null;
  /**
   * M6-V6（Slice E）：節點選取相鄰道路金色高亮（`selectionAndPath`(9) 動態層，掛於 pathPreview
   * 之下）。由 `updateView` 依 `prevSelectionKey` diff 驅動 `update`；不動 `rebuildCounts`。
   */
  private roadHighlight: ReturnType<typeof createRoadHighlight> | null = null;
  /** 上一次已套用之選取節點 id（`null`＝無節點選取）；graph swap 後重設為 null 強制重算高亮。 */
  private prevSelectionKey: string | null = null;
  /**
   * 地形／水系／領地（M6-V5）：relief／forest 為共享烘焙紋理 Sprite（texture 由 `terrainLoader`
   * refcount 管理，destroy 時只 detach＋`destroy({texture:false})`，不隨 `app.destroy` 銷毀共享
   * texture）；`waterFeatures` 為河湖向量；territory 為自持 `BufferImageSource`＋`Texture`（destroy
   * 時顯式銷毀）。`territoryDirty` 為 owner 翻轉後之次幀 recolor 訊號；`lodStage` 為當前三級 LOD 段
   * （hysteresis 狀態）；`terrainTexturesPending` 於 relief/forest 尚未 attach 前 gate 住 idle 推進
   * （截圖決定論，VD3／§5.1）。
   */
  private reliefSprite: Sprite | null = null;
  private forestSprite: Sprite | null = null;
  private dimensionalTerrain: Container | null = null;
  private mountainRaster: ReturnType<typeof createMountainRaster> | null = null;
  private forestRaster: ReturnType<typeof createForestRaster> | null = null;
  private groundMaterial: ReturnType<typeof createTerrainGround> | null = null;
  private elevatedSurface: ReturnType<typeof createTerrainElevatedSurface> | null = null;
  private projectedCanopy: ReturnType<typeof createTerrainProjectedCanopy> | null = null;
  private foothillCanopy: ReturnType<typeof createTerrainFoothillCanopy> | null = null;
  private terrainProjectionError: string | null = null;
  private fieldMaterial: ReturnType<typeof createTerrainFieldMaterial> | null = null;
  private displayCoast: OutlineGeometry = { polygons: [] };
  private emittedSeaPolygons: OutlineGeometry['polygons'] = [];
  private coastSurface: ReturnType<typeof createCoastSurface> | null = null;
  private seaSurface: ReturnType<typeof createSeaSurface> | null = null;
  private coastLandGfx: Graphics | null = null;
  private groundSurface: {
    container: Container;
    content: Container;
    paint: Container;
    clip: Graphics;
    polygons: OutlineGeometry['polygons'];
  } | null = null;
  private terrainLoadGeneration = 0;
  private waterFeatures: ReturnType<typeof createWaterFeatures> | null = null;
  private territoryGrid: TerritoryGrid | null = null;
  private territorySprite:
    Sprite | ReturnType<typeof createProjectedTerrainOverlay>['mesh'] | null = null;
  private territoryProjectedOverlay: ReturnType<typeof createProjectedTerrainOverlay> | null = null;
  private territoryTexture: Texture | null = null;
  private territorySource: BufferImageSource | null = null;
  private territoryDirty = false;
  private lodStage: LodStage = 'far';
  /**
   * M6-V8（V8D11）：軍隊 chip 已繪製之 LOD 段，與 `lodStage` 解耦。`setCameraPose` 於呼叫
   * `applyLodAndCulling` 前已預改 `lodStage`（line ~1023），故不能以 `stage !== this.lodStage`
   * 判定 preset 路徑之 restage（恆為 false，軍隊會凍結在開機 far detail）。改以本欄位落差
   * （`this.lodStage !== this.armyChipStage`）在 `applyLodAndCulling` 開頭觸發 `syncArmyChips`；
   * `syncArmyChips` 末行登記 `this.armyChipStage = this.lodStage`。init 初值與 `lodStage` 一致，
   * 故 init 不因段落差重繪（首個 updateView 之 syncArmyChips 為正常首繪）。
   */
  private armyChipStage: LodStage = 'far';
  private terrainLoader: MapAssetLoader | null = null;
  private castleArtLoader: MapAssetLoader | null = null;
  private castleArtGeneration = 0;
  private castleArtPending = false;
  private armyArtLoader: MapAssetLoader | null = null;
  private armyArtGeneration = 0;
  private armyArtPending = false;
  private armyArtRequested = false;
  private armyBodyArt: ArmyBodyArt = {};
  private castleBodyArt: Parameters<CastleNodePart['setBodyArt']>[0] = {};
  private terrainTexturesPending = false;
  private pathPreview: ReturnType<typeof createPathPreview> | null = null;
  private marchPathPreview: MapPathPreview | null = null;
  private readonly nodeParts = new Map<
    string,
    { part: CastleNodePart | DistrictNodePart; kind: 'castle' | 'district' }
  >();
  /**
   * M6-V7（CD1）：節點視覺簽章 diff 之前一 view 簽章查表（`null`＝全部 dirty）。與 `prevOwnerByNode`
   * 於 `setMapData`/`init` 同處重設為 `null`，保證重建後下一次 `updateView` 全節點重繪一次
   * （首繪保證；節點重繪計數＝簽章 diff 成員數，非元件 `update` 回傳，見 §13-B3）。
   */
  private prevNodeSig: Map<string, string> | null = null;
  /** M6-V7（CD5）：節點選取環（金色雙環，錨點置中）；掛於 `selectionAndPath` 之 roadHighlight 與 pathPreview 之間。 */
  private selectionRing: ReturnType<typeof createSelectionRing> | null = null;
  private castleGroundStatus: Container | null = null;
  /** M6-V7（CD4）：城下聚落（本城城下屋頂群＋田畦，`settlements` 層；靜態一次建、close LOD 顯隱、不動計數）。 */
  private settlements: ReturnType<typeof buildSettlements> | null = null;
  private settlementModelBounds: readonly Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>[] = Object.freeze([]);
  private settlementObstacles: readonly (TownCapsule & { readonly id: string })[] = [];
  private settlementCrests: readonly TownCrest[] = [];
  private readonly labelParts = new Map<string, LabelPart>();
  /**
   * M6-V9b（DD-A0）：城名牌 part 存放處（castleId → NameplateEntry），於 `buildStaticDataLayers`
   * 隨城節點一併建立（城名移出 `labelParts`），每 tick 由**名牌專屬簽章** diff（`prevNameplateSig`）
   * 驅動冪等 `update`（§2.9；與 node 簽章路徑完全分離——node 簽章不含 soldiers）。
   */
  private readonly nameplateParts = new Map<string, NameplateEntry>();
  /** M6-V9b §2.9：名牌簽章 diff 之前一 view 簽章查表（`null`＝全部 dirty；比照 `prevNodeSig`）。 */
  private prevNameplateSig: Map<string, string> | null = null;
  /**
   * M6-V9b §2.9：名牌 pixel-lock 反向縮放快取（平行 `lastLabelScale`，同步觸發；NaN 哨兵語意同）。
   */
  private lastNameplateScale = Number.NaN;
  /** M6-V9b §3.4：出陣目標城 id（`setMarchTarget`）；該名牌金框高亮＋declutter 破例恆顯。 */
  private marchTargetId: string | null = null;
  /**
   * M6-V9（§2.1）pixel-lock 反向縮放快取：`applyLodAndCulling` 於 `camera.scale !== lastLabelScale`
   * 時才遍歷標籤設 `container.scale = 1/scale`（camera-dirty，不動 `rebuildCounts`）。
   * `buildStaticDataLayers` 尾重設為 NaN（哨兵：NaN !== 任何值 → 下一次必全量重設，杜絕
   * 「新標籤停在 scale=1」的快取漏更）。
   */
  private lastLabelScale = Number.NaN;
  /** M6-V9（§2.5）declutter idle 下降沿偵測：上一幀是否 idle（拖曳/慣性/focusOn 皆停）。 */
  private lastCameraIdle = false;
  private readonly armyParts = new Map<string, ReturnType<typeof createArmyChip>>();
  private readonly aggregateArmyIds = new Set<string>();
  private armyPlateLayoutSignature: string | null = null;
  private armyPlateLayoutRuns = 0;
  private armySignalLayoutSignature: string | null = null;
  private armySignalLayoutRuns = 0;
  private geographicLabelLayoutSignature: string | null = null;
  private geographicLabelLayoutRuns = 0;
  private geographicLabelPriority: ReadonlyMap<string, GeographicPriorityDecision> = new Map();
  private geographicLabelPrioritySignature: string | null = null;
  private geographicHoveredNode: string | null = null;
  private geographicAlertSource: MapViewState['districts'] = undefined;
  private geographicAlertIds = new Set<string>();
  private geographicLabelOffsets = new Map<string, { x: number; y: number }>();
  private armyPlateOffsets = new Map<string, { x: number; y: number }>();
  private castleRibbonPlacements = new Map<string, CastleRibbonPlacement>();
  private castleRibbonLayoutSignature: string | null = null;
  private castleRibbonOriginalSignature: string | null = null;
  private castleRibbonContextSignature: string | null = null;
  private castleRibbonLayoutRuns = 0;
  private castleRibbonLayoutLimited = false;
  private castleRibbonSeedOffsets = new Map<string, { x: number; y: number }>();
  private castleRibbonSeedPlates: { id: string; kind: string; rect: PlateRect; hard: boolean }[] =
    [];
  private readonly renderFrameDisposers = new Set<() => void>();
  private screenLayoutsPending = false;
  private screenLayoutObserverRegistered = false;
  private readonly screenLayoutObserver = { prerender: (): void => this.flushScreenLayouts() };
  private readonly siegeParts = new Map<string, ReturnType<typeof createSiegeMarker>>();
  private particlePool: ParticlePool | null = null;
  private readonly battleSparks = new Map<
    string,
    {
      part: ReturnType<typeof createBattleSpark>;
      pos: { x: number; y: number };
    }
  >();
  private sparkElapsedMs = 0;
  private readonly armyCull = new SpatialCullIndex<string>();
  private readonly siegeCull = new SpatialCullIndex<string>();
  private readonly nodeCull = new SpatialCullIndex<string>();
  private readonly labelCull = new SpatialCullIndex<string>();
  private readonly nameplateCull = new SpatialCullIndex<string>();
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
    nameplates: 0,
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
  private sceneProjection: ReturnType<typeof createSampledTerrainElevation> | null = null;

  private presentPoint(point: { x: number; y: number }): { x: number; y: number } {
    return this.sceneProjection?.project(point) ?? { ...point };
  }

  private projectScenePoint = (point: { x: number; y: number }) => ({ ...point });

  private canonicalPoint(point: { x: number; y: number }): { x: number; y: number } {
    return this.sceneProjection?.unproject(point) ?? { ...point };
  }
  private focusViewport: FocusViewport | null = null;
  private screenOcclusions: PlateRect[] = [];
  /** 拖曳平移狀態：進行中的指標 id（null＝未拖曳）、上一幀與按下起點螢幕座標、是否已越過拖曳判別門檻。 */
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private downPointerX = 0;
  private downPointerY = 0;
  private pointerDragged = false;

  private readonly onPointerDown = (event?: FederatedPointerEvent): void => {
    if (event === undefined || this.camera === null) return;
    this.emit({ type: 'hoverEnd' });
    // Any press stops old motion, but only the owning left/middle pointer may pan.
    this.camera.startDrag();
    if (this.dragPointerId !== null) return;
    if (event.button !== 0 && event.button !== 1) {
      this.camera.endDrag();
      return;
    }
    const g = event.global;
    this.dragPointerId = event.pointerId;
    this.downPointerX = this.lastPointerX = g.x;
    this.downPointerY = this.lastPointerY = g.y;
    this.pointerDragged = false;
  };

  private readonly onPointerMove = (event?: FederatedPointerEvent): void => {
    const g = event?.global;
    const gx = g?.x ?? 0;
    const gy = g?.y ?? 0;
    // 拖曳中：以螢幕位移驅動鏡頭平移，暫停 hover 命中測試（04 §3.11）。
    if (this.dragPointerId !== null && this.camera !== null) {
      if (event?.pointerId !== this.dragPointerId) return;
      if (!this.pointerDragged) {
        if (
          Math.hypot(gx - this.downPointerX, gy - this.downPointerY) <= MAPVIEW.dragTapThresholdPx
        ) {
          return;
        }
        this.pointerDragged = true;
      }
      // Until crossing >4px, lastPointer remains the press origin: the first
      // accepted drag includes the full displacement, not only the last move.
      this.camera.dragMove(gx - this.lastPointerX, gy - this.lastPointerY);
      this.lastPointerX = gx;
      this.lastPointerY = gy;
      return;
    }
    // Pixi listens to document-level pointer moves. DOM strategy controls own
    // their idle hover; an already-owned canvas drag still follows the branch above.
    const nativeTarget = event?.nativeEvent?.target;
    if (nativeTarget != null && nativeTarget !== this.app?.canvas) {
      this.emit({ type: 'hoverEnd' });
      return;
    }
    const world = this.toWorldPoint(gx, gy);
    this.interaction.handleMove(world.x, world.y, gx, gy);
  };

  private readonly onPointerUp = (event?: FederatedPointerEvent): void => {
    if (this.dragPointerId === null) return;
    if (event !== undefined && event.pointerId !== this.dragPointerId) return;
    this.dragPointerId = null;
    this.camera?.endDrag(); // 達門檻速度則起始慣性（由 onTick 推進）
  };

  private cancelPointerMotion(): void {
    this.emit({ type: 'hoverEnd' });
    this.dragPointerId = null;
    // A cancelled gesture cannot become a click; the next pointerdown resets this.
    this.pointerDragged = true;
    // startDrag cancels focus/inertia and zeroes velocity, so endDrag cannot start
    // new inertia. Keep normal pointerup's last-velocity behavior unchanged.
    this.camera?.startDrag();
    this.camera?.endDrag();
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId) return;
    this.cancelPointerMotion();
  };

  private readonly onWindowBlur = (): void => this.cancelPointerMotion();
  private readonly onPointerLeave = (): void => this.emit({ type: 'hoverEnd' });

  private readonly onPointerTap = (event?: FederatedPointerEvent): void => {
    if (this.dragPointerId !== null && event?.pointerId !== this.dragPointerId) return;
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
    this.sparkElapsedMs += deltaMs;
    this.updateBattleSparks();
    this.cameraEventElapsedMs += deltaMs;
    if (!this.reducedMotion) {
      this.siegeElapsedMs += deltaMs;
      this.updateSiegeAnimations();
    }
    this.applyCameraTransform();
    this.applyLodAndCulling();
    this.emitCameraChanged();
    this.advanceIdleWaiters();
  };

  /** 每幀推進 `waitForIdleFrames` 待決佇列（M6-V2）：frame 計數即可，見該方法註解。 */
  private advanceIdleWaiters(): void {
    // M6-V5：relief/forest 尚未 attach 前不推進 idle，保證截圖含地形（決定論，§5.1）。
    if (this.terrainTexturesPending || this.castleArtPending || this.armyArtPending) return;
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
        pos: this.presentPoint(siege.pos),
        mode: siege.mode,
        elapsedMs: this.siegeElapsedMs,
        reducedMotion: this.reducedMotion || !this.presentation.effectsEnabled,
      });
    }
  }

  private updateBattleSparks(): void {
    if (this.reducedMotion) this.particlePool?.clear();
    else this.particlePool?.advanceTo(this.sparkElapsedMs);
    for (const { part, pos } of this.battleSparks.values()) {
      part.update({
        pos: this.presentPoint(pos),
        timeMs: this.sparkElapsedMs,
        reduceMotion: this.reducedMotion,
      });
    }
  }

  /** Scene-owned, bounded pool: emitters never own or clear another renderer's particles. */
  private syncBattleSparks(): void {
    if (this.layers === null || this.staticData === null) return;
    const desired = new Map<string, { pos: { x: number; y: number }; assault: boolean }>();
    for (const battle of this.view.battles) {
      if (battle.kind !== 'field') continue;
      const graph = this.staticData.graph;
      const node = graph.nodes.get(battle.nodeOrEdgeId as never);
      const edge = graph.edges.get(battle.nodeOrEdgeId as never);
      const polyline = edge === undefined ? null : edgeVisualPolyline(edge, graph);
      const pos = node?.pos ?? (polyline === null ? null : polylineMidpoint(polyline));
      if (pos !== null) desired.set(`field:${battle.nodeOrEdgeId}`, { pos, assault: false });
    }
    for (const siege of this.view.sieges ?? []) {
      if (siege.mode === 'assault')
        desired.set(`siege:${siege.id}`, { pos: siege.pos, assault: true });
    }
    for (const [key, { part }] of this.battleSparks) {
      if (desired.has(key)) continue;
      part.container.parent?.removeChild(part.container);
      part.destroy();
      this.battleSparks.delete(key);
    }
    if (desired.size === 0) {
      this.particlePool?.clear();
      return;
    }
    if (this.particlePool === null) {
      this.particlePool = createParticlePool();
      this.layers.effects.addChild(this.particlePool.container);
    }
    for (const [key, { pos, assault }] of [...desired.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const existing = this.battleSparks.get(key);
      if (existing !== undefined) existing.pos = pos;
      else {
        const part = createBattleSpark({
          particlePool: this.particlePool,
          intervalMs: assault
            ? BATTLE_SPARK_TIMING.assaultIntervalMs
            : BATTLE_SPARK_TIMING.intervalMs,
          showIcon: !assault,
        });
        this.layers.effects.addChild(part.container);
        this.battleSparks.set(key, { part, pos });
      }
    }
    this.updateBattleSparks();
  }

  private clearBattleSparks(): void {
    for (const { part } of this.battleSparks.values()) {
      part.container.parent?.removeChild(part.container);
      part.destroy();
    }
    this.battleSparks.clear();
    this.particlePool?.container.parent?.removeChild(this.particlePool.container);
    this.particlePool?.destroy();
    this.particlePool = null;
    this.sparkElapsedMs = 0;
  }

  /** stage 全域座標（event.global）→ 世界座標：反套用 `world` 容器目前的平移／縮放（04 §3.12.1）。 */
  private toWorldPoint(screenX: number, screenY: number): { x: number; y: number } {
    if (this.layers === null) return { x: screenX, y: screenY };
    const { position, scale } = this.layers.world;
    const scene = screenToWorld(screenX, screenY, {
      x: position.x,
      y: position.y,
      scale: scale.x,
    });
    return this.canonicalPoint(scene);
  }

  /**
   * 建立 Pixi Application、載入 8 圖層容器、繪製靜態層（海陸背景＋若已有資料則街道/標記）、
   * 開始事件管線；`host` 為滿版容器 div（01 §3.6.2）。可安全並發於 destroy（見檔頭防護）。
   */
  init(host: HTMLElement, onEvent: MapEventHandler): Promise<void> {
    if (this.disposed || this.initialized || this.app !== null) return Promise.resolve();
    if (this.initialization) return this.initialization;
    const initialization = this.initialize(host, onEvent);
    this.initialization = initialization;
    const clear = () => {
      if (this.initialization === initialization) this.initialization = null;
    };
    void initialization.then(clear, clear);
    return initialization;
  }

  private async initialize(host: HTMLElement, onEvent: MapEventHandler): Promise<void> {
    if (!this.geographicScorer.isReady()) await this.geographicScorer.initialize();
    if (this.disposed) return;
    this.geographicScorer.prepareCastlePlanner();
    this.onEvent = onEvent;

    const app = new Application();
    await app.init({
      resizeTo: host,
      resolution: Math.min(window.devicePixelRatio || 1, UI.uiDprMax),
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
    host.appendChild(app.canvas);

    this.layers = this.buildLayers(app);
    // All unpainted view/camera updates share the actual Pixi render boundary.
    app.renderer.runners.prerender.add(this.screenLayoutObserver);
    this.screenLayoutObserverRegistered = true;
    this.registeredListenerCount += 1;
    this.terrainLoader = new MapAssetLoader(); // 建構本身不 load（relief/forest 於 loadTerrainTextures acquire）
    this.castleArtLoader = new MapAssetLoader();
    this.armyArtLoader = new MapAssetLoader();
    // Ground status is behind every node model; route highlights/previews stay above actors.
    this.castleGroundStatus = new Container();
    this.castleGroundStatus.label = 'castleGroundStatus';
    this.layers.nodeMarkers.addChild(this.castleGroundStatus);
    this.roadHighlight = createRoadHighlight(this.projectScenePoint);
    this.layers.selectionAndPath.addChild(this.roadHighlight.container);
    this.selectionRing = createSelectionRing();
    this.selectionRing.container.visible = false;
    this.castleGroundStatus.addChild(this.selectionRing.container);
    this.pathPreview = createPathPreview(this.projectScenePoint);
    this.layers.selectionAndPath.addChild(this.pathPreview.container);
    this.refreshDisplayCoast();
    this.drawStaticBackground();
    this.resetArmyBodyArt();
    this.loadArmyBodyArt();
    // Blocker 1（§5.1）：地形/水系/領地必須在 init() 亦建構——實機 effect 序為 init(async)→
    // setMapData(initialized===false)→updateView(early-return)，若只掛 setMapData-initialized 分支
    // 則實機/fixture 永遠空地形。此時 this.view/this.staticData 已具 pre-init 值。
    this.reconstructTerrainLayers();
    this.loadCastleBodyArt();
    this.prevOwnerByNode = null; // 首繪保證（§11.1）：下一次 updateView 視全部 node 為 dirty
    this.prevNodeSig = null; // M6-V7：同上，節點簽章 diff 首繪保證
    this.prevNameplateSig = null; // M6-V9b §2.9：名牌簽章 diff 首繪保證（比照 prevNodeSig）
    this.redrawMilitaryObjects();
    this.redrawPathPreview();
    // 鏡頭：初始置中全圖（fit scale），使用者以滾輪／拖曳操作，focusNode 補間聚焦（04 §3.11）。
    this.camera = new Camera(
      { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, scale: this.computeFitScale() },
      undefined,
      this.sceneProjection,
    );
    this.camera.setReducedMotion(this.reducedMotion);
    this.applyCameraTransform();
    this.applyLodAndCulling();
    this.attachEvents(app);
    app.renderer.on('resize', this.onRendererResize);
    this.registeredListenerCount += 1;
    app.ticker.add(this.onTick);
    this.registeredListenerCount += 1;
    this.initialized = true;
  }

  /** 建立鏡頭根 `world` 與15個圖層容器（04 §3.10.1 層序，由 LAYER_ORDER 保證）。 */
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
      terrainBase: containers.terrainBase as Container,
      waterFeatures: containers.waterFeatures as Container,
      territory: containers.territory as Container,
      analysisOverlay: containers.analysisOverlay as Container,
      roads: containers.roads as Container,
      settlements: containers.settlements as Container,
      nodeMarkers: containers.nodeMarkers as Container,
      actorBodies: containers.actorBodies as Container,
      nameplates: containers.nameplates as Container,
      armies: containers.armies as Container,
      selectionAndPath: containers.selectionAndPath as Container,
      effects: containers.effects as Container,
      labels: containers.labels as Container,
      debug: containers.debug as Container,
    };
  }

  /** Only canonical-to-display boundary. Interaction and MiniMap keep canonical geometry. */
  private refreshDisplayCoast(): void {
    const raw = this.staticData?.outline ?? loadOutline();
    this.displayCoast = this.staticData
      ? buildDisplayCoast(raw, this.staticData.graph, this.staticData.terrain?.rivers)
      : raw;
  }

  /** Ground paint only: never clip raised canopy, ridges or their dimensional silhouettes. */
  private groundSurfaceContent(): Container {
    if (this.groundSurface) return this.groundSurface.paint;
    const container = new Container();
    container.label = 'terrain-ground-surface';
    container.eventMode = 'none';
    const content = new Container();
    content.eventMode = 'none';
    const paint = new Container();
    paint.eventMode = 'none';
    content.addChild(paint);
    if (this.coastSurface) content.addChild(this.coastSurface.landContainer);
    const clip = new Graphics();
    clip.eventMode = 'none';
    const polygons = this.displayCoast.polygons.map((polygon) => ({
      id: polygon.id,
      points: [...polygon.points],
    }));
    for (const polygon of polygons) clip.poly([...polygon.points]).fill(0xffffff);
    content.mask = clip;
    container.addChild(content, clip);
    this.layers?.terrainBase.addChild(container);
    this.groundSurface = { container, content, paint, clip, polygons };
    return paint;
  }

  private destroyGroundSurface(): void {
    if (!this.groundSurface) return;
    const { container, content } = this.groundSurface;
    this.groundSurface = null;
    content.mask = null;
    this.coastSurface?.landContainer.parent?.removeChild(this.coastSurface.landContainer);
    container.parent?.removeChild(container);
    container.destroy({ children: true, context: true, texture: false, textureSource: false });
  }

  /** 圖層 0 seaBackground：顯示海岸；不回寫 canonical outline。 */
  private drawStaticBackground(): void {
    if (this.layers === null) return;
    if (this.seaGfx === null) {
      this.seaGfx = new Graphics();
      this.layers.seaBackground.addChild(this.seaGfx);
    }
    this.seaSurface?.destroy();
    this.seaSurface = null;
    this.coastSurface?.destroy();
    this.coastSurface = this.staticData ? createCoastSurface(this.displayCoast) : null;
    this.coastLandGfx ??= new Graphics();
    this.coastLandGfx.clear();
    if (this.coastSurface) {
      drawSeaBackground(this.seaGfx, this.displayCoast, {
        coast: false,
        land: false,
        detail: false,
      });
      this.seaSurface = createSeaSurface();
      this.seaGfx.addChild(this.seaSurface.container);
      this.layers.seaBackground.addChild(this.coastSurface.seaContainer);
      drawLandBackground(this.coastLandGfx, this.displayCoast);
      this.layers.seaBackground.addChild(this.coastLandGfx);
      this.groundSurfaceContent();
      this.groundSurface?.content.addChild(this.coastSurface.landContainer);
    } else {
      this.coastLandGfx.parent?.removeChild(this.coastLandGfx);
      drawSeaBackground(this.seaGfx, this.displayCoast);
    }
    this.emittedSeaPolygons = this.displayCoast.polygons.map((polygon) => ({
      id: polygon.id,
      points: [...polygon.points],
    }));
    if (this.groundSurface) {
      this.groundSurface.polygons = this.emittedSeaPolygons.map((polygon) => ({
        id: polygon.id,
        points: [...polygon.points],
      }));
      this.groundSurface.clip.clear();
      for (const polygon of this.groundSurface.polygons)
        this.groundSurface.clip.poly([...polygon.points]).fill(0xffffff);
    }
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
    // M6-V6：舊 RoadsLayer 先卸載＋銷毀（每次 setMapData 重建；取代舊 roadsGfx.clear/drawRoads）。
    if (this.roadsLayer) {
      this.layers.roads.removeChild(this.roadsLayer.container);
      this.roadsLayer.destroy();
      this.roadsLayer = null;
    }
    if (data === null) {
      for (const [id, part] of this.armyParts) {
        part.destroy();
        this.armyCull.remove(id);
      }
      this.armyParts.clear();
      this.actorDepthSignature = null;
      for (const entry of this.nodeParts.values()) entry.part.destroy();
      for (const part of this.labelParts.values()) part.container.destroy({ children: true });
      // M6-V9b：清城名牌（比照 node/label；cull 索引一併移除）。
      for (const [id, entry] of this.nameplateParts) {
        entry.part.destroy();
        this.nameplateCull.remove(id);
      }
      this.layers.nodeMarkers.removeChildren();
      if (this.castleGroundStatus) this.layers.nodeMarkers.addChild(this.castleGroundStatus);
      if (this.castleGroundStatus) this.castleGroundStatus.visible = false;
      this.layers.nameplates.removeChildren();
      this.layers.labels.removeChildren();
      this.nodeParts.clear();
      this.labelParts.clear();
      this.nameplateParts.clear();
      // M6-V7：清城下聚落＋隱節點選取環（node/label 之清理如上）。
      if (this.settlements) {
        this.layers.settlements.removeChild(this.settlements.container);
        this.settlements.destroy();
        this.settlements = null;
      }
      this.settlementObstacles = [];
      this.settlementModelBounds = Object.freeze([]);
      if (this.selectionRing) this.selectionRing.container.visible = false;
      this.settlementCrests = [];
      this.roadHighlight?.update(null); // 清空選取高亮
      this.prevSelectionKey = null;
      return;
    }
    if (this.castleGroundStatus) this.castleGroundStatus.visible = true;
    // M6-V6：以 outline 陸地多邊形建 seaTest（海路波節僅落海之弧節繪製，陸段抑制，§4.1/§5.1）。
    const landPolys = this.displayCoast.polygons.map((p) => p.points);
    const seaTest: SeaTest = (x, y) => {
      const point = this.canonicalPoint({ x, y });
      return !landPolys.some((poly) => pointInPolygon(point.x, point.y, poly));
    };
    this.roadsLayer = buildRoadsLayer(data.graph, seaTest, this.projectScenePoint);
    this.layers.roads.addChild(this.roadsLayer.container);
    this.roadsLayer.setStage(this.lodStage); // 首描（依當前 stage 倍率）
    // graph swap 後：立即清舊高亮（鏡像 data===null 分支；否則新選取為 null 時 updateView 的
    // selKey diff 為 null===null 不觸發 update，舊圖 gold strokes 殘留）＋強制下次 updateView 重算。
    this.roadHighlight?.update(null);
    if (this.selectionRing) this.selectionRing.container.visible = false; // M6-V7：同步隱選取環（否則 swap→deselect 殘留舊環）
    this.prevSelectionKey = null;
    this.rebuildCounts.roads += 1; // 維持一次（dirty 契約：+1/次 setMapData）
    const names = data.names ?? {};
    const active = new Set<string>();
    const activeLabels = new Set<string>();
    const activeNameplates = new Set<string>();
    for (const node of [...data.graph.nodes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      active.add(node.id);
      let entry = this.nodeParts.get(node.id);
      if (entry === undefined) {
        // M6-V7（DoD）：以 CastleNode/DistrictNode 元件取代占位 Graphics＋drawNodeMarker。
        const part = node.kind === 'castle' ? createCastleNode() : createDistrictNode();
        const scene = this.presentPoint(node.pos);
        part.container.position.set(scene.x, scene.y);
        this.layers.nodeMarkers.addChild(part.container);
        if (node.kind === 'castle') {
          const castle = part as CastleNodePart;
          castle.depthBody.label = `castle:${node.id}`;
          castle.attachDepthLayers(this.layers.actorBodies, this.layers.effects);
          this.actorDepthSignature = null;
        }
        entry = { part, kind: node.kind };
        this.nodeParts.set(node.id, entry);
      }
      // 首繪（比照現行 drawNodeMarker 於 build 一次；供 init 無後續 updateView 時仍能首幀繪出）；不計數
      //（計數在首次 updateView 之簽章 diff，§13-B3）。
      entry.part.update(this.buildNodeProps(node.id, entry.kind) as never);
      if (entry.kind === 'castle') (entry.part as CastleNodePart).setBodyArt(this.castleBodyArt);
      entry.part.setLodStage(this.lodStage);
      const scene = this.presentPoint(node.pos);
      this.nodeCull.upsert(node.id, scene.x, scene.y);

      const text = names[node.id];
      if (text !== undefined) {
        if (node.kind === 'castle') {
          // M6-V9b（DD-A0）：城名移出 labelParts——改建和紙綬帶名牌 part（nameplates 圖層、
          // 名牌專屬簽章 diff 驅動更新；建/毀計入 rebuildCounts.nameplates，與 labels 分離）。
          activeNameplates.add(node.id);
          let np = this.nameplateParts.get(node.id);
          if (np === undefined) {
            const part = createCastleNameplate();
            this.layers.nameplates.addChild(part.container);
            np = {
              part,
              pos: this.presentPoint(node.pos),
              tier: 'branch',
              warning: 'none',
              isPlayer: false,
              lodVisible: false,
              cullVisible: false,
              declutterHidden: false,
            };
            this.nameplateParts.set(node.id, np);
          }
          np.pos = this.presentPoint(node.pos);
          // 首繪（比照節點；供 init 無後續 updateView 時仍能首幀繪出）＋LOD＋目標高亮同步。
          const props = this.buildNameplateProps(node.id);
          np.tier = props.tier;
          np.warning = props.warning;
          np.isPlayer = props.isPlayer;
          np.part.update(props);
          np.part.setLodStage(this.lodStage);
          np.part.setTargetHighlight(this.marchTargetId === node.id);
          // §2.9：新建即套反向縮放（camera 未建立時＝1，由 NaN 哨兵於首次 applyLodAndCulling 補正）。
          np.part.container.scale.set(1 / (this.camera?.getState().scale ?? 1));
          this.nameplateCull.upsert(node.id, scene.x, scene.y);
          this.rebuildCounts.nameplates += 1;
        } else {
          activeLabels.add(node.id);
          // M6-V9（§2.3/§2.4）：郡標籤維持 V9 labelParts 樣式不動（M6-V9b：城名已移出）。
          this.upsertLabel(node.id, text, node.kind, LABEL_STYLE.district, node.pos);
          this.labelCull.upsert(node.id, scene.x, scene.y);
          this.rebuildCounts.labels += 1;
        }
      }
    }
    // M6-V6（§5.1）：道路名標籤（`edge.name`）於多段線弧長中點、沿真法線偏上位移建 BitmapText
    // （near-only，`fill: ink900` 避免白字落暖底不可讀）。排序統一為預設 `.sort()` on keys（決定論）。
    for (const edgeId of [...data.graph.edges.keys()].sort()) {
      const edge = data.graph.edges.get(edgeId)!;
      if (edge.name === undefined) continue;
      const sourcePoints = edgeVisualPolyline(edge, data.graph);
      if (sourcePoints === null) continue;
      const pts = projectPolyline(sourcePoints, this.projectScenePoint).points;
      const mid = polylineMidpoint(pts);
      if (mid === null) continue;
      let nx = -Math.sin(mid.angle);
      let ny = Math.cos(mid.angle); // 真法線（⊥ 段方向）
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      } // 令 ny<0（世界 y 向下，偏上避 casing）
      // 道路名沿法線偏移為 world unit（near-only、scale≈1.25，觀感穩定；M6-V9 §2.4 road.offset）。
      const roadOffset = LABEL_STYLE.road.offset;
      const lx = mid.x + nx * roadOffset;
      const ly = mid.y + ny * roadOffset;
      const id = `road:${edgeId}`;
      activeLabels.add(id);
      this.upsertLabel(
        id,
        edge.name,
        'road',
        LABEL_STYLE.road,
        this.canonicalPoint({ x: lx, y: ly }),
      );
      this.labelParts.get(id)!.roadLine = {
        normal: { x: nx, y: ny },
        grade: edge.grade,
        segments: prepareRoadLabelSegments(pts),
      };
      this.labelCull.upsert(id, lx, ly);
      this.rebuildCounts.labels += 1;
    }
    for (const [provinceId, pos] of Object.entries(data.provinceLabelPos ?? {})) {
      const text = names[provinceId];
      if (text === undefined) continue;
      const id = `province:${provinceId}`;
      activeLabels.add(id);
      this.upsertLabel(id, text, 'province', LABEL_STYLE.province, pos);
      const scene = this.presentPoint(pos);
      this.labelCull.upsert(id, scene.x, scene.y);
      this.rebuildCounts.labels += 1;
    }
    for (const [id, entry] of this.nodeParts) {
      if (active.has(id)) continue;
      this.layers.nodeMarkers.removeChild(entry.part.container);
      entry.part.destroy();
      this.nodeParts.delete(id);
      this.nodeCull.remove(id);
    }
    for (const [id, part] of this.labelParts) {
      if (activeLabels.has(id)) continue;
      this.layers.labels.removeChild(part.container);
      part.container.destroy({ children: true });
      this.labelParts.delete(id);
      this.labelCull.remove(id);
    }
    // M6-V9b：名牌 stale 清理（graph swap 後不在新圖之城；毀亦計入 nameplates 計數，§2.9）。
    for (const [id, entry] of this.nameplateParts) {
      if (activeNameplates.has(id)) continue;
      this.layers.nameplates.removeChild(entry.part.container);
      entry.part.destroy();
      this.nameplateParts.delete(id);
      this.nameplateCull.remove(id);
      this.rebuildCounts.nameplates += 1;
    }
    // M6-V9（§2.1，採納評審 B M4）：NaN 哨兵——強制下一次 applyLodAndCulling 全量重設反向縮放
    //（新建 container 已即時套用當前 scale，此為雙保險，涵蓋 init 期 camera 尚未建立之路徑）。
    this.lastLabelScale = Number.NaN;
    this.lastNameplateScale = Number.NaN; // M6-V9b §2.9：名牌平行哨兵（同步觸發）
    this.castleRibbonLayoutSignature = null;
    this.castleRibbonOriginalSignature = null;
    this.castleRibbonContextSignature = null;
    this.castleRibbonPlacements.clear();
    this.castleRibbonSeedOffsets.clear();
    this.castleRibbonSeedPlates = [];
    // M6-V7（CD4）：城下聚落——每次 setMapData 重建（靜態一次建、只繞本城、close LOD 顯隱、不動計數）。
    if (this.settlements) {
      this.layers.settlements.removeChild(this.settlements.container);
      this.settlements.destroy();
      this.settlements = null;
    }
    this.settlementObstacles = [];
    // Actual display water is reconstructed next; never reuse prior-map footprints here.
    this.settlementModelBounds = Object.freeze([]);
    this.settlementCrests = [];
  }

  /**
   * 建立/更新單一標籤（M6-V9 §2.1/§2.2）：per-label `Container` 掛世界座標，`BitmapText` 子元素
   * anchor(0.5,0)（頂-中，反向縮放繞錨點對稱）、position=(0, +gap)（螢幕 px）。新建當下即套
   * `1/camera.scale`（camera 未建立時＝1，由 NaN 哨兵於首次 applyLodAndCulling 補正）。
   * 只由 `buildStaticDataLayers` 呼叫（labels 靜態化不變）；計數（`rebuildCounts.labels` 以
   * label id 為單位）由呼叫端負責。
   */
  private upsertLabel(
    id: string,
    text: string,
    kind: LabelPart['kind'],
    spec: LabelStyleSpec,
    pos: { x: number; y: number },
  ): void {
    if (this.layers === null) return;
    let part = this.labelParts.get(id);
    if (part === undefined) {
      const container = new Container();
      container.label = `label:${kind}`;
      const bt = new BitmapText({ text, style: sharedLabelTextStyle(spec) });
      bindSharedLabelStyleLifecycle(bt);
      bt.anchor.set(0.5, 0);
      bt.position.set(0, spec.gap ?? 0);
      if (spec.alpha !== undefined) bt.alpha = spec.alpha;
      container.addChild(bt);
      const scale = this.camera?.getState().scale ?? 1;
      container.scale.set(1 / scale); // §2.1：新建即套反向縮放（採納評審 B M4）
      this.layers.labels.addChild(container);
      part = {
        container,
        text: bt,
        kind,
        pos: { x: pos.x, y: pos.y },
        canonicalPos: { ...pos },
        lodVisible: false,
        cullVisible: false,
        declutterHidden: false,
        baselineGap: spec.gap ?? 0,
      };
      this.labelParts.set(id, part);
    }
    part.text.text = text;
    part.baselineGap = spec.gap ?? 0;
    this.geographicLabelLayoutSignature = null;
    part.pos = this.presentPoint(pos);
    part.canonicalPos = { ...pos };
    part.container.position.set(part.pos.x, part.pos.y);
  }

  /**
   * M6-V7（§5.1）：由 `this.view`＋graph 導出單一節點之繪製 props（城 CastleNodeProps／郡
   * DistrictNodeProps）。`pos` 取**真實** `graph.nodes.get(id).pos`（非 {0,0}，B2）；城之 `tier`
   * 以 `view.castles[].tier` 為權威（`staticData.castleTier` 僅供 LOD/命中半徑，M2）。dirty diff 已
   * 限制只對變動節點呼叫本函式（非全節點/幀），`find` 成本可忽略。
   */
  private buildNodeProps(
    id: string,
    kind: 'castle' | 'district',
  ): CastleNodeProps | DistrictNodeProps {
    const node = this.staticData?.graph.nodes.get(id as never);
    const pos = this.presentPoint(node?.pos ?? { x: 0, y: 0 });
    if (kind === 'castle') {
      const c = this.view.castles.find((x) => x.id === id);
      const tier = c?.tier ?? this.staticData?.castleTier?.[id] ?? 'branch';
      const colorIndex = c ? (this.staticData?.clanColorIndex[c.ownerClanId] ?? 0) : 0;
      return {
        pos,
        tier,
        colorIndex,
        terrainKind: c?.terrainKind ?? 'plain',
        durability: c?.durability ?? 0,
        maxDurability: c?.maxDurability ?? 1,
        warning: c?.warning ?? 'none',
      };
    }
    const owner = this.view.districtOwner[id] ?? null;
    const colorIndex = owner === null ? null : (this.staticData?.clanColorIndex[owner] ?? 0);
    const d = this.view.districts?.find((x) => x.id === id);
    return {
      pos,
      colorIndex,
      hasSteward: d?.hasSteward ?? false,
      subjugationProgress: d?.subjugationProgress ?? null,
      ikkiActive: d?.ikkiActive ?? false,
    };
  }

  /**
   * M6-V9b（§2.9）：由 `this.view`＋staticData 導出單一城之名牌繪製 props。`soldiers`/`relation`/
   * `isPlayer` 取 UI 邊界注入之 `MapCastleView` 三欄（§1.3；view 未含該城時保守兜底 0/'neutral'/
   * false）；`name` 取 `staticData.names`（canvas 文字不進 i18n，§0）。dirty diff 已限制只對變動
   * 城呼叫本函式，`find` 成本可忽略（比照 `buildNodeProps`）。
   */
  private buildNameplateProps(id: string): CastleNameplateProps {
    const node = this.staticData?.graph.nodes.get(id as never);
    const pos = this.presentPoint(node?.pos ?? { x: 0, y: 0 });
    const c = this.view.castles.find((x) => x.id === id);
    return {
      pos,
      name: this.staticData?.names?.[id] ?? '',
      tier: c?.tier ?? this.staticData?.castleTier?.[id] ?? 'branch',
      colorIndex: c ? (this.staticData?.clanColorIndex[c.ownerClanId] ?? 0) : 0,
      relation: c?.relation ?? 'neutral',
      isPlayer: c?.isPlayer ?? false,
      warning: c?.warning ?? 'none',
      soldiers: c?.soldiers ?? 0,
    };
  }

  /**
   * Blocker 1 修正（§5.1）：`init()` 與 `setMapData`(initialized) 共用之地形/水系/領地重建路徑。
   * territory 與 terrain pack 無關（只需 graph＋outline＋clanColorIndex），故無 terrain 亦建。
   */
  private reconstructTerrainLayers(): void {
    this.dimensionalTerrain?.parent?.removeChild(this.dimensionalTerrain);
    this.dimensionalTerrain?.destroy({ children: true });
    this.dimensionalTerrain = null;
    const terrain = this.staticData?.terrain;
    this.buildWaterFeatures();
    this.buildSharedElevation();
    this.buildStaticDataLayers();
    if (
      this.layers &&
      terrain &&
      !this.sceneProjection &&
      ((terrain.mountains?.length ?? 0) > 0 || (terrain.forests?.length ?? 0) > 0)
    ) {
      this.dimensionalTerrain = createDimensionalTerrain(terrain);
      this.layers.terrainBase.addChild(this.dimensionalTerrain);
    }
    this.buildTerritoryLayer(); // grid＋sprite＋首幀著色（graph 存在即建）
    this.buildTownSettlements();
    this.loadTerrainTextures(); // async fire-and-forget，disposed 防護
  }

  private buildSharedElevation(): void {
    const terrain = this.staticData?.terrain;
    const previousProjection = this.sceneProjection;
    this.sceneProjection = null;
    this.terrainProjectionError = null;
    if (terrain?.groundArtAssetId && this.app?.renderer?.type !== RendererType.CANVAS) {
      const landPolygons = this.displayCoast.polygons.map((polygon) => {
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < polygon.points.length; i += 2)
          points.push({ x: polygon.points[i]!, y: polygon.points[i + 1]! });
        return points;
      });
      const protectedCells = createTerrainProtectedCells({
        worldSize: WORLD_SIZE,
        cells: 128,
        landPolygons,
        waterGeometry: {
          lakes: this.waterFeatures?.getLakeGeometry() ?? [],
          rivers: this.waterFeatures?.getRiverMaterialDiagnostics().rivers ?? [],
        },
        onDiagnostics: (diagnostics) => {
          if (diagnostics.status !== 'ok')
            this.terrainProjectionError = `protected terrain cells: ${diagnostics.status}`;
        },
      });
      this.sceneProjection = createSampledTerrainElevation(
        createTerrainTopography(terrain.mountains ?? [], landPolygons),
        { worldSize: WORLD_SIZE, cells: 128, protectedCells },
      );
    }
    // Each field owns a new callback lease. Cached routes never retain a previous field.
    if (previousProjection === null && this.sceneProjection === null) return;
    this.projectScenePoint = this.sceneProjection?.project ?? ((point) => ({ ...point }));
    this.camera?.setPresentationProjection(this.sceneProjection);
    if (this.layers) {
      this.roadHighlight?.container.parent?.removeChild(this.roadHighlight.container);
      this.roadHighlight?.destroy();
      this.pathPreview?.container.parent?.removeChild(this.pathPreview.container);
      this.pathPreview?.container.destroy({ children: true, context: true });
      this.roadHighlight = createRoadHighlight(this.projectScenePoint);
      this.pathPreview = createPathPreview(this.projectScenePoint);
      this.layers.selectionAndPath.addChild(this.roadHighlight.container);
      this.layers.selectionAndPath.addChild(this.pathPreview.container);
    }
  }

  /** Static ground architecture uses the same emitted water and display coastline as the map. */
  private buildTownSettlements(): void {
    this.settlementModelBounds = Object.freeze([]);
    this.settlementObstacles = [];
    this.settlementCrests = [];
    this.settlements?.container.parent?.removeChild(this.settlements.container);
    this.settlements?.destroy();
    this.settlements = null;
    const data = this.staticData,
      layers = this.layers;
    if (!data || !layers || !this.displayCoast.polygons.length) return;
    const footprints = collectCoastFootprints(data.graph, []);
    if (!footprints) return;
    // Reserve all successful painted main/branch variants, not a guessed current texture.
    let castleRadius = 22;
    for (const tier of ['main', 'branch'] as const)
      for (const spec of Object.values(CASTLE_BODY_ART_BY_TIER[tier])) {
        const placement = castleBodyArtPlacement(
            spec,
            tier === 'main'
              ? CASTLE_NODE_GEOMETRY.paintedMainWidth
              : CASTLE_NODE_GEOMETRY.paintedBranchWidth,
          ),
          f = spec.contentBounds;
        for (const x of [f.x, f.x + f.width])
          for (const y of [f.y, f.y + f.height])
            castleRadius = Math.max(
              castleRadius,
              Math.hypot(placement.x + x * placement.scale, placement.y + y * placement.scale) + 2,
            );
      }
    const obstacles = footprints.map((p) =>
      p.id.startsWith('node:')
        ? {
            ...p,
            radius:
              data.graph.nodes.get(p.id.slice(5) as never)?.kind === 'castle'
                ? castleRadius
                : Math.max(
                    DISTRICT_NODE_GEOMETRY.subjugationRingRadius +
                      DISTRICT_NODE_GEOMETRY.subjugationRingWidth / 2,
                    DISTRICT_NODE_GEOMETRY.ikkiOffsetY + DISTRICT_NODE_GEOMETRY.ikkiTriangleSize,
                  ),
          }
        : p,
    );
    for (const river of this.waterFeatures?.getRiverMaterialDiagnostics().rivers ?? [])
      for (const s of river.displaySegments)
        obstacles.push({ id: `water:${river.id}`, a: s.a, b: s.b, radius: s.width / 2 });
    this.settlementObstacles = Object.freeze(obstacles.map((o) => Object.freeze({ ...o })));
    this.settlementCrests = Object.freeze(
      (data.terrain?.mountains ?? []).map((m) =>
        Object.freeze({
          id: m.id,
          mass: Object.freeze(m.mass.map((p) => Object.freeze({ ...p }))),
          ridges: Object.freeze(
            m.ridges.map((r) => Object.freeze(r.map((p) => Object.freeze({ ...p })))),
          ),
        }),
      ),
    );
    this.settlements = buildSettlements(
      data.graph,
      data.castleTier ?? {},
      {
        land: this.displayCoast,
        lakes: (this.waterFeatures?.getLakeGeometry() ?? []).map((l) => l.points),
        obstacles,
        crests: this.settlementCrests,
      },
      this.projectScenePoint,
    );
    this.settlementModelBounds = Object.freeze(
      this.settlements.getSceneGeometry().houses.flatMap((house) => {
        const points = [...house.roofs.flat(), ...house.walls.flat()];
        if (points.length === 0) return [];
        return [
          Object.freeze({
            minX: Math.min(...points.map((p) => p.x)),
            minY: Math.min(...points.map((p) => p.y)),
            maxX: Math.max(...points.map((p) => p.x)),
            maxY: Math.max(...points.map((p) => p.y)),
          }),
        ];
      }),
    );
    layers.settlements.addChild(this.settlements.container);
    this.settlements.setStage(this.lodStage);
  }

  /**
   * territory 圖層（M6-V5，VD4）：`TerritoryGrid`（柵格化 Voronoi）接 `BufferImageSource`＋
   * `Texture`＋`Sprite`（1024²→4096 世界，隱含 scale 4，`scaleMode:'linear'`）。**build 當下即以
   * `this.view.districtOwner` 首幀著色**（比照 `buildStaticDataLayers` 為 node 上色的既有語意），
   * 否則 fixture 之穩定 `viewState` 參考於 post-init 不再觸發 `updateView`，領地將永遠全透明
   * （Blocker 2）。首幀著色**不動** `rebuildCounts`、**不設** `territoryDirty`。
   */
  private buildTerritoryLayer(): void {
    this.analysisOverlay?.destroy();
    this.analysisOverlay = null;
    // 清舊（含 detach 以免 app.destroy 或後續重建雙重銷毀）。
    if (this.territoryProjectedOverlay) {
      this.territoryProjectedOverlay.destroy();
      this.territoryProjectedOverlay = null;
    } else if (this.territorySprite) {
      this.layers?.territory.removeChild(this.territorySprite);
      this.territorySprite.destroy({ texture: false });
    }
    this.territoryTexture?.destroy(true);
    this.territorySource?.destroy();
    this.territorySprite = null;
    this.territoryTexture = null;
    this.territorySource = null;
    this.territoryGrid = null;
    const data = this.staticData;
    if (this.layers === null || data === null) return;
    this.territoryGrid = buildTerritoryGrid(data.graph, this.displayCoast);
    this.territorySource = new BufferImageSource({
      resource: this.territoryGrid.imageData.data,
      width: this.territoryGrid.size,
      height: this.territoryGrid.size,
      scaleMode: 'linear',
      alphaMode: 'premultiply-alpha-on-upload',
      label: 'territory',
    });
    this.territoryTexture = new Texture({ source: this.territorySource });
    if (this.sceneProjection) {
      this.territoryProjectedOverlay = createProjectedTerrainOverlay(
        this.territoryTexture,
        this.sceneProjection,
      );
      this.territorySprite = this.territoryProjectedOverlay.mesh;
    } else {
      this.territorySprite = createTerrainSprite(this.territoryTexture);
    }
    this.territorySprite.alpha = MAPVIEW.territoryAlpha;
    this.layers.territory.addChild(this.territorySprite);
    // Blocker 2 修正：build 當下即以 this.view 首幀著色（不設 territoryDirty、不動 rebuildCounts）。
    recolorTerritory(this.territoryGrid, this.view.districtOwner, data.clanColorIndex);
    this.territorySource.update();
    this.analysisOverlay = createAnalysisOverlay(
      data,
      this.territoryGrid,
      this.sceneProjection ?? undefined,
    );
    this.layers.analysisOverlay.addChild(this.analysisOverlay.container);
    if (this.view.analysisMode === 'faction')
      this.layers.labels.addChild(this.analysisOverlay.annotations);
    this.analysisOverlay.update(this.view, this.view.analysisMode, this.analysisOpacity);
  }

  /**
   * waterFeatures 圖層（M6-V5）：河川（widthClass 線寬＋taper）／湖泊向量。無 terrain pack 則空
   * （territory 與 terrain 無關，仍照常）。init 一次建立幾何，LOD 只切 `visible`（`setStage`）。
   */
  private buildWaterFeatures(): void {
    if (this.waterFeatures) {
      this.layers?.waterFeatures.removeChild(this.waterFeatures.container);
      this.waterFeatures.destroy();
      this.waterFeatures = null;
    }
    const t = this.staticData?.terrain;
    if (this.layers === null || t === undefined || this.staticData === null) return;
    this.waterFeatures = createWaterFeatures(
      t.rivers,
      t.lakes,
      collectRiverBridgeFootprints(this.staticData.graph),
      collectRiverDisplayConstraints(this.staticData.graph, this.displayCoast),
    );
    this.layers.waterFeatures.addChild(this.waterFeatures.container);
    this.waterFeatures.setStage(this.lodStage);
  }

  /**
   * Independently lazy-load the original main/branch castle bodies. Map generation,
   * data and layer identity prevent late attachment; each unavailable type keeps
   * its vector fallback. Castle nodes detach shared sprites before loader disposal.
   */
  private loadCastleBodyArt(): void {
    const generation = ++this.castleArtGeneration;
    const data = this.staticData;
    const layers = this.layers;
    const loader = this.castleArtLoader;
    this.castleBodyArt = {};
    for (const entry of this.nodeParts.values()) {
      if (entry.kind === 'castle') (entry.part as CastleNodePart).setBodyArt({});
    }
    if (
      !data ||
      !layers ||
      !loader ||
      ![...data.graph.nodes.values()].some((node) => node.kind === 'castle')
    ) {
      this.castleArtPending = false;
      return;
    }
    this.castleArtPending = true;
    const entries = (['main', 'branch'] as const).flatMap((tier) =>
      (['plain', 'mountain'] as const).flatMap((kind) => {
        const spec = CASTLE_BODY_ART_BY_TIER[tier][kind];
        return spec ? [{ tier, kind, spec }] : [];
      }),
    );
    void Promise.allSettled(entries.map(({ spec }) => loader.acquire(spec.assetId)))
      .then((results) => {
        if (
          this.disposed ||
          this.staticData !== data ||
          this.layers !== layers ||
          generation !== this.castleArtGeneration
        )
          return;
        const art: Parameters<CastleNodePart['setBodyArt']>[0] = {};
        entries.forEach(({ tier, kind, spec }, index) => {
          const result = results[index];
          if (result?.status === 'fulfilled') {
            result.value.source.scaleMode = 'linear';
            const tierArt = art[tier] ?? (art[tier] = {});
            tierArt[kind] = { texture: result.value, spec };
          }
        });
        this.castleBodyArt = art;
        for (const entry of this.nodeParts.values()) {
          if (entry.kind === 'castle') (entry.part as CastleNodePart).setBodyArt(art);
        }
      })
      .finally(() => {
        if (generation === this.castleArtGeneration) this.castleArtPending = false;
      });
  }

  private resetArmyBodyArt(): void {
    ++this.armyArtGeneration;
    this.armyArtRequested = false;
    this.armyArtPending = false;
    this.armyBodyArt = {};
    for (const part of this.armyParts.values()) part.setBodyArt(this.armyBodyArt);
  }

  /** First real army admits four shared views once per map, not on empty-map first screen. */
  private loadArmyBodyArt(): void {
    if (this.armyArtRequested || this.view.armies.length === 0) return;
    const generation = this.armyArtGeneration;
    const data = this.staticData;
    const layers = this.layers;
    const loader = this.armyArtLoader;
    if (!data || !layers || !loader) {
      return;
    }
    this.armyArtRequested = true;
    const directions: ArmyFacing[] = ['east', 'west', 'north', 'south'];
    const entries = directions.flatMap((direction) => {
      const spec = ARMY_BODY_ART[direction];
      return spec ? [{ direction, spec }] : [];
    });
    this.armyArtPending = entries.length > 0;
    void Promise.allSettled(entries.map(({ spec }) => loader.acquire(spec.assetId)))
      .then((results) => {
        if (
          this.disposed ||
          this.staticData !== data ||
          this.layers !== layers ||
          generation !== this.armyArtGeneration
        )
          return;
        const art: ArmyBodyArt = {};
        entries.forEach(({ direction, spec }, index) => {
          const result = results[index];
          if (result?.status === 'fulfilled') {
            result.value.source.scaleMode = 'linear';
            art[direction] = { texture: result.value, spec };
          }
        });
        this.armyBodyArt = art;
        for (const part of this.armyParts.values()) part.setBodyArt(art);
        this.applyLodAndCulling();
      })
      .finally(() => {
        if (generation === this.armyArtGeneration) this.armyArtPending = false;
      });
  }

  private loadTerrainTextures(): void {
    const generation = ++this.terrainLoadGeneration;
    this.mountainRaster?.destroy();
    this.mountainRaster = null;
    this.forestRaster?.destroy();
    this.forestRaster = null;
    this.groundMaterial?.destroy();
    this.groundMaterial = null;
    this.elevatedSurface?.destroy();
    this.elevatedSurface = null;
    this.projectedCanopy?.destroy();
    this.projectedCanopy = null;
    this.foothillCanopy?.destroy();
    this.foothillCanopy = null;
    this.fieldMaterial?.destroy();
    this.fieldMaterial = null;
    // 清舊 relief/forest（detach＋destroy，共享 texture 不隨之銷毀）。
    for (const s of [this.reliefSprite, this.forestSprite]) {
      if (s) {
        s.parent?.removeChild(s);
        s.destroy({ texture: false });
      }
    }
    this.reliefSprite = null;
    this.forestSprite = null;
    this.destroyGroundSurface();
    const t = this.staticData?.terrain;
    if (this.coastSurface && this.layers) this.groundSurfaceContent();
    const loader = this.terrainLoader;
    const layers = this.layers;
    const waterFeatures = this.waterFeatures;
    const projection = this.sceneProjection;
    // Snapshot the exact emitted water instance before any asynchronous asset work.
    // This display-only contact never substitutes canonical river chords or relief data.
    const riverContacts = Object.freeze(
      (waterFeatures?.getRiverMaterialDiagnostics().rivers ?? [])
        .filter((river) => river.id === 'rv.tenryu')
        .flatMap((river) =>
          river.displaySegments.map((segment) =>
            Object.freeze({
              id: river.id,
              a: Object.freeze({ ...segment.a }),
              b: Object.freeze({ ...segment.b }),
              radius: segment.width / 2,
            }),
          ),
        ),
    );
    if (this.layers === null || t === undefined || loader === null) {
      this.terrainTexturesPending = false;
      return;
    }
    this.terrainTexturesPending = true;
    const mountainAssetIds = [
      ...new Set([
        ...mountainRasterLayout(t).flatMap((patch) =>
          [patch.assetId, patch.axisAssetId].filter((id): id is string => id !== undefined),
        ),
        ...(t.mountainArtAssetId ? [t.mountainArtAssetId] : []),
      ]),
    ];
    void (async () => {
      try {
        const [
          reliefResult,
          forestResult,
          artResult,
          canopyResult,
          groundResult,
          materialResult,
          fieldResult,
        ] = await Promise.allSettled([
          loader.acquire(t.reliefAssetId),
          loader.acquire(t.forestAssetId),
          Promise.allSettled(mountainAssetIds.map((id) => loader.acquire(id))),
          t.forestArtAssetId ? loader.acquire(t.forestArtAssetId) : Promise.resolve(null),
          t.groundArtAssetId ? loader.acquire(t.groundArtAssetId) : Promise.resolve(null),
          t.mountainMaterialAssetId
            ? loader.acquire(t.mountainMaterialAssetId)
            : Promise.resolve(null),
          t.fieldMaterialAssetId && this.app?.renderer?.type !== RendererType.CANVAS
            ? loader.acquire(t.fieldMaterialAssetId)
            : Promise.resolve(null),
        ]);
        if (
          this.disposed ||
          this.layers !== layers ||
          layers === null ||
          this.staticData?.terrain !== t ||
          this.waterFeatures !== waterFeatures ||
          generation !== this.terrainLoadGeneration
        )
          return;
        if (projection && (groundResult.status !== 'fulfilled' || groundResult.value === null))
          throw new Error('Elevated terrain ground texture unavailable');
        if (groundResult.status === 'fulfilled' && groundResult.value !== null) {
          groundResult.value.source.scaleMode = 'linear';
          if (projection) {
            this.elevatedSurface = createTerrainElevatedSurface(groundResult.value, projection, {
              forests: (t.forests ?? []).map((forest) => forest.polygon),
            });
            this.groundSurfaceContent().addChild(this.elevatedSurface.mesh);
            if (canopyResult.status === 'fulfilled' && canopyResult.value !== null) {
              this.foothillCanopy = createTerrainFoothillCanopy(canopyResult.value, projection);
              this.groundSurfaceContent().addChild(this.foothillCanopy.mesh);
              this.projectedCanopy = createTerrainProjectedCanopy(
                canopyResult.value,
                t,
                projection,
              );
              this.groundSurfaceContent().addChild(this.projectedCanopy.container);
            }
            this.applyLodAndCulling();
            return;
          }
          this.groundMaterial = createTerrainGround(groundResult.value, this.displayCoast);
          this.groundSurfaceContent().addChild(this.groundMaterial.container);
        }
        if (fieldResult.status === 'fulfilled' && fieldResult.value !== null) {
          fieldResult.value.source.scaleMode = 'linear';
          this.fieldMaterial = createTerrainFieldMaterial(
            fieldResult.value,
            this.displayCoast,
            t,
            true,
          );
          this.applyCameraTransform();
          this.groundSurfaceContent().addChild(this.fieldMaterial.container);
        }
        if (reliefResult.status === 'fulfilled') {
          reliefResult.value.source.scaleMode = 'linear';
          this.reliefSprite = createTerrainSprite(reliefResult.value);
          this.reliefSprite.tint = TERRAIN_RELIEF.groundTint;
          this.reliefSprite.alpha = TERRAIN_RELIEF.bakedReliefAlpha;
          this.groundSurfaceContent().addChild(this.reliefSprite);
        }
        if (forestResult.status === 'fulfilled') {
          forestResult.value.source.scaleMode = 'linear';
          this.forestSprite = createTerrainSprite(forestResult.value);
          this.forestSprite.tint = TERRAIN_RELIEF.forestTint;
          this.groundSurfaceContent().addChild(this.forestSprite);
        }
        // Relief faces sit above baked ground, beneath territory/water/roads and all picking nodes.
        if (this.dimensionalTerrain) {
          this.dimensionalTerrain.parent?.removeChild(this.dimensionalTerrain);
          layers.terrainBase.addChild(this.dimensionalTerrain);
        }
        if (artResult.status === 'fulfilled') {
          const textures = new Map<string, Texture>();
          artResult.value.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              result.value.source.scaleMode = 'linear';
              textures.set(mountainAssetIds[index]!, result.value);
            }
          });
          const material = materialResult.status === 'fulfilled' ? materialResult.value : null;
          if (material) material.source.scaleMode = 'linear';
          if (material && mountainRasterLayout(t).length > 0) {
            // Let already-ready input tasks run before the static mountain mask batch.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (
              this.disposed ||
              this.layers !== layers ||
              layers === null ||
              this.staticData?.terrain !== t ||
              this.waterFeatures !== waterFeatures ||
              generation !== this.terrainLoadGeneration
            )
              return;
          }
          const raster = createMountainRasterVariants(
            textures,
            t,
            material ?? undefined,
            this.displayCoast.polygons.map((polygon) => Object.freeze([...polygon.points])),
            riverContacts,
          );
          if (raster.coveredIds.size > 0) {
            this.mountainRaster = raster;
            if (raster.materialLayer) this.groundSurfaceContent().addChild(raster.materialLayer);
          } else raster.destroy();
        }
        if (canopyResult.status === 'fulfilled' && canopyResult.value !== null) {
          canopyResult.value.source.scaleMode = 'linear';
          const woodland =
            this.app?.renderer?.type !== RendererType.CANVAS &&
            materialResult.status === 'fulfilled'
              ? materialResult.value
              : null;
          if (woodland && forestRasterLayout(t).length > 0) {
            // Let overdue input timers run before the new static forest mask work.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (
              this.disposed ||
              this.layers !== layers ||
              layers === null ||
              this.staticData?.terrain !== t ||
              this.waterFeatures !== waterFeatures ||
              generation !== this.terrainLoadGeneration
            )
              return;
          }
          this.forestRaster = createForestRaster(canopyResult.value, t, woodland ?? undefined);
          if (this.forestRaster.materialLayer)
            this.groundSurfaceContent().addChild(this.forestRaster.materialLayer);
        }
        if (this.mountainRaster || this.forestRaster) {
          this.dimensionalTerrain?.parent?.removeChild(this.dimensionalTerrain);
          this.dimensionalTerrain?.destroy({ children: true });
          this.dimensionalTerrain = createDimensionalTerrain(
            t,
            this.mountainRaster?.coveredIds ?? new Set(),
            this.forestRaster?.coveredIds ?? new Set(),
          );
          layers.terrainBase.addChild(this.dimensionalTerrain);
          if (this.forestRaster) layers.terrainBase.addChild(this.forestRaster.container);
          if (this.mountainRaster) layers.terrainBase.addChild(this.mountainRaster.container);
        }
        this.applyLodAndCulling(); // 依 stage 設 forest alpha
      } catch (error) {
        if (projection && generation === this.terrainLoadGeneration)
          this.terrainProjectionError = error instanceof Error ? error.message : String(error);
        /* 優雅退回：relief/forest 缺席，seaBackground fallback 底生效（VD5/VD6）。 */
      } finally {
        if (generation === this.terrainLoadGeneration) this.terrainTexturesPending = false;
      }
    })();
  }

  /**
   * nodeMarkers owner dirty-update（M6-V4 §3.3.3）：只重畫 owner 相對前一次 view 真的變了的
   * node。`day`／`selection`／`analysisMode`／`battles`／`durability`/`siegeMode`/`warning`/
   * `terrainKind` 等其餘欄位變化一律不觸發（§3.3.5 dirty 判定條件表）。V4 `territory` 圖層容器仍空
   * （V5 掛 `TerritoryGrid`），`rebuildCounts.territory` 僅作為 dirty 訊號雛形計數（§3.3.3 觀測口徑）。
   */
  private applyOwnerDirty(view: MapViewState): void {
    // (1) owner 訊號（territory 用；語意完全不變，M6-V4/V5）。
    const nextOwner = buildOwnerByNode(view);
    const ownerDirty = diffOwnerByNode(this.prevOwnerByNode, nextOwner);
    if (ownerDirty.size > 0) {
      this.rebuildCounts.territory += 1;
      this.territoryDirty = true; // M6-V5：owner 翻轉 → 次幀 recolor（updateView 內至多一次）
    }
    this.prevOwnerByNode = nextOwner;
    // (2) 節點視覺簽章 diff（M6-V7 CD1）：owner/耐久/warning/terrainKind/tier（城）、owner/steward/
    // subj/ikki（郡）變動之節點才重繪；day 不入簽章（day-only tick 零重畫）。**計數＝簽章 diff 成員
    // 數**（每 dirty id 無條件 +1，比照現行 owner-diff 迴圈；不依賴元件 `update` 冪等短路回傳，§13-B3）。
    const nextSig = buildNodeSig(view);
    const sigDirty = diffNodeSig(this.prevNodeSig, nextSig);
    if (this.staticData !== null) {
      for (const id of sigDirty) {
        const entry = this.nodeParts.get(id);
        if (entry === undefined) continue;
        entry.part.update(this.buildNodeProps(id, entry.kind) as never);
        this.rebuildCounts.nodeMarkers += 1;
      }
    }
    this.prevNodeSig = nextSig;
    // (3) 名牌專屬簽章 diff（M6-V9b §2.9，DD-A0／評審 Blocker 1）：於節點 diff 之後跑**第二個
    // diff loop**——簽章含 soldiers/relation/isPlayer/name（node 簽章所無），故「只兵數變」的 tick
    // 只命中該城名牌、node 簽章不變（`rebuildCounts.nodeMarkers` 不增）。命中之城才呼叫冪等
    // `nameplate.update`；**不動 rebuildCounts**（`nameplates` 只計 buildStaticDataLayers 建/毀）。
    const nextNameplateSig = buildNameplateSig(view, this.staticData?.names ?? {});
    const nameplateDirty = diffNameplateSig(this.prevNameplateSig, nextNameplateSig);
    if (this.staticData !== null) {
      for (const id of nameplateDirty) {
        const entry = this.nameplateParts.get(id);
        if (entry === undefined) continue;
        const props = this.buildNameplateProps(id);
        entry.tier = props.tier;
        entry.warning = props.warning;
        entry.isPlayer = props.isPlayer;
        entry.part.update(props);
      }
    }
    this.prevNameplateSig = nextNameplateSig;
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
    this.registeredListenerCount += 1;
    stage.on('pointerdown', this.onPointerDown);
    this.registeredListenerCount += 1;
    stage.on('pointerup', this.onPointerUp);
    this.registeredListenerCount += 1;
    stage.on('pointerupoutside', this.onPointerUp);
    this.registeredListenerCount += 1;
    stage.on('pointertap', this.onPointerTap);
    this.registeredListenerCount += 1;
    stage.on('rightclick', this.onRightClick);
    this.registeredListenerCount += 1;
    app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.registeredListenerCount += 1;
    app.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.registeredListenerCount += 1;
    app.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.registeredListenerCount += 1;
    window.addEventListener('blur', this.onWindowBlur);
    this.registeredListenerCount += 1;
  }

  private emit(event: MapRendererEvent): void {
    const hover =
      event.type === 'nodeHover'
        ? event.id
        : event.type === 'hoverEnd' || event.type === 'armyHover'
          ? null
          : this.geographicHoveredNode;
    if (hover !== this.geographicHoveredNode) {
      this.geographicHoveredNode = hover;
      this.queueScreenLayouts();
    }
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
    this.fieldMaterial?.setViewport(
      t.x,
      t.y,
      t.scale,
      this.app.screen.width,
      this.app.screen.height,
    );
  }

  private hasCompleteForestCoverage(): boolean {
    const forests = this.staticData?.terrain?.forests;
    const covered = this.forestRaster?.coveredIds;
    return (
      covered !== undefined &&
      forests !== undefined &&
      forests.length > 0 &&
      forests.every((forest) => covered.has(forest.id))
    );
  }

  /**
   * Camera-driven LOD switches plus bucket culling for dynamic scene objects.
   *
   * M6-V5（VD3）：改用三級 LOD `lodStageWithHysteresis`（滾輪連續縮放防閃；截圖 preset 由
   * `setCameraPose` 先以 `lodStageForScale` 清狀態，決定論）。既有 roads/nodeMarkers/labels 消費者
   * 以 `nearish = stage !== 'far'`（等價舊 `lodModeForScale===near`，即 `scale>=0.5`）／
   * `detail = stage === 'near'`（等價舊 `shouldShowDetailLabels`，即 `scale>=1.0`）**逐項等價**取代，
   * 零行為變更；`mid`/`near` 細分只由地形/水系/領地新消費。
   */
  private applyLodAndCulling(): void {
    if (this.app === null || this.layers === null || this.camera === null) return;
    const camera = this.camera.getState();
    // M6-V8（V8D11／MINOR5）：先算 LOD 段；軍隊繪製段落後才 restage（不遞迴——syncArmyChips 不呼
    // applyLodAndCulling）。置於 army 可見性查詢／迴圈之前，使 restage 之 armyCull.upsert／
    // collapsedArmyIds 先於下方查詢生效。
    const prevStage = this.lodStage;
    const stage = lodStageWithHysteresis(camera.scale, this.lodStage);
    // M6-V9（§2.5 觸發 3）：lodStage 變（另 setCameraPose 預改 lodStage 之 preset 路徑必伴隨
    // scale 變，由 scaleChanged 觸發覆蓋，比照 V8D11 之 armyChipStage 手法不倚賴此旗標）。
    const stageChanged = stage !== prevStage;
    this.lodStage = stage;
    if (this.lodStage !== this.armyChipStage) this.syncArmyChips();
    const halfWidth = this.app.screen.width / (2 * camera.scale);
    const halfHeight = this.app.screen.height / (2 * camera.scale);
    const sceneCenter = this.presentPoint(camera);
    const rect = {
      left: sceneCenter.x - halfWidth,
      right: sceneCenter.x + halfWidth,
      top: sceneCenter.y - halfHeight,
      bottom: sceneCenter.y + halfHeight,
    };
    const visibleArmies = this.armyCull.query(rect);
    const visibleSieges = this.siegeCull.query(rect);
    const visibleNodes = this.nodeCull.query(rect);
    const visibleLabels = this.labelCull.query(rect);
    const faction = this.view.analysisMode === 'faction';
    this.analysisOverlay?.setScale(camera.scale);
    const armyViews = faction ? new Map(this.view.armies.map((army) => [army.id, army])) : null;
    for (const [id, part] of this.armyParts) {
      part.container.visible = visibleArmies.has(id) && !this.collapsedArmyIds.has(id);
      if (faction) {
        const army = armyViews?.get(id);
        part.container.visible &&= army !== undefined && this.forceKeepChip(army);
      }
      // M6-V8（V8D13）：far 反向放大（transform，不經 chip.update、不計 armyChips；比照主城 far ×1.4）。
      // armyCull.query 於 restage 後仍有效——純 stage 變更不改軍隊世界位置與 cull entry；未來若在
      // syncArmyChips 內重定位軍隊，須把可見性查詢移至其後。
      part.container.scale.set(stage === 'far' ? MAPVIEW.armyFarChipScale : 1);
      part.setPlateScale(
        MAPVIEW.armyPlateFontPixels /
          (part.getPlateTypography().fontSize * camera.scale * part.container.scale.x),
      );
      part.syncDepthBody();
    }
    for (const [id, part] of this.siegeParts) part.container.visible = visibleSieges.has(id);
    const detail = stage === 'near'; // 取代舊 shouldShowDetailLabels（scale>=labelScale）
    const labelStage = labelStageForDensity(stage, this.presentation.mapLabelDensity);
    const secondaryLabels = allowsSecondaryLabels(this.presentation.mapLabelDensity);
    for (const [id, entry] of this.nodeParts) {
      // M6-V9（§3.2/§3.3）：主城全段可見（far 剪影 ×1.4＝overview 政治歸屬錨點）；支城/郡僅
      // near（detail）——far/mid 隱，遠景降噪。far 本城剪影 ×1.4 由 setLodStage 施於 bodyGfx
      //（不放大 ring/warn），故此處不設 container.scale。耐久環/警戒徽記顯隱亦由 setLodStage 切。
      const isMain = entry.kind === 'castle' && this.staticData?.castleTier?.[id] === 'main';
      entry.part.container.visible = visibleNodes.has(id) && (isMain || (!faction && detail));
      entry.part.setLodStage(stage);
      if (entry.kind === 'castle') {
        const castle = entry.part as CastleNodePart;
        castle.setWarningScale(
          CASTLE_WARNING_PRESENTATION.pixels / (CASTLE_WARNING_PRESENTATION.width * camera.scale),
        );
        castle.syncDepthBody();
      }
    }
    this.sortActorBodies();
    // ── M6-V9 標籤：pixel-lock（§2.1）＋LOD 顯示表（§2.3）＋declutter（§2.5） ──
    // 反向縮放只在 camera.scale 變時遍歷（camera-dirty；NaN 哨兵見 lastLabelScale 註解）。
    // 遍歷全部標籤而非僅可見者：LOD 隱藏中的標籤若不同步，之後轉可見時 scale 已陳舊。
    const scaleChanged = camera.scale !== this.lastLabelScale;
    if (scaleChanged) {
      for (const part of this.labelParts.values()) part.container.scale.set(1 / camera.scale);
      this.lastLabelScale = camera.scale;
    }
    // M6-V9b（§2.9）：名牌 pixel-lock——僅 camera.scale 變時遍歷（~121 次，可忽略；camera-dirty，
    // 不動 rebuildCounts）。平行 lastNameplateScale＋NaN 哨兵，與 lastLabelScale 同步觸發。
    const nameplateScaleChanged = camera.scale !== this.lastNameplateScale;
    if (nameplateScaleChanged) {
      for (const e of this.nameplateParts.values()) {
        e.part.container.scale.set(1 / camera.scale);
      }
      this.lastNameplateScale = camera.scale;
    }
    // M6-V9b（§2.7）：名牌 LOD 顯隱表——far 全隱（overview 交給既有 far 主城剪影 ×1.4 ensign）、
    // mid 本城顯/支城隱、near 全顯；part.setLodStage 切子物件 visible（不重繪、不建毀）。
    const visibleNameplates = this.nameplateCull.query(rect);
    for (const [id, e] of this.nameplateParts) {
      e.part.setLodStage(labelStage);
      e.lodVisible =
        (labelStage === 'near' || (labelStage === 'mid' && e.tier === 'main')) &&
        (secondaryLabels || e.tier === 'main' || this.nameplateForceShow(id, e));
      e.cullVisible = visibleNameplates.has(id);
    }
    for (const [id, part] of this.labelParts) {
      const mainCastle = part.kind === 'castle' && this.staticData?.castleTier?.[id] === 'main';
      part.lodVisible =
        part.kind === 'province'
          ? stage === 'far'
          : part.kind === 'road'
            ? secondaryLabels && labelStage === 'near'
            : labelStage !== 'far' &&
              ((part.kind === 'castle' && mainCastle) ||
                (secondaryLabels && labelStage === 'near'));
      part.cullVisible = visibleLabels.has(id);
    }
    // declutter 觸發（§2.5，嚴禁每幀）：idle 下降沿／scale 變／lodStage 變；平移縮放進行中不跑。
    const idle =
      this.dragPointerId === null && !this.camera.isInertiaActive() && !this.camera.isAnimating();
    const idleSettled = idle && !this.lastCameraIdle;
    this.lastCameraIdle = idle;
    if (scaleChanged || nameplateScaleChanged || stageChanged || idleSettled) {
      this.runLabelDeclutter();
    }
    for (const part of this.labelParts.values()) {
      part.container.visible =
        !faction && part.cullVisible && part.lodVisible && !part.declutterHidden;
    }
    // M6-V9b（§2.8 破例）：選取之我方城／告急（critical）／出陣目標之名牌不受 declutter 隱藏。
    for (const [id, e] of this.nameplateParts) {
      const force = this.nameplateForceShow(id, e);
      e.part.container.visible =
        (!faction || e.tier === 'main') &&
        e.cullVisible &&
        e.lodVisible &&
        (!e.declutterHidden || force);
    }
    this.placeArmySignals();
    this.queueScreenLayouts();
    // M6-V6（V6D4）：roads 層恆顯（修正舊 `visible=nearish` 於 far 整層隱藏，違 04 §3.10.3）；
    // 由 RoadsLayer.setStage 切各 tier 能見度（arterial/sea 恆顯、minor/bridge mid 起、path near）
    // 並依 stage 倍率重描——stage 未變則內部早退（零重描，守 day-only tick dirty 契約）。
    this.layers.roads.visible = !faction;
    this.roadsLayer?.setStage(stage);
    this.interaction.setScale(camera.scale); // V6D8：命中測試 CSS-px 下限隨相機縮放同步
    this.layers.labels.visible = true;
    this.layers.settlements.visible = !faction && stage !== 'far';
    this.settlements?.setStage(stage);
    // M6-V5：地形/水系/領地依 stage 顯示（relief 恆顯；forest 恆顯、alpha 由 FOREST_ALPHA[stage]；
    // water 河依 class 切 visible；territory alpha 依 stage＋analysisMode）。
    if (this.reliefSprite) this.reliefSprite.visible = true;
    if (this.forestSprite) {
      this.forestSprite.visible = !this.hasCompleteForestCoverage();
      this.forestSprite.alpha = FOREST_ALPHA[stage];
    }
    this.waterFeatures?.setStage(stage);
    if (this.projectedCanopy) this.projectedCanopy.container.alpha = FOREST_ALPHA[stage];
    if (this.foothillCanopy) this.foothillCanopy.mesh.alpha = FOREST_ALPHA[stage];
    if (this.territorySprite) {
      const faction = this.view.analysisMode === 'faction';
      this.territorySprite.alpha = faction
        ? MAPVIEW.territoryAlphaFaction
        : stage === 'far'
          ? MAPVIEW.territoryAlphaFar
          : MAPVIEW.territoryAlpha;
    }
  }

  /** M6-V9b（§2.8）：名牌 declutter 破例判定——選取之我方城／告急（critical）／出陣目標恆顯。 */
  private nameplateForceShow(id: string, e: NameplateEntry): boolean {
    const selKey =
      this.view.selection !== null && this.view.selection.kind === 'node'
        ? this.view.selection.id
        : null;
    return e.warning === 'critical' || id === this.marchTargetId || (e.isPlayer && id === selKey);
  }

  /** Coalesce screen-space placement until render or observation. */
  private queueScreenLayouts(): void {
    if (!this.disposed) this.screenLayoutsPending = true;
  }

  /** Public observations settle synchronously; ordinary updates settle once before paint. */
  private flushScreenLayouts(): void {
    if (!this.screenLayoutsPending || this.disposed) return;
    this.screenLayoutsPending = false;
    try {
      this.placeCastleRibbons();
      this.placeArmyPlates();
      this.placeGeographicLabels();
    } catch (error) {
      this.screenLayoutsPending = true;
      throw error;
    }
  }

  /** Translation-invariant CSS geometry; drawing and interaction anchors stay unchanged. */
  private armyPlateInputs(): {
    scale: number;
    candidates: ArmyPlateCandidate[];
    castles: { id: string; rect: PlateRect }[];
    castleBodies: { id: string; rect: PlateRect }[];
    foregroundBodies: { id: string; kind: 'soldier' | 'signal'; rect: PlateRect }[];
  } | null {
    if (this.camera === null) return null;
    const scale = this.camera.getState().scale;
    const chipScale = scale * (this.lodStage === 'far' ? MAPVIEW.armyFarChipScale : 1);
    const candidates: ArmyPlateCandidate[] = [];
    for (const army of this.view.armies) {
      const part = this.armyParts.get(army.id);
      if (!part?.container.visible) continue;
      const bounds = part.getPlateBounds();
      if (bounds === null) continue;
      const urgent =
        army.foodDays < MAPVIEW.armySupplyLowDays ||
        army.status === 'engaged' ||
        army.status === 'sieging';
      candidates.push({
        id: army.id,
        anchor: {
          x: part.container.position.x * scale,
          y: part.container.position.y * scale,
        },
        priority: army.selected ? 0 : urgent ? 1 : this.aggregateArmyIds.has(army.id) ? 2 : 3,
        rect: {
          x: part.container.position.x * scale + bounds.x * chipScale,
          y: part.container.position.y * scale + bounds.y * chipScale,
          width: bounds.width * chipScale,
          height: bounds.height * chipScale,
        },
      });
    }
    const castles: { id: string; rect: PlateRect }[] = [];
    for (const [id, entry] of this.nameplateParts) {
      if (!entry.part.container.visible) continue;
      const { w, h } =
        entry.part.getOriginalPresentationGeometry?.().ribbon ?? entry.part.getRibbonSize();
      castles.push({
        id,
        rect: {
          x: entry.pos.x * scale - w / 2 + (this.castleRibbonPlacements.get(id)?.offset.x ?? 0),
          y:
            (entry.pos.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap) * scale +
            (this.castleRibbonPlacements.get(id)?.offset.y ?? 0),
          width: w,
          height: h,
        },
      });
    }
    const byId = (a: { id: string }, b: { id: string }): number =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    candidates.sort(byId);
    castles.sort(byId);
    const castleBodies = [...this.nodeParts.entries()]
      .flatMap(([id, entry]) => {
        if (entry.kind !== 'castle' || !entry.part.container.visible) return [];
        const body = (entry.part as CastleNodePart).getPresentationGeometry()?.body;
        if (!body) return [];
        const pos = entry.part.container.position;
        return [
          {
            id,
            rect: {
              x: (pos.x + body.x) * scale,
              y: (pos.y + body.y) * scale,
              width: body.width * scale,
              height: body.height * scale,
            },
          },
        ];
      })
      .sort(byId);
    const foregroundBodies: { id: string; kind: 'soldier' | 'signal'; rect: PlateRect }[] = [];
    for (const [id, part] of this.armyParts) {
      if (!part.container.visible || !this.layers?.armies.visible) continue;
      const chip = part.container;
      const add = (kind: 'soldier' | 'signal', bounds: PlateRect | null): void => {
        if (
          !bounds ||
          !Object.values(bounds).every(Number.isFinite) ||
          bounds.width <= 0 ||
          bounds.height <= 0
        )
          return;
        foregroundBodies.push({
          id,
          kind,
          rect: {
            x: (chip.position.x + bounds.x * chip.scale.x) * scale,
            y: (chip.position.y + bounds.y * chip.scale.y) * scale,
            width: bounds.width * chip.scale.x * scale,
            height: bounds.height * chip.scale.y * scale,
          },
        });
      };
      if (part.depthBody.visible && this.layers.actorBodies.visible)
        add('soldier', part.getSoldierBounds());
      add('signal', part.getPaintedProfile().signalBounds);
    }
    foregroundBodies.sort((a, b) => byId(a, b) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    return { scale, candidates, castles, castleBodies, foregroundBodies };
  }

  /** Baselines exclude previous offsets, so the ordered presentation pass cannot feed back. */
  private castleRibbonInputs(plates = this.armyPlateInputs(), originalPresentation = true) {
    if (!plates || !this.app || !this.camera) return null;
    const { scale } = plates;
    const candidates = [...this.nameplateParts.entries()].flatMap(([id, entry]) => {
      if (!entry.part.container.visible) return [];
      const paint = originalPresentation
        ? (entry.part.getOriginalPresentationGeometry?.().paint ?? entry.part.getPaintBounds())
        : entry.part.getPaintBounds();
      const anchor = { x: entry.pos.x * scale, y: entry.pos.y * scale };
      return [
        {
          id,
          anchor,
          baseline: {
            ...paint,
            x: anchor.x + paint.x,
            y: anchor.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap * scale + paint.y,
          },
          selected:
            this.view.selection?.kind === 'node' && this.view.selection.id === id && entry.isPlayer,
          critical: entry.warning === 'critical',
          target: this.marchTargetId === id,
        },
      ];
    });
    const obstacles: { id: string; kind: string; rect: PlateRect; hard: boolean }[] = [
      ...plates.foregroundBodies.map(({ id, kind, rect }) => ({ id, kind, rect, hard: true })),
      ...plates.candidates.map(({ id, rect }) => ({
        id,
        kind: 'armyPlateBaseline',
        rect,
        hard: false,
      })),
      ...plates.castleBodies.map(({ id, rect }) => ({ id, kind: 'castleBody', rect, hard: true })),
    ];
    for (const [id, entry] of this.nodeParts) {
      if (entry.kind !== 'castle' || !entry.part.container.visible || !this.layers?.effects.visible)
        continue;
      const part = entry.part as CastleNodePart,
        geometry = part.getPresentationGeometry();
      if (!geometry) continue;
      for (const [kind, visible, bounds] of [
        ['castleDurability', part.durabilityVisible, geometry.durability],
        ['castleWarning', part.warningVisible, geometry.warning],
      ] as const) {
        if (!visible || !bounds) continue;
        obstacles.push({
          id,
          kind,
          hard: true,
          rect: {
            x: (part.container.position.x + bounds.x) * scale,
            y: (part.container.position.y + bounds.y) * scale,
            width: bounds.width * scale,
            height: bounds.height * scale,
          },
        });
      }
    }
    const transform = this.camera.getWorldTransform(this.app.screen);
    const screenRect = (rect: PlateRect) => ({
      ...rect,
      x: rect.x - transform.x,
      y: rect.y - transform.y,
    });
    this.screenOcclusions.forEach((rect, i) =>
      obstacles.push({ id: `hud.${i}`, kind: 'hud', hard: true, rect: screenRect(rect) }),
    );
    const { width, height } = this.app.screen;
    for (const [id, rect] of [
      ['left', { x: -48, y: -48, width: 48, height: height + 96 }],
      ['right', { x: width, y: -48, width: 48, height: height + 96 }],
      ['top', { x: -48, y: -48, width: width + 96, height: 48 }],
      ['bottom', { x: -48, y: height, width: width + 96, height: 48 }],
    ] as const)
      obstacles.push({
        id: `canvas.${id}`,
        kind: 'canvasEdge',
        hard: true,
        rect: screenRect(rect),
      });
    candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    obstacles.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
    const content = [...this.nameplateParts.entries()].flatMap(([id, entry]) => {
      if (!entry.part.container.visible || typeof entry.part.getContentGeometry !== 'function')
        return [];
      const measured = originalPresentation
        ? (entry.part.getOriginalPresentationGeometry?.().content ??
          entry.part.getContentGeometry())
        : entry.part.getContentGeometry();
      if (!measured) return [];
      const previous = this.castleRibbonPlacements.get(id)?.offset ?? { x: 0, y: 0 };
      return [measured.name, measured.troops].map((rect) => ({
        ...rect,
        x: entry.pos.x * scale + rect.x - previous.x,
        y: (entry.pos.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap) * scale + rect.y - previous.y,
      }));
    });
    const townContent: PlateRect[] = [];
    if (this.settlements?.container.visible && this.layers?.settlements.visible) {
      const viewport = { x: -transform.x, y: -transform.y, width, height };
      for (const bounds of this.settlementModelBounds) {
        // Actual emitted raised model only: do not reserve a ground/shadow box
        // or move the world footprint to manufacture visibility.
        const x = bounds.minX * scale;
        const y = bounds.minY * scale;
        const rect = {
          x,
          y,
          width: bounds.maxX * scale - x,
          height: bounds.maxY * scale - y,
        };
        if (
          rect.x < viewport.x + viewport.width &&
          rect.x + rect.width > viewport.x &&
          rect.y < viewport.y + viewport.height &&
          rect.y + rect.height > viewport.y
        )
          townContent.push(rect);
      }
    }
    return {
      scale,
      candidates,
      obstacles,
      plateCandidates: plates.candidates,
      content,
      townContent,
    };
  }

  private placeCastleRibbons(): void {
    const plates = this.armyPlateInputs();
    const inputs = this.castleRibbonInputs(plates, true);
    if (!inputs || !plates) return;
    const compactIds = [...this.nameplateParts].flatMap(([id, entry]) =>
      this.view.analysisMode === 'none' &&
      entry.warning === 'none' &&
      !this.geographicNodeFocused(id) &&
      id !== this.marchPathPreview?.originNodeId &&
      id !== this.marchPathPreview?.targetNodeId &&
      typeof entry.part.setCompactPresentation === 'function' &&
      entry.part.container.visible
        ? [id]
        : [],
    );
    const signature = JSON.stringify(inputs);
    const contextSignature = JSON.stringify(compactIds);
    if (
      this.castleRibbonLayoutSignature !== null &&
      signature === this.castleRibbonOriginalSignature &&
      contextSignature === this.castleRibbonContextSignature
    )
      return;
    // Freeze this frame's resolved army slots before moving any ribbon. The
    // seed uses original ribbons, never a previous-frame plate/ribbon result.
    const originalRibbons = plates.castles.map(({ id, rect }) => ({
      ...rect,
      x: rect.x - (this.castleRibbonPlacements.get(id)?.offset.x ?? 0),
      y: rect.y - (this.castleRibbonPlacements.get(id)?.offset.y ?? 0),
    }));
    const options = this.armyPlateOptions();
    this.castleRibbonSeedOffsets = layoutArmyPlates(
      plates.candidates,
      originalRibbons,
      plates.castleBodies.map(({ rect }) => rect),
      plates.foregroundBodies.map(({ rect }) => rect),
      options,
    );
    if (options)
      this.castleRibbonSeedOffsets = refineArmyPlateSeedReadability(
        plates.candidates,
        this.castleRibbonSeedOffsets,
        [
          ...originalRibbons,
          ...plates.castleBodies.map(({ rect }) => rect),
          ...plates.foregroundBodies.map(({ rect }) => rect),
        ],
        inputs.content,
        options,
        inputs.townContent,
      );
    this.castleRibbonSeedPlates = plates.candidates.map(({ id, rect }) => ({
      id,
      kind: 'armyPlateSeed',
      hard: true,
      rect: {
        ...rect,
        x: rect.x + (this.castleRibbonSeedOffsets.get(id)?.x ?? 0),
        y: rect.y + (this.castleRibbonSeedOffsets.get(id)?.y ?? 0),
      },
    }));
    const obstacles = [
      ...inputs.obstacles.filter((o) => o.kind !== 'armyPlateBaseline'),
      ...this.castleRibbonSeedPlates,
    ];
    const candidates = inputs.candidates.map((candidate) => ({
      ...candidate,
      leaderObstacles: filterCastleRibbonLeaderObstacles(
        candidate.anchor,
        candidate.baseline,
        obstacles
          .filter((obstacle) => obstacle.hard && obstacle.id !== candidate.id)
          .map(({ rect }) => rect),
      ),
    }));
    const hard = obstacles.filter((obstacle) => obstacle.hard).map(({ rect }) => rect);
    const ordinary = obstacles
      .filter(
        (obstacle) =>
          !obstacle.hard ||
          obstacle.kind === 'soldier' ||
          obstacle.kind === 'signal' ||
          obstacle.kind === 'armyPlateSeed',
      )
      .map(({ rect }) => rect);
    this.castleRibbonLayoutLimited =
      candidates.length > 256 ||
      ordinary.length > 1024 ||
      hard.length > 1024 ||
      candidates.reduce((sum, candidate) => sum + candidate.leaderObstacles.length, 0) > 4096 ||
      [...hard, ...ordinary, ...candidates.map(({ baseline }) => baseline)].some(
        (rect) => rect.width > 4096 || rect.height > 4096,
      );
    let originalWork = 0;
    const originalPlacements = this.castleRibbonLayoutLimited
      ? new Map<string, CastleRibbonPlacement>()
      : this.geographicScorer.layoutCastleRibbons(candidates, ordinary, hard, {
          onWork: (work) => {
            originalWork = work;
          },
        });
    let admissionWork = originalWork;
    // Pre-debit all glyph/paint measurements and affine arithmetic. Exhaustion
    // restores every original full label; it never grants a second solve.
    const measurementCharge = (cost: number): boolean => {
      if (admissionWork + cost > 1_000_000) {
        admissionWork = 1_000_000;
        return false;
      }
      admissionWork += cost;
      return true;
    };
    const transform =
      compactIds.length && measurementCharge(4)
        ? this.camera!.getWorldTransform(this.app!.screen)
        : null;
    const viewport = this.app
      ? { x: 0, y: 0, width: this.app.screen.width, height: this.app.screen.height }
      : null;
    const compactBaselines = compactIds.flatMap((id) => {
      const entry = this.nameplateParts.get(id)!;
      const before = originalPlacements.get(id);
      if (!before || !transform || !viewport || !measurementCharge(64)) return [];
      entry.part.setCompactPresentation(true);
      const paint = entry.part.getPaintBounds();
      const fullName = entry.part.getOriginalPresentationGeometry(before.offset).content?.name;
      const compactName = entry.part.getContentGeometry(before.offset)?.name;
      if (!fullName || !compactName) return [];
      const screenName = (name: typeof fullName) => ({
        ...name,
        x: entry.pos.x * inputs.scale + name.x + transform.x,
        y:
          (entry.pos.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap) * inputs.scale +
          name.y +
          transform.y,
      });
      return [
        {
          id,
          nameArea: {
            original: screenName(fullName),
            compact: screenName(compactName),
            viewport,
            // Actual measured canvas-CSS leaves, also used by the original solve.
            occlusions: this.screenOcclusions,
          },
          baseline: {
            ...paint,
            x: entry.pos.x * inputs.scale + paint.x,
            y: (entry.pos.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap) * inputs.scale + paint.y,
          },
        },
      ];
    });
    const admission = this.castleRibbonLayoutLimited
      ? null
      : admitContainedCastleRibbons(
          candidates,
          originalPlacements,
          compactBaselines,
          ordinary,
          hard,
          admissionWork,
        );
    this.castleRibbonPlacements = admission?.placements ?? originalPlacements;
    if (admission?.budgetLimited) this.castleRibbonLayoutLimited = true;
    for (const [id, entry] of this.nameplateParts) {
      entry.part.setCompactPresentation?.(admission?.compactIds.has(id) ?? false);
      const placement = this.castleRibbonPlacements.get(id);
      const origin = {
        x: entry.pos.x * inputs.scale,
        y: (entry.pos.y + NAMEPLATE_GEOMETRY[entry.tier].worldGap) * inputs.scale,
      };
      const local = (point: { x: number; y: number }) => ({
        x: point.x - origin.x,
        y: point.y - origin.y,
      });
      entry.part.setPresentationOffset(
        placement?.offset ?? { x: 0, y: 0 },
        placement
          ? {
              start: local(placement.leader.start),
              end: local(placement.leader.end),
              visible: placement.leader.visible,
            }
          : { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, visible: false },
      );
    }
    this.castleRibbonOriginalSignature = signature;
    this.castleRibbonContextSignature = contextSignature;
    this.castleRibbonLayoutSignature = signature;
    this.castleRibbonLayoutRuns++;
  }

  private observeCastleRibbonLayout() {
    const inputs = this.castleRibbonInputs(undefined, false);
    const transform = this.camera?.getWorldTransform(this.app?.screen ?? { width: 0, height: 0 });
    const point = (p: { x: number; y: number }) => ({
      x: p.x + (transform?.x ?? 0),
      y: p.y + (transform?.y ?? 0),
    });
    const rect = (r: PlateRect) => ({ ...r, ...point(r) });
    return {
      runs: this.castleRibbonLayoutRuns,
      limited: this.castleRibbonLayoutLimited,
      ribbons: (inputs?.candidates ?? []).map((candidate) => {
        const placement = this.castleRibbonPlacements.get(candidate.id);
        return {
          id: candidate.id,
          baseline: rect(candidate.baseline),
          rect: rect(placement?.rect ?? candidate.baseline),
          offset: placement?.offset ?? { x: 0, y: 0 },
          anchor: point(candidate.anchor),
          leader: placement
            ? {
                start: point(placement.leader.start),
                end: point(placement.leader.end),
                visible: placement.leader.visible,
              }
            : { start: point(candidate.anchor), end: point(candidate.anchor), visible: false },
          unresolved: placement?.unresolved ?? null,
          budgetLimited: placement?.budgetLimited ?? this.castleRibbonLayoutLimited,
        };
      }),
      obstacles: [
        ...(inputs?.obstacles ?? []).filter((o) => o.kind !== 'armyPlateBaseline'),
        ...this.castleRibbonSeedPlates,
      ].map((o) => ({ ...o, rect: rect(o.rect) })),
    };
  }

  /** Banner offsets precede plates, so mandatory text reserves actual placed banner geometry. */
  private placeArmySignals(): void {
    const plateInputs = this.armyPlateInputs();
    if (!plateInputs || !this.layers) return;
    const candidates: ArmySignalCandidate[] = [];
    for (const army of this.view.armies) {
      const part = this.armyParts.get(army.id);
      if (!part?.container.visible || !this.layers.armies.visible) continue;
      const profile = part.getPaintedProfile();
      const bounds = profile.signalBaselineBounds;
      if (!profile.painted || !bounds || bounds.width <= 0 || bounds.height <= 0) continue;
      const chip = part.container;
      const scale = plateInputs.scale;
      candidates.push({
        id: army.id,
        priority: army.selected
          ? 0
          : army.foodDays < MAPVIEW.armySupplyLowDays ||
              army.status === 'engaged' ||
              army.status === 'sieging'
            ? 1
            : 2,
        rect: {
          x: (chip.position.x + bounds.x * chip.scale.x) * scale,
          y: (chip.position.y + bounds.y * chip.scale.y) * scale,
          width: bounds.width * chip.scale.x * scale,
          height: bounds.height * chip.scale.y * scale,
        },
      });
    }
    candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const obstacles = [
      ...plateInputs.castleBodies.map(({ rect }) => rect),
      // Signals reserve baseline ribbons. They precede ribbon displacement;
      // feeding the previous ribbon result back would create a placement loop.
      ...plateInputs.castles.map(({ id, rect }) => ({
        ...rect,
        x: rect.x - (this.castleRibbonPlacements.get(id)?.offset.x ?? 0),
        y: rect.y - (this.castleRibbonPlacements.get(id)?.offset.y ?? 0),
      })),
      ...plateInputs.foregroundBodies
        .filter(({ kind }) => kind === 'soldier')
        .map(({ rect }) => rect),
    ];
    const signature = JSON.stringify({ scale: plateInputs.scale, candidates, obstacles });
    if (signature === this.armySignalLayoutSignature) return;
    // Excess presentation inputs keep every banner at its baseline, without
    // throwing from a frame or a late-art promise, or dropping visible actors.
    const offsets =
      candidates.length > ARMY_SIGNAL_LAYOUT.candidates ||
      obstacles.length > ARMY_SIGNAL_LAYOUT.obstacles
        ? new Map<string, { x: number; y: number }>()
        : layoutArmySignals(candidates, obstacles);
    this.armySignalLayoutRuns += 1;
    for (const [id, part] of this.armyParts) {
      const offset = offsets.get(id) ?? { x: 0, y: 0 };
      part.setSignalOffset({
        x: offset.x / (plateInputs.scale * part.container.scale.x),
        y: offset.y / (plateInputs.scale * part.container.scale.y),
      });
    }
    this.armySignalLayoutSignature = signature;
  }

  private armyPlateOptions() {
    const transform = this.camera?.getWorldTransform(this.app?.screen ?? { width: 0, height: 0 });
    // Measured HUD rectangles live in canvas CSS coordinates, unlike the scaled-world inputs.
    // Without a measured surface retain the legacy translation-invariant placement contract.
    const options =
      this.app && this.screenOcclusions.length > 0
        ? {
            maxOffset: MAPVIEW.armyPlateMaxOffsetPixels,
            canvas: {
              x: -(transform?.x ?? 0),
              y: -(transform?.y ?? 0),
              width: this.app.screen.width,
              height: this.app.screen.height,
            },
            screenOcclusions: this.screenOcclusions.map((rect) => ({
              ...rect,
              x: rect.x - (transform?.x ?? 0),
              y: rect.y - (transform?.y ?? 0),
            })),
          }
        : undefined;
    return options;
  }

  /** Apply the independently resolved seed; ribbons protect these slots rather than reflowing them. */
  private placeArmyPlates(): void {
    const inputs = this.armyPlateInputs();
    if (inputs === null) return;
    const options = this.armyPlateOptions();
    const signature = JSON.stringify({ inputs, options });
    if (signature === this.armyPlateLayoutSignature) return;
    this.armyPlateLayoutSignature = signature;
    this.armyPlateOffsets = new Map(this.castleRibbonSeedOffsets);
    this.armyPlateLayoutRuns += 1;
    const chipScale = inputs.scale * (this.lodStage === 'far' ? MAPVIEW.armyFarChipScale : 1);
    for (const [id, part] of this.armyParts) {
      const offset = this.armyPlateOffsets.get(id) ?? { x: 0, y: 0 };
      part.setPlateOffset({ x: offset.x / chipScale, y: offset.y / chipScale });
    }
  }

  /** Diagnostic rectangles do not substitute for native glyph/pixel review. */
  private observeArmyPlateLayout() {
    const inputs = this.armyPlateInputs();
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    });
    const screenRect = (rect: PlateRect): PlateRect => ({
      ...rect,
      x: rect.x + (transform?.x ?? 0),
      y: rect.y + (transform?.y ?? 0),
    });
    return {
      runs: this.armyPlateLayoutRuns,
      plates: (inputs?.candidates ?? []).map(({ id, rect }) => {
        const offset = this.armyPlateOffsets.get(id) ?? { x: 0, y: 0 };
        const part = this.armyParts.get(id)!;
        const typography = part.getPlateTypography();
        const leader = part.getPlateLeader();
        const leaderPoint = (point: { x: number; y: number }) => ({
          x:
            (part.container.position.x + point.x * part.container.scale.x) * (inputs?.scale ?? 1) +
            (transform?.x ?? 0),
          y:
            (part.container.position.y + point.y * part.container.scale.y) * (inputs?.scale ?? 1) +
            (transform?.y ?? 0),
        });
        return {
          id,
          selected: this.view.armies.find((army) => army.id === id)?.selected ?? false,
          collapsed: this.aggregateArmyIds.has(id),
          fontSizeCss:
            typography.fontSize * typography.scale * part.container.scale.x * (inputs?.scale ?? 1),
          baseline: screenRect(rect),
          rect: screenRect({ ...rect, x: rect.x + offset.x, y: rect.y + offset.y }),
          offset: { ...offset },
          leader: {
            start: leaderPoint(leader.start),
            end: leaderPoint(leader.end),
            visible: leader.visible,
          },
          anchor: {
            x: part.container.position.x * (inputs?.scale ?? 1) + (transform?.x ?? 0),
            y: part.container.position.y * (inputs?.scale ?? 1) + (transform?.y ?? 0),
          },
        };
      }),
      castles: (inputs?.castles ?? []).map(({ id, rect }) => {
        const entry = this.nameplateParts.get(id)!;
        const content = entry.part.getContentGeometry();
        const contentRect = (local: PlateRect): PlateRect =>
          screenRect({
            ...local,
            x: entry.part.container.position.x * (inputs?.scale ?? 1) + local.x,
            y: entry.part.container.position.y * (inputs?.scale ?? 1) + local.y,
          });
        return {
          id,
          rect: screenRect(rect),
          content: content && {
            seal: contentRect(content.seal),
            name: contentRect(content.name),
            troops: contentRect(content.troops),
          },
        };
      }),
      castleBodies: (inputs?.castleBodies ?? []).map(({ id, rect }) => ({
        id,
        rect: screenRect(rect),
      })),
      foregroundBodies: (inputs?.foregroundBodies ?? []).map(({ id, kind, rect }) => ({
        id,
        kind,
        rect: screenRect(rect),
      })),
    };
  }

  /** Interaction/alert names remain available even if ordinary secondary names lose priority. */
  private forceGeographicLabel(id: string): boolean {
    if (this.geographicNodeFocused(id)) return true;
    if (this.geographicAlertSource !== this.view.districts) {
      this.geographicAlertSource = this.view.districts;
      this.geographicAlertIds.clear();
      for (const district of this.view.districts ?? [])
        if (district.ikkiActive || (district.subjugationProgress ?? null) !== null)
          this.geographicAlertIds.add(district.id);
    }
    if (this.geographicAlertIds.has(id)) return true;
    if (!id.startsWith('road:')) return false;
    const edge = this.staticData?.graph.edges.get(id.slice(5) as never);
    return (
      edge !== undefined &&
      (this.geographicNodeFocused(edge.a) || this.geographicNodeFocused(edge.b))
    );
  }

  private geographicNodeFocused(id: string): boolean {
    return (
      (this.view.selection?.kind === 'node' && this.view.selection.id === id) ||
      id === this.geographicHoveredNode ||
      id === this.marchTargetId
    );
  }

  private geographicLabelInputs() {
    if (this.camera === null) return null;
    const scale = this.camera.getState().scale;
    const candidates: GeographicLabelCandidate[] = [];
    for (const [id, part] of this.labelParts) {
      // Ignore our previous priority result: otherwise a suppressed label can never recover.
      const forced = this.forceGeographicLabel(id);
      if (
        this.view.analysisMode === 'faction' ||
        part.kind === 'castle' ||
        !part.cullVisible ||
        !(part.lodVisible || (forced && this.lodStage === 'near')) ||
        (part.declutterHidden && !forced)
      )
        continue;
      // BitmapText local bounds include its anchor and stroke. Minimal CPU mocks
      // have no measured bounds and are deliberately not native geometry evidence.
      if (typeof part.text.getLocalBounds !== 'function') continue;
      const bounds = part.text.getLocalBounds();
      const line = part.roadLine;
      const halfWidth = line
        ? (ROAD_CASING_WIDTH[line.grade] * ROAD_STAGE_WIDTH_MULT[this.lodStage] * scale) / 2
        : 0;
      const shift = line
        ? roadLabelBaselineOffset(bounds, line.normal, LABEL_STYLE.road.offset * scale, halfWidth)
        : { x: 0, y: 0 };
      part.baselineShift = shift;
      const minimum = line
        ? Math.min(line.normal.x * bounds.x, line.normal.x * (bounds.x + bounds.width)) +
          Math.min(line.normal.y * bounds.y, line.normal.y * (bounds.y + bounds.height))
        : 0;
      const rect = {
        x: part.pos.x * scale + shift.x + bounds.x,
        y: part.pos.y * scale + part.baselineGap + shift.y + bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
      candidates.push({
        id,
        kind: part.kind,
        rect,
        ...(line
          ? { roadCapsules: nearbyRoadLabelCapsules(line.segments, rect, scale, halfWidth + 4) }
          : {}),
        ...(line
          ? {
              roadLine: {
                normal: line.normal,
                slack: Math.max(
                  0,
                  minimum +
                    LABEL_STYLE.road.offset * scale +
                    shift.x * line.normal.x +
                    shift.y * line.normal.y -
                    halfWidth -
                    4,
                ),
              },
            }
          : {}),
      });
    }
    const obstacles: {
      id: string;
      kind:
        | 'armyBody'
        | 'armyPlate'
        | 'castle'
        | 'castleBody'
        | 'castleDurability'
        | 'castleWarning'
        | 'hud'
        | 'canvasEdge';
      rect: PlateRect;
    }[] = [];
    const chips = scale * (this.lodStage === 'far' ? MAPVIEW.armyFarChipScale : 1);
    for (const [id, part] of this.armyParts) {
      if (!part.container.visible) continue;
      const bounds = part.getBodyBounds();
      if (bounds === null || bounds.width <= 0 || bounds.height <= 0) continue;
      obstacles.push({
        id,
        kind: 'armyBody',
        rect: {
          x: part.container.position.x * scale + bounds.x * chips,
          y: part.container.position.y * scale + bounds.y * chips,
          width: bounds.width * chips,
          height: bounds.height * chips,
        },
      });
    }
    const plates = this.armyPlateInputs();
    for (const { id, rect } of plates?.candidates ?? []) {
      const offset = this.armyPlateOffsets.get(id) ?? { x: 0, y: 0 };
      obstacles.push({
        id,
        kind: 'armyPlate',
        rect: { ...rect, x: rect.x + offset.x, y: rect.y + offset.y },
      });
    }
    for (const { id, rect } of plates?.castles ?? []) obstacles.push({ id, kind: 'castle', rect });
    // Geographic text must not escape an army by covering a castle's ribbon,
    // independently visible model, durability bar or warning glyph.
    for (const [id, entry] of this.nodeParts) {
      if (entry.kind !== 'castle' || !entry.part.container.visible) continue;
      const part = entry.part as CastleNodePart;
      const geometry = part.getPresentationGeometry();
      if (!geometry) continue;
      const pos = part.container.position;
      const add = (
        kind: 'castleBody' | 'castleDurability' | 'castleWarning',
        bounds: PlateRect | null,
      ): void => {
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
        obstacles.push({
          id,
          kind,
          rect: {
            x: (pos.x + bounds.x) * scale,
            y: (pos.y + bounds.y) * scale,
            width: bounds.width * scale,
            height: bounds.height * scale,
          },
        });
      };
      if (this.layers?.actorBodies.visible && part.depthBody.visible)
        add('castleBody', geometry.body);
      if (this.layers?.effects.visible) {
        if (part.durabilityVisible) add('castleDurability', geometry.durability);
        if (part.warningVisible) add('castleWarning', geometry.warning);
      }
    }
    if (this.screenOcclusions.length > 0 && this.app !== null) {
      const transform = this.camera.getWorldTransform(this.app.screen);
      const addScreen = (id: string, kind: 'hud' | 'canvasEdge', rect: PlateRect): void => {
        obstacles.push({
          id,
          kind,
          rect: { ...rect, x: rect.x - transform.x, y: rect.y - transform.y },
        });
      };
      this.screenOcclusions.forEach((rect, index) => addScreen(`hud.${index}`, 'hud', rect));
      // Bound the exterior guards by every candidate's possible 48px disk.
      // They protect each clipped edge separately without adding a reserved HUD strip.
      const left = Math.min(-48, ...candidates.map(({ rect }) => rect.x + transform.x - 48)),
        top = Math.min(-48, ...candidates.map(({ rect }) => rect.y + transform.y - 48)),
        right = Math.max(
          this.app.screen.width + 48,
          ...candidates.map(({ rect }) => rect.x + transform.x + rect.width + 48),
        ),
        bottom = Math.max(
          this.app.screen.height + 48,
          ...candidates.map(({ rect }) => rect.y + transform.y + rect.height + 48),
        );
      addScreen('canvas.left', 'canvasEdge', {
        x: left,
        y: top,
        width: -left,
        height: bottom - top,
      });
      addScreen('canvas.right', 'canvasEdge', {
        x: this.app.screen.width,
        y: top,
        width: right - this.app.screen.width,
        height: bottom - top,
      });
      addScreen('canvas.top', 'canvasEdge', { x: left, y: top, width: right - left, height: -top });
      addScreen('canvas.bottom', 'canvasEdge', {
        x: left,
        y: this.app.screen.height,
        width: right - left,
        height: bottom - this.app.screen.height,
      });
    }
    const byId = (a: { id: string }, b: { id: string }): number =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    candidates.sort(byId);
    obstacles.sort((a, b) => byId(a, b) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    return { candidates, obstacles };
  }

  private placeGeographicLabels(): void {
    for (const [id, part] of this.labelParts) {
      const forced = this.forceGeographicLabel(id);
      part.container.visible =
        this.view.analysisMode !== 'faction' &&
        part.cullVisible &&
        (part.lodVisible || (forced && this.lodStage === 'near')) &&
        (!part.declutterHidden || forced);
    }
    const inputs = this.geographicLabelInputs();
    if (inputs === null) return;
    const signature = JSON.stringify(inputs);
    if (signature !== this.geographicLabelLayoutSignature) {
      this.geographicLabelLayoutSignature = signature;
      this.geographicLabelOffsets = this.geographicLayouter.layout(
        inputs.candidates,
        inputs.obstacles
          .filter(({ kind }) => kind !== 'hud' && kind !== 'canvasEdge')
          .map(({ rect }) => rect),
        inputs.obstacles
          .filter(({ kind }) =>
            [
              'castle',
              'castleBody',
              'castleDurability',
              'castleWarning',
              'hud',
              'canvasEdge',
            ].includes(kind),
          )
          .map(({ rect }) => rect),
      );
      this.geographicLabelLayoutRuns += 1;
      for (const [id, part] of this.labelParts) {
        const offset = this.geographicLabelOffsets.get(id) ?? { x: 0, y: 0 };
        part.text.position.set(
          (part.baselineShift?.x ?? 0) + offset.x,
          part.baselineGap + (part.baselineShift?.y ?? 0) + offset.y,
        );
      }
    }
    // Decide using actual final text rectangles, never the unplaced baseline or a stale hide.
    let prioritySignature = signature;
    for (const { id } of inputs.candidates)
      prioritySignature += this.forceGeographicLabel(id) ? '|1' : '|0';
    if (prioritySignature !== this.geographicLabelPrioritySignature) {
      this.geographicLabelPrioritySignature = prioritySignature;
      this.geographicLabelPriority = prioritizeGeographicLabels(
        inputs.candidates.map((candidate) => {
          const offset = this.geographicLabelOffsets.get(candidate.id) ?? { x: 0, y: 0 };
          return {
            ...candidate,
            rect: {
              ...candidate.rect,
              x: candidate.rect.x + offset.x,
              y: candidate.rect.y + offset.y,
            },
            forced: this.forceGeographicLabel(candidate.id),
          };
        }),
        inputs.obstacles.filter(({ kind }) => kind !== 'canvasEdge').map(({ rect }) => rect),
      );
    }
    for (const [id, decision] of this.geographicLabelPriority) {
      const part = this.labelParts.get(id);
      if (part) part.container.visible &&= decision.visible;
    }
  }

  /** Canvas-local CSS rectangles measured from real Pixi objects, not glyph recognition. */
  private observeGeographicLabelLayout() {
    const inputs = this.geographicLabelInputs();
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    });
    const screenRect = (rect: PlateRect): PlateRect => ({
      ...rect,
      x: rect.x + (transform?.x ?? 0),
      y: rect.y + (transform?.y ?? 0),
    });
    return {
      runs: this.geographicLabelLayoutRuns,
      placementCache: this.geographicLayouter.getDiagnostics(),
      labels: (inputs?.candidates ?? []).map(({ id, kind, rect, roadCapsules }) => {
        const part = this.labelParts.get(id)!;
        const bounds = part.text.getLocalBounds();
        const scale = this.camera?.getState().scale ?? 1;
        const actualRect = {
          x: part.pos.x * scale + part.text.position.x + bounds.x,
          y: part.pos.y * scale + part.text.position.y + bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
        const clear =
          roadCapsules === undefined || roadLabelClearsCapsules(actualRect, roadCapsules);
        const fill = part.text.style.fill;
        const stroke = part.text.style.stroke;
        const strokeColor =
          stroke !== null && typeof stroke === 'object' && 'color' in stroke ? stroke.color : null;
        const strokeWidth =
          stroke !== null && typeof stroke === 'object' && 'width' in stroke ? stroke.width : null;
        return {
          id,
          kind,
          text: part.text.text,
          visible: part.container.visible,
          priority: this.geographicLabelPriority.has(id)
            ? { ...this.geographicLabelPriority.get(id)! }
            : null,
          // Read the admitted Pixi object, not merely the desired role constants.
          paint: {
            fill: typeof fill === 'number' || typeof fill === 'string' ? fill : null,
            // TextStyle's live stroke proxy includes default texture ownership.
            // Export only primitives, never a Pixi resource graph.
            stroke: {
              color:
                typeof strokeColor === 'number' || typeof strokeColor === 'string'
                  ? strokeColor
                  : null,
              width: typeof strokeWidth === 'number' ? strokeWidth : null,
            },
            alpha: part.text.alpha,
            fontSizeCss:
              part.text.style.fontSize *
              Math.abs(part.text.scale.x * part.container.scale.x * scale),
          },
          worldAnchor: { ...part.canonicalPos },
          baseline: screenRect(rect),
          rect: screenRect(actualRect),
          ...(kind === 'road' ? { roadClearance: { clear, unresolved: !clear } } : {}),
          offset: {
            x: part.text.position.x - (part.baselineShift?.x ?? 0),
            y: part.text.position.y - part.baselineGap - (part.baselineShift?.y ?? 0),
          },
          baselineShift: { ...(part.baselineShift ?? { x: 0, y: 0 }) },
          anchor: {
            x: part.pos.x * scale + (transform?.x ?? 0),
            y: part.pos.y * scale + (transform?.y ?? 0),
          },
        };
      }),
      obstacles: (inputs?.obstacles ?? []).map(({ id, kind, rect }) => ({
        id,
        kind,
        rect: screenRect(rect),
      })),
    };
  }

  /**
   * 名牌綬帶的實際螢幕 AABB。錨點螢幕座標＝worldToScreen(node.pos) 加
   * (0, worldGap×scale) 偏移為 AABB 中心-上緣；w/h 取 part 目前綬帶尺寸（pixel-lock 後即 CSS px）。
   */
  private nameplateScreenRect(
    e: NameplateEntry,
    viewport: { width: number; height: number },
    scale: number,
  ): PlateRect {
    const s = this.camera!.sceneToScreen(e.pos, viewport);
    const { w, h } = e.part.getOriginalPresentationGeometry?.().ribbon ?? e.part.getRibbonSize();
    const cx = s.x;
    const cy = s.y + NAMEPLATE_GEOMETRY[e.tier].worldGap * scale;
    return { x: cx - w / 2, y: cy, width: w, height: h };
  }

  /**
   * 決定論標籤＋名牌 declutter。名牌以64×64 CSS px 網格篩選候選，再檢查實際 AABB。
   * 地理標籤保留既有佔格密度，避免一次改變兩類文字的能見度。
   * 優先序 本城名牌(0) > 國名(1) > 支城名牌(2) > 郡(3) > 道路(4)，同級以 id 字典序
   * tie-break；真正相交者 `declutterHidden=true`，不因落在同一格而隱藏互不相交的城名。
   * 省/郡/道路亦依 pixel-lock 文字尺寸佔格，避免長地名跨格疊字；破例名牌（§2.8）先佔格。只由 applyLodAndCulling
   * 於 idle 下降沿／scale 變／lodStage 變時呼叫（非每幀）。
   */
  private runLabelDeclutter(): void {
    if (this.app === null || this.camera === null) return;
    const viewport = { width: this.app.screen.width, height: this.app.screen.height };
    const scale = this.camera.getState().scale;
    type Item =
      | { priority: number; id: string; kind: 'label'; part: LabelPart }
      | { priority: number; id: string; kind: 'nameplate'; entry: NameplateEntry };
    const candidates: Item[] = [];
    for (const [id, part] of this.labelParts) {
      if (!part.lodVisible || !part.cullVisible) {
        part.declutterHidden = false; // 非本輪參與者重設，轉可見時由下一次觸發重算
        continue;
      }
      // M6-V9b：城名已移出 labelParts，剩餘標籤＝省(1)/郡(3)/道路(4)。
      const priority = part.kind === 'province' ? 1 : part.kind === 'district' ? 3 : 4;
      candidates.push({ priority, id, kind: 'label', part });
    }
    for (const [id, entry] of this.nameplateParts) {
      if (!entry.lodVisible || !entry.cullVisible) {
        entry.declutterHidden = false;
        continue;
      }
      candidates.push({ priority: entry.tier === 'main' ? 0 : 2, id, kind: 'nameplate', entry });
    }
    candidates.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    const occupancy = new Map<string, { rect: PlateRect; kind: 'label' | 'nameplate' }[]>();
    const cellsFor = (rect: PlateRect): string[] => {
      const cells: string[] = [];
      for (
        let x = Math.floor(rect.x / LABEL_DECLUTTER_CELL_PX);
        x <= Math.floor((rect.x + rect.width) / LABEL_DECLUTTER_CELL_PX);
        x++
      ) {
        for (
          let y = Math.floor(rect.y / LABEL_DECLUTTER_CELL_PX);
          y <= Math.floor((rect.y + rect.height) / LABEL_DECLUTTER_CELL_PX);
          y++
        )
          cells.push(`${x},${y}`);
      }
      return cells;
    };
    const reserve = (rect: PlateRect, kind: 'label' | 'nameplate'): void => {
      for (const cell of cellsFor(rect)) {
        const bucket = occupancy.get(cell) ?? [];
        bucket.push({ rect, kind });
        occupancy.set(cell, bucket);
      }
    };
    const intersects = (rect: PlateRect, conservativeLabels = false): boolean =>
      cellsFor(rect).some((cell) =>
        occupancy
          .get(cell)
          ?.some(
            ({ rect: other, kind }) =>
              (conservativeLabels && kind === 'label') ||
              (rect.x < other.x + other.width &&
                rect.x + rect.width > other.x &&
                rect.y < other.y + other.height &&
                rect.y + rect.height > other.y),
          ),
      );
    // 破例名牌（§2.8）：先強制 declutterHidden=false 並先佔格（沿 M6-V8 收合疊軍選取破例精神）。
    const forced = new Set<string>();
    for (const item of candidates) {
      if (item.kind !== 'nameplate') continue;
      if (!this.nameplateForceShow(item.id, item.entry)) continue;
      forced.add(item.id);
      item.entry.declutterHidden = false;
      reserve(this.nameplateScreenRect(item.entry, viewport, scale), 'nameplate');
    }
    for (const item of candidates) {
      if (item.kind === 'nameplate') {
        if (forced.has(item.id)) continue;
        const rect = this.nameplateScreenRect(item.entry, viewport, scale);
        if (intersects(rect)) {
          item.entry.declutterHidden = true;
        } else {
          reserve(rect, 'nameplate');
          item.entry.declutterHidden = false;
        }
        continue;
      }
      const s = this.camera.sceneToScreen(item.part.pos, viewport);
      const text = item.part.text;
      // Text dimensions and its local offset are CSS pixels: the parent is pixel-locked.
      const stroke = text.style.stroke;
      const haloWidth =
        stroke !== null &&
        typeof stroke === 'object' &&
        'width' in stroke &&
        typeof stroke.width === 'number'
          ? stroke.width
          : 2;
      const rect = geographicDeclutterEnvelope(
        s,
        item.part.baselineGap,
        text.width,
        text.height,
        haloWidth,
      );
      if (intersects(rect, true)) {
        item.part.declutterHidden = true;
      } else {
        reserve(rect, 'label');
        item.part.declutterHidden = false;
      }
    }
  }

  /**
   * M6-V8（V8D4）：行軍方向單位向量（chip 方向箭頭），由 `fromNode`/`toNode`/`edgeT`（§4.6 D9
   * 渲染內插參數）計算——沿 authored waypoints 的當前段切線，非模擬規則。
   * 移動 iff `toNode!==null && toNode!==fromNode && edgeT>0`；否則（靜止／未出發）回 `null`。
   */
  private computeArmyHeading(
    a: MapArmyView,
    graph: MapGraph | undefined,
  ): { x: number; y: number } | null {
    if (graph === undefined || a.toNode === null || a.toNode === a.fromNode || a.edgeT <= 0) {
      return null;
    }
    const from = graph.nodes.get(a.fromNode)?.pos;
    const to = graph.nodes.get(a.toNode)?.pos;
    if (from === undefined || to === undefined) return null;
    const edge = edgeBetween(graph, a.fromNode, a.toNode);
    const points = edge ? edgeVisualPolyline(edge, graph) : null;
    if (points) {
      if (this.sceneProjection === null) {
        const oriented = edge!.a === a.fromNode ? points : points.slice().reverse();
        const angle = tangentAtPolyline(oriented, a.edgeT);
        if (angle !== null) return { x: Math.cos(angle), y: Math.sin(angle) };
      }
      const heading = projectedPolylineHeading(
        points,
        a.edgeT,
        this.projectScenePoint,
        edge!.a !== a.fromNode,
      );
      if (heading !== null) return heading;
    }
    const sceneFrom = this.presentPoint(from),
      sceneTo = this.presentPoint(to);
    const dx = sceneTo.x - sceneFrom.x;
    const dy = sceneTo.y - sceneFrom.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? null : { x: dx / len, y: dy / len };
  }

  /**
   * M6-V8（V8D11）：軍隊 chip 之 per-id diff＋冪等 update＋被選取置頂，自 `redrawMilitaryObjects`
   * 抽出，使 LOD 段變更（restage）可獨立於 tick 重繪軍隊段（`applyLodAndCulling` 開頭以
   * `lodStage !== armyChipStage` 落差觸發，不遞迴——本方法不呼 `applyLodAndCulling`）。
   *
   * props 除既有 pos/colorIndex/soldiers/morale/corps/collapsedCount，補齊 M6-V8 新欄位：
   * `status`/`foodDays`/`relation`/`selected`（皆來自 `MapArmyView`）、`heading`（renderer 內插，
   * V8D4）、`stage`（當前 LOD 段，V8D9/D13）、`labelStagger`（同節點 stackIndex，兵數底板垂直
   * 錯位，V8D14）。皆納入 `armyChipDrawEqual`（pos 除外）→ day-only tick 段不變、props 相等 →
   * `update` 回 `false` → `armyChips` 零增量（守 M6-V4 DoD③）。restage 之重繪為合法遞增；far
   * container 反向放大為 `applyLodAndCulling` 之 transform（不經本方法、不計數）。
   */
  private syncArmyChips(): void {
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
      part.destroy();
      this.armyParts.delete(id);
      this.armyPlateLayoutSignature = null;
      this.armyCull.remove(id);
    }
    this.collapsedArmyIds = new Set<string>();
    this.aggregateArmyIds.clear();
    for (const entry of layout) {
      const army = entry.army;
      let part = this.armyParts.get(army.id);
      if (part === undefined) {
        part = createArmyChip();
        part.setBodyArt(this.armyBodyArt);
        this.armyParts.set(army.id, part);
        this.layers.armies.addChild(part.container);
        part.depthBody.label = `army:${army.id}`;
        part.attachDepthLayers(this.layers.actorBodies, this.castleGroundStatus!);
        this.actorDepthSignature = null;
        this.armyPlateLayoutSignature = null;
      }
      if ((entry.collapsedCount ?? 0) > 0) this.aggregateArmyIds.add(army.id);
      // V8D10：被選取軍隊「在任何 zoom 皆破例顯示且置頂」——即使 id 落於 5+ 疊放收合區（index>=4），
      // 亦不加入 collapsedArmyIds（否則 applyLodAndCulling 會強制隱藏），確保金色雙環可見。
      if (!entry.visible && !this.forceKeepChip(army)) this.collapsedArmyIds.add(army.id);
      const pos = this.presentPoint(entry.pos);
      const redrew = part.update({
        pos,
        colorIndex: clanColorIndex[army.clanId] ?? 0,
        soldiers: army.soldiers,
        morale: army.morale,
        corps: army.corps,
        status: army.status,
        foodDays: army.foodDays,
        relation: army.relation,
        selected: army.selected,
        heading: this.computeArmyHeading(army, graph),
        stage: this.lodStage,
        labelStagger: entry.stackIndex,
        ...(entry.collapsedCount === undefined ? {} : { collapsedCount: entry.collapsedCount }),
      });
      if (redrew) this.rebuildCounts.armyChips += 1;
      part.syncDepthBody();
      this.armyCull.upsert(army.id, pos.x, pos.y);
    }
    this.interaction.setArmies(
      layout
        .filter(
          (entry) =>
            entry.visible || this.forceKeepChip(entry.army) || this.isFactionDot(entry.army),
        )
        .map((entry) => ({
          id: entry.army.id,
          // Simplified faction symbols deliberately have no chip stacking. Match
          // their actual world positions, including armies collapsed in chip mode.
          pos: this.isFactionDot(entry.army) ? (entry.army.pos ?? entry.pos) : entry.pos,
        })),
    );
    // V8D10：被選取軍隊 re-append 至末（＝繪製最上）；單選、確定性。至多一軍 selected。
    // 收合區（!entry.visible）之被選取軍亦須置頂——上方已將其排除於 collapsedArmyIds，故其 container
    // 會顯示；此處不得再以 !entry.visible 跳過，否則置頂失效（「永遠置頂」硬約束）。
    for (const entry of layout) {
      if (!entry.army.selected) continue;
      const part = this.armyParts.get(entry.army.id);
      if (part === undefined) continue;
      this.layers.armies.removeChild(part.container);
      this.layers.armies.addChild(part.container);
    }
    // V8D11：登記已繪段，供 applyLodAndCulling 之 restage 落差判定（this.lodStage !== armyChipStage）。
    this.armyChipStage = this.lodStage;
  }

  /** World foot depth is independent of selected semantic foreground order. */
  private actorDepthSignature: string | null = null;
  private sortActorBodies(): void {
    if (!this.layers) return;
    const footY = (body: Container): number =>
      body.position.y - (body.label?.startsWith('army:') ? body.scale.y : 0);
    const signature = this.layers.actorBodies.children
      .map((body) => `${body.label}:${footY(body)}`)
      .sort()
      .join('|');
    if (signature === this.actorDepthSignature) return;
    this.actorDepthSignature = signature;
    const ordered = this.layers.actorBodies.children.slice().sort((a, b) => {
      const depth = footY(a) - footY(b);
      return depth || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    });
    // Reorder only when a moving actor crosses a foot-depth or membership changes.
    if (ordered.some((body, i) => this.layers!.actorBodies.children[i] !== body)) {
      for (const body of ordered) this.layers.actorBodies.addChild(body);
    }
  }

  private isFactionDot(army: MapViewState['armies'][number]): boolean {
    return this.view.analysisMode === 'faction' && !this.forceKeepChip(army);
  }

  private forceKeepChip(army: MapViewState['armies'][number]): boolean {
    return (
      army.selected ||
      (this.view.analysisMode === 'faction' &&
        (army.foodDays < MAPVIEW.armySupplyLowDays ||
          army.status === 'engaged' ||
          army.status === 'sieging'))
    );
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
    this.syncArmyChips();
    this.syncBattleSparks();

    const sieges = this.view.sieges ?? [];
    const activeSiegeIds = new Set(sieges.map((siege) => siege.id));
    for (const [id, part] of this.siegeParts) {
      if (activeSiegeIds.has(id)) continue;
      part.container.parent?.removeChild(part.container);
      part.container.destroy({ children: true });
      this.siegeParts.delete(id);
      this.siegeCull.remove(id);
    }
    for (const siege of sieges) {
      let part = this.siegeParts.get(siege.id);
      if (part === undefined) {
        part = createSiegeMarker();
        this.siegeParts.set(siege.id, part);
        this.castleGroundStatus?.addChild(part.container);
      }
      part.update({
        pos: this.presentPoint(siege.pos),
        mode: siege.mode,
        elapsedMs: this.siegeElapsedMs,
        reducedMotion: this.reducedMotion || !this.presentation.effectsEnabled,
      });
      const scene = this.presentPoint(siege.pos);
      this.siegeCull.upsert(siege.id, scene.x, scene.y);
    }
    this.applyLodAndCulling();
  }

  // ── 01 §4.3 契約方法 ──────────────────────────────────────────────

  private presentation: MapPresentationSettings = {
    mapLabelDensity: 'medium',
    effectsEnabled: true,
  };

  /** Presentation-only preferences, reusable before asynchronous renderer initialization completes. */
  setPresentationSettings(settings: MapPresentationSettings): void {
    if (
      settings.mapLabelDensity === this.presentation.mapLabelDensity &&
      settings.effectsEnabled === this.presentation.effectsEnabled &&
      (settings.reducedMotion ?? false) === (this.presentation.reducedMotion ?? false)
    )
      return;
    this.presentation = { ...settings };
    this.reducedMotion = mapMotionReduced(settings);
    this.camera?.setReducedMotion(this.reducedMotion);
    this.applyCameraTransform();
    this.lastLabelScale = Number.NaN;
    this.lastNameplateScale = Number.NaN;
    if (this.reducedMotion) this.siegeElapsedMs = 0;
    this.updateSiegeAnimations();
    this.updateBattleSparks();
    this.applyLodAndCulling();
  }

  /** 鏡頭平滑移至節點（UI「前往」按鈕／開局聚焦居城，01 §4.3）：交由 camera.focusOn 補間（04 §3.11，onTick 推進）。 */
  focusNode(nodeId: string, focusViewport?: FocusViewport | null): void {
    if (this.camera === null || this.staticData === null) return;
    const node = this.staticData.graph.nodes.get(nodeId as never);
    if (node === undefined) return;
    this.focusWorld(node.pos, focusViewport);
    this.applyCameraTransform();
    this.applyLodAndCulling();
  }

  /** One existing 04 §3.11 camera step per host keyboard frame; no gameplay mutation. */
  panByKeyboard(dirX: number, dirY: number): void {
    if (this.camera === null || !Number.isFinite(dirX) || !Number.isFinite(dirY)) return;
    this.camera.panByKeyboard(Math.sign(dirX), Math.sign(dirY));
    this.applyCameraTransform();
    this.applyLodAndCulling();
  }

  /** Keyboard zoom keeps the viewport center anchored, using the existing wheel step/clamps. */
  zoomByKeyboard(direction: -1 | 1): void {
    if (this.camera === null || this.app === null) return;
    const { width, height } = this.app.screen;
    this.camera.onWheel(
      direction === 1 ? -1 : 1,
      { x: width / 2, y: height / 2 },
      { width, height },
    );
    this.applyCameraTransform();
    this.applyLodAndCulling();
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
    // M6-V5（VD3）：preset 瞬移先以純分類清 hysteresis 狀態，保證 0.25→far／0.5→mid／1.25→near 決定論。
    this.lodStage = lodStageForScale(clampedScale);
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
    const changed =
      this.marchPathPreview?.originNodeId !== preview?.originNodeId ||
      this.marchPathPreview?.targetNodeId !== preview?.targetNodeId;
    this.marchPathPreview = preview;
    this.redrawPathPreview();
    if (changed) this.queueScreenLayouts();
  }

  setMode(mode: MapInteractionMode): void {
    this.interaction.setMode(mode);
  }

  /**
   * M6-V9b（§3.4）：出陣目標選中城之名牌「目標高亮」——綬帶外 1px accentGold 金框（切既繪
   * Graphics 子物件 visible，不重繪名牌本體、不進 nameplates 計數）＋declutter 破例恆顯（§2.8）。
   * `null` 清除。由 `MapCanvasHost` 之 `marchTargetId` prop 透傳（S2 接線）。
   */
  setMarchTarget(targetId: string | null): void {
    if (targetId === this.marchTargetId) return;
    if (this.marchTargetId !== null) {
      this.nameplateParts.get(this.marchTargetId)?.part.setTargetHighlight(false);
    }
    this.marchTargetId = targetId;
    this.queueScreenLayouts();
    if (targetId !== null) {
      this.nameplateParts.get(targetId)?.part.setTargetHighlight(true);
    }
    if (this.initialized) {
      this.runLabelDeclutter();
      this.applyLodAndCulling();
    }
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
    for (const dispose of [...this.renderFrameDisposers]) dispose();
    this.clearBattleSparks();
    this.disposed = true;
    this.geographicScorer.dispose();
    this.screenLayoutsPending = false;
    this.analysisOverlay?.destroy();
    this.analysisOverlay = null;
    const app = this.app;
    if (app !== null) {
      if (this.screenLayoutObserverRegistered) {
        app.renderer.runners.prerender.remove(this.screenLayoutObserver);
        this.screenLayoutObserverRegistered = false;
        this.registeredListenerCount -= 1;
      }
      app.stage.off('pointermove', this.onPointerMove);
      this.registeredListenerCount -= 1;
      app.stage.off('pointerdown', this.onPointerDown);
      this.registeredListenerCount -= 1;
      app.stage.off('pointerup', this.onPointerUp);
      this.registeredListenerCount -= 1;
      app.stage.off('pointerupoutside', this.onPointerUp);
      this.registeredListenerCount -= 1;
      app.stage.off('pointertap', this.onPointerTap);
      this.registeredListenerCount -= 1;
      app.stage.off('rightclick', this.onRightClick);
      this.registeredListenerCount -= 1;
      app.renderer.off('resize', this.onRendererResize);
      this.registeredListenerCount -= 1;
      app.ticker.remove(this.onTick);
      this.registeredListenerCount -= 1;
      app.canvas.removeEventListener('wheel', this.onWheel);
      this.registeredListenerCount -= 1;
      app.canvas.removeEventListener('pointercancel', this.onPointerCancel);
      this.registeredListenerCount -= 1;
      app.canvas.removeEventListener('pointerleave', this.onPointerLeave);
      this.registeredListenerCount -= 1;
      window.removeEventListener('blur', this.onWindowBlur);
      this.registeredListenerCount -= 1;
      // Major 3 修正（§5.1）：先 detach＋destroy 地形/領地 sprite，控制 texture 銷毀範圍，再讓
      // app.destroy 收其餘 display object——避免 app.destroy({texture:true}) 直接銷毀與 boot 共享之
      // relief/forest texture source。共享 source 只經 terrainLoader.dispose() refcount 釋放；
      // territory 為自持 texture，顯式銷毀。
      for (const s of [this.reliefSprite, this.forestSprite]) {
        if (s) {
          s.parent?.removeChild(s);
          s.destroy({ texture: false });
        }
      }
      this.reliefSprite = null;
      this.forestSprite = null;
      this.mountainRaster?.destroy();
      this.mountainRaster = null;
      this.forestRaster?.destroy();
      this.forestRaster = null;
      this.groundMaterial?.destroy();
      this.groundMaterial = null;
      this.elevatedSurface?.destroy();
      this.elevatedSurface = null;
      this.projectedCanopy?.destroy();
      this.projectedCanopy = null;
      this.foothillCanopy?.destroy();
      this.foothillCanopy = null;
      this.fieldMaterial?.destroy();
      this.fieldMaterial = null;
      this.destroyGroundSurface();
      this.seaSurface?.destroy();
      this.seaSurface = null;
      this.coastSurface?.destroy();
      this.coastSurface = null;
      this.coastLandGfx?.parent?.removeChild(this.coastLandGfx);
      this.coastLandGfx?.destroy({ context: true, texture: false, textureSource: false });
      this.coastLandGfx = null;
      this.dimensionalTerrain?.parent?.removeChild(this.dimensionalTerrain);
      this.dimensionalTerrain?.destroy({ children: true });
      this.dimensionalTerrain = null;
      if (this.territoryProjectedOverlay) {
        this.territoryProjectedOverlay.destroy();
        this.territoryProjectedOverlay = null;
        this.territorySprite = null;
      } else if (this.territorySprite) {
        this.territorySprite.parent?.removeChild(this.territorySprite);
        this.territorySprite.destroy({ texture: false });
        this.territorySprite = null;
      }
      this.territoryTexture?.destroy(true); // 自持 texture，顯式銷毀
      this.territoryTexture = null;
      this.territorySource?.destroy();
      this.territorySource = null;
      this.territoryGrid = null;
      this.waterFeatures?.destroy(); // 顯式，勿依賴 app.destroy
      this.waterFeatures = null;
      this.terrainLoader?.dispose(); // 共享 relief/forest 只經 refcount 釋放（不 Assets.unload 若他人仍持有）
      this.terrainLoader = null;
      this.territoryDirty = false;
      this.terrainTexturesPending = false;
      this.lodStage = 'far';
      this.armyChipStage = 'far'; // M6-V8（V8D11）：與 lodStage 同步重設，重掛後 init 不因段落差重繪
      this.lastLabelScale = Number.NaN; // M6-V9：pixel-lock 快取重設（重掛後首次全量重套）
      this.lastNameplateScale = Number.NaN; // M6-V9b：名牌 pixel-lock 快取重設（平行哨兵）
      this.lastCameraIdle = false; // M6-V9：declutter idle 邊緣偵測重設
      // M6-V6：顯式卸載＋銷毀 RoadsLayer／roadHighlight（勿只依賴 app.destroy children 遞迴）。
      if (this.roadsLayer) {
        this.roadsLayer.container.parent?.removeChild(this.roadsLayer.container);
        this.roadsLayer.destroy();
        this.roadsLayer = null;
      }
      this.roadHighlight?.destroy();
      this.roadHighlight = null;
      this.prevSelectionKey = null;
      // M6-V7：顯式卸載＋銷毀選取環／城下聚落／節點元件（勿只依賴 app.destroy children 遞迴）。
      this.selectionRing?.destroy();
      this.selectionRing = null;
      if (this.settlements) {
        this.settlements.container.parent?.removeChild(this.settlements.container);
        this.settlements.destroy();
        this.settlements = null;
      }
      this.settlementObstacles = [];
      this.prevNodeSig = null;
      this.settlementModelBounds = Object.freeze([]);
      this.settlementCrests = [];
      this.prevNameplateSig = null; // M6-V9b：名牌簽章快取重設
      for (const { part } of this.nodeParts.values()) part.destroy();
      this.castleArtLoader?.dispose();
      this.castleArtLoader = null;
      this.castleBodyArt = {};
      this.castleArtPending = false;
      for (const part of this.armyParts.values()) part.destroy();
      this.armyArtLoader?.dispose();
      this.armyArtLoader = null;
      this.armyBodyArt = {};
      this.armyArtPending = false;
      this.armyArtRequested = false;
      for (const { part } of this.nameplateParts.values()) part.destroy(); // M6-V9b：名牌對稱銷毀
      app.destroy({ removeView: true }, { children: true, texture: true });
    }
    this.app = null;
    this.layers = null;
    this.camera = null;
    this.sceneProjection = null;
    this.projectScenePoint = (point) => ({ ...point });
    this.terrainProjectionError = null;
    this.dragPointerId = null;
    this.seaGfx = null;
    this.pathPreview = null;
    this.marchPathPreview = null;
    this.nodeParts.clear();
    this.labelParts.clear();
    this.nameplateParts.clear();
    this.marchTargetId = null; // M6-V9b：目標高亮重設（重掛後無殘留）
    this.armyParts.clear();
    this.aggregateArmyIds.clear();
    this.armyPlateOffsets.clear();
    this.castleRibbonPlacements.clear();
    this.castleRibbonLayoutSignature = null;
    this.castleRibbonOriginalSignature = null;
    this.castleRibbonContextSignature = null;
    this.castleRibbonLayoutRuns = 0;
    this.castleRibbonLayoutLimited = false;
    this.castleRibbonSeedOffsets.clear();
    this.castleRibbonSeedPlates = [];
    this.armyPlateLayoutSignature = null;
    this.armyPlateLayoutRuns = 0;
    this.armySignalLayoutSignature = null;
    this.armySignalLayoutRuns = 0;
    this.geographicLabelLayoutSignature = null;
    this.geographicLabelLayoutRuns = 0;
    this.geographicLabelOffsets.clear();
    this.geographicLabelPriority = new Map();
    this.geographicLabelPrioritySignature = null;
    this.geographicHoveredNode = null;
    this.geographicAlertSource = undefined;
    this.geographicAlertIds.clear();
    this.siegeParts.clear();
    this.castleGroundStatus = null;
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
    this.screenLayoutsPending = false;
    this.geographicHoveredNode = null;
    this.geographicLabelPriority = new Map();
    this.geographicLabelPrioritySignature = null;
    this.clearBattleSparks();
    this.staticData = data;
    this.refreshDisplayCoast();
    this.interaction.setStaticData(data);
    if (this.initialized) {
      this.drawStaticBackground(); // outline 可能被 data.outline 覆蓋
      this.resetArmyBodyArt();
      // Blocker 1（§5.1）：與 init() 鏡像呼叫；data===null 時 reconstructTerrainLayers 內部見 null 即清空。
      this.reconstructTerrainLayers();
      this.loadCastleBodyArt();
      this.prevOwnerByNode = null;
      this.prevNodeSig = null; // M6-V7：重建保證——下次 updateView 全節點簽章 dirty（§13-B3）
      this.prevNameplateSig = null; // M6-V9b §2.9：同上，名牌簽章全 dirty 首繪保證
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
    this.loadArmyBodyArt();
    this.analysisOverlay?.update(view, view.analysisMode, this.analysisOpacity);
    if (this.analysisOverlay !== null && this.layers !== null) {
      const annotations = this.analysisOverlay.annotations;
      if (view.analysisMode === 'faction' && annotations.parent === null)
        this.layers.labels.addChild(annotations);
      if (view.analysisMode !== 'faction') annotations.parent?.removeChild(annotations);
    }
    this.applyOwnerDirty(view);
    // M6-V5（VD4）：owner 翻轉後之次幀 territory recolor（每幀至多一次）；不動 rebuildCounts
    // （sprite 內容 in-place 重上傳，非重建）。territory 只吃郡 owner（`districtOwner`）。
    if (
      this.territoryDirty &&
      this.territoryGrid !== null &&
      this.staticData !== null &&
      this.territorySource !== null
    ) {
      recolorTerritory(this.territoryGrid, view.districtOwner, this.staticData.clanColorIndex);
      this.territorySource.update();
      this.territoryDirty = false;
    }
    // M6-V6（Slice E）：節點選取相鄰道路金色高亮 dirty——僅 selection.kind==='node' 之 id 變動時
    // 重畫（day-only 變更 selKey 不變 → 不重畫，守 dirty 契約；不動 rebuildCounts）。graph swap 後
    // prevSelectionKey 已於 buildStaticDataLayers 重設為 null → 下次必重算，杜絕陳舊高亮。
    const selKey =
      view.selection !== null && view.selection.kind === 'node' ? view.selection.id : null;
    if (selKey !== this.prevSelectionKey) {
      this.prevSelectionKey = selKey;
      if (this.staticData !== null) {
        this.roadHighlight?.update({ graph: this.staticData.graph, selectedNodeId: selKey }); // V6
        this.updateSelectionRing(selKey); // M6-V7（CD5）：節點選取金色雙環（與 V6 共用 prevSelectionKey）
      }
    }
    this.redrawMilitaryObjects();
  }

  /** Detached published view for read-only semantic checks; excludes the live core state. */
  getPublishedViewSnapshot(): MapViewState {
    return structuredClone(this.view);
  }

  /** UI-only theme controls; neither the input view nor GameState is mutated. */
  update(
    view: MapViewState,
    ui?: { analysisMode?: MapAnalysisMode; analysisOpacity?: number },
  ): void {
    if (ui?.analysisOpacity !== undefined) {
      this.analysisOpacity = Number.isFinite(ui.analysisOpacity)
        ? Math.max(0, Math.min(1, ui.analysisOpacity))
        : 0.55;
    }
    this.updateView(
      ui?.analysisMode === undefined ? view : { ...view, analysisMode: ui.analysisMode },
    );
    if (this.initialized) this.applyLodAndCulling();
  }

  /**
   * M6-V7（CD5）：節點選取環顯隱／定位。`selKey===null`（未選節點或選軍隊）或 graph 無此 node →
   * 隱藏；否則依 node 種類（本城/支城/郡）取命中半徑，於 node.pos 畫金色雙環（錨點置中）。
   * 不動任何 `rebuildCounts`；由 `updateView` 之 `prevSelectionKey` diff 驅動（day-only selKey 不變 → 不更新）。
   */
  private updateSelectionRing(selKey: string | null): void {
    const ring = this.selectionRing;
    if (ring === null) return;
    if (selKey === null || this.staticData === null) {
      ring.container.visible = false;
      return;
    }
    const node = this.staticData.graph.nodes.get(selKey as never);
    if (node === undefined) {
      ring.container.visible = false;
      return;
    }
    const hr =
      node.kind === 'castle'
        ? this.staticData.castleTier?.[selKey] === 'main'
          ? MAPVIEW.hitRadius.castleMain
          : MAPVIEW.hitRadius.castleBranch
        : MAPVIEW.hitRadius.district;
    ring.update({ pos: this.presentPoint(node.pos), targetHitRadius: hr, primary: true });
    ring.container.visible = true;
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

  /**
   * MiniMap `onNavigate` 接線（M6-V9 §4.4）：鏡頭**補間**至世界座標（非瞬移；沿用 `focusNode`
   * 之 `camera.focusOn` 路徑，由 onTick 推進，無新 ticker）。scale 取 `MAPVIEW.focusScale` 預設。
   * S3 由 `MapCanvasHost` 之 `useImperativeHandle` 暴露本方法。
   */
  panToWorld(x: number, y: number, focusViewport?: FocusViewport | null): void {
    if (this.camera === null) return;
    this.focusWorld({ x, y }, focusViewport);
    this.applyCameraTransform();
    this.applyLodAndCulling();
  }

  /** Updating measured bounds never navigates; invalid bounds fall back at the next focus. */
  setFocusViewport(rect: FocusViewport | null): void {
    this.focusViewport = rect === null ? null : { ...rect };
  }

  /** Measured individual HUD bounds; this never moves the camera or hides map information. */
  setScreenOcclusions(rects: readonly FocusViewport[]): void {
    for (const rect of rects)
      if (
        ![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(
          Number.isFinite,
        ) ||
        rect.width < 0 ||
        rect.height < 0
      )
        throw new RangeError('Invalid screen occlusion');
    const next = rects
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({ ...rect }))
      .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
    if (JSON.stringify(next) === JSON.stringify(this.screenOcclusions)) return;
    this.screenOcclusions = next;
    this.queueScreenLayouts();
  }

  private focusWorld(target: { x: number; y: number }, override?: FocusViewport | null): void {
    if (this.camera === null || this.app === null) return;
    const scale = Math.max(MAPVIEW.minScale, Math.min(MAPVIEW.maxScale, MAPVIEW.focusScale));
    const center = hudFocusTarget(
      this.presentPoint(target),
      this.app.screen,
      override === undefined ? this.focusViewport : override,
      scale,
    );
    void this.camera.focusOn(this.canonicalPoint(center), { scale });
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
    this.flushScreenLayouts();
    return this.layers;
  }

  /** 供測試／橋接層取用底層 Application（init 前或 destroy 後為 null）。 */
  getApp(): Application | null {
    return this.app;
  }

  /** Debug observation of actual Pixi render completion; no ticker or simulation driver. */
  subscribeRenderedFrames(listener: (timestamp: number) => void): () => void {
    const app = this.app;
    if (!this.isReady() || app === null) throw new Error('Map is not ready for render observation');
    const runner = app.renderer.runners.postrender;
    const observer = {
      postrender: () => {
        try {
          listener(performance.now());
        } catch {
          /* Debug observer cannot break rendering. */
        }
      },
    };
    runner.add(observer);
    this.registeredListenerCount += 1;
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      runner.remove(observer);
      this.registeredListenerCount -= 1;
      this.renderFrameDisposers.delete(dispose);
    };
    this.renderFrameDisposers.add(dispose);
    return dispose;
  }

  /** Cheap culling/visibility observation, not proof of GPU-presented pixels or glyph area. */
  getArmyRenderObservation(armyIds?: readonly string[]) {
    this.flushScreenLayouts();
    const eligible = (container: Container): boolean => {
      let current: Container | null = container;
      while (current !== null) {
        if (!current.visible || !current.renderable || current.alpha <= 0) return false;
        current = current.parent;
      }
      return true;
    };
    const parts =
      armyIds === undefined
        ? [...this.armyParts.values()]
        : [...new Set(armyIds)].flatMap((id) => {
            const part = this.armyParts.get(id);
            return part === undefined ? [] : [part];
          });
    return {
      mounted: parts.length,
      cullVisibleArmyChips: parts.filter((part) => eligible(part.container)).length,
    };
  }

  /** Observed renderer state for visual gates; counts cover renderer-owned resources only. */
  /** Paint frames and actual tree order, not an opaque roof-pixel segmentation. */
  private observeCastleRendering() {
    const scale = this.camera?.getState().scale ?? 1;
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    }) ?? { x: 0, y: 0 };
    const rectAt = (pos: { x: number; y: number }, rect: PlateRect): PlateRect => ({
      x: (pos.x + rect.x) * scale + transform.x,
      y: (pos.y + rect.y) * scale + transform.y,
      width: rect.width * scale,
      height: rect.height * scale,
    });
    const groundOrder = this.layers?.world.children.indexOf(this.layers.nodeMarkers) ?? -1;
    const nodes = [...this.nodeParts.entries()].flatMap(([id, entry]) => {
      if (entry.kind !== 'castle' || !entry.part.container.visible) return [];
      const part = entry.part as CastleNodePart;
      const geometry = part.getPresentationGeometry();
      if (!geometry) return [];
      const pos = part.container.position;
      const selected =
        this.selectionRing?.container.visible &&
        this.selectionRing.container.position.x === pos.x &&
        this.selectionRing.container.position.y === pos.y;
      const tier = this.staticData?.castleTier?.[id] ?? 'main';
      const selectionRadius =
        (tier === 'main' ? MAPVIEW.hitRadius.castleMain : MAPVIEW.hitRadius.castleBranch) +
        SELECTION_RING_GEOMETRY.paddingRadius;
      const selectionPad = SELECTION_RING_GEOMETRY.strokeWidthPrimary / 2;
      const siege = [...this.siegeParts.entries()].find(
        ([, p]) =>
          p.container.visible &&
          p.container.position.x === pos.x &&
          p.container.position.y === pos.y,
      );
      const siegePad = SIEGE_MARKER_GEOMETRY.width / 2;
      const modelOrder = this.layers?.world.children.indexOf(this.layers.actorBodies) ?? -1;
      const modelMounted = part.depthBody.parent === this.layers?.actorBodies;
      return [
        {
          id,
          anchor: { x: pos.x * scale + transform.x, y: pos.y * scale + transform.y },
          body: rectAt(pos, geometry.body),
          painted: geometry.painted,
          bodyFrameKind: geometry.painted ? 'alphaContentFrame' : 'vectorNominal',
          modelOrder,
          durability: part.durabilityVisible ? rectAt(pos, geometry.durability) : null,
          warning: geometry.warning && part.warningVisible ? rectAt(pos, geometry.warning) : null,
          selection: selected
            ? {
                rect: rectAt(pos, {
                  x: -selectionRadius - selectionPad,
                  y:
                    SELECTION_RING_GEOMETRY.groundY -
                    selectionRadius * SELECTION_RING_GEOMETRY.groundAspect -
                    selectionPad,
                  width: 2 * (selectionRadius + selectionPad),
                  height:
                    2 * (selectionRadius * SELECTION_RING_GEOMETRY.groundAspect + selectionPad),
                }),
                behindBody:
                  this.selectionRing?.container.parent === this.castleGroundStatus &&
                  modelMounted &&
                  groundOrder < modelOrder,
              }
            : null,
          siege: siege
            ? {
                id: siege[0],
                rect: rectAt(pos, {
                  x: -SIEGE_MARKER_GEOMETRY.radius - siegePad,
                  y:
                    SIEGE_MARKER_GEOMETRY.groundY -
                    SIEGE_MARKER_GEOMETRY.radius * SIEGE_MARKER_GEOMETRY.groundAspect -
                    siegePad,
                  width: 2 * (SIEGE_MARKER_GEOMETRY.radius + siegePad),
                  height:
                    2 *
                    (SIEGE_MARKER_GEOMETRY.radius * SIEGE_MARKER_GEOMETRY.groundAspect + siegePad),
                }),
                behindBody:
                  siege[1].container.parent === this.castleGroundStatus &&
                  modelMounted &&
                  groundOrder < modelOrder,
              }
            : null,
        },
      ];
    });
    return { groundOrder, nodes };
  }

  private observeActorDepth() {
    const scale = this.camera?.getState().scale ?? 1;
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    }) ?? { x: 0, y: 0 };
    const models = this.layers?.actorBodies;
    return {
      modelLayerOrder: this.layers?.world.children.indexOf(models!) ?? -1,
      semanticLayerOrders: {
        castle: this.layers?.world.children.indexOf(this.layers.effects) ?? -1,
        army: this.layers?.world.children.indexOf(this.layers.armies) ?? -1,
      },
      bodies: (models?.children ?? []).map((body, order) => {
        const kind = body.label.startsWith('castle:') ? ('castle' as const) : ('army' as const);
        const id = body.label.slice(kind.length + 1);
        const part = kind === 'army' ? this.armyParts.get(id) : null;
        const node = kind === 'castle' ? this.nodeParts.get(id) : null;
        const rect =
          part?.getSoldierBounds() ??
          (node?.part as CastleNodePart | undefined)?.getPresentationGeometry()?.body ??
          null;
        const localScale = kind === 'army' ? body.scale.x : 1;
        return {
          id,
          kind,
          order,
          footY: body.position.y - (kind === 'army' ? body.scale.y : 0),
          visible: body.visible && rect !== null && rect.width > 0 && rect.height > 0,
          selected: kind === 'army' && this.view.armies.some((a) => a.id === id && a.selected),
          rect: rect
            ? {
                x: (body.position.x + rect.x * localScale) * scale + transform.x,
                y: (body.position.y + rect.y * localScale) * scale + transform.y,
                width: rect.width * localScale * scale,
                height: rect.height * localScale * scale,
              }
            : null,
        };
      }),
    };
  }

  /** Painted banner bounds exclude anchored headings, tethers, soldiers and plates. */
  private observeArmySignals() {
    const scale = this.camera?.getState().scale ?? 1;
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    }) ?? { x: 0, y: 0 };
    return [...this.armyParts.entries()].map(([id, part]) => {
      const profile = part.getPaintedProfile();
      const bounds = profile.signalBounds;
      const baseline = profile.signalBaselineBounds;
      const chip = part.container;
      const offset = part.getSignalOffset();
      const project = (rect: PlateRect | null) =>
        rect
          ? {
              x: (chip.position.x + rect.x * chip.scale.x) * scale + transform.x,
              y: (chip.position.y + rect.y * chip.scale.y) * scale + transform.y,
              width: rect.width * chip.scale.x * scale,
              height: rect.height * chip.scale.y * scale,
            }
          : null;
      return {
        id,
        painted: profile.painted,
        visible: chip.visible && (this.layers?.armies.visible ?? false),
        rect: project(bounds),
        baseline: project(baseline),
        offset: { x: offset.x * chip.scale.x * scale, y: offset.y * chip.scale.y * scale },
        anchor: {
          x: chip.position.x * scale + transform.x,
          y: chip.position.y * scale + transform.y,
        },
      };
    });
  }

  /** Actual annotation cell frames, not opaque glyph masks. Chip-local scale/offset is already applied. */
  private observeArmyAnnotations() {
    const scale = this.camera?.getState().scale ?? 1;
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    }) ?? { x: 0, y: 0 };
    return [...this.armyParts.entries()].flatMap(([id, part]) => {
      const frames = part.getAnnotationFrames();
      if (!frames) return [];
      const chip = part.container;
      const visible = chip.visible && (this.layers?.armies.visible ?? false) && frames.visible;
      const project = (rect: PlateRect | null) =>
        rect
          ? {
              x: (chip.position.x + rect.x * chip.scale.x) * scale + transform.x,
              y: (chip.position.y + rect.y * chip.scale.y) * scale + transform.y,
              width: rect.width * chip.scale.x * scale,
              height: rect.height * chip.scale.y * scale,
            }
          : null;
      return [
        {
          id,
          visible,
          anchor: {
            x: chip.position.x * scale + transform.x,
            y: chip.position.y * scale + transform.y,
          },
          relation: {
            ...frames.relation,
            rect: project(frames.relation.rect),
            visible: visible && frames.relation.visible,
          },
          state: {
            ...frames.state,
            rect: project(frames.state.rect),
            visible: visible && frames.state.visible,
          },
          supply: {
            ...frames.supply,
            rect: project(frames.supply.rect),
            visible: visible && frames.supply.visible,
          },
          number: {
            ...frames.number,
            rect: project(frames.number.rect),
            visible: visible && frames.number.visible,
          },
        },
      ];
    });
  }

  /** Points supplied to the actual lake Graphics path; not bathymetry or a pixel mask. */
  private observeLakeRendering() {
    const scale = this.camera?.getState().scale ?? 1;
    const transform = this.camera?.getWorldTransform({
      width: this.app?.screen.width ?? 0,
      height: this.app?.screen.height ?? 0,
    }) ?? { x: 0, y: 0 };
    return {
      visible:
        (this.waterFeatures?.container.visible ?? false) &&
        (this.layers?.waterFeatures.visible ?? false),
      materials: this.waterFeatures?.getMaterialDiagnostics() ?? {
        ownedTextures: 0,
        ownedSources: 0,
        ownedStyleListeners: 0,
        rgbaBytes: 0,
        lakes: [],
      },
      lakes: (this.waterFeatures?.getLakeGeometry() ?? []).map((lake) => ({
        id: lake.id,
        originalBounds: { ...lake.originalBounds },
        worldPoints: lake.points.map((point) => ({ ...point })),
        points: lake.points.map((point) => ({
          x: point.x * scale + transform.x,
          y: point.y * scale + transform.y,
        })),
      })),
    };
  }

  getRiverPureBoundsProbe(firstId: string, secondId: string) {
    return this.waterFeatures?.getRiverPureBoundsProbe(firstId, secondId) ?? null;
  }

  getRiverRuntimeIdentityProbe(
    ...args: Parameters<ReturnType<typeof createWaterFeatures>['getRiverRuntimeIdentityProbe']>
  ) {
    return this.waterFeatures?.getRiverRuntimeIdentityProbe(...args) ?? null;
  }

  /** Debug-only paired paint capture; returns the exact prior visibility for restoration. */
  setRoadPaintVisibilityForDiagnostics(visible: boolean): boolean {
    if (typeof visible !== 'boolean') throw new Error('Road paint visibility must be boolean');
    if (this.roadsLayer === null) throw new Error('Road paint layer is not mounted');
    const previous = this.roadsLayer.container.visible;
    this.roadsLayer.container.visible = visible;
    return previous;
  }

  /** Debug-only paired water paint capture; restores the retained container without rebuilding. */
  setWaterPaintVisibilityForDiagnostics(visible: boolean): boolean {
    if (typeof visible !== 'boolean') throw new Error('Water paint visibility must be boolean');
    if (this.waterFeatures === null) throw new Error('Water paint layer is not mounted');
    const previous = this.waterFeatures.container.visible;
    this.waterFeatures.container.visible = visible;
    return previous;
  }

  /** Debug-only hero paint comparison; ground materials retain their coastal clip. */
  setMountainHeroVisibilityForDiagnostics(visible: boolean): boolean {
    if (typeof visible !== 'boolean') throw new Error('Mountain hero visibility must be boolean');
    if (this.mountainRaster === null) throw new Error('Mountain hero layer is not mounted');
    const previous = this.mountainRaster.container.visible;
    this.mountainRaster.container.visible = visible;
    return previous;
  }

  getDiagnostics() {
    this.flushScreenLayouts();
    const visibleDrawables = (container: Container): number => {
      if (!container.visible || !container.renderable || container.alpha <= 0) return 0;
      let own = 0;
      if (container instanceof Graphics) own = container.context.instructions.length > 0 ? 1 : 0;
      else if (container instanceof BitmapText) own = container.text.length > 0 ? 1 : 0;
      else if (container instanceof Mesh) {
        const geometry: unknown = container.geometry;
        own = geometry instanceof Geometry && (geometry.indexBuffer?.data.length ?? 0) >= 3 ? 1 : 0;
      } else if (container instanceof Sprite) own = 1;
      // A drawable can also own children: a hidden tether must not erase its
      // parent's live far-LOD flag from the observed layer count.
      return container.children.reduce((total, child) => total + visibleDrawables(child), own);
    };
    const counts = this.rebuildCounts;
    const riverMaterials = this.waterFeatures?.getRiverMaterialDiagnostics() ?? {
      ownedTextures: 0,
      ownedSources: 0,
      ownedStyleListeners: 0,
      ownedMaskGraphics: 0,
      ownedDisplayGraphics: 0,
      rgbaBytes: 0,
      rivers: [],
    };
    const rebuildByLayer: Partial<Record<(typeof LAYER_ORDER)[number], number>> = {
      roads: counts.roads,
      labels: counts.labels,
      nodeMarkers: counts.nodeMarkers,
      territory: counts.territory,
      armies: counts.armyChips,
      nameplates: counts.nameplates,
      analysisOverlay: this.analysisOverlay?.redraws ?? 0,
    };
    return {
      ready: this.isReady(),
      elevationRendering: {
        active: this.sceneProjection !== null,
        error: this.terrainProjectionError,
        field: this.sceneProjection?.bounds ?? null,
        surface: this.elevatedSurface?.getDiagnostics() ?? null,
        territory: this.territoryProjectedOverlay?.getDiagnostics() ?? null,
        territoryAlpha: this.territorySprite?.alpha ?? null,
        analysis: this.analysisOverlay?.getProjectionDiagnostics() ?? null,
        canopy: this.projectedCanopy?.getDiagnostics() ?? null,
        foothillCanopy: this.foothillCanopy?.getDiagnostics() ?? null,
        roads: this.roadsLayer?.getProjectionDiagnostics() ?? [],
        nodes: [...this.nodeParts].map(([id, entry]) => ({
          id,
          canonical: { ...this.staticData!.graph.nodes.get(id as never)!.pos },
          scene: { x: entry.part.container.position.x, y: entry.part.container.position.y },
        })),
        armies: [...this.armyParts].map(([id, part]) => ({
          id,
          scene: { x: part.container.position.x, y: part.container.position.y },
        })),
      },
      lodStage: this.lodStage,
      armyPlateLayout: this.observeArmyPlateLayout(),
      castleRibbonLayout: this.observeCastleRibbonLayout(),
      geographicLabelLayout: this.observeGeographicLabelLayout(),
      castleRendering: this.observeCastleRendering(),
      ...(this.settlements
        ? {
            settlementRendering: {
              ...this.settlements.getDiagnostics(),
              constraints: { obstacles: this.settlementObstacles, crests: this.settlementCrests },
              geometry: this.settlements.getGeometry(),
              sceneGeometry: this.settlements.getSceneGeometry(),
              stage: this.lodStage,
            },
          }
        : {}),
      actorDepth: this.observeActorDepth(),
      waterRendering: this.observeLakeRendering(),
      riverRendering: {
        visible:
          (this.waterFeatures?.container.visible ?? false) &&
          (this.layers?.waterFeatures.visible ?? false),
        classes: [3, 2, 1].map((widthClass, index) => ({
          widthClass,
          visible: this.waterFeatures?.container.children[index + 1]?.visible ?? false,
        })),
        materials: riverMaterials,
        boundsTrace: this.waterFeatures?.getRiverBoundsTrace(riverMaterials.rivers) ?? [],
      },
      seaRendering: this.seaSurface?.getDiagnostics() ?? null,
      // Copies of the polygons submitted to sea land-fill and the real ground mask,
      // not canonical geography or an independent claim about opaque pixels.
      coastRendering: {
        surface: this.coastSurface?.getDiagnostics() ?? null,
        displayPolygons: this.app
          ? this.emittedSeaPolygons.map((polygon) => ({
              id: polygon.id,
              points: [...polygon.points],
            }))
          : [],
        groundClipPolygons: this.app
          ? (this.groundSurface?.polygons ?? []).map((polygon) => ({
              id: polygon.id,
              points: [...polygon.points],
            }))
          : [],
      },
      armyRendering: {
        signalLayoutRuns: this.armySignalLayoutRuns,
        signals: this.observeArmySignals(),
        annotations: this.observeArmyAnnotations(),
        viewCount: this.view.armies.length,
        mounted: this.armyParts.size,
        visibleDrawableArmies: [...this.armyParts.values()].filter(
          (part) => this.layers?.armies.visible && visibleDrawables(part.container) > 0,
        ).length,
        collapsed: this.collapsedArmyIds.size,
      },
      analysisMode: this.view.analysisMode,
      analysisOpacity: this.analysisOpacity,
      effects: {
        fieldContacts: [...this.battleSparks.keys()].filter((key) => key.startsWith('field:'))
          .length,
        assaultEmitters: [...this.battleSparks.keys()].filter((key) => key.startsWith('siege:'))
          .length,
        activeParticles: this.particlePool?.activeCount ?? 0,
        particleCapacity: this.particlePool?.capacity ?? 0,
        motionBlocked: this.reducedMotion,
      },
      layers: Object.fromEntries(
        LAYER_ORDER.map((key) => [
          key,
          {
            children: this.layers?.[key].children.length ?? 0,
            visible: this.layers?.[key].visible ?? false,
            visibleDrawables: this.layers === null ? 0 : visibleDrawables(this.layers[key]),
            dirty: key === 'territory' && this.territoryDirty,
            rebuildCount: rebuildByLayer[key] ?? 0,
          },
        ]),
      ),
      resources: {
        // Historical territory/analysis subset, not all GPU textures. Lake and river ownership are explicit below.
        ownedTextures:
          Number(this.territoryTexture !== null) + (this.analysisOverlay?.ownedTextures ?? 0),
        ownedWaterTextures: this.waterFeatures?.getMaterialDiagnostics().ownedTextures ?? 0,
        ownedWaterSources: this.waterFeatures?.getMaterialDiagnostics().ownedSources ?? 0,
        waterRgbaBytes: this.waterFeatures?.getMaterialDiagnostics().rgbaBytes ?? 0,
        waterStyleListeners: this.waterFeatures?.getMaterialDiagnostics().ownedStyleListeners ?? 0,
        ownedRiverTextures: riverMaterials.ownedTextures,
        ownedRiverSources: riverMaterials.ownedSources,
        riverRgbaBytes: riverMaterials.rgbaBytes,
        riverStyleListeners: riverMaterials.ownedStyleListeners,
        ownedRiverMaskGraphics: riverMaterials.ownedMaskGraphics,
        ownedRiverDisplayGraphics: riverMaterials.ownedDisplayGraphics,
        ownedSeaTextures: this.seaSurface?.getDiagnostics().ownedTextures ?? 0,
        ownedSeaSources: this.seaSurface?.getDiagnostics().ownedSources ?? 0,
        seaRgbaBytes: this.seaSurface?.getDiagnostics().rgbaBytes ?? 0,
        ownedCoastTextures: this.coastSurface?.getDiagnostics().ownedTextures ?? 0,
        ownedCoastSources: this.coastSurface?.getDiagnostics().ownedSources ?? 0,
        ownedCoastGeometries: this.coastSurface?.getDiagnostics().ownedGeometries ?? 0,
        ownedElevatedMeshes: this.elevatedSurface?.getDiagnostics().ownedMeshes ?? 0,
        ownedElevatedGeometries: this.elevatedSurface?.getDiagnostics().ownedGeometries ?? 0,
        ownedElevatedBuffers: this.elevatedSurface?.getDiagnostics().ownedBuffers ?? 0,
        ownedElevatedShaders: this.elevatedSurface?.getDiagnostics().ownedShaders ?? 0,
        ownedElevatedPrograms: this.elevatedSurface?.getDiagnostics().ownedPrograms ?? 0,
        elevatedBufferBytes: this.elevatedSurface?.getDiagnostics().bufferBytes ?? 0,
        ownedCanopyMeshes: this.projectedCanopy?.getDiagnostics().ownedMeshes ?? 0,
        ownedCanopyGeometries: this.projectedCanopy?.getDiagnostics().ownedGeometries ?? 0,
        ownedCanopyBuffers: this.projectedCanopy?.getDiagnostics().ownedBuffers ?? 0,
        canopyBufferBytes: this.projectedCanopy?.getDiagnostics().bufferBytes ?? 0,
        ownedFoothillMeshes: this.foothillCanopy?.getDiagnostics().ownedMeshes ?? 0,
        ownedFoothillGeometries: this.foothillCanopy?.getDiagnostics().ownedGeometries ?? 0,
        ownedFoothillBuffers: this.foothillCanopy?.getDiagnostics().ownedBuffers ?? 0,
        ownedFoothillShaders: this.foothillCanopy?.getDiagnostics().ownedShaders ?? 0,
        ownedFoothillPrograms: this.foothillCanopy?.getDiagnostics().ownedPrograms ?? 0,
        foothillBufferBytes: this.foothillCanopy?.getDiagnostics().bufferBytes ?? 0,
        coastRgbaBytes: this.coastSurface?.getDiagnostics().rgbaBytes ?? 0,
        coastGeometryBytes: this.coastSurface?.getDiagnostics().geometryBytes ?? 0,
        ownedMountainShadeTextures: this.mountainRaster?.getShadeDiagnostics().ownedTextures ?? 0,
        ownedMountainShadeSources: this.mountainRaster?.getShadeDiagnostics().ownedSources ?? 0,
        mountainShadeRgbaBytes: this.mountainRaster?.getShadeDiagnostics().rgbaBytes ?? 0,
        sharedTerrainSprites:
          Number(this.reliefSprite !== null) + Number(this.forestSprite !== null),
        // Six stage listeners, resize, ticker, wheel, native cancel and window blur.
        eventListeners: this.registeredListenerCount,
      },
      ticker: { fps: this.app?.ticker.FPS ?? 0, deltaMS: this.app?.ticker.deltaMS ?? 0 },
    };
  }

  /** 是否已完成 init 且未 destroy。 */
  isReady(): boolean {
    return this.initialized && this.app !== null;
  }
}
