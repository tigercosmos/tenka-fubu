import { describe, expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems/index';
import { validateState } from '../../src/core/state/invariants';
import type { GameState } from '../../src/core/state/gameState';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function betaArmies(state: GameState) {
  return Object.values(state.armies).filter((army) => army.clanId === CLAN_BETA);
}

describe('stepAi 整合（advanceDay Step 11）', () => {
  it('M7 月初依序攤平四階段，玩家部隊不受大名評定操控', () => {
    const state = buildTinyState(); // 開局日 1560/4/1；tick 於 Step 2 先推日期 → 首個月初 tick 為 5/1
    state.ai.clans[CLAN_BETA]!.councilOffset = 0;
    const alphaArmiesBefore = Object.values(state.armies).filter(
      (a) => a.clanId === CLAN_ALPHA,
    ).length;
    for (let i = 0; i < 29; i += 1) advanceDay(state, []); // 4/2..4/30
    expect(betaArmies(state)).toHaveLength(0); // 月中不評定
    advanceDay(state, []); // 5/1：入列＋同 tick 消化（1 家 < aiCouncilsPerTick）
    expect(state.time.dayOfMonth).toBe(1);
    expect(betaArmies(state)).toHaveLength(0);
    expect(state.ai.clans[CLAN_BETA]!.threatCache).not.toBeNull();
    expect(state.ai.clans[CLAN_BETA]!.pendingPhases).toEqual(['military', 'domestic', 'diplomacy']);
    expect(Object.values(state.armies).filter((a) => a.clanId === CLAN_ALPHA).length).toBe(
      alphaArmiesBefore,
    );
    for (let i = 0; i < 3; i++) advanceDay(state, []);
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(state.time.day);
    expect(state.ai.clans[CLAN_BETA]!.pendingPhases).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('同月不重複評定；次月月初重新入列', () => {
    const state = buildTinyState();
    state.ai.clans[CLAN_BETA]!.councilOffset = 0;
    for (let i = 0; i < 33; i += 1) advanceDay(state, []); // → 5/4 首次四階段完成
    const firstCouncilDay = state.ai.clans[CLAN_BETA]!.lastCouncilDay;
    expect(firstCouncilDay).toBe(state.time.day);
    for (let i = 0; i < 26; i += 1) advanceDay(state, []); // 5/5..5/30：不再評定
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(firstCouncilDay);
    advanceDay(state, []); // 6/1：重新入列＋評定
    expect(state.time.dayOfMonth).toBe(1);
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(firstCouncilDay);
    for (let i = 0; i < 3; i++) advanceDay(state, []);
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(state.time.day);
    expect(validateState(state)).toEqual([]);
  });
});
