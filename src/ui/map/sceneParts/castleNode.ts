// CastleNode —— 原創等角城郭（平城／山城 × 本城／支城）＋耐久環＋警戒／受攻徽記。
//
// 規格：docs/design/m6-v7-castles.md（Slice B）＝ plan/12-ui-components.md §3.3.2／§5.6／§4 之
// M6-V7 擴充。art-bible §6.4「俯視沙盤紙雕城郭」：35° 假等角、左上受光、右下 2–3px 投影、
// 石垣正面／暗右面、白灰城牆、層疊瓦簷與角樓；勢力色僅用於旗幟。平城護城河、山城岩臺。
//
// 三個獨立子層（LOD 只放大建築組，不放大環／徽記）：
//   - bodyGroup：vector bodyGfx；載入成功時另含原創 Sprite 與勢力旗 Graphics
//   - ringGfx：base durability bar（三段門檻變色）
//   - warnGfx：警戒金烽火（threatened）／compact red badge（critical）
// `container.children[0] === bodyGroup`；far 本城 ×1.4 施於此組，且只顯示 vector fallback。
//
// 決定論優先（M6-V7 CD7）：警戒／受攻徽記為靜態繪製，低頻脈衝與落城補間＋煙塵延後至特效
// 里程碑；本檔不引入任何逐幀動畫。`update` 冪等：props（除 pos 外）未變則不重繪，維持
// `ScenePart<P>` 之 `void` 回傳契約（M6-V7 AD2；節點重繪計數改由整合層之簽章 diff 成員數決定）。
//
// 純繪製 helper（drawCastleBody／drawDurabilityRing／drawCastleWarning）僅使用 `Graphics`
// 繪製方法子集，可在 node 測試環境以「錄製用 mock」驗證繪製指令序列與參數（17 §3.2）。
// 工廠函式（createCastleNode）建立真正的 Pixi `Container`/`Graphics` 供整合期使用。

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import {
  castleBodyArtPlacement,
  type CastleBodyArtSpec,
  type CastleBodyArt,
} from './castleBodyArt';
import type { CastleTier } from '@core/state/enums';
import { clanColorNum, MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import type { ScenePart } from '@ui/components/types';
import type { LodStage } from '../lod';

/** §3.3.2／M6-V7 §3.1 表：四型剪影／投影／二階主郭／護城河／岩基／耐久環／警戒徽記幾何。 */
export const CASTLE_NODE_GEOMETRY = {
  mainSize: 28, // 本城剪影外接盒邊長 28×28
  branchSize: 20, // 支城剪影外接盒邊長 20×20
  paintedMainWidth: 40,
  paintedBranchWidth: 30,
  paintedStatusGap: 2,
  strokeWidth: 2, // 剪影描邊線寬（本城/支城同）
  // Legacy exported names retain caller compatibility; these now parameterize the HP bar.
  ringRadiusMain: 18,
  ringRadiusBranch: 13,
  ringWidth: 2,
  ringBaseAlpha: 0.35,
  ringArcAlpha: 0.9,
  durabilityY: 8,
  durabilitySpanFactor: 0.6,
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
  signalFireLift: 13, // compact warning remains above all four authored art frames
  criticalBadgeSize: 7,
} as const;

export type CastleWarning = 'none' | 'threatened' | 'critical';
/** Outer envelope includes the round-joined 0.6-local contrasting stroke. */
export const CASTLE_WARNING_PRESENTATION = { width: 7.6, pixels: 14, outlineWidth: 0.6 } as const;

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
  readonly depthBody: Container;
  attachDepthLayers(models: Container, signals: Container): void;
  syncDepthBody(): void;
  readonly durabilityVisible: boolean;
  readonly warningVisible: boolean;
  /** Actual selected raster alpha-content frame, not an opaque roof segmentation. */
  getPresentationGeometry(): {
    body: { x: number; y: number; width: number; height: number };
    painted: boolean;
    durability: { x: number; y: number; width: number; height: number };
    warning: { x: number; y: number; width: number; height: number } | null;
  } | null;
  setBodyArt(art: CastleBodyArt): void;
  /** Warning-only inverse camera transform; never changes body, ring or world anchor. */
  setWarningScale(scale: number): void;
  /** 依 LOD 段切 ringGfx/warnGfx 顯隱＋far 本城 bodyGfx ×1.4（不重繪，僅切 visible/scale）。 */
  setLodStage(stage: LodStage): void;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** 原創建築材質；左上受光，右面與屋簷下緣較暗。非勢力／狀態色。 */
export const CASTLE_MATERIAL = {
  stoneTop: 0xa9a58c,
  stoneFront: 0x817c6b,
  stoneRight: 0x535954,
  plasterFront: 0xf2eddb,
  plasterRight: 0xb7b9ab,
  roofLight: 0x4b5c61,
  roofDark: 0x26353d,
  eaves: 0x17252c,
  rockTop: 0x92917b,
  rockFront: 0x6c7367,
  rockRight: 0x444f49,
} as const;

/** 將 ×S 模板頂點縮放（可選位移）成局部座標扁平陣列。 */
function scalePts(template: readonly number[], s: number, dx = 0, dy = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < template.length; i += 2) {
    out.push(template[i]! * s + dx);
    out.push(template[i + 1]! * s + dy);
  }
  return out;
}

