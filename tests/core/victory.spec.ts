// 勝敗判定（Step 12）單元測試（規格：plan/10-events-and-victory.md §3.8／§5.6；MVP 先行實作）。
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  acknowledgeGameOver,
  destroyClanRemnants,
  dominionClanIds,
  ownsProvinceAll,
  TENKABITO_PROVINCE_ID,
  victorySystem,
} from '../../src/core/systems/victory';
import { advanceDay } from '../../src/core/systems/index';
import { buildEndingVM } from '../../src/core/state/selectors';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import type { GameEvent } from '../../src/core/state/events';
import type { GameState } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, OfficerId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
  PROV_OWARI,
} from '../fixtures/tiny';

/** beta 全部持分轉予 alpha（模擬征服完成的翌日狀態；beta 仍 alive、0 城）。 */
function stripBetaHoldings(state: GameState): void {
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId === CLAN_BETA) {
      castle.ownerClanId = CLAN_ALPHA;
      castle.lordId = null;
      castle.tier = 'branch';
      castle.directControl = true;
    }
  }
  for (const district of Object.values(state.districts)) {
    if (district.ownerClanId === CLAN_BETA) {
      district.ownerClanId = CLAN_ALPHA;
      district.stewardId = null;
    }
  }
  state.meta.territoryChangedToday = true;
}

/** alpha（玩家）全部持分轉予 beta（模擬玩家覆滅）。 */
function stripAlphaHoldings(state: GameState): void {
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId === CLAN_ALPHA) {
      castle.ownerClanId = CLAN_BETA;
      castle.lordId = null;
      castle.tier = 'branch';
      castle.directControl = true;
    }
  }
  for (const district of Object.values(state.districts)) {
    if (district.ownerClanId === CLAN_ALPHA) {
      district.ownerClanId = CLAN_BETA;
      district.stewardId = null;
    }
  }
  state.meta.territoryChangedToday = true;
}

