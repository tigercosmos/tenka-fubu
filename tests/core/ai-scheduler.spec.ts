// 規格：plan/03-game-loop.md §3.8.2／§7-T10（40 家 10 tick 內各評定恰一次；存讀檔續跑一致）、
// plan/18-roadmap.md M1-24。型別：plan/02-data-model.md §4.20（AiState／AiClanState）。
// 評定「本體」（威脅／軍事／內政／外交四階段實際決策內容，09 §3.4）為空殼——本測試只驗證
// 排程攤平骨架（入列／消化游標），不驗證任何決策內容（留待 M7-4）。

import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { enrollMonthlyCouncils, runCouncilTick } from '../../src/core/systems/ai/scheduler';
import type { AiClanState, AiState } from '../../src/core/state/gameState';
import type { AiPersonaId, ClanId } from '../../src/core/state/ids';

const CLAN_COUNT = 40;

function clanIdAt(i: number): ClanId {
  return `clan.t${String(i).padStart(2, '0')}` as ClanId;
}

function makeAiClanState(clanId: ClanId): AiClanState {
  return {
    clanId,
    personaId: 'persona.default' as AiPersonaId,
    councilOffset: 0,
    pendingPhases: [],
    attackPlans: [],
    nextPlanSeq: 1,
    threatCache: null,
    lastCouncilDay: -1,
  };
}

function makeAiState(clanIds: readonly ClanId[]): AiState {
  const clans: Record<ClanId, AiClanState> = {};
  for (const clanId of clanIds) {
    clans[clanId] = makeAiClanState(clanId);
  }
  return { personas: {}, clans, intentLog: [], deferredPhases: [] };
}

const CLAN_IDS: ClanId[] = Array.from({ length: CLAN_COUNT }, (_, i) => clanIdAt(i));

describe('AI 排程器骨架（03 §3.8.2／§7-T10；M1-24）', () => {
  it('40 家於 10 tick 內各評定恰一次（不重不漏）', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);

    const evaluatedCounts = new Map<ClanId, number>();
    for (let tick = 0; tick < 10; tick++) {
      const executed = runCouncilTick(ai, tick);
      for (const clanId of executed) {
        evaluatedCounts.set(clanId, (evaluatedCounts.get(clanId) ?? 0) + 1);
      }
    }

    expect(evaluatedCounts.size).toBe(CLAN_COUNT);
    for (const clanId of CLAN_IDS) {
      expect(evaluatedCounts.get(clanId)).toBe(1);
    }
    // 評定完成後 pendingPhases 皆清空、lastCouncilDay 皆已寫入（非空殼前的哨兵值 -1）。
    for (const clanId of CLAN_IDS) {
      const clan = ai.clans[clanId];
      expect(clan?.pendingPhases).toEqual([]);
      expect(clan?.lastCouncilDay).toBeGreaterThanOrEqual(0);
    }
  });

  it('每 tick 至多消化 BAL.aiCouncilsPerTick 家（削峰，03 §8-D8）', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);
    for (let tick = 0; tick < 10; tick++) {
      const executed = runCouncilTick(ai, tick);
      expect(executed.length).toBeLessThanOrEqual(BAL.aiCouncilsPerTick);
    }
  });

  it('攤平序決定論：依 clanId 字典序消化', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);
    const executed = runCouncilTick(ai, 0);
    const expectedFirstBatch = [...CLAN_IDS].sort().slice(0, BAL.aiCouncilsPerTick);
    expect(executed).toEqual(expectedFirstBatch);
  });

  it('入列後每家 pendingPhases 皆為完整四階段（依序：threat/military/domestic/diplomacy）', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);
    for (const clanId of CLAN_IDS) {
      expect(ai.clans[clanId]?.pendingPhases).toEqual([
        'threat',
        'military',
        'domestic',
        'diplomacy',
      ]);
    }
  });

  it('本月已評定完成者不重複入列（同月第二次呼叫 enroll 無效）', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);
    for (let tick = 0; tick < 10; tick++) {
      runCouncilTick(ai, tick);
    }
    enrollMonthlyCouncils(ai, CLAN_IDS, 0); // monthStartDay 未變（仍是本月）
    for (const clanId of CLAN_IDS) {
      expect(ai.clans[clanId]?.pendingPhases).toEqual([]);
    }
  });

  it('下月入列會重新評定（monthStartDay 前進，lastCouncilDay 落後於新月初）', () => {
    const ai = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(ai, CLAN_IDS, 0);
    for (let tick = 0; tick < 10; tick++) {
      runCouncilTick(ai, tick);
    }
    enrollMonthlyCouncils(ai, CLAN_IDS, 30); // 下月月初（絕對日 30；02 §4.2 一月 30 日）
    for (const clanId of CLAN_IDS) {
      expect(ai.clans[clanId]?.pendingPhases.length).toBe(4);
    }
  });

  it('存檔於消化中途、讀檔續跑結果與連續執行一致（03 §7-T10 驗收）', () => {
    const continuous = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(continuous, CLAN_IDS, 0);
    for (let tick = 0; tick < 10; tick++) {
      runCouncilTick(continuous, tick);
    }

    const resumed = makeAiState(CLAN_IDS);
    enrollMonthlyCouncils(resumed, CLAN_IDS, 0);
    for (let tick = 0; tick < 5; tick++) {
      runCouncilTick(resumed, tick);
    }
    // 模擬存檔／讀檔：JSON 往返（AiState 全樹須可序列化，02 §4.1；intentLog 本測試恆空）。
    const reloaded = JSON.parse(JSON.stringify(resumed)) as AiState;
    for (let tick = 5; tick < 10; tick++) {
      runCouncilTick(reloaded, tick);
    }

    expect(reloaded).toEqual(continuous);
  });
});
