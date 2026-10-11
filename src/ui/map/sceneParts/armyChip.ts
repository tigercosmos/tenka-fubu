import { BitmapText, Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import {
  armyFacing,
  armyBodyArtPlacement,
  ARMY_BODY_MID_LIGHT_ALPHA,
  type ArmyBodyArt,
} from './armyBodyArt';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import type { ArmyStatus } from '@core/state/enums';
import type { LodStage } from '../lod';
import type { ArmyRelation } from '../mapViewTypes';
import { MAPVIEW } from '../mapViewConfig';

export interface ArmyChipProps {
  pos: { x: number; y: number };
  colorIndex: number;
  soldiers: number;
  morale: number;
  corps: boolean;
  collapsedCount?: number;
  // ── M6-V8 新增（皆入 armyChipDrawEqual，pos 除外，V8D1）──
  /** 部隊狀態（狀態 badge／敗走旗面下垂；V8D6/V8D7）。 */
  status: ArmyStatus;
  /** 補給存量 view 值（補給 badge 門檻，V8D5）。 */
  foodDays: number;
  /** 對檢視方的外交關係次級通道（友靛藍雙環／敵朱紅尖角／中立灰菱形；V8D3）。 */
  relation: ArmyRelation;
  /** 是否被選取（金色雙環＋full detail 破例＋置頂；V8D10）。 */
  selected: boolean;
  /** 行軍方向單位向量；null＝靜止（方向箭頭；V8D4）。 */
  heading: { x: number; y: number } | null;
  /** 目前 LOD 段（detail 矩陣＋far 變體；V8D9/V8D13）。 */
  stage: LodStage;
  /** = 同節點 stackIndex（兵數底板垂直錯位，世界座標不變；V8D14）。 */
  labelStagger: number;
}

export interface StackableArmy {
  id: string;
  stackKey: string;
  pos: { x: number; y: number };
}

export interface ArmyStackLayout<T extends StackableArmy> {
  army: T;
  pos: { x: number; y: number };
  visible: boolean;
  collapsedCount?: number;
  /** M6-V8 V8D14：組內 0-based 序（供兵數底板垂直錯位；additive，不破既有測試）。 */
  stackIndex: number;
}

/** One deterministic layout shared by Pixi drawing and interaction hit-testing. */
export function layoutArmyStacks<T extends StackableArmy>(
  armies: readonly T[],
): ArmyStackLayout<T>[] {
  const sorted = [...armies].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, T[]>();
  for (const army of sorted) {
    const group = groups.get(army.stackKey) ?? [];
    group.push(army);
    groups.set(army.stackKey, group);
  }
  const result: ArmyStackLayout<T>[] = [];
  for (const group of groups.values()) {
    group.forEach((army, index) => {
      const stacks = group.length >= 5;
      const visible = !stacks || index <= 3;
      const offsetIndex = stacks ? Math.min(index, 3) : index;
      result.push({
        army,
        pos: { x: army.pos.x + offsetIndex * 14, y: army.pos.y },
        visible,
        stackIndex: index,
        ...(stacks && index === 3 ? { collapsedCount: group.length - 3 } : {}),
      });
    });
  }
  return result;
}

export const ARMY_CHIP_GEOMETRY = {
  poleHeight: 30,
  flagWidth: 18,
  flagHeight: 26,
  swallowTail: 6,
  hitPadding: 6,
  moraleRadius: 2,
  // ── M6-V8 新增（§3.3）──
  flagWidthSmall: 14,
  flagWidthMid: 18,
  flagWidthLarge: 22,
  droopAngleDeg: 20, // routed 旗面下垂（順時針繞旗桿頂，V8D7）
  arrowLength: 12,
  arrowLengthFar: 16,
  arrowHeadSize: 5,
  arrowGap: 3, // 方向箭頭（far 變體，V8D4/V8D13）
  selectRingOuter: 17,
  selectRingOuterFar: 20,
  selectRingInner: 13, // 選取金色雙環（far 變體，V8D13）
  relationRingOuter: 12,
  relationRingInner: 9, // 友軍靛藍雙環
  neutralDiamond: 7, // 中立灰空心菱形半對角
  enemyTailLen: 6,
  enemyTailWidth: 5, // 敵對旗尾尖角（base）
  enemyTailLenFar: 12,
  enemyTailWidthFar: 9, // 敵對旗尾尖角（far 變體，V8D13）
  badgeSize: 8,
  badgeGap: 2, // 狀態/補給 badge
  knotLen: 5,
  crackInset: 2, // 士氣旗結／破裂框
  platePadX: 3,
  platePadY: 2,
  plateRadius: 2,
  plateHeight: 15, // 兵數 washi100 底板（V8D14；radius-sm）
  plateCharWidth: 7, // 底板寬以字元數估算（12px Noto Serif TC ASCII 平均字寬；見 §8.5）
} as const;

export function formatArmyTroops(soldiers: number): string {
  const value = Math.max(0, Math.round(soldiers));
  return value.toLocaleString('en-US');
}

/** 兵力量感三級旗幅（V8D2）：<mid→small(14)；<large→mid(18)；else large(22)。 */
export function flagWidthForSoldiers(soldiers: number): number {
  if (soldiers < MAPVIEW.armySoldierTierMid) return ARMY_CHIP_GEOMETRY.flagWidthSmall;
  if (soldiers < MAPVIEW.armySoldierTierLarge) return ARMY_CHIP_GEOMETRY.flagWidthMid;
  return ARMY_CHIP_GEOMETRY.flagWidthLarge;
}

/** mid LOD 兵數縮寫（純 ASCII，不觸發字型 subset）：900→"900"、2200→"2.2k"、12000→"12k"。 */
export function abbreviateTroops(soldiers: number): string {
  const n = Math.max(0, Math.round(soldiers));
  if (n < 1000) return String(n);
  return `${(Math.round(n / 100) / 10).toLocaleString('en-US')}k`;
}

export type SupplyLevel = 'ok' | 'low' | 'critical';

/** 補給等級（門檻鏡射 MAPVIEW，V8D5）：<critical→critical；<low→low；else ok。 */
export function supplyLevel(foodDays: number): SupplyLevel {
  if (foodDays < MAPVIEW.armySupplyCriticalDays) return 'critical';
  if (foodDays < MAPVIEW.armySupplyLowDays) return 'low';
  return 'ok';
}

export type ChipBadge =
  'routed' | 'engaged' | 'sieging' | 'subjugating' | 'critical' | 'low' | 'corps' | 'none';

/** 右上單槽最高優先狀態 badge（V8D6）：routed>engaged>sieging>subjugating>補給危急>補給低>corps。 */
export function topBadge(status: ArmyStatus, foodDays: number, corps: boolean): ChipBadge {
  if (status === 'routed') return 'routed';
  if (status === 'engaged') return 'engaged';
  if (status === 'sieging') return 'sieging';
  if (status === 'subjugating') return 'subjugating';
  const s = supplyLevel(foodDays);
  if (s === 'critical') return 'critical';
  if (s === 'low') return 'low';
  if (corps) return 'corps';
  return 'none';
}

/**
 * 兵數底板寬（以字元數估算，V8D14 §8.5）：刻意不讀 `BitmapText.width`——後者於未載入
 * bitmap 字型的 node 測試環境會觸發 canvas 量測而拋 `document is not defined`；ASCII 兵數字串
 * （數字／`,`／`k`／`+`）以固定字寬估算已足以承載底板，且於瀏覽器／測試決定論一致。
 */
export function plateWidthForLabel(text: string): number {
  return text.length * ARMY_CHIP_GEOMETRY.plateCharWidth + ARMY_CHIP_GEOMETRY.platePadX * 2;
}

export function moralePips(morale: number): { lit: number; color: number } {
  if (morale >= UI.moralePipHigh) return { lit: 3, color: TOKENS_NUM.accentMossBright };
  if (morale >= UI.moralePipLow) return { lit: 2, color: TOKENS_NUM.accentGold };
  return { lit: 1, color: TOKENS_NUM.accentVermilionBright };
}

/**
 * 狀態/補給 badge 向量字形（V8D6；非 BitmapText → 無字型義務）。以 (bx,by) 為 s×s 框左上角繪製。
 * routed→向下人字（撤退）；engaged→交叉刀 X（交叉刀之唯一用途，#5）；sieging→城鉤 ㄇ；
 * subjugating→小同心環；critical→空袋＋驚嘆三角；low→米袋缺口（金）；corps→小三角旗結（金）。
 */
function drawBadge(g: Graphics, badge: ChipBadge, bx: number, by: number, s: number): void {
  const vb = TOKENS_NUM.accentVermilionBright;
  const gold = TOKENS_NUM.accentGold;
  switch (badge) {
    case 'routed':
      g.moveTo(bx, by)
        .lineTo(bx + s / 2, by + s)
        .lineTo(bx + s, by)
        .stroke({ width: 1.5, color: vb });
      break;
    case 'engaged':
      g.moveTo(bx, by)
        .lineTo(bx + s, by + s)
        .stroke({ width: 1.5, color: vb });
      g.moveTo(bx + s, by)
        .lineTo(bx, by + s)
        .stroke({ width: 1.5, color: vb });
      break;
    case 'sieging':
      g.moveTo(bx, by + s)
        .lineTo(bx, by)
        .lineTo(bx + s, by)
        .lineTo(bx + s, by + s)
        .stroke({ width: 1.5, color: vb });
      break;
    case 'subjugating':
      g.circle(bx + s / 2, by + s / 2, s / 2).stroke({ width: 1.5, color: vb });
      g.circle(bx + s / 2, by + s / 2, s / 4).stroke({ width: 1, color: vb });
      break;
    case 'critical':
      g.rect(bx, by + s * 0.35, s * 0.55, s * 0.65).stroke({ width: 1, color: vb }); // 空袋
      g.poly([bx + s * 0.65, by, bx + s, by + s * 0.6, bx + s * 0.3, by + s * 0.6]).stroke({
        width: 1,
        color: vb,
      }); // 驚嘆三角
      break;
    case 'low':
      g.rect(bx, by, s * 0.8, s).stroke({ width: 1.5, color: gold }); // 米袋
      g.moveTo(bx + s * 0.25, by)
        .lineTo(bx + s * 0.45, by + s * 0.3)
        .lineTo(bx + s * 0.65, by)
        .stroke({ width: 1, color: gold }); // 缺口
      break;
    case 'corps':
      g.poly([bx, by, bx + s, by, bx, by + s]).fill({ color: gold }); // 小三角旗結
      break;
    case 'none':
      break;
  }
}

/** Original miniature infantry, not a troop-type assertion: the map view has no cavalry field. */
export const ARMY_FORMATION_PALETTE = {
  armor: 0x394750,
  armorShade: 0x1c2930,
  helmetLight: 0x788482,
  brass: 0xb29459,
  face: 0xc2af87,
  spear: 0xe4dcc9,
  shadow: 0x17252c,
} as const;

function drawInfantryFormation(
  g: Graphics,
  near: boolean,
  heading: ArmyChipProps['heading'] | undefined,
): void {
  const palette = ARMY_FORMATION_PALETTE;
  // Four authored views: keep vertical spears and NW-lit material planes, never rotate the sprite.
  const facing = armyFacing(heading);
  // Back rank first; the front rank overlaps it in isometric depth. All feet stay above the label.
  const ranks = near
    ? [
        [8, -5],
        [18, -5],
        [3, 0],
        [13, 0],
        [23, 0],
      ]
    : [
        [4, -2],
        [14, -2],
        [23, -2],
      ];
  const formation =
    facing === 'east'
      ? ranks
      : ranks
          .map(([x = 0, y = 0]) => {
            if (facing === 'west') return [26 - x, y];
            // Narrower column for vertical travel; rear feet are painted first.
            return [
              13 + (x - 13) * 0.65 + y * (facing === 'south' ? 0.5 : -0.5),
              y + (x - 13) * (facing === 'south' ? 0.12 : -0.12) - 1.2,
            ];
          })
          .sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);
  for (const [x = 0, y = 0] of formation) {
    const spearX = x + (facing === 'west' || facing === 'north' ? -3 : 3);
    // Spear at the right shoulder; the shaft never substitutes for the existing direction arrow.
    g.moveTo(spearX, y - 3)
      .lineTo(spearX, y - 17)
      .stroke({ width: 0.8, color: palette.brass });
    g.poly([spearX, y - 20, spearX - 1.3, y - 16.5, spearX + 1.3, y - 16.5]).fill({
      color: palette.spear,
    });
    // Two greaves, then armor front and shaded east face. Northwest helmet plane catches the light.
    g.poly([x - 2, y - 4, x, y - 3, x - 0.5, y, x - 3, y - 0.5]).fill({
      color: palette.armorShade,
    });
    g.poly([x, y - 3, x + 2.3, y - 4, x + 3, y - 0.5, x + 0.7, y]).fill({ color: palette.armor });
    g.poly([x - 3, y - 10, x + 0.5, y - 11, x + 0.5, y - 4, x - 3, y - 5]).fill({
      color: palette.armor,
    });
    g.poly([x + 0.5, y - 11, x + 3, y - 9.5, x + 3, y - 5.5, x + 0.5, y - 4]).fill({
      color: palette.armorShade,
    });
    // Back-facing troops show helmet neck guards, not a face on the back of the head.
    const faceLeft = facing === 'west' ? -2.4 : facing === 'south' ? -1.8 : -1;
    const faceRight = facing === 'west' ? 0.1 : facing === 'south' ? 1.8 : 1.5;
    g.poly([
      x + faceLeft,
      y - 13,
      x + faceRight,
      y - 13,
      x + faceRight,
      y - 10.5,
      x + faceLeft,
      y - 10.5,
    ]).fill({
      color: facing === 'north' ? palette.armorShade : palette.face,
    });
    g.poly([x - 3.3, y - 13, x - 1, y - 15, x + 1.5, y - 14.3, x + 3, y - 12.8]).fill({
      color: palette.helmetLight,
    });
    g.poly([x - 3.3, y - 13, x + 3, y - 12.8, x + 2.2, y - 11.6, x - 2.7, y - 11.8]).fill({
      color: palette.armorShade,
    });
    if (near) {
      g.moveTo(x - 2.4, y - 7)
        .lineTo(x + 0.2, y - 6.4)
        .stroke({ width: 0.6, color: palette.brass });
      g.moveTo(x - 2.4, y - 5.5)
        .lineTo(x + 0.2, y - 4.9)
        .stroke({ width: 0.6, color: palette.brass });
    }
  }
}

