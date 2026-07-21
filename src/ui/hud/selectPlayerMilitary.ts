// 玩家兵力量表 UI 端匯總（M6-V9 §4.2；非 core selector——core 純度與 golden 不動）。
//
// 兵力量表「同域」語意（採納評審 A M1）：分子與分母皆**只計駐城**——
// `total = Σ castle.soldiers`、`cap = Σ castleMaxSoldiers(g, castle)`（owner===player），
// 保證 `total ≤ cap`；野戰部隊為地圖上的軍旗 chip，不入此量表（未來「出陣中 N」槽另計，非本片）。
// 呼叫端以 `makeCachedSelector`（tickSeq 快取）包裝，避免每 render 重建物件觸發重渲染。

import { castleMaxSoldiers } from '@core/domestic';
import type { GameState } from '@core/state/gameState';

export interface PlayerMilitary {
  /** 駐城兵合計（人）。 */
  readonly total: number;
  /** 駐城容量合計（人；`castleMaxSoldiers` 衍生值）。 */
  readonly cap: number;
}

export function selectPlayerMilitary(g: Readonly<GameState>): PlayerMilitary {
  const playerClanId = g.meta.playerClanId;
  let total = 0;
  let cap = 0;
  for (const castle of Object.values(g.castles)) {
    if (castle.ownerClanId !== playerClanId) continue;
    total += castle.soldiers;
    cap += castleMaxSoldiers(g, castle);
  }
  return { total, cap };
}
