import LZString from 'lz-string';
import { decodeSave, validSaveMeta, type SaveFile, type SaveMeta } from '@core/save/serialize';
import { SAVE_FORMAT_VERSION } from '@core/save/migrate';
import { indexedDbSaveStorage, type SaveStorageAdapter } from './storage';

export const SAVECFG = {
  manualSaveSlots: 10,
  autoSaveSlots: 3,
  quickSaveSlots: 1,
  autoSaveIntervalMonths: 3,
  autoSaveRetryMax: 1,
  saveCompressedWarnBytes: 3_000_000,
  saveCompressedMaxBytes: 15_000_000,
  importFileMaxBytes: 50_000_000,
} as const;

export type SaveSlotId = `manual:${number}` | `auto:${number}` | 'quick:1';
export const SAVE_SLOTS: readonly SaveSlotId[] = [
  ...Array.from({ length: SAVECFG.manualSaveSlots }, (_, i) => `manual:${i + 1}` as SaveSlotId),
  ...Array.from({ length: SAVECFG.autoSaveSlots }, (_, i) => `auto:${i + 1}` as SaveSlotId),
  'quick:1',
];
export const AUTOSAVE_CURSOR_KEY = 'tf.save.autosaveCursor';
interface StoreCoordination {
  corrupt: Set<SaveSlotId>;
  operations: Map<SaveSlotId, Promise<unknown>>;
  versions: Map<SaveSlotId, SlotContent>;
}
export type SaveSlotVersion = string & { readonly __saveSlotVersion: unique symbol };
export interface SaveOperationGuard {
  readonly expectedVersion?: SaveSlotVersion;
  readonly isCurrent?: () => boolean;
}
export type SaveSlotGuard = SaveOperationGuard & { readonly expectedVersion: SaveSlotVersion };
const captureGuard = (guard?: SaveOperationGuard): SaveOperationGuard | undefined =>
  guard
    ? {
        ...(guard.expectedVersion === undefined ? {} : { expectedVersion: guard.expectedVersion }),
        ...(guard.isCurrent ? { isCurrent: guard.isCurrent } : {}),
      }
    : undefined;
interface SlotContent {
  blob: unknown;
  meta: unknown;
  version: SaveSlotVersion;
}
let nextVersion = 0;

// Exact bounded structured-clone comparison, not JSON normalization. Exotic values
// outside these storage forms are deliberately not eligible for conditional consent.
function sameStoredValue(a: unknown, b: unknown): boolean {
  const forward = new Map<object, object>();
  const reverse = new Map<object, object>();
  function same(left: unknown, right: unknown): boolean {
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
      return Object.is(left, right);
    if (forward.has(left)) return forward.get(left) === right;
    if (reverse.has(right)) return false;
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    forward.set(left, right);
    reverse.set(right, left);
    if (left instanceof Date && right instanceof Date)
      return Object.is(left.getTime(), right.getTime());
    if (left instanceof ArrayBuffer && right instanceof ArrayBuffer)
      return same(new Uint8Array(left), new Uint8Array(right));
    if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
      const x = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
      const y = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
      return x.length === y.length && x.every((value, index) => value === y[index]);
    }
    if (left instanceof Map && right instanceof Map)
      return same([...left.entries()], [...right.entries()]);
    if (left instanceof Set && right instanceof Set)
      return same([...left.values()], [...right.values()]);
    if (
      !Array.isArray(left) &&
      Object.getPrototypeOf(left) !== Object.prototype &&
      Object.getPrototypeOf(left) !== null
    )
      return false;
    const x = Reflect.ownKeys(left),
      y = Reflect.ownKeys(right);
    if (x.some((key) => typeof key !== 'string') || x.length !== y.length) return false;
    return x.every(
      (key) => Object.hasOwn(right, key) && same(Reflect.get(left, key), Reflect.get(right, key)),
    );
  }
  return same(a, b);
}
// Coordinates callers sharing an adapter in this JS realm, not other tabs or wrapper adapters.
const coordination = new WeakMap<SaveStorageAdapter, StoreCoordination>();
export type SaveErrorCode =
  | 'quota-exceeded'
  | 'too-large'
  | 'write-failed'
  | 'corrupt'
  | 'invalid-file'
  | 'file-too-large'
  | 'newer-version'
  | 'empty-slot'
  | 'slot-changed';
