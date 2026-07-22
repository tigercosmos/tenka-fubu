// 城名牌樣式常數（M6-V9b 定稿 §2.1／§2.2／§2.4／§2.5，S1 專屬新檔）。
//
// 規格：docs/design/m6-v9b-map-plates.md §2.1「綬帶幾何與去同構構圖」定稿表——名牌容器
// pixel-lock（`container.scale = 1/camera.scale`）後，本表數值即 CSS px 恆定；`worldGap`
// 例外為世界單位（容器 Y 偏移，使綬帶頂恆在節點下方、不疊 near 段耐久環 r18，§2.6）。
// 全部數值集中於此，繪製程式（castleNameplate.ts）不得散落魔術數字。
//
// DD-A3 去同構構圖（§2.1）：城名前置（左）、兵數內嵌綬帶尾段（右、非下掛 chip）、勢力印記
// 騎於節點-綬帶接點（中心＝容器原點）、綬帶寬置中於節點——非新生名牌構圖之描摹（art-bible §12.2）。

import type { CastleTier } from '@core/state/enums';
import { TOKENS_NUM } from '@ui/styles/tokens';

/** 單一城格（main/branch）的名牌幾何定義（§2.1 定稿表；數值皆定稿）。 */
export interface NameplateGeometrySpec {
  /** 容器 Y 偏移（世界單位）：綬帶頂距節點中心（§2.6：main 24 > 耐久環 r18，恆不疊環）。 */
  readonly worldGap: number;
  /** 和紙綬帶底板高（CSS px）。 */
  readonly ribbonH: number;
  /** 綬帶左右內距。 */
  readonly ribbonPadX: number;
  /** 綬帶最小寬（短名時仍成牌）。 */
  readonly ribbonMinW: number;
  /** washi 綬帶圓角（非新生方角）。 */
  readonly ribbonRadius: number;
  /** 城名字級（ink900 墨字；沿用 V9 主/支城字級）。 */
  readonly nameSize: number;
  /** 城名與兵數群之間的 ink 髮絲分隔內距。 */
  readonly divGapX: number;
  /** 勢力印記半徑（旗幟軌 clanColorNum 填＋ink900 環，騎接點）。 */
  readonly sealR: number;
  /** 關係色帶寬（綬帶左內緣豎帶：靛/朱/灰，§2.4）。 */
  readonly relStripeW: number;
  /** 染紙暈邊高（綬帶下緣 clanDyeNum 薄暈，繫 territory 染紙軌）。 */
  readonly dyeUnderlineH: number;
  /** 兵符點半徑（兵數前導小記號，沿用 ArmyChip soldier glyph 語彙）。 */
  readonly troopDotR: number;
  /** 兵數字級（tabular numerals，ink900）。 */
  readonly troopNumSize: number;
  /** 綬帶描邊（ink900 髮絲外框）寬。 */
  readonly inkHairline: number;
}

/** M6-V9b §2.1 定稿表：本城 main／支城 branch 兩欄。 */
export const NAMEPLATE_GEOMETRY = {
  main: {
    worldGap: 24,
    ribbonH: 20,
    ribbonPadX: 6,
    ribbonMinW: 48,
    ribbonRadius: 3,
    nameSize: 15,
    divGapX: 6,
    sealR: 8,
    relStripeW: 3,
    dyeUnderlineH: 2,
    troopDotR: 3,
    troopNumSize: 12,
    inkHairline: 1,
  },
  branch: {
    worldGap: 18,
    ribbonH: 16,
    ribbonPadX: 5,
    ribbonMinW: 38,
    ribbonRadius: 2.5,
    nameSize: 13,
    divGapX: 5,
    sealR: 6.5,
    relStripeW: 3,
    dyeUnderlineH: 2,
    troopDotR: 3,
    troopNumSize: 11,
    inkHairline: 1,
  },
} as const satisfies Record<CastleTier, NameplateGeometrySpec>;

/**
 * 名牌非 per-tier 的呈現常數（§2.2 構成／§2.4 CVD 通道／§2.5 光照／§3.4 目標高亮）。
 * 投影階序：名牌 < HUD < modal（art-bible §7）——α 0.22、位移 +2/+2。
 */
export const NAMEPLATE_STYLE = {
  /** 右下微投影透明度（§2.2-1）。 */
  shadowAlpha: 0.22,
  /** 右下微投影位移（+x/+y px）。 */
  shadowOffset: 2,
  /** 敵對綬帶左端「尖角（右斜切）」水平切深（§2.4 端形通道）。 */
  enemyCutX: 4,
  /** 敵對印記環右上缺角掃角（rad；§2.4「單環＋右上缺角」）。 */
  sealNotchRad: Math.PI / 3,
  /** 我方印記雙環之內環內縮（§2.4「ink900 雙環」友軍語彙）。 */
  sealInnerRingInset: 2.5,
  /** 印記內 tier 刻痕（短墨橫刻）透明度（§2.3：雙刻＝本城／單刻＝支城）。 */
  tierNotchAlpha: 0.6,
  /** 我方 home tick：印記左上 3px 實心靛點之半徑（§2.4 附加記號）。 */
  homeTickR: 1.5,
  /** 敵對印記旁小交叉墨記邊長之半（2px 記號，§2.4 附加記號）。 */
  crossMarkHalf: 1,
  /** 中立綬帶左端小空心菱形半對角（3px，§2.4 附加記號）。 */
  neutralDiamondR: 3,
  /** 告急小烽記半徑（綬帶右端 accentVermilion 3px，§2.6 警戒態呼應）。 */
  warnMarkR: 3,
  /** 目標高亮金框外擴（§3.4：1px accentGold 外框＋輕微外擴）。 */
  targetHighlightPad: 2,
} as const;

/** 名牌字體樣式（canvas 城名/兵數皆 ink900 墨字；washi 綬帶底即可讀性基底，不需 halo，§2.2-2）。 */
export function nameplateTextStyle(size: number): {
  fontFamily: string;
  fontSize: number;
  fill: number;
} {
  return { fontFamily: 'Noto Serif TC', fontSize: size, fill: TOKENS_NUM.ink900 };
}
