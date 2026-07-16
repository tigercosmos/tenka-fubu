// 基礎 selector 驗收測試（M1-10）。
// 規格：plan/02-data-model.md §5.1（衍生值與快取策略：canonical 公式）；
//       plan/18-roadmap.md M1-10（曆法/資源/反向索引之 M1 適用子集）。
//
// 手法：以 tiny 劇本（tests/fixtures/tiny.ts，M1-13/14）之 `buildTinyState()` 為基底，
// 對需要額外實體（受封知行、軍團）的案例另行手工 mutate 已建好的 state（同 invariants.spec.ts
// 慣例），確保每個測試案例互不干擾（`buildTinyState()` 每次呼叫回傳全新獨立物件）。

import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { createDerivedCache } from '../../src/core/state/derivedCache';
import type { Army, Corps, FieldCombat, Siege } from '../../src/core/state/gameState';
import type { ArmyId, CorpsId, SiegeId } from '../../src/core/state/ids';
import {
  adjacency,
  clanKokudaka,
  clanSoldiers,
  corpsCastles,
  developmentPct,
  fiefCapOf,
  getCastleDistricts,
  getClanCastles,
  officerFiefs,
  officerRole,
  provinceCastles,
  season,
  selectMapStaticModel,
  selectMapViewModel,
} from '../../src/core/state/selectors';
import {
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A1Y,
  DIST_A2X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  PROV_OWARI,
  PROV_SURUGA,
  buildTinyState,
} from '../fixtures/tiny';

describe('season（02 §5.1；曆法）', () => {
  it('tiny 開局（1560/4/1）→ spring', () => {
    const state = buildTinyState();
    expect(state.time.month).toBe(4);
    expect(season(state)).toBe('spring');
  });

  it('依月份對映季節（00 §5.1）', () => {
    const state = buildTinyState();
    state.time.month = 7;
    expect(season(state)).toBe('summer');
    state.time.month = 10;
    expect(season(state)).toBe('autumn');
    state.time.month = 1;
    expect(season(state)).toBe('winter');
  });
});

describe('clanKokudaka／clanSoldiers（02 §5.1；資源；tick 內 memo）', () => {
  it('clanKokudaka＝Σ 該勢力所有郡 kokudaka', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(clanKokudaka(state, cache, CLAN_ALPHA)).toBe(20000 * 4); // A1X/A1Y/A2X/A2Y
    expect(clanKokudaka(state, cache, CLAN_BETA)).toBe(20000 * 2); // B1X/B1Y
  });

  it('clanSoldiers＝Σ 自家城 soldiers ＋ Σ 自家部隊 soldiers（tiny 無部隊）', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(clanSoldiers(state, cache, CLAN_ALPHA)).toBe(2000 + 800); // castle.a1 + castle.a2
    expect(clanSoldiers(state, cache, CLAN_BETA)).toBe(2000); // castle.b1
  });

  it('tick 內 memo：同一 cache 內變更 state 不影響已算值；新 cache 才重算', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(clanKokudaka(state, cache, CLAN_ALPHA)).toBe(80000);
    const district = state.districts[DIST_A1X];
    if (!district) throw new Error('fixture 缺 DIST_A1X');
    district.kokudaka = 99999; // 就地變更（模擬同 tick 內其他系統已改動 state）
    expect(clanKokudaka(state, cache, CLAN_ALPHA)).toBe(80000); // 仍命中舊 memo（tick 內不重算）

    const freshCache = createDerivedCache();
    expect(clanKokudaka(state, freshCache, CLAN_ALPHA)).toBe(99999 + 20000 + 20000 + 20000); // 新 cache 重算取新值
  });
});

