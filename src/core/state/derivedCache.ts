// 執行期衍生值快取（DerivedCache）：tick 內 memo ＋ 髒標記 ＋ 清空機制（M1-9）。
// 規格：plan/02-data-model.md §5.1（衍生值與快取策略，canonical——「快取一律放在 state 之外的
// transient DerivedCache（不序列化、不影響 golden hash），在每個 tick 開頭整批清空（memoization
// 僅在單一 tick 內生效）」；「任何系統不得讀取跨 tick 的 memo 值」）；
// plan/03-game-loop.md §3.8.1（DerivedCache 髒標記機制精神——mutation helper 標髒、惰性重算）。
//
// 【M1 範圍裁決】02 §5.1（資料模型，優先序高於 03 系統文件；00>02>15>系統>UI）明文「tick 內 memo、
// 每 tick 清空」，與 03 §3.8.1 描述之「跨 tick 持續存在、由 mutation helper 個別標髒、debug 每 30
// tick 全量重算比對」之*長效*快取設計不同構（03 該節並描述 `pathGraphVersion`／`clanEconomy` 等
// 屬 M2+（04 尋路）／M3+（05 經濟）系統落地後才有意義之衍生值，非 M1 stub 系統之產出）。依 00>02
// 裁定 M1-9 採 02 §5.1 之「tick 內 memo」模型：本檔只提供機制本身（建立／讀取-或-算／標髒／清空），
// 不預先宣告 03 §4.5 `DerivedCache` 介面所列之具名 Map 欄位（clanEconomy／castleMaxSoldiers／
// clanTotals／pathGraphVersion）——那些具名衍生值待對應系統（05/07/04 等）到位後由 selectors.ts
// （M1-10 起）以 `getOrCompute(cache, key, compute)` 掛載，key 命名慣例＝`<selector名>:<實體id>`。
// 已回寫 plan/03-game-loop.md §8（見「M1-9 落地裁決」條目）。
//
// tick 邊界的實際清空掛點：本檔僅提供 `clearDerivedCache()`，尚未接入 `advanceDay`（M1 stub 系統
// 皆不消費 selector、無實質清空需求）；待 M2+ 系統開始於 tick 內呼叫 selector 時，由呼叫端（tick
// 驅動器／測試）在每次 `advanceDay` 前後各呼叫一次以保證「跨 tick 不殘留」（02 §5.1）。

/** 執行期衍生值快取（不序列化；tick 內 memo，見檔頭裁決）。 */
export interface DerivedCache {
  readonly memo: Map<string, unknown>; // key → 已算值（僅本 tick 內有效）
  readonly dirty: Set<string>; // 本 tick 內被標髒之 key（除錯／測試可觀察；memo 已同步剔除）
}

/** 建立一個空的 DerivedCache。 */
export function createDerivedCache(): DerivedCache {
  return { memo: new Map(), dirty: new Set() };
}

/**
 * tick 邊界清空（02 §5.1：「在每個 tick 開頭整批清空」）：memo／dirty 全部清除。
 * 呼叫時機見檔頭「tick 邊界的實際清空掛點」——本檔不強制掛在 advanceDay 內，由呼叫端保證
 * 每個 tick 邊界恰呼叫一次，達成「跨 tick 不殘留」。
 */
export function clearDerivedCache(cache: DerivedCache): void {
  cache.memo.clear();
  cache.dirty.clear();
}

/**
 * 標記 key 為髒（03 §3.8.1 精神）：立即剔除該 key 的 memo（下次讀取重算），並記入 `dirty`
 * 供除錯/測試觀察「哪些 key 曾於本 tick 被標髒」。tick 結束後 `clearDerivedCache` 會一併清空。
 */
export function markDirty(cache: DerivedCache, key: string): void {
  cache.memo.delete(key);
  cache.dirty.add(key);
}

/**
 * 讀取-或-計算：`key` 命中 memo 直接回傳；未命中則呼叫 `compute()`、存入 memo 後回傳。
 * 同一 tick 內對同一 `key` 之後續呼叫恆回傳同一次計算結果（memo 命中，不重算）。
 */
export function getOrCompute<T>(cache: DerivedCache, key: string, compute: () => T): T {
  if (cache.memo.has(key)) {
    return cache.memo.get(key) as T;
  }
  const value = compute();
  cache.memo.set(key, value);
  return value;
}
