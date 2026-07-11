// Command 佇列骨架測試（M1-6 驗收：18-roadmap §3.4「非法指令不改 state＋reasonKey」；
// 03-T3 驗收「非法指令不改 state 且產生正確 reasonKey；同 tick 兩指令依 seq 序生效；重複 seq 被跳過」）。
// 規格：plan/03-game-loop.md §3.3（Command 架構）／§5.1（applyCommands 虛擬碼）／§3.3.2（reasonKey 表）／
//       §3.9.2（debug 指令）；10 §5（gameOver 中央閘門）。
//
// 期望值一律由 BAL 推導（BAL.maxCommandsPerTick／debugSkipMaxDays），不寫魔法數字。

import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommand } from '../../src/core/commands/apply';
import { CommandQueue, applyCommands } from '../../src/core/commands/queue';
import { REJECT_REASONS } from '../../src/core/commands/reasons';
import type { Command, CommandEnvelope } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import type { EvtCommandRejected, GameEvent } from '../../src/core/state/events';
import type { CastleId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../helpers/loopState';

function grantGold(gold: number): Command {
  return { type: 'debugGrant', clanId: TEST_CLAN, gold, food: null, castleId: null };
}
function grantFood(food: number, castleId: string): Command {
  return {
    type: 'debugGrant',
    clanId: TEST_CLAN,
    gold: null,
    food,
    castleId: castleId as CastleId,
  };
}
function skipDays(days: number): Command {
  return { type: 'debugSkipDays', clanId: TEST_CLAN, days };
}
/** 未登錄 handler 之佇列指令（僅供拒絕路徑測試；validateCommand 於讀取欄位前即拒，故形狀不需完整）。 */
function unregisteredCmd(): Command {
  return { type: 'march', clanId: TEST_CLAN } as unknown as Command;
}
function env(seq: number, command: Command, issuedDay = 0): CommandEnvelope {
  return { seq, issuedDay, command };
}
function runApply(
  state: ReturnType<typeof makeLoopTestState>,
  envelopes: CommandEnvelope[],
): GameEvent[] {
  const events: GameEvent[] = [];
  applyCommands(state, envelopes, (e) => events.push(e));
  return events;
}
function rejectedOf(events: GameEvent[]): EvtCommandRejected[] {
  return events.filter((e): e is EvtCommandRejected => e.type === 'command.rejected');
}

describe('applyCommands 合法路徑（03 §5.1）', () => {
  it('合法 debugGrant(gold) 套用後 clan.gold 增加、lastAppliedCmdSeq 前進、無 rejected 事件', () => {
    const state = makeLoopTestState({ gold: 100 });
    const events = runApply(state, [env(1, grantGold(1000))]);
    expect(state.clans[TEST_CLAN]?.gold).toBe(1100);
    expect(state.meta.lastAppliedCmdSeq).toBe(1);
    expect(rejectedOf(events)).toEqual([]);
  });

  it('合法 debugGrant(food) 加至指定城 castle.food', () => {
    const state = makeLoopTestState({ food: 50 });
    runApply(state, [env(1, grantFood(200, TEST_CASTLE))]);
    expect(state.castles[TEST_CASTLE]?.food).toBe(250);
  });

  it('debugSkipDays 合法驗證通過但套用為 core no-op（不改 state；日期不變）', () => {
    const state = makeLoopTestState({ day: 10 });
    const events = runApply(state, [env(1, skipDays(30))]);
    expect(state.time.day).toBe(10); // core 不推進（由 app 層驅動器執行跳轉）
    expect(state.meta.lastAppliedCmdSeq).toBe(1);
    expect(rejectedOf(events)).toEqual([]);
  });
});

describe('applyCommands 非法路徑（不改 state＋正確 reasonKey＋emit command.rejected）', () => {
  it('debug 指令於非 debug 模式被拒 debugOnly，且 state 不變、seq 仍推進（§5.1）', () => {
    const state = makeLoopTestState({ debugMode: false, gold: 500 });
    const events = runApply(state, [env(1, grantGold(1000))]);
    expect(state.clans[TEST_CLAN]?.gold).toBe(500); // 未改
    const rejected = rejectedOf(events);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reasonKey).toBe(REJECT_REASONS.debugOnly);
    expect(state.meta.lastAppliedCmdSeq).toBe(1); // 拒絕的 seq 亦消費（§5.1）
  });

  it('debugGrant 目標城不存在被拒 invalidTarget，state 不變', () => {
    const state = makeLoopTestState({ food: 10 });
    const events = runApply(state, [env(1, grantFood(100, 'castle.ghost'))]);
    expect(state.castles[TEST_CASTLE]?.food).toBe(10);
    expect(rejectedOf(events)[0]?.reasonKey).toBe(REJECT_REASONS.invalidTarget);
  });

  it('debugSkipDays days 超出 [1,BAL.debugSkipMaxDays] 被拒 debugBadRange（上下界皆測）', () => {
    for (const bad of [0, -1, BAL.debugSkipMaxDays + 1, 1.5]) {
      const state = makeLoopTestState();
      const events = runApply(state, [env(1, skipDays(bad))]);
      expect(rejectedOf(events)[0]?.reasonKey).toBe(REJECT_REASONS.debugBadRange);
    }
    // 邊界內合法
    for (const good of [1, BAL.debugSkipMaxDays]) {
      const state = makeLoopTestState();
      expect(rejectedOf(runApply(state, [env(1, skipDays(good))]))).toEqual([]);
    }
  });

  it('未登錄 handler 之佇列指令被拒 notImplemented（不崩潰、不改 state；§8-D14）', () => {
    const state = makeLoopTestState();
    const events = runApply(state, [env(1, unregisteredCmd())]);
    expect(rejectedOf(events)[0]?.reasonKey).toBe(REJECT_REASONS.notImplemented);
  });

  it('command.rejected 事件形狀：clanIds=[發令勢力]、commandType、day=舊 absoluteDay、params', () => {
    const state = makeLoopTestState({ debugMode: false, day: 7 });
    const events = runApply(state, [env(1, grantGold(1))]);
    const rejected = rejectedOf(events)[0];
    expect(rejected?.type).toBe('command.rejected');
    expect(rejected?.clanIds).toEqual([TEST_CLAN]);
    expect(rejected?.commandType).toBe('debugGrant');
    expect(rejected?.day).toBe(7);
    expect(rejected?.params).toEqual({});
  });
});

