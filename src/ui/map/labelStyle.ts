// 地圖標籤樣式常數（M6-V9 §2.2／§2.4，S2 專屬新檔）。
//
// 規格：docs/design/m6-v9-hud-readability.md §2——標籤 pixel-lock（per-label container 反向縮放）
// 後，`size` 即 CSS px 恆定字級；`gap` 為節點下方偏移（螢幕 px；container 已反向縮放，子
// BitmapText 局部座標＝螢幕 px）；`road.offset` 沿道路法線之偏移（world unit，near-only、
// scale≈1.25，觀感穩定，沿用 `MAPVIEW.roadLabelOffset`）。
//
// 呈現原則（§2.2）：ink900（省名 ink700）墨字＋washi100 halo 描邊（Pixi v8 BitmapText 吃
// TextStyle 動態生成含 stroke 字集）；修掉舊「白字無 halo」不可讀問題。

import { TOKENS_NUM } from '../styles/tokens';
import { MAPVIEW } from './mapViewConfig';

/** 單一標籤類別的樣式定義（M6-V9 §2.4；數值皆定稿，勿散落魔術數字）。 */
export interface LabelStyleSpec {
  /** 字級（CSS px；pixel-lock 後螢幕恆定）。 */
  readonly size: number;
  /** 墨字填色。 */
  readonly fill: number;
  /** halo 描邊色（washi100）。 */
  readonly halo: number;
  /** halo 描邊寬（px）。 */
  readonly haloW: number;
  /** 整體透明度（省名 0.85，不壓過主城/軍隊）。 */
  readonly alpha?: number;
  /** 字距（省名大字 3）。 */
  readonly letterSpacing?: number;
  /** 節點下方偏移（螢幕 px）。 */
  readonly gap?: number;
  /** 道路法線偏移（world unit）。 */
  readonly offset?: number;
}

/** M6-V9 §2.4 定稿表：province／mainCastle／branchCastle／district／road 五類。 */
export const LABEL_STYLE = {
  province: {
    size: 20,
    fill: TOKENS_NUM.ink700,
    halo: TOKENS_NUM.washi100,
    haloW: 3,
    alpha: 0.85,
    letterSpacing: 3,
  },
  mainCastle: { size: 15, fill: TOKENS_NUM.ink900, halo: TOKENS_NUM.washi100, haloW: 3, gap: 20 },
  branchCastle: {
    size: 13,
    fill: TOKENS_NUM.ink900,
    halo: TOKENS_NUM.washi100,
    haloW: 3,
    gap: 16,
  },
  district: { size: 12, fill: TOKENS_NUM.ink900, halo: TOKENS_NUM.washi100, haloW: 3, gap: 14 },
  road: {
    size: 12,
    fill: TOKENS_NUM.ink900,
    halo: TOKENS_NUM.washi100,
    haloW: 2.5,
    offset: MAPVIEW.roadLabelOffset,
  },
} as const satisfies Record<string, LabelStyleSpec>;

/**
 * declutter 佔用網格邊長（CSS px；M6-V9 §2.5）：64×64 至多一枚標籤（art-bible §10）。
 * 已知取捨：floor(sx/64) 分桶只保證同桶至多一枚，跨格邊界微重疊不做 AABB（定稿裁決 A-m6）。
 */
export const LABEL_DECLUTTER_CELL_PX = 64;

/** 由 LabelStyleSpec 組出 BitmapText 之 TextStyle options（§2.2 主路徑：fill＋stroke halo）。 */
export function labelTextStyle(spec: LabelStyleSpec): {
  fontFamily: string;
  fontSize: number;
  fill: number;
  stroke: { color: number; width: number; join: 'round' };
  letterSpacing?: number;
} {
  return {
    fontFamily: 'Noto Serif TC',
    fontSize: spec.size,
    fill: spec.fill,
    stroke: { color: spec.halo, width: spec.haloW, join: 'round' },
    ...(spec.letterSpacing === undefined ? {} : { letterSpacing: spec.letterSpacing }),
  };
}
