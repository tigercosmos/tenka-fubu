// state 外側的 command log 環形記錄器與決定論重放（plan/17-testing.md §3.10／§4.4／§5.5）。

import type { Command, CommandEnvelope } from '../commands/types';
import type { GameState } from '../state/gameState';
import { balanceHash, stateHash } from '../state/serialize';
import { advanceDay } from '../systems';

export const COMMAND_LOG_FORMAT_VERSION = 1 as const;
export const COMMAND_LOG_CAPACITY = 50_000;

export type CommandLogIncompleteReason = 'capacity' | 'hardRejection' | 'loadedGame';

export interface CommandLogEntry {
  day: number;
  seq: number;
  command: Command;
}

export interface CommandLogFile {
  formatVersion: typeof COMMAND_LOG_FORMAT_VERSION;
  appVersion: string;
  scenarioId: string;
  seed: number;
  playerClanId: string;
  balanceHash: string;
  truncated: boolean;
  /** `truncated=true` 的可選診斷；舊 v1 檔可無此欄。 */
  incompleteReasons?: CommandLogIncompleteReason[];
  finalDay: number;
  finalHash: string;
  entries: CommandLogEntry[];
}

export interface ReplayResult {
  match: boolean;
  actualHash: string;
  expectedHash: string;
  divergedDay: number | null;
  balanceMismatch: boolean;
}

export type ReplayInitialStateFactory = (log: Readonly<CommandLogFile>) => GameState;

function cloneCommand(command: Command): Command {
  return JSON.parse(JSON.stringify(command)) as Command;
}

/**
 * 每局一個，由 app/game-loop 持有；不進 GameState 亦不進存檔。
 * `recordTick` 只接受 core 回報的成功 envelope，因此硬驗證拒絕不會污染重放檔。
 */
export class CommandLogRecorder {
  private readonly capacity: number;
  private readonly entries: CommandLogEntry[] = [];
  private elapsedDays = 0;
  private readonly incompleteReasons = new Set<CommandLogIncompleteReason>();

  constructor(capacity = COMMAND_LOG_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('CommandLogRecorder: capacity 必須是正整數');
    }
    this.capacity = capacity;
  }

  reset(opts: { incompleteReason?: CommandLogIncompleteReason } = {}): void {
    this.entries.length = 0;
    this.elapsedDays = 0;
    this.incompleteReasons.clear();
    if (opts.incompleteReason !== undefined) {
      this.incompleteReasons.add(opts.incompleteReason);
    }
  }

  recordTick(
    applied: readonly CommandEnvelope[],
    opts: { incompleteReason?: CommandLogIncompleteReason } = {},
  ): void {
    this.elapsedDays += 1;
    if (opts.incompleteReason !== undefined) {
      // success-only 格式無法表達被硬驗證拒絕而消耗的全域 seq；不可偽裝為可重放回歸檔。
      this.incompleteReasons.add(opts.incompleteReason);
    }
    for (let seq = 0; seq < applied.length; seq += 1) {
      const envelope = applied[seq];
      if (envelope === undefined) continue;
      this.entries.push({
        day: this.elapsedDays,
        seq,
        command: cloneCommand(envelope.command),
      });
    }
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
      this.incompleteReasons.add('capacity');
    }
  }

  export(state: Readonly<GameState>): CommandLogFile {
    const incompleteReasons = [...this.incompleteReasons].sort();
    return {
      formatVersion: COMMAND_LOG_FORMAT_VERSION,
      appVersion: state.meta.appVersion,
      scenarioId: state.meta.scenarioId,
      seed: state.meta.seed,
      playerClanId: state.meta.playerClanId,
      balanceHash: balanceHash(),
      truncated: incompleteReasons.length > 0,
      ...(incompleteReasons.length > 0 ? { incompleteReasons } : {}),
      finalDay: this.elapsedDays,
      finalHash: stateHash(state),
      entries: this.entries.map((entry) => ({
        day: entry.day,
        seq: entry.seq,
        command: cloneCommand(entry.command),
      })),
    };
  }
}

function assertReplayOrdering(log: Readonly<CommandLogFile>): void {
  if (log.formatVersion !== COMMAND_LOG_FORMAT_VERSION) {
    throw new Error(`command log formatVersion 不支援：${String(log.formatVersion)}`);
  }
  if (!Number.isInteger(log.finalDay) || log.finalDay < 0) {
    throw new Error('command log finalDay 必須是非負整數');
  }

  let previousDay = 0;
  let expectedSeq = 0;
  for (const entry of log.entries) {
    if (!Number.isInteger(entry.day) || entry.day < 1 || entry.day > log.finalDay) {
      throw new Error(`command log day 超出範圍：${String(entry.day)}`);
    }
    if (entry.day !== previousDay) {
      if (entry.day < previousDay) {
        throw new Error('command log entries 必須依 (day, seq) 嚴格遞增');
      }
      previousDay = entry.day;
      expectedSeq = 0;
    }
    if (entry.seq !== expectedSeq) {
      throw new Error(
        `command log 第 ${String(entry.day)} 日 seq 必須從 0 連續遞增，期望 ${String(expectedSeq)} 實得 ${String(entry.seq)}`,
      );
    }
    expectedSeq += 1;
  }
}

/** 重建初始狀態，按日套用指令，並比對最終 stateHash。 */
export function replayCommandLog(
  log: Readonly<CommandLogFile>,
  buildInitialState: ReplayInitialStateFactory,
): ReplayResult {
  assertReplayOrdering(log);
  const state = buildInitialState(log);
  if (state.meta.scenarioId !== log.scenarioId || state.meta.seed !== log.seed) {
    throw new Error('command log 初始狀態的 scenarioId/seed 與檔案不符');
  }
  if (state.meta.playerClanId !== log.playerClanId) {
    throw new Error('command log 初始狀態的 playerClanId 與檔案不符');
  }

  let entryIndex = 0;
  let envelopeSeq = state.meta.lastAppliedCmdSeq + 1;
  for (let day = 1; day <= log.finalDay; day += 1) {
    const queue: CommandEnvelope[] = [];
    while (log.entries[entryIndex]?.day === day) {
      const entry = log.entries[entryIndex];
      if (entry === undefined) break;
      queue.push({
        seq: envelopeSeq,
        issuedDay: state.time.day,
        command: cloneCommand(entry.command),
      });
      envelopeSeq += 1;
      entryIndex += 1;
    }
    advanceDay(state, queue);
  }

  const actualHash = stateHash(state);
  return {
    match: actualHash === log.finalHash,
    actualHash,
    expectedHash: log.finalHash,
    divergedDay: null,
    balanceMismatch: log.balanceHash !== balanceHash(),
  };
}
