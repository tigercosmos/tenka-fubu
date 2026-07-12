// 訂閱 game slice 的標準 hook（含帶 tickSeq 快取的 useCachedGameSelector）。
// 規格：plan/01-architecture.md §3.4.2（selector 粒度策略）／§5.3（帶版本快取的彙總 selector）。
// M1-15（01-A6）實作。

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { store } from '@app/store';
import { CoreError } from '@core/errors';
import type { GameState } from '@core/state/gameState';

/**
 * 訂閱 `game` slice（01 §3.4.2）。`select` 只能回傳原始值／tuple／每次重新建構的小型 derived
 * 物件，禁止回傳 GameState 內部可變物件／陣列參考；經 `useShallow` 對輸出做淺比較，值未變時
 * 不觸發重渲染（`tickSeq` 遞增才會重跑 selector，見 bridge.ts `runOneDay`）。
 */
export function useGameSelector<T>(select: (game: GameState) => T): T {
  return useStore(
    store,
    useShallow((s) => {
      if (s.game === null) {
        throw new CoreError('DATA_INTEGRITY', 'game 尚未初始化（useGameSelector）');
      }
      return select(s.game);
    }),
  );
}

/**
 * 帶 tickSeq 版本快取的彙總 selector 包裝（01 §5.3 `makeCachedSelector`）：`compute` 成本較高
 * （掃描全實體）時使用，同一 tickSeq 內重複呼叫（相同參數）回傳快取值而不重算。
 * core 端若需同類彙總不透過本包裝，直接呼叫 `compute`（core 無 tickSeq 概念，快取屬 app/ui 層）。
 */
export function makeCachedSelector<Args extends unknown[], R>(
  compute: (game: GameState, ...args: Args) => R,
): (game: GameState, tickSeq: number, ...args: Args) => R {
  let cachedSeq = -1;
  let cachedGame: GameState | null = null;
  let cachedArgs: Args | null = null;
  let cachedValue: R | null = null;

  return (game, tickSeq, ...args) => {
    if (
      cachedGame === game &&
      cachedSeq === tickSeq &&
      cachedArgs !== null &&
      cachedArgs.length === args.length &&
      cachedArgs.every((v, i) => Object.is(v, args[i]))
    ) {
      return cachedValue as R;
    }
    cachedValue = compute(game, ...args);
    cachedGame = game;
    cachedSeq = tickSeq;
    cachedArgs = args;
    return cachedValue;
  };
}

/**
 * `useCachedGameSelector`：自動代入目前 `tickSeq` 呼叫 `makeCachedSelector` 包裝過的 selector。
 * `tickSeq` 改以 `store.getState().tickSeq` 於 `useGameSelector` 的 selector 內部**命令式**讀取，
 * 不另外訂閱——`useGameSelector` 底層的 `useStore` 本就會在任何 store 變更（含 tickSeq 遞增）時
 * 重跑 selector，若額外用 `useStore(store, s => s.tickSeq)` 訂閱數值本身，該訂閱會在每次 tickSeq
 * 改變時各自觸發一次重渲染（數值必然不同），使「輸出未變不重渲染」的快取效果失效。
 */
export function useCachedGameSelector<Args extends unknown[], R>(
  cachedSelector: (game: GameState, tickSeq: number, ...args: Args) => R,
  ...args: Args
): R {
  return useGameSelector((game) => cachedSelector(game, store.getState().tickSeq, ...args));
}
