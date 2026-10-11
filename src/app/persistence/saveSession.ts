import type { SaveFile, SaveMetadataContext } from '@core/save/serialize';
import { createAutosaveController, type AutoSaveOutcome } from './autosave';
import type { MarkSnapshot } from './progressTracker';
import {
  createSaveStore,
  type SaveOutcome,
  type SaveSlotId,
  type SaveOperationGuard,
} from './saveStore';
import type { createSessionProgressBinding } from './sessionProgress';
import { indexedDbSaveStorage, type SaveStorageAdapter } from './storage';

type SessionFailure = { ok: false; error: 'no-session' | 'session-changed' };
export type SaveSessionOutcome = SaveOutcome | SessionFailure;
export type AutoSaveSessionOutcome = AutoSaveOutcome | SessionFailure;
export interface CapturedSessionSave {
  save: SaveFile;
  mark: MarkSnapshot;
  session: object;
}
export interface SaveSessionOptions {
  adapter?: SaveStorageAdapter;
  progress: Pick<
    ReturnType<typeof createSessionProgressBinding>,
    'captureSave' | 'completeSave' | 'resetSession'
  >;
  getSession: () => object | null;
  captureSnapshot: (timestamp: number, context: SaveMetadataContext) => SaveFile;
  wallNow: () => number;
  appVersion: string;
  onAutosaveStatusChange?: (suspended: boolean) => void;
}

/** App-owned session boundary; captures queue/state before any asynchronous storage work. */
export function createSaveSessionController(options: SaveSessionOptions) {
  const adapter = options.adapter ?? indexedDbSaveStorage;
  const store = createSaveStore(adapter);
  let generation = 0;
  let statusSession = options.getSession();
  const autosave = createAutosaveController(adapter, () => {
    if (statusSession !== null && options.getSession() === statusSession)
      options.onAutosaveStatusChange?.(true);
  });

  function captureCurrent(slotLabel = ''): CapturedSessionSave | null {
    const session = options.getSession();
    if (session === null) return null;
    const mark = options.progress.captureSave();
    if (mark === null) return null;
    const save = options.captureSnapshot(options.wallNow(), {
      appVersion: options.appVersion,
      slotLabel,
      playtimeSeconds: mark.playtimeSeconds,
    });
    // Keep the controller boundary safe even for capture adapters returning live references.
    const detached = JSON.parse(JSON.stringify(save)) as SaveFile;
    if (options.getSession() !== session) return null;
    return { save: detached, mark, session };
  }

  function isCurrent(captured: CapturedSessionSave, requestedGeneration: number): boolean {
    return generation === requestedGeneration && options.getSession() === captured.session;
  }

  return {
    store,
    captureCurrent,
    /** Caller mounts the game and restores its pending queue before resetting this baseline. */
    resetSession(playtimeSeconds = 0): void {
      const requestedGeneration = ++generation;
      statusSession = options.getSession();
      autosave.resetSession();
      options.progress.resetSession(playtimeSeconds);
      if (requestedGeneration === generation && options.getSession() === statusSession)
        options.onAutosaveStatusChange?.(false);
    },
    async saveCurrent(
      slotId: SaveSlotId,
      slotLabel = '',
      guard?: SaveOperationGuard,
    ): Promise<SaveSessionOutcome> {
      const requestedGeneration = generation;
      let captured: CapturedSessionSave | null;
      try {
        captured = captureCurrent(slotLabel);
      } catch {
        return { ok: false, error: 'write-failed' };
      }
      if (captured === null) return { ok: false, error: 'no-session' };
      const expectedVersion = guard?.expectedVersion;
      const callerCurrent = guard?.isCurrent;
      const outcome = await store.saveToSlot(slotId, captured.save, {
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
        isCurrent: () => isCurrent(captured, requestedGeneration) && (callerCurrent?.() ?? true),
      });
      if (!isCurrent(captured, requestedGeneration)) return { ok: false, error: 'session-changed' };
      if (outcome.ok) options.progress.completeSave(captured.mark);
      return outcome;
    },
    /** Only a caller's seasonal tick hook invokes this; no timers or core subscriptions here. */
    async saveSeasonSnapshot(slotLabel = ''): Promise<AutoSaveSessionOutcome> {
      const requestedGeneration = generation;
      let captured: CapturedSessionSave | null;
      try {
        captured = captureCurrent(slotLabel);
      } catch {
        return { ok: false, error: 'write-failed' };
      }
      if (captured === null) return { ok: false, error: 'no-session' };
      const outcome = await autosave.saveSeasonSnapshot(captured.save);
      if (!isCurrent(captured, requestedGeneration)) return { ok: false, error: 'session-changed' };
      if (outcome.ok) options.progress.completeSave(captured.mark);
      return outcome;
    },
    isAutosaveSuspended: (): boolean =>
      statusSession !== null && options.getSession() === statusSession && autosave.isSuspended(),
  };
}

export type SaveSessionController = ReturnType<typeof createSaveSessionController>;
