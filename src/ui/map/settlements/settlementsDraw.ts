// 城下聚落 —— 程序生成屋頂群＋田畦（低對比城下地景），僅繞本城，close LOD 顯示。
//
// 規格：docs/design/m6-v7-castles.md CD4（城下聚落＝程序生成 runtime Graphics，seeded、決定論、
// 只繞本城、close LOD）、§3.4（`SETTLEMENT` 常數）、§4.1（本檔完整簽章／行為）、§6.4（繪製幾何總表）；
// plan/12-ui-components.md §3.3（沿用「一檔一元件」慣例，本檔非 `ScenePart<P>` 工廠——聚落靜態
// 一次建、無 props 更新，見下）。
//
// 範圍：
// - `settlementSeed(id)`：城 id 純字串 hash（FNV-1a 變體）→ 32-bit 整數種子。無 `Math.random`／
//   `Date.now`（CLAUDE.md 鐵律①；core 純度規則雖只硬性規範 `src/core/`，本檔仍依循同一決定論
//   紀律，因其輸出須跨平台 byte 穩定、進 Playwright 視覺 baseline）。
// - `drawSettlementCluster(g, center, seed)`：以 NR-LCG（Numerical Recipes 線性同餘常數，純整數
//   運算）逐步推進，於城周半徑環 `[SETTLEMENT.innerR, SETTLEMENT.outerR]` 內散佈屋頂／田畦；
//   同一 `seed` 兩次呼叫之繪製指令序 byte-identical（§8.1 驗收）。
// - `buildSettlements(graph, castleTier)`：只對本城（`castleTier[id]==='main'`）建聚落，依節點
//   id 字典序處理（決定論）；回傳單一 `container`（內含單一 `Graphics`）＋`destroy()`。無
//   `update()`——聚落靜態（owner 變更不移動，CD4：「聚落靜態 → 不進任何 rebuildCounts」），
//   `MapRenderer` 於 `buildStaticDataLayers` 建一次、以 `layers.settlements.visible` 切 LOD 顯隱。
//
// `innerR=22 ≥ castleNode.ts 之 ringRadiusMain(20)`（審查 #6 修正）：確保屋頂/田畦不侵入耐久環與
// 城體本身；本檔不 import `CASTLE_NODE_GEOMETRY`（切片互斥，Slice B 擁有 castleNode.ts），
// `SETTLEMENT.innerR` 為獨立具名常數，其下限已於設計文件對照驗證。

import { Container, Graphics } from 'pixi.js';
import type { CastleTier } from '@core/state/enums';
import type { MapGraph } from '@core/state/mapGraph';
import { MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';

/** §3.4 表：城下聚落幾何／散佈範圍（world unit）。渲染常數，非 BAL（12-T… 慣例，見 castleNode.ts 同款裁決）。 */
export const SETTLEMENT = {
  roofCount: 6,
  roofW: 5,
  roofH: 3,
  roofAlpha: 0.55,
  roofStrokeAlpha: 0.35,
  roofStrokeWidth: 0.75,
  furrowCount: 4,
  furrowLength: 8,
  furrowAlpha: 0.3,
  furrowWidth: 0.75,
  innerR: 22, // ≥ castleNode.ts 之 ringRadiusMain(20)，屋頂/田畦不侵入耐久環/城體（審查 #6）
  outerR: 42, // 屋頂/田畦散佈環
} as const;

export interface Settlements {
  readonly container: Container;
  destroy(): void;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * 城 id 純字串 hash → seed（FNV-1a 變體，32-bit 無號整數；決定論，無 `Math.random`／`Date.now`，CD4）。
 * 純整數運算（`Math.imul`），跨平台 byte 穩定。
 */
export function settlementSeed(id: string): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

const LCG_MULTIPLIER = 1664525; // Numerical Recipes ranqd1 常數
const LCG_INCREMENT = 1013904223;
const UINT32_MOD = 4294967296; // 2^32

/**
 * 由 seed 建立一個 NR-LCG 產生器：每呼叫一次推進一步狀態、回傳 `[0,1)` 浮點數。
 * 純整數運算（`Math.imul` + `>>> 0`），無 `Math.random`；同一 seed 之呼叫序列恆產生同一序列
 * （供 `drawSettlementCluster` 之決定論散佈）。
 */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return state / UINT32_MOD;
  };
}

