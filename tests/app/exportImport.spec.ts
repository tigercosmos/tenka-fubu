import { describe, expect, it, vi } from 'vitest';
import { buildExport, downloadSave, importSave } from '../../src/app/persistence/exportImport';
import { buildSaveFile } from '../../src/core/save/serialize';
import { buildTinyState } from '../fixtures/tiny';
import { SAVECFG } from '../../src/app/persistence/saveStore';

describe('M8 存檔匯出與匯入', () => {
  it('未壓縮匯出可往返，檔名包含大名、日期與時間戳', async () => {
    const save = buildSaveFile(buildTinyState(), 123);
    const exported = buildExport(save);
    expect(exported.name).toMatch(/^tenkafubu_alpha_1560-\d{2}-\d{2}_123\.tenkafubu\.json$/u);
    expect(JSON.parse(exported.json)).toEqual(save);
    expect(
      await importSave({ size: exported.json.length, text: () => Promise.resolve(exported.json) }),
    ).toEqual({ ok: true, save, migratedFrom: null });
  });
  it('超大檔在讀取前拒絕；垃圾、較新版本與讀取例外不擲出', async () => {
    const text = vi.fn();
    expect(await importSave({ size: SAVECFG.importFileMaxBytes + 1, text })).toEqual({
      ok: false,
      error: 'file-too-large',
    });
    expect(text).not.toHaveBeenCalled();
    expect(await importSave({ size: 1, text: () => Promise.resolve('{') })).toEqual({
      ok: false,
      error: 'invalid-file',
    });
    const newer = buildSaveFile(buildTinyState(), 123);
    newer.version += 1;
    const invalidMeta = { ...buildSaveFile(buildTinyState(), 123), meta: {} };
    expect(
      await importSave({ size: 1, text: () => Promise.resolve(JSON.stringify(invalidMeta)) }),
    ).toEqual({ ok: false, error: 'invalid-file' });
    expect(
      await importSave({ size: 1, text: () => Promise.resolve(JSON.stringify(newer)) }),
    ).toEqual({
      ok: false,
      error: 'newer-version',
    });
    expect(
      await importSave({
        size: 1,
        text: () => Promise.reject(new Error('read')),
      }),
    ).toEqual({ ok: false, error: 'invalid-file' });
  });
  it('下載失敗仍清除 anchor 與 object URL，不開新視窗', () => {
    const create = vi.fn(() => 'blob:save');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked');
    });
    try {
      expect(() => downloadSave(buildSaveFile(buildTinyState(), 123))).toThrow('download blocked');
      expect(revoke).toHaveBeenCalledWith('blob:save');
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('匯入拒絕錯誤或偽造權限的佇列，保留格式合法但已失效的指令', async () => {
    const save = buildSaveFile(buildTinyState(), 123);
    const decodeQueue = (pendingCommands: unknown[]) =>
      importSave({
        size: 1,
        text: () => Promise.resolve(JSON.stringify({ ...save, pendingCommands })),
      });
    expect(await decodeQueue([{ type: 'march', clanId: save.state.meta.playerClanId }])).toEqual({
      ok: false,
      error: 'corrupt',
    });
    const stale = {
      type: 'recallArmy',
      clanId: save.state.meta.playerClanId,
      armyId: 'army.999999',
    };
    expect(await decodeQueue([{ ...stale, authority: { kind: 'clan' } }])).toEqual({
      ok: false,
      error: 'corrupt',
    });
    expect(await decodeQueue([{ ...stale, clanId: 'clan.other' }])).toEqual({
      ok: false,
      error: 'corrupt',
    });
    expect(await decodeQueue([stale])).toMatchObject({
      ok: true,
      save: { pendingCommands: [stale] },
    });
  });
});
