// CastleNode —— 城節點場景元件（平城／山城 × 本城／支城四型剪影＋耐久環＋警戒／受攻徽記）。
//
// 規格：docs/design/m6-v7-castles.md（Slice B）＝ plan/12-ui-components.md §3.3.2／§5.6／§4 之
// M6-V7 擴充。art-bible §6.4「俯視沙盤紙雕城郭」：35° 假等角、左上受光、右下 2–3px 投影、
// 郭內勢力色填面＋ink900 統一描邊；本城五角外郭＋二階內主郭、支城四角郭；平城水平展開＋
// 護城河短弧、山城三角岩基＋窄高牆。
//
// 三子 Graphics 分離（供 LOD 逐項顯隱、且「只放大剪影、不放大環/徽記」）：
//   - bodyGfx：投影 →（山城）岩基三角 → 外郭 →（本城）二階內主郭 →（平城）護城河短弧
//   - ringGfx：耐久環（三段門檻變色）
//   - warnGfx：警戒金烽火（threatened）／受攻裂口＋靜態朱紅光暈（critical）
// `container.children[0] === bodyGfx`（整合層 far 本城 ×1.4 只施於 bodyGfx，故對此錨定 scale）。
//
// 決定論優先（M6-V7 CD7）：警戒／受攻徽記為靜態繪製，低頻脈衝與落城補間＋煙塵延後至特效
// 里程碑；本檔不引入任何逐幀動畫。`update` 冪等：props（除 pos 外）未變則不重繪，維持
// `ScenePart<P>` 之 `void` 回傳契約（M6-V7 AD2；節點重繪計數改由整合層之簽章 diff 成員數決定）。
//
// 純繪製 helper（drawCastleBody／drawDurabilityRing／drawCastleWarning）僅使用 `Graphics`
// 繪製方法子集，可在 node 測試環境以「錄製用 mock」驗證繪製指令序列與參數（17 §3.2）。
// 工廠函式（createCastleNode）建立真正的 Pixi `Container`/`Graphics` 供整合期使用。