describe('gameOver 中央閘門（10 §5；03 §3.3.2）', () => {
  it('gameOver≠null 時非 debug 指令被拒 gameOver、debug 指令仍可套用', () => {
    const state = makeLoopTestState({
      gold: 0,
      gameOver: { kind: 'defeat', endingId: 'no-castle' },
    });
    // 非 debug 指令 → gameOver（10 §5：僅接受 debug 指令）
    expect(validateCommand(state, unregisteredCmd())).toEqual({
      ok: false,
      reasonKey: REJECT_REASONS.gameOver,
    });
    // debug 指令仍可（10 §5「僅接受 debug 指令」）
    const events = runApply(state, [env(1, grantGold(50))]);
    expect(state.clans[TEST_CLAN]?.gold).toBe(50);
    expect(rejectedOf(events)).toEqual([]);
  });
});

describe('套用順序、冪等、上限（§3.3.3／§5.1）', () => {
  it('同 tick 兩指令依 seq 序生效（累加、lastAppliedCmdSeq=最高 seq）', () => {
    const state = makeLoopTestState({ gold: 0 });
    runApply(state, [env(1, grantGold(100)), env(2, grantGold(50))]);
    expect(state.clans[TEST_CLAN]?.gold).toBe(150);
    expect(state.meta.lastAppliedCmdSeq).toBe(2);
  });

  it('冪等：seq ≤ lastAppliedCmdSeq 被跳過（重放同陣列不重複套用）', () => {
    const state = makeLoopTestState({ gold: 0 });
    const batch = [env(1, grantGold(100)), env(2, grantGold(50))];
    runApply(state, batch);
    expect(state.clans[TEST_CLAN]?.gold).toBe(150);
    // 再套用同一批（seq 1、2 皆 ≤ lastAppliedCmdSeq=2）→ 全跳過
    const events = runApply(state, batch);
    expect(state.clans[TEST_CLAN]?.gold).toBe(150); // 未變
    expect(state.meta.lastAppliedCmdSeq).toBe(2);
    expect(rejectedOf(events)).toEqual([]); // 跳過非拒絕
  });

  it('單 tick 套用上限 BAL.maxCommandsPerTick，超出者不套用、不推進其 seq', () => {
    const state = makeLoopTestState({ gold: 0 });
    const overflow = BAL.maxCommandsPerTick + 5;
    const envelopes = Array.from({ length: overflow }, (_, i) => env(i + 1, grantGold(1)));
    runApply(state, envelopes);
    expect(state.clans[TEST_CLAN]?.gold).toBe(BAL.maxCommandsPerTick);
    expect(state.meta.lastAppliedCmdSeq).toBe(BAL.maxCommandsPerTick); // 第 200 筆 seq
  });
});

