// Model-first selection: shallow double gold ground ellipses behind node bodies.
// Art bible §6.4.1 supersedes the previous roof-crossing circular CD5 profile.
// The container keeps the exact actor anchor; local y=4 expresses the ground plane.
// This static profile is identical under reduced motion and introduces no ticker.

import { Container, Graphics } from 'pixi.js';
import { TOKENS_NUM } from '@ui/styles/tokens';
import type { ScenePart } from '@ui/components/types';

/** Ground-plane selection geometry, in world units; picking radii are unchanged. */
export const SELECTION_RING_GEOMETRY = {
  paddingRadius: 4,
  innerGap: 3,
  groundY: 4,
  groundAspect: 0.36,
  strokeWidthNormal: 0.8,
  strokeWidthPrimary: 1.25,
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
 * Double elliptical ground outline; primary selection uses a stronger outer stroke.
 */
export function drawSelectionRing(g: Graphics, props: SelectionRingProps): void {
  g.clear();
  const outerRadius = props.targetHitRadius + SELECTION_RING_GEOMETRY.paddingRadius;
  const innerRadius = outerRadius - SELECTION_RING_GEOMETRY.innerGap;
  const width = props.primary
    ? SELECTION_RING_GEOMETRY.strokeWidthPrimary
    : SELECTION_RING_GEOMETRY.strokeWidthNormal;
  const { groundY, groundAspect } = SELECTION_RING_GEOMETRY;
  g.ellipse(0, groundY, outerRadius, outerRadius * groundAspect).stroke({
    width,
    color: TOKENS_NUM.accentGold,
    alpha: 0.85,
  });
  g.ellipse(0, groundY, innerRadius, innerRadius * groundAspect).stroke({
    width: width * 0.65,
    color: TOKENS_NUM.accentGold,
    alpha: 0.7,
  });
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
