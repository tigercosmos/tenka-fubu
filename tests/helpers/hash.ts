// 穩定序列化與 FNV-1a 64-bit 雜湊（規格：plan/17-testing.md §5.1、§5.2）。
// hashState(state) 需要 GameState 型別（M1 產出），留待 M1 於本檔補上；
// 本檔目前只提供不依賴 GameState 的 stableStringify／fnv1a64。

/**
 * 穩定序列化：結果與物件鍵插入順序無關。
 * 前提（02 已保證）：輸入為純 JSON 值（無 Map/Set/Date/函式/undefined/NaN）。
 */
export function stableStringify(v: unknown): string {
  if (v === null) {
    return 'null';
  }
  if (typeof v === 'boolean' || typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error(`stableStringify: 數值必須為有限值，實得 ${String(v)}`);
    }
    if (Object.is(v, -0)) {
      return '0';
    }
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return '[' + v.map((item) => stableStringify(item)).join(',') + ']';
  }
  if (typeof v === 'object') {
    // Map/Set/Date 等非 plain object 一律拒絕。
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error('stableStringify: 不支援 Map/Set/Date/class 等非純物件');
    }
    const record = v as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs = keys
      .filter((k) => record[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + stableStringify(record[k]));
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`stableStringify: 不支援的型別 ${typeof v}`);
}

/** FNV-1a 64-bit（純 TypeScript BigInt 實作，零依賴，Node／瀏覽器結果一致）。 */
export function fnv1a64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let h = 0xcbf29ce484222325n;
  const prime = 0x00000100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}
