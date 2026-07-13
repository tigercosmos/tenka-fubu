// 合戰子迴圈契約驗收測試（M1-26）。
// 規格：plan/03-game-loop.md §3.7.2（Battle 子狀態機／原子寫回契約，見同檔 §8 M1-26 疑義裁決）；
//       plan/07-military.md §3.9 規則 3（時限到期 tiebreak，§8 D9：無平手）；
//       plan/18-roadmap.md M1-26（驗收：寫回原子性、重放 bit-exact——以 stub 結果驗證契約形狀）。

import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CoreError } from '../../src/core/errors';
import { advanceBattleTick } from '../../src/core/systems/battle';
import { stateHash } from '../../src/core/state/serialize';
import type { Army, BattleState, BattleUnit, GameState } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, ClanId, OfficerId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../helpers/loopState';

const ENEMY_CLAN = 'clan.enemy' as ClanId;
const BATTLE_ID = 'battle.000001' as BattleId;
const ATK_ARMY = 'army.000001' as ArmyId;
const DEF_ARMY = 'army.000002' as ArmyId;

/** 建立一支最小可用 Army（欄位依 02 §4.8 逐字對齊；本測試不觸及尋路/兵站欄位，取任意合法佔位值）。 */
function makeArmy(id: ArmyId, clanId: ClanId, soldiers: number, morale: number): Army {
  return {
    id,
    clanId,
    leaderId: `officer.${id}-leader` as OfficerId,
    deputyIds: [],
    soldiers,
    initialTroops: soldiers,
    food: 100,
    morale,
    status: 'engaged',
    mission: 'conquer',
    originCastleId: TEST_CASTLE,
    targetNodeId: TEST_CASTLE,
    path: [TEST_CASTLE],
    pathCursor: 0,
    posNodeId: TEST_CASTLE,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    battleId: BATTLE_ID,
    siegeId: null,
    autoReturn: true,
    corpsId: null,
    pursuitEligibleArmyIds: [],
  };
}

/** 建立一個 BattleUnit（troops/morale 可與對應 Army 的 pre-battle 值不同，模擬「戰鬥已使兵力變動」。 */
function makeUnit(armyId: ArmyId, side: 'attacker' | 'defender', troops: number): BattleUnit {
  return {
    id: `bu.${armyId}`,
    armyId,
    side,
    generalId: `officer.${armyId}-leader` as OfficerId,
    troops,
    battleInitialTroops: 1000,
    morale: 60,
    jinId: side === 'attacker' ? 'jin.0-1' : 'jin.4-1',
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: true,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
  };
}

/** 建立含一場進行中合戰（tick=0）的最小 GameState：攻方 900 兵、守方 500 兵（攻方應判勝）。 */
function buildFixture(): GameState {
  const state = makeLoopTestState({ day: 100 });
  state.clans[ENEMY_CLAN] = {
    id: ENEMY_CLAN,
    name: '敵家',
    leaderId: 'officer.enemy-leader' as OfficerId,
    homeCastleId: TEST_CASTLE,
    gold: 0,
    prestige: 0,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 1,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  };
  state.armies[ATK_ARMY] = makeArmy(ATK_ARMY, TEST_CLAN, 1000, 70);
  state.armies[DEF_ARMY] = makeArmy(DEF_ARMY, ENEMY_CLAN, 1000, 70);

  const bs: BattleState = {
    id: BATTLE_ID,
    fieldCombatId: 'fc.test-100',
    nodeId: TEST_CASTLE,
    terrain: 'plain',
    attackerClanId: TEST_CLAN,
    defenderClanId: ENEMY_CLAN,
    jins: [],
    edges: [],
    units: [makeUnit(ATK_ARMY, 'attacker', 900), makeUnit(DEF_ARMY, 'defender', 500)],
    tick: 0,
    saihai: { attacker: 5, defender: 5 },
    honjinFallenTick: null,
    result: null,
  };
  state.battles[BATTLE_ID] = bs;

  return state;
}

/** 呼叫 advanceBattleTick 直到 resolved（上限 BAL.kassenMaxTicks 次，契約保證恰於此上限內判定）。 */
function runToResolution(state: GameState): void {
  for (let i = 0; i < BAL.kassenMaxTicks; i += 1) {
    const r = advanceBattleTick(state, BATTLE_ID);
    if (r.resolved) return;
  }
}

describe('advanceBattleTick 凍結（03 §3.7.2：resolved 前只動 bs.tick）', () => {
  it('未達 kassenMaxTicks 前，state.armies／deferredEvents 完全不變，僅 bs.tick 遞增', () => {
    const state = buildFixture();
    const preAtk = { ...state.armies[ATK_ARMY]! };
    const preDef = { ...state.armies[DEF_ARMY]! };

    for (let i = 1; i < BAL.kassenMaxTicks; i += 1) {
      const result = advanceBattleTick(state, BATTLE_ID);
      expect(result).toEqual({ battleId: BATTLE_ID, tick: i, resolved: false });
      expect(state.battles[BATTLE_ID]!.result).toBeNull();
    }

    // 凍結期間部隊真身（soldiers/morale）與 unit.troops（900/500，異於 army 初始 1000）不同步。
    expect(state.armies[ATK_ARMY]).toEqual(preAtk);
    expect(state.armies[DEF_ARMY]).toEqual(preDef);
    expect(state.meta.deferredEvents).toEqual([]);
  });

  it('已 resolved 的合戰再次呼叫 advanceBattleTick 擲 CoreError（缺陷偵測，01 §3.10.1）', () => {
    const state = buildFixture();
    runToResolution(state);
    expect(state.battles[BATTLE_ID]!.result).not.toBeNull();
    expect(() => advanceBattleTick(state, BATTLE_ID)).toThrow(CoreError);
  });

  it('不存在的 battleId 擲 CoreError', () => {
    const state = buildFixture();
    expect(() => advanceBattleTick(state, 'battle.000099' as BattleId)).toThrow(CoreError);
  });
});

