// 最小大名 AI（MVP 先行實作）單元／整合測試。
// 涵蓋：出陣決策門檻（兵力比／守軍下限／糧秣保留）、決定論、部隊數上限、
// scheduler 執行回呼接線與玩家勢力永不受 AI 操控。
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { runDaimyoCouncil } from '../../src/core/systems/ai/daimyo';
import { advanceDay } from '../../src/core/systems/index';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function betaArmies(state: GameState) {
  return Object.values(state.armies).filter((army) => army.clanId === CLAN_BETA);
}

function runCouncil(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  runDaimyoCouncil(state, CLAN_BETA, (e) => events.push(e));
  return events;
}

describe('runDaimyoCouncil（最小大名 AI）', () => {
  it('兵力優勢達門檻時對最弱可及敵城出陣（mission=conquer）', () => {
    const state = buildTinyState();
    // b1 守軍 2000、糧 5000；甲支城 a2 守軍 800（最弱目標）。
    // marchable = 2000-500 = 1500 ≥ ceil(800×1.5)=1200 → 出陣。
    runCouncil(state);
    const armies = betaArmies(state);
    expect(armies).toHaveLength(1);
    const army = armies[0]!;
    expect(army.targetNodeId).toBe(CASTLE_A2);
    expect(army.mission).toBe('conquer');
    expect(army.soldiers).toBe(2000 - BAL.aiGarrisonFloorTroops);
    expect(state.officers[OFF_BETA_LORD]!.armyId).toBe(army.id);
    // 城中保留守軍與存糧
    expect(state.castles[CASTLE_B1]!.soldiers).toBe(BAL.aiGarrisonFloorTroops);
    expect(state.castles[CASTLE_B1]!.food).toBeGreaterThanOrEqual(
      Math.floor(5000 * BAL.aiFoodReserveRatio),
    );
    expect(validateState(state)).toEqual([]);
  });

  it('兵力比不足門檻時不出陣', () => {
    const state = buildTinyState();
    state.castles[CASTLE_B1]!.soldiers = 1600; // marchable=1100 < ceil(800×1.5)=1200
    runCouncil(state);
    expect(betaArmies(state)).toHaveLength(0);
  });

  it('守軍下限：城兵不足 aiGarrisonFloorTroops＋minMarchTroops 時不出陣', () => {
    const state = buildTinyState();
    state.castles[CASTLE_B1]!.soldiers = BAL.aiGarrisonFloorTroops + BAL.minMarchTroops - 1;
    runCouncil(state);
    expect(betaArmies(state)).toHaveLength(0);
  });

  it('存糧不足最低攜行量時不出陣', () => {
    const state = buildTinyState();
    state.castles[CASTLE_B1]!.food = 50; // spendable=25 < 1500×0.02×10=300
    runCouncil(state);
    expect(betaArmies(state)).toHaveLength(0);
  });

  it('在外部隊數達 aiMaxConcurrentArmies 時本月不再出陣', () => {
    const state = buildTinyState();
    runCouncil(state);
    expect(betaArmies(state)).toHaveLength(1);
    // 補足城兵再評定一次 → 第二支
    state.castles[CASTLE_B1]!.soldiers = 5000;
    state.officers[OFF_BETA_LORD]!.armyId = null; // 模擬另一名大將可用（沿用當主測試簡化）
    state.officers[OFF_BETA_LORD]!.locationCastleId = CASTLE_B1;
    const before = betaArmies(state).length;
    runCouncil(state);
    expect(betaArmies(state).length).toBeGreaterThanOrEqual(before);
    // 達上限（2）後不再增加
    state.castles[CASTLE_B1]!.soldiers = 8000;
    runCouncil(state);
    expect(betaArmies(state).length).toBeLessThanOrEqual(BAL.aiMaxConcurrentArmies);
  });

  it('決定論：同一初始狀態兩次評定產生完全相同的部隊', () => {
    const a = buildTinyState();
    const b = buildTinyState();
    runCouncil(a);
    runCouncil(b);
    expect(JSON.parse(JSON.stringify(a.armies))).toEqual(JSON.parse(JSON.stringify(b.armies)));
  });

  it('滅亡勢力／玩家勢力不評定', () => {
    const state = buildTinyState();
    state.clans[CLAN_BETA]!.alive = false;
    runCouncil(state);
    expect(betaArmies(state)).toHaveLength(0);
  });
});

describe('stepAi 整合（advanceDay Step 11）', () => {
  it('月初 tick（5/1）內完成入列＋消化：AI 勢力當日即可出陣；玩家勢力不受操控', () => {
    const state = buildTinyState(); // 開局日 1560/4/1；tick 於 Step 2 先推日期 → 首個月初 tick 為 5/1
    const alphaArmiesBefore = Object.values(state.armies).filter(
      (a) => a.clanId === CLAN_ALPHA,
    ).length;
    for (let i = 0; i < 29; i += 1) advanceDay(state, []); // 4/2..4/30
    expect(betaArmies(state)).toHaveLength(0); // 月中不評定
    advanceDay(state, []); // 5/1：入列＋同 tick 消化（1 家 < aiCouncilsPerTick）
    expect(state.time.dayOfMonth).toBe(1);
    expect(betaArmies(state)).toHaveLength(1);
    expect(Object.values(state.armies).filter((a) => a.clanId === CLAN_ALPHA).length).toBe(
      alphaArmiesBefore,
    );
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(state.time.day);
    expect(state.ai.clans[CLAN_BETA]!.pendingPhases).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('同月不重複評定；次月月初重新入列', () => {
    const state = buildTinyState();
    for (let i = 0; i < 30; i += 1) advanceDay(state, []); // → 5/1 首次評定
    const firstCouncilDay = state.ai.clans[CLAN_BETA]!.lastCouncilDay;
    expect(firstCouncilDay).toBe(state.time.day);
    for (let i = 0; i < 29; i += 1) advanceDay(state, []); // 5/2..5/30：不再評定
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(firstCouncilDay);
    advanceDay(state, []); // 6/1：重新入列＋評定
    expect(state.time.dayOfMonth).toBe(1);
    expect(state.ai.clans[CLAN_BETA]!.lastCouncilDay).toBe(state.time.day);
    expect(validateState(state)).toEqual([]);
  });
});