describe('developmentPct（02 §5.1；純函式）', () => {
  it('公式：round(100*(kokudaka/kokudakaCap + commerce/max(1,commerceCap))/2)', () => {
    const state = buildTinyState();
    const district = state.districts[DIST_A1X];
    if (!district) throw new Error('fixture 缺 DIST_A1X');
    // 20000/40000=0.5；300/600=0.5 → (0.5+0.5)/2*100 = 50
    expect(developmentPct(district)).toBe(50);
  });

  it('commerceCap=0 時分母以 max(1,·) 保底、不除以零', () => {
    const state = buildTinyState();
    const district = state.districts[DIST_A1Y];
    if (!district) throw new Error('fixture 缺 DIST_A1Y');
    district.commerce = 0;
    district.commerceCap = 0;
    district.kokudaka = district.kokudakaCap; // 100%
    expect(() => developmentPct(district)).not.toThrow();
    expect(developmentPct(district)).toBe(50); // (1 + 0/1)/2*100 = 50
  });
});

describe('fiefCapOf（02 §5.1；常數查表＝BAL.fiefMaxByRank）', () => {
  it('依 06 身分六階序逐一對照 BAL.fiefMaxByRank', () => {
    expect(fiefCapOf('kumigashira')).toBe(BAL.fiefMaxByRank[0]);
    expect(fiefCapOf('ashigaru-taisho')).toBe(BAL.fiefMaxByRank[1]);
    expect(fiefCapOf('samurai-taisho')).toBe(BAL.fiefMaxByRank[2]);
    expect(fiefCapOf('busho')).toBe(BAL.fiefMaxByRank[3]);
    expect(fiefCapOf('karo')).toBe(BAL.fiefMaxByRank[4]);
    expect(fiefCapOf('shukuro')).toBe(BAL.fiefMaxByRank[5]);
    expect(fiefCapOf('shukuro')).toBe(4);
  });
});

describe('officerFiefs／officerRole（02 §5.1；反向索引；tick 內 memo）', () => {
  it('officerFiefs：tiny 全部直轄（stewardId=null）時恆為空陣列', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(officerFiefs(state, cache, OFF_ALPHA_BUSHO)).toEqual([]);
  });

  it('officerFiefs：受封知行後反查得該郡', () => {
    const state = buildTinyState();
    const district = state.districts[DIST_A1X];
    if (!district) throw new Error('fixture 缺 DIST_A1X');
    district.stewardId = OFF_ALPHA_BUSHO;
    const cache = createDerivedCache();
    expect(officerFiefs(state, cache, OFF_ALPHA_BUSHO)).toEqual([DIST_A1X]);
  });

  it('officerRole：城主角色（tiny fixture 既有 lordId）', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(officerRole(state, cache, OFF_ALPHA_LORD)).toEqual({
      lordOfCastleId: CASTLE_A1,
      stewardOfDistrictId: null,
      corpsLeaderOfCorpsId: null,
    });
  });

  it('officerRole：領主角色（受封知行）', () => {
    const state = buildTinyState();
    const district = state.districts[DIST_A2X];
    if (!district) throw new Error('fixture 缺 DIST_A2X');
    district.stewardId = OFF_ALPHA_BUSHO;
    const cache = createDerivedCache();
    expect(officerRole(state, cache, OFF_ALPHA_BUSHO)).toEqual({
      lordOfCastleId: null,
      stewardOfDistrictId: DIST_A2X,
      corpsLeaderOfCorpsId: null,
    });
  });

  it('officerRole：軍團長角色（手工建立 Corps）', () => {
    const state = buildTinyState();
    const corpsId = 'corps.000001' as CorpsId;
    const corps: Corps = {
      id: corpsId,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_TAISHO,
      directive: 'hold',
      targetNodeId: null,
      gold: 0,
      createdDay: 0,
    };
    state.corps[corpsId] = corps;
    const castleA2 = state.castles[CASTLE_A2];
    if (!castleA2) throw new Error('fixture 缺 CASTLE_A2');
    castleA2.corpsId = corpsId;

    const cache = createDerivedCache();
    expect(officerRole(state, cache, OFF_ALPHA_TAISHO)).toEqual({
      lordOfCastleId: CASTLE_A2, // 兼任 castle.a2 城主（tiny fixture 既有）
      stewardOfDistrictId: null,
      corpsLeaderOfCorpsId: corpsId,
    });
    expect(corpsCastles(state, cache, corpsId)).toEqual([CASTLE_A2]);
  });

  it('officerRole：非任何役職者三者皆 null', () => {
    const state = buildTinyState();
    const cache = createDerivedCache();
    expect(officerRole(state, cache, OFF_ALPHA_BUSHO)).toEqual({
      lordOfCastleId: null,
      stewardOfDistrictId: null,
      corpsLeaderOfCorpsId: null,
    });
  });
});

