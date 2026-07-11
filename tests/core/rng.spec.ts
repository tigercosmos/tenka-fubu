// M1-4 rng.ts 驗收測試（roadmap 18 §3.4 T2）。
// 規格：plan/03-game-loop.md §3.5（mulberry32 逐位元、fnv1a32 播種、五流、RngStream API、
// 決定論禁令）；驗收標準：「固定種子下前 1000 個 next() 輸出與 fixture 完全一致；
// shuffle 消費次數 = n−1」（18 §3.4 T2）。
//
// fixture 產生方式：tests/fixtures/rng-mulberry32-seed42.json 為「自產並凍結」——由一份
// 逐字轉錄 03 §3.5.1／§3.5.2 偽碼、獨立於 src/core/rng.ts 的參考實作產生，且已與
// src/core/rng.ts 交叉核對逐位元一致後凍結（回歸基準；不得為配合實作改動而重新產生，
// 除非 03 §3.5.1 演算法本身變更）。

import { describe, expect, it } from 'vitest';
import {
  createRngStream,
  fnv1a32,
  initRng,
  mulberry32Next,
  RNG_STREAM_NAMES,
  type RngStream,
  type RngStreamName,
} from '../../src/core/rng';
import { BAL } from '../../src/core/balance';
import type { RngState } from '../../src/core/state/gameState';
import rngFixture from '../fixtures/rng-mulberry32-seed42.json';

describe('rng.ts — 五個具名流窮舉（03 §3.5.2）', () => {
  it('RNG_STREAM_NAMES 恰為 battle/dev/ai/event/misc 五名，且與 RngState 欄位一一對應', () => {
    // Record<RngStreamName, true> 編譯期窮舉：漏一鍵或多一鍵即 tsc 失敗（比照 tests/core/types.spec.ts 手法）。
    const ALL_STREAM_NAMES: Record<RngStreamName, true> = {
      battle: true,
      dev: true,
      ai: true,
      event: true,
      misc: true,
    };
    expect(RNG_STREAM_NAMES.length).toBe(5);
    expect(new Set(RNG_STREAM_NAMES)).toEqual(new Set(Object.keys(ALL_STREAM_NAMES)));
  });
});

