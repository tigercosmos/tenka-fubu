// CastleNode —— 城節點場景元件（城格差異＋耐久環）。
//
// 規格：plan/12-ui-components.md §3.3.2（原樣依循：本城/支城剪影尺寸與填框、耐久環半徑/線寬/
// 起角/掃角/變色門檻/底環）、§5.6（`drawRing` 耐久環通用弧公式）、§4（`ScenePart<P>` 工廠介面）。
// 18-roadmap.md M2-16（12-T10 部分）。
//
// 範圍（本批次）：
// - 已實作：本城/支城剪影（尺寸、填色、描邊）、耐久環（半徑/線寬/起角/掃角/三段變色門檻/
//   底環透明度）——皆為 §3.3.2 表中可逐項驗算的靜態繪製參數。
// - деferred（未在本批次實作，留待後續里程碑）：
//   - 名標（BitmapText＋halo）：字型 atlas 生成管線（Noto Serif TC 預烘焙）尚未建置
//     （04 §3.10.1 圖層 7「labels」現況仍為空容器，M2-13 骨架已載明），本檔暫不畫名標。
//   - 被圍疊 SiegeMarker（§3.3.8）、落城瞬間補間＋煙塵粒子：兩者皆屬 M4-12／M5-7
//     （sceneParts ArmyChip/PathPreview/SiegeMarker、戰場特效）里程碑範圍。
//   - 耐久環 300ms 補間、鏡頭縮小隱藏支城名標的 LOD 開關：兩者皆需要一個逐幀 ticker
//     （Pixi `Application.ticker`／`MapRenderer` 尚未整合本檔，見 M2-13 檔頭「取代骨架占位」
//     記錄）；本檔 `update(props)` 僅重繪「目前 props 所描述的終態」，供未來整合時每幀/每次
//     狀態變更呼叫（12 §4：「update 冪等；只在 props 變更時改繪」）。
//
// 純繪製 helper（`drawCastleNode`）僅使用 `Graphics` 的繪製方法子集，可在 node 測試環境以
// 「錄製用 mock」驗證繪製指令序列與參數（無需 Pixi 執行期，17 §3.2；沿用 M2-13 mapDraw.ts 慣例）。
// 工廠函式（`createCastleNode`）另建立真正的 Pixi `Container`/`Graphics` 供整合期使用；
// 建構 `Container`/`Graphics` 本身不需要 WebGL/DOM，可在 Vitest node 環境下安全執行。

import { Container, Graphics } from 'pixi.js';
import type { CastleTier } from '@core/state/enums';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import type { ScenePart } from '@ui/components/types';

/** §3.3.2 表：本城/支城剪影尺寸（world unit，正方形外接盒邊長）、描邊、耐久環幾何。 */
export const CASTLE_NODE_GEOMETRY = {
  mainSize: 28, // 本城：雙層屋簷剪影 28×28
  branchSize: 20, // 支城：單層櫓剪影 20×20
  strokeWidth: 2, // 剪影描邊線寬（本城/支城同）
  ringRadiusMain: 20, // 耐久環半徑：本城 20
  ringRadiusBranch: 15, // 耐久環半徑：支城 15
  ringWidth: 3, // 耐久環線寬
  ringBaseAlpha: 0.25, // 底環透明度
} as const;

