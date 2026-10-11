import { describe, expect, it, vi } from 'vitest';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import type { ProgressMark } from '../../src/app/persistence/progressTracker';
import { CLAN_ALPHA, CASTLE_A1 } from '../fixtures/tiny';

const mark = (changes: Partial<ProgressMark> = {}): ProgressMark => ({
  tick: 0,
  lastAppliedCmdSeq: 0,
  pendingCommands: [],
  ...changes,
});
const command = (enabled: boolean) => ({
  type: 'setCastleControl' as const,
  clanId: CLAN_ALPHA,
  castleId: CASTLE_A1,
  directControl: enabled,
});

function harness(initialSession: object | null = {}) {
  let session = initialSession;
  let progress: ProgressMark | null = session === null ? null : mark();
  let time = 0;
  const subscriptions = new Set<() => void>();
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const target = {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      expect(type).toBe('beforeunload');
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      expect(type).toBe('beforeunload');
      listeners.delete(listener);
    }),
  };
  const onDirtyChange = vi.fn();
  const unsubscribe = vi.fn();
  const binding = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => progress,
    now: () => time,
    subscribe: (callback) => {
      subscriptions.add(callback);
      return () => {
        subscriptions.delete(callback);
        unsubscribe();
      };
    },
    target,
    onDirtyChange,
  });
  return {
    binding,
    target,
    listeners,
    subscriptions,
    onDirtyChange,
    unsubscribe,
    setProgress(next: ProgressMark | null, notify = true) {
      progress = next;
      if (notify) for (const callback of [...subscriptions]) callback();
    },
    setSession(next: object | null, nextMark: ProgressMark | null = next === null ? null : mark()) {
      session = next;
      progress = nextMark;
      for (const callback of [...subscriptions]) callback();
    },
    setTime(next: number) {
      time = next;
    },
    unload() {
      const event = { preventDefault: vi.fn(), returnValue: undefined };
      for (const listener of [...listeners]) {
        if (typeof listener === 'function') listener(event as unknown as Event);
        else listener.handleEvent(event as unknown as Event);
      }
      return event;
    },
  };
}

describe('session progress app binding', () => {
  it('installs a subscription but no beforeunload warning for a clean session', () => {
    const h = harness();
    const cleanup = h.binding.install();
    expect(h.subscriptions.size).toBe(1);
    expect(h.binding.isDirty()).toBe(false);
    expect(h.listeners.size).toBe(0);
    expect(h.onDirtyChange).not.toHaveBeenCalled();
    cleanup();
    expect(h.subscriptions.size).toBe(0);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
  });

  it('registers exactly one listener only while dirty and publishes only dirty transitions', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    h.setProgress(mark({ tick: 2 }));
    expect(h.target.addEventListener).toHaveBeenCalledOnce();
    expect(h.onDirtyChange.mock.calls).toEqual([[true]]);
    const event = h.unload();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
    expect(h.binding.completeSave(h.binding.captureSave()!)).toBe(true);
    expect(h.listeners.size).toBe(0);
    expect(h.target.removeEventListener).toHaveBeenCalledOnce();
    expect(h.onDirtyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('observes unnotified progress before asynchronous save completion', async () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    const snapshot = h.binding.captureSave()!;
    let resolve!: () => void;
    const write = new Promise<void>((done) => {
      resolve = done;
    });
    const save = write.then(() => h.binding.completeSave(snapshot));
    h.setProgress(mark({ tick: 2 }), false);
    resolve();
    expect(await save).toBe(true);
    expect(h.binding.isDirty()).toBe(true);
    expect(h.listeners.size).toBe(1);
  });

  it('failed save does not remove the warning or clear dirty progress', async () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ pendingCommands: [command(true)] }));
    h.binding.captureSave();
    await expect(Promise.reject(new Error('quota'))).rejects.toThrow('quota');
    expect(h.binding.isDirty()).toBe(true);
    expect(h.listeners.size).toBe(1);
  });

  it('same-size pending queue replacement during a save remains dirty', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ pendingCommands: [command(true)] }));
    const snapshot = h.binding.captureSave()!;
    h.setProgress(mark({ pendingCommands: [command(false)] }), false);
    h.binding.completeSave(snapshot);
    expect(h.binding.isDirty()).toBe(true);
  });

  it('fresh session identity clears warnings and ignores old-session completion', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    const old = h.binding.captureSave()!;
    h.setSession({}, mark({ tick: 10, lastAppliedCmdSeq: 20 }));
    expect(h.binding.isDirty()).toBe(false);
    expect(h.listeners.size).toBe(0);
    h.setProgress(mark({ tick: 11, lastAppliedCmdSeq: 20 }));
    expect(h.binding.completeSave(old)).toBe(false);
    expect(h.binding.isDirty()).toBe(true);
  });

  it('explicit load/reset invalidates old tokens even when the session object is reused', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    const old = h.binding.captureSave()!;
    h.binding.resetSession(42);
    expect(h.binding.isDirty()).toBe(false);
    expect(h.binding.completeSave(old)).toBe(false);
    h.setTime(1500);
    expect(h.binding.getPlaytimeSeconds()).toBe(43);
    expect(h.binding.captureSave()!.playtimeSeconds).toBe(43);
  });

  it('restored pending commands form a clean loaded baseline', () => {
    const h = harness(null);
    h.binding.install();
    h.setSession({}, mark({ tick: 20, lastAppliedCmdSeq: 5, pendingCommands: [command(true)] }));
    h.binding.resetSession(100);
    expect(h.binding.isDirty()).toBe(false);
    expect(h.listeners.size).toBe(0);
    h.setProgress(mark({ tick: 21, lastAppliedCmdSeq: 6 }));
    expect(h.binding.isDirty()).toBe(true);
  });

  it('beforeunload synchronizes a session change before deciding to block navigation', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    // Remove the subscription to model an identity change before its callback runs.
    h.subscriptions.clear();
    h.setSession(null);
    const event = h.unload();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
    expect(h.binding.captureSave()).toBeNull();
    h.setTime(10000);
    expect(h.binding.getPlaytimeSeconds()).toBe(0);
  });

  it('cleanup removes the subscription and dirty listener; repeated cleanup is harmless', () => {
    const h = harness();
    const cleanup = h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    cleanup();
    cleanup();
    expect(h.subscriptions.size).toBe(0);
    expect(h.listeners.size).toBe(0);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.target.removeEventListener).toHaveBeenCalledOnce();
    h.setProgress(mark({ tick: 2 }));
    expect(h.target.addEventListener).toHaveBeenCalledOnce();
  });

  it('install replaces rather than duplicates a subscription and retains one dirty listener', () => {
    const h = harness();
    h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    const cleanup = h.binding.install();
    expect(h.subscriptions.size).toBe(1);
    expect(h.listeners.size).toBe(1);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    cleanup();
    expect(h.subscriptions.size).toBe(0);
    expect(h.listeners.size).toBe(0);
  });

  it('cleanup from an older installation cannot detach the current installation', () => {
    const h = harness();
    const oldCleanup = h.binding.install();
    h.setProgress(mark({ tick: 1 }));
    const currentCleanup = h.binding.install();
    oldCleanup();
    expect(h.subscriptions.size).toBe(1);
    expect(h.listeners.size).toBe(1);
    currentCleanup();
    expect(h.subscriptions.size).toBe(0);
    expect(h.listeners.size).toBe(0);
  });
});
