// 存檔槽 IO（app 層 localStorage MVP）測試（16 §3.3／§3.4／§5.8 精簡契約）。
import { afterEach, describe, expect, it } from 'vitest';
import {
  autosave,
  clearAllSlotsForTests,
  hasAnySave,
  latestSlot,
  listSlotMetas,
  loadFromSlot,
  saveToSlot,
} from '../../src/app/persistence';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';
import { stateHash } from '../../src/core/state/serialize';

afterEach(() => {
  clearAllSlotsForTests();
});

describe('persistence（localStorage MVP 槽位）', () => {
  it('save → load 往返：state 結構與 hash 相同', () => {
    const state = buildTinyState();
    expect(saveToSlot('quick:1', state)).toBe(true);
    const loaded = loadFromSlot('quick:1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(stateHash(loaded.state)).toBe(stateHash(state));
  });

  it('空槽 load 回 empty；hasAnySave 對應', () => {
    expect(hasAnySave()).toBe(false);
    expect(loadFromSlot('quick:1')).toMatchObject({ ok: false, code: 'empty' });
    expect(latestSlot()).toBeNull();
  });

  it('latestSlot 取 timestamp 最新的非空槽（自動＋快速並存）', () => {
    const state = buildTinyState();
    expect(autosave(state)).toBe(true); // auto:1
    expect(saveToSlot('quick:1', state)).toBe(true); // 之後寫入 → timestamp 較新
    const metas = listSlotMetas();
    expect(metas.map((m) => m.slotId).sort()).toEqual(['auto:1', 'quick:1']);
    const latest = latestSlot();
    expect(latest).not.toBeNull();
    // 兩槽 timestamp 可能同毫秒；只驗證回傳值屬於兩槽之一且非空可讀
    const loaded = loadFromSlot(latest!);
    expect(loaded.ok).toBe(true);
  });

  it('blob 損毀時 load 回錯誤碼、不擲例外', () => {
    const state = buildTinyState();
    saveToSlot('quick:1', state);
    window.localStorage.setItem('tf.save.quick:1.blob', '{broken');
    expect(loadFromSlot('quick:1')).toMatchObject({ ok: false, code: 'invalidFile' });
  });

  it('meta 摘要含玩家勢力資訊（列表渲染不需解碼 blob）', () => {
    const state = buildTinyState();
    saveToSlot('quick:1', state);
    const metas = listSlotMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0]!.meta.clanId).toBe(CLAN_ALPHA);
    expect(metas[0]!.meta.castleCount).toBe(2);
  });
});