describe('validateCommand 純度（§3.3.2；禁改 state）', () => {
  it('軟驗證不改 state（gold 不變、seq 不變）', () => {
    const state = makeLoopTestState({ gold: 300 });
    const before = JSON.stringify(state);
    const result = validateCommand(state, grantGold(999));
    expect(result).toEqual({ ok: true });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('applyCommand 單一套用（§3.3.3）', () => {
  it('直接套用已驗證指令就地改 state', () => {
    const state = makeLoopTestState({ gold: 10 });
    applyCommand(state, grantGold(5), () => undefined);
    expect(state.clans[TEST_CLAN]?.gold).toBe(15);
  });
});

describe('CommandQueue（§3.3.1：seq 指派／drain／上限）', () => {
  it('enqueue 由 startSeq 起指派單調遞增 seq、drain 依序取出並清空', () => {
    const q = new CommandQueue();
    const e1 = q.enqueue(grantGold(1), 0);
    const e2 = q.enqueue(grantGold(2), 0);
    expect([e1.seq, e2.seq]).toEqual([1, 2]);
    expect(q.size).toBe(2);
    const drained = q.drain();
    expect(drained.map((e) => e.seq)).toEqual([1, 2]);
    expect(q.size).toBe(0);
  });

  it('自訂 startSeq（讀檔續接 lastAppliedCmdSeq+1）', () => {
    const q = new CommandQueue(6);
    expect(q.enqueue(grantGold(1), 0).seq).toBe(6);
    expect(q.nextSequence).toBe(7);
  });

  it('drain(limit) 只取前 limit 筆、其餘留待下次（requeue 語意）', () => {
    const q = new CommandQueue();
    q.enqueue(grantGold(1), 0);
    q.enqueue(grantGold(2), 0);
    q.enqueue(grantGold(3), 0);
    const first = q.drain(2);
    expect(first.map((e) => e.seq)).toEqual([1, 2]);
    expect(q.size).toBe(1);
    expect(q.drain().map((e) => e.seq)).toEqual([3]);
  });

  it('drain 預設上限＝BAL.maxCommandsPerTick（超量留待下一 tick）', () => {
    const q = new CommandQueue();
    for (let i = 0; i < BAL.maxCommandsPerTick + 3; i += 1) {
      q.enqueue(grantGold(1), 0);
    }
    expect(q.drain().length).toBe(BAL.maxCommandsPerTick);
    expect(q.size).toBe(3);
  });

  it('佇列時點：enqueue→drain→applyCommands 於同批統一結算（暫停中提交、下一 tick 生效之核心語意）', () => {
    const state = makeLoopTestState({ gold: 0 });
    const q = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    q.enqueue(grantGold(100), state.time.day);
    q.enqueue(grantGold(200), state.time.day);
    // 下一 tick 開頭 drain 並結算
    runApply(state, q.drain());
    expect(state.clans[TEST_CLAN]?.gold).toBe(300);
    expect(q.size).toBe(0);
  });
});
