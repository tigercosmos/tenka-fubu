// Command 提交佇列與 Step 1 統一結算（applyCommands）。
// 規格：plan/03-game-loop.md §3.3.1（生命週期／seq 指派／單 tick 上限）／§3.3.3（套用順序、原子性、
// 冪等防線）／§5.1（applyCommands 虛擬碼）。
//
// 分層（§3.3.1）：提交佇列本身位於 app 層——core 不持有佇列實例。本檔提供純 TS 的 `CommandQueue`
// 類別（無副作用、決定論）供 app 層（M1-15）持有一個實例；`advanceDay` 收到的是 app 層以
// `drain()` 取出的 `CommandEnvelope[]`。`applyCommands` 為 advanceDay Step 1，就地結算該陣列。

import type { GameState } from '../state/gameState';
import type { EvtCommandRejected } from '../state/events';
import type { Command, CommandEnvelope, ValidationResult } from './types';
import type { EmitFn } from './registry';
import { validateCommand } from './validate';
import { applyCommand } from './apply';
import { BAL } from '../balance';

/**
 * 提交佇列（§3.3.1）：指派全域單調遞增 `seq`、FIFO 暫存、依上限分批 `drain`。
 * app 層每局持有一個實例；讀檔後以 `new CommandQueue(state.meta.lastAppliedCmdSeq + 1)` 續接 seq
 *（§3.3.3 冪等防線與 §3.3.1「隨存檔保存於 lastAppliedCmdSeq 之後接續」）。未套用的 pending 為
 * transient（不入存檔），讀檔後遺失可接受（尚未套用、不影響已結算狀態）。
 */
export class CommandQueue {
  private nextSeq: number;
  private readonly pending: CommandEnvelope[] = [];

  constructor(startSeq = 1) {
    this.nextSeq = startSeq;
  }

  /** 入列並指派 seq；`issuedDay`＝提交當下 absoluteDay（state.time.day）。回傳包裝後信封。 */
  enqueue(command: Command, issuedDay: number): CommandEnvelope {
    const envelope: CommandEnvelope = { seq: this.nextSeq, issuedDay, command };
    this.nextSeq += 1;
    this.pending.push(envelope);
    return envelope;
  }

  /**
   * 取出至多 `limit` 筆（依 seq 升冪＝入列序），自佇列移除；其餘留待下一 tick（§3.3.1 上限規則之
   * requeue 語意由此自然達成）。預設上限＝BAL.maxCommandsPerTick。
   */
  drain(limit: number = BAL.maxCommandsPerTick): CommandEnvelope[] {
    const count = Math.min(Math.max(limit, 0), this.pending.length);
    return this.pending.splice(0, count);
  }

  /** 目前待結算筆數。 */
  get size(): number {
    return this.pending.length;
  }

  /** 下一個將指派的 seq（供除錯／存檔續接查詢）。 */
  get nextSequence(): number {
    return this.nextSeq;
  }
}

/** 將失敗的 ValidationResult 包成 command.rejected 事件（03 §5.1；payload 見 events.ts EvtCommandRejected）。 */
function makeRejectedEvent(
  state: Readonly<GameState>,
  cmd: Command,
  result: Extract<ValidationResult, { ok: false }>,
): EvtCommandRejected {
  return {
    type: 'command.rejected',
    day: state.time.day, // absoluteDay；Step 1 以舊日期（時間尚未於 Step 2 推進，§3.2.3）
    clanIds: [cmd.clanId],
    commandType: cmd.type,
    reasonKey: result.reasonKey,
    params: result.params ?? {},
  };
}

/**
 * advanceDay Step 1（03 §3.2.4／§5.1）：就地結算本 tick 的 CommandEnvelope 陣列。
 * - 順序＝提交序（queue 已依 seq 升冪；後續指令看得到前面指令效果，§3.3.3）。
 * - 冪等：跳過 `seq <= state.meta.lastAppliedCmdSeq` 者（至多套用一次，§3.3.3）。
 * - 上限：至多 BAL.maxCommandsPerTick 筆／tick；超出者不推進 lastAppliedCmdSeq、留待重新遞入（§3.3.1）。
 * - 失敗：硬驗證不過即發 command.rejected（不改 state）；通過即原子套用（不得再失敗，§3.3.3）。
 * - 拒絕的 envelope 之 seq 亦推進 lastAppliedCmdSeq（該 seq 已消費，§5.1）。
 */
export function applyCommands(
  state: GameState,
  queue: readonly CommandEnvelope[],
  emit: EmitFn,
): void {
  let applied = 0;
  for (const envelope of queue) {
    if (applied >= BAL.maxCommandsPerTick) {
      break;
    }
    if (envelope.seq <= state.meta.lastAppliedCmdSeq) {
      continue; // 冪等：已套用（或已消費）之 seq
    }
    const result = validateCommand(state, envelope.command);
    if (result.ok) {
      applyCommand(state, envelope.command, emit);
    } else {
      emit(makeRejectedEvent(state, envelope.command, result));
    }
    state.meta.lastAppliedCmdSeq = envelope.seq;
    applied += 1;
  }
}