describe('advanceBattleTick 原子寫回（03 §3.7.2；07 §3.9 規則 3 tiebreak／§8 D9 無平手）', () => {
  it('達 kassenMaxTicks 時一次性寫回：bs.result／state.armies／battle.ended 三者同時到位', () => {
    const state = buildFixture();
    runToResolution(state);

    const bs = state.battles[BATTLE_ID]!;
    expect(bs.tick).toBe(BAL.kassenMaxTicks);
    expect(bs.result).not.toBeNull();
    // 攻方 900 vs 守方 500×1.05=525 → 攻方勝（07 §3.9 規則 3）。
    expect(bs.result).toEqual({
      winnerSide: 'attacker',
      endTick: BAL.kassenMaxTicks,
      attackerLosses: 100, // battleInitialTroops(1000) − troops(900)
      defenderLosses: 500, // battleInitialTroops(1000) − troops(500)
      aweLevel: 'medium',
    });

    // 原子寫回：state.armies 依 BattleUnit 現值同步（soldiers/morale），與 tick 前快照不同。
    expect(state.armies[ATK_ARMY]!.soldiers).toBe(900);
    expect(state.armies[ATK_ARMY]!.morale).toBe(60 + BAL.moraleVictoryGain);
    expect(state.armies[DEF_ARMY]!.soldiers).toBe(500);
    expect(state.armies[DEF_ARMY]!.morale).toBe(60 - BAL.moraleDefeatLoss);

    // battle.ended 併入 state.meta.deferredEvents（下一 tick Step 2 併入事件流，見 03 §3.7.2）。
    expect(state.meta.deferredEvents).toEqual([
      {
        type: 'awe.triggered',
        day: 100,
        clanIds: [TEST_CLAN, ENEMY_CLAN],
        sourceBattleId: BATTLE_ID,
        clanId: TEST_CLAN,
        level: 'medium',
        flippedDistrictIds: [],
        affectedCastleIds: [],
      },
      {
        type: 'battle.ended',
        day: 100,
        clanIds: [TEST_CLAN, ENEMY_CLAN],
        battleId: BATTLE_ID,
        winnerClanId: TEST_CLAN,
        aweLevel: 'medium',
        attackerLosses: 100,
        defenderLosses: 500,
        nodeId: TEST_CASTLE,
        attackerClanId: TEST_CLAN,
        defenderClanId: ENEMY_CLAN,
      },
    ]);
  });

  it('守方兵力優勢未達 tiebreak 倍率門檻時攻方仍判勝（規則 3 只看攻方是否達 defender×1.05）', () => {
    const state = buildFixture();
    // 守方 900、攻方 901：901 < 900×1.05=945 → 守方勝。
    state.battles[BATTLE_ID]!.units = [
      makeUnit(ATK_ARMY, 'attacker', 901),
      makeUnit(DEF_ARMY, 'defender', 900),
    ];
    runToResolution(state);
    expect(state.battles[BATTLE_ID]!.result!.winnerSide).toBe('defender');
  });

  it('攻方達 tiebreak 倍率門檻時攻方判勝', () => {
    const state = buildFixture();
    // 攻方 1000、守方 900：1000 ≥ 900×1.05=945 → 攻方勝。
    state.battles[BATTLE_ID]!.units = [
      makeUnit(ATK_ARMY, 'attacker', 1000),
      makeUnit(DEF_ARMY, 'defender', 900),
    ];
    runToResolution(state);
    expect(state.battles[BATTLE_ID]!.result!.winnerSide).toBe('attacker');
  });
});

describe('重放 bit-exact（18-roadmap.md M1-26 驗收；02 §5.4 stateHash）', () => {
  it('相同初始 fixture 各自跑滿至 resolved，最終 stateHash 完全相同', () => {
    const stateA = buildFixture();
    const stateB = buildFixture();
    runToResolution(stateA);
    runToResolution(stateB);
    expect(stateHash(stateA)).toBe(stateHash(stateB));
  });

  it('逐 tick 的 BattleTickResult 序列（含 resolved 時點）bit-exact 相同', () => {
    const stateA = buildFixture();
    const stateB = buildFixture();
    const seqA = [];
    const seqB = [];
    for (let i = 0; i < BAL.kassenMaxTicks; i += 1) {
      seqA.push(advanceBattleTick(stateA, BATTLE_ID));
    }
    for (let i = 0; i < BAL.kassenMaxTicks; i += 1) {
      seqB.push(advanceBattleTick(stateB, BATTLE_ID));
    }
    expect(seqA).toEqual(seqB);
  });
});
