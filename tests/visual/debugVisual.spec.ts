// M6-V2 固定視覺 fixture 測試（17 §3.9.3 場景清單驗收；地形/橋樑欄位豁免見 debugVisual.ts 檔頭）。
// 規格：plan/18-roadmap.md M6-V2 列；plan/17-testing.md §3.9.3。
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  buildVisualMapState,
  DEBUG_VISUAL_MAP_ID,
  VISUAL_ANCHOR_CASTLE_ID,
} from '../../src/core/debugVisual';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';

describe('debugVisual：buildVisualMapState（M6-V2 固定視覺 fixture）', () => {
  it('決定論：同一呼叫序列重複 build 兩次，hashState 完全相同', () => {
    const a = buildVisualMapState();
    const b = buildVisualMapState();
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('build 完成的 state 通過 validateState（零違規）', () => {
    const state = buildVisualMapState();
    expect(validateState(state)).toEqual([]);
  });

  it('meta：scenarioId 與 debugMode 正確標記', () => {
    const state = buildVisualMapState();
    expect(state.meta.scenarioId).toBe(DEBUG_VISUAL_MAP_ID);
    expect(state.meta.debugMode).toBe(true);
  });

  it('軍隊：至少 8 支，敵我雙方（攻方／守方）皆有出陣', () => {
    const state = buildVisualMapState();
    const armies = Object.values(state.armies);
    expect(armies.length).toBeGreaterThanOrEqual(8);

    const anchorCastle = state.castles[VISUAL_ANCHOR_CASTLE_ID]!;
    const defenderClanId = anchorCastle.ownerClanId;
    const siege = Object.values(state.sieges).find((s) => s.castleId === VISUAL_ANCHOR_CASTLE_ID)!;
    const attackerClanId = siege.attackerClanId;

    expect(attackerClanId).not.toBe(defenderClanId);
    expect(armies.some((army) => army.clanId === attackerClanId)).toBe(true);
    expect(armies.some((army) => army.clanId === defenderClanId)).toBe(true);
  });

  it('軍隊狀態多樣：至少 2 支 marching（多節點 path、中途進度合法）、至少 1 支 holding、至少 1 支 sieging', () => {
    const state = buildVisualMapState();
    const armies = Object.values(state.armies);

    const marchingMultiNode = armies.filter(
      (army) =>
        army.status === 'marching' &&
        army.path.length > 2 &&
        army.pathCursor > 0 &&
        army.pathCursor < army.path.length - 1 &&
        army.edgeProgressDays > 0 &&
        army.edgeProgressDays < army.edgeCostDays,
    );
    expect(marchingMultiNode.length).toBeGreaterThanOrEqual(2);

    expect(armies.some((army) => army.status === 'holding')).toBe(true);
    expect(armies.some((army) => army.status === 'sieging')).toBe(true);

    // 兵力／士氣有差異（非全部相同值）。
    const soldierCounts = new Set(armies.map((army) => army.soldiers));
    const moraleValues = new Set(armies.map((army) => army.morale));
    expect(soldierCounts.size).toBeGreaterThan(1);
    expect(moraleValues.size).toBeGreaterThan(1);
  });

  it('城池：同時含 tier=main 與 tier=branch', () => {
    const state = buildVisualMapState();
    const castles = Object.values(state.castles);
    expect(castles.some((c) => c.tier === 'main')).toBe(true);
    expect(castles.some((c) => c.tier === 'branch')).toBe(true);
    expect(castles.length).toBeGreaterThanOrEqual(4);
  });

  it('圍城：恰有一場對 VISUAL_ANCHOR_CASTLE_ID 的進行中圍城，attackerArmyIds 與軍隊狀態一致', () => {
    const state = buildVisualMapState();
    const sieges = Object.values(state.sieges);
    const anchorSieges = sieges.filter((s) => s.castleId === VISUAL_ANCHOR_CASTLE_ID);
    expect(anchorSieges).toHaveLength(1);

    const siege = anchorSieges[0]!;
    expect(siege.attackerArmyIds.length).toBeGreaterThan(0);
    for (const armyId of siege.attackerArmyIds) {
      const army = state.armies[armyId];
      expect(army).toBeDefined();
      expect(army!.status).toBe('sieging');
      expect(army!.siegeId).toBe(siege.id);
    }
  });

  it('街道：涵蓋道級 1／2／3 與海路（type=sea）', () => {
    const state = buildVisualMapState();
    const roads = Object.values(state.roads);
    const grades = new Set(roads.map((r) => r.grade));
    expect(grades.has(1)).toBe(true);
    expect(grades.has(2)).toBe(true);
    expect(grades.has(3)).toBe(true);
    expect(roads.some((r) => r.type === 'sea')).toBe(true);
  });

  it('補給警告：至少 1 支軍隊的存糧天數 ≤ BAL.autoReturnFoodDays（既有低糧/autoReturn 門檻）', () => {
    const state = buildVisualMapState();
    const armies = Object.values(state.armies);
    const foodDaysOf = (soldiers: number, food: number): number =>
      food / Math.max(1, Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily));
    const lowFoodArmies = armies.filter(
      (army) => foodDaysOf(army.soldiers, army.food) <= BAL.autoReturnFoodDays,
    );
    expect(lowFoodArmies.length).toBeGreaterThanOrEqual(1);
  });

  it('通知：state.reports 非空，且每筆皆為合法 Report 形狀', () => {
    const state = buildVisualMapState();
    expect(state.reports.length).toBeGreaterThan(0);
    for (const report of state.reports) {
      expect(report.id).toMatch(/^rep\.\d{6}$/);
      expect(report.day).toBe(state.time.day);
      expect(report.read).toBe(false);
      expect(typeof report.event.type).toBe('string');
    }
  });

  it('健壯性：staged state 連續 advanceDay 3 tick 不 throw，且 validateState 仍零違規', () => {
    const state = buildVisualMapState();
    for (let i = 0; i < 3; i += 1) {
      expect(() => advanceDay(state, [])).not.toThrow();
    }
    expect(validateState(state)).toEqual([]);
  });
});
