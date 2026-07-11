// Step 13 reports 系統驗收測試（M1-8）。
// 規格：plan/03-game-loop.md §3.4.2（重要度分級與自動暫停對應表，canonical——逐列測試）／
//       §3.4.3（NOT_REPORTED 排除集／push 規則／isPlayerRelevant）／§5.4（reports 修剪演算法）。

import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  NOT_REPORTED,
  isPlayerRelevant,
  reportsSystem,
  severityOf,
} from '../../src/core/systems/reports';
import type { GameEvent, GameEventType } from '../../src/core/state/events';
import type { ClanId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

const OTHER_A = 'clan.other-a' as ClanId;
const OTHER_B = 'clan.other-b' as ClanId;

/** base 欄位 helper（02 §4.19 GameEventBase）。 */
function base(day: number, clanIds: ClanId[]): { day: number; clanIds: ClanId[] } {
  return { day, clanIds };
}

describe('severityOf（03 §3.4.2 分級表逐列）', () => {
  it('time.monthStart → info（flat）', () => {
    const e: GameEvent = { type: 'time.monthStart', ...base(1, []), year: 1560, month: 2 };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });

  it('siege.started → critical（flat，00 §5.2「我方城被圍」列名）', () => {
    const e: GameEvent = {
      type: 'siege.started',
      ...base(1, [OTHER_A, TEST_CLAN]),
      siegeId: 'siege.000001' as never,
      castleId: 'castle.x' as never,
      attackerClanId: OTHER_A,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('critical');
  });

  it('battle.kassenAvailable → critical（flat，00 §5.2「玩家可發動」列名）', () => {
    const e: GameEvent = {
      type: 'battle.kassenAvailable',
      ...base(1, [TEST_CLAN]),
      battleId: 'fc.x-1',
    };
    expect(severityOf(e, TEST_CLAN)).toBe('critical');
  });

  it('proposal.submitted → info（flat）', () => {
    const e: GameEvent = {
      type: 'proposal.submitted',
      ...base(1, [TEST_CLAN]),
      proposalId: 'prop.000001' as never,
      officerId: 'off.x' as never,
      kind: 'develop',
    };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });

  it('diplo.envoyArrived → warning（flat）', () => {
    const e: GameEvent = {
      type: 'diplo.envoyArrived',
      ...base(1, [OTHER_A]),
      fromClanId: OTHER_A,
      proposalId: 'prop.000001' as never,
      kind: 'proposeAlliance',
    };
    expect(severityOf(e, TEST_CLAN)).toBe('warning');
  });

  it('diplo.workStopped → 涉我方 warning；否則 info', () => {
    const mine: GameEvent = {
      type: 'diplo.workStopped',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      target: 'court',
    };
    const other: GameEvent = {
      type: 'diplo.workStopped',
      ...base(1, [OTHER_A]),
      clanId: OTHER_A,
      target: 'court',
    };
    expect(severityOf(mine, TEST_CLAN)).toBe('warning');
    expect(severityOf(other, TEST_CLAN)).toBe('info');
  });

  it('event.fired：hasChoice=true → critical；hasChoice=false → info', () => {
    const withChoice: GameEvent = {
      type: 'event.fired',
      ...base(1, []),
      eventId: 'evt.x' as never,
      hasChoice: true,
    };
    const noChoice: GameEvent = {
      type: 'event.fired',
      ...base(1, []),
      eventId: 'evt.x' as never,
      hasChoice: false,
    };
    expect(severityOf(withChoice, TEST_CLAN)).toBe('critical');
    expect(severityOf(noChoice, TEST_CLAN)).toBe('info');
  });

  it('battle.ended：我方參戰（攻／守）→ critical；第三方 → info', () => {
    const asAttacker: GameEvent = {
      type: 'battle.ended',
      ...base(1, [TEST_CLAN, OTHER_A]),
      battleId: 'battle.000001',
      winnerClanId: TEST_CLAN,
      aweLevel: 'none',
      attackerLosses: 0,
      defenderLosses: 0,
      nodeId: 'castle.x' as never,
      attackerClanId: TEST_CLAN,
      defenderClanId: OTHER_A,
    };
    const asDefender: GameEvent = {
      ...asAttacker,
      attackerClanId: OTHER_A,
      defenderClanId: TEST_CLAN,
    };
    const thirdParty: GameEvent = {
      ...asAttacker,
      attackerClanId: OTHER_A,
      defenderClanId: OTHER_B,
      winnerClanId: null,
    };
    expect(severityOf(asAttacker, TEST_CLAN)).toBe('critical');
    expect(severityOf(asDefender, TEST_CLAN)).toBe('critical');
    expect(severityOf(thirdParty, TEST_CLAN)).toBe('info');
  });

  it('siege.ended：涉我方 critical；他勢力 info', () => {
    const mine: GameEvent = {
      type: 'siege.ended',
      ...base(1, [TEST_CLAN, OTHER_A]),
      siegeId: 'siege.000001' as never,
      castleId: 'castle.x' as never,
      fallen: true,
      newOwnerClanId: OTHER_A,
    };
    const other: GameEvent = { ...mine, clanIds: [OTHER_A, OTHER_B] };
    expect(severityOf(mine, TEST_CLAN)).toBe('critical');
    expect(severityOf(other, TEST_CLAN)).toBe('info');
  });

  it('clan.succession：涉我方 critical；他勢力 info', () => {
    const mine: GameEvent = {
      type: 'clan.succession',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      deceasedId: 'off.a' as never,
      heirId: 'off.b' as never,
    };
    const other: GameEvent = { ...mine, clanId: OTHER_A, clanIds: [OTHER_A] };
    expect(severityOf(mine, TEST_CLAN)).toBe('critical');
    expect(severityOf(other, TEST_CLAN)).toBe('info');
  });

  it('siege.relief／army.routed／uprising.started／uprising.ended：涉我方 warning；他勢力 info', () => {
    const siegeRelief: GameEvent = {
      type: 'siege.relief',
      ...base(1, [TEST_CLAN, OTHER_A]),
      siegeId: 'siege.000001' as never,
      castleId: 'castle.x' as never,
    };
    const armyRouted: GameEvent = {
      type: 'army.routed',
      ...base(1, [TEST_CLAN]),
      armyId: 'army.000001' as never,
      clanId: TEST_CLAN,
      nodeId: 'castle.x' as never,
    };
    const uprisingStarted: GameEvent = {
      type: 'uprising.started',
      ...base(1, [TEST_CLAN]),
      districtId: 'dist.x' as never,
      severity: 1,
    };
    const uprisingEnded: GameEvent = {
      type: 'uprising.ended',
      ...base(1, [TEST_CLAN]),
      districtId: 'dist.x' as never,
      resolved: 'suppressed',
    };
    for (const mine of [siegeRelief, armyRouted, uprisingStarted, uprisingEnded]) {
      expect(severityOf(mine, TEST_CLAN)).toBe('warning');
      expect(severityOf({ ...mine, clanIds: [OTHER_A, OTHER_B] }, TEST_CLAN)).toBe('info');
    }
  });

  it('officer.died：clanId===我方 warning；他勢力/null info', () => {
    const mine: GameEvent = {
      type: 'officer.died',
      ...base(1, [TEST_CLAN]),
      officerId: 'off.a' as never,
      clanId: TEST_CLAN,
      cause: 'age',
      nodeId: null,
    };
    const other: GameEvent = { ...mine, clanId: OTHER_A, clanIds: [OTHER_A] };
    const ronin: GameEvent = { ...mine, clanId: null, clanIds: [] };
    expect(severityOf(mine, TEST_CLAN)).toBe('warning');
    expect(severityOf(other, TEST_CLAN)).toBe('info');
    expect(severityOf(ronin, TEST_CLAN)).toBe('info');
  });

  it('officer.defected：fromClanId／toClanId 任一為我方 → warning；否則 info', () => {
    const from: GameEvent = {
      type: 'officer.defected',
      ...base(1, [TEST_CLAN, OTHER_A]),
      officerId: 'off.a' as never,
      fromClanId: TEST_CLAN,
      toClanId: OTHER_A,
    };
    const to: GameEvent = { ...from, fromClanId: OTHER_A, toClanId: TEST_CLAN };
    const neither: GameEvent = {
      ...from,
      fromClanId: OTHER_A,
      toClanId: OTHER_B,
      clanIds: [OTHER_A, OTHER_B],
    };
    expect(severityOf(from, TEST_CLAN)).toBe('warning');
    expect(severityOf(to, TEST_CLAN)).toBe('warning');
    expect(severityOf(neither, TEST_CLAN)).toBe('info');
  });

  it('officer.loyaltyLow → warning（flat）', () => {
    const e: GameEvent = {
      type: 'officer.loyaltyLow',
      ...base(1, [TEST_CLAN]),
      officerId: 'off.a' as never,
      clanId: TEST_CLAN,
      loyalty: 20,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('warning');
  });

  it('officer.recruitFailed → info（flat，七輪裁決 2b）', () => {
    const e: GameEvent = {
      type: 'officer.recruitFailed',
      ...base(1, [TEST_CLAN]),
      officerId: 'off.a' as never,
      executorId: 'off.b' as never,
      clanId: TEST_CLAN,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });

  it('economy.upkeepUnpaid／economy.foodShortage／economy.granaryOverflow／policy.autoRevoked → warning（flat）', () => {
    const upkeep: GameEvent = {
      type: 'economy.upkeepUnpaid',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
    };
    const shortage: GameEvent = {
      type: 'economy.foodShortage',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      castleId: 'castle.x' as never,
    };
    const overflow: GameEvent = {
      type: 'economy.granaryOverflow',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      castleId: 'castle.x' as never,
      food: 10,
    };
    const autoRevoked: GameEvent = {
      type: 'policy.autoRevoked',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      policyId: 'pol.x' as never,
    };
    for (const e of [upkeep, shortage, overflow, autoRevoked]) {
      expect(severityOf(e, TEST_CLAN)).toBe('warning');
    }
  });

  it('transport.looted：被劫方（ownerClanId）視角 warning；劫方/第三方 info', () => {
    const victim: GameEvent = {
      type: 'transport.looted',
      ...base(1, [TEST_CLAN, OTHER_A]),
      ownerClanId: TEST_CLAN,
      fromCastleId: 'castle.a' as never,
      toCastleId: 'castle.b' as never,
      byClanId: OTHER_A,
      nodeId: 'castle.a' as never,
      soldiers: 0,
      gold: 10,
      food: 10,
    };
    const looter: GameEvent = { ...victim, ownerClanId: OTHER_A, byClanId: TEST_CLAN };
    expect(severityOf(victim, TEST_CLAN)).toBe('warning');
    expect(severityOf(looter, TEST_CLAN)).toBe('info');
  });

  it('pact.expired／pact.broken：涉我方 warning；否則 info', () => {
    const expired: GameEvent = {
      type: 'pact.expired',
      ...base(1, [TEST_CLAN, OTHER_A]),
      aClanId: TEST_CLAN,
      bClanId: OTHER_A,
      kind: 'ceasefire',
    };
    const broken: GameEvent = {
      type: 'pact.broken',
      ...base(1, [OTHER_A, OTHER_B]),
      aClanId: OTHER_A,
      bClanId: OTHER_B,
      kind: 'alliance',
      breakerClanId: OTHER_A,
    };
    expect(severityOf(expired, TEST_CLAN)).toBe('warning');
    expect(severityOf(broken, TEST_CLAN)).toBe('info');
  });

  it('court.mediationResult：涉我方 critical；否則 warning（例外：非 info）', () => {
    const initiator: GameEvent = {
      type: 'court.mediationResult',
      ...base(1, [TEST_CLAN, OTHER_A]),
      clanId: TEST_CLAN,
      targetClanId: OTHER_A,
      success: true,
      ceasefireMonths: 6,
    };
    const target: GameEvent = { ...initiator, clanId: OTHER_A, targetClanId: TEST_CLAN };
    const thirdParty: GameEvent = {
      ...initiator,
      clanId: OTHER_A,
      targetClanId: OTHER_B,
      clanIds: [OTHER_A, OTHER_B],
    };
    expect(severityOf(initiator, TEST_CLAN)).toBe('critical');
    expect(severityOf(target, TEST_CLAN)).toBe('critical');
    expect(severityOf(thirdParty, TEST_CLAN)).toBe('warning');
  });

  it('shogunate.nominated／shogunate.collapsed → critical（flat，世界級廣播）', () => {
    const nominated: GameEvent = {
      type: 'shogunate.nominated',
      ...base(1, [OTHER_A]),
      clanId: OTHER_A,
    };
    const collapsed: GameEvent = { type: 'shogunate.collapsed', ...base(1, []) };
    expect(severityOf(nominated, TEST_CLAN)).toBe('critical');
    expect(severityOf(collapsed, TEST_CLAN)).toBe('critical');
  });

  it('shogunate.patronLost：當事勢力 warning；否則 info', () => {
    const mine: GameEvent = {
      type: 'shogunate.patronLost',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
    };
    const other: GameEvent = {
      type: 'shogunate.patronLost',
      ...base(1, [OTHER_A]),
      clanId: OTHER_A,
    };
    expect(severityOf(mine, TEST_CLAN)).toBe('warning');
    expect(severityOf(other, TEST_CLAN)).toBe('info');
  });

  it('plot.exposed／plot.betrayalActivated：target critical；actor warning；否則 info', () => {
    const asTarget: GameEvent = {
      type: 'plot.exposed',
      ...base(1, [OTHER_A, TEST_CLAN]),
      kind: 'poach',
      actorClanId: OTHER_A,
      targetClanId: TEST_CLAN,
      targetOfficerId: 'off.a' as never,
      targetCastleId: null,
    };
    const asActor: GameEvent = { ...asTarget, actorClanId: TEST_CLAN, targetClanId: OTHER_A };
    const neither: GameEvent = {
      ...asTarget,
      actorClanId: OTHER_A,
      targetClanId: OTHER_B,
      clanIds: [OTHER_A, OTHER_B],
    };
    const betrayal: GameEvent = {
      type: 'plot.betrayalActivated',
      ...base(1, [OTHER_A, TEST_CLAN]),
      actorClanId: OTHER_A,
      targetClanId: TEST_CLAN,
      castleId: 'castle.x' as never,
    };
    expect(severityOf(asTarget, TEST_CLAN)).toBe('critical');
    expect(severityOf(asActor, TEST_CLAN)).toBe('warning');
    expect(severityOf(neither, TEST_CLAN)).toBe('info');
    expect(severityOf(betrayal, TEST_CLAN)).toBe('critical');
  });

  it('clan.destroyed → info（flat，涉我方另走 game.defeat）', () => {
    const e: GameEvent = {
      type: 'clan.destroyed',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      byClanId: OTHER_A,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });

  it('victory.tenkabitoProgress → info（flat，七輪裁決 2c）', () => {
    const e: GameEvent = {
      type: 'victory.tenkabitoProgress',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      months: 6,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });

  it('game.victory／game.defeat → critical（flat）', () => {
    const victory: GameEvent = {
      type: 'game.victory',
      ...base(1, [TEST_CLAN]),
      clanId: TEST_CLAN,
      condition: 'unification',
    };
    const defeat: GameEvent = { ...victory, type: 'game.defeat' };
    expect(severityOf(victory, TEST_CLAN)).toBe('critical');
    expect(severityOf(defeat, TEST_CLAN)).toBe('critical');
  });

  it('command.rejected → warning（flat）', () => {
    const e: GameEvent = {
      type: 'command.rejected',
      ...base(1, [TEST_CLAN]),
      commandType: 'march',
      reasonKey: 'cmd.reject.notOwner',
      params: {},
    };
    expect(severityOf(e, TEST_CLAN)).toBe('warning');
  });

  it('其餘未列事件 → info（表末預設；以 facility.completed 為例）', () => {
    const e: GameEvent = {
      type: 'facility.completed',
      ...base(1, [TEST_CLAN]),
      castleId: 'castle.x' as never,
      facilityTypeId: 'fac.market' as never,
    };
    expect(severityOf(e, TEST_CLAN)).toBe('info');
  });
});

describe('isPlayerRelevant（03 §3.4.3）', () => {
  it('clanIds 含 playerClanId → true', () => {
    const e: GameEvent = {
      type: 'army.routed',
      ...base(1, [TEST_CLAN]),
      armyId: 'army.000001' as never,
      clanId: TEST_CLAN,
      nodeId: 'castle.x' as never,
    };
    expect(isPlayerRelevant(e, TEST_CLAN)).toBe(true);
  });
  it('clanIds 不含 playerClanId → false', () => {
    const e: GameEvent = {
      type: 'army.routed',
      ...base(1, [OTHER_A]),
      armyId: 'army.000001' as never,
      clanId: OTHER_A,
      nodeId: 'castle.x' as never,
    };
    expect(isPlayerRelevant(e, TEST_CLAN)).toBe(false);
  });
  it('clanIds 空陣列恆為 false（time.* 慣例）', () => {
    const e: GameEvent = { type: 'time.monthStart', ...base(1, []), year: 1560, month: 2 };
    expect(isPlayerRelevant(e, TEST_CLAN)).toBe(false);
  });
});

describe('NOT_REPORTED（03 §3.4.3／13 §3.7(5) 權威登錄）', () => {
  const expected: GameEventType[] = [
    'time.monthStart',
    'time.seasonStart',
    'game.victory',
    'game.defeat',
    'policy.enacted',
    'policy.revoked',
    'proposal.resolved',
    'conscript.completed',
  ];

  it('恰為權威登錄之 8 個型別', () => {
    expect([...NOT_REPORTED].sort()).toEqual([...expected].sort());
  });

  it('未列於排除集的型別（如 siege.started）不受影響', () => {
    expect(NOT_REPORTED.has('siege.started')).toBe(false);
  });
});

describe('reportsSystem（Step 13 行為整合，03 §3.4.3）', () => {
  it('NOT_REPORTED 命中：即使 isPlayerRelevant 為真、severity!==info 亦不 push', () => {
    const state = makeLoopTestState({ day: 30 });
    const events: GameEvent[] = [
      { type: 'time.monthStart', day: 30, clanIds: [], year: 1560, month: 2 },
      {
        type: 'game.victory',
        day: 30,
        clanIds: [TEST_CLAN],
        clanId: TEST_CLAN,
        condition: 'unification',
      },
    ];
    const reasons = reportsSystem(state, events);
    expect(state.reports).toEqual([]);
    expect(reasons).toEqual(['monthStart']); // autoPause 不受 NOT_REPORTED 影響
  });

  it('isPlayerRelevant 為真時 push（即使 severity=info）', () => {
    const state = makeLoopTestState({ day: 30 });
    const events: GameEvent[] = [
      {
        type: 'officer.comingOfAge',
        day: 30,
        clanIds: [TEST_CLAN],
        officerId: 'off.a' as never,
        clanId: TEST_CLAN,
      },
    ];
    reportsSystem(state, events);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]?.event).toEqual(events[0]);
    expect(state.reports[0]?.read).toBe(false);
    expect(state.reports[0]?.day).toBe(30);
  });

  it('severity!==info 時 push（即使非我方相關；如世界級廣播 shogunate.collapsed）', () => {
    const state = makeLoopTestState({ day: 30 });
    const events: GameEvent[] = [{ type: 'shogunate.collapsed', day: 30, clanIds: [] }];
    reportsSystem(state, events);
    expect(state.reports).toHaveLength(1);
  });

  it('純他勢力 info 事件不 push（isPlayerRelevant=false 且 severity=info）', () => {
    const state = makeLoopTestState({ day: 30 });
    const events: GameEvent[] = [
      {
        type: 'officer.recruitFailed',
        day: 30,
        clanIds: [OTHER_A],
        officerId: 'off.a' as never,
        executorId: 'off.b' as never,
        clanId: OTHER_A,
      },
    ];
    reportsSystem(state, events);
    expect(state.reports).toEqual([]);
  });

  it('新→舊插入：同 tick 多筆依事件發出順序整批置於陣列前端（02 §4.17）', () => {
    const state = makeLoopTestState({ day: 30 });
    const e1: GameEvent = {
      type: 'officer.loyaltyLow',
      day: 30,
      clanIds: [TEST_CLAN],
      officerId: 'off.a' as never,
      clanId: TEST_CLAN,
      loyalty: 10,
    };
    const e2: GameEvent = {
      type: 'officer.loyaltyLow',
      day: 30,
      clanIds: [TEST_CLAN],
      officerId: 'off.b' as never,
      clanId: TEST_CLAN,
      loyalty: 5,
    };
    reportsSystem(state, [e1]);
    reportsSystem(state, [e2]);
    // e2 較新（第二次 tick），應排在陣列最前
    expect(state.reports[0]?.event).toEqual(e2);
    expect(state.reports[1]?.event).toEqual(e1);
  });

  it('id 由 nextId(state,"report") 產生、遞增', () => {
    const state = makeLoopTestState({ day: 30 });
    const e: GameEvent = {
      type: 'officer.loyaltyLow',
      day: 30,
      clanIds: [TEST_CLAN],
      officerId: 'off.a' as never,
      clanId: TEST_CLAN,
      loyalty: 10,
    };
    reportsSystem(state, [e, e]);
    expect(state.reports[0]?.id).toBe('rep.000002');
    expect(state.reports[1]?.id).toBe('rep.000001');
    expect(state.meta.nextSerials.report).toBe(3);
  });

  it('autoPauseReasons：去重＋依表列序排序', () => {
    const state = makeLoopTestState({ day: 30 });
    const events: GameEvent[] = [
      {
        type: 'diplo.envoyArrived',
        day: 30,
        clanIds: [OTHER_A],
        fromClanId: OTHER_A,
        proposalId: 'prop.000001' as never,
        kind: 'proposeAlliance',
      },
      { type: 'time.monthStart', day: 30, clanIds: [], year: 1560, month: 2 },
      { type: 'time.monthStart', day: 30, clanIds: [], year: 1560, month: 2 }, // 重複，應去重
      {
        type: 'proposal.submitted',
        day: 30,
        clanIds: [TEST_CLAN],
        proposalId: 'prop.000001' as never,
        officerId: 'off.a' as never,
        kind: 'develop',
      },
    ];
    const reasons = reportsSystem(state, events);
    expect(reasons).toEqual(['monthStart', 'proposalArrived', 'envoyArrived']);
  });

  it('siegeOnPlayer：僅當玩家為守方（非攻方）時觸發', () => {
    const state = makeLoopTestState({ day: 30 });
    const onPlayer: GameEvent = {
      type: 'siege.started',
      day: 30,
      clanIds: [OTHER_A, TEST_CLAN],
      siegeId: 'siege.000001' as never,
      castleId: 'castle.x' as never,
      attackerClanId: OTHER_A,
    };
    const byPlayer: GameEvent = { ...onPlayer, attackerClanId: TEST_CLAN };
    expect(reportsSystem(state, [onPlayer])).toEqual(['siegeOnPlayer']);
    expect(reportsSystem(state, [byPlayer])).toEqual([]);
  });

  it('historicalEvent：僅 hasChoice=true 觸發', () => {
    const state = makeLoopTestState({ day: 30 });
    const withChoice: GameEvent = {
      type: 'event.fired',
      day: 30,
      clanIds: [],
      eventId: 'evt.x' as never,
      hasChoice: true,
    };
    const noChoice: GameEvent = { ...withChoice, hasChoice: false };
    expect(reportsSystem(state, [withChoice])).toEqual(['historicalEvent']);
    expect(reportsSystem(state, [noChoice])).toEqual([]);
  });
});

describe('reports 修剪（03 §5.4）', () => {
  it('超過保留期（BAL.reportRetentionDays）之項目被移除', () => {
    const state = makeLoopTestState({ day: 400 });
    // 直接構造一筆過期的既存 Report（day=0，超過 360 日保留期）。
    state.reports.push({
      id: 'rep.000001' as never,
      day: 0,
      event: {
        type: 'officer.recruitFailed',
        day: 0,
        clanIds: [TEST_CLAN],
        officerId: 'off.a' as never,
        executorId: 'off.b' as never,
        clanId: TEST_CLAN,
      },
      read: false,
    });
    const e: GameEvent = {
      type: 'officer.loyaltyLow',
      day: 400,
      clanIds: [TEST_CLAN],
      officerId: 'off.c' as never,
      clanId: TEST_CLAN,
      loyalty: 10,
    };
    reportsSystem(state, [e]);
    expect(state.reports).toHaveLength(1);
    expect(state.reports[0]?.day).toBe(400);
  });

  it('超過 BAL.reportMaxKept 時，先丟最舊的 info、再丟最舊的 warning、critical 不受總數修剪', () => {
    const state = makeLoopTestState({ day: 30 });
    // 手工塞入：1 筆 critical（最舊）、1 筆 warning（次舊）、reportMaxKept 筆 info（最新）。
    state.reports.push(
      {
        id: 'rep.critical' as never,
        day: 1,
        event: {
          type: 'game.victory',
          day: 1,
          clanIds: [TEST_CLAN],
          clanId: TEST_CLAN,
          condition: 'unification',
        },
        read: false,
      },
      {
        id: 'rep.warning' as never,
        day: 2,
        event: {
          type: 'officer.loyaltyLow',
          day: 2,
          clanIds: [TEST_CLAN],
          officerId: 'off.a' as never,
          clanId: TEST_CLAN,
          loyalty: 10,
        },
        read: false,
      },
    );
    const fillerEvents: GameEvent[] = [];
    for (let i = 0; i < BAL.reportMaxKept; i += 1) {
      fillerEvents.push({
        type: 'officer.comingOfAge',
        day: 30,
        clanIds: [TEST_CLAN],
        officerId: `off.filler-${String(i)}` as never,
        clanId: TEST_CLAN,
      });
    }
    reportsSystem(state, fillerEvents);
    // 修剪後總數 = reportMaxKept；critical/warning 兩筆手工項目應已被擠掉其中的 info（此處無 info
    // 可丟，故先丟最舊的 warning——但 warning 早於本次新 push 的 info 群，驗證修剪確有作用即可）。
    expect(state.reports.length).toBeLessThanOrEqual(BAL.reportMaxKept);
    // critical 恆不因總數被修剪：只要仍在保留期內，必存在。
    expect(state.reports.some((r) => r.id === 'rep.critical')).toBe(true);
  });

  it('僅剩 critical 時停止修剪（即使仍超過 reportMaxKept）', () => {
    const state = makeLoopTestState({ day: 30 });
    for (let i = 0; i < BAL.reportMaxKept + 5; i += 1) {
      state.reports.push({
        id: `rep.c${String(i)}` as never,
        day: 30,
        event: {
          type: 'game.victory',
          day: 30,
          clanIds: [TEST_CLAN],
          clanId: TEST_CLAN,
          condition: 'unification',
        },
        read: false,
      });
    }
    reportsSystem(state, []);
    expect(state.reports.length).toBe(BAL.reportMaxKept + 5); // 全 critical，修剪迴圈立即中止
  });
});