import { Container, Graphics } from 'pixi.js';
import type { CastleTier } from '@core/state/enums';
import { clanColorNum, MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import type { ScenePart } from '@ui/components/types';
import type { LodStage } from '../lod';

/** §3.3.2／M6-V7 §3.1 表：四型剪影／投影／二階主郭／護城河／岩基／耐久環／警戒徽記幾何。 */
export const CASTLE_NODE_GEOMETRY = {
  mainSize: 28, // 本城剪影外接盒邊長 28×28
  branchSize: 20, // 支城剪影外接盒邊長 20×20
  strokeWidth: 2, // 剪影描邊線寬（本城/支城同）
  ringRadiusMain: 20, // 耐久環半徑：本城 20
  ringRadiusBranch: 15, // 耐久環半徑：支城 15
  ringWidth: 3, // 耐久環線寬
  ringBaseAlpha: 0.25, // 底環透明度
  // ── M6-V7 ──
  farMainBodyScale: 1.4, // far 本城剪影放大（僅施於 bodyGfx，不放大 ring/warn；#3）
  shadowOffsetMain: 3, // 本城右下紙雕投影位移
  shadowOffsetBranch: 2, // 支城右下紙雕投影位移
  shadowAlpha: 0.28, // 投影透明度
  innerKeepScale: 0.5, // 本城二階內主郭相對外接盒（×S）
  innerKeepLiftPlain: 0.1, // 平城主郭上移（×S）
  innerKeepLiftMountain: 0.26, // 山城主郭上移（垂直堆疊，×S）
  mountainBaseAlpha: 0.9, // 山城岩基三角 reliefInk alpha
  moatArcRadius: 0.12, // 平城護城河短弧半徑（×S）
  moatArcAlpha: 0.5, // 護城河透明度
  signalFireSize: 7, // 警戒金烽火外接盒
  signalFireLift: 8, // 烽火中心較城頂上移（世界單位）
  crackWidth: 1.5, // 受攻裂口線寬
  criticalHaloPad: 4, // 受攻靜態光暈半徑 = 耐久環半徑 + pad
  criticalHaloAlpha: 0.5, // 受攻光暈透明度
} as const;

export type CastleWarning = 'none' | 'threatened' | 'critical';

export interface CastleNodeProps {
  /** 世界座標（供工廠將 `container.position` 對齊；純繪製函式不消費本欄位，剪影恆繪於局部原點）。 */
  readonly pos: { readonly x: number; readonly y: number };
  readonly tier: CastleTier; // 城格（02 §4.5 `Castle.tier`）：'main' | 'branch'
  readonly terrainKind: 'plain' | 'mountain'; // 城型（M6-V7）：平城水平展開／山城三角岩基
  /** 城主勢力色索引（`Clan.colorIndex` 0..39；Castle.ownerClanId 依 INV-02 恆存在，故不接受 null）。 */
  readonly colorIndex: number;
  readonly durability: number; // 02 §4.5 `Castle.durability`
  readonly maxDurability: number; // 02 §4.5 `Castle.maxDurability`
  readonly warning: CastleWarning; // 圍城推導警戒態（M6-V7）：none／threatened（encircle）／critical（assault）
}

/** 節點元件介面：`ScenePart<P>` 之加法擴充（M6-V7 AD2；僅新增 setLodStage，`update` 仍 void）。 */
export interface CastleNodePart extends ScenePart<CastleNodeProps> {
  /** 依 LOD 段切 ringGfx/warnGfx 顯隱＋far 本城 bodyGfx ×1.4（不重繪，僅切 visible/scale）。 */
  setLodStage(stage: LodStage): void;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ── 四型外郭／岩基頂點模板（局部座標，中心＝原點，-y 為上；單位＝×S）。M6-V7 §6.1 表。 ──
/** 本城·平城：不規則低寬五角外郭。 */
const OUTER_MAIN_PLAIN = [-0.5, 0.3, 0.5, 0.3, 0.5, -0.02, 0.12, -0.2, -0.5, -0.02] as const;
/** 本城·山城：三角岩基＋窄牆。 */
const ROCK_MAIN = [-0.5, 0.42, 0.5, 0.42, 0, -0.06] as const;
const WALL_MAIN_MOUNTAIN = [-0.3, 0.3, 0.3, 0.3, 0.3, -0.1, -0.3, -0.1] as const;
/** 支城·平城：四角低寬梯形。 */
const OUTER_BRANCH_PLAIN = [-0.5, 0.26, 0.5, 0.26, 0.4, -0.16, -0.4, -0.16] as const;
/** 支城·山城：小三角岩基＋窄牆。 */
const ROCK_BRANCH = [-0.46, 0.4, 0.46, 0.4, 0, 0.02] as const;
const WALL_BRANCH_MOUNTAIN = [-0.3, 0.3, 0.3, 0.3, 0.26, -0.18, -0.26, -0.18] as const;

/** 將 ×S 模板頂點縮放（可選位移）成局部座標扁平陣列。 */
function scalePts(template: readonly number[], s: number, dx = 0, dy = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < template.length; i += 2) {
    out.push(template[i]! * s + dx);
    out.push(template[i + 1]! * s + dy);
  }
  return out;
}

/** 本城二階內主郭（雙層屋簷）頂點；縮至 `.5S` 外接盒（局部座標，中心為原點）。 */
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
    y1, // 右側下層簷
    w2,
    y1, // 內縮（下層簷緣）
    w2,
    y2, // 右側上層簷
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

/** 耐久環色（12 §5.6）：ratio 三段門檻決定（與圍城 warning 無關，兩通道獨立）；不含底環。 */
export function durabilityRingColor(ratio: number): number {
  if (ratio > UI.durabilityRingWarn) return TOKENS_NUM.accentMossBright;
  if (ratio > UI.durabilityRingDanger) return TOKENS_NUM.accentGold;
  return TOKENS_NUM.accentVermilionBright;
}

/**
 * 繪製耐久環（12 §5.6 通用弧＋§3.3.2 底環）：先 clear，畫底環（`ink300` 25% 整圈），
 * 再疊「12 點鐘起順時針」的比例弧（三段變色）。
 */
export function drawDurabilityRing(g: Graphics, radius: number, ratio: number): void {
  g.clear();
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

function ringRadiusOf(tier: CastleTier): number {
  return tier === 'main'
    ? CASTLE_NODE_GEOMETRY.ringRadiusMain
    : CASTLE_NODE_GEOMETRY.ringRadiusBranch;
}

/**
 * 純繪製函式（M6-V7 §6.1）：四型剪影（投影＋岩基＋外郭＋二階主郭＋護城河）。
 * 局部座標系（中心為原點）；世界定位由工廠的 `container.position` 負責。先 clear。
 */
export function drawCastleBody(g: Graphics, props: CastleNodeProps): void {
  g.clear();
  const isMain = props.tier === 'main';
  const isMountain = props.terrainKind === 'mountain';
  const s = isMain ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
  const shadow = isMain
    ? CASTLE_NODE_GEOMETRY.shadowOffsetMain
    : CASTLE_NODE_GEOMETRY.shadowOffsetBranch;
  const fill = clanColorNum(props.colorIndex);
  const fillBright = clanColorNum(props.colorIndex, true);
  const stroke = { width: CASTLE_NODE_GEOMETRY.strokeWidth, color: TOKENS_NUM.ink900 };

  // 外郭「footprint」頂點（山城＝岩基三角；平城＝外牆多邊形）——供投影與型別繪製共用。
  const rock = isMain ? ROCK_MAIN : ROCK_BRANCH;
  const wall = isMain ? WALL_MAIN_MOUNTAIN : WALL_BRANCH_MOUNTAIN;
  const outerPlain = isMain ? OUTER_MAIN_PLAIN : OUTER_BRANCH_PLAIN;

  // (1) 投影：外郭（本城另含岩基）整體位移 (+shadow, +shadow)，填 ink900 α shadowAlpha（最底）。
  const shadowFill = { color: TOKENS_NUM.ink900, alpha: CASTLE_NODE_GEOMETRY.shadowAlpha };
  if (isMountain) {
    g.poly(scalePts(rock, s, shadow, shadow)).fill(shadowFill);
    g.poly(scalePts(wall, s, shadow, shadow)).fill(shadowFill);
  } else {
    g.poly(scalePts(outerPlain, s, shadow, shadow)).fill(shadowFill);
  }

  if (isMountain) {
    // (2) 山城岩基三角（reliefInk α .9）＋(3) 窄高牆（clan 填＋ink900 描）。
    g.poly(scalePts(rock, s)).fill({
      color: MAP_PALETTE_NUM.reliefInk,
      alpha: CASTLE_NODE_GEOMETRY.mountainBaseAlpha,
    });
    g.poly(scalePts(rock, s)).stroke(stroke);
    g.poly(scalePts(wall, s)).fill({ color: fill });
    g.poly(scalePts(wall, s)).stroke(stroke);
  } else {
    // (3) 平城外郭（clan 填＋ink900 描）。
    g.poly(scalePts(outerPlain, s)).fill({ color: fill });
    g.poly(scalePts(outerPlain, s)).stroke(stroke);
  }

  // (4) 本城二階內主郭：mainKeepPoints(.5S) 上移（山城堆疊更高）；亮變體填＋ink900 描。
  if (isMain) {
    const lift =
      (isMountain
        ? CASTLE_NODE_GEOMETRY.innerKeepLiftMountain
        : CASTLE_NODE_GEOMETRY.innerKeepLiftPlain) * s;
    const keep = scalePts(mainKeepPoints(CASTLE_NODE_GEOMETRY.innerKeepScale * s), 1, 0, -lift);
    g.poly(keep).fill({ color: fillBright });
    g.poly(keep).stroke(stroke);
  }

  // (5) 平城護城河短弧：外牆下緣兩枚 arc（waterRiver α .5，掃角 ~120°）。僅本城平城。
  if (!isMountain && isMain) {
    const r = CASTLE_NODE_GEOMETRY.moatArcRadius * s;
    const arcStroke = {
      width: CASTLE_NODE_GEOMETRY.strokeWidth,
      color: MAP_PALETTE_NUM.waterRiver,
      alpha: CASTLE_NODE_GEOMETRY.moatArcAlpha,
    };
    const y = 0.34 * s;
    const start = Math.PI * 0.15;
    const sweep = (2 * Math.PI) / 3; // ~120°
    g.arc(-0.35 * s, y, r, start, start + sweep).stroke(arcStroke);
    g.arc(0.35 * s, y, r, start, start + sweep).stroke(arcStroke);
  }
}

/**
 * 純繪製函式（M6-V7 §6.1 徽記）：警戒／受攻徽記。先 clear。
 * - none：不繪製（僅 clear）。
 * - threatened（encircle）：城頂金色小烽火（ink900 桿＋2 枚上尖三角焰 accentGold）。
 * - critical（assault）：跨主郭 3 段鋸齒裂口（accentVermilion）＋靜態朱紅光暈圓（accentVermilionBright α .5）。
 */
export function drawCastleWarning(g: Graphics, props: CastleNodeProps): void {
  g.clear();
  const isMain = props.tier === 'main';
  const s = isMain ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;

  if (props.warning === 'threatened') {
    const half = CASTLE_NODE_GEOMETRY.signalFireSize / 2;
    const cx = 0;
    const cy = -s / 2 - CASTLE_NODE_GEOMETRY.signalFireLift;
    // 烽火桿（ink900 細桿，自焰底向城頂延伸）。
    g.moveTo(cx, cy + half)
      .lineTo(cx, cy + half + 3)
      .stroke({ width: 1, color: TOKENS_NUM.ink900 });
    // 兩枚上尖三角焰（accentGold）。
    g.poly([
      cx,
      cy - half,
      cx + half * 0.75,
      cy + half * 0.5,
      cx - half * 0.75,
      cy + half * 0.5,
    ]).fill({
      color: TOKENS_NUM.accentGold,
    });
    g.poly([
      cx,
      cy - half * 0.35,
      cx + half * 0.4,
      cy + half * 0.45,
      cx - half * 0.4,
      cy + half * 0.45,
    ]).fill({ color: TOKENS_NUM.accentGold });
    return;
  }

  if (props.warning === 'critical') {
    // 靜態朱紅光暈圓（半徑＝耐久環半徑＋pad）。
    const haloR = ringRadiusOf(props.tier) + CASTLE_NODE_GEOMETRY.criticalHaloPad;
    g.circle(0, 0, haloR).stroke({
      width: 2,
      color: TOKENS_NUM.accentVermilionBright,
      alpha: CASTLE_NODE_GEOMETRY.criticalHaloAlpha,
    });
    // 跨主郭 3 段鋸齒裂口折線。
    g.moveTo(-0.2 * s, -0.1 * s)
      .lineTo(-0.08 * s, 0.02 * s)
      .lineTo(0.04 * s, -0.04 * s)
      .lineTo(0.15 * s, 0.1 * s)
      .stroke({ width: CASTLE_NODE_GEOMETRY.crackWidth, color: TOKENS_NUM.accentVermilion });
  }
}

function samePropsExceptPos(a: CastleNodeProps, b: CastleNodeProps): boolean {
  return (
    a.tier === b.tier &&
    a.terrainKind === b.terrainKind &&
    a.colorIndex === b.colorIndex &&
    a.durability === b.durability &&
    a.maxDurability === b.maxDurability &&
    a.warning === b.warning
  );
}

function samePos(a: CastleNodeProps['pos'], b: CastleNodeProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * 工廠（12 §4：`ScenePart<P>` 加法擴充）：建立城節點的 `Container`（世界定位）＋三子 `Graphics`
 * （bodyGfx / ringGfx / warnGfx；addChild 序＝由下而上，故 `container.children[0] === bodyGfx`）。
 */
export function createCastleNode(): CastleNodePart {
  const container = new Container();
  container.label = 'castleNode';
  const bodyGfx = new Graphics();
  const ringGfx = new Graphics();
  const warnGfx = new Graphics();
  container.addChild(bodyGfx); // children[0]：剪影（far 本城 ×1.4 錨定於此）
  container.addChild(ringGfx); // children[1]：耐久環
  container.addChild(warnGfx); // children[2]：警戒／受攻徽記

  let last: CastleNodeProps | null = null;
  let lastLodStage: LodStage = 'near';

  const applyLod = (stage: LodStage): void => {
    lastLodStage = stage;
    const warning: CastleWarning = last?.warning ?? 'none';
    ringGfx.visible = stage === 'near' || warning !== 'none';
    warnGfx.visible = warning !== 'none';
    const farMain = stage === 'far' && last?.tier === 'main';
    bodyGfx.scale.set(farMain ? CASTLE_NODE_GEOMETRY.farMainBodyScale : 1);
  };

  return {
    container,
    update(props: CastleNodeProps): void {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      // 冪等：props（除 pos 外）未變更則不重繪，維持既有語意與 void 回傳（AD2）。
      if (last !== null && samePropsExceptPos(last, props)) {
        last = props;
        return;
      }
      drawCastleBody(bodyGfx, props);
      const ratio = props.maxDurability > 0 ? props.durability / props.maxDurability : 0;
      drawDurabilityRing(ringGfx, ringRadiusOf(props.tier), ratio);
      drawCastleWarning(warnGfx, props);
      last = props;
      applyLod(lastLodStage); // 重繪後重套 LOD 顯隱／放大，保持一致。
    },
    setLodStage(stage: LodStage): void {
      applyLod(stage);
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
