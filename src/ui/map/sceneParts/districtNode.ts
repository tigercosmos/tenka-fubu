// DistrictNode —— 郡節點場景元件。
//
// 規格：plan/12-ui-components.md §3.3.3（原樣依循：圓形半徑/填色/描邊、直轄/知行中心點、
// 制壓進度弧、一揆警示三角）、§4（`ScenePart<P>` 工廠介面）。18-roadmap.md M2-16（12-T10 部分）。
//
// `colorIndex: number | null`（null=無主）沿用 M2-13 `MapViewState.districtOwner` 的既有慣例
// （plan/04-map-and-movement.md §4.6：「districtId → clanId（null=無主）」；12 §3.3.3：
// 「無主郡填 --neutral-clanless」）；02 現況 `District.ownerClanId: ClanId` 未宣告為可為 null，
// 本檔與 M2-13 一致選擇沿用 04/12 的防禦性介面（保留 null 分支，不因 02 目前恆有值而收窄型別），
// 與 `mapDraw.ts`（M2-13）的 `ownerColor()` 處理方式相同，故不另籤 §8（該落差已於 M2-13 隱含接受）。
//
// 範圍（本批次）：一揆警示三角依 `ikkiActive` 靜態繪出（12 §3.3.3 終態），1s 週期閃爍／
// reduce-motion 恆亮需要逐幀 ticker 驅動 `update()`（尚未整合，見 castleNode.ts 檔頭同款說明）；
// 本檔僅負責「目前 props 描述的終態」之繪製參數正確性。

import { Container, Graphics } from 'pixi.js';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import type { ScenePart } from '@ui/components/types';

/** §3.3.3 表：郡節點幾何（world unit）。 */
export const DISTRICT_NODE_GEOMETRY = {
  radius: 7, // 圓形半徑
  fillAlpha: 0.7, // 填色透明度 70%
  strokeWidth: 1, // 描邊線寬
  centerDotDiameter: 2.5, // 直轄/知行中心點直徑
  subjugationRingRadius: 10, // 制壓進度弧半徑
  subjugationRingWidth: 2, // 制壓進度弧線寬
  ikkiTriangleSize: 6, // 一揆警示三角外接盒邊長
  ikkiOffsetY: 8, // 一揆警示三角中心較節點中心上移量
} as const;

export interface DistrictNodeProps {
  /** 世界座標（供工廠將 `container.position` 對齊；純繪製函式不消費本欄位，繪於局部原點）。 */
  readonly pos: { readonly x: number; readonly y: number };
  /** 歸屬勢力色索引（`Clan.colorIndex` 0..39）；null=無主郡（`--neutral-clanless`）。 */
  readonly colorIndex: number | null;
  /** `District.stewardId !== null`（知行郡＝true；直轄郡＝false，02 §4.6）。 */
  readonly hasSteward: boolean;
  /** `District.subjugation?.progress`（0..100）；null=無制壓中（02 §4.6）。 */
  readonly subjugationProgress: number | null;
  /** `District.uprising !== null`（一揆中，02 §4.6）。 */
  readonly ikkiActive: boolean;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 上尖三角形（局部座標，中心 (cx,cy)，外接盒 size×size）。 */
function trianglePoints(cx: number, cy: number, size: number): number[] {
  const half = size / 2;
  return [cx, cy - half, cx + half, cy + half, cx - half, cy + half];
}

/**
 * 純繪製函式（12 §3.3.3）：郡圓形本體（填色/描邊）＋直轄/知行中心點＋制壓進度弧（可選）＋
 * 一揆警示三角（可選）。局部座標系（中心為原點）；世界定位由工廠的 `container.position` 負責。
 */
export function drawDistrictNode(g: Graphics, props: DistrictNodeProps): void {
  g.clear();
  const { radius, fillAlpha, strokeWidth, centerDotDiameter } = DISTRICT_NODE_GEOMETRY;
  const fillColor =
    props.colorIndex === null ? TOKENS_NUM.neutralClanless : clanColorNum(props.colorIndex);
  g.circle(0, 0, radius).fill({ color: fillColor, alpha: fillAlpha });
  g.circle(0, 0, radius).stroke({ width: strokeWidth, color: TOKENS_NUM.ink700 });

  const dotRadius = centerDotDiameter / 2;
  if (props.hasSteward) {
    // 知行郡：washi100 空心點（僅描邊）。
    g.circle(0, 0, dotRadius).stroke({ width: 1, color: TOKENS_NUM.washi100 });
  } else {
    // 直轄郡：ink900 實心點。
    g.circle(0, 0, dotRadius).fill({ color: TOKENS_NUM.ink900 });
  }

  if (props.subjugationProgress !== null) {
    const ratio = clamp01(props.subjugationProgress / 100);
    const start = -Math.PI / 2;
    g.arc(
      0,
      0,
      DISTRICT_NODE_GEOMETRY.subjugationRingRadius,
      start,
      start + 2 * Math.PI * ratio,
    ).stroke({
      width: DISTRICT_NODE_GEOMETRY.subjugationRingWidth,
      color: TOKENS_NUM.accentVermilionBright,
    });
  }

  if (props.ikkiActive) {
    const pts = trianglePoints(
      0,
      -DISTRICT_NODE_GEOMETRY.ikkiOffsetY,
      DISTRICT_NODE_GEOMETRY.ikkiTriangleSize,
    );
    g.poly(pts).fill({ color: TOKENS_NUM.accentVermilionBright });
  }
}

function samePropsExceptPos(a: DistrictNodeProps, b: DistrictNodeProps): boolean {
  return (
    a.colorIndex === b.colorIndex &&
    a.hasSteward === b.hasSteward &&
    a.subjugationProgress === b.subjugationProgress &&
    a.ikkiActive === b.ikkiActive
  );
}

function samePos(a: DistrictNodeProps['pos'], b: DistrictNodeProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 工廠（12 §4：`ScenePart<P>`）：建立郡節點的 `Container`（世界定位）＋內部 `Graphics`。 */
export function createDistrictNode(): ScenePart<DistrictNodeProps> {
  const container = new Container();
  container.label = 'districtNode';
  const gfx = new Graphics();
  container.addChild(gfx);

  let last: DistrictNodeProps | null = null;

  return {
    container,
    update(props: DistrictNodeProps): void {
      if (last === null || !samePos(last.pos, props.pos)) {
        container.position.set(props.pos.x, props.pos.y);
      }
      if (last !== null && samePropsExceptPos(last, props)) {
        last = props;
        return;
      }
      drawDistrictNode(gfx, props);
      last = props;
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
}