export type SaveOutcome = { ok: true } | { ok: false; error: SaveErrorCode };
export type LoadOutcome =
  { ok: true; save: SaveFile; migratedFrom: number | null } | { ok: false; error: SaveErrorCode };
export interface SaveSlotView {
  slotId: SaveSlotId;
  status: 'empty' | 'ok' | 'corrupt';
  meta: SaveMeta | null;
  timestamp: number | null;
  needsMigration: boolean;
  /** Opaque same-adapter content identity; absent only in legacy handcrafted views. */
  version?: SaveSlotVersion;
}
interface MetaCache {
  version: number;
  timestamp: number;
  meta: SaveMeta;
}
const blobKey = (slot: SaveSlotId): string => `tf.save.${slot}.blob`;
const metaKey = (slot: SaveSlotId): string => `tf.save.${slot}.meta`;
const legacyHandledKey = (slot: SaveSlotId): string => `tf.save.${slot}.legacy.handled`;
const legacyBackupKey = (slot: SaveSlotId): string => `tf.save.${slot}.legacy.backup`;
const validLegacySlot = (slot: SaveSlotId): boolean => slot === 'auto:1' || slot === 'quick:1';
function validCache(value: unknown): value is MetaCache {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<MetaCache>;
  const meta = v.meta;
  return (
    Number.isInteger(v.version) &&
    (v.version ?? 0) >= 1 &&
    typeof v.timestamp === 'number' &&
    Number.isFinite(v.timestamp) &&
    v.timestamp >= 0 &&
    validSaveMeta(meta)
  );
}
function cacheFor(save: SaveFile): MetaCache {
  return { version: save.version, timestamp: save.timestamp, meta: save.meta };
}