describe('provinceCastles（02 §5.1；反向索引；載入時建立永不失效）', () => {
  it('尾張（PROV_OWARI）轄 castle.a1／castle.a2；駿河（PROV_SURUGA）轄 castle.b1', () => {
    const state = buildTinyState();
    expect(provinceCastles(state, PROV_OWARI).sort()).toEqual([CASTLE_A1, CASTLE_A2].sort());
    expect(provinceCastles(state, PROV_SURUGA)).toEqual([CASTLE_B1]);
  });
});

describe('adjacency（02 §5.1；節點鄰接表；無向圖）', () => {
  it('castle.a1 鄰接 dist.a1x／dist.a1y／castle.a2（雙向）', () => {
    const state = buildTinyState();
    const adj = adjacency(state);
    const a1Neighbors = (adj.get(CASTLE_A1) ?? []).map((e) => e.other).sort();
    expect(a1Neighbors).toEqual([CASTLE_A2, DIST_A1X, DIST_A1Y].sort());

    // 無向：dist.a1x 亦鄰接 castle.a1
    const distNeighbors = (adj.get(DIST_A1X) ?? []).map((e) => e.other);
    expect(distNeighbors).toEqual([CASTLE_A1]);
  });

  it('跨勢力前線街道 castle.a2—castle.b1 亦入鄰接表', () => {
    const state = buildTinyState();
    const adj = adjacency(state);
    const a2Neighbors = (adj.get(CASTLE_A2) ?? []).map((e) => e.other);
    expect(a2Neighbors).toContain(CASTLE_B1);
  });
});

