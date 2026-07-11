// src/app/errors.ts 測試（規格：plan/01-architecture.md §3.10.2；M1-18／01-A9）。
// 放在 tests/ 而非 src/app/ 同層：vitest.workspace.ts 的 'core' project include 涵蓋
// `tests/**/*.spec.ts`，但兩個 project 皆未涵蓋 `src/app/**`（17-testing.md §3.2：
// 「UI 與 src/app 不設覆蓋率門檻」——app 層測試慣例上收在 tests/ 下）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreError } from '../../src/core/errors';
import {
  captureFatalError,
  exportSnapshotToFile,
  getStateSnapshotJson,
  recordStateSnapshot,
  resetStateSnapshotForTests,
  toFatalErrorInfo,
} from '../../src/app/errors';
import { makeLoopTestState } from '../helpers/loopState';

describe('toFatalErrorInfo', () => {
  it('保留 CoreError 的 code／message／stack', () => {
    const err = new CoreError('DATA_INTEGRITY', '找不到城 castle.x', { castleId: 'castle.x' });
    const info = toFatalErrorInfo(err);
    expect(info.code).toBe('DATA_INTEGRITY');
    expect(info.message).toBe('找不到城 castle.x');
    expect(info.stack.length).toBeGreaterThan(0);
  });

  it('一般 Error 正規化為 UNKNOWN_ERROR_CODE', () => {
    const info = toFatalErrorInfo(new Error('boom'));
    expect(info.code).toBe('UNKNOWN_ERROR_CODE');
    expect(info.message).toBe('boom');
  });

  it('非 Error 擲出值（如字面字串）正規化為 UNKNOWN_ERROR_CODE，stack 為空字串', () => {
    const info = toFatalErrorInfo('literal string thrown');
    expect(info.code).toBe('UNKNOWN_ERROR_CODE');
    expect(info.message).toBe('literal string thrown');
    expect(info.stack).toBe('');
  });

  it("CoreError 缺 stack 時仍回傳字串（防禦性 ?? ''）", () => {
    const err = new CoreError('SAVE_VERSION', 'v99 無法遷移');
    delete err.stack;
    const info = toFatalErrorInfo(err);
    expect(info.stack).toBe('');
  });
});

describe('captureFatalError', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('dev 模式下原樣 console.error 該例外，並回傳正規化結果', () => {
    const err = new CoreError('INVARIANT_VIOLATION', 'INV-04 違反');
    const info = captureFatalError(err);
    expect(info).toEqual({
      code: 'INVARIANT_VIOLATION',
      message: 'INV-04 違反',
      stack: info.stack,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('[fatal]', err);
  });
});

describe('狀態封存：recordStateSnapshot／getStateSnapshotJson', () => {
  beforeEach(() => {
    resetStateSnapshotForTests();
  });

  it('尚未記錄過快照時回傳 null', () => {
    expect(getStateSnapshotJson()).toBeNull();
  });

  it('recordStateSnapshot 後可讀回 canonical JSON，內容可還原原始欄位', () => {
    const state = makeLoopTestState({ gold: 1234, day: 30 });
    recordStateSnapshot(state);
    const json = getStateSnapshotJson();
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json as string) as { clans: Record<string, { gold: number }> };
    expect(parsed.clans['clan.test']?.gold).toBe(1234);
  });

  it('重複呼叫 recordStateSnapshot 以最後一次為準', () => {
    recordStateSnapshot(makeLoopTestState({ gold: 1 }));
    recordStateSnapshot(makeLoopTestState({ gold: 2 }));
    const parsed = JSON.parse(getStateSnapshotJson() as string) as {
      clans: Record<string, { gold: number }>;
    };
    expect(parsed.clans['clan.test']?.gold).toBe(2);
  });
});

/**
 * `URL.createObjectURL`／`revokeObjectURL` 於部分測試環境（jsdom）並非既有屬性，`vi.spyOn`
 * 要求目標屬性已存在而無法使用；改以直接賦值＋還原（無則刪除，原有則還原）。
 */
function stubObjectUrl(createReturn: string): {
  createObjectURLSpy: ReturnType<typeof vi.fn>;
  revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  restore: () => void;
} {
  const target = URL as unknown as Record<string, unknown>;
  const hadCreate = Object.hasOwn(target, 'createObjectURL');
  const hadRevoke = Object.hasOwn(target, 'revokeObjectURL');
  const originalCreate = target.createObjectURL;
  const originalRevoke = target.revokeObjectURL;

  const createObjectURLSpy = vi.fn(() => createReturn);
  const revokeObjectURLSpy = vi.fn();
  target.createObjectURL = createObjectURLSpy;
  target.revokeObjectURL = revokeObjectURLSpy;

  return {
    createObjectURLSpy,
    revokeObjectURLSpy,
    restore: () => {
      if (hadCreate) target.createObjectURL = originalCreate;
      else delete target.createObjectURL;
      if (hadRevoke) target.revokeObjectURL = originalRevoke;
      else delete target.revokeObjectURL;
    },
  };
}

describe('exportSnapshotToFile', () => {
  beforeEach(() => {
    resetStateSnapshotForTests();
  });

  it('尚無快照時回傳 false，且不觸碰 document', () => {
    const createElementSpy = vi.fn();
    vi.stubGlobal('document', { createElement: createElementSpy, body: {} });
    expect(exportSnapshotToFile()).toBe(false);
    expect(createElementSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('有快照時建立 Blob 物件網址、觸發下載並清理資源，回傳 true', () => {
    const clickSpy = vi.fn();
    const anchor = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
    const createElementSpy = vi.fn(() => anchor);
    const appendChildSpy = vi.fn();
    const removeChildSpy = vi.fn();
    vi.stubGlobal('document', {
      createElement: createElementSpy,
      body: { appendChild: appendChildSpy, removeChild: removeChildSpy },
    });
    const { createObjectURLSpy, revokeObjectURLSpy, restore } = stubObjectUrl('blob:mock-url');

    recordStateSnapshot(makeLoopTestState());
    const ok = exportSnapshotToFile('custom-name.json');

    expect(ok).toBe(true);
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(anchor.download).toBe('custom-name.json');
    expect(anchor.href).toBe('blob:mock-url');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendChildSpy).toHaveBeenCalledWith(anchor);
    expect(removeChildSpy).toHaveBeenCalledWith(anchor);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');

    restore();
    vi.unstubAllGlobals();
  });

  it('未指定檔名時使用預設含時間戳記的檔名', () => {
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    const { restore } = stubObjectUrl('blob:mock-url');

    recordStateSnapshot(makeLoopTestState());
    exportSnapshotToFile();

    expect(anchor.download).toMatch(/^tenka-fubu-crash-\d+\.json$/);

    restore();
    vi.unstubAllGlobals();
  });
});