/** M8 儲存層；既有 MVP UI 在佇列還原接線前仍使用舊介面。 */
export function createSaveStore(adapter: SaveStorageAdapter = indexedDbSaveStorage) {
  let shared = coordination.get(adapter);
  if (!shared) {
    shared = { corrupt: new Set(), operations: new Map(), versions: new Map() };
    coordination.set(adapter, shared);
  }
  const { corrupt, operations, versions } = shared;
  async function content(slot: SaveSlotId): Promise<SlotContent> {
    const blob = await adapter.get(blobKey(slot));
    const meta = await adapter.get(metaKey(slot));
    const previous = versions.get(slot);
    if (previous && sameStoredValue(previous.blob, blob) && sameStoredValue(previous.meta, meta))
      return previous;
    const next: SlotContent = {
      blob: structuredClone(blob),
      meta: structuredClone(meta),
      version: `slot-content:${++nextVersion}` as SaveSlotVersion,
    };
    versions.set(slot, next);
    if (previous) corrupt.delete(slot);
    return next;
  }
  function current(guard?: SaveOperationGuard): boolean {
    try {
      return guard?.isCurrent?.() ?? true;
    } catch {
      return false;
    }
  }
  async function permitted(slot: SaveSlotId, guard?: SaveOperationGuard): Promise<boolean> {
    if (!guard) return true;
    const observed = guard.expectedVersion === undefined ? null : await content(slot);
    return (
      (guard.expectedVersion === undefined || observed?.version === guard.expectedVersion) &&
      current(guard)
    );
  }
  function serial<T>(slot: SaveSlotId, action: () => Promise<T>): Promise<T> {
    const previous = operations.get(slot) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    operations.set(slot, next);
    void next
      .finally(() => {
        if (operations.get(slot) === next) operations.delete(slot);
      })
      .catch(() => undefined);
    return next;
  }
  const validSlot = (slot: SaveSlotId): boolean => SAVE_SLOTS.includes(slot);
  async function saveToSlot(
    slot: SaveSlotId,
    save: SaveFile,
    nextCursor?: number,
    guard?: SaveOperationGuard,
  ): Promise<SaveOutcome> {
    if (!validSlot(slot)) return { ok: false, error: 'write-failed' };
    try {
      // 同步序列化先於第一個 await，呼叫端的快照不受後續 tick 影響。
      const blob = LZString.compressToUTF16(JSON.stringify(save));
      const cache = JSON.parse(JSON.stringify(cacheFor(save))) as MetaCache;
      if (!validCache(cache)) return { ok: false, error: 'write-failed' };
      const bytes = blob.length * 2;
      if (bytes > SAVECFG.saveCompressedMaxBytes) return { ok: false, error: 'too-large' };
      if (bytes > SAVECFG.saveCompressedWarnBytes) console.warn('壓縮存檔超過警告門檻', bytes);
      const entries: [string, unknown][] = [
        [blobKey(slot), blob],
        [metaKey(slot), cache],
      ];
      if (nextCursor !== undefined) entries.push([AUTOSAVE_CURSOR_KEY, nextCursor]);
      if (!(await permitted(slot, guard)) || !current(guard))
        return { ok: false, error: 'slot-changed' };
      await adapter.setMany(entries);
      corrupt.delete(slot);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'QuotaExceededError'
            ? 'quota-exceeded'
            : 'write-failed',
      };
    }
  }
  async function loadFromSlot(slot: SaveSlotId, guard?: SaveOperationGuard): Promise<LoadOutcome> {
    if (!validSlot(slot)) return { ok: false, error: 'empty-slot' };
    try {
      // Associate corruption with the bytes actually decoded, so a later fresh
      // list can distinguish a repaired slot from the same corrupt content.
      const observed = await content(slot);
      if (
        guard &&
        ((guard.expectedVersion !== undefined && observed?.version !== guard.expectedVersion) ||
          !current(guard))
      )
        return { ok: false, error: 'slot-changed' };
      const blob = observed.blob;
      if (blob === undefined) return { ok: false, error: 'empty-slot' };
      if (typeof blob !== 'string') throw new Error('invalid blob');
      const raw = LZString.decompressFromUTF16(blob);
      if (!raw) throw new Error('invalid compression');
      const decoded = decodeSave(raw);
      if (!decoded.ok) {
        corrupt.add(slot);
        return { ok: false, error: decoded.code === 'newerVersion' ? 'newer-version' : 'corrupt' };
      }
      const original = JSON.parse(raw) as { version: number };
      if (!validCache(cacheFor(decoded.saveFile))) throw new Error('invalid metadata');
      corrupt.delete(slot);
      return {
        ok: true,
        save: decoded.saveFile,
        migratedFrom: decoded.migrated ? original.version : null,
      };
    } catch {
      corrupt.add(slot);
      return { ok: false, error: 'corrupt' };
    }
  }
  async function listSlots(): Promise<SaveSlotView[]> {
    return Promise.all(
      SAVE_SLOTS.map((slotId) =>
        serial(slotId, async (): Promise<SaveSlotView> => {
          const empty: SaveSlotView = {
            slotId,
            status: 'empty',
            meta: null,
            timestamp: null,
            needsMigration: false,
            version: `slot-unreadable:${++nextVersion}` as SaveSlotVersion,
          };
          try {
            const observed = await content(slotId);
            empty.version = observed.version;
            if (corrupt.has(slotId)) return { ...empty, status: 'corrupt' };
            let cache = observed.meta;
            if (!validCache(cache)) {
              const loaded = await loadFromSlot(slotId);
              if (!loaded.ok)
                return { ...empty, status: loaded.error === 'empty-slot' ? 'empty' : 'corrupt' };
              cache = cacheFor(loaded.save);
              if (loaded.migratedFrom !== null) (cache as MetaCache).version = loaded.migratedFrom;
              // 摘要重建失敗不應使已驗證的存檔不可讀。
              try {
                await adapter.setMany([[metaKey(slotId), cache]]);
              } catch {
                /* 下次列表可再重建。 */
              }
              empty.version = (await content(slotId)).version;
            }
            const valid = cache as MetaCache;
            return {
              slotId,
              status: 'ok',
              meta: valid.meta,
              timestamp: valid.timestamp,
              needsMigration: valid.version < SAVE_FORMAT_VERSION,
              version: empty.version,
            };
          } catch {
            return { ...empty, status: 'corrupt' };
          }
        }),
      ),
    );
  }
  async function deleteSlot(slot: SaveSlotId, guard?: SaveOperationGuard): Promise<SaveOutcome> {
    if (!validSlot(slot)) return { ok: false, error: 'write-failed' };
    try {
      if (!(await permitted(slot, guard)) || !current(guard))
        return { ok: false, error: 'slot-changed' };
      await adapter.delMany([blobKey(slot), metaKey(slot)]);
      corrupt.delete(slot);
      return { ok: true };
    } catch {
      return { ok: false, error: 'write-failed' };
    }
  }
  async function findLatestSave(): Promise<SaveSlotView | null> {
    const candidates = (await listSlots())
      .filter((v) => v.status === 'ok')
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    for (const candidate of candidates) {
      if ((await serial(candidate.slotId, () => loadFromSlot(candidate.slotId))).ok)
        return candidate;
    }
    return null;
  }
  async function rawExport(slot: SaveSlotId): Promise<string | null> {
    if (!validSlot(slot)) return null;
    try {
      const blob = await adapter.get(blobKey(slot));
      if (typeof blob !== 'string') return blob === undefined ? null : JSON.stringify(blob);
      try {
        return LZString.decompressFromUTF16(blob) || blob;
      } catch {
        return blob;
      }
    } catch {
      return null;
    }
  }
  function snapshotWrite(
    slot: SaveSlotId,
    save: SaveFile,
    nextCursor?: number,
    guard?: SaveOperationGuard,
  ): Promise<SaveOutcome> {
    // 排隊前快照，避免等待前一個 I/O 時指令或狀態被改寫。
    try {
      const snapshot = JSON.parse(JSON.stringify(save)) as SaveFile;
      const expected = captureGuard(guard);
      return serial(slot, () => saveToSlot(slot, snapshot, nextCursor, expected));
    } catch {
      return Promise.resolve({ ok: false, error: 'write-failed' } as const);
    }
  }
  function importLegacySlotIfEmpty(
    slot: SaveSlotId,
    save: SaveFile,
    rawOriginal: string,
    guard?: SaveOperationGuard,
  ): Promise<SaveOutcome & { imported?: boolean; version?: SaveSlotVersion }> {
    const expected = captureGuard(guard);
    if (!validLegacySlot(slot) || typeof rawOriginal !== 'string')
      return Promise.resolve({ ok: false, error: 'write-failed' });
    try {
      // Prepare before queueing: caller mutation during another slot operation cannot alter import.
      if (new TextEncoder().encode(rawOriginal).byteLength > SAVECFG.importFileMaxBytes)
        return Promise.resolve({ ok: false, error: 'file-too-large' });
      const blob = LZString.compressToUTF16(JSON.stringify(save));
      const cache = JSON.parse(JSON.stringify(cacheFor(save))) as MetaCache;
      if (!validCache(cache)) return Promise.resolve({ ok: false, error: 'write-failed' });
      const bytes = blob.length * 2;
      if (bytes > SAVECFG.saveCompressedMaxBytes)
        return Promise.resolve({ ok: false, error: 'too-large' });
      if (bytes > SAVECFG.saveCompressedWarnBytes) console.warn('壓縮存檔超過警告門檻', bytes);
      return serial(slot, async () => {
        try {
          if ((await adapter.get(legacyHandledKey(slot))) === true) {
            if (!(await permitted(slot, expected)) || !current(expected))
              return { ok: false, error: 'slot-changed' };
            return { ok: true, imported: false };
          }
          // Presence, not successful decoding, decides precedence: corrupt newer slots stay intact.
          const imported = (await adapter.get(blobKey(slot))) === undefined;
          const entries: [string, unknown][] = [
            [legacyBackupKey(slot), rawOriginal],
            [legacyHandledKey(slot), true],
          ];
          if (imported) entries.push([blobKey(slot), blob], [metaKey(slot), cache]);
          if (!(await permitted(slot, expected)) || !current(expected))
            return { ok: false, error: 'slot-changed' };
          await adapter.setMany(entries);
          if (imported) corrupt.delete(slot);
          return {
            ok: true,
            imported,
            ...(imported && expected ? { version: (await content(slot)).version } : {}),
          };
        } catch (error) {
          return {
            ok: false,
            error:
              typeof error === 'object' &&
              error !== null &&
              'name' in error &&
              error.name === 'QuotaExceededError'
                ? 'quota-exceeded'
                : 'write-failed',
          };
        }
      });
    } catch {
      return Promise.resolve({ ok: false, error: 'write-failed' });
    }
  }
  return {
    importLegacySlotIfEmpty,
    isLegacySlotHandled: (slot: SaveSlotId): Promise<boolean> =>
      validLegacySlot(slot)
        ? serial(slot, async () => (await adapter.get(legacyHandledKey(slot))) === true)
        : Promise.resolve(false),
    saveToSlot: (slot: SaveSlotId, save: SaveFile, guard?: SaveOperationGuard) =>
      snapshotWrite(slot, save, undefined, guard),
    /** Bounded autosave seam: blob, summary and ring advancement commit or abort together. */
    saveAutosaveToSlot: (
      slot: SaveSlotId,
      save: SaveFile,
      nextCursor: number,
    ): Promise<SaveOutcome> => {
      if (
        !Number.isSafeInteger(nextCursor) ||
        nextCursor < 1 ||
        slot !== `auto:${((nextCursor - 1) % SAVECFG.autoSaveSlots) + 1}`
      )
        return Promise.resolve({ ok: false, error: 'write-failed' });
      return snapshotWrite(slot, save, nextCursor);
    },
    loadFromSlot: (slot: SaveSlotId, guard?: SaveOperationGuard) => {
      const expected = captureGuard(guard);
      return serial(slot, () => loadFromSlot(slot, expected));
    },
    listSlots,
    deleteSlot: (slot: SaveSlotId, guard?: SaveOperationGuard) => {
      const expected = captureGuard(guard);
      return serial(slot, () => deleteSlot(slot, expected));
    },
    findLatestSave,
    rawExport: (slot: SaveSlotId) => serial(slot, () => rawExport(slot)),
    exportRawFromSlot: (
      slot: SaveSlotId,
      guard?: SaveOperationGuard,
    ): Promise<{ ok: true; raw: string } | { ok: false; error: SaveErrorCode }> => {
      const expected = captureGuard(guard);
      return serial(slot, async () => {
        if (!validSlot(slot)) return { ok: false, error: 'empty-slot' };
        try {
          const observed = await content(slot);
          if (
            (expected?.expectedVersion !== undefined &&
              observed.version !== expected.expectedVersion) ||
            !current(expected)
          )
            return { ok: false, error: 'slot-changed' };
          if (observed.blob === undefined) return { ok: false, error: 'empty-slot' };
          const raw =
            typeof observed.blob === 'string'
              ? LZString.decompressFromUTF16(observed.blob) || observed.blob
              : JSON.stringify(observed.blob);
          return typeof raw === 'string' ? { ok: true, raw } : { ok: false, error: 'corrupt' };
        } catch {
          return { ok: false, error: 'corrupt' };
        }
      });
    },
  };
}