describe('getCastleDistricts／getClanCastles（18-roadmap M1-10 範例；不經 cache）', () => {
  it('getCastleDistricts：解析 Castle.districtIds 為完整 District[]', () => {
    const state = buildTinyState();
    const result = getCastleDistricts(state, CASTLE_A1).map((d) => d.id);
    expect(result.sort()).toEqual([DIST_A1X, DIST_A1Y].sort());
  });

  it('getCastleDistricts：不存在之城回傳空陣列', () => {
    const state = buildTinyState();
    expect(getCastleDistricts(state, 'castle.nope' as never)).toEqual([]);
  });

  it('getClanCastles：反查勢力所有城', () => {
    const state = buildTinyState();
    const alphaCastles = getClanCastles(state, CLAN_ALPHA).map((c) => c.id);
    expect(alphaCastles.sort()).toEqual([CASTLE_A1, CASTLE_A2].sort());
    const betaCastles = getClanCastles(state, CLAN_BETA).map((c) => c.id);
    expect(betaCastles).toEqual([CASTLE_B1]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// [M6-V4] selectMapViewModel／selectMapStaticModel 全量補齊驗收
// 規格：plan/04-map-and-movement.md §4.6（canonical）；m6v4-design.md §2.2/§2.3/§2.5。
// ═══════════════════════════════════════════════════════════════════

/** 出陣部隊 fixture（同 tests/core/miniMapModel.spec.ts baseArmy 慣例）。 */
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
    pursuitEligibleArmyIds: [],
    ...overrides,
  };
}

function baseSiege(
  overrides: Partial<Siege> & Pick<Siege, 'id' | 'castleId' | 'attackerClanId'>,
): Siege {
  return {
    attackerArmyIds: [],
    mode: 'encircle',
    startDay: 0,
    interrupted: false,
    betrayalUsed: false,
    ...overrides,
  };
}

function baseFieldCombat(
  overrides: Partial<FieldCombat> & Pick<FieldCombat, 'id' | 'nodeId'>,
): FieldCombat {
  return {
    startedDay: 0,
    sideA: { clanIds: [CLAN_ALPHA], armyIds: [], initialTroops: 0, cumulativeLosses: 0 },
    sideB: { clanIds: [CLAN_BETA], armyIds: [], initialTroops: 0, cumulativeLosses: 0 },
    kassenUsed: false,
    interrupted: false,
    ...overrides,
  };
}

describe('selectMapViewModel（04 §4.6；[M6-V4] 全量補齊）', () => {
  it('day＝state.time.day；analysisMode 恆 none；districtOwner 型別容許 |null（值恆非 null）', () => {
    const state = buildTinyState();
    const model = selectMapViewModel(state);
    expect(model.day).toBe(state.time.day);
    expect(model.analysisMode).toBe('none');
    expect(model.districtOwner[DIST_A1X]).toBe(CLAN_ALPHA);
  });

  it('castles[]：依 id 字典序，逐欄位讀自 Castle；terrainKind 恆 plain；無圍城時 siegeMode/warning 皆 none', () => {
    const state = buildTinyState();
    const model = selectMapViewModel(state);
    expect(model.castles.map((c) => c.id)).toEqual([CASTLE_A1, CASTLE_A2, CASTLE_B1]);
    const a1 = model.castles.find((c) => c.id === CASTLE_A1)!;
    const castleA1 = state.castles[CASTLE_A1]!;
    expect(a1).toEqual({
      id: CASTLE_A1,
      ownerClanId: castleA1.ownerClanId,
      durability: castleA1.durability,
      maxDurability: castleA1.maxDurability,
      tier: castleA1.tier,
      terrainKind: 'plain',
      siegeMode: 'none',
      warning: 'none',
    });
  });

  it('圍城 encircle：該城 siegeMode=encircle、warning=threatened；其餘城不受影響', () => {
    const state = buildTinyState();
    const siegeId = 'siege.000001' as SiegeId;
    state.sieges[siegeId] = baseSiege({
      id: siegeId,
      castleId: CASTLE_B1,
      attackerClanId: CLAN_ALPHA,
      mode: 'encircle',
    });
    const model = selectMapViewModel(state);
    const b1 = model.castles.find((c) => c.id === CASTLE_B1)!;
    expect(b1.siegeMode).toBe('encircle');
    expect(b1.warning).toBe('threatened');
    const a1 = model.castles.find((c) => c.id === CASTLE_A1)!;
    expect(a1.siegeMode).toBe('none');
    expect(a1.warning).toBe('none');
  });

  it('圍城 assault：該城 siegeMode=assault、warning=critical', () => {
    const state = buildTinyState();
    const siegeId = 'siege.000002' as SiegeId;
    state.sieges[siegeId] = baseSiege({
      id: siegeId,
      castleId: CASTLE_A2,
      attackerClanId: CLAN_BETA,
      mode: 'assault',
    });
    const model = selectMapViewModel(state);
    const a2 = model.castles.find((c) => c.id === CASTLE_A2)!;
    expect(a2.siegeMode).toBe('assault');
    expect(a2.warning).toBe('critical');
  });

  it('armies[]：fromNode=posNodeId；行軍中 toNode=path[cursor+1]；抵終點 toNode=null', () => {
    const state = buildTinyState();
    const marchingId = 'army.000001' as ArmyId;
    state.armies[marchingId] = baseArmy({
      id: marchingId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_LORD,
      status: 'marching',
      path: [CASTLE_A1, CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_A1,
      edgeProgressDays: 1,
      edgeCostDays: 2,
    });
    const arrivedId = 'army.000002' as ArmyId;
    state.armies[arrivedId] = baseArmy({
      id: arrivedId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_TAISHO,
      path: [CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_A2,
      edgeProgressDays: 0,
      edgeCostDays: 0,
    });

    const model = selectMapViewModel(state);
    const marching = model.armies.find((a) => a.id === marchingId)!;
    expect(marching.fromNode).toBe(CASTLE_A1);
    expect(marching.toNode).toBe(CASTLE_A2);
    expect(marching.edgeT).toBeCloseTo(0.5);

    const arrived = model.armies.find((a) => a.id === arrivedId)!;
    expect(arrived.fromNode).toBe(CASTLE_A2);
    expect(arrived.toNode).toBeNull();
    expect(arrived.edgeT).toBe(0); // edgeCostDays<=0 → 0
  });

  it('armies[]：edgeT 於 edgeProgressDays>edgeCostDays 時 clamp 於 1（防禦：資料異常不外插）', () => {
    const state = buildTinyState();
    const armyId = 'army.000003' as ArmyId;
    state.armies[armyId] = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_LORD,
      path: [CASTLE_A1, CASTLE_A2],
      pathCursor: 0,
      posNodeId: CASTLE_A1,
      edgeProgressDays: 999,
      edgeCostDays: 2,
    });
    const model = selectMapViewModel(state);
    expect(model.armies.find((a) => a.id === armyId)!.edgeT).toBe(1);
  });

  it('armies[]：foodDays 依 BAL.fieldFoodPerSoldierDaily 推導（同 military.ts autoReturn 判定公式）', () => {
    const state = buildTinyState();
    const armyId = 'army.000004' as ArmyId;
    const soldiers = 300;
    const food = 90;
    state.armies[armyId] = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_LORD,
      soldiers,
      food,
    });
    const expectedFoodDays = food / Math.max(1, Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily));
    const model = selectMapViewModel(state);
    expect(model.armies.find((a) => a.id === armyId)!.foodDays).toBeCloseTo(expectedFoodDays);
  });

  it('armies[]：soldiers=0 時 foodDays=0（防禦，避免除以查表下限造成非零假象）', () => {
    const state = buildTinyState();
    const armyId = 'army.000005' as ArmyId;
    state.armies[armyId] = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_LORD,
      soldiers: 0,
      food: 50,
    });
    const model = selectMapViewModel(state);
    expect(model.armies.find((a) => a.id === armyId)!.foodDays).toBe(0);
  });

  it('armies[]：corps＝corpsId!==null；status/mission 直通', () => {
    const state = buildTinyState();
    const armyId = 'army.000006' as ArmyId;
    state.armies[armyId] = baseArmy({
      id: armyId,
      clanId: CLAN_ALPHA,
      leaderId: OFF_ALPHA_LORD,
      corpsId: 'corps.000001' as CorpsId,
      status: 'sieging',
      mission: 'conquer',
    });
    const model = selectMapViewModel(state);
    const a = model.armies.find((x) => x.id === armyId)!;
    expect(a.corps).toBe(true);
    expect(a.status).toBe('sieging');
    expect(a.mission).toBe('conquer');
  });

  it('sieges[]：pos = state.castles[castleId].pos', () => {
    const state = buildTinyState();
    const siegeId = 'siege.000003' as SiegeId;
    state.sieges[siegeId] = baseSiege({
      id: siegeId,
      castleId: CASTLE_B1,
      attackerClanId: CLAN_ALPHA,
      mode: 'assault',
    });
    const model = selectMapViewModel(state);
    expect(model.sieges).toEqual([
      { id: siegeId, pos: state.castles[CASTLE_B1]!.pos, mode: 'assault' },
    ]);
  });

  it('battles[]：FieldCombat→{kind:field}，Siege→{kind:siege}，nodeOrEdgeId 正確', () => {
    const state = buildTinyState();
    const fcId = 'fc.a1-1';
    state.fieldCombats[fcId] = baseFieldCombat({ id: fcId, nodeId: CASTLE_A1 });
    const siegeId = 'siege.000004' as SiegeId;
    state.sieges[siegeId] = baseSiege({
      id: siegeId,
      castleId: CASTLE_B1,
      attackerClanId: CLAN_ALPHA,
    });

    const model = selectMapViewModel(state);
    expect(model.battles).toEqual(
      expect.arrayContaining([
        { nodeOrEdgeId: CASTLE_A1, kind: 'field' },
        { nodeOrEdgeId: CASTLE_B1, kind: 'siege' },
      ]),
    );
    expect(model.battles).toHaveLength(2);
  });

  it('決定論：同 state 呼叫兩次結構深相等；castles/armies 依 id 字典序', () => {
    const state = buildTinyState();
    state.armies['army.000007' as ArmyId] = baseArmy({
      id: 'army.000007' as ArmyId,
      clanId: CLAN_BETA,
      leaderId: OFF_ALPHA_BUSHO,
    });
    const m1 = selectMapViewModel(state);
    const m2 = selectMapViewModel(state);
    expect(m1).toEqual(m2);
    expect(m1.castles.map((c) => c.id)).toEqual([...m1.castles.map((c) => c.id)].sort());
    expect(m1.armies.map((a) => a.id)).toEqual([...m1.armies.map((a) => a.id)].sort());
  });
});

