import { describe, expect, it } from 'vitest';
import { buildSaveFile } from '../../src/core/save/serialize';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';
import type { PolicyId } from '../../src/core/state/ids';
import LZString from 'lz-string';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore, SAVE_SLOTS } from '../../src/app/persistence/saveStore';

describe('M8 壓縮存檔槽', () => {
  it('legacy 先排隊時新存檔仍依序提交，匯入四項同一批次', async () => {
    const memory = createMemorySaveStorage();
    const batches: string[][] = [];
    const adapter = {
      ...memory,
      async setMany(entries: [string, unknown][]) {
        batches.push(entries.map(([key]) => key));
        await memory.setMany(entries);
      },
    };
    const a = createSaveStore(adapter);
    const b = createSaveStore(adapter);
    const importing = a.importLegacySlotIfEmpty(
      'auto:1',
      buildSaveFile(buildTinyState(), 100),
      'old',
    );
    const writing = b.saveToSlot('auto:1', buildSaveFile(buildTinyState(), 200));
    expect(await importing).toEqual({ ok: true, imported: true });
    expect(await writing).toEqual({ ok: true });
    expect(batches[0]).toEqual([
      'tf.save.auto:1.legacy.backup',
      'tf.save.auto:1.legacy.handled',
      'tf.save.auto:1.blob',
      'tf.save.auto:1.meta',
    ]);
    expect(await b.loadFromSlot('auto:1')).toMatchObject({ ok: true, save: { timestamp: 200 } });
    expect(await memory.get('tf.save.auto:1.legacy.backup')).toBe('old');
  });
  it('legacy 匯入與另一 store 新寫入共用槽鎖，不覆蓋較新的 blob', async () => {
    const memory = createMemorySaveStorage();
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let block = true;
    const adapter = {
      ...memory,
      async setMany(entries: [string, unknown][]) {
        if (block) {
          block = false;
          entered();
          await barrier;
        }
        await memory.setMany(entries);
      },
    };
    const a = createSaveStore(adapter);
    const b = createSaveStore(adapter);
    const writing = a.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200));
    await reached;
    const importing = b.importLegacySlotIfEmpty(
      'quick:1',
      buildSaveFile(buildTinyState(), 100),
      'legacy raw',
    );
    release();
    expect(await writing).toEqual({ ok: true });
    expect(await importing).toEqual({ ok: true, imported: false });
    expect(await b.loadFromSlot('quick:1')).toMatchObject({ ok: true, save: { timestamp: 200 } });
    expect(await a.isLegacySlotHandled('quick:1')).toBe(true);
    expect(await memory.get('tf.save.quick:1.legacy.backup')).toBe('legacy raw');
  });

  it('空槽匯入快照原子保存且刪除後不會重新復活 legacy', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    const save = buildSaveFile(buildTinyState(), 100);
    const importing = store.importLegacySlotIfEmpty('auto:1', save, 'original legacy');
    save.timestamp = 200;
    expect(await importing).toEqual({ ok: true, imported: true });
    expect(await store.loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { timestamp: 100 },
    });
    await store.deleteSlot('auto:1');
    const fresh = createSaveStore(adapter);
    expect(await fresh.isLegacySlotHandled('auto:1')).toBe(true);
    expect(await fresh.importLegacySlotIfEmpty('auto:1', save, 'different backup')).toEqual({
      ok: true,
      imported: false,
    });
    expect(await fresh.loadFromSlot('auto:1')).toEqual({ ok: false, error: 'empty-slot' });
    expect(await adapter.get('tf.save.auto:1.legacy.backup')).toBe('original legacy');
  });

  it('損壞的新槽也不被 legacy 覆寫或解除損壞標記', async () => {
    const adapter = createMemorySaveStorage();
    await adapter.setMany([['tf.save.quick:1.blob', 'broken']]);
    const store = createSaveStore(adapter);
    await store.loadFromSlot('quick:1');
    expect(
      await store.importLegacySlotIfEmpty(
        'quick:1',
        buildSaveFile(buildTinyState(), 100),
        'backup',
      ),
    ).toEqual({ ok: true, imported: false });
    expect(await adapter.get('tf.save.quick:1.blob')).toBe('broken');
    expect((await store.listSlots()).at(-1)?.status).toBe('corrupt');
  });

  it('legacy 配額失敗沒有部分標記或 blob，保留重試與 fallback 可達性', async () => {
    const memory = createMemorySaveStorage();
    let fail = true;
    const adapter = {
      ...memory,
      async setMany(entries: [string, unknown][]) {
        if (fail) throw new DOMException('full', 'QuotaExceededError');
        await memory.setMany(entries);
      },
    };
    const store = createSaveStore(adapter);
    const save = buildSaveFile(buildTinyState(), 100);
    expect(await store.importLegacySlotIfEmpty('quick:1', save, 'raw')).toEqual({
      ok: false,
      error: 'quota-exceeded',
    });
    expect(await store.isLegacySlotHandled('quick:1')).toBe(false);
    expect(await memory.keys()).toEqual([]);
    fail = false;
    expect(await store.importLegacySlotIfEmpty('quick:1', save, 'raw')).toEqual({
      ok: true,
      imported: true,
    });
  });

  it('legacy seam 僅允許 auto:1 與 quick:1', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    for (const slot of ['manual:1', 'auto:2', 'auto:3'] as const) {
      expect(
        await store.importLegacySlotIfEmpty(slot, buildSaveFile(buildTinyState(), 100), 'raw'),
      ).toEqual({ ok: false, error: 'write-failed' });
      expect(await store.isLegacySlotHandled(slot)).toBe(false);
    }
    expect(await adapter.keys()).toEqual([]);
  });
  it('相同 adapter 的不同 store 共用摘要重建與寫入協調', async () => {
    const memory = createMemorySaveStorage();
    let rebuilding = false;
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
        if (rebuilding && entries.length === 1 && entries[0]?.[0] === 'tf.save.quick:1.meta') {
          entered();
          await barrier;
        }
        await memory.setMany(entries);
      },
    };
    const a = createSaveStore(adapter);
    const b = createSaveStore(adapter);
    await a.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 100));
    await memory.delMany(['tf.save.quick:1.meta']);
    rebuilding = true;
    const listing = a.listSlots();
    await reached;
    const saving = b.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200));
    release();
    await Promise.all([listing, saving]);
    expect((await a.listSlots()).at(-1)?.timestamp).toBe(200);
    expect(await b.loadFromSlot('quick:1')).toMatchObject({ ok: true, save: { timestamp: 200 } });
  });

  it('不同 store 寫入修復後解除共用損壞標記', async () => {
    const adapter = createMemorySaveStorage();
    const a = createSaveStore(adapter);
    const b = createSaveStore(adapter);
    await adapter.setMany([['tf.save.quick:1.blob', 'broken']]);
    expect(await a.loadFromSlot('quick:1')).toMatchObject({ ok: false, error: 'corrupt' });
    expect((await b.listSlots()).at(-1)?.status).toBe('corrupt');
    await b.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200));
    expect((await a.listSlots()).at(-1)?.status).toBe('ok');
  });

  it('自動提交 seam 拒絕非自動槽、不匹配游標與不安全數值', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    const save = buildSaveFile(buildTinyState(), 100);
    for (const [slot, cursor] of [
      ['manual:1', 1],
      ['auto:2', 1],
      ['auto:1', 0],
      ['auto:1', Infinity],
      ['auto:1', 1.5],
    ] as const)
      expect(await store.saveAutosaveToSlot(slot, save, cursor)).toEqual({
        ok: false,
        error: 'write-failed',
      });
    expect(await adapter.keys()).toEqual([]);
  });
  it('摘要重建保留原始版本，讀取遷移不改寫 blob', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    const save = buildSaveFile(buildTinyState(), 100);
    save.version = 2;
    const blob = LZString.compressToUTF16(JSON.stringify(save));
    await adapter.setMany([['tf.save.quick:1.blob', blob]]);
    expect((await store.listSlots()).at(-1)).toMatchObject({ status: 'ok', needsMigration: true });
    expect(await adapter.get('tf.save.quick:1.blob')).toBe(blob);
    expect((await store.listSlots()).at(-1)?.needsMigration).toBe(true);
  });

  it('損壞的 blob 摘要不可重建為正常槽位', async () => {
    const adapter = createMemorySaveStorage();
    const save = buildSaveFile(buildTinyState(), 100);
    const raw = JSON.stringify({ ...save, meta: {} });
    await adapter.setMany([['tf.save.quick:1.blob', LZString.compressToUTF16(raw)]]);
    const store = createSaveStore(adapter);
    expect(await store.loadFromSlot('quick:1')).toEqual({ ok: false, error: 'corrupt' });
    expect((await store.listSlots()).at(-1)?.status).toBe('corrupt');
  });

  it('重建摘要與新存檔並行時，較新的快照與摘要一致', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    await store.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 100));
    await adapter.delMany(['tf.save.quick:1.meta']);
    const rebuilding = store.listSlots();
    const saving = store.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200));
    await Promise.all([rebuilding, saving]);
    expect((await store.listSlots()).at(-1)?.timestamp).toBe(200);
    expect(await store.loadFromSlot('quick:1')).toMatchObject({
      ok: true,
      save: { timestamp: 200 },
    });
  });
  it('14 槽逐一往返完整信封、刪除只影響目標槽', async () => {
    const store = createSaveStore(createMemorySaveStorage());
    const save = buildSaveFile(buildTinyState(), 100, [
      { type: 'enactPolicy', clanId: CLAN_ALPHA, policyId: 'pol.rakuichi' as PolicyId },
    ]);
    expect(SAVE_SLOTS).toHaveLength(14);
    for (const slot of SAVE_SLOTS) {
      expect(await store.saveToSlot(slot, save)).toEqual({ ok: true });
      expect(await store.loadFromSlot(slot)).toEqual({ ok: true, save, migratedFrom: null });
    }
    expect((await store.listSlots()).every((v) => v.status === 'ok')).toBe(true);
    expect(await store.deleteSlot('manual:1')).toEqual({ ok: true });
    expect(await store.loadFromSlot('manual:1')).toEqual({ ok: false, error: 'empty-slot' });
    expect((await store.listSlots()).filter((v) => v.status === 'ok')).toHaveLength(13);
  });

  it('摘要遺失可重建；正常列表讀取 14 槽的內容與摘要以識別版本', async () => {
    const adapter = createMemorySaveStorage();
    const reads: string[] = [];
    const store = createSaveStore({
      ...adapter,
      async get(key) {
        reads.push(key);
        return adapter.get(key);
      },
    });
    const save = buildSaveFile(buildTinyState(), 200);
    for (const slot of SAVE_SLOTS) await store.saveToSlot(slot, save);
    await store.listSlots();
    expect(reads).toHaveLength(28);
    expect(reads.filter((key) => key.endsWith('.meta'))).toHaveLength(14);
    expect(reads.filter((key) => key.endsWith('.blob'))).toHaveLength(14);
    await adapter.delMany(['tf.save.quick:1.meta']);
    expect((await store.listSlots()).at(-1)).toMatchObject({ status: 'ok', timestamp: 200 });
    expect(await adapter.get('tf.save.quick:1.meta')).toMatchObject({ timestamp: 200 });
  });

  it('損壞的最新存檔不阻止繼續載入較舊存檔，保留原始資料', async () => {
    const adapter = createMemorySaveStorage();
    const store = createSaveStore(adapter);
    await store.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 100));
    await store.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200));
    await adapter.setMany([['tf.save.quick:1.blob', 'broken']]);
    expect((await store.findLatestSave())?.slotId).toBe('manual:1');
    expect((await store.listSlots()).at(-1)?.status).toBe('corrupt');
    expect(await store.rawExport('quick:1')).toBeTruthy();
  });

  it('配額與 I/O 例外回傳結果，不擲例外也不污染既有槽', async () => {
    const adapter = createMemorySaveStorage();
    const original = buildSaveFile(buildTinyState(), 100);
    await createSaveStore(adapter).saveToSlot('quick:1', original);
    const store = createSaveStore({
      ...adapter,
      setMany() {
        return Promise.reject(new DOMException('full', 'QuotaExceededError'));
      },
    });
    expect(await store.saveToSlot('quick:1', buildSaveFile(buildTinyState(), 200))).toEqual({
      ok: false,
      error: 'quota-exceeded',
    });
    expect(await store.loadFromSlot('quick:1')).toMatchObject({ ok: true, save: original });
    const inaccessible = createSaveStore({
      ...adapter,
      get() {
        return Promise.reject(new Error('blocked'));
      },
    });
    expect((await inaccessible.listSlots()).every((v) => v.status === 'corrupt')).toBe(true);
  });

  it('寫入先捕捉快照，await 期間活狀態修改不影響存檔', async () => {
    const adapter = createMemorySaveStorage();
    const save = buildSaveFile(buildTinyState(), 100);
    const expected = structuredClone(save);
    const store = createSaveStore({
      ...adapter,
      async setMany(entries) {
        save.meta.clanName = '修改後';
        save.state.time.day += 1;
        await adapter.setMany(entries);
      },
    });
    expect(await store.saveToSlot('quick:1', save)).toEqual({ ok: true });
    expect(await store.loadFromSlot('quick:1')).toMatchObject({ ok: true, save: expected });
  });
});
