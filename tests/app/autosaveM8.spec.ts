import { describe, expect, it, vi } from 'vitest';
import { createAutosaveController } from '../../src/app/persistence/autosave';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore } from '../../src/app/persistence/saveStore';
import { buildSaveFile } from '../../src/core/save/serialize';
import { buildTinyState } from '../fixtures/tiny';

describe('M8 季首自動存檔控制器', () => {
  it('提交中換局仍原子推進舊快照游標，新局從下一槽開始且不通知掛起', async () => {
    const memory = createMemorySaveStorage();
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const adapter = {
      ...memory,
      async setMany(entries: [string, unknown][]) {
        if (entries[0]?.[0] === 'tf.save.auto:1.blob') {
          entered();
          await barrier;
        }
        await memory.setMany(entries);
      },
    };
    const notify = vi.fn();
    const controller = createAutosaveController(adapter, notify);
    const saving = controller.saveSeasonSnapshot(buildSaveFile(buildTinyState(), 100));
    await reached;
    controller.resetSession();
    release();
    expect(await saving).toEqual({ ok: false, error: 'session-changed' });
    expect(await memory.get('tf.save.autosaveCursor')).toBe(1);
    expect(await createSaveStore(adapter).loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { timestamp: 100 },
    });
    expect(await controller.saveSeasonSnapshot(buildSaveFile(buildTinyState(), 200))).toEqual({
      ok: true,
      slotId: 'auto:2',
    });
    expect(notify).not.toHaveBeenCalled();
    expect(controller.isSuspended()).toBe(false);
  });

  it('游標提交失敗不留下部分 blob 或摘要，且掛起通知一次', async () => {
    const memory = createMemorySaveStorage();
    const notify = vi.fn();
    const controller = createAutosaveController(
      {
        ...memory,
        setMany(entries) {
          if (entries.some(([key]) => key === 'tf.save.autosaveCursor'))
            return Promise.reject(new Error('cursor transaction failure'));
          return memory.setMany(entries);
        },
      },
      notify,
    );
    expect(await controller.saveSeasonSnapshot(buildSaveFile(buildTinyState(), 100))).toEqual({
      ok: false,
      error: 'write-failed',
    });
    expect(await memory.keys()).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(controller.isSuspended()).toBe(true);
  });
  it('四季輪替為 1、2、3、1，並行請求保留各自的 tick 快照', async () => {
    const adapter = createMemorySaveStorage();
    const controller = createAutosaveController(adapter);
    const snapshots = [100, 200, 300, 400].map((timestamp) =>
      buildSaveFile(buildTinyState(), timestamp),
    );
    const outcomes = await Promise.all(
      snapshots.map((save) => controller.saveSeasonSnapshot(save)),
    );
    expect(outcomes.map((outcome) => (outcome.ok ? outcome.slotId : null))).toEqual([
      'auto:1',
      'auto:2',
      'auto:3',
      'auto:1',
    ]);
    expect(await adapter.get('tf.save.autosaveCursor')).toBe(4);
    const store = createSaveStore(adapter);
    expect(await store.loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { timestamp: 400 },
    });
    expect(await store.loadFromSlot('auto:2')).toMatchObject({
      ok: true,
      save: { timestamp: 200 },
    });
    expect(await store.loadFromSlot('auto:3')).toMatchObject({
      ok: true,
      save: { timestamp: 300 },
    });
  });
  it('配額錯誤只刪最舊自動槽再重試，不刪手動槽', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    await store.saveToSlot('auto:1', buildSaveFile(buildTinyState(), 10));
    await store.saveToSlot('auto:2', buildSaveFile(buildTinyState(), 20));
    await store.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 1));
    await adapter.setMany([['tf.save.autosaveCursor', 2]]);
    let writes = 0;
    const onSuspended = vi.fn();
    const controller = createAutosaveController(
      {
        ...adapter,
        setMany(entries) {
          writes += 1;
          if (writes === 1) return Promise.reject(new DOMException('full', 'QuotaExceededError'));
          return adapter.setMany(entries);
        },
      },
      onSuspended,
    );
    expect(await controller.saveSeasonSnapshot(buildSaveFile(buildTinyState(), 30))).toEqual({
      ok: true,
      slotId: 'auto:3',
    });
    expect(await store.loadFromSlot('auto:1')).toMatchObject({ ok: false, error: 'empty-slot' });
    expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: true });
    expect(onSuspended).not.toHaveBeenCalled();
  });
  it('失敗後通知一次並掛起，手動存檔不受影響，新 session 可重新嘗試', async () => {
    const adapter = createMemorySaveStorage();
    const onSuspended = vi.fn();
    let blocked = true;
    const controller = createAutosaveController(
      {
        ...adapter,
        setMany(entries) {
          return blocked ? Promise.reject(new Error('blocked')) : adapter.setMany(entries);
        },
      },
      onSuspended,
    );
    const save = buildSaveFile(buildTinyState(), 100);
    expect(await controller.saveSeasonSnapshot(save)).toEqual({ ok: false, error: 'write-failed' });
    expect(await controller.saveSeasonSnapshot(save)).toEqual({ ok: false, error: 'suspended' });
    expect(onSuspended).toHaveBeenCalledTimes(1);
    expect(await createSaveStore(adapter).saveToSlot('manual:1', save)).toEqual({ ok: true });
    blocked = false;
    controller.resetSession();
    expect(await controller.saveSeasonSnapshot(save)).toEqual({ ok: true, slotId: 'auto:1' });
  });
  it('切換 session 不會由舊 I/O 發出新 session 的掛起通知', async () => {
    const adapter = createMemorySaveStorage();
    const onSuspended = vi.fn();
    const controller = createAutosaveController(
      {
        ...adapter,
        get(key) {
          controller.resetSession();
          return adapter.get(key);
        },
        setMany() {
          return Promise.reject(new Error('old I/O'));
        },
      },
      onSuspended,
    );
    expect(await controller.saveSeasonSnapshot(buildSaveFile(buildTinyState(), 100))).toEqual({
      ok: false,
      error: 'session-changed',
    });
    expect(onSuspended).not.toHaveBeenCalled();
    expect(controller.isSuspended()).toBe(false);
  });
});