function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('victorySystem（10 §5.6）', () => {
  it('天下統一：領土變動日玩家持有全部城 → 滅亡收尾＋game.victory(unification)', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    const events = victorySystem(state, []);

    // (1) 滅亡收尾：beta 0 城 → destroyClanRemnants
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(state.clans[CLAN_BETA]!.destroyedDay).toBe(state.time.day);
    expect(eventTypes(events)).toContain('clan.destroyed');
    // beta serving 武將全數浪人化
    expect(state.officers[OFF_BETA_LORD]!.status).toBe('ronin');
    expect(state.officers[OFF_BETA_LORD]!.clanId).toBeNull();
    // (3) 統一勝利
    expect(state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
    expect(eventTypes(events)).toContain('game.victory');
    // 收尾後狀態零違規
    expect(validateState(state)).toEqual([]);
  });

  it('玩家敗北：本家覆滅 → game.defeat(no-castle)；EndingVM 動作為 observe/title', () => {
    const state = buildTinyState();
    stripAlphaHoldings(state);
    const events = victorySystem(state, []);

    expect(state.clans[CLAN_ALPHA]!.alive).toBe(false);
    expect(state.meta.gameOver).toEqual({ kind: 'defeat', endingId: 'no-castle' });
    const defeat = events.find((e) => e.type === 'game.defeat');
    expect(defeat).toMatchObject({ clanId: CLAN_ALPHA, condition: 'no-castle' });
    expect(validateState(state)).toEqual([]);

    const vm = buildEndingVM(state);
    expect(vm).not.toBeNull();
    expect(vm!.kind).toBe('defeat');
    expect(vm!.actions).toEqual(['observe', 'title']);
    expect(vm!.clanName).toBe(state.clans[CLAN_ALPHA]!.name);
  });

  it('玩家敗北：defeat.no-heir 旗標優先於 no-castle（10 §3.8.2 順序）', () => {
    const state = buildTinyState();
    state.events.flags['defeat.no-heir'] = 1;
    const events = victorySystem(state, []);
    expect(state.meta.gameOver).toEqual({ kind: 'defeat', endingId: 'no-heir' });
    expect(events.find((e) => e.type === 'game.defeat')).toMatchObject({ condition: 'no-heir' });
  });

  it('gameOver 已成立時整步早退（不重複判定、不再發事件）', () => {
    const state = buildTinyState();
    state.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    stripBetaHoldings(state);
    expect(victorySystem(state, [])).toEqual([]);
    expect(state.clans[CLAN_BETA]!.alive).toBe(true); // 滅亡收尾也不執行
  });

  it('交戰中部隊守門：合戰中的 0 城勢力延後收尾', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    // 佈置一支 beta 殘軍在合戰中（僅需 battleId 非 null 觸發守門）
    const armyId = 'army.000900' as ArmyId;
    state.armies[armyId] = {
      id: armyId,
      clanId: CLAN_BETA,
      leaderId: OFF_BETA_BUSHO,
      deputyIds: [],
      soldiers: 500,
      morale: 80,
      food: 100,
      status: 'engaged',
      mission: 'march',
      originCastleId: CASTLE_B1,
      targetNodeId: null,
      path: [CASTLE_B1],
      pathCursor: 0,
      posNodeId: CASTLE_B1,
      edgeProgressDays: 0,
      embarkDelayDays: 0,
      battleId: 'battle.000901' as BattleId,
      siegeId: null,
      autoReturnDays: null,
      corpsId: null,
      pursuitEligibleArmyIds: [],
    } as never;
    state.officers[OFF_BETA_BUSHO]!.armyId = armyId;
    const events = victorySystem(state, []);
    expect(state.clans[CLAN_BETA]!.alive).toBe(true); // 守門：本 tick 不結算
    expect(eventTypes(events)).not.toContain('clan.destroyed');
    // 統一判定同樣不成立（beta 仍存活且持城為 0——支配圈未含 beta 城？城已全歸 alpha，
    // 但滅亡收尾未跑不影響「持有全部城」判定 → 仍應勝利）
    expect(state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
  });

  it('天下人：條件連續 12 個月成立 → game.victory(tenkabito)；第 6 個月起發進度事件', () => {
    const state = buildTinyState();
    // tiny 無山城國：把 beta 本城改掛 prov.yamashiro 並轉予玩家（外帶 ≥50% 石高）
    stripBetaHoldings(state);
    state.meta.territoryChangedToday = false; // 只測每月分支
    state.events.flags['victory.ack.unification'] = 1; // 阻斷統一判定干擾（已 ack 情境）
    state.castles[CASTLE_B1]!.provinceId = TENKABITO_PROVINCE_ID;
    state.time.dayOfMonth = 1;

    const progressMonths: number[] = [];
    for (let month = 1; month <= BAL.victoryTenkabitoMonths; month += 1) {
      const events = victorySystem(state, []);
      for (const e of events) {
        if (e.type === 'victory.tenkabitoProgress') progressMonths.push(e.months);
      }
      expect(state.events.tenkabitoStreakMonths).toBe(month);
      if (month < BAL.victoryTenkabitoMonths) expect(state.meta.gameOver).toBeNull();
    }
    expect(progressMonths).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'tenkabito' });
  });

  it('天下人：山城國空集（劇本無該國）→ 條件不成立、連續月數歸零', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    state.meta.territoryChangedToday = false;
    state.events.flags['victory.ack.unification'] = 1;
    state.events.tenkabitoStreakMonths = 5;
    state.time.dayOfMonth = 1;
    victorySystem(state, []);
    expect(state.events.tenkabitoStreakMonths).toBe(0);
    expect(state.meta.gameOver).toBeNull();
  });

  it('結局統計：battle.ended 消費與每月 max 快照（10 §3.8.5）', () => {
    const state = buildTinyState();
    state.time.dayOfMonth = 1;
    const battleEnded = (winner: typeof CLAN_ALPHA | null): GameEvent =>
      ({
        type: 'battle.ended',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        battleId: 'battle.000001',
        winnerClanId: winner,
      }) as never;
    victorySystem(state, [battleEnded(CLAN_ALPHA), battleEnded(CLAN_BETA), battleEnded(null)]);
    expect(state.events.stats.battlesFought).toBe(3);
    expect(state.events.stats.battlesWon).toBe(1);
    expect(state.events.stats.maxCastles).toBe(2); // alpha 持 a1/a2
    expect(state.events.stats.maxKokudaka).toBeGreaterThan(0);
  });

  it('acknowledgeGameOver：continue 解除勝利並記 ack；observe 保留敗北', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    victorySystem(state, []);
    expect(state.meta.gameOver?.kind).toBe('victory');
    acknowledgeGameOver(state, 'observe'); // 勝利下 observe 無效
    expect(state.meta.gameOver?.kind).toBe('victory');
    acknowledgeGameOver(state, 'continue');
    expect(state.meta.gameOver).toBeNull();
    expect(state.events.flags['victory.ack.unification']).toBe(1);
    // 已 ack：再有領土變動也不重複判定
    state.meta.territoryChangedToday = true;
    expect(victorySystem(state, [])).toEqual([]);
    expect(state.meta.gameOver).toBeNull();

    const defeated = buildTinyState();
    stripAlphaHoldings(defeated);
    victorySystem(defeated, []);
    acknowledgeGameOver(defeated, 'continue'); // 敗北下 continue 無效
    expect(defeated.meta.gameOver?.kind).toBe('defeat');
    acknowledgeGameOver(defeated, 'observe'); // observe 保留 gameOver
    expect(defeated.meta.gameOver).toEqual({ kind: 'defeat', endingId: 'no-castle' });
  });

  it('ownsProvinceAll／dominionClanIds 邊界', () => {
    const state = buildTinyState();
    expect(ownsProvinceAll(state, CLAN_ALPHA, PROV_OWARI)).toBe(true); // a1/a2 全持
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    expect(ownsProvinceAll(state, CLAN_ALPHA, PROV_OWARI)).toBe(false);
    expect(ownsProvinceAll(state, CLAN_ALPHA, TENKABITO_PROVINCE_ID)).toBe(false); // 空集

    // 支配圈：無協定＝僅本家；vassal（玩家為宗主）併入
    expect([...dominionClanIds(state, CLAN_ALPHA)]).toEqual([CLAN_ALPHA]);
    const key = pairKey(CLAN_ALPHA, CLAN_BETA);
    const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({ kind: 'vassal', startDay: 0, endDay: null, vassalClanId: CLAN_BETA });
    state.diplomacy.rows[key] = row;
    expect(dominionClanIds(state, CLAN_ALPHA).has(CLAN_BETA)).toBe(true);
    // 玩家自身為從屬方 → 不併入對向
    row.pacts[0]!.vassalClanId = CLAN_ALPHA;
    expect(dominionClanIds(state, CLAN_ALPHA).has(CLAN_BETA)).toBe(false);
  });

  it('destroyClanRemnants：外交／具申／攻城殘餘全清（INV-22）', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    const key = pairKey(CLAN_ALPHA, CLAN_BETA);
    const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({ kind: 'alliance', startDay: 0, endDay: 720, vassalClanId: null });
    state.diplomacy.rows[key] = row;
    state.diplomacy.missions.push({
      fromClanId: CLAN_BETA,
      target: 'court',
      officerId: OFF_BETA_BUSHO,
      startDay: 0,
    });
    // 玩家收押的 beta 武將維持 captive；beta 收押的 alpha 武將就地釋放
    const alphaCaptive: OfficerId = OFF_ALPHA_BUSHO;
    state.officers[alphaCaptive]!.status = 'captive';
    state.officers[alphaCaptive]!.capturedByClanId = CLAN_BETA;
    state.officers[alphaCaptive]!.locationCastleId = CASTLE_B1;

    const events: GameEvent[] = [];
    expect(destroyClanRemnants(state, state.clans[CLAN_BETA]!, events)).toBe(true);
    expect(state.diplomacy.rows[key]?.pacts).toEqual([]);
    expect(state.diplomacy.missions).toEqual([]);
    expect(state.officers[alphaCaptive]!.status).toBe('ronin');
    expect(state.officers[alphaCaptive]!.capturedByClanId).toBeNull();
    expect(validateState(state)).toEqual([]);
  });

  it('advanceDay 整合：Step 12 於固定 13 步序內生效（統一於當日 tick 判定）', () => {
    const state = buildTinyState();
    stripBetaHoldings(state);
    const result = advanceDay(state, []);
    expect(state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
    expect(eventTypes(result.events)).toContain('game.victory');
    expect(state.meta.territoryChangedToday).toBe(false); // advanceDay 結尾重置不受影響
  });

  it('buildEndingVM：進行中回傳 null；勝利含統計欄位', () => {
    const state = buildTinyState();
    expect(buildEndingVM(state)).toBeNull();
    stripBetaHoldings(state);
    victorySystem(state, []);
    const vm = buildEndingVM(state);
    expect(vm).toMatchObject({
      kind: 'victory',
      endingId: 'unification',
      actions: ['continue', 'title'],
    });
    expect(vm!.officerCount).toBeGreaterThan(0);
    expect(vm!.elapsedYears).toBe(Math.floor(state.time.day / 360));
  });
});
