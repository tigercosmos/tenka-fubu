import type { SaveFile } from '@core/save/serialize';
import {
  AUTOSAVE_CURSOR_KEY,
  createSaveStore,
  SAVECFG,
  type SaveOutcome,
  type SaveSlotId,
} from './saveStore';
import type { SaveStorageAdapter } from './storage';

export type AutoSaveOutcome =
  | { ok: true; slotId: SaveSlotId }
  | {
      ok: false;
      error: 'suspended' | 'session-changed' | 'quota-exceeded' | 'write-failed' | 'too-large';
    };

/** 季首 hook 的 session 控制器；呼叫端先捕捉 tick 邊界的信封與 dirty mark。 */
export function createAutosaveController(
  adapter: SaveStorageAdapter,
  onSuspended: () => void = () => {},
) {
  const store = createSaveStore(adapter);
  let suspended = false;
  let generation = 0;
  let tail: Promise<unknown> = Promise.resolve();

  function resetSession(): void {
    generation += 1;
    suspended = false;
  }

  function saveSeasonSnapshot(save: SaveFile): Promise<AutoSaveOutcome> {
    const requestedGeneration = generation;
    // 等待 I/O 前就保留當季快照，不能到真正寫入時才抓活狀態。
    let snapshot: SaveFile;
    try {
      snapshot = JSON.parse(JSON.stringify(save)) as SaveFile;
    } catch {
      return Promise.resolve({ ok: false, error: 'write-failed' });
    }
    const task = tail
      .catch(() => undefined)
      .then(async (): Promise<AutoSaveOutcome> => {
        if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
        if (suspended) return { ok: false, error: 'suspended' };
        let cursor = 0;
        try {
          const value = await adapter.get(AUTOSAVE_CURSOR_KEY);
          if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
            cursor = value;
        } catch {
          return fail({ ok: false, error: 'write-failed' });
        }
        if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
        const slotId = `auto:${(cursor % SAVECFG.autoSaveSlots) + 1}` as SaveSlotId;
        let outcome = await store.saveAutosaveToSlot(slotId, snapshot, cursor + 1);
        if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
        if (!outcome.ok && outcome.error === 'quota-exceeded' && SAVECFG.autoSaveRetryMax > 0) {
          const candidates = (await store.listSlots())
            .filter((view) => view.slotId.startsWith('auto:') && view.status === 'ok')
            .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
          const oldest = candidates[0];
          if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
          if (oldest && (await store.deleteSlot(oldest.slotId)).ok) {
            if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
            outcome = await store.saveAutosaveToSlot(slotId, snapshot, cursor + 1);
          }
        }
        if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
        if (!outcome.ok) return fail(outcome);
        return { ok: true, slotId };

        function fail(outcome: Exclude<SaveOutcome, { ok: true }>): AutoSaveOutcome {
          if (requestedGeneration !== generation) return { ok: false, error: 'session-changed' };
          if (!suspended) {
            suspended = true;
            onSuspended(); // app-only critical toast + HUD，絕不寫入 core Report。
          }
          return {
            ok: false,
            error:
              outcome.error === 'quota-exceeded'
                ? 'quota-exceeded'
                : outcome.error === 'too-large'
                  ? 'too-large'
                  : 'write-failed',
          };
        }
      });
    tail = task;
    return task;
  }
  return { saveSeasonSnapshot, resetSession, isSuspended: () => suspended };
}