export interface CastleNodeProps {
  /** 世界座標（供工廠將 `container.position` 對齊；純繪製函式不消費本欄位，剪影恆繪於局部原點）。 */
  readonly pos: { readonly x: number; readonly y: number };
  readonly tier: CastleTier; // 城格（02 §4.5 `Castle.tier`）
  /** 城主勢力色索引（`Clan.colorIndex` 0..39；Castle.ownerClanId 依 INV-02 恆存在，故不接受 null）。 */
  readonly colorIndex: number;
  readonly durability: number; // 02 §4.5 `Castle.durability`
  readonly maxDurability: number; // 02 §4.5 `Castle.maxDurability`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 本城剪影：9 頂點「雙層屋簷」外接盒 size×size（局部座標，中心為原點）。 */
function mainKeepPoints(size: number): number[] {
  const half = size / 2;
  const y1 = half - size * 0.35; // 下層屋簷高度
  const y2 = half - size * 0.7; // 上層屋簷高度
  const w2 = size * 0.32; // 上層（第二層）身寬半徑
  return [
    -half,
    half, // 左下
    half,
    half, // 右下
    half,
    y1, // 右側上至下層簷
    w2,
    y1, // 內縮（下層簷緣）
    w2,
    y2, // 右側上至上層簷
    0,
    -half, // 屋頂尖
    -w2,
    y2, // 左側上層簷
    -w2,
    y1, // 外擴（下層簷緣）
    -half,
    y1, // 左側下層簷
  ];
}

/** 支城剪影：5 頂點「單層櫓」外接盒 size×size（局部座標，中心為原點）。 */
function branchKeepPoints(size: number): number[] {
  const half = size / 2;
  const y1 = half - size * 0.55; // 身高
  return [-half, half, half, half, half, y1, 0, -half, -half, y1];
}

/** 耐久環色（12 §5.6）：ratio 三段門檻決定；不含底環。 */
function durabilityRingColor(ratio: number): number {
  if (ratio > UI.durabilityRingWarn) return TOKENS_NUM.accentMossBright;
  if (ratio > UI.durabilityRingDanger) return TOKENS_NUM.accentGold;
  return TOKENS_NUM.accentVermilionBright;
}

/**
 * 繪製耐久環（12 §5.6 `drawRing` 通用弧＋§3.3.2 底環）：先畫底環（`ink300` 25% 透明度整圈），
 * 再疊「12 點鐘起順時針」的比例弧（三段變色）。不呼叫 `g.clear()`（由呼叫端統一收尾）。
 */
function drawDurabilityRing(g: Graphics, radius: number, ratio: number): void {
  const width = CASTLE_NODE_GEOMETRY.ringWidth;
  g.circle(0, 0, radius).stroke({
    width,
    color: TOKENS_NUM.ink300,
    alpha: CASTLE_NODE_GEOMETRY.ringBaseAlpha,
  });
  const clamped = clamp01(ratio);
  const start = -Math.PI / 2;
  g.arc(0, 0, radius, start, start + 2 * Math.PI * clamped).stroke({
    width,
    color: durabilityRingColor(clamped),
  });
}

/**
 * 純繪製函式（12 §3.3.2）：本城/支城剪影（填城主勢力色、描 `ink900`）＋耐久環。
 * 局部座標系（中心為原點）；世界定位由工廠的 `container.position` 負責。
 */
export function drawCastleNode(g: Graphics, props: CastleNodeProps): void {
  g.clear();
  const isMain = props.tier === 'main';
  const size = isMain ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
  const pts = isMain ? mainKeepPoints(size) : branchKeepPoints(size);
  const fillColor = clanColorNum(props.colorIndex);
  g.poly(pts).fill({ color: fillColor });
  g.poly(pts).stroke({ width: CASTLE_NODE_GEOMETRY.strokeWidth, color: TOKENS_NUM.ink900 });

  const ringRadius = isMain
    ? CASTLE_NODE_GEOMETRY.ringRadiusMain
    : CASTLE_NODE_GEOMETRY.ringRadiusBranch;
  const ratio = props.maxDurability > 0 ? props.durability / props.maxDurability : 0;
  drawDurabilityRing(g, ringRadius, ratio);
}

function samePropsExceptPos(a: CastleNodeProps, b: CastleNodeProps): boolean {
  return (
    a.tier === b.tier &&
    a.colorIndex === b.colorIndex &&
    a.durability === b.durability &&
    a.maxDurability === b.maxDurability
  );
}

function samePos(a: CastleNodeProps['pos'], b: CastleNodeProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 工廠（12 §4：`ScenePart<P>`）：建立城節點的 `Container`（世界定位）＋內部 `Graphics`（剪影＋耐久環）。 */
export function createCastleNode(): ScenePart<CastleNodeProps> {
  const container = new Container();
  container.label = 'castleNode';
  const gfx = new Graphics();
  container.addChild(gfx);

  let last: CastleNodeProps | null = null;

  return {
    container,
    update(props: CastleNodeProps): void {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      // 冪等：props（除 pos 外）未變更則不重繪（12 §4）。
      if (last !== null && samePropsExceptPos(last, props)) {
        last = props;
        return;
      }
      drawCastleNode(gfx, props);
      last = props;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
