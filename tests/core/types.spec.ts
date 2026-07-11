// 型別基座窮舉/守門測試（M1-1/M1-2/M1-3 驗收）。
// 規格：plan/02-data-model.md §4.18（Command）／§4.19（GameEvent）／§3.2（ID regex+guard）／§3.3（enum VALUES）。
//
// 手法：以 `Record<UnionType, true>` 字面量強制編譯期窮舉（缺鍵/多鍵皆 tsc 紅燈），
// 再以 Object.keys().length 斷言與 02 表列數一致（runtime）。表列數為常數並註明 02 §。

import { describe, it, expect } from 'vitest';
import {
  ID_PATTERN,
  isClanId,
  isCastleId,
  isDistrictId,
  isArmyId,
  isMapNodeId,
} from '../../src/core/state/ids';
import type { CommandType } from '../../src/core/commands/types';
import type { GameEventType } from '../../src/core/state/events';
import {
  ARMY_STATUS_VALUES,
  COURT_RANK_VALUES,
  PROPOSAL_KIND_VALUES,
  RANK_VALUES,
  REGION_VALUES,
} from '../../src/core/state/enums';

// —— 02 §4.18 Command 現行列數（2026-07-11；勘誤台帳 E-27/E-28/E-32 消化後） ——
const COMMAND_TYPE_COUNT = 46;
// —— 03 §3.9／§4.2 專有 debug 指令（debugSkipDays／debugGrant；02 §4.18 未收，見 03 §8-D14） ——
const DEBUG_COMMAND_TYPE_COUNT = 2;
// —— 02 §4.19 GameEvent 現行列數（2026-07-11；含六輪/七輪裁決收錄後） ——
const GAME_EVENT_TYPE_COUNT = 68;
// —— 03 §4.3 迴圈機制專有事件（command.rejected；02 §4.19 不模型化 core 迴圈拒絕，見 03 §8-D14） ——
const LOOP_EVENT_TYPE_COUNT = 1;

// 全 CommandType 集合（編譯期窮舉：漏一鍵或多一鍵即 tsc 失敗）。
const ALL_COMMAND_TYPES: Record<CommandType, true> = {
  // 內政
  grantFief: true,
  setDevelopFocus: true,
  buildFacility: true,
  cancelBuild: true,
  demolishFacility: true,
  setConscriptPolicy: true,
  transport: true,
  recallTransport: true,
  tradeRice: true,
  enactPolicy: true,
  revokePolicy: true,
  appointLord: true,
  setCastleControl: true,
  // 軍事
  march: true,
  setArmyTarget: true,
  recallArmy: true,
  setAutoReturn: true,
  startKassen: true,
  battleMove: true,
  battleAttack: true,
  battleTactic: true,
  battleDelegate: true,
  setSiegeMode: true,
  useBetrayal: true,
  // 武將
  recruitRonin: true,
  rewardOfficer: true,
  handleCaptive: true,
  promoteRank: true,
  // 外交與調略
  startDiploWork: true,
  stopDiploWork: true,
  proposePact: true,
  respondPact: true,
  breakPact: true,
  requestCourtRank: true,
  requestMediation: true,
  requestShogunateTitle: true,
  nominateShogun: true,
  startPlot: true,
  cancelPlot: true,
  // 軍團
  createCorps: true,
  setCorpsDirective: true,
  assignCastleToCorps: true,
  dissolveCorps: true,
  // 具申／大命／事件
  resolveProposal: true,
  invokeTaimei: true,
  resolveEventChoice: true,
  // debug（03 §3.9 專有；非 02 §4.18）
  debugSkipDays: true,
  debugGrant: true,
};

// 全 GameEventType 集合（編譯期窮舉）。
const ALL_GAME_EVENT_TYPES: Record<GameEventType, true> = {
  'battle.started': true,
  'battle.kassenAvailable': true,
  'battle.ended': true,
  'awe.triggered': true,
  'siege.started': true,
  'siege.relief': true,
  'siege.ended': true,
  'district.subjugated': true,
  'army.departed': true,
  'army.arrived': true,
  'army.returned': true,
  'army.blocked': true,
  'army.starving': true,
  'army.routed': true,
  'economy.income': true,
  'economy.harvest': true,
  'economy.granaryOverflow': true,
  'economy.upkeepUnpaid': true,
  'economy.foodShortage': true,
  'facility.completed': true,
  'policy.enacted': true,
  'policy.revoked': true,
  'policy.autoRevoked': true,
  'conscript.completed': true,
  'transport.arrived': true,
  'transport.looted': true,
  'uprising.started': true,
  'uprising.ended': true,
  'officer.died': true,
  'officer.comingOfAge': true,
  'officer.promoted': true,
  'officer.loyaltyLow': true,
  'officer.defected': true,
  'officer.recruited': true,
  'officer.recruitFailed': true,
  'officer.captured': true,
  'officer.released': true,
  'officer.executed': true,
  'pact.signed': true,
  'pact.expired': true,
  'pact.broken': true,
  'diplo.refused': true,
  'diplo.reinforceAgreed': true,
  'diplo.envoyArrived': true,
  'diplo.workStopped': true,
  'court.rankGranted': true,
  'court.mediationResult': true,
  'shogunate.titleGranted': true,
  'shogunate.nominated': true,
  'shogunate.patronLost': true,
  'shogunate.collapsed': true,
  'plot.succeeded': true,
  'plot.failed': true,
  'plot.exposed': true,
  'plot.betrayalActivated': true,
  'proposal.submitted': true,
  'proposal.resolved': true,
  'proposal.expired': true,
  'event.fired': true,
  'taimei.invoked': true,
  'taimei.expired': true,
  'clan.succession': true,
  'clan.destroyed': true,
  'victory.tenkabitoProgress': true,
  'game.victory': true,
  'game.defeat': true,
  'time.monthStart': true,
  'time.seasonStart': true,
  // 指令（03 §4.3 迴圈機制專有；非 02 §4.19）
  'command.rejected': true,
};

