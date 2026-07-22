// 地圖 dirty-update 純函式：nodeMarkers owner 結構 diff ＋ armies 內插參數（04 §4.6）。
//
// 規格：M6-V4 技術設計 §3.3.3（buildOwnerByNode／diffOwnerByNode）、§3.2（armyWorldPos／
// stackKey，決策 D6：renderer 端內插，selector 座標無關）；補遺 AD-V4-4：`armyWorldPos`／
// `stackKey` 抽成本檔純函式，逐字等價改前 `MainScreen.tsx` L139-149 內插語意
// （`edgeCostDays<=0→edgeT=0`、`toNode===null→回 from`、`stackKey=edgeT===0?fromNode:id`）。
//
// 本檔不 import pixi.js、不持有狀態，可在 node 測試環境直接單元測試（同 mapDraw.ts 慣例）。

import type { MapGraph } from '@core/state/mapGraph';

/** `buildOwnerByNode` 消費之最小 view 形狀（`castles[]`＋`districtOwner`，見 `MapViewState`）。 */
export interface OwnerByNodeView {
  readonly castles: readonly { readonly id: string; readonly ownerClanId: string }[];
  readonly districtOwner: Readonly<Record<string, string | null>>;
}

/**
 * 由 view 建立當前 nodeId→ownerClanId（`|null`）查表（城與郡併入同一張 Map）。
 * 純函式；供 `diffOwnerByNode` 與 `MapRenderer.applyOwnerDirty` 共用單一真相。
 */
export function buildOwnerByNode(view: OwnerByNodeView): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const c of view.castles) m.set(c.id, c.ownerClanId);
  for (const [id, owner] of Object.entries(view.districtOwner)) m.set(id, owner ?? null);
  return m;
}

/**
 * `prev===null` 視為「全部 dirty」（初次上色，見 renderer `setMapData` 後 `prevOwnerByNode=null`
 * 的首繪保證）；否則回傳 owner 相對 prev 真的變了的 nodeId 集合。`day`／其餘欄位一律不參與比對
 * （day 誤觸 diff 為本階段最易犯錯處之一，見設計 §11.4）。
 */
export function diffOwnerByNode(
  prev: ReadonlyMap<string, string | null> | null,
  next: ReadonlyMap<string, string | null>,
): Set<string> {
  const dirty = new Set<string>();
  if (prev === null) {
    for (const k of next.keys()) dirty.add(k);
    return dirty;
  }
  for (const [id, owner] of next) {
    if (prev.get(id) !== owner) dirty.add(id);
  }
  return dirty;
}

/**
 * 節點視覺簽章之 view 子集（城／郡；M6-V7 CD1／§3.5）。城簽章欄位＝影響繪製之欄位：
 * owner／耐久（durability/maxDurability）／warning（烽火/裂口/光暈）／terrainKind（平/山城剪影）／
 * tier；郡簽章＝owner／steward／subjugation／ikki。**`day` 一律不入簽章**（day-only tick 零重畫）。
 */
export interface NodeSigView {
  readonly castles: readonly {
    readonly id: string;
    readonly ownerClanId: string;
    readonly durability: number;
    readonly maxDurability: number;
    readonly tier: string;
    readonly warning: string;
    readonly terrainKind: string;
  }[];
  readonly districtOwner: Readonly<Record<string, string | null>>;
  readonly districts?: readonly {
    readonly id: string;
    readonly hasSteward: boolean;
    readonly subjugationProgress: number | null;
    readonly ikkiActive: boolean;
  }[];
}

/**
 * 每節點視覺簽章字串（純函式；供 `diffNodeSig` 與 `MapRenderer.applyOwnerDirty` 之節點重繪 diff）。
 * - 城：`c|owner|dur/max|warning|terrainKind|tier`
 * - 郡：`d|owner|steward|subj|ikki`（owner 取 `districtOwner`；次級狀態取 `districts[]`，缺省視同
 *   直轄/無制壓/非一揆）。**day 不參與**（day-only 變更不改任何簽章 → 零重畫）。
 */
export function buildNodeSig(view: NodeSigView): Map<string, string> {
  const sig = new Map<string, string>();
  for (const c of view.castles) {
    sig.set(
      c.id,
      `c|${c.ownerClanId}|${c.durability}/${c.maxDurability}|${c.warning}|${c.terrainKind}|${c.tier}`,
    );
  }
  const districtState = new Map<
    string,
    { hasSteward: boolean; subjugationProgress: number | null; ikkiActive: boolean }
  >();
  for (const d of view.districts ?? []) districtState.set(d.id, d);
  for (const [id, owner] of Object.entries(view.districtOwner)) {
    const d = districtState.get(id);
    const steward = d?.hasSteward ?? false;
    const subj = d?.subjugationProgress ?? null;
    const ikki = d?.ikkiActive ?? false;
    sig.set(id, `d|${owner ?? ''}|${steward}|${subj ?? ''}|${ikki}`);
  }
  return sig;
}

