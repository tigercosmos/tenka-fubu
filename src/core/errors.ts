// CoreError 型別階層。
// 規格：plan/01-architecture.md §3.10.1、§4.4。
//
// 本檔僅先行實作最小資料型別（供 M1-15 的 useGameSelector.ts／bridge.ts 依 01 §3.4.2／§3.4.4
// 規範拋出型別化錯誤，避免以裸 Error 頂替）；ErrorBoundary／致命錯誤畫面／log 注入等 UI 綴接
// 仍留待 M1-18（01-A9）實作，不在本檔範圍。

/** CoreError 錯誤碼（01 §4.4 逐字轉錄）。 */
export type CoreErrorCode =
  | 'INVALID_COMMAND_SHAPE' // Command 物件畸形（呼叫端 bug，非規則拒絕）
  | 'DATA_INTEGRITY' // 懸空 id、實體缺失、劇本資料矛盾
  | 'SAVE_VERSION' // 存檔版本無法遷移（▷ plan/16）
  | 'INVARIANT_VIOLATION'; // invariants.ts 檢查失敗

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly details?: unknown; // 診斷附帶資料（實體 id 等）；不得含循環參照

  constructor(code: CoreErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
    this.details = details;
  }
}
