// App-only save progress and elapsed playtime (16 §3.10/§5.2).
// The caller captures progress after queue changes and ticks, before it starts an async save.
import type { Command } from '../../core/commands/types';
import type { PendingBattleOrders } from '../battleBridge';

export interface ProgressMark {
  tick: number;
  lastAppliedCmdSeq: number;
  pendingCommands: readonly Command[];
  /** Runtime mutation publication, including tactical ticks; absent in legacy callers. */
  tickSeq?: number;
  pendingBattleOrders?: readonly PendingBattleOrders[];
}

export interface MarkSnapshot {
  readonly tick: number;
  readonly lastAppliedCmdSeq: number;
  readonly pendingSignature: string;
  readonly tickSeq: number;
  readonly battlePendingSignature: string;
  readonly playtimeSeconds: number;
}

interface CapturedMark {
  tick: number;
  lastAppliedCmdSeq: number;
  pendingSignature: string;
  tickSeq: number;
  battlePendingSignature: string;
}

function captureMark(mark: ProgressMark): CapturedMark {
  for (const value of [mark.tick, mark.lastAppliedCmdSeq, mark.tickSeq ?? 0]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid progress counter');
  }
  return {
    tick: mark.tick,
    lastAppliedCmdSeq: mark.lastAppliedCmdSeq,
    // Copy queue content into a scalar; later caller mutations cannot change a captured save mark.
    pendingSignature: JSON.stringify(mark.pendingCommands),
    tickSeq: mark.tickSeq ?? 0,
    battlePendingSignature: JSON.stringify(mark.pendingBattleOrders ?? []),
  };
}

/** Independent tracker; it never changes GameState, queue contents, or browser listeners. */
export function createProgressTracker() {
  let session: object | null = null;
  let generation = 0;
  let revision = 0;
  let savedRevision = 0;
  let current: CapturedMark = {
    tick: 0,
    lastAppliedCmdSeq: 0,
    pendingSignature: '[]',
    tickSeq: 0,
    battlePendingSignature: '[]',
  };
  let elapsedSeconds = 0;
  let previousTimeMs = 0;
  const snapshots = new WeakMap<MarkSnapshot, { generation: number; revision: number }>();

  function updateTime(nowMs: number): void {
    if (!Number.isFinite(nowMs)) throw new RangeError('Invalid progress clock');
    if (session !== null) elapsedSeconds += Math.max(0, nowMs - previousTimeMs) / 1000;
    // A backwards clock cannot count the recovery interval twice.
    previousTimeMs = Math.max(previousTimeMs, nowMs);
  }

  function observe(mark: ProgressMark, nowMs: number): void {
    const captured = captureMark(mark);
    updateTime(nowMs);
    if (session === null) return;
    if (
      captured.tick !== current.tick ||
      captured.lastAppliedCmdSeq !== current.lastAppliedCmdSeq ||
      captured.tickSeq !== current.tickSeq ||
      captured.battlePendingSignature !== current.battlePendingSignature ||
      captured.pendingSignature !== current.pendingSignature
    ) {
      revision += 1;
      current = captured;
    }
  }

  return {
    /** New/load resets are clean, including a restored queue. Null means the title screen. */
    reset(
      nextSession: object | null,
      mark: ProgressMark,
      nowMs: number,
      playtimeSeconds = 0,
    ): void {
      if (!Number.isFinite(nowMs) || !Number.isFinite(playtimeSeconds) || playtimeSeconds < 0) {
        throw new RangeError('Invalid session clock');
      }
      const captured = captureMark(mark);
      generation += 1;
      session = nextSession;
      current = captured;
      revision = 0;
      savedRevision = 0;
      elapsedSeconds = playtimeSeconds;
      previousTimeMs = nowMs;
    },

    /** Observe all queue changes, even replacements that keep the same queue length. */
    observe,

    /** Capture before serialization. Save completion must use this exact token. */
    captureSave(mark: ProgressMark, nowMs: number): MarkSnapshot | null {
      observe(mark, nowMs);
      if (session === null) return null;
      const snapshot = Object.freeze({ ...current, playtimeSeconds: Math.floor(elapsedSeconds) });
      snapshots.set(snapshot, { generation, revision });
      return snapshot;
    },

    /** Call only after a successful write. Old sessions and foreign tokens have no effect. */
    completeSave(snapshot: MarkSnapshot): boolean {
      const captured = snapshots.get(snapshot);
      if (session === null || captured === undefined || captured.generation !== generation)
        return false;
      savedRevision = Math.max(savedRevision, captured.revision);
      return true;
    },

    isDirty(): boolean {
      return session !== null && revision > savedRevision;
    },

    /** The caller registers beforeunload only while this value is true. */
    shouldWarnBeforeUnload(): boolean {
      return session !== null && revision > savedRevision;
    },

    /** Count real elapsed time in the game session, including pauses; never advance core time. */
    getPlaytimeSeconds(nowMs: number): number {
      updateTime(nowMs);
      return Math.floor(elapsedSeconds);
    },
  };
}

export type ProgressTracker = ReturnType<typeof createProgressTracker>;