/** 畫三個可見面的等角柱體；正面較右面亮，地面錨點不受升高影響。 */
function prism(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  top: number,
  front: number,
  right: number,
): void {
  g.poly([x - w, y, x, y + d, x, y + d + h, x - w, y + h]).fill({ color: front });
  g.poly([x, y + d, x + w, y, x + w, y + h, x, y + d + h]).fill({ color: right });
  g.poly([x, y - d, x + w, y, x, y + d, x - w, y]).fill({ color: top });
}

/** 瓦頂雙斜面、伸出白牆的暗簷；每層保留不同高度，不使用平面城色剪影。 */
function roof(g: Graphics, x: number, y: number, w: number, d: number): void {
  const ridge = y - d;
  g.poly([x - w, y, x, y + d, x + w, y, x + w, y + 0.8, x, y + d + 0.8, x - w, y + 0.8]).fill({
    color: CASTLE_MATERIAL.eaves,
  });
  g.poly([x, y - d * 1.35, x + w, y, x, y + d]).fill({ color: CASTLE_MATERIAL.roofDark });
  g.poly([x, y - d * 1.35, x, y + d, x - w, y]).fill({ color: CASTLE_MATERIAL.roofLight });
  g.moveTo(x, y - d * 1.35)
    .lineTo(x - w, y)
    .stroke({ width: 0.6, color: CASTLE_MATERIAL.stoneTop });
  g.moveTo(x, y - d * 1.35)
    .lineTo(x, ridge)
    .stroke({ width: 0.5, color: CASTLE_MATERIAL.eaves });
}

/**
 * 耐久環色（12 §5.6）：ratio 三段門檻決定（與圍城 warning 無關，兩通道獨立）；不含底環。
 * M6-V9 §3.1：健康段改 `accentMoss`（非 bright）——降飽和「安靜」化；gold/vermilion 警示段不變。
 */
export function durabilityRingColor(ratio: number): number {
  if (ratio > UI.durabilityRingWarn) return TOKENS_NUM.accentMoss;
  if (ratio > UI.durabilityRingDanger) return TOKENS_NUM.accentGold;
  return TOKENS_NUM.accentVermilionBright;
}

/**
 * Base HP bar: same clamped ratio, threshold colors and LOD as the former ring.
 * The legacy function name is retained; length now encodes ratio without crossing the roof.
 */
export function drawDurabilityRing(g: Graphics, radius: number, ratio: number): void {
  g.clear();
  const width = CASTLE_NODE_GEOMETRY.ringWidth;
  const half = radius * CASTLE_NODE_GEOMETRY.durabilitySpanFactor;
  const y = CASTLE_NODE_GEOMETRY.durabilityY;
  g.moveTo(-half, y).lineTo(half, y).stroke({
    width,
    color: TOKENS_NUM.ink700,
    alpha: CASTLE_NODE_GEOMETRY.ringBaseAlpha,
  });
  const clamped = clamp01(ratio);
  g.moveTo(-half, y)
    .lineTo(-half + 2 * half * clamped, y)
    .stroke({
      width,
      color: durabilityRingColor(clamped),
      alpha: CASTLE_NODE_GEOMETRY.ringArcAlpha,
    });
}

function ringRadiusOf(tier: CastleTier): number {
  return tier === 'main'
    ? CASTLE_NODE_GEOMETRY.ringRadiusMain
    : CASTLE_NODE_GEOMETRY.ringRadiusBranch;
}

