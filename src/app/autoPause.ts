// GameEvent → 自動暫停判定（依設定）＋失焦自動暫停。
// 規格：plan/01-architecture.md §3.5.3（自動暫停兩來源）／§8 D4（失焦暫停設計）；
//       plan/03-game-loop.md §4.1（AutoPauseReason）；plan/16-save-and-settings.md（設定項，M8 起）。
// M1-17（01-A8）實作：本檔涵蓋（a）`visibilitychange` 掛鉤（主要交付）、（b）core `AutoPauseReason`
// → app `PauseReason` 的轉譯掛鉤（§3.4.4 步驟 9 的行為對應，實際呼叫時機見 bridge.ts 內
// `onAutoPauseReasons` 掛鉤說明）。
//
// 設定閘控（依玩家設定關閉個別自動暫停原因）留待 M8-16 settings 系統落地後接線；M1 期間全部
// 原因視為預設開啟——由於 Step 13 reports（M1-8 起）尚為骨架、`autoPauseReasons` 恆空
//（見 src/core/systems/index.ts stepReports 註解），本檔的 core 事件分支於 M1 階段實質不可達，
// 僅先建好轉譯管線供 M1-8／M8-16 落地後即可運作，不需再改本檔。

import type { AutoPauseReason } from '@core/systems/index';
import { onAutoPauseReasons } from './bridge';
import type { PauseReason } from './store';
import type { GameLoopController } from './gameLoop';

/** core AutoPauseReason → app PauseReason（命名差異見兩檔各自出處；01 §3.5.3／03 §4.1）。 */
const REASON_MAP: Record<AutoPauseReason, PauseReason> = {
  siegeOnPlayer: 'castleBesieged',
  battleAvailable: 'battleOffer',
  proposalArrived: 'proposalArrived',
  envoyArrived: 'diploEnvoy',
  historicalEvent: 'historicalEvent',
  monthStart: 'monthStart',
};

/** 純函式抽出以利單元測試（見 tests/app/autoPause.spec.ts）：多原因時取第一項
 * （Step 13 已依 03 §4.1 表列序排序去重）；空陣列回傳 null（不暫停）。 */
export function translateAutoPauseReasons(reasons: readonly AutoPauseReason[]): PauseReason | null {
  const first = reasons[0];
  return first === undefined ? null : REASON_MAP[first];
}

/**
 * 安裝自動暫停（01 §3.5.3）：
 * 1. core 事件來源——訂閱 bridge.ts 每 tick 結束回報的 `autoPauseReasons`，命中即
 *    `loop.requestPause(reason)`（多原因時取第一項，Step 13 已依表列序排序去重）。
 * 2. 頁面失焦來源——`document.visibilitychange` 且 `document.hidden===true` 時
 *    `loop.requestPause('windowHidden')`；**恢復可見時不自動續跑**（01 §8 D4：分頁隱藏期間
 *    瀏覽器本就節流 rAF，明確暫停＋玩家手動繼續讓時間感確定）。
 * 回傳解除安裝函式（測試／未來 loop 汰換時使用）。
 */
export function installAutoPause(loop: GameLoopController): () => void {
  onAutoPauseReasons((reasons) => {
    const reason = translateAutoPauseReasons(reasons);
    if (reason !== null) {
      loop.requestPause(reason);
    }
  });

  function onVisibilityChange(): void {
    if (document.hidden) {
      loop.requestPause('windowHidden');
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    onAutoPauseReasons(null);
  };
}
