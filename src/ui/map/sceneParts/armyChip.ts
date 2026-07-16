import { BitmapText, Container, Graphics, Rectangle } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';

export interface ArmyChipProps {
  pos: { x: number; y: number };
  colorIndex: number;
  soldiers: number;
  morale: number;
  corps: boolean;
  collapsedCount?: number;
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
} as const;

export function formatArmyTroops(soldiers: number): string {
  const value = Math.max(0, Math.round(soldiers));
  return value.toLocaleString('en-US');
}

export function moralePips(morale: number): { lit: number; color: number } {
  if (morale >= UI.moralePipHigh) return { lit: 3, color: TOKENS_NUM.accentMossBright };
  if (morale >= UI.moralePipLow) return { lit: 2, color: TOKENS_NUM.accentGold };
  return { lit: 1, color: TOKENS_NUM.accentVermilionBright };
}

export function drawArmyChip(g: Graphics, props: ArmyChipProps): void {
  const { flagWidth, flagHeight, swallowTail, poleHeight, moraleRadius } = ARMY_CHIP_GEOMETRY;
  g.clear();
  g.moveTo(0, 0).lineTo(0, -poleHeight).stroke({ width: 2, color: TOKENS_NUM.ink900 });
  g.poly([
    0,
    -poleHeight,
    flagWidth,
    -poleHeight,
    flagWidth - swallowTail,
    -poleHeight + flagHeight / 2,
    flagWidth,
    -poleHeight + flagHeight,
    0,
    -poleHeight + flagHeight,
  ])
    .fill({ color: clanColorNum(props.colorIndex) })
    .stroke({ width: 1.5, color: TOKENS_NUM.ink900 });
  if (props.corps) {
    g.rect(1, -poleHeight + flagHeight / 2 - 1.5, flagWidth - 3, 3).fill({
      color: TOKENS_NUM.ink900,
    });
  }
  const pips = moralePips(props.morale);
  for (let i = 0; i < 3; i += 1) {
    g.circle(5 + i * 7, 15, moraleRadius).fill({
      color: i < pips.lit ? pips.color : TOKENS_NUM.ink100,
    });
  }
}

/**
 * 冪等比較器（M6-V4 §3.4）：`pos` 除外——僅位移不視為需要重繪（`update` 仍會 reposition，
 * 但不呼叫 `drawArmyChip`）；label 文字由 `soldiers`/`collapsedCount` 決定，故一併比較。
 * 單一真相：供 `createArmyChip` 內部 memo 與測試（`armyChip.spec.ts`）共用。
 */
export function armyChipDrawEqual(a: ArmyChipProps, b: ArmyChipProps): boolean {
  return (
    a.colorIndex === b.colorIndex &&
    a.soldiers === b.soldiers &&
    a.morale === b.morale &&
    a.corps === b.corps &&
    a.collapsedCount === b.collapsedCount
  );
}

function samePos(a: ArmyChipProps['pos'], b: ArmyChipProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * 建立 ArmyChip 場景元件：`update` 為冪等（M6-V4 §3.4，仿 `castleNode.ts`），回傳「是否實際重繪
 * 圖形」（`drawArmyChip` 有無被呼叫）——首繪（`last===null`）必為 `true`；只 `pos` 變更→僅
 * `container.position.set`、回傳 `false`（DoD③：移動不重繪）；繪製欄位變更→重繪並回傳 `true`。
 */
export function createArmyChip(): {
  container: Container;
  update: (props: ArmyChipProps) => boolean;
} {
  const container = new Container();
  const graphics = new Graphics();
  const label = new BitmapText({
    text: '',
    style: { fontFamily: 'Noto Serif TC', fontSize: 12, fill: TOKENS_NUM.ink900 },
  });
  label.position.set(2, 1);
  container.addChild(graphics);
  container.addChild(label);
  container.hitArea = new Rectangle(
    -ARMY_CHIP_GEOMETRY.hitPadding,
    -ARMY_CHIP_GEOMETRY.poleHeight - ARMY_CHIP_GEOMETRY.hitPadding,
    ARMY_CHIP_GEOMETRY.flagWidth + ARMY_CHIP_GEOMETRY.hitPadding * 2,
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
      label.text =
        props.collapsedCount && props.collapsedCount > 0
          ? `+${props.collapsedCount}`
          : formatArmyTroops(props.soldiers);
      last = props;
      return true;
    },
  };
}
