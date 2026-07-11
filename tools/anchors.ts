// V13 錨點驗證常數（規格：plan/14-scenario-data.md §3.4 座標製作規範之 20 錨點對照表；
// §5.1 虛擬碼「checkAnchors(world)（錨點表為 tools/anchors.ts 常數）」指名本檔為錨點真相載體）。
//
// 座標值單一真相＝src/data/map/projection.ts 的 `ANCHOR_POINTS_20`（該表已將 §3.4 經緯度
// 代入 04 §3.2 投影公式產出世界座標）；本檔僅把每筆對映到「劇本 castles.json 內該城的
// 顯示名（name 欄）」，供 validate.ts V13 以城名比對——劇本資料不含經緯度、亦不保證 castleId
// 命名，city `name`（繁體顯示名）是兩邊都存在且穩定的比對鍵。
//
// §3.4 表列名有兩筆帶地名裝飾（「京都・二條御所」「內城（鹿兒島）」），其對應的城 name
// 分別為「二條御所」「內城」（見 §3.3 勢力清單本城欄）；此處以別名表覆寫，其餘 18 筆表列名
// 即等於城 name。

import { ANCHOR_POINTS_20 } from '../src/data/map/projection';

/** 錨點城一筆：城顯示名（比對鍵）＋基準世界座標。 */
export interface AnchorCastle {
  /** 劇本 castles.json 的 `name` 欄（繁體顯示名）。 */
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/** projection 表列名 → 劇本城 name 的別名覆寫（僅兩筆帶裝飾者需要）。 */
const CANONICAL_NAME: Readonly<Record<string, string>> = {
  '京都・二條御所': '二條御所',
  '內城（鹿兒島）': '內城',
};

/** §3.4 表 20 錨點城（name＝城顯示名；座標取自 projection.ANCHOR_POINTS_20，單一真相）。 */
export const ANCHOR_CASTLES: readonly AnchorCastle[] = ANCHOR_POINTS_20.map((a) => ({
  name: CANONICAL_NAME[a.name] ?? a.name,
  x: a.world.x,
  y: a.world.y,
}));
