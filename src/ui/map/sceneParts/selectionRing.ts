// SelectionRing —— 選取光圈場景元件（金色雙環，錨點置中）。
//
// 規格：docs/design/m6-v7-castles.md CD5＋art-bible §6.4「選取：金色雙環」（優先於 plan/12
// §3.3.4「單環」——設計裁定改繪雙同心金環）、§4（`ScenePart<P>` 工廠介面）。
// 18-roadmap.md M2-16（12-T10 部分）／M6-V7 Slice B。
//
// 範圍（本批次）：脈動動畫（scale 1.00→1.08→1.00、alpha 0.9→0.6→0.9，週期 1200ms
// `--ease-in-out`；reduce-motion 靜止實環）需要逐幀 ticker 驅動——依 M6-V7 CD7「決定論優先」
// 延後。本檔繪製的即為該動畫的靜止終態幾何（雙環半徑/線寬/色），與 reduce-motion 規則下
// 應顯示的靜態實環完全一致；動效整合時（特效里程碑）在此之上以 `container.scale`/`alpha`
// 疊加補間，不需更動本檔繪製參數。錨點置中（art-bible §7）：繪於局部原點，投影不影響定位。

import { Container, Graphics } from 'pixi.js';
import { TOKENS_NUM } from '@ui/styles/tokens';
import type { ScenePart } from '@ui/components/types';

/** §3.3.4／M6-V7 CD5 表：選取光圈幾何（world unit）——金色雙同心環。 */
export const SELECTION_RING_GEOMETRY = {
  paddingRadius: 6, // 外環半徑 = 目標命中半徑 + 6
  innerGap: 4, // 內環半徑 = 目標命中半徑 + 6 - innerGap（= 命中半徑 + 2）
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

/**
 * 純繪製函式（M6-V7 CD5／art-bible §6.4）：金色雙同心環。局部座標系（中心為原點）。
 * 外環半徑＝命中半徑＋paddingRadius；內環半徑＝命中半徑＋paddingRadius−innerGap。
 */
export function drawSelectionRing(g: Graphics, props: SelectionRingProps): void {
  g.clear();
  const outerRadius = props.targetHitRadius + SELECTION_RING_GEOMETRY.paddingRadius;
  const innerRadius = outerRadius - SELECTION_RING_GEOMETRY.innerGap;
  const width = props.primary
    ? SELECTION_RING_GEOMETRY.strokeWidthPrimary
    : SELECTION_RING_GEOMETRY.strokeWidthNormal;
  g.circle(0, 0, outerRadius).stroke({ width, color: TOKENS_NUM.accentGold });
  g.circle(0, 0, innerRadius).stroke({ width, color: TOKENS_NUM.accentGold });
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
