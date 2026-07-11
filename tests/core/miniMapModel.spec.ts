// selectMiniMapModel 驗收測試（M2-18；12-ui-components.md §3.2.12／§4／§5.5）。
// 規格：plan/04-map-and-movement.md §3.4.2（部隊世界座標＝edgeProgressDays/edgeCostDays 線性內插）。

import { describe, expect, it } from 'vitest';
import type { Army } from '../../src/core/state/gameState';
import type { ArmyId } from '../../src/core/state/ids';
import { selectMiniMapModel } from '../../src/core/state/selectors';
import {
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  buildTinyState,
} from '../fixtures/tiny';

describe('selectMiniMapModel（12 §3.2.12／§4）', () => {
  it('castles：每城一筆、位置與 owner colorIndex 相符，依 id 字典序排列', () => {
    const state = buildTinyState();
    const model = selectMiniMapModel(state);
    // castle.a1 < castle.a2 < castle.b1（字典序）
    expect(model.castles).toEqual([
      { x: 1000, y: 1000, colorIndex: 0 }, // CASTLE_A1，CLAN_ALPHA colorIndex=0
      { x: 1200, y: 1100, colorIndex: 0 }, // CASTLE_A2，CLAN_ALPHA
      { x: 1600, y: 1300, colorIndex: 1 }, // CASTLE_B1，CLAN_BETA colorIndex=1
    ]);
  });

  it('armies：出陣中部隊為空陣列時（tiny 開局無出陣部隊）', () => {
    const state = buildTinyState();
    expect(selectMiniMapModel(state).armies).toEqual([]);
  });

  it('outline：載入 japan-outline.json，至少一個多邊形、每點皆為 {x,y}；快取同一參考', () => {
    const state = buildTinyState();
    const m1 = selectMiniMapModel(state);
    expect(m1.outline.length).toBeGreaterThan(0);
    expect(m1.outline[0]!.length).toBeGreaterThan(0);
    const firstPoint = m1.outline[0]![0]!;
    expect(typeof firstPoint.x).toBe('number');
    expect(typeof firstPoint.y).toBe('number');

    const m2 = selectMiniMapModel(state);
    expect(m2.outline).toBe(m1.outline); // 快取，不重複解析 zod
  });

  it('version＝state.time.day（歸屬變動必發生於某日 tick 內，日變動為其保守超集）', () => {
    const state = buildTinyState();
    expect(selectMiniMapModel(state).version).toBe(state.time.day);
    state.time.day = 42;
    expect(selectMiniMapModel(state).version).toBe(42);
  });

  function baseArmy(overrides: Partial<Army> & Pick<Army, 'id' | 'clanId'>): Army {
    return {
      leaderId: overrides.leaderId ?? ('off.x' as never),
      deputyIds: [],
      soldiers: 500,
      initialTroops: 500,
      food: 100,
      morale: 80,
      status: 'holding',
      mission: 'march',
      originCastleId: CASTLE_A1,
      targetNodeId: CASTLE_A1,
      path: [CASTLE_A1],
      pathCursor: 0,
      posNodeId: CASTLE_A1,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      battleId: null,
      siegeId: null,
      autoReturn: true,
      corpsId: null,
      ...overrides,
    };
  }

  it('已抵達節點（edgeCostDays=0）之部隊直接回傳 posNodeId 座標', () => {
    const state = buildTinyState();
    const armyId = 'army.000001' as ArmyId;
    const army = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: state.castles[CASTLE_A1]!.lordId!,
      posNodeId: CASTLE_A1,
      path: [CASTLE_A1],
      pathCursor: 0,
      edgeProgressDays: 0,
      edgeCostDays: 0,
    });
    state.armies[armyId] = army;

    const model = selectMiniMapModel(state);
    expect(model.armies).toEqual([{ x: 1000, y: 1000, colorIndex: 0 }]);
  });

  it('行軍中部隊依 edgeProgressDays/edgeCostDays 線性內插（04 §3.4.2）', () => {
    const state = buildTinyState();
    const armyId = 'army.000002' as ArmyId;
    // B1=(1600,1300) → A2=(1200,1100)；t=1/2=0.5 → 中點 (1400,1200)。
    const army = baseArmy({
      id: armyId,
      clanId: CLAN_BETA,
      leaderId: state.castles[CASTLE_B1]!.lordId!,
      status: 'marching',
      originCastleId: CASTLE_B1,
      targetNodeId: CASTLE_A2,
      path: [CASTLE_B1, CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_B1,
      edgeProgressDays: 1,
      edgeCostDays: 2,
    });
    state.armies[armyId] = army;

    const model = selectMiniMapModel(state);
    expect(model.armies).toEqual([{ x: 1400, y: 1200, colorIndex: 1 }]);
  });

  it('edgeProgressDays/edgeCostDays 比例夾限於 [0,1]（防禦：資料異常時不外插）', () => {
    const state = buildTinyState();
    const armyId = 'army.000003' as ArmyId;
    const army = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: state.castles[CASTLE_A1]!.lordId!,
      path: [CASTLE_A1, CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_A1,
      edgeProgressDays: 999, // 異常值：遠超過 edgeCostDays
      edgeCostDays: 2,
    });
    state.armies[armyId] = army;

    const model = selectMiniMapModel(state);
    expect(model.armies).toEqual([{ x: 1200, y: 1100, colorIndex: 0 }]); // 夾限於終點 A2，不外插
  });

  it('查無 clan（colorIndex 查表失敗）時 colorIndex 為 null', () => {
    const state = buildTinyState();
    const armyId = 'army.000004' as ArmyId;
    const ghostClan = 'clan.ghost' as typeof CLAN_ALPHA;
    const army = baseArmy({
      id: armyId,
      clanId: ghostClan,
      leaderId: state.castles[CASTLE_A1]!.lordId!,
    });
    state.armies[armyId] = army;

    const model = selectMiniMapModel(state);
    expect(model.armies).toEqual([{ x: 1000, y: 1000, colorIndex: null }]);
  });
});
