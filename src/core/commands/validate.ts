// validateCommand(state, cmd) → ValidationResult（03 §4.2；硬/軟驗證統一入口）。
// 規格：plan/03-game-loop.md §3.3.2（兩段驗證：軟驗證＝UI 按鈕致能／確認即時回饋、硬驗證＝Step 1
// 套用前唯一權威判定；同一驗證器）／§3.3.3（原子性前置）／10 §5（gameOver 中央閘門）。
//
// 純函式：禁止改 state／消費亂數／讀 UI（§3.5.4 禁令 2）。UI 軟驗證與 core 硬驗證共用本函式。

import type { GameState } from '../state/gameState';
import type { Command, ValidationResult } from './types';
import { getHandler, isDebugCommand } from './registry';
import { REJECT_REASONS } from './reasons';

/**
 * 驗證單一 Command。
 * - 中央閘門：`state.meta.gameOver !== null` 時，除 debug 指令外一律拒 `gameOver`（10 §5；03 §3.3.2）。
 * - 未登錄 handler（本里程碑尚未實作之佇列指令）回 `notImplemented`（不崩潰、不改 state；§8-D14）。
 * - 其餘委派至該 CommandType 之專屬驗證器（registry.ts）。
 */
export function validateCommand(state: Readonly<GameState>, cmd: Command): ValidationResult {
  if (state.meta.gameOver !== null && !isDebugCommand(cmd)) {
    return { ok: false, reasonKey: REJECT_REASONS.gameOver };
  }
  const handler = getHandler(cmd.type);
  if (handler === undefined) {
    return { ok: false, reasonKey: REJECT_REASONS.notImplemented, params: { type: cmd.type } };
  }
  return handler.validate(state, cmd);
}
