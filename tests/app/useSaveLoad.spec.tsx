import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { setGame, store } from '../../src/app/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveLoad } from '../../src/app/persistence/useSaveLoad';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import type { LoadOutcome, SaveSlotView } from '../../src/app/persistence/saveStore';
import { buildSaveFile, type SaveFile } from '../../src/core/save/serialize';
import type { Command } from '../../src/core/commands/types';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA } from '../fixtures/tiny';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const adapter = createMemorySaveStorage();
  let session: object | null = {};
  const pending: Command[] = [];
  const game = buildTinyState();
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: pending }),
    subscribe: () => () => {},
    now: () => 0,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const controller = createSaveSessionController({
    adapter,
    progress,
    getSession: () => session,
    captureSnapshot: (timestamp, context) => buildSaveFile(game, timestamp, pending, context),
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession(42);
  return {
    adapter,
    controller,
    pending,
    progress,
    replaceSession: () => {
      session = {};
      controller.resetSession();
    },
  };
}

const command: Command = {
  type: 'setCastleControl',
  clanId: CLAN_ALPHA,
  castleId: CASTLE_A1,
  directControl: false,
};
const saved = () => buildSaveFile(buildTinyState(), 123, [command]);
async function ready(controller = harness().controller) {
  const onLoad = vi.fn();
  const hook = renderHook(() => useSaveLoad(controller, onLoad));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  return { ...hook, onLoad };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('M8 save/load orchestration', () => {
  it('announces a saved quick slot only after refresh releases the operation lock', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    const views = await h.controller.store.listSlots();
    const gate = deferred<SaveSlotView[]>();
    const list = vi.spyOn(h.controller.store, 'listSlots').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickSave();
    });
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    const duringRefresh = { busy: hook.result.current.busy, notice: hook.result.current.notice };
    await act(async () => {
      gate.resolve(views);
      await task;
    });
    expect(duringRefresh).toEqual({ busy: true, notice: null });
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.notice?.text).toBe('已快速存檔');
  });

  it('admits an immediate quick load from the save-success observer', async () => {
    const h = harness();
    const onLoad = vi.fn<(save: SaveFile, isCurrent: () => boolean) => void>();
    let loadTask: Promise<void> | undefined;
    const hook = renderHook(() => {
      const ui = useSaveLoad(h.controller, onLoad);
      useEffect(() => {
        if (ui.notice?.text === '已快速存檔') loadTask = ui.quickLoad();
      }, [ui.notice]);
      return ui;
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    const gate = deferred<SaveSlotView[]>();
    const views = await h.controller.store.listSlots();
    const list = vi.spyOn(h.controller.store, 'listSlots').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickSave();
    });
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    await act(async () => {
      gate.resolve(views);
      await task;
    });
    await act(async () => {
      await loadTask;
    });
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onLoad.mock.calls[0]?.[0].state).toEqual(saved().state);
  });

  it.each(['reset', 'unmount', 'replacement'] as const)(
    'does not announce success after %s during refresh',
    async (departure) => {
      const h = harness();
      const seen = vi.fn();
      const hook = renderHook(() => {
        const ui = useSaveLoad(h.controller, vi.fn());
        useEffect(() => {
          if (ui.notice) seen(ui.notice);
        }, [ui.notice]);
        return ui;
      });
      await waitFor(() => expect(hook.result.current.busy).toBe(false));
      const views = await h.controller.store.listSlots();
      const gate = deferred<SaveSlotView[]>();
      const list = vi.spyOn(h.controller.store, 'listSlots').mockReturnValueOnce(gate.promise);
      let task!: Promise<void>;
      act(() => {
        task = hook.result.current.quickSave();
      });
      await waitFor(() => expect(list).toHaveBeenCalledOnce());
      const originalGame = store.getState().game;
      if (departure === 'reset') act(() => hook.result.current.resetUi());
      else if (departure === 'unmount') hook.unmount();
      else act(() => setGame(buildTinyState()));
      await act(async () => {
        gate.resolve(views);
        await task;
      });
      if (departure === 'replacement') act(() => setGame(originalGame));
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it('does not announce success when the post-save refresh fails', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    vi.spyOn(h.controller.store, 'listSlots').mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    await act(() => hook.result.current.quickSave());
    expect(hook.result.current.notice).toBeNull();
    expect(hook.result.current.error).not.toBeNull();
    expect(hook.result.current.busy).toBe(false);
    expect((await h.controller.store.loadFromSlot('quick:1')).ok).toBe(true);
  });

  it('keeps a load busy until its async session provider commits and blocks duplicate loads', async () => {
    const h = harness();
    const gate = deferred<void>();
    const onLoad = vi.fn(async (_save: SaveFile, isCurrent: () => boolean) => {
      await gate.promise;
      expect(isCurrent()).toBe(true);
    });
    vi.spyOn(h.controller.store, 'loadFromSlot').mockResolvedValue({
      ok: true,
      save: saved(),
      migratedFrom: null,
    });
    const hook = renderHook(() => useSaveLoad(h.controller, onLoad));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickLoad();
    });
    await waitFor(() => expect(onLoad).toHaveBeenCalledOnce());
    expect(hook.result.current.busy).toBe(true);
    await act(() => hook.result.current.quickLoad());
    expect(onLoad).toHaveBeenCalledOnce();
    await act(async () => {
      gate.resolve();
      await task;
    });
    expect(hook.result.current.busy).toBe(false);
  });

  it('invalidates an async provider after reset without closing a newer panel', async () => {
    const h = harness();
    const gate = deferred<void>();
    let committed = false;
    const onLoad = vi.fn(async (_save: SaveFile, isCurrent: () => boolean) => {
      await gate.promise;
      if (isCurrent()) committed = true;
    });
    vi.spyOn(h.controller.store, 'loadFromSlot').mockResolvedValue({
      ok: true,
      save: saved(),
      migratedFrom: null,
    });
    const hook = renderHook(() => useSaveLoad(h.controller, onLoad));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickLoad();
    });
    await waitFor(() => expect(onLoad).toHaveBeenCalledOnce());
    act(() => {
      hook.result.current.resetUi();
      hook.result.current.open('save');
    });
    await act(async () => {
      gate.resolve();
      await task;
    });
    expect(committed).toBe(false);
    expect(hook.result.current.mode).toBe('save');
  });

  it('retains imported preview when catalog preparation rejects, with no success or session reset', async () => {
    const h = harness();
    const onLoad = vi.fn(() => Promise.reject(new Error('catalog unavailable')));
    const hook = renderHook(() => useSaveLoad(h.controller, onLoad));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    act(() => hook.result.current.open('load'));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    await act(() =>
      hook.result.current
        .panelProps('title', false)
        .onImport({ size: 1, text: () => Promise.resolve(JSON.stringify(saved())) } as File),
    );
    const preview = hook.result.current.panelProps('title', false).importPreview;
    await act(() => hook.result.current.panelProps('title', false).onImportLoad());
    expect(onLoad).toHaveBeenCalledOnce();
    expect(hook.result.current.panelProps('title', false).importPreview).toEqual(preview);
    expect(hook.result.current.mode).toBe('load');
    expect(hook.result.current.error).toBe('無法載入此遊戲。請稍後重試或匯出存檔以保留進度。');
    expect(hook.result.current.notice).toBeNull();
    expect(hook.result.current.busy).toBe(false);
  });
  it('publishes canonical successful save/delete notices and ignores stale dismiss timers', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    await act(() => hook.result.current.panelProps('main', false).onSave('manual:2'));
    const manual = hook.result.current.notice;
    expect(manual?.text).toBe('已存檔至「手動 2」');
    await act(() => hook.result.current.quickSave());
    const quick = hook.result.current.notice;
    expect(quick?.text).toBe('已快速存檔');
    expect(quick?.id).not.toBe(manual?.id);
    act(() => hook.result.current.dismissNotice(manual!.id));
    expect(hook.result.current.notice).toEqual(quick);
    act(() => hook.result.current.dismissNotice(quick!.id));
    expect(hook.result.current.notice).toBeNull();
    await act(() => hook.result.current.panelProps('main', false).onDelete('manual:2'));
    expect(hook.result.current.notice?.text).toBe('已刪除存檔');
    act(() => hook.result.current.resetUi());
    expect(hook.result.current.notice).toBeNull();
  });

  it('empty F9 uses its app notice, while write failures never publish success', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    await act(() => hook.result.current.quickLoad());
    expect(hook.result.current.notice?.text).toBe('沒有快速存檔');
    expect(hook.result.current.error).toBeNull();
    act(() => hook.result.current.dismissNotice(hook.result.current.notice!.id));
    h.pending.push(command);
    vi.spyOn(h.controller, 'saveCurrent').mockResolvedValueOnce({
      ok: false,
      error: 'write-failed',
    });
    await act(() => hook.result.current.quickSave());
    expect(hook.result.current.notice).toBeNull();
    expect(hook.result.current.error).not.toBeNull();
    expect(h.progress.isDirty()).toBe(true);
    vi.spyOn(h.controller.store, 'deleteSlot').mockResolvedValueOnce({
      ok: false,
      error: 'write-failed',
    });
    await act(() => hook.result.current.panelProps('main', true).onDelete('manual:1'));
    expect(hook.result.current.notice).toBeNull();
  });

  it('late save/delete results and empty quick loads cannot publish replacement-session notices', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    const saveGate = deferred<Awaited<ReturnType<typeof h.controller.saveCurrent>>>();
    vi.spyOn(h.controller, 'saveCurrent').mockReturnValueOnce(saveGate.promise);
    let saveTask!: Promise<void>;
    act(() => {
      saveTask = hook.result.current.quickSave();
    });
    act(() => hook.result.current.resetUi());
    await act(async () => {
      saveGate.resolve({ ok: true });
      await saveTask;
    });
    expect(hook.result.current.notice).toBeNull();
    const deleteGate = deferred<Awaited<ReturnType<typeof h.controller.store.deleteSlot>>>();
    vi.spyOn(h.controller.store, 'deleteSlot').mockReturnValueOnce(deleteGate.promise);
    let deleteTask: void | Promise<void>;
    act(() => {
      deleteTask = hook.result.current.panelProps('main', false).onDelete('manual:1');
    });
    act(() => hook.result.current.resetUi());
    await act(async () => {
      deleteGate.resolve({ ok: true });
      await deleteTask;
    });
    expect(hook.result.current.notice).toBeNull();
    const loadGate = deferred<LoadOutcome>();
    vi.spyOn(h.controller.store, 'loadFromSlot').mockReturnValueOnce(loadGate.promise);
    let loadTask!: Promise<void>;
    act(() => {
      loadTask = hook.result.current.quickLoad();
    });
    act(() => hook.result.current.resetUi());
    await act(async () => {
      loadGate.resolve({ ok: false, error: 'empty-slot' });
      await loadTask;
    });
    expect(hook.result.current.notice).toBeNull();
  });

  it('import storage reports its slot without clearing current progress, and export adds no feedback', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    h.pending.push(command);
    await act(() =>
      hook.result.current.panelProps('main', true).onImport({
        size: 1,
        text: () => Promise.resolve(JSON.stringify(saved())),
      } as File),
    );
    expect(hook.result.current.notice).toBeNull();
    await act(() => hook.result.current.panelProps('main', true).onImportStore('manual:3'));
    const notice = hook.result.current.notice;
    expect(notice?.text).toBe('已存檔至「手動 3」');
    expect(h.progress.isDirty()).toBe(true);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(() =>
      hook.result.current.panelProps('main', true).onExport('manual:3', { raw: false }),
    );
    expect(hook.result.current.notice).toEqual(notice);
    expect(h.progress.isDirty()).toBe(true);
  });
  it('saves and loads a detached pending queue through the real session/store boundary', async () => {
    const h = harness();
    h.pending.push(command);
    const hook = await ready(h.controller);
    await act(() => hook.result.current.quickSave());
    expect(hook.result.current.hasSave).toBe(true);
    h.pending.length = 0;
    await act(() => hook.result.current.quickLoad());
    expect(hook.onLoad).toHaveBeenCalledOnce();
    expect(hook.onLoad.mock.calls[0]?.[0]).toMatchObject({
      pendingCommands: [command],
      meta: { playtimeSeconds: 42 },
    });
    expect(hook.result.current.mode).toBeNull();
    expect(hook.result.current.busy).toBe(false);
  });

  it('ignores a late load after a replacement session resets the UI', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    const gate = deferred<LoadOutcome>();
    vi.spyOn(h.controller.store, 'loadFromSlot').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickLoad();
    });
    expect(hook.result.current.busy).toBe(true);
    act(() => {
      h.replaceSession();
      hook.result.current.resetUi();
    });
    await act(async () => {
      gate.resolve({ ok: true, save: saved(), migratedFrom: null });
      await task;
    });
    expect(hook.onLoad).not.toHaveBeenCalled();
    expect(hook.result.current.busy).toBe(false);
  });

  it('ignores a late import after reset and permits a new operation', async () => {
    const hook = await ready();
    const gate = deferred<string>();
    const file = { size: 1, text: () => gate.promise } as File;
    let task: void | Promise<void>;
    act(() => {
      task = hook.result.current.panelProps('main', true).onImport(file);
    });
    act(() => hook.result.current.resetUi());
    await act(async () => {
      gate.resolve(JSON.stringify(saved()));
      await task;
    });
    expect(hook.result.current.panelProps('main', false).importPreview).toBeNull();
    await act(() => hook.result.current.quickLoad());
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.notice?.text).toBe('沒有快速存檔');
  });

  it('does not invoke load callbacks after unmount', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    const gate = deferred<LoadOutcome>();
    vi.spyOn(h.controller.store, 'loadFromSlot').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickLoad();
    });
    hook.unmount();
    await act(async () => {
      gate.resolve({ ok: true, save: saved(), migratedFrom: null });
      await task;
    });
    expect(hook.onLoad).not.toHaveBeenCalled();
  });

  it('invalidates operations when the controller dependency changes', async () => {
    const first = harness();
    const second = harness();
    const onLoad = vi.fn();
    const hook = renderHook(({ controller }) => useSaveLoad(controller, onLoad), {
      initialProps: { controller: first.controller },
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    const gate = deferred<LoadOutcome>();
    vi.spyOn(first.controller.store, 'loadFromSlot').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickLoad();
    });
    hook.rerender({ controller: second.controller });
    await act(async () => {
      gate.resolve({ ok: true, save: saved(), migratedFrom: null });
      await task;
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('does not publish stale fallback references from the previous controller refresh', async () => {
    const first = harness();
    const second = harness();
    const onLoad = vi.fn();
    const hook = renderHook(({ controller }) => useSaveLoad(controller, onLoad), {
      initialProps: { controller: first.controller },
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    const views = await first.controller.store.listSlots();
    const gate = deferred<SaveSlotView[]>();
    vi.spyOn(first.controller.store, 'listSlots').mockReturnValueOnce(gate.promise);
    act(() => hook.result.current.open('load'));
    hook.rerender({ controller: second.controller });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(saved()));
    await act(async () => {
      gate.resolve(views);
      await gate.promise;
    });
    await act(() => hook.result.current.quickLoad());
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('does not refresh replacement UI from a stale asynchronous save result', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    const gate = deferred<SaveSlotView[]>();
    vi.spyOn(h.controller.store, 'listSlots').mockReturnValueOnce(gate.promise);
    let task!: Promise<void>;
    act(() => {
      task = hook.result.current.quickSave();
    });
    await waitFor(() => expect(h.controller.store.listSlots).toHaveBeenCalledTimes(1));
    act(() => hook.result.current.resetUi());
    await act(async () => {
      gate.resolve([
        {
          slotId: 'manual:1',
          status: 'ok',
          meta: saved().meta,
          timestamp: 123,
          needsMigration: false,
        },
      ]);
      await task;
    });
    expect(hook.result.current.hasSave).toBe(false);
    expect(
      hook.result.current.panelProps('main', false).slots.every((slot) => slot.status === 'empty'),
    ).toBe(true);
  });

  it('previews imported queues, rejects nonmanual import destinations, and explicitly loads once', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    await act(() =>
      hook.result.current
        .panelProps('title', false)
        .onImport({ size: 1, text: () => Promise.resolve(JSON.stringify(saved())) } as File),
    );
    expect(hook.onLoad).not.toHaveBeenCalled();
    expect(hook.result.current.panelProps('title', false).importPreview).not.toBeNull();
    await act(() => hook.result.current.panelProps('title', false).onImportStore('quick:1'));
    expect(await h.controller.store.loadFromSlot('quick:1')).toMatchObject({
      ok: false,
      error: 'empty-slot',
    });
    await act(() => hook.result.current.panelProps('title', false).onImportStore('manual:1'));
    expect(await h.controller.store.loadFromSlot('manual:1')).toMatchObject({
      ok: true,
      save: { pendingCommands: [command] },
    });
    await act(() => hook.result.current.panelProps('title', false).onImportLoad());
    expect(hook.onLoad).toHaveBeenCalledOnce();
    expect(hook.result.current.panelProps('title', false).importPreview).toBeNull();
  });

  it('reports delete/export errors without silently invoking a load', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    vi.spyOn(h.controller.store, 'deleteSlot').mockResolvedValueOnce({
      ok: false,
      error: 'write-failed',
    });
    await act(() => hook.result.current.panelProps('title', false).onDelete('manual:1'));
    expect(hook.result.current.error).not.toBeNull();
    await act(() =>
      hook.result.current.panelProps('title', false).onExport('manual:1', { raw: true }),
    );
    expect(hook.result.current.error).not.toBeNull();
    expect(hook.onLoad).not.toHaveBeenCalled();
  });

  it('handles failed downloads and revokes temporary URLs', async () => {
    const h = harness();
    await h.controller.store.saveToSlot('manual:1', saved());
    const hook = await ready(h.controller);
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    await act(() =>
      hook.result.current.panelProps('title', false).onExport('manual:1', { raw: false }),
    );
    expect(hook.result.current.error).not.toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('initializes with blocked legacy storage and keeps manual imports available', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const hook = await ready();
    expect(hook.result.current.hasSave).toBe(false);
    await act(() =>
      hook.result.current
        .panelProps('title', false)
        .onImport({ size: 1, text: () => Promise.resolve(JSON.stringify(saved())) } as File),
    );
    expect(hook.result.current.panelProps('title', false).importPreview).not.toBeNull();
  });

  it('reports blocked indexed writes without clearing pending progress', async () => {
    const h = harness();
    const hook = await ready(h.controller);
    h.pending.push(command);
    vi.spyOn(h.adapter, 'setMany').mockRejectedValue(
      new DOMException('quota', 'QuotaExceededError'),
    );
    await act(() => hook.result.current.quickSave());
    expect(hook.result.current.error).not.toBeNull();
    expect(hook.result.current.hasSave).toBe(false);
    expect(h.progress.isDirty()).toBe(true);
    expect(h.pending).toEqual([command]);
  });

  it('continues the newest valid slot and preserves its queued commands', async () => {
    const h = harness();
    await h.controller.store.saveToSlot('manual:1', saved());
    await h.controller.store.saveToSlot('quick:1', { ...saved(), timestamp: 999 });
    const hook = await ready(h.controller);
    await act(() => hook.result.current.continueLatest());
    expect(hook.onLoad).toHaveBeenCalledOnce();
    expect(hook.onLoad.mock.calls[0]?.[0]).toMatchObject({
      timestamp: 999,
      pendingCommands: [command],
    });
  });

  it('does not refresh legacy bootstrap after unmount while its atomic import is pending', async () => {
    const h = harness();
    localStorage.setItem('tf.save.auto:1.blob', JSON.stringify(saved()));
    const gate = deferred<{ ok: true; imported: boolean }>();
    vi.spyOn(h.controller.store, 'importLegacySlotIfEmpty').mockReturnValueOnce(gate.promise);
    const reads = vi.spyOn(h.controller.store, 'listSlots');
    const hook = renderHook(() => useSaveLoad(h.controller, vi.fn()));
    hook.unmount();
    await act(async () => {
      gate.resolve({ ok: true, imported: true });
      await gate.promise;
    });
    expect(reads).not.toHaveBeenCalled();
  });

  it('migrates legacy data only into empty slots, never overwriting newer indexed saves', async () => {
    const h = harness();
    const legacy = saved();
    const newer = { ...saved(), timestamp: 999 };
    localStorage.setItem('tf.save.auto:1.blob', JSON.stringify(legacy));
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(legacy));
    await h.controller.store.saveToSlot('quick:1', newer);
    const hook = await ready(h.controller);
    expect(hook.result.current.hasSave).toBe(true);
    expect(await h.controller.store.loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { timestamp: 123, pendingCommands: [command] },
    });
    expect(await h.controller.store.loadFromSlot('quick:1')).toMatchObject({
      ok: true,
      save: { timestamp: 999 },
    });
    expect(localStorage.getItem('tf.save.auto:1.blob')).not.toBeNull();
  });

  it('keeps a valid legacy save reachable when its atomic indexed copy fails', async () => {
    const h = harness();
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(saved()));
    vi.spyOn(h.adapter, 'setMany').mockRejectedValue(
      new DOMException('quota', 'QuotaExceededError'),
    );
    const hook = await ready(h.controller);
    expect(hook.result.current.hasSave).toBe(true);
    expect(
      hook.result.current.panelProps('title', false).slots.find((slot) => slot.slotId === 'quick:1')
        ?.status,
    ).toBe('ok');
    await act(() => hook.result.current.quickLoad());
    expect(hook.onLoad).toHaveBeenCalledOnce();
    expect(hook.onLoad.mock.calls[0]?.[0]).toMatchObject({ pendingCommands: [command] });
    expect(localStorage.getItem('tf.save.quick:1.blob')).not.toBeNull();
  });

  it('reports failed fallback deletion rather than falsely removing the only reachable save', async () => {
    const h = harness();
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(saved()));
    vi.spyOn(h.adapter, 'setMany').mockRejectedValue(
      new DOMException('quota', 'QuotaExceededError'),
    );
    const hook = await ready(h.controller);
    await act(() => hook.result.current.panelProps('title', false).onDelete('quick:1'));
    expect(hook.result.current.error).not.toBeNull();
    expect(hook.result.current.hasSave).toBe(true);
    await act(() => hook.result.current.quickLoad());
    expect(hook.onLoad).toHaveBeenCalledOnce();
  });

  it('can delete a fallback once atomic marker storage recovers, without resurrection', async () => {
    const h = harness();
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(saved()));
    const blocked = vi.spyOn(h.adapter, 'setMany').mockRejectedValue(new Error('blocked'));
    const first = await ready(h.controller);
    expect(first.result.current.hasSave).toBe(true);
    blocked.mockRestore();
    await act(() => first.result.current.panelProps('title', false).onDelete('quick:1'));
    expect(first.result.current.error).toBeNull();
    expect(first.result.current.hasSave).toBe(false);
    first.unmount();
    const second = await ready(h.controller);
    expect(second.result.current.hasSave).toBe(false);
  });

  it('does not resurrect an explicitly deleted migrated slot from retained legacy backup', async () => {
    const h = harness();
    localStorage.setItem('tf.save.quick:1.blob', JSON.stringify(saved()));
    const first = await ready(h.controller);
    expect(first.result.current.hasSave).toBe(true);
    await act(() => first.result.current.panelProps('title', false).onDelete('quick:1'));
    expect(first.result.current.hasSave).toBe(false);
    first.unmount();
    const second = await ready(h.controller);
    expect(second.result.current.hasSave).toBe(false);
    await act(() => second.result.current.quickLoad());
    expect(second.onLoad).not.toHaveBeenCalled();
    expect(second.result.current.error).toBeNull();
    expect(second.result.current.notice?.text).toBe('沒有快速存檔');
    expect(localStorage.getItem('tf.save.quick:1.blob')).not.toBeNull();
  });
});
