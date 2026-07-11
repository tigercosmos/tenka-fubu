// applyCommand(state, cmd, emit)：單一 Command 原子套用（03 §3.3.3）。
// 規格：plan/03-game-loop.md §3.3.3（原子性、套用不失敗、fail-fast）。
//
// 前置：僅於 validateCommand 回 { ok: true } 後由 Step 1 迴圈（queue.ts applyCommands）呼叫。
// 就地修改 state（03 §3.1）。套用中遇理論上不可能的狀態擲例外令 golden test 失敗（§3.3.3／§8 D4），
// 不做部分回滾。

import type { GameState } from '../state/gameState';
import type { Command } from './types';
import { getHandler, type EmitFn } from './registry';

/**
 * 套用單一已通過驗證的 Command。未登錄 handler 為理論不可達（validateCommand 對此已回
 * notImplemented 拒絕、不會走到 apply），仍 fail-fast 擲例外以防管線誤用（§3.3.3）。
 */
export function applyCommand(state: GameState, cmd: Command, emit: EmitFn): void {
  const handler = getHandler(cmd.type);
  if (handler === undefined) {
    throw new Error(`applyCommand: no handler registered for command type '${cmd.type}'`);
  }
  handler.apply(state, cmd, emit);
}