describe('rng.ts — fnv1a32（公開 FNV-1a 32 位元測試向量）', () => {
  it('空字串／已知向量與公開 FNV-1a32 測試套件一致', () => {
    // 參考：Fowler/Noll/Vo FNV test vectors（http://www.isthe.com/chongo/tech/comp/fnv/）。
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('回傳值恆為 uint32 範圍（0..2^32-1）', () => {
    expect(fnv1a32('tenka:battle')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('tenka:battle')).toBeLessThan(4294967296);
  });
});

describe('rng.ts — initRng 播種（03 §3.5.2；BAL.rngWarmupDraws=12）', () => {
  it('BAL.rngWarmupDraws 定案值為 12（15 §5.1；03 §3.5.2）', () => {
    expect(BAL.rngWarmupDraws).toBe(12);
  });

  it('固定 masterSeed=42 的五流初始狀態與 fixture 完全一致', () => {
    const rng = initRng(rngFixture.masterSeed);
    expect(rng).toEqual(rngFixture.rngInit);
  });

  it('五流初始狀態彼此互異（不同流互不借用，03 §3.5.4 禁令 4 的播種面體現）', () => {
    const rng = initRng(rngFixture.masterSeed);
    const values = RNG_STREAM_NAMES.map((name) => rng[name]);
    expect(new Set(values).size).toBe(5);
  });

  it('確實空轉 BAL.rngWarmupDraws=12 次：對播種原始值手動空轉 12 次可重現 initRng 結果', () => {
    const masterSeed = rngFixture.masterSeed;
    let s = (fnv1a32('tenka:battle') ^ masterSeed) >>> 0;
    for (let i = 0; i < BAL.rngWarmupDraws; i += 1) {
      const [, next] = mulberry32Next(s);
      s = next;
    }
    expect(s).toBe(initRng(masterSeed).battle);
  });

  it('masterSeed 依 uint32 環繞（>>> 0 遮罩）：2^32 平移後結果相同', () => {
    expect(initRng(2 ** 32 + 42)).toEqual(initRng(42));
  });

  it('回傳的 RngState 僅含 02 §4.2 canonical 五欄位，不含 masterSeed（見 rng.ts 檔頭裁決）', () => {
    const rng = initRng(42);
    expect(Object.keys(rng).sort()).toEqual(['ai', 'battle', 'dev', 'event', 'misc']);
  });
});

describe('rng.ts — mulberry32Next 逐位元 golden fixture（03 §3.5.1；18 §3.4 T2 驗收）', () => {
  it('battle 流固定種子前 1000 個 next() 輸出與凍結 fixture 逐一相等', () => {
    const rng = initRng(rngFixture.masterSeed);
    const stream = createRngStream(rng, 'battle');
    const values: number[] = [];
    for (let i = 0; i < 1000; i += 1) values.push(stream.next());
    expect(values).toEqual(rngFixture.battleFirst1000);
    expect(rng.battle).toBe(rngFixture.battleFinalState);
  });

  it('ai 流固定種子前 1000 個 next() 輸出與凍結 fixture 逐一相等（第二條流交叉驗證）', () => {
    const rng = initRng(rngFixture.masterSeed);
    const stream = createRngStream(rng, 'ai');
    const values: number[] = [];
    for (let i = 0; i < 1000; i += 1) values.push(stream.next());
    expect(values).toEqual(rngFixture.aiFirst1000);
    expect(rng.ai).toBe(rngFixture.aiFinalState);
  });

  it('next() 值恆落於 [0,1)', () => {
    const rng = initRng(7);
    const stream = createRngStream(rng, 'misc');
    for (let i = 0; i < 500; i += 1) {
      const v = stream.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rng.ts — 流獨立性（03 §3.5.4 禁令 4：各流僅限表列消費者，禁止跨流借用）', () => {
  it('消費某一流不影響其他流的內部狀態', () => {
    const rng = initRng(rngFixture.masterSeed);
    const battleStream = createRngStream(rng, 'battle');
    const aiStream = createRngStream(rng, 'ai');
    const otherStreamsBefore: Record<string, number> = {
      dev: rng.dev,
      event: rng.event,
      misc: rng.misc,
    };
    for (let i = 0; i < 50; i += 1) battleStream.next();
    for (let i = 0; i < 30; i += 1) aiStream.next();
    expect(rng.dev).toBe(otherStreamsBefore.dev);
    expect(rng.event).toBe(otherStreamsBefore.event);
    expect(rng.misc).toBe(otherStreamsBefore.misc);
    // 已消費的兩流狀態應與各自獨立重播的結果一致（不互相汙染）。
    const rngReplay = initRng(rngFixture.masterSeed);
    const battleReplay = createRngStream(rngReplay, 'battle');
    for (let i = 0; i < 50; i += 1) battleReplay.next();
    expect(rng.battle).toBe(rngReplay.battle);
  });

  it('同一 masterSeed 下不同具名流各自產生不同序列（非同一亂數重複套用）', () => {
    expect(rngFixture.battleFirst1000.slice(0, 20)).not.toEqual(
      rngFixture.aiFirst1000.slice(0, 20),
    );
  });
});

describe('rng.ts — 決定論（03 §3.5.4：同輸入必同輸出；序列化延續）', () => {
  it('同一 masterSeed 重新播種＋重播同序列操作，逐步結果完全相同', () => {
    const rngA = initRng(999);
    const rngB = initRng(999);
    const streamA = createRngStream(rngA, 'misc');
    const streamB = createRngStream(rngB, 'misc');
    for (let i = 0; i < 200; i += 1) {
      expect(streamA.next()).toBe(streamB.next());
    }
    expect(rngA).toEqual(rngB);
  });

  it('RngState 可 JSON 序列化／還原後續抽仍與未序列化延續分支一致（存讀檔延續決定論，03 §3.5.3）', () => {
    const rng = initRng(123);
    const stream = createRngStream(rng, 'event');
    for (let i = 0; i < 10; i += 1) stream.next();

    const restored = JSON.parse(JSON.stringify(rng)) as RngState;
    const restoredStream = createRngStream(restored, 'event');
    const continuedStream = createRngStream(rng, 'event');

    for (let i = 0; i < 10; i += 1) {
      expect(restoredStream.next()).toBe(continuedStream.next());
    }
  });
});

describe('rng.ts — RngStream 衍生 API（03 §3.5.1：nextInt/chance/pick/shuffle）', () => {
  // 已知狀態：initRng(42).battle＝3431138870；其 next() 鏈的前三個值與新狀態於下方
  // gen-unit-values 獨立計算並凍結（未經 createRngStream 高階方法，僅呼叫 mulberry32Next 本身）。
  const KNOWN_STATE = 3431138870;
  const KNOWN_V1 = 0.5571457690093666; // mulberry32Next(KNOWN_STATE) 的 value
  const KNOWN_S1 = 967737387; // mulberry32Next(KNOWN_STATE) 的 nextState

  function freshStream(state: number): { rng: RngState; stream: RngStream } {
    // 借用單欄位物件模擬「單一流」——createRngStream 只依賴索引寫入行為，型別以 RngState 具名鍵示意，
    // 此處以 misc 欄位測試通用契約（衍生 API 與流名無關）。
    const rng = { battle: state, dev: 0, ai: 0, event: 0, misc: 0 };
    return { rng, stream: createRngStream(rng, 'battle') };
  }

  it('next() 從已知狀態的輸出與獨立計算值一致（基準錨點，供以下衍生 API 測試比對）', () => {
    const { stream } = freshStream(KNOWN_STATE);
    expect(stream.next()).toBe(KNOWN_V1);
  });

  it('nextInt(min,max)：floor 映射公式＝min+floor(next()*(max-min+1))，消費 1 次 next()', () => {
    const { rng: rngA, stream: streamA } = freshStream(KNOWN_STATE);
    expect(streamA.nextInt(0, 9)).toBe(5); // = 0 + floor(0.5571... * 10)
    expect(rngA.battle).toBe(KNOWN_S1); // 恰消費 1 次

    const { stream: streamB } = freshStream(KNOWN_STATE);
    expect(streamB.nextInt(5, 10)).toBe(8); // = 5 + floor(0.5571... * 6)
  });

  it('nextInt 大量抽樣恆落於 [min,max] 含兩端', () => {
    const rng = initRng(2024);
    const stream = createRngStream(rng, 'dev');
    for (let i = 0; i < 1000; i += 1) {
      const v = stream.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('chance(p)：p=0 恆 false、p=1 恆 true（next()∈[0,1) 故 next()<1 恆真）', () => {
    const rng = initRng(55);
    const stream = createRngStream(rng, 'misc');
    for (let i = 0; i < 200; i += 1) {
      expect(stream.chance(0)).toBe(false);
    }
    for (let i = 0; i < 200; i += 1) {
      expect(stream.chance(1)).toBe(true);
    }
  });

  it('chance(p) 與已知 next() 值比較結果一致', () => {
    const { stream: s1 } = freshStream(KNOWN_STATE);
    expect(s1.chance(0.6)).toBe(true); // KNOWN_V1(0.5571...) < 0.6
    const { stream: s2 } = freshStream(KNOWN_STATE);
    expect(s2.chance(0.5)).toBe(false); // KNOWN_V1(0.5571...) >= 0.5
  });

  it('pick(arr)：回傳 arr[floor(next()*arr.length)]，與已知值一致', () => {
    const { stream } = freshStream(KNOWN_STATE);
    const arr = ['w', 'x', 'y', 'z'] as const;
    // floor(0.5571... * 4) = 2 → 'y'
    expect(stream.pick(arr)).toBe('y');
  });

  it('pick(arr) 恆回傳陣列內的元素', () => {
    const rng = initRng(77);
    const stream = createRngStream(rng, 'ai');
    const arr = [10, 20, 30, 40, 50];
    for (let i = 0; i < 200; i += 1) {
      expect(arr).toContain(stream.pick(arr));
    }
  });

  it('shuffle(arr)：就地洗牌、回傳同陣列參考、為原陣列之排列（元素多重集合不變）', () => {
    const rng = initRng(88);
    const stream = createRngStream(rng, 'event');
    const arr = [1, 2, 3, 4, 5, 6, 7];
    const result = stream.shuffle(arr);
    expect(result).toBe(arr); // 同參考（就地）
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shuffle 消費次數＝n−1（18 §3.4 T2 驗收標準逐字）', () => {
    const n = 9;
    const arr = Array.from({ length: n }, (_, i) => i);

    const rngShuffle = { battle: 0, dev: 0, ai: 0, event: 0, misc: 12345 };
    const shuffleStream = createRngStream(rngShuffle, 'misc');
    shuffleStream.shuffle(arr);
    const stateAfterShuffle = rngShuffle.misc;

    const rngCount = { battle: 0, dev: 0, ai: 0, event: 0, misc: 12345 };
    const countStream = createRngStream(rngCount, 'misc');
    for (let i = 0; i < n - 1; i += 1) countStream.next();
    expect(rngCount.misc).toBe(stateAfterShuffle);
  });

  it('shuffle 對長度 0/1 陣列消費 0 次（迴圈不執行，狀態不變）', () => {
    const rng = { battle: 0, dev: 0, ai: 0, event: 0, misc: 555 };
    const stream = createRngStream(rng, 'misc');
    stream.shuffle([]);
    expect(rng.misc).toBe(555);
    stream.shuffle([42]);
    expect(rng.misc).toBe(555);
  });

  it('shuffle 為決定論：同起始狀態、同陣列長度必得同一排列', () => {
    const arr1 = [1, 2, 3, 4, 5];
    const arr2 = [1, 2, 3, 4, 5];
    const rng1 = { battle: 0, dev: 0, ai: 0, event: 0, misc: 2468 };
    const rng2 = { battle: 0, dev: 0, ai: 0, event: 0, misc: 2468 };
    createRngStream(rng1, 'misc').shuffle(arr1);
    createRngStream(rng2, 'misc').shuffle(arr2);
    expect(arr1).toEqual(arr2);
    expect(rng1.misc).toBe(rng2.misc);
  });
});