/** Successful mid/near art only; legacy/far signals retain their original geometry. */
export const PAINTED_ARMY_FLAG = { poleHeight: 24, clothHeight: 11 } as const;

function drawArmyHeading(g: Graphics, props: ArmyChipProps): void {
  if (props.heading == null) return;
  const geo = ARMY_CHIP_GEOMETRY,
    h = props.heading;
  const alen = props.stage === 'far' ? geo.arrowLengthFar : geo.arrowLength;
  const sx = h.x * geo.arrowGap,
    sy = h.y * geo.arrowGap;
  const ex = sx + h.x * alen,
    ey = sy + h.y * alen;
  g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 2, color: TOKENS_NUM.ink900 });
  const hs = geo.arrowHeadSize,
    px = -h.y,
    py = h.x;
  const backX = ex - h.x * hs,
    backY = ey - h.y * hs;
  g.poly([
    ex,
    ey,
    backX + px * (hs / 2),
    backY + py * (hs / 2),
    backX - px * (hs / 2),
    backY - py * (hs / 2),
  ]).fill({ color: TOKENS_NUM.ink900 });
}

export function drawArmyChip(
  g: Graphics,
  props: ArmyChipProps,
  pass: 'full' | 'rear' | 'front' | 'ground' | 'signals' | 'banner' | 'heading' = 'full',
  profile: 'legacy' | 'painted' = 'legacy',
  includePips = true,
): void {
  const geo = ARMY_CHIP_GEOMETRY;
  const far = props.stage === 'far';
  const near = props.stage === 'near';
  // Only successful mid/near painted bodies use a subordinate cloth footprint.
  // Keep the pole, world anchor, picking, labels and ground semantic channels unchanged.
  const painted = profile === 'painted' && !far;
  const poleHeight = painted ? PAINTED_ARMY_FLAG.poleHeight : geo.poleHeight;
  const flagHeight = painted ? PAINTED_ARMY_FLAG.clothHeight : geo.flagHeight;
  const swallowTail = geo.swallowTail * (painted ? 0.55 : 1);
  const fw = flagWidthForSoldiers(props.soldiers) * (painted ? 0.55 : 1);

  // 敗走（routed）：旗面／腰帶／關係通道以旗桿頂 (0,-poleHeight) 為樞紐順時針旋轉 droopAngleDeg（V8D7）。
  const droop = props.status === 'routed';
  const ang = droop ? (geo.droopAngleDeg * Math.PI) / 180 : 0;
  const sin = Math.sin(ang);
  const cos = Math.cos(ang);
  const pivotY = -poleHeight;
  const rot = (x: number, y: number): [number, number] => {
    if (!droop) return [x, y];
    const dy = y - pivotY;
    // 螢幕座標（y 向下）：正角度視覺順時針；旗尾（x>0）之 y 增大＝下垂。
    return [x * cos - dy * sin, pivotY + x * sin + dy * cos];
  };
  const rotFlat = (pts: ReadonlyArray<readonly [number, number]>): number[] => {
    const flat: number[] = [];
    for (const [x, y] of pts) {
      const [rx, ry] = rot(x, y);
      flat.push(rx, ry);
    }
    return flat;
  };

  // 旗面幾何中心（關係環／選取環／方向箭頭無關；含 droop 旋轉）。
  const cyMid = -poleHeight + flagHeight / 2;
  const [ccx, ccy] = rot(fw / 2, cyMid);

  g.clear();
  if (pass === 'heading') {
    drawArmyHeading(g, props);
    return;
  }

  if (pass !== 'front' && pass !== 'signals' && pass !== 'banner') {
    // Low ground contact ellipse is retained at far LOD; infantry is only mid/near.
    g.ellipse(11, -1, far ? 11 : 15, 3.5).fill({
      color: ARMY_FORMATION_PALETTE.shadow,
      alpha: 0.24,
    });

    // Ground-plane channels precede the infantry, never crossing the helmets or banners.
    if (!far && props.relation === 'friendly') {
      g.ellipse(11, -1, geo.relationRingOuter, 3.6).stroke({
        width: 0.8,
        color: TOKENS_NUM.accentIndigo,
        alpha: 0.55,
      });
      g.ellipse(11, -1, geo.relationRingInner, 2.4).stroke({
        width: 0.6,
        color: TOKENS_NUM.accentIndigo,
        alpha: 0.45,
      });
    }
    if (!far && props.selected) {
      g.ellipse(11, -1, geo.selectRingOuter, 5).stroke({
        width: 1.2,
        color: TOKENS_NUM.accentGold,
        alpha: 0.85,
      });
      g.ellipse(11, -1, geo.selectRingInner, 3.7).stroke({
        width: 0.8,
        color: TOKENS_NUM.accentGold,
        alpha: 0.75,
      });
    }
  }
  if (pass === 'ground') return;
  if (pass !== 'front') {
    // 2. 旗桿
    g.moveTo(0, 0).lineTo(0, -poleHeight).stroke({ width: 2, color: TOKENS_NUM.ink900 });

    // 3. 旗面（燕尾旗；routed 旋轉）
    g.poly(
      rotFlat([
        [0, -poleHeight],
        [fw, -poleHeight],
        [fw - swallowTail, cyMid],
        [fw, -poleHeight + flagHeight],
        [0, -poleHeight + flagHeight],
      ]),
    )
      .fill({ color: clanColorNum(props.colorIndex) })
      .stroke({ width: 1.5, color: TOKENS_NUM.ink900 });

    // corps 腰帶（同旋轉）
    if (props.corps) {
      const bx0 = 1;
      const by0 = cyMid - 1.5;
      const bw = fw - 3;
      const belt: Array<readonly [number, number]> = painted
        ? [
            [bx0, by0],
            [fw - swallowTail * (1 - 3 / flagHeight), by0],
            [fw - swallowTail, cyMid],
            [fw - swallowTail * (1 - 3 / flagHeight), by0 + 3],
            [bx0, by0 + 3],
          ]
        : [
            [bx0, by0],
            [bx0 + bw, by0],
            [bx0 + bw, by0 + 3],
            [bx0, by0 + 3],
          ];
      g.poly(rotFlat(belt)).fill({ color: TOKENS_NUM.ink900 });
    }
  }
  if (pass === 'rear') return;
  if (pass === 'full' && !far) drawInfantryFormation(g, near, props.heading);

  // 4. 高士氣旗結（near-only）：旗桿頂向斜上一段短線。
  if (near && props.morale >= UI.moralePipHigh) {
    const [kx, ky] = rot(0, -poleHeight);
    const [ex, ey] = rot(geo.knotLen * 0.7, -poleHeight - geo.knotLen * 0.7);
    g.moveTo(kx, ky).lineTo(ex, ey).stroke({ width: 2, color: TOKENS_NUM.ink900 });
  }

  // 5. 低士氣破裂外框（near-only）：沿旗面外框內縮 crackInset 之 2–3 段錯位斷線（非閉合）。
  if (near && props.morale < UI.moralePipLow) {
    const ins = geo.crackInset;
    const top = -poleHeight + ins;
    const bot = -poleHeight + flagHeight - ins;
    const left = ins;
    const right = fw - ins;
    const seg = (x1: number, y1: number, x2: number, y2: number): void => {
      const [ax, ay] = rot(x1, y1);
      const [bx, by] = rot(x2, y2);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: TOKENS_NUM.ink900 });
    };
    seg(left, top, left + (right - left) * 0.5, top); // 上緣左半
    if (painted) {
      // Follow both sides of the V notch; a straight vertical crack can escape short cloth.
      const y0 = top + (bot - top) * 0.15;
      const y1 = top + (bot - top) * 0.55;
      const insetX = (y: number): number =>
        fw - swallowTail * (1 - Math.abs(y - cyMid) / (flagHeight / 2)) - ins;
      seg(insetX(y0), y0, insetX(cyMid), cyMid);
      seg(insetX(cyMid), cyMid, insetX(y1), y1);
    } else {
      seg(right, top + (bot - top) * 0.15, right, top + (bot - top) * 0.55); // legacy 右緣中段
    }
    seg(left + (right - left) * 0.3, bot, right, bot); // 下緣右半
  }

  // 6. 敵我關係次級通道（所有 stage；中心同 droop 旋轉）。
  if (props.relation === 'friendly' && far) {
    g.circle(ccx, ccy, geo.relationRingOuter).stroke({
      width: 1.5,
      color: TOKENS_NUM.accentIndigo,
    });
    g.circle(ccx, ccy, geo.relationRingInner).stroke({ width: 1, color: TOKENS_NUM.accentIndigo });
  } else if (props.relation === 'enemy') {
    const tailLen = far ? geo.enemyTailLenFar : geo.enemyTailLen;
    const tailW = far ? geo.enemyTailWidthFar : geo.enemyTailWidth;
    g.poly(
      rotFlat([
        [fw, cyMid - tailW],
        [fw + tailLen, cyMid],
        [fw, cyMid + tailW],
      ]),
    ).fill({ color: TOKENS_NUM.accentVermilion });
  } else if (props.relation === 'neutral') {
    // neutral：旗面右上灰空心菱形。
    const d = geo.neutralDiamond;
    const dcx = fw;
    const dcy = -poleHeight;
    g.poly(
      rotFlat([
        [dcx, dcy - d],
        [dcx + d, dcy],
        [dcx, dcy + d],
        [dcx - d, dcy],
      ]),
    ).stroke({ width: 1.5, color: TOKENS_NUM.neutralClanless });
  }

  // 7. 方向箭頭（heading!==null，所有 stage；不受 droop 影響——routed 無 heading）。
  if (pass !== 'banner') drawArmyHeading(g, props);

  // 8. 狀態 badge（右上單槽；far 隱；selected 或 critical 破例任何 stage）。
  const badge = topBadge(props.status, props.foodDays, props.corps);
  const showBadge = badge !== 'none' && (!far || props.selected || badge === 'critical');
  if (showBadge) {
    drawBadge(g, badge, fw + geo.badgeGap, -poleHeight - geo.badgeGap, geo.badgeSize);
  }

  // 9. 選取金色雙環（selected，所有 stage）。
  if (props.selected && far) {
    g.circle(ccx, ccy, far ? geo.selectRingOuterFar : geo.selectRingOuter).stroke({
      width: 2,
      color: TOKENS_NUM.accentGold,
    });
    g.circle(ccx, ccy, geo.selectRingInner).stroke({ width: 1, color: TOKENS_NUM.accentGold });
  }

  // 10. 士氣 pip（near 或 selected）：置於兵數 washi100 底板下緣之下，並隨 labelStagger 同步錯位，
  //     使不透明底板（plateGfx，z 在 graphics 之上）永不遮蔽士氣點（V8D8／V8D14）。
  if (includePips) drawArmyMoralePips(g, props);
}

