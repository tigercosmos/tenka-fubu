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
import type { Corps } from '../../src/core/state/gameState';
import type { CorpsId } from '../../src/core/state/ids';
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
