// 致命錯誤攔截與狀態封存（規格：plan/01-architecture.md §3.10.2「UI 的錯誤攔截」／
// §4.1 SessionState.fatalError；M1-18／01-A9）。
//
// 攔截點（架構定案，01 §3.10.2）：
//   1. `src/ui/components/ErrorBoundary.tsx`——攔截 React 渲染例外。
//   2. `src/app/bridge.ts` 的 `runOneDay`——以 try/catch 包住 `advanceDay`，捕獲 `CoreError`。
// 兩者皆呼叫本檔的 `captureFatalError(err)` 取得 `FatalErrorInfo`，寫入
// `store.getState().actions.setFatalError(info)` 後顯示同一致命錯誤畫面。
//
// 狀態封存（「匯出存檔」按鈕的資料來源）：完整存檔管線（lz-string 壓縮、槽位選擇）屬
// `plan/16-save-and-settings.md`，留待 M8。本檔先提供輕量替代——`recordStateSnapshot`
// 由呼叫端（未來的自動存檔／每 tick 收尾）呼叫，記錄「錯誤發生前最後一次」的 canonical JSON
// 快照；`exportSnapshotToFile` 觸發瀏覽器下載，供玩家在無法復原的錯誤畫面上取回進度。
// M8 落地正式匯出格式（16-T5）後，本檔的 plain JSON 匯出何去何從由該任務裁定。

import type { GameState } from '../core/state/gameState';
import { canonicalStringify } from '../core/state/serialize';
import { CoreError } from '../core/errors';

/** 對應 `GameStore.session.fatalError` 的非 null 內容（01 §4.1 逐字）。 */
export interface FatalErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly stack: string;
}

/** 非 CoreError（如 React 渲染例外、其餘未預期擲出值）的通用錯誤碼。 */
const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR_CODE';

/** 將任意攔截到的例外正規化為 `FatalErrorInfo`（純函式，同輸入同輸出，無副作用）。 */
export function toFatalErrorInfo(err: unknown): FatalErrorInfo {
  if (err instanceof CoreError) {
    return { code: err.code, message: err.message, stack: err.stack ?? '' };
  }
  if (err instanceof Error) {
    return { code: UNKNOWN_ERROR_CODE, message: err.message, stack: err.stack ?? '' };
  }
  return { code: UNKNOWN_ERROR_CODE, message: String(err), stack: '' };
}

/**
 * 攔截入口：正規化例外，並在 dev 模式原樣印出堆疊（01 §3.10.2「dev 模式下錯誤同時
 * console.error 原樣拋出堆疊」）。呼叫端取得回傳值後自行 `loop.stop()`、寫入
 * `session.fatalError`（本檔不直接依賴 store／gameLoop，避免與尚未完成的模組耦合）。
 */
export function captureFatalError(err: unknown): FatalErrorInfo {
  const info = toFatalErrorInfo(err);
  if (import.meta.env.DEV) {
    console.error('[fatal]', err);
  }
  return info;
}

// ── 狀態封存（輕量替代；見檔頭說明） ──

let lastSnapshotJson: string | null = null;

/** 記錄「目前為止最後一次」的狀態快照（canonical JSON）；供匯出存檔使用。 */
export function recordStateSnapshot(state: GameState): void {
  lastSnapshotJson = canonicalStringify(state);
}

/** 供其他模組／測試讀取目前記錄的快照（尚無快照時為 null）。 */
export function getStateSnapshotJson(): string | null {
  return lastSnapshotJson;
}

/** 測試專用：清除模組層快照狀態。非產品程式碼路徑。 */
export function resetStateSnapshotForTests(): void {
  lastSnapshotJson = null;
}

/**
 * 觸發瀏覽器下載目前記錄的快照（`.json`）。尚無任何快照時（`recordStateSnapshot` 從未被
 * 呼叫過）回傳 `false`、不觸碰 DOM。檔名預設含時間戳記以避免覆蓋既有下載檔。
 */
export function exportSnapshotToFile(filename?: string): boolean {
  if (lastSnapshotJson === null) return false;
  const blob = new Blob([lastSnapshotJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename ?? `tenka-fubu-crash-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
  return true;
}