function drawArmyMoralePips(g: Graphics, props: ArmyChipProps): void {
  const geo = ARMY_CHIP_GEOMETRY;
  if (props.stage === 'near' || props.selected) {
    const pips = moralePips(props.morale);
    const plateBaseY = 1 + props.labelStagger * (geo.plateHeight + geo.platePadY);
    const pipY = plateBaseY + geo.plateHeight + geo.moraleRadius + 2;
    for (let i = 0; i < 3; i += 1) {
      g.circle(5 + i * 7, pipY, geo.moraleRadius).fill({
        color: i < pips.lit ? pips.color : TOKENS_NUM.ink100,
      });
    }
  }
}

/**
 * 冪等比較器（M6-V4 §3.4 擴充至 M6-V8 §4.2）：`pos` 除外——僅位移不視為需要重繪（`update` 仍會
 * reposition，但不呼叫 `drawArmyChip`）。所有 M6-V8 新視覺欄位（status/foodDays/relation/selected/
 * stage/labelStagger/heading）皆納入比較，使一段行軍／一個 tick 內穩定 → 不造成 per-frame 重繪。
 * 單一真相：供 `createArmyChip` 內部 memo 與測試（`armyChip.spec.ts`）共用。
 */
export function armyChipDrawEqual(a: ArmyChipProps, b: ArmyChipProps): boolean {
  return (
    a.colorIndex === b.colorIndex &&
    a.soldiers === b.soldiers &&
    a.morale === b.morale &&
    a.corps === b.corps &&
    a.collapsedCount === b.collapsedCount &&
    a.status === b.status &&
    a.foodDays === b.foodDays &&
    a.relation === b.relation &&
    a.selected === b.selected &&
    a.stage === b.stage &&
    a.labelStagger === b.labelStagger &&
    headingEqual(a.heading, b.heading)
  );
}

