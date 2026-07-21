// 存檔槽 IO（app 層；16 §3.1／§3.3／§3.4）。
// MVP 先行實作（原屬 M8-13/M8-14 之子集；依使用者 2026-07-22「先完成可通關 MVP」指示）：
// - 介質暫用 localStorage（同步、零依賴）；M8-13 依 16 §3.1 遷移至 idb-keyval＋lz-string
//   壓縮時，僅本檔內部實作更動，鍵名（tf.save.{slotId}.blob/.meta）與槽位契約照 16 不變。
// - 槽位 MVP 子集：auto:1（月結自動存檔，03 §3.9.1 autosaveDue hook）＋ quick:1
//   （Ctrl+S／F9，16 §3.4）。manual:1..10 與自動槽三格輪替屬 M8-13。
// - 寫入失敗（QuotaExceededError 等）依 16 §3.10 精神降級：回傳 false、console.warn，不中斷遊戲。

import type { GameState } from '@core/state/gameState';
import { decodeSave, encodeSave, type SaveDecodeError, type SaveMeta } from '@core/save/serialize';

/** MVP 支援的槽位（16 §3.3 子集）。 */
export type SaveSlotId = 'auto:1' | 'quick:1';
export const SAVE_SLOTS: readonly SaveSlotId[] = ['auto:1', 'quick:1'];

const blobKey = (slot: SaveSlotId): string => `tf.save.${slot}.blob`;
const metaKey = (slot: SaveSlotId): string => `tf.save.${slot}.meta`;

/** meta 快取鍵內容（列表／「繼續」判定用；blob 損毀時仍可自 blob 重建，16 §3.2）。 */
export interface SlotMetaEntry {
  slotId: SaveSlotId;
  timestamp: number;
  meta: SaveMeta;
}

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage !== undefined;
  } catch {
    return false; // 隱私模式等存取即擲例外的環境
  }
}

/** 寫入槽位（tick 邊界呼叫；16 §5.2 精簡版）。成功回 true；配額或環境失敗回 false。 */
export function saveToSlot(slot: SaveSlotId, state: GameState): boolean {
  if (!storageAvailable()) return false;
  const timestamp = Date.now();
  try {
    const raw = encodeSave(state, timestamp);
    window.localStorage.setItem(blobKey(slot), raw);
    const parsed = JSON.parse(raw) as { meta: SaveMeta };
    window.localStorage.setItem(
      metaKey(slot),
      JSON.stringify({ slotId: slot, timestamp, meta: parsed.meta }),
    );
    return true;
  } catch (err) {
    console.warn(`存檔寫入失敗（${slot}；16 §3.10 降級：照常遊戲）：`, err);
    return false;
  }
}

/** 讀取槽位（16 §5.4 精簡版）：空槽回 empty；解碼失敗回對應錯誤碼。 */
export function loadFromSlot(
  slot: SaveSlotId,
): { ok: true; state: GameState } | { ok: false; code: SaveDecodeError | 'empty' } {
  if (!storageAvailable()) return { ok: false, code: 'empty' };
  const raw = window.localStorage.getItem(blobKey(slot));
  if (raw === null) return { ok: false, code: 'empty' };
  const decoded = decodeSave(raw);
  if (!decoded.ok) return { ok: false, code: decoded.code };
  return { ok: true, state: decoded.saveFile.state };
}

/** 槽位 meta 一覽（只讀 meta 鍵，不解碼 blob；16 §3.3 第 3 點）。 */
export function listSlotMetas(): SlotMetaEntry[] {
  if (!storageAvailable()) return [];
  const entries: SlotMetaEntry[] = [];
  for (const slot of SAVE_SLOTS) {
    const raw = window.localStorage.getItem(metaKey(slot));
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as SlotMetaEntry;
      if (typeof parsed.timestamp === 'number' && parsed.meta !== undefined) {
        entries.push({ ...parsed, slotId: slot });
      }
    } catch {
      // meta 快取損毀：忽略（blob 仍可能完好；MVP 不在列表層重建）
    }
  }
  return entries;
}

/** 「繼續」目標：timestamp 最新的非空槽（16 §5.8 精簡版；無存檔回 null）。 */
export function latestSlot(): SaveSlotId | null {
  const entries = listSlotMetas().sort((a, b) => b.timestamp - a.timestamp);
  return entries[0]?.slotId ?? null;
}

/** 是否存在任何存檔（標題「繼續」啟用判定）。 */
export function hasAnySave(): boolean {
  return latestSlot() !== null;
}

/** 月結自動存檔（03 §3.9.1 autosaveDue hook 的處理端；bridge 於 tick 邊界呼叫）。 */
export function autosave(state: GameState): boolean {
  return saveToSlot('auto:1', state);
}

/** 測試專用：清空全部槽位。 */
export function clearAllSlotsForTests(): void {
  if (!storageAvailable()) return;
  for (const slot of SAVE_SLOTS) {
    window.localStorage.removeItem(blobKey(slot));
    window.localStorage.removeItem(metaKey(slot));
  }
}