/**
 * 純繪製函式：四型等角城郭（投影、石垣、立體白牆、層疊瓦簷與旗幟）。
 * 局部座標系（中心為原點）；世界定位由工廠的 `container.position` 負責。先 clear。
 */
export function drawCastleBody(g: Graphics, props: CastleNodeProps, includeFlag = true): void {
  g.clear();
  const isMain = props.tier === 'main';
  const isMountain = props.terrainKind === 'mountain';
  const s = isMain ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
  const shadow = isMain
    ? CASTLE_NODE_GEOMETRY.shadowOffsetMain
    : CASTLE_NODE_GEOMETRY.shadowOffsetBranch;
  const m = CASTLE_MATERIAL;
  const footprint = [-0.5, 0.15, 0, -0.1, 0.5, 0.15, 0, 0.4] as const;
  g.poly(scalePts(footprint, s, shadow, shadow)).fill({
    color: TOKENS_NUM.ink900,
    alpha: CASTLE_NODE_GEOMETRY.shadowAlpha,
  });
  // 護城河位於石垣外圍；山城改為有明暗切面的高岩臺。
  if (!isMountain) {
    g.poly(scalePts(footprint, s)).stroke({
      width: 1.6,
      color: MAP_PALETTE_NUM.waterRiver,
      alpha: CASTLE_NODE_GEOMETRY.moatArcAlpha,
    });
  } else {
    prism(g, 0, 0.03 * s, 0.5 * s, 0.23 * s, 0.17 * s, m.rockTop, m.rockFront, m.rockRight);
    g.moveTo(-0.36 * s, 0.16 * s)
      .lineTo(-0.27 * s, 0.28 * s)
      .lineTo(-0.18 * s, 0.32 * s)
      .stroke({ width: 0.7, color: m.rockRight });
  }
  const baseY = (isMountain ? -0.07 : 0.09) * s;
  prism(g, 0, baseY, 0.43 * s, 0.19 * s, 0.12 * s, m.stoneTop, m.stoneFront, m.stoneRight);
  // 石垣水平砌縫與右面的深色門洞。
  g.moveTo(-0.4 * s, baseY + 0.06 * s)
    .lineTo(0, baseY + 0.25 * s)
    .lineTo(0.4 * s, baseY + 0.06 * s)
    .stroke({ width: 0.6, color: m.stoneRight });
  g.poly([
    0.17 * s,
    baseY + 0.12 * s,
    0.25 * s,
    baseY + 0.08 * s,
    0.25 * s,
    baseY + 0.17 * s,
    0.17 * s,
    baseY + 0.21 * s,
  ]).fill({ color: m.eaves });
  const turret = (x: number, y: number): void => {
    prism(g, x, y, 0.08 * s, 0.035 * s, 0.09 * s, m.plasterFront, m.plasterFront, m.plasterRight);
    roof(g, x, y, 0.11 * s, 0.05 * s);
  };
  turret(-0.28 * s, baseY - 0.05 * s);
  if (isMain) turret(0.28 * s, baseY - 0.05 * s);
  // 主城三層、支城兩層；每層逐漸內縮，各有白牆正／右面與雙斜瓦頂。
  const floors = isMain ? 3 : 2;
  for (let floor = 0; floor < floors; floor++) {
    const y = baseY - (0.1 + floor * 0.115) * s;
    const w = (0.2 - floor * 0.04) * s;
    prism(g, 0, y, w, 0.07 * s, 0.11 * s, m.plasterFront, m.plasterFront, m.plasterRight);
    g.moveTo(-0.12 * s, y + 0.07 * s)
      .lineTo(-0.04 * s, y + 0.1 * s)
      .stroke({ width: 0.7, color: m.eaves });
    roof(g, 0, y, w + 0.045 * s, 0.085 * s);
  }
  if (isMain) turret(-0.28 * s, baseY + 0.15 * s);
  if (includeFlag) drawCastleFlag(g, props);
}

/** Ownership remains a vector overlay even when the building is original raster artwork. */
export function drawCastleFlag(g: Graphics, props: CastleNodeProps): void {
  const s = props.tier === 'main' ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
  const baseY = (props.terrainKind === 'mountain' ? -0.07 : 0.09) * s;
  const m = CASTLE_MATERIAL;
  // 原始勢力色只出現在獨立旗面，不改變城郭材質／日照。
  const bx = 0.34 * s;
  const by = baseY - 0.22 * s;
  g.moveTo(bx, by)
    .lineTo(bx, baseY + 0.02 * s)
    .stroke({ width: 0.8, color: m.eaves });
  g.poly([
    bx,
    by,
    bx + 0.1 * s,
    by + 0.025 * s,
    bx + 0.1 * s,
    by + 0.105 * s,
    bx,
    by + 0.08 * s,
  ]).fill({ color: clanColorNum(props.colorIndex) });
}