function headingEqual(a: ArmyChipProps['heading'], b: ArmyChipProps['heading']): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.x === b.x && a.y === b.y;
}

function samePos(a: ArmyChipProps['pos'], b: ArmyChipProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

type AnnotationRect = { x: number; y: number; width: number; height: number };
export interface ArmyAnnotationFrames {
  visible: boolean;
  relation: { kind: ArmyRelation; rect: AnnotationRect; visible: boolean };
  state: { text: string; rect: AnnotationRect | null; visible: boolean };
  supply: { level: SupplyLevel; text: string; rect: AnnotationRect | null; visible: boolean };
  number: { text: string; rect: AnnotationRect | null; visible: boolean };
}

/**
 * 建立 ArmyChip 場景元件：繪製欄位變更才重繪，單純位置變更保留圖形。
 * 子節點序維持 leader → bodyGroup → plateGroup；認識印記與狀態文字接在底板、兵數、士氣點之後。
 * 軍旗、士兵與點擊座標不隨像素鎖定註記位移；完整註記寬度供既有排版器使用。
 */
export function createArmyChip(): {
  container: Container;
  update: (props: ArmyChipProps) => boolean;
  setBodyArt: (art: ArmyBodyArt) => void;
  getPlateBounds: () => { x: number; y: number; width: number; height: number } | null;
  /** Actual body/flag local bounds, excluding the independently moved plate and leader. */
  getBodyBounds: () => { x: number; y: number; width: number; height: number } | null;
  readonly depthBody: Container;
  getSoldierBounds: () => { x: number; y: number; width: number; height: number } | null;
  getPaintedProfile: () => {
    painted: boolean;
    /** Painted banner/markings exclude heading/tether; fallback retains legacy bounds. */
    signalBounds: { x: number; y: number; width: number; height: number } | null;
    signalBaselineBounds: { x: number; y: number; width: number; height: number } | null;
  };
  setSignalOffset: (offset: { x: number; y: number }) => boolean;
  getSignalOffset: () => { x: number; y: number };
  attachDepthLayers: (models: Container, ground: Container) => void;
  syncDepthBody: () => void;
  setPlateOffset: (offset: { x: number; y: number }) => boolean;
  setPlateScale: (scale: number) => boolean;
  getPlateTypography: () => { fontSize: number; scale: number };
  /** Reserved painted cells, scaled and offset in chip-local coordinates; not glyph masks. */
  getAnnotationFrames: () => ArmyAnnotationFrames | null;
  /** Actual emitted leader coordinates, chip-local and independent of world placement. */
  getPlateLeader: () => {
    start: { x: number; y: number };
    end: { x: number; y: number };
    visible: boolean;
  };
  destroy: () => void;
} {
  const container = new Container();
  const leader = new Graphics();
  leader.label = 'armyPlateLeader';
  leader.eventMode = 'none';
  leader.visible = false;
  const graphics = new Graphics();
  const bodyGroup = new Container();
  bodyGroup.label = 'armyBody';
  bodyGroup.addChild(graphics);
  const plateGfx = new Graphics(); // V8D14 bounds retained; material follows painted priority.
  const plateGroup = new Container();
  plateGroup.label = 'armyPlate';
  plateGroup.eventMode = 'none';
  const pipGfx = new Graphics();
  const label = new BitmapText({
    text: '',
    style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.washi100 },
  });
  plateGroup.addChild(plateGfx);
  plateGroup.addChild(label);
  plateGroup.addChild(pipGfx);
  const relationGfx = new Graphics();
  relationGfx.label = 'armyAnnotationRelation';
  const stateLabel = new BitmapText({
    text: '',
    style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.washi100 },
  });
  stateLabel.label = 'armyAnnotationState';
  const supplyLabel = new BitmapText({
    text: '',
    style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.washi100 },
  });
  supplyLabel.label = 'armyAnnotationSupply';
  plateGroup.addChild(relationGfx, stateLabel, supplyLabel);
  container.addChild(leader);
  container.addChild(bodyGroup);
  container.addChild(plateGroup);
  // hitArea 以最大旗幅（flagWidthLarge）計，與旗幅級距無關、尺寸穩定（V8D14 §4.3）。
  container.hitArea = new Rectangle(
    -ARMY_CHIP_GEOMETRY.hitPadding,
    -ARMY_CHIP_GEOMETRY.poleHeight - ARMY_CHIP_GEOMETRY.hitPadding,
    ARMY_CHIP_GEOMETRY.flagWidthLarge + ARMY_CHIP_GEOMETRY.hitPadding * 2,
    ARMY_CHIP_GEOMETRY.poleHeight + ARMY_CHIP_GEOMETRY.hitPadding * 2,
  );
  let last: ArmyChipProps | null = null;
  let art: ArmyBodyArt = {};
  let sprite: Sprite | null = null;
  let lightSprite: Sprite | null = null;
  let foreground: Graphics | null = null;
  let signalGroup: Container | null = null;
  let banner: Graphics | null = null;
  let heading: Graphics | null = null;
  let signalTether: Graphics | null = null;
  let signalOffset = { x: 0, y: 0 };
  let paintedSignals = false;
  let plateBounds: { x: number; y: number; width: number; height: number } | null = null;
  let offset = { x: 0, y: 0 };
  let leaderEndpoints = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, visible: false };
  let destroyed = false;
  let detached = false;
  let ordinaryPlateMaterial = false;
  let annotationWidth = 0;
  let annotationCells: {
    relation: AnnotationRect;
    state: AnnotationRect | null;
    supply: AnnotationRect | null;
    number: AnnotationRect | null;
  } | null = null;
  const syncPlateMaterial = (props: ArmyChipProps, redraw = false): void => {
    const ordinary =
      paintedSignals &&
      props.stage !== 'far' &&
      !props.selected &&
      props.status !== 'routed' &&
      props.status !== 'engaged' &&
      props.status !== 'sieging' &&
      supplyLevel(props.foodDays) === 'ok';
    if (!redraw && ordinary === ordinaryPlateMaterial) return;
    ordinaryPlateMaterial = ordinary;
    const ink = ordinary ? TOKENS_NUM.ink900 : TOKENS_NUM.washi100;
    if (label.style.fill !== ink) label.style.fill = ink;
    if (stateLabel.style.fill !== ink) stateLabel.style.fill = ink;
    if (supplyLabel.style.fill !== ink) supplyLabel.style.fill = ink;
    plateGfx.clear();
    if (!plateGfx.visible) return;
    // A self-contained relation seal needs no empty FAR register behind it.
    if (
      props.stage === 'far' &&
      !props.selected &&
      (props.collapsedCount ?? 0) === 0 &&
      !stateLabel.visible &&
      !supplyLabel.visible
    )
      return;
    const baseY =
      1 + props.labelStagger * (ARMY_CHIP_GEOMETRY.plateHeight + ARMY_CHIP_GEOMETRY.platePadY);
    plateGfx
      .roundRect(
        0,
        baseY,
        annotationWidth,
        ARMY_CHIP_GEOMETRY.plateHeight,
        ARMY_CHIP_GEOMETRY.plateRadius,
      )
      .fill({ color: ordinary ? 0xb9aa88 : TOKENS_NUM.ink900 })
      .stroke({
        width: 1,
        color: ordinary ? TOKENS_NUM.ink700 : TOKENS_NUM.washi100,
        alpha: ordinary ? 0.26 : 0.28,
      });
  };
  const depthBody = new Container();
  depthBody.eventMode = 'none';
  const infantry = new Graphics();
  depthBody.addChild(infantry);
  const ground = new Graphics();
  ground.eventMode = 'none';
  const syncDepthBody = (): void => {
    if (!detached) return;
    for (const visual of [depthBody, ground]) {
      visual.position.set(container.position.x, container.position.y);
      visual.scale.set(container.scale.x, container.scale.y);
      visual.visible = container.visible;
    }
  };
  const updateLeader = (): void => {
    leader.clear();
    leaderEndpoints = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, visible: false };
    leader.visible = plateBounds !== null && (offset.x !== 0 || offset.y !== 0);
    if (!leader.visible || plateBounds === null) return;
    const scale = plateGroup.scale.x;
    const left = offset.x + plateBounds.x * scale;
    const top = offset.y + plateBounds.y * scale;
    const x = Math.max(left, Math.min(0, left + plateBounds.width * scale));
    const y = Math.max(top, Math.min(0, top + plateBounds.height * scale));
    leaderEndpoints = { start: { x: 0, y: 0 }, end: { x, y }, visible: true };
    leader
      .moveTo(leaderEndpoints.start.x, leaderEndpoints.start.y)
      .lineTo(leaderEndpoints.end.x, leaderEndpoints.end.y)
      .stroke({ width: 0.75, color: TOKENS_NUM.ink900, alpha: 0.55 });
  };
  const drawBody = (props: ArmyChipProps): void => {
    const selected = props.stage !== 'far' ? art[armyFacing(props.heading)] : undefined;
    if (!selected) {
      paintedSignals = false;
      signalOffset = { x: 0, y: 0 };
      signalGroup?.position.set(0, 0);
      if (signalGroup) signalGroup.visible = false;
      if (heading) heading.visible = false;
      if (signalTether) signalTether.visible = false;
      if (sprite) sprite.visible = false;
      if (lightSprite) lightSprite.visible = false;
      if (foreground) foreground.visible = false;
      if (detached) {
        drawArmyChip(ground, props, 'ground', 'legacy', false);
        drawArmyChip(graphics, props, 'signals', 'legacy', false);
        infantry.clear();
        if (props.stage !== 'far')
          drawInfantryFormation(infantry, props.stage === 'near', props.heading);
      } else drawArmyChip(graphics, props, 'full', 'legacy', false);
      return;
    }
    if (!sprite) {
      sprite = new Sprite(selected.texture);
      sprite.eventMode = 'none';
      (detached ? depthBody : bodyGroup).addChild(sprite);
      foreground = new Graphics();
      foreground.eventMode = 'none';
      bodyGroup.addChild(foreground);
    }
    if (!lightSprite && props.stage === 'mid') {
      lightSprite = new Sprite(selected.texture);
      lightSprite.label = 'armyBodyLight';
      lightSprite.eventMode = 'none';
      lightSprite.blendMode = 'add';
      lightSprite.alpha = ARMY_BODY_MID_LIGHT_ALPHA;
      if (detached) depthBody.addChild(lightSprite);
      else {
        // A later mid admission must still paint beneath the already-created semantic signals.
        bodyGroup.addChildAt(
          lightSprite,
          signalGroup ? bodyGroup.getChildIndex(signalGroup) : bodyGroup.children.length,
        );
      }
    }
    if (!signalGroup) {
      signalTether = new Graphics();
      signalTether.label = 'armySignalTether';
      signalTether.eventMode = 'none';
      graphics.addChild(signalTether);
      signalGroup = new Container();
      signalGroup.label = 'armySignals';
      signalGroup.eventMode = 'none';
      banner = new Graphics();
      signalGroup.addChild(banner);
      bodyGroup.addChild(signalGroup);
      heading = new Graphics();
      heading.label = 'armyHeading';
      heading.eventMode = 'none';
      bodyGroup.addChild(heading);
    }
    paintedSignals = true;
    signalGroup.visible = true;
    if (heading) {
      heading.visible = true;
      drawArmyChip(heading, props, 'heading', 'painted', false);
    }
    const placement = armyBodyArtPlacement(selected.spec, props.stage === 'mid' ? 'mid' : 'near');
    sprite.texture = selected.texture;
    sprite.scale.set(placement.scale);
    sprite.position.set(placement.x, placement.y);
    sprite.visible = true;
    if (lightSprite) {
      lightSprite.texture = selected.texture;
      lightSprite.scale.set(placement.scale);
      lightSprite.position.set(placement.x, placement.y);
      lightSprite.visible = props.stage === 'mid';
    }
    infantry.clear();
    if (detached) drawArmyChip(ground, props, 'ground', 'painted', false);
    if (detached) graphics.clear();
    else drawArmyChip(graphics, props, 'ground', 'painted', false);
    if (banner) drawArmyChip(banner, props, 'banner', 'painted', false);
    if (foreground) {
      foreground.visible = false;
      foreground.clear();
    }
  };
  return {
    container,
    depthBody,
    getPaintedProfile() {
      if (destroyed || !last)
        return { painted: false, signalBounds: null, signalBaselineBounds: null };
      const painted =
        !destroyed &&
        last !== null &&
        last.stage !== 'far' &&
        art[armyFacing(last.heading)] !== undefined;
      const sources =
        painted && banner ? [banner] : [graphics, ...(foreground?.visible ? [foreground] : [])];
      const bounds = sources.flatMap((g) =>
        typeof g.getLocalBounds === 'function' ? [g.getLocalBounds()] : [],
      );
      if (bounds.length === 0) return { painted, signalBounds: null, signalBaselineBounds: null };
      const x = Math.min(...bounds.map((r) => r.x)),
        y = Math.min(...bounds.map((r) => r.y));
      const baseline = {
        x,
        y,
        width: Math.max(...bounds.map((r) => r.x + r.width)) - x,
        height: Math.max(...bounds.map((r) => r.y + r.height)) - y,
      };
      return {
        painted,
        signalBaselineBounds: baseline,
        signalBounds: { ...baseline, x: x + signalOffset.x, y: y + signalOffset.y },
      };
    },
    getSignalOffset: () => ({ ...signalOffset }),
    setSignalOffset(value): boolean {
      if (destroyed || !paintedSignals || !Number.isFinite(value.x) || !Number.isFinite(value.y))
        return false;
      if (signalOffset.x === value.x && signalOffset.y === value.y) return false;
      signalOffset = { ...value };
      signalGroup?.position.set(value.x, value.y);
      if (signalTether) {
        signalTether.clear();
        signalTether.visible = value.x !== 0 || value.y !== 0;
        if (signalTether.visible)
          signalTether
            .moveTo(0, 0)
            .lineTo(value.x, value.y)
            .stroke({ width: 0.75, color: TOKENS_NUM.ink900, alpha: 0.42 });
      }
      return true;
    },
    getSoldierBounds() {
      if (destroyed || !last || last.stage === 'far') return null;
      const selected = art[armyFacing(last.heading)];
      if (selected) {
        const placement = armyBodyArtPlacement(
            selected.spec,
            last.stage === 'mid' ? 'mid' : 'near',
          ),
          frame = selected.spec.contentBounds;
        return {
          x: placement.x + frame.x * placement.scale,
          y: placement.y + frame.y * placement.scale,
          width: frame.width * placement.scale,
          height: frame.height * placement.scale,
        };
      }
      if (typeof infantry.getLocalBounds !== 'function') return null;
      const rect = infantry.getLocalBounds();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    syncDepthBody,
    attachDepthLayers(models, groundLayer): void {
      if (detached) return;
      detached = true;
      models.addChild(depthBody);
      groundLayer.addChild(ground);
      if (sprite) {
        sprite.parent?.removeChild(sprite);
        depthBody.addChild(sprite);
      }
      if (lightSprite) {
        lightSprite.parent?.removeChild(lightSprite);
        depthBody.addChild(lightSprite);
      }
      if (last) drawBody(last);
      syncDepthBody();
    },
    getPlateBounds() {
      if (destroyed || plateBounds === null) return null;
      const scale = plateGroup.scale.x;
      return {
        x: plateBounds.x * scale,
        y: plateBounds.y * scale,
        width: plateBounds.width * scale,
        height: plateBounds.height * scale,
      };
    },
    getPlateTypography: () => ({ fontSize: label.style.fontSize, scale: plateGroup.scale.x }),
    getAnnotationFrames() {
      if (destroyed || last === null || annotationCells === null) return null;
      const visible = container.visible && plateGroup.visible;
      const transform = (rect: AnnotationRect | null): AnnotationRect | null =>
        rect === null
          ? null
          : {
              x: offset.x + rect.x * plateGroup.scale.x,
              y: offset.y + rect.y * plateGroup.scale.y,
              width: rect.width * plateGroup.scale.x,
              height: rect.height * plateGroup.scale.y,
            };
      return {
        visible,
        relation: {
          kind: last.relation,
          rect: transform(annotationCells.relation)!,
          visible: visible && relationGfx.visible,
        },
        state: {
          text: stateLabel.text,
          rect: transform(annotationCells.state),
          visible: visible && stateLabel.visible,
        },
        supply: {
          level: supplyLevel(last.foodDays),
          text: supplyLabel.text,
          rect: transform(annotationCells.supply),
          visible: visible && supplyLabel.visible,
        },
        number: {
          text: label.text,
          rect: transform(annotationCells.number),
          visible: visible && label.visible,
        },
      };
    },
    getPlateLeader: () => ({
      start: { ...leaderEndpoints.start },
      end: { ...leaderEndpoints.end },
      visible: leaderEndpoints.visible,
    }),
    setPlateScale(value): boolean {
      if (destroyed || !Number.isFinite(value) || value <= 0 || value === plateGroup.scale.x)
        return false;
      plateGroup.scale.set(value);
      updateLeader();
      return true;
    },
    getBodyBounds() {
      if (destroyed || last === null || typeof bodyGroup.getLocalBounds !== 'function') return null;
      const bounds = bodyGroup.getLocalBounds();
      if (detached && typeof depthBody.getLocalBounds === 'function') {
        const model = depthBody.getLocalBounds();
        const x = Math.min(bounds.x, model.x),
          y = Math.min(bounds.y, model.y);
        return {
          x,
          y,
          width: Math.max(bounds.x + bounds.width, model.x + model.width) - x,
          height: Math.max(bounds.y + bounds.height, model.y + model.height) - y,
        };
      }
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    },
    setPlateOffset(value): boolean {
      if (destroyed || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return false;
      if (value.x === offset.x && value.y === offset.y) return false;
      offset = { x: value.x, y: value.y };
      plateGroup.position.set(offset.x, offset.y);
      updateLeader();
      return true;
    },
    setBodyArt(value): void {
      if (destroyed || art === value) return;
      art = value;
      if (last) {
        drawBody(last);
        syncPlateMaterial(last);
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      leaderEndpoints = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, visible: false };
      signalOffset = { x: 0, y: 0 };
      for (const visual of [banner, heading, signalTether]) {
        visual?.parent?.removeChild(visual);
        visual?.destroy({ children: true, context: true, texture: false, textureSource: false });
      }
      if (sprite) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy({ texture: false, textureSource: false });
        sprite = null;
      }
      if (lightSprite) {
        lightSprite.parent?.removeChild(lightSprite);
        lightSprite.destroy({ texture: false, textureSource: false });
        lightSprite = null;
      }
      relationGfx.parent?.removeChild(relationGfx);
      relationGfx.destroy({ context: true });
      for (const text of [stateLabel, supplyLabel]) {
        text.parent?.removeChild(text);
        text.destroy({ style: true });
      }
      container.destroy({ children: true });
      depthBody.parent?.removeChild(depthBody);
      ground.parent?.removeChild(ground);
      depthBody.destroy({ children: true });
      ground.destroy();
    },
    update(props): boolean {
      if (destroyed) return false;
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      syncDepthBody();
      if (last !== null && armyChipDrawEqual(last, props)) {
        last = props;
        return false;
      }
      drawBody(props);
      // 兵數 label：far 隱藏（selected／collapsed 破例）；collapsedCount 優先（+N，任何 stage）；
      // mid 縮寫；near/其他 精確。
      const showLabel = props.stage !== 'far' || props.selected || (props.collapsedCount ?? 0) > 0;
      label.visible = showLabel;
      plateGfx.visible = true;
      plateGroup.visible = true;
      if (props.collapsedCount !== undefined && props.collapsedCount > 0) {
        label.text = `+${props.collapsedCount}`;
      } else if (props.stage === 'mid') {
        label.text = abbreviateTroops(props.soldiers);
      } else {
        label.text = formatArmyTroops(props.soldiers);
      }
      const baseY =
        1 + props.labelStagger * (ARMY_CHIP_GEOMETRY.plateHeight + ARMY_CHIP_GEOMETRY.platePadY);
      const cell = (x: number, width: number): AnnotationRect => ({
        x,
        y: baseY,
        width,
        height: ARMY_CHIP_GEOMETRY.plateHeight,
      });
      stateLabel.text =
        props.status === 'routed'
          ? '退'
          : props.status === 'engaged'
            ? '戰'
            : props.status === 'sieging'
              ? '圍'
              : props.status === 'subjugating'
                ? '討'
                : props.corps
                  ? '軍'
                  : '';
      const level = supplyLevel(props.foodDays);
      supplyLabel.text = level === 'critical' ? '糧!' : level === 'low' ? '糧' : '';
      stateLabel.visible = stateLabel.text !== '';
      supplyLabel.visible = supplyLabel.text !== '';
      const hasPips = props.stage === 'near' || props.selected;
      const numberWidth = showLabel
        ? Math.max(plateWidthForLabel(label.text), hasPips ? 21 : 0)
        : 0;
      let nextX = 12 + numberWidth;
      const stateCell = stateLabel.visible ? cell(nextX, 14) : null;
      if (stateCell) nextX += stateCell.width;
      const supplyCell = supplyLabel.visible ? cell(nextX, level === 'critical' ? 20 : 14) : null;
      if (supplyCell) nextX += supplyCell.width;
      annotationWidth = nextX;
      annotationCells = {
        relation: cell(0, 12),
        number: showLabel ? cell(12, numberWidth) : null,
        state: stateCell,
        supply: supplyCell,
      };
      label.position.set(12 + ARMY_CHIP_GEOMETRY.platePadX, baseY + 1);
      stateLabel.position.set((stateCell?.x ?? 0) + 1, baseY + 1);
      supplyLabel.position.set((supplyCell?.x ?? 0) + 1, baseY + 1);
      relationGfx.clear();
      const cy = baseY + 7.5;
      if (props.relation === 'friendly') {
        relationGfx
          .circle(6, cy, 4.5)
          .fill({ color: TOKENS_NUM.washi100 })
          .stroke({ width: 1.25, color: TOKENS_NUM.ink900 });
        relationGfx.circle(6, cy, 2.5).stroke({ width: 1.25, color: TOKENS_NUM.ink900 });
      } else if (props.relation === 'enemy') {
        relationGfx
          .poly([1, cy - 5, 11, cy - 5, 10, cy + 1, 6, cy + 5, 2, cy + 1])
          .fill({ color: TOKENS_NUM.washi100 })
          .stroke({ width: 1.25, color: TOKENS_NUM.ink900 });
      } else {
        relationGfx
          .poly([6, cy - 5, 11, cy, 6, cy + 5, 1, cy])
          .fill({ color: TOKENS_NUM.washi100 })
          .stroke({ width: 1.25, color: TOKENS_NUM.ink900 });
        relationGfx
          .poly([6, cy - 2.5, 8.5, cy, 6, cy + 2.5, 3.5, cy])
          .fill({ color: TOKENS_NUM.ink900 });
      }
      syncPlateMaterial(props, true);
      pipGfx.clear();
      drawArmyMoralePips(pipGfx, props);
      // Preserve the full-sized legacy circles; pack only their annotation container.
      pipGfx.position.set(12, -0.75);
      {
        const bottom = hasPips
          ? baseY + ARMY_CHIP_GEOMETRY.plateHeight + 2 * ARMY_CHIP_GEOMETRY.moraleRadius + 2 - 0.75
          : baseY + ARMY_CHIP_GEOMETRY.plateHeight + 0.5;
        plateBounds = {
          x: -0.5,
          y: baseY - 0.5,
          width: annotationWidth + 1,
          height: bottom - baseY + 0.5,
        };
      }
      updateLeader();
      last = props;
      return true;
    },
  };
}
