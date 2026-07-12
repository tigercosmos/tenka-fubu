// mini 劇本 fixture 驗收測試（M2-11；17-T4）。
// 規格：plan/18-roadmap.md M2-11（DoD：`buildMiniState()` 推進 30 日無錯）；
// plan/17-testing.md §3.3.1（mini 劇本規模表）／T4（「`tests/fixtures/mini/` 依 §3.3.1 建置並通過
// `validateScenario`」——本檔驗證面：各檔案已於 fixtures/mini/index.ts 載入時實際跑 14 §4 zod
// schema 解析；本檔另補建置後 `validateState` 零違規＋長程 tick 不拋錯兩項）。

import { describe, expect, it } from 'vitest';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems/index';
import {
  buildMiniState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CASTLE_B2,
  MINI_SEED,
  MINI_START_DAY,
} from '../fixtures/mini';

describe('buildMiniState（M2-11；17 §3.3.1）', () => {
  it('建置後 validateState 零違規', () => {
    const state = buildMiniState();
    expect(validateState(state)).toEqual([]);
  });

  it('meta：scenarioId／seed／playerClanId／startDay 符合 17 §3.3.1', () => {
    const state = buildMiniState();
    expect(state.meta.scenarioId).toBe('mini');
    expect(state.meta.seed).toBe(MINI_SEED);
    expect(state.meta.playerClanId).toBe(CLAN_ALPHA);
    expect(state.time.day).toBe(MINI_START_DAY);
    expect(state.time.year).toBe(1560);
    expect(state.time.month).toBe(4);
    expect(state.time.dayOfMonth).toBe(1);
  });

  it('形狀：2 勢力／4 城（本城×2＋支城×2）／8 郡／8 具名武將＋浪人池', () => {
    const state = buildMiniState();
    expect(Object.keys(state.clans).sort()).toEqual([CLAN_ALPHA, CLAN_BETA].sort());
    expect(Object.keys(state.castles).sort()).toEqual(
      [CASTLE_A1, CASTLE_A2, CASTLE_B1, CASTLE_B2].sort(),
    );
    expect(Object.keys(state.districts)).toHaveLength(8);
    const named = Object.values(state.officers).filter((o) => o.clanId !== null);
    expect(named).toHaveLength(8);
  });

  it('對稱設計：alpha／beta 本城與支城耐久、駐兵、兵糧鏡像同值（野戰公平性測試前提，17 §3.3.1）', () => {
    const state = buildMiniState();
    const a1 = state.castles[CASTLE_A1]!;
    const b1 = state.castles[CASTLE_B1]!;
    const a2 = state.castles[CASTLE_A2]!;
    const b2 = state.castles[CASTLE_B2]!;
    expect([a1.maxDurability, a1.soldiers, a1.food]).toEqual([
      b1.maxDurability,
      b1.soldiers,
      b1.food,
    ]);
    expect([a2.maxDurability, a2.soldiers, a2.food]).toEqual([
      b2.maxDurability,
      b2.soldiers,
      b2.food,
    ]);
  });

  it('街道圖連通（4 城＋8 郡＋11 邊之生成樹；INV-11）', () => {
    const state = buildMiniState();
    expect(Object.keys(state.roads)).toHaveLength(11);
  });

  it('seed／overrides 選項生效', () => {
    const withSeed = buildMiniState({ seed: 7 });
    expect(withSeed.meta.seed).toBe(7);

    const withOverride = buildMiniState({
      overrides: { clans: { [CLAN_ALPHA]: { gold: 99999 } } },
    });
    expect(withOverride.clans[CLAN_ALPHA]?.gold).toBe(99999);
    // 覆寫不影響未覆寫欄位／勢力。
    expect(withOverride.clans[CLAN_BETA]?.gold).toBe(1000);
  });

  it('buildMiniState() 推進 30 日無錯（M2-11 DoD）', () => {
    const state = buildMiniState();
    for (let day = 0; day < 30; day += 1) {
      expect(() => advanceDay(state, [])).not.toThrow();
    }
    expect(state.time.day).toBe(MINI_START_DAY + 30);
    expect(validateState(state)).toEqual([]);
  });
});
