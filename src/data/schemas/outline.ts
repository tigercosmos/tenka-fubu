// 日本海岸線背景檔（src/data/map/japan-outline.json）zod schema。
// 規格：plan/04-map-and-movement.md §3.3.1（JapanOutlineFile／OutlinePolygon 型別＋檔案格式）、
// T1（04-T1 驗收：非法 outline JSON 被 zod 拒絕）。
//
// 範圍界定（04 §3.3.4）：本檔只把關「單一 JSON 檔案自身」的結構正確性（型別、必要欄位、
// 座標整數範圍、單一 polygon 點數為偶數且落在 60~300 點區間）；跨 polygon 的語意驗收——
// 總點數 300~600、逆時針無自交、全部城/郡節點落在某 polygon 內、honshu/shikoku/kyushu
// 互不重疊——屬 `tools/validate.ts` 自動檢查範圍（M2-2 之後），不在 zod 層。
import { z } from 'zod';

/** 世界座標整數（0..4096；04 §3.2 投影輸出範圍）。 */
const zWorldCoord = z.number().int().min(0).max(4096);

/**
 * 單一島嶼折線多邊形（04 §3.3.1）。
 * `points`：扁平陣列 [x0,y0,x1,y1,...]，世界座標整數、逆時針纏繞、首尾不重複；
 * 每島 60~300 點（§3.3.1），故長度須為偶數且落在 120..600 個數字之間。
 */
export const zOutlinePolygon = z.object({
  /** 島嶼識別：'honshu' | 'shikoku' | 'kyushu' 必備（跨檔存在性檢查見 tools/validate.ts），
   *  'awaji' | 'sado' 等純裝飾島嶼亦為合法自由字串（04 §3.3.1，型別本身為 `string`）。 */
  id: z.string().min(1),
  points: z
    .array(zWorldCoord)
    .min(120) // 60 點 × 2
    .max(600) // 300 點 × 2
    .refine((points) => points.length % 2 === 0, {
      message: 'points 長度必須為偶數（世界座標 x,y 成對出現）',
    }),
});
export type OutlinePolygon = z.infer<typeof zOutlinePolygon>;

/** src/data/map/japan-outline.json 全檔（04 §3.3.1）。 */
export const zJapanOutlineFile = z.object({
  version: z.literal(1),
  /** 資料來源：'natural-earth'（簡化自公有領域資料）或 'handcrafted'（AI 手繪，04 §3.3.2／§3.3.3）。 */
  source: z.enum(['natural-earth', 'handcrafted']),
  polygons: z.array(zOutlinePolygon).min(1),
});
export type JapanOutlineFile = z.infer<typeof zJapanOutlineFile>;
