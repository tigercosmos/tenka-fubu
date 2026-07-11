// canonical 序列化／狀態雜湊／執行期 ID 生成（M1-12）。
// 規格：plan/02-data-model.md §3.4 第 6 點（transient 剔除，勘誤 E-60）／§5.3（nextId 六位流水）／
// §5.4（canonical stringify／stateHash）。
//
// stateHash 演算法採 **fnv1a64**：02 §5.4 原文寫「32-bit FNV-1a，實作於 17」，但其指定之實作
// plan/17-testing.md §5.2 與 M0 已鎖定測試向量的 tests/helpers/hash.ts 皆為 **64-bit**
// （`fnv1a64('') === 'cbf29ce484222325'`）；判定 02 §5.4 內文「32-bit」為與 03-game-loop.md
// §3.5.2 RNG 流播種用 `fnv1a32`（不同用途、不同函式）之筆誤沿用，非刻意分岔。依 00 > 02 裁決此為
// 02 §5.4 自身內部不一致（本文『32-bit』字面 vs 其援引之 17 實作），依其援引之 17 實作與已鎖定測試
// 向量之現有程式碼為準採 64-bit；已回寫 02 §8「M1 型別基座實作裁決」新增 M1-F3。
//
// core 不得 import tests/（CLAUDE.md／eslint 邊界鐵律），故本檔獨立重寫與 tests/helpers/hash.ts
// 演算法相同、輸出位元一致的 fnv1a64／canonical stringify（後者對應 02 命名 canonicalStringify，
// 17 稱 stableStringify，同一演算法，02 優先取其名）。

import type { GameState } from './gameState';
import type {
  ArmyId,
  BattleId,
  CorpsId,
  PlotId,
  ProposalId,
  ReportId,
  SiegeId,
  TransportId,
} from './ids';

/**
 * sorted-key canonical stringify（02 §5.4）：key 依字典序（UTF-16 code unit）排序後序列化，
 * 確保跨平台位元一致，供 golden test／determinism 之 stateHash 使用。
 * 前提（02 §3.4 第 1／2 點已保證）：輸入為純 JSON 值、數值皆有限、無 undefined、無循環引用。
 * 仍對違規輸入（NaN/Infinity／Map/Set/Date/class instance）防禦性 throw，避免上游違規靜默污染雜湊。
 */
export function canonicalStringify(v: unknown): string {
  if (v === null) {
    return 'null';
  }
  if (typeof v === 'boolean' || typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error(`canonicalStringify: 數值必須為有限值，實得 ${String(v)}`);
    }
    if (Object.is(v, -0)) {
      return '0'; // -0 視為 0（02 §3.4 第 2 點「禁 NaN/Infinity」精神延伸，避免 -0/0 雜湊分岔）
    }
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return '[' + v.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  if (typeof v === 'object') {
    // Map/Set/Date/class instance 等非 plain object 一律拒絕（02 §3.4 第 1 點）。
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error('canonicalStringify: 不支援 Map/Set/Date/class 等非純物件');
    }
    const record = v as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs = keys
      .filter((k) => record[k] !== undefined) // undefined 視為欄位不存在
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(record[k]));
    return '{' + pairs.join(',') + '}';
  }
  throw new Error(`canonicalStringify: 不支援的型別 ${typeof v}`);
}

/**
 * 字串 → UTF-8 位元組。不依賴 `TextEncoder`：`tsconfig.core.json` 排除 DOM／node 型別庫
 * （core 純度鐵律，見 CLAUDE.md），故手動實作與 `TextEncoder` 輸出位元相同的 UTF-8 編碼。
 * 以 code point 迭代（`for...of` 字串走訪已合併代理對），逐點編碼 1～4 位元組。
 */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return bytes;
}

/**
 * FNV-1a 64-bit（純 TypeScript BigInt 實作，零依賴，Node／瀏覽器結果一致，可同步呼叫；
 * 17 §5.2／tests/helpers/hash.ts 選型理由同款）。與 tests/helpers/hash.ts 之 `fnv1a64`
 * 演算法相同、輸出位元一致的獨立實作——core 不得 import tests/。
 */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x00000100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const b of utf8Bytes(text)) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

/**
 * 狀態雜湊（golden test／determinism 用，02 §5.4）。
 * 入 hash 前依 02 §3.4 第 6 點（勘誤 E-60）以淺拷貝剔除 `ai.intentLog`（transient，不落地存檔亦不入
 * 雜湊），不變動傳入的原 `state`：`serialized = { ...state, ai: { ...state.ai, intentLog: [] } }`。
 */
export function stateHash(state: GameState): string {
  const serialized: GameState = { ...state, ai: { ...state.ai, intentLog: [] } };
  return fnv1a64(canonicalStringify(serialized));
}

/** 執行期 ID 種類 → 前綴（02 §3.2 對照表；`proposal`→`prop`、`report`→`rep` 與 kind 名不同，餘同名）。 */
const ID_PREFIX: Record<keyof GameState['meta']['nextSerials'], string> = {
  army: 'army',
  battle: 'battle',
  siege: 'siege',
  corps: 'corps',
  proposal: 'prop',
  report: 'rep',
  transport: 'trans',
  plot: 'plot',
};

/** nextId kind → 對應 branded 執行期 ID 型別（供 `nextId` 回傳型別依 kind 窄化）。 */
interface SerialIdOf {
  army: ArmyId;
  battle: BattleId;
  siege: SiegeId;
  corps: CorpsId;
  proposal: ProposalId;
  report: ReportId;
  transport: TransportId;
  plot: PlotId;
}

/**
 * 執行期 ID 生成（決定論，02 §5.3）：`state.meta.nextSerials[kind]` 只增不減、隨存檔保存，
 * 確保重放時 ID 完全一致（golden test 前提）。就地遞增傳入之 `state`（呼叫端於 Command 結算等
 * 受控可變情境下持有 state，符 00 §5.2 tick 內受控可變慣例；非 core 對外暴露的不可變介面）。
 */
export function nextId<K extends keyof SerialIdOf>(state: GameState, kind: K): SerialIdOf[K] {
  const n = state.meta.nextSerials[kind];
  state.meta.nextSerials[kind] = n + 1;
  return `${ID_PREFIX[kind]}.${String(n).padStart(6, '0')}` as SerialIdOf[K];
}