/**
 * 純繪製函式（M6-V7 §6.1 徽記）：警戒／受攻徽記。先 clear。
 * - none：不繪製（僅 clear）。
 * - threatened: upright ivory triangle/dark flame with contrasting round outline.
 * - critical: red diamond/ivory exclamation with the same contrasting outline.
 */
export function drawCastleWarning(g: Graphics, props: CastleNodeProps): void {
  g.clear();
  const isMain = props.tier === 'main';
  const s = isMain ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;

  if (props.warning === 'threatened') {
    const half = CASTLE_NODE_GEOMETRY.signalFireSize / 2;
    const cy = -s / 2 - CASTLE_NODE_GEOMETRY.signalFireLift;
    // Upright ivory triangle plus a dark flame: independent of warning color.
    g.poly([0, cy - half, half, cy + half, -half, cy + half])
      .fill({ color: TOKENS_NUM.washi100 })
      .stroke({
        width: CASTLE_WARNING_PRESENTATION.outlineWidth,
        color: TOKENS_NUM.ink900,
        join: 'round',
      });
    g.poly([0, cy - 1.6, 1.1, cy + 0.7, 0, cy + 1.8, -1.1, cy + 0.7]).fill({
      color: TOKENS_NUM.ink900,
    });
    return;
  }

  if (props.warning === 'critical') {
    const half = CASTLE_NODE_GEOMETRY.criticalBadgeSize / 2;
    const cy = -s / 2 - CASTLE_NODE_GEOMETRY.signalFireLift;
    g.poly([0, cy - half, half, cy, 0, cy + half, -half, cy])
      .fill({
        color: TOKENS_NUM.accentVermilionBright,
      })
      .stroke({
        width: CASTLE_WARNING_PRESENTATION.outlineWidth,
        color: TOKENS_NUM.ink900,
        join: 'round',
      });
    g.moveTo(0, cy - 1.8)
      .lineTo(0, cy + 0.4)
      .stroke({ width: 1, color: TOKENS_NUM.washi100 });
    g.rect(-0.5, cy + 1.2, 1, 1).fill({ color: TOKENS_NUM.washi100 });
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
 * World-anchored castle: body group, independent durability ring and warning.
 * Original raster replaces only the building at mid/near LOD; the shared
 * texture remains loader-owned. Far and unavailable art use the vector body.
 */
export function createCastleNode(): CastleNodePart {
  const container = new Container();
  container.label = 'castleNode';
  const bodyGfx = new Graphics();
  const bodyGroup = new Container();
  bodyGroup.addChild(bodyGfx);
  const ringGfx = new Graphics();
  const warnGfx = new Graphics();
  container.addChild(bodyGroup); // children[0]：建築組（far 本城 ×1.4 錨定於此）
  container.addChild(ringGfx); // children[1]：耐久環
  container.addChild(warnGfx); // children[2]：警戒／受攻徽記

  let last: CastleNodeProps | null = null;
  let lastLodStage: LodStage = 'near';
  let art: Parameters<CastleNodePart['setBodyArt']>[0] = {};
  let sprite: Sprite | null = null;
  let contact: Graphics | null = null;
  let contactTier: CastleTier | null = null;
  let flag: Graphics | null = null;
  let appliedTexture: Texture | null = null;
  let appliedSpec: CastleBodyArtSpec | null = null;
  let appliedWidth = 0;
  let flagKey = '';
  let detached = false;
  let warningScale = 1;
  const signals = new Container();
  signals.eventMode = 'none';
  const syncDepthBody = (): void => {
    if (!detached) return;
    bodyGroup.position.set(container.position.x, container.position.y);
    bodyGroup.visible = container.visible;
    signals.position.set(container.position.x, container.position.y);
    signals.visible = container.visible;
  };
  const paintedFrame = (): { x: number; y: number; width: number; height: number } | null => {
    if (!last || lastLodStage === 'far') return null;
    const selected = art[last.tier]?.[last.terrainKind];
    if (!selected) return null;
    const width =
      last.tier === 'main'
        ? CASTLE_NODE_GEOMETRY.paintedMainWidth
        : CASTLE_NODE_GEOMETRY.paintedBranchWidth;
    const placement = castleBodyArtPlacement(selected.spec, width),
      frame = selected.spec.contentBounds;
    return {
      x: placement.x + frame.x * placement.scale,
      y: placement.y + frame.y * placement.scale,
      width: frame.width * placement.scale,
      height: frame.height * placement.scale,
    };
  };
  const layoutPaintedSignals = (): void => {
    const frame = paintedFrame();
    ringGfx.position.y = frame
      ? Math.max(
          0,
          frame.y +
            frame.height +
            CASTLE_NODE_GEOMETRY.paintedStatusGap +
            CASTLE_NODE_GEOMETRY.ringWidth / 2 -
            CASTLE_NODE_GEOMETRY.durabilityY,
        )
      : 0;
    if (last) {
      const s =
        last.tier === 'main' ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
      const baseCenter = -s / 2 - CASTLE_NODE_GEOMETRY.signalFireLift;
      const farMain = lastLodStage === 'far' && last.tier === 'main';
      const bodyTop = frame?.y ?? (-s / 2) * (farMain ? CASTLE_NODE_GEOMETRY.farMainBodyScale : 1);
      const halfExtent = (CASTLE_WARNING_PRESENTATION.width * warningScale) / 2;
      const gap = Math.max(
        CASTLE_NODE_GEOMETRY.paintedStatusGap,
        (2 * CASTLE_WARNING_PRESENTATION.width * warningScale) / CASTLE_WARNING_PRESENTATION.pixels,
      );
      warnGfx.scale.set(warningScale);
      // Cancel the authored center's scaled translation, leaving the badge
      // centered above the unchanged body frame without a new parent/group.
      warnGfx.position.set(0, bodyTop - gap - halfExtent - baseCenter * warningScale);
      if (frame && flag) {
        const baseY = (last.terrainKind === 'mountain' ? -0.07 : 0.09) * s;
        flag.position.set(
          frame.x + frame.width + 2 - 0.34 * s,
          frame.y + frame.height * 0.5 - baseY,
        );
      } else if (flag) flag.position.set(0, 0);
    }
  };

  const applyBodyArt = (): void => {
    const selected = last ? art[last.tier]?.[last.terrainKind] : undefined;
    const visible = lastLodStage !== 'far' && selected !== undefined;
    bodyGfx.visible = !visible;
    if (selected && last) {
      if (!sprite) {
        contact = new Graphics();
        contact.label = 'castleGroundContact';
        contact.eventMode = 'none';
        bodyGroup.addChild(contact);
        sprite = new Sprite(selected.texture);
        sprite.eventMode = 'none';
        bodyGroup.addChild(sprite);
        flag ??= new Graphics();
        flag.eventMode = 'none';
        (detached ? signals : bodyGroup).addChild(flag);
      }
      if (contact && contactTier !== last.tier) {
        contact.clear();
        const main = last.tier === 'main';
        contact
          .ellipse(main ? 1.5 : 1, main ? 1.25 : 1, main ? 17 : 12.5, main ? 4.25 : 3.25)
          .fill({ color: 0x514b3d, alpha: 0.12 });
        contact
          .ellipse(0, 0.5, main ? 14 : 10, main ? 3 : 2.25)
          .fill({ color: 0x81745b, alpha: 0.14 });
        contactTier = last.tier;
      }
      const width =
        last.tier === 'main'
          ? CASTLE_NODE_GEOMETRY.paintedMainWidth
          : CASTLE_NODE_GEOMETRY.paintedBranchWidth;
      if (
        appliedTexture !== selected.texture ||
        appliedSpec !== selected.spec ||
        appliedWidth !== width
      ) {
        sprite.texture = selected.texture;
        const placement = castleBodyArtPlacement(selected.spec, width);
        sprite.scale.set(placement.scale);
        sprite.position.set(placement.x, placement.y);
        appliedTexture = selected.texture;
        appliedSpec = selected.spec;
        appliedWidth = width;
      }
      const nextFlagKey = `${last.tier}:${last.terrainKind}:${last.colorIndex}`;
      if (flag && flagKey !== nextFlagKey) {
        flag.clear();
        drawCastleFlag(flag, last);
        flagKey = nextFlagKey;
      }
    }
    if (sprite) sprite.visible = visible;
    if (contact) contact.visible = visible;
    if (flag) flag.visible = visible || detached;
    layoutPaintedSignals();
  };

  const applyLod = (stage: LodStage): void => {
    lastLodStage = stage;
    const warning: CastleWarning = last?.warning ?? 'none';
    ringGfx.visible = stage === 'near' || warning !== 'none';
    warnGfx.visible = warning !== 'none';
    const farMain = stage === 'far' && last?.tier === 'main';
    bodyGroup.scale.set(farMain ? CASTLE_NODE_GEOMETRY.farMainBodyScale : 1);
    if (detached && flag) flag.scale.set(farMain ? CASTLE_NODE_GEOMETRY.farMainBodyScale : 1);
    applyBodyArt();
  };

  return {
    container,
    depthBody: bodyGroup,
    get durabilityVisible() {
      return ringGfx.visible;
    },
    get warningVisible() {
      return warnGfx.visible;
    },
    syncDepthBody,
    attachDepthLayers(models, foreground): void {
      if (detached) return;
      detached = true;
      container.removeChild(bodyGroup);
      container.removeChild(ringGfx);
      container.removeChild(warnGfx);
      // Keep the original hit/anchor owner independent of mounted visual groups.
      models.addChild(bodyGroup);
      signals.addChild(ringGfx, warnGfx);
      if (!flag) flag = new Graphics();
      signals.addChild(flag);
      foreground.addChild(signals);
      if (last) {
        drawCastleBody(bodyGfx, last, false);
        flag.clear();
        drawCastleFlag(flag, last);
      }
      syncDepthBody();
    },
    getPresentationGeometry() {
      if (!last) return null;
      const s =
        last.tier === 'main' ? CASTLE_NODE_GEOMETRY.mainSize : CASTLE_NODE_GEOMETRY.branchSize;
      const selected = art[last.tier]?.[last.terrainKind];
      const painted = lastLodStage !== 'far' && selected !== undefined;
      let body: { x: number; y: number; width: number; height: number } = {
        x: -s / 2,
        y: -s / 2,
        width: s,
        height: s,
      };
      if (painted && selected) {
        body = paintedFrame()!;
      } else if (lastLodStage === 'far' && last.tier === 'main') {
        const scale = CASTLE_NODE_GEOMETRY.farMainBodyScale;
        body = {
          x: body.x * scale,
          y: body.y * scale,
          width: body.width * scale,
          height: body.height * scale,
        };
      }
      const half = ringRadiusOf(last.tier) * CASTLE_NODE_GEOMETRY.durabilitySpanFactor;
      const width = CASTLE_NODE_GEOMETRY.ringWidth;
      return {
        body,
        painted,
        durability: {
          x: -half - width / 2,
          y: CASTLE_NODE_GEOMETRY.durabilityY + ringGfx.position.y - width / 2,
          width: half * 2 + width,
          height: width,
        },
        warning:
          last.warning === 'none'
            ? null
            : {
                x: (-CASTLE_WARNING_PRESENTATION.width * warningScale) / 2,
                y:
                  warnGfx.position.y +
                  (-s / 2 - CASTLE_NODE_GEOMETRY.signalFireLift) * warningScale -
                  (CASTLE_WARNING_PRESENTATION.width * warningScale) / 2,
                width: CASTLE_WARNING_PRESENTATION.width * warningScale,
                height: CASTLE_WARNING_PRESENTATION.width * warningScale,
              },
      };
    },
    setBodyArt(value): void {
      art = value;
      applyBodyArt();
    },
    setWarningScale(value): void {
      if (!Number.isFinite(value) || value <= 0 || value > 64 || value === warningScale) return;
      warningScale = value;
      layoutPaintedSignals();
    },
    update(props: CastleNodeProps): void {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      syncDepthBody();
      // 冪等：props（除 pos 外）未變更則不重繪，維持既有語意與 void 回傳（AD2）。
      if (last !== null && samePropsExceptPos(last, props)) {
        last = props;
        return;
      }
      drawCastleBody(bodyGfx, props, !detached);
      if (detached && flag) {
        flag.clear();
        drawCastleFlag(flag, props);
      }
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
      if (sprite) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy({ texture: false, textureSource: false });
        sprite = null;
      }
      if (detached) {
        bodyGroup.parent?.removeChild(bodyGroup);
        signals.parent?.removeChild(signals);
        bodyGroup.destroy({ children: true });
      }
      signals.destroy({ children: true });
      container.destroy({ children: true });
    },
  };
}
