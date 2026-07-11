// mulberry32 五流亂數（決定論的唯一亂數來源；core 禁止 Math.random/Date.now，ESLint 強制）。
// 規格：plan/03-game-loop.md §3.5（T2：mulberry32 逐位元實作、fnv1a32 播種、五個具名流、
// RngStream API）、plan/00-foundations.md §5.5。
//
// RngState 型別唯一真相：plan/02-data-model.md §4.2（逐字轉錄於 src/core/state/gameState.ts）。
//
// 【M1-4 疑義裁決｜回寫 03 §8】03 §3.5.3 稱「masterSeed 存於 GameState.rng」，且 §4.4 重複定義
// 一份「含 masterSeed 欄位」的 RngState；此與 02 §4.2 canonical RngState（僅 battle/dev/ai/event/
// misc 五個 uint32 欄位、無 masterSeed，已逐字轉錄於 gameState.ts）牴觸——02 內部無 masterSeed
// 欄位、02 §4.2 MetaState 另有 `seed: number`（初始種子，重放重現用）欄位方擔此責。
// 依規格衝突優先序 00 > 02 > 03（15 §1 首段、19 §3.13 通例）裁定：**RngState 以 02 為準**（本檔
// import 的 RngState 即 02 型別，不自創/不加 masterSeed 欄位）；masterSeed 僅為 initRng() 的入參，
// 由呼叫端傳入 `state.meta.seed`（02 §4.2 MetaState.seed）、不重複存於 GameState.rng。
// 03 §3.5.3／§4.4 的「masterSeed 存於 GameState.rng」敘述須視為非 canonical、以此裁決為準。

import { BAL } from './balance';
import type { RngState } from './state/gameState';

/** 五個具名亂數流（03 §3.5.2）；欄位名＝RngState 欄位名，不自創。 */
export type RngStreamName = keyof RngState;

/** 固定疊代順序（＝03 §3.5.2 表列順序／§3.5.2 種子推導偽碼順序）。 */
export const RNG_STREAM_NAMES: readonly RngStreamName[] = ['battle', 'dev', 'ai', 'event', 'misc'];

const UINT32_MOD = 4294967296; // 2^32

/**
 * mulberry32：單一 uint32 狀態 → ([0,1) 亂數, 新狀態)。
 * 演算法必須逐位元對齊 03 §3.5.1（golden test 依賴），不得自行「優化」改寫。
 */
export function mulberry32Next(streamState: number): readonly [value: number, nextState: number] {
  const s = (streamState + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32_MOD;
  return [value, s];
}

/** 字串 → UTF-8 位元組序列（供 fnv1a32 使用；core 內自持純函式，不依賴 TextEncoder）。 */
function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    const code = str.codePointAt(i);
    if (code === undefined) continue;
    if (code > 0xffff) i += 1; // 代理對佔用兩個 UTF-16 code unit，跳過後半
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** fnv1a32：字串 → uint32（03 §3.5.2 種子推導用）。 */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (const b of utf8Bytes(str)) {
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 單一流播種：`fnv1a32('tenka:'+name) ^ masterSeed`，再空轉 BAL.rngWarmupDraws 次（03 §3.5.2）。 */
function seedStream(name: RngStreamName, maskedSeed: number): number {
  let s = (fnv1a32(`tenka:${name}`) ^ maskedSeed) >>> 0;
  for (let i = 0; i < BAL.rngWarmupDraws; i += 1) {
    const [, next] = mulberry32Next(s);
    s = next;
  }
  return s;
}

/**
 * 開局播種（03 §3.5.2，新遊戲開始時執行一次）：由單一 masterSeed 推導五流初始狀態。
 * masterSeed 不進回傳值——見檔頭裁決註：呼叫端另存 masterSeed 於 state.meta.seed（02 §4.2）。
 */
export function initRng(masterSeed: number): RngState {
  const maskedSeed = masterSeed >>> 0;
  return {
    battle: seedStream('battle', maskedSeed),
    dev: seedStream('dev', maskedSeed),
    ai: seedStream('ai', maskedSeed),
    event: seedStream('event', maskedSeed),
    misc: seedStream('misc', maskedSeed),
  };
}

/** rng.ts 對 systems 暴露的介面（綁定單一流；03 §4.4 canonical）。 */
export interface RngStream {
  /** [0,1) float64；唯一熵源，其餘方法皆以此為基礎、消費次數固定可預期（03 §3.5.1）。 */
  next(): number;
  /** 含兩端整數；消費 1 次 next()（floor 映射，非 rejection sampling，偏差 <2⁻³²，03 §3.5.1／§8 D7）。 */
  nextInt(min: number, max: number): number;
  /** 機率判定 p ∈ [0,1]；消費 1 次 next()。 */
  chance(p: number): boolean;
  /** arr 非空（呼叫端保證）；消費 1 次 next()。 */
  pick<T>(arr: readonly T[]): T;
  /** Fisher–Yates 自尾向頭、就地洗牌並回傳同陣列；消費 arr.length−1 次 next()。 */
  shuffle<T>(arr: T[]): T[];
}

/**
 * 綁定 `rng`（GameState.rng）之單一具名流為 RngStream。
 * 就地改寫 `rng[name]`（core in-place mutation 慣例，03 §3.1）——呼叫端傳入的是
 * GameState.rng 本身（或其參考），每次 next() 呼叫都會同步寫回，供序列化／存讀檔延續。
 */
export function createRngStream(rng: RngState, name: RngStreamName): RngStream {
  const next = (): number => {
    const [value, nextState] = mulberry32Next(rng[name]);
    rng[name] = nextState;
    return value;
  };
  const nextInt = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const chance = (p: number): boolean => next() < p;
  const pick = <T>(arr: readonly T[]): T => arr[nextInt(0, arr.length - 1)] as T;
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = nextInt(0, i);
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  };
  return { next, nextInt, chance, pick, shuffle };
}
