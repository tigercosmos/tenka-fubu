// SelectionRing —— 選取光圈場景元件。
//
// 規格：plan/12-ui-components.md §3.3.4（原樣依循：半徑=目標命中半徑+6、線寬、色 gold；
// 「同時間僅一個選取目標…主選對象環加粗至 3px」）、§4（`ScenePart<P>` 工廠介面）。
// 18-roadmap.md M2-16（12-T10 部分）。
//
// 範圍（本批次）：脈動動畫（scale 1.00→1.08→1.00、alpha 0.9→0.6→0.9，週期 1200ms
// `--ease-in-out`；reduce-motion 靜止實環）需要逐幀 ticker 驅動（尚未整合，見 castleNode.ts
// 檔頭同款說明）。本檔繪製的即為該動畫的靜止終態幾何（半徑/線寬/色），與 reduce-motion 規則
// 下應顯示的靜態實環完全一致；動效整合時（M2-17+）在此之上以 `container.scale`/`alpha`
// 疊加補間，不需更動本檔繪製參數。

import { Container, Graphics } from 'pixi.js';
import { TOKENS_NUM } from '@ui/styles/tokens';
import type { ScenePart } from '@ui/components/types';

/** §3.3.4 表：選取光圈幾何（world unit）。 */
export const SELECTION_RING_GEOMETRY = {
  paddingRadius: 6, // 半徑 = 目標命中半徑 + 6
  strokeWidthNormal: 2,
  strokeWidthPrimary: 3, // 多選時主選對象環加粗
} as const;

export interface SelectionRingProps {
  /** 世界座標（供工廠將 `container.position` 對齊；純繪製函式不消費本欄位，繪於局部原點）。 */
  readonly pos: { readonly x: number; readonly y: number };
  /** 目標命中半徑（world unit；04 §3.12.1／`MAPVIEW.hitRadius.*`，由呼叫端依節點種類解析後傳入）。 */
  readonly targetHitRadius: number;
  /** 主選對象（單選情境恆為 true；多選部隊時僅主選對象環加粗，12 §3.3.4）。 */
  readonly primary: boolean;
}

/** 純繪製函式（12 §3.3.4）：半徑=命中半徑+6 的金色圓環。局部座標系（中心為原點）。 */
export function drawSelectionRing(g: Graphics, props: SelectionRingProps): void {
  g.clear();
  const radius = props.targetHitRadius + SELECTION_RING_GEOMETRY.paddingRadius;
  const width = props.primary
    ? SELECTION_RING_GEOMETRY.strokeWidthPrimary
    : SELECTION_RING_GEOMETRY.strokeWidthNormal;
  g.circle(0, 0, radius).stroke({ width, color: TOKENS_NUM.accentGold });
}

function samePropsExceptPos(a: SelectionRingProps, b: SelectionRingProps): boolean {
  return a.targetHitRadius === b.targetHitRadius && a.primary === b.primary;
}

function samePos(a: SelectionRingProps['pos'], b: SelectionRingProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 工廠（12 §4：`ScenePart<P>`）：建立選取光圈的 `Container`（世界定位）＋內部 `Graphics`。 */
export function createSelectionRing(): ScenePart<SelectionRingProps> {
  const container = new Container();
  container.label = 'selectionRing';
  const gfx = new Graphics();
  container.addChild(gfx);

  let last: SelectionRingProps | null = null;

  return {
    container,
    update(props: SelectionRingProps): void {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      if (last !== null && samePropsExceptPos(last, props)) {
        last = props;
        return;
      }
      drawSelectionRing(gfx, props);
      last = props;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