describe('selectMapStaticModel（04 §4.6；[M6-V4] names／provinceLabelPos）', () => {
  it('names 含城／郡／勢力／省名', () => {
    const state = buildTinyState();
    const model = selectMapStaticModel(state);
    expect(model.names[CASTLE_A1]).toBe(state.castles[CASTLE_A1]!.name);
    expect(model.names[DIST_A1X]).toBe(state.districts[DIST_A1X]!.name);
    expect(model.names[CLAN_ALPHA]).toBe(state.clans[CLAN_ALPHA]!.name);
    expect(model.names[PROV_OWARI]).toBe(state.provinces[PROV_OWARI]!.name);
  });

  it('provinceLabelPos 對應 province.labelPos', () => {
    const state = buildTinyState();
    const model = selectMapStaticModel(state);
    expect(model.provinceLabelPos[PROV_OWARI]).toEqual(state.provinces[PROV_OWARI]!.labelPos);
    expect(model.provinceLabelPos[PROV_SURUGA]).toEqual(state.provinces[PROV_SURUGA]!.labelPos);
  });

  it('castleTier 保留（命中半徑用）', () => {
    const state = buildTinyState();
    const model = selectMapStaticModel(state);
    expect(model.castleTier[CASTLE_A1]).toBe(state.castles[CASTLE_A1]!.tier);
    expect(model.castleTier[CASTLE_A2]).toBe(state.castles[CASTLE_A2]!.tier);
  });

  it('graph：tiny 劇本自身街道無 name/waypoints（roadDisplay 只對真實 s1560 roads.json id 命中，不洩漏未命中 edge）', () => {
    const state = buildTinyState();
    const model = selectMapStaticModel(state);
    for (const edge of model.graph.edges.values()) {
      expect(edge.name).toBeUndefined();
      expect(edge.waypoints).toBeUndefined();
    }
  });

  it('graph：真實 s1560 劇本（roadDisplayLookup 直讀 roads.json）— 已知具名街道的 name 被保留', async () => {
    const { loadS1560Scenario } = await import('../../src/data/scenarios/s1560/index');
    const { buildGameStateFromScenario } = await import('../../src/core/state/builder');
    const bundle = await loadS1560Scenario();
    const realState = buildGameStateFromScenario(bundle, {
      appVersion: '0.0.0-test',
      seed: 1,
      playerClanId: 'clan.oda' as never,
      difficulty: 'normal',
      regions: ['tokai'],
    });
    const model = selectMapStaticModel(realState);
    // road.kiyosu-nagoya-01 在 src/data/scenarios/s1560/roads.json 中標示 name='東海道'（見資料檔）。
    const edge = model.graph.edges.get('road.kiyosu-nagoya-01' as never);
    expect(edge?.name).toBe('東海道');
  });
});