/**
 * 對稱平行四邊形頂點（局部座標，中心＝`(cx,cy)`，外接盒約 `w×h`，向右上斜切）。
 * 對稱斜切使四頂點平均值精確等於 `(cx,cy)`（供測試以頂點平均值反推散佈半徑）。
 */
function parallelogramPoints(cx: number, cy: number, w: number, h: number): number[] {
  const halfW = w / 2;
  const halfH = h / 2;
  const skewHalf = (w * 0.3) / 2;
  return [
    cx - halfW - skewHalf,
    cy + halfH,
    cx + halfW - skewHalf,
    cy + halfH,
    cx + halfW + skewHalf,
    cy - halfH,
    cx - halfW + skewHalf,
    cy - halfH,
  ];
}

/**
 * 純繪製函式（可 `makeRec` 單測）：在 `g` 上以 `seed` 畫一座本城之屋頂群＋田畦（局部＝世界座標，
 * 繪於 `center` 周圍）。`SETTLEMENT.roofCount` 枚屋頂（平行四邊形，`plainLight` 填＋`ink700` 描）＋
 * `SETTLEMENT.furrowCount` 條田畦（短線，`reliefInk` 描），皆以極座標 `(r∈[innerR,outerR], θ∈[0,2π))`
 * 由 NR-LCG 決定位置，全程不呼叫 `g.clear()`（呼叫端 `buildSettlements` 只建一次、不重繪）。
 */
export function drawSettlementCluster(
  g: Graphics,
  center: { x: number; y: number },
  seed: number,
): void {
  const next = makeLcg(seed);
  const {
    roofCount,
    roofW,
    roofH,
    roofAlpha,
    roofStrokeAlpha,
    roofStrokeWidth,
    furrowCount,
    furrowLength,
    furrowAlpha,
    furrowWidth,
    innerR,
    outerR,
  } = SETTLEMENT;

  for (let i = 0; i < roofCount; i += 1) {
    const r = innerR + next() * (outerR - innerR);
    const theta = next() * Math.PI * 2;
    const cx = center.x + r * Math.cos(theta);
    const cy = center.y + r * Math.sin(theta);
    g.poly(parallelogramPoints(cx, cy, roofW, roofH))
      .fill({ color: MAP_PALETTE_NUM.plainLight, alpha: roofAlpha })
      .stroke({ width: roofStrokeWidth, color: TOKENS_NUM.ink700, alpha: roofStrokeAlpha });
  }

  for (let i = 0; i < furrowCount; i += 1) {
    const r = innerR + next() * (outerR - innerR);
    const theta = next() * Math.PI * 2;
    const cx = center.x + r * Math.cos(theta);
    const cy = center.y + r * Math.sin(theta);
    const dir = next() * Math.PI * 2;
    const dx = (Math.cos(dir) * furrowLength) / 2;
    const dy = (Math.sin(dir) * furrowLength) / 2;
    g.moveTo(cx - dx, cy - dy)
      .lineTo(cx + dx, cy + dy)
      .stroke({ width: furrowWidth, color: MAP_PALETTE_NUM.reliefInk, alpha: furrowAlpha });
  }
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 建城下聚落：僅繞本城（`castleTier[id]==='main'`）；屋頂群＋田畦，seeded 散佈於 `[innerR,outerR]` 環。
 * 靜態一次建（無 `update()`）；LOD 顯隱由 `MapRenderer` 切 `layers.settlements.visible`。
 * 決定論：城依 id 字典序（`compareId`，非 locale-dependent `localeCompare`）處理。
 */
export function buildSettlements(
  graph: MapGraph,
  castleTier: Readonly<Record<string, CastleTier>>,
): Settlements {
  const container = new Container();
  container.label = 'settlements';
  const gfx = new Graphics();
  container.addChild(gfx);

  const nodes = [...graph.nodes.values()].sort((a, b) => compareId(a.id, b.id));
  for (const node of nodes) {
    if (node.kind !== 'castle' || castleTier[node.id] !== 'main') continue;
    drawSettlementCluster(gfx, node.pos, settlementSeed(node.id));
  }

  return {
    container,
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
