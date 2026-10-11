import { describe, expect, it } from 'vitest';
import {
  createProgressTracker,
  type ProgressMark,
} from '../../src/app/persistence/progressTracker';
import { CLAN_ALPHA, CASTLE_A1 } from '../fixtures/tiny';

const mark = (changes: Partial<ProgressMark> = {}): ProgressMark => ({
  tick: 0,
  lastAppliedCmdSeq: 0,
  pendingCommands: [],
  ...changes,
});
const order = (enabled: boolean) => ({
  type: 'setCastleControl' as const,
  clanId: CLAN_ALPHA,
  castleId: CASTLE_A1,
  directControl: enabled,
});

describe('app save progress tracker', () => {
  it('new and loaded sessions start clean, including a restored pending queue', () => {
    const tracker = createProgressTracker();
    expect(tracker.isDirty()).toBe(false);
    tracker.reset({}, mark(), 0);
    tracker.observe(mark({ tick: 1 }), 1000);
    expect(tracker.isDirty()).toBe(true);
    tracker.reset(
      {},
      mark({ tick: 500, lastAppliedCmdSeq: 99, pendingCommands: [order(true)] }),
      1000,
      42,
    );
    expect(tracker.isDirty()).toBe(false);
    expect(tracker.getPlaytimeSeconds(2000)).toBe(43);
  });

  it.each([
    mark({ tick: 1 }),
    mark({ tickSeq: 1 }),
    mark({ lastAppliedCmdSeq: 1 }),
    mark({ pendingCommands: [order(true)] }),
  ])('marks tick, applied serial and paused queue progress dirty: %j', (progress) => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    tracker.observe(progress, 0);
    expect(tracker.isDirty()).toBe(true);
    expect(tracker.shouldWarnBeforeUnload()).toBe(true);
    const snapshot = tracker.captureSave(progress, 0)!;
    expect(tracker.completeSave(snapshot)).toBe(true);
    expect(tracker.isDirty()).toBe(false);
    expect(tracker.shouldWarnBeforeUnload()).toBe(false);
  });

  it('captures fresh progress atomically without requiring a separate observe', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const snapshot = tracker.captureSave(
      mark({ tick: 3, lastAppliedCmdSeq: 5, pendingCommands: [order(true)] }),
      1000,
    )!;
    expect(snapshot.tick).toBe(3);
    expect(snapshot.lastAppliedCmdSeq).toBe(5);
    expect(snapshot.pendingSignature).toBe(JSON.stringify([order(true)]));
    expect(tracker.isDirty()).toBe(true);
    tracker.completeSave(snapshot);
    expect(tracker.isDirty()).toBe(false);
  });

  it('does not clear work done while an asynchronous save is in flight', async () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const snapshot = tracker.captureSave(mark({ tick: 1 }), 0)!;
    let finish!: () => void;
    const write = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const save = write.then(() => tracker.completeSave(snapshot));
    tracker.observe(mark({ tick: 2, lastAppliedCmdSeq: 1 }), 1000);
    finish();
    expect(await save).toBe(true);
    expect(tracker.isDirty()).toBe(true);
  });

  it('captures tactical queues by value and leaves subsequent tactical work dirty during I/O', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const queue = [
      {
        battleId: 'battle.test' as import('../../src/core/state/ids').BattleId,
        orders: [{ kind: 'toggleDelegate' as const, unitId: 'bu.test', enabled: true }],
      },
    ];
    const snapshot = tracker.captureSave(mark({ pendingBattleOrders: queue }), 0)!;
    queue[0]!.orders[0]!.enabled = false;
    tracker.observe(mark({ tickSeq: 1, pendingBattleOrders: queue }), 1);
    expect(snapshot.battlePendingSignature).toContain('"enabled":true');
    expect(tracker.completeSave(snapshot)).toBe(true);
    expect(tracker.isDirty()).toBe(true);
    tracker.reset({}, mark(), 2);
    expect(tracker.completeSave(snapshot)).toBe(false);
  });

  it('detects same-size queue replacements and isolates snapshots from later array mutations', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const pending = [order(true)];
    const snapshot = tracker.captureSave(mark({ pendingCommands: pending }), 0)!;
    pending[0] = order(false);
    tracker.observe(mark({ pendingCommands: pending }), 0);
    tracker.completeSave(snapshot);
    expect(snapshot.pendingSignature).toBe(JSON.stringify([order(true)]));
    expect(tracker.isDirty()).toBe(true);
  });

  it('ignores old-session completion even when reset reuses the same state object', () => {
    const tracker = createProgressTracker();
    const session = {};
    tracker.reset(session, mark(), 0);
    const old = tracker.captureSave(mark({ tick: 1 }), 0)!;
    tracker.reset(session, mark(), 0);
    tracker.observe(mark({ pendingCommands: [order(false)] }), 0);
    expect(tracker.completeSave(old)).toBe(false);
    expect(tracker.isDirty()).toBe(true);
  });

  it('old same-session completion cannot regress a newer successful save', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const old = tracker.captureSave(mark({ tick: 1 }), 0)!;
    const newer = tracker.captureSave(mark({ tick: 2 }), 0)!;
    tracker.completeSave(newer);
    tracker.completeSave(old);
    expect(tracker.isDirty()).toBe(false);
    tracker.observe(mark({ tick: 3 }), 0);
    tracker.completeSave(newer);
    expect(tracker.isDirty()).toBe(true);
  });

  it('a failed write leaves dirty progress unchanged', async () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    tracker.captureSave(mark({ tick: 1 }), 0);
    await expect(Promise.reject(new Error('disk full'))).rejects.toThrow('disk full');
    expect(tracker.isDirty()).toBe(true);
  });

  it('rejects forged and foreign-tracker tokens', () => {
    const tracker = createProgressTracker();
    const other = createProgressTracker();
    tracker.reset({}, mark(), 0);
    other.reset({}, mark(), 0);
    const snapshot = tracker.captureSave(mark({ tick: 1 }), 0)!;
    expect(tracker.completeSave({ ...snapshot })).toBe(false);
    expect(other.completeSave(snapshot)).toBe(false);
  });

  it('title state suppresses warnings, stops time, and invalidates save completion', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 0);
    const snapshot = tracker.captureSave(mark({ tick: 1 }), 1000)!;
    tracker.reset(null, mark(), 1000);
    expect(tracker.shouldWarnBeforeUnload()).toBe(false);
    expect(tracker.captureSave(mark(), 2000)).toBeNull();
    expect(tracker.completeSave(snapshot)).toBe(false);
    expect(tracker.getPlaytimeSeconds(10000)).toBe(0);
  });

  it('counts fractional elapsed intervals and pauses, but clock reversal cannot double count', () => {
    const tracker = createProgressTracker();
    tracker.reset({}, mark(), 1000, 10);
    expect(tracker.getPlaytimeSeconds(1500)).toBe(10);
    expect(tracker.getPlaytimeSeconds(2000)).toBe(11);
    expect(tracker.isDirty()).toBe(false); // Playtime alone is not core progress.
    expect(tracker.getPlaytimeSeconds(1200)).toBe(11);
    expect(tracker.getPlaytimeSeconds(2000)).toBe(11);
    expect(tracker.getPlaytimeSeconds(3500)).toBe(12);
    expect(tracker.captureSave(mark(), 4000)!.playtimeSeconds).toBe(13);
  });

  it('rejects invalid counters, timestamps and loaded playtime', () => {
    const tracker = createProgressTracker();
    expect(() => tracker.reset({}, mark({ tick: -1 }), 0)).toThrow(RangeError);
    expect(() => tracker.reset({}, mark(), NaN)).toThrow(RangeError);
    expect(() => tracker.reset({}, mark(), 0, -1)).toThrow(RangeError);
    tracker.reset({}, mark(), 0);
    expect(() => tracker.observe(mark({ lastAppliedCmdSeq: 0.5 }), 0)).toThrow(RangeError);
    expect(() => tracker.getPlaytimeSeconds(Infinity)).toThrow(RangeError);
  });
});
