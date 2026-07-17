import { BitmapText, Container, Graphics, Rectangle } from 'pixi.js';
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

export function drawArmyChip(g: Graphics, props: ArmyChipProps): void {
  const geo = ARMY_CHIP_GEOMETRY;
  const { poleHeight, flagHeight, swallowTail, moraleRadius } = geo;
  const far = props.stage === 'far';
  const near = props.stage === 'near';
  const fw = flagWidthForSoldiers(props.soldiers);

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
    g.poly(
      rotFlat([
        [bx0, by0],
        [bx0 + bw, by0],
        [bx0 + bw, by0 + 3],
        [bx0, by0 + 3],
      ]),
    ).fill({ color: TOKENS_NUM.ink900 });
  }

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
    seg(right, top + (bot - top) * 0.15, right, top + (bot - top) * 0.55); // 右緣中段
    seg(left + (right - left) * 0.3, bot, right, bot); // 下緣右半
  }

  // 6. 敵我關係次級通道（所有 stage；中心同 droop 旋轉）。
  if (props.relation === 'friendly') {
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
  } else {
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
  if (props.heading !== null) {
    const h = props.heading;
    const alen = far ? geo.arrowLengthFar : geo.arrowLength;
    const sx = h.x * geo.arrowGap;
    const sy = h.y * geo.arrowGap;
    const ex = sx + h.x * alen;
    const ey = sy + h.y * alen;
    g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 2, color: TOKENS_NUM.ink900 });
    const hs = geo.arrowHeadSize;
    const px = -h.y; // 垂直單位向量
    const py = h.x;
    const backX = ex - h.x * hs;
    const backY = ey - h.y * hs;
    g.poly([
      ex,
      ey,
      backX + px * (hs / 2),
      backY + py * (hs / 2),
      backX - px * (hs / 2),
      backY - py * (hs / 2),
    ]).fill({ color: TOKENS_NUM.ink900 });
  }

  // 8. 狀態 badge（右上單槽；far 隱；selected 或 critical 破例任何 stage）。
  const badge = topBadge(props.status, props.foodDays, props.corps);
  const showBadge = badge !== 'none' && (!far || props.selected || badge === 'critical');
  if (showBadge) {
    drawBadge(g, badge, fw + geo.badgeGap, -poleHeight - geo.badgeGap, geo.badgeSize);
  }

  // 9. 選取金色雙環（selected，所有 stage）。
  if (props.selected) {
    g.circle(ccx, ccy, far ? geo.selectRingOuterFar : geo.selectRingOuter).stroke({
      width: 2,
      color: TOKENS_NUM.accentGold,
    });
    g.circle(ccx, ccy, geo.selectRingInner).stroke({ width: 1, color: TOKENS_NUM.accentGold });
  }

  // 10. 士氣 pip（near 或 selected；位置不變）。
  if (near || props.selected) {
    const pips = moralePips(props.morale);
    for (let i = 0; i < 3; i += 1) {
      g.circle(5 + i * 7, 15, moraleRadius).fill({
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
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}

function samePos(a: ArmyChipProps['pos'], b: ArmyChipProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * 建立 ArmyChip 場景元件：`update` 為冪等（M6-V4 §3.4，仿 `castleNode.ts`），回傳「是否實際重繪
 * 圖形」（`drawArmyChip` 有無被呼叫）——首繪（`last===null`）必為 `true`；只 `pos` 變更→僅
 * `container.position.set`、回傳 `false`（DoD③：移動不重繪）；繪製欄位變更→重繪並回傳 `true`。
 *
 * 子節點序（M6-V8 V8D14）：graphics（旗）→ plateGfx（兵數 washi100 底板）→ label（BitmapText），
 * 使底板壓在旗之上、字壓在底板之上。底板隨 `update` 依 soldiers/collapsedCount/stage/labelStagger
 * 重畫（皆已在 `armyChipDrawEqual` 判定內），不新增 `ArmyChipProps` 欄位。
 */
export function createArmyChip(): {
  container: Container;
  update: (props: ArmyChipProps) => boolean;
} {
  const container = new Container();
  const graphics = new Graphics();
  const plateGfx = new Graphics(); // V8D14：兵數 washi100 底板
  const label = new BitmapText({
    text: '',
    style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.ink900 },
  });
  container.addChild(graphics);
  container.addChild(plateGfx);
  container.addChild(label);
  // hitArea 以最大旗幅（flagWidthLarge）計，與旗幅級距無關、尺寸穩定（V8D14 §4.3）。
  container.hitArea = new Rectangle(
    -ARMY_CHIP_GEOMETRY.hitPadding,
    -ARMY_CHIP_GEOMETRY.poleHeight - ARMY_CHIP_GEOMETRY.hitPadding,
    ARMY_CHIP_GEOMETRY.flagWidthLarge + ARMY_CHIP_GEOMETRY.hitPadding * 2,
    ARMY_CHIP_GEOMETRY.poleHeight + ARMY_CHIP_GEOMETRY.hitPadding * 2,
  );
  let last: ArmyChipProps | null = null;
  return {
    container,
    update(props): boolean {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      if (last !== null && armyChipDrawEqual(last, props)) {
        last = props;
        return false;
      }
      drawArmyChip(graphics, props);
      // 兵數 label：far 隱藏（selected／collapsed 破例）；collapsedCount 優先（+N，任何 stage）；
      // mid 縮寫；near/其他 精確。
      const showLabel = props.stage !== 'far' || props.selected || (props.collapsedCount ?? 0) > 0;
      label.visible = showLabel;
      plateGfx.visible = showLabel;
      if (props.collapsedCount !== undefined && props.collapsedCount > 0) {
        label.text = `+${props.collapsedCount}`;
      } else if (props.stage === 'mid') {
        label.text = abbreviateTroops(props.soldiers);
      } else {
        label.text = formatArmyTroops(props.soldiers);
      }
      plateGfx.clear();
      if (showLabel) {
        // 同節點兵數底板以 stackIndex 垂直錯位（本地 y，世界座標不變；V8D14）。
        const baseY =
          1 + props.labelStagger * (ARMY_CHIP_GEOMETRY.plateHeight + ARMY_CHIP_GEOMETRY.platePadY);
        plateGfx
          .roundRect(
            0,
            baseY,
            plateWidthForLabel(label.text),
            ARMY_CHIP_GEOMETRY.plateHeight,
            ARMY_CHIP_GEOMETRY.plateRadius,
          )
          .fill({ color: TOKENS_NUM.washi100 })
          .stroke({ width: 1, color: TOKENS_NUM.ink700 });
        label.position.set(ARMY_CHIP_GEOMETRY.platePadX, baseY + 1);
      }
      last = props;
      return true;
    },
  };
}