/**
 * `prev===null` 視為「全部 dirty」（首繪保證，比照 `diffOwnerByNode`；見 renderer `setMapData` 後
 * `prevNodeSig=null`）；否則回傳簽章相對 prev 相異之 nodeId 集合。
 */
export function diffNodeSig(
  prev: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
): Set<string> {
  const dirty = new Set<string>();
  if (prev === null) {
    for (const k of next.keys()) dirty.add(k);
    return dirty;
  }
  for (const [id, s] of next) {
    if (prev.get(id) !== s) dirty.add(id);
  }
  return dirty;
}

/**
 * 名牌簽章之 view 子集（M6-V9b §2.9，DD-A0／評審 Blocker 1）：城名牌走**獨立簽章與獨立 diff
 * loop**，與 `buildNodeSig`/`castleNode` 完全分離——node 簽章不含 soldiers/relation/isPlayer/name，
 * 若名牌騎 node 簽章，「只兵數變」的 tick 名牌永不刷新（stale）；反之把 soldiers 塞進 node 簽章
 * 會污染 `rebuildCounts.nodeMarkers`。`soldiers`/`relation`/`isPlayer` 為 UI 邊界推導欄
 * （`composeMapViewState` 注入，§1.3 army-relation 先例）。
 */
export interface NameplateSigView {
  readonly castles: readonly {
    readonly id: string;
    readonly ownerClanId: string;
    readonly tier: string;
    readonly warning: string;
    readonly soldiers: number;
    readonly relation: string;
    readonly isPlayer: boolean;
  }[];
}

/**
 * 每城名牌視覺簽章（M6-V9b §2.9）：
 * `n|owner|tier|name|warning|relation|isPlayer|soldiers`——**含 soldiers/relation/isPlayer/name**
 * （node 簽章所無），故兵數/關係/我方旗標任一變即命中 diff。pos 不入簽章（移動另判 reposition）；
 * `day` 一律不參與（day-only tick 零重畫）。`names` 為靜態顯示名查表（`MapStaticData.names`，
 * 城名不在 view-model 內故由呼叫端供給；缺名以空字串入章）。
 */
export function buildNameplateSig(
  view: NameplateSigView,
  names: Readonly<Record<string, string>> = {},
): Map<string, string> {
  const sig = new Map<string, string>();
  for (const c of view.castles) {
    sig.set(
      c.id,
      `n|${c.ownerClanId}|${c.tier}|${names[c.id] ?? ''}|${c.warning}|${c.relation}|${c.isPlayer}|${c.soldiers}`,
    );
  }
  return sig;
}

/**
 * `prev===null` 視為「全部 dirty」（首繪保證，見 renderer `setMapData` 後 `prevNameplateSig=null`）；
 * 否則回傳簽章相異之城 id 集合。與 `diffNodeSig` 同結構（§2.9「可共用泛型 diff」——直接委派）。
 */
export function diffNameplateSig(
  prev: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
): Set<string> {
  return diffNodeSig(prev, next);
}

/** `armyWorldPos` 消費之最小欄位（`MapArmyView` 位置相關子集）。 */
export interface ArmyPosInput {
  readonly fromNode: string;
  readonly toNode: string | null;
  readonly edgeT: number;
}

/**
 * 由 `fromNode`/`toNode`/`edgeT` 內插世界座標（renderer 端內插，決策 D6）。逐字等價改前
 * `MainScreen.tsx`（V4 前）L139-149：`toNode===null`（含 `edgeCostDays<=0` 已於 selector 端 clamp
 * 為 `edgeT<=0`）→回傳 `from`；否則沿 `from→to` 依 `edgeT` 線性插值。查無節點時退回 `(0,0)`
 * （防禦；正常資料不會發生，`graph` 未載入——例如尚未 `setMapData`——時亦走此分支）。
 */
export function armyWorldPos(army: ArmyPosInput, graph: MapGraph): { x: number; y: number } {
  const from = graph.nodes.get(army.fromNode as never)?.pos ?? { x: 0, y: 0 };
  if (army.toNode === null || army.edgeT <= 0) return from;
  const to = graph.nodes.get(army.toNode as never)?.pos;
  if (to === undefined) return from;
  return { x: from.x + (to.x - from.x) * army.edgeT, y: from.y + (to.y - from.y) * army.edgeT };
}

/**
 * `stackKey` 導出（UI 疊放概念，不進 core 契約）：`edgeT===0` 時用 `fromNode`（同節點多支部隊
 * 疊放），否則用 army `id`（行軍中途不與他人共疊，逐字等價改前 `MainScreen` 之
 * `edgeT===0?army.posNodeId:army.id`）。
 */
export function armyStackKey(army: {
  readonly id: string;
  readonly fromNode: string;
  readonly edgeT: number;
}): string {
  return army.edgeT === 0 ? army.fromNode : army.id;
}
