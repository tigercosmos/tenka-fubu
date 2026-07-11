// 訂閱 session slice 的 hook（規格：plan/01-architecture.md §3.4.1 第 5 點：「session slice 是不可變
// 更新，元件用 useSession(selector) 訂閱」／§3.4.2 selector 粒度規則）。
// M1-20／M1-22 實作（`useGameSelector`/`useHotkeys` 已由 M1-15/M1-16 落地，本檔補上同系列的
// session 版本，供 TitleScreen／MainScreen／DebugPanel 讀取 `session.screen`／`speed`／`debug` 等）。

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { store } from '@app/store';
import type { SessionState } from '@app/store';

/**
 * 訂閱 `session` slice（01 §3.4.1 第 5 點）。`select` 回傳值一律經 `useShallow` 淺比較，
 * 未變時不觸發重渲染；與 `useGameSelector` 同一慣例（01 §3.4.2）。
 */
export function useSession<T>(select: (session: SessionState) => T): T {
  return useStore(
    store,
    useShallow((s) => select(s.session)),
  );
}