describe('Command 型別聯集（02 §4.18 ＋ 03 §3.9 debug）', () => {
  it(`CommandType 恰有 ${String(COMMAND_TYPE_COUNT + DEBUG_COMMAND_TYPE_COUNT)} 個成員（02 §4.18 之 ${String(COMMAND_TYPE_COUNT)} ＋ 03 debug ${String(DEBUG_COMMAND_TYPE_COUNT)}）`, () => {
    expect(Object.keys(ALL_COMMAND_TYPES).length).toBe(
      COMMAND_TYPE_COUNT + DEBUG_COMMAND_TYPE_COUNT,
    );
  });

  it('CommandType 值集合無重複', () => {
    const keys = Object.keys(ALL_COMMAND_TYPES);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('GameEvent 型別聯集（02 §4.19 ＋ 03 §4.3 迴圈事件）', () => {
  it(`GameEventType 恰有 ${String(GAME_EVENT_TYPE_COUNT + LOOP_EVENT_TYPE_COUNT)} 個成員（02 §4.19 之 ${String(GAME_EVENT_TYPE_COUNT)} ＋ 03 迴圈 ${String(LOOP_EVENT_TYPE_COUNT)}）`, () => {
    expect(Object.keys(ALL_GAME_EVENT_TYPES).length).toBe(
      GAME_EVENT_TYPE_COUNT + LOOP_EVENT_TYPE_COUNT,
    );
  });

  it('GameEventType 值集合無重複', () => {
    const keys = Object.keys(ALL_GAME_EVENT_TYPES);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('ID regex 與 type guard（02 §3.2／§7）', () => {
  it('ID_PATTERN 覆蓋 §3.2 全表（21 種 branded ID ＋ ClanPairKey）', () => {
    // 靜態 13 ＋ 執行期 8 ＝ 21，加 ClanPairKey ＝ 22 個 pattern 鍵。
    expect(Object.keys(ID_PATTERN).length).toBe(22);
  });

  it('靜態 ID slug 規則：合法字串通過、錯前綴/大寫/空 slug 被拒', () => {
    expect(isClanId('clan.oda')).toBe(true);
    expect(isCastleId('castle.kiyosu')).toBe(true);
    expect(isDistrictId('dist.owari-kasugai')).toBe(true);
    expect(isClanId('oda')).toBe(false); // 缺前綴
    expect(isClanId('clan.Oda')).toBe(false); // 大寫
    expect(isClanId('clan.')).toBe(false); // 空 slug
    expect(isCastleId('clan.oda')).toBe(false); // 前綴不符
  });

  it('RoadEdgeId 允許選用 -\\d{2} 尾綴（slug 本已含數字/連字號，尾綴為 §3.2 明列冗餘群組）', () => {
    expect(ID_PATTERN.RoadEdgeId.test('road.kiyosu-sunpu')).toBe(true);
    expect(ID_PATTERN.RoadEdgeId.test('road.kiyosu-sunpu-01')).toBe(true);
    expect(ID_PATTERN.RoadEdgeId.test('road.KIYOSU')).toBe(false); // 大寫被拒
    expect(ID_PATTERN.RoadEdgeId.test('castle.kiyosu')).toBe(false); // 前綴不符
  });

  it('執行期流水號 ID：六位數字，非六位被拒', () => {
    expect(isArmyId('army.000042')).toBe(true);
    expect(isArmyId('army.42')).toBe(false); // 非六位
    expect(isArmyId('army.0000042')).toBe(false); // 七位
    expect(ID_PATTERN.ProposalId.test('prop.000118')).toBe(true); // prop. 前綴（非 proposal.）
    expect(ID_PATTERN.ReportId.test('rep.004250')).toBe(true); // rep. 前綴
  });

  it('isMapNodeId = 城 ∪ 郡', () => {
    expect(isMapNodeId('castle.kiyosu')).toBe(true);
    expect(isMapNodeId('dist.owari-kasugai')).toBe(true);
    expect(isMapNodeId('clan.oda')).toBe(false);
  });

  it('ClanPairKey：兩個 ClanId 以 | 連接', () => {
    expect(ID_PATTERN.ClanPairKey.test('clan.imagawa|clan.oda')).toBe(true);
    expect(ID_PATTERN.ClanPairKey.test('clan.oda')).toBe(false);
  });
});

describe('enum VALUES 陣列（02 §3.3／§7：每個 union 有同名 *_VALUES）', () => {
  it('代表性 enum 之 VALUES 非空且無重複', () => {
    for (const arr of [
      RANK_VALUES,
      ARMY_STATUS_VALUES,
      COURT_RANK_VALUES,
      PROPOSAL_KIND_VALUES,
      REGION_VALUES,
    ]) {
      expect(arr.length).toBeGreaterThan(0);
      expect(new Set(arr).size).toBe(arr.length);
    }
  });

  it('關鍵 enum 之基數與 02 §3.3 一致', () => {
    expect(RANK_VALUES.length).toBe(6); // 身分六階
    expect(ARMY_STATUS_VALUES.length).toBe(7); // 七態（勘誤 E-10）
    expect(COURT_RANK_VALUES.length).toBe(9); // none + 八階官位
    expect(PROPOSAL_KIND_VALUES.length).toBe(11);
    expect(REGION_VALUES.length).toBe(9); // 9 地方
  });
});
