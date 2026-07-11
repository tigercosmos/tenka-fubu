// DerivedCache 機制驗收測試（M1-9）。
// 規格：plan/02-data-model.md §5.1（tick 內 memo、每 tick 清空、任何系統不得讀取跨 tick memo 值）；
//       plan/18-roadmap.md M1-9（驗收：髒標記／跨 tick 不殘留）。

import { describe, expect, it } from 'vitest';
import {
  clearDerivedCache,
  createDerivedCache,
  getOrCompute,
  markDirty,
} from '../../src/core/state/derivedCache';

describe('DerivedCache（M1-9）', () => {
  it('getOrCompute：同一 key 同一 tick 內只算一次（memo 命中不重算）', () => {
    const cache = createDerivedCache();
    let calls = 0;
    const compute = (): number => {
      calls += 1;
      return 42;
    };
    expect(getOrCompute(cache, 'k', compute)).toBe(42);
    expect(getOrCompute(cache, 'k', compute)).toBe(42);
    expect(getOrCompute(cache, 'k', compute)).toBe(42);
    expect(calls).toBe(1);
  });

  it('不同 key 各自獨立算', () => {
    const cache = createDerivedCache();
    expect(getOrCompute(cache, 'a', () => 1)).toBe(1);
    expect(getOrCompute(cache, 'b', () => 2)).toBe(2);
    expect(cache.memo.size).toBe(2);
  });

  it('markDirty：立即剔除該 key 的 memo，下次讀取重算', () => {
    const cache = createDerivedCache();
    let value = 1;
    const compute = (): number => value;
    expect(getOrCompute(cache, 'k', compute)).toBe(1);
    value = 2;
    expect(getOrCompute(cache, 'k', compute)).toBe(1); // 仍命中舊 memo
    markDirty(cache, 'k');
    expect(cache.dirty.has('k')).toBe(true);
    expect(getOrCompute(cache, 'k', compute)).toBe(2); // 重算取得新值
  });

  it('markDirty 不影響其他 key 的 memo', () => {
    const cache = createDerivedCache();
    getOrCompute(cache, 'a', () => 1);
    getOrCompute(cache, 'b', () => 2);
    markDirty(cache, 'a');
    expect(cache.memo.has('a')).toBe(false);
    expect(cache.memo.has('b')).toBe(true);
  });

  it('clearDerivedCache：模擬 tick 邊界，清空後不殘留（跨 tick 不殘留，18-roadmap M1-9 驗收）', () => {
    const cache = createDerivedCache();
    let calls = 0;
    const compute = (): number => {
      calls += 1;
      return calls;
    };
    expect(getOrCompute(cache, 'k', compute)).toBe(1); // tick 1：算一次
    expect(getOrCompute(cache, 'k', compute)).toBe(1); // tick 1：memo 命中

    clearDerivedCache(cache); // 模擬 tick 邊界
    expect(cache.memo.size).toBe(0);
    expect(cache.dirty.size).toBe(0);

    expect(getOrCompute(cache, 'k', compute)).toBe(2); // tick 2：無殘留、重新算
  });

  it('clearDerivedCache 亦清空 dirty 集合', () => {
    const cache = createDerivedCache();
    getOrCompute(cache, 'k', () => 1);
    markDirty(cache, 'k');
    expect(cache.dirty.size).toBe(1);
    clearDerivedCache(cache);
    expect(cache.dirty.size).toBe(0);
  });
});
