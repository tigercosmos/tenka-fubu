// builder 骨架驗收測試（M1-14）。
// 規格：plan/02-data-model.md §7（builder 驗收：建置後 validateState 零違規、reports=[]、
// nextSerials 全 1）；plan/18-roadmap.md M1-13／M1-14（tiny 劇本＋builder）。

import { describe, expect, it } from 'vitest';
import { buildGameState } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { dayToCalendar } from '../../src/core/systems/time';
import {
  CLAN_ALPHA,
  CLAN_BETA,
  PERSONA_DEFAULT,
  TINY_SCENARIO,
  TINY_SEED,
  TINY_START_DAY,
  buildTinyState,
} from '../fixtures/tiny';

describe('buildGameState（tiny 劇本，M1-14）', () => {
  it('建置後 validateState 零違規', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(validateState(state)).toEqual([]);
  });

  it('nextSerials 全部起始於 1', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(state.meta.nextSerials).toEqual({
      army: 1,
      battle: 1,
      siege: 1,
      corps: 1,
      proposal: 1,
      report: 1,
      transport: 1,
      plot: 1,
    });
  });

  it('reports 為空陣列', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(state.reports).toEqual([]);
  });

  it('meta 透傳 scenarioId／appVersion／seed／playerClanId／difficulty', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(state.meta.scenarioId).toBe('tiny');
    expect(state.meta.appVersion).toBe('0.0.0-tiny');
    expect(state.meta.seed).toBe(TINY_SEED);
    expect(state.meta.playerClanId).toBe(CLAN_ALPHA);
    expect(state.meta.difficulty).toBe('normal');
    expect(state.meta.gameOver).toBeNull();
  });

  it('time 依 startDay 換算出一致的曆法三欄（02 §5.6）', () => {
    const state = buildGameState(TINY_SCENARIO);
    const cal = dayToCalendar(TINY_START_DAY);
    expect(state.time).toEqual({
      day: TINY_START_DAY,
      year: cal.year,
      month: cal.month,
      dayOfMonth: cal.dayOfMonth,
    });
    expect(state.time).toEqual({ day: TINY_START_DAY, year: 1560, month: 4, dayOfMonth: 1 });
  });

  it('rng 由 scenario.seed 決定論播種（與 initRng(seed) 一致）', async () => {
    const { initRng } = await import('../../src/core/rng');
    const state = buildGameState(TINY_SCENARIO);
    expect(state.rng).toEqual(initRng(TINY_SEED));
  });

  it('同一 scenario 建置兩次 rng 狀態相同（決定論）', () => {
    const a = buildGameState(TINY_SCENARIO);
    const b = buildGameState(TINY_SCENARIO);
    expect(a.rng).toEqual(b.rng);
  });

  it('ai.clans 逐勢力初始化並填入 personaId；ai.personas 含該 persona', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(Object.keys(state.ai.clans).sort()).toEqual([CLAN_ALPHA, CLAN_BETA].sort());
    for (const clanId of [CLAN_ALPHA, CLAN_BETA]) {
      const aiClan = state.ai.clans[clanId];
      expect(aiClan?.clanId).toBe(clanId);
      expect(aiClan?.personaId).toBe(PERSONA_DEFAULT);
      expect(aiClan?.pendingPhases).toEqual([]);
      expect(aiClan?.attackPlans).toEqual([]);
      expect(aiClan?.threatCache).toBeNull();
    }
    expect(state.ai.personas[PERSONA_DEFAULT]).toEqual({
      aggression: 50,
      diplomacy: 50,
      development: 50,
      loyalty: 50,
      ambition: 50,
    });
    expect(state.ai.intentLog).toEqual([]);
    expect(state.ai.deferredPhases).toEqual([]);
  });

  it('policies 逐勢力建立空白 ClanPolicyState', () => {
    const state = buildGameState(TINY_SCENARIO);
    for (const clanId of [CLAN_ALPHA, CLAN_BETA]) {
      expect(state.policies[clanId]).toEqual({ clanId, active: [], cooldownUntil: {} });
    }
  });

  it('diplomacy／court／events 採 02 §5.5／§4.12／§4.16 定義的空白預設', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(state.diplomacy).toEqual({ rows: {}, missions: [], plots: [], pendingProposals: [] });
    expect(state.court).toEqual({
      courtFavor: {},
      shogunateFavor: {},
      shogunateExists: true,
      shogunClanId: null,
      patronClanId: null,
      mediationCooldownUntil: {},
    });
    expect(state.events).toEqual({
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    });
  });

  it('進行中戰爭/輸送等集合皆為空（tiny 開局無戰事）', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(state.armies).toEqual({});
    expect(state.fieldCombats).toEqual({});
    expect(state.battles).toEqual({});
    expect(state.sieges).toEqual({});
    expect(state.corps).toEqual({});
    expect(state.transports).toEqual({});
    expect(state.proposals).toEqual({});
  });

  it('陣列組裝為 Record，key 與 value.id 一致（INV-01 前提）', () => {
    const state = buildGameState(TINY_SCENARIO);
    expect(Object.keys(state.clans).sort()).toEqual(TINY_SCENARIO.clans.map((c) => c.id).sort());
    expect(Object.keys(state.officers).sort()).toEqual(
      TINY_SCENARIO.officers.map((o) => o.id).sort(),
    );
    expect(Object.keys(state.castles).sort()).toEqual(
      TINY_SCENARIO.castles.map((c) => c.id).sort(),
    );
    expect(Object.keys(state.districts).sort()).toEqual(
      TINY_SCENARIO.districts.map((d) => d.id).sort(),
    );
    expect(Object.keys(state.provinces).sort()).toEqual(
      TINY_SCENARIO.provinces.map((p) => p.id).sort(),
    );
    expect(Object.keys(state.roads).sort()).toEqual(TINY_SCENARIO.roads.map((r) => r.id).sort());
  });

  it('回傳的 state 與共用的 TINY_SCENARIO 不共享物件參照（可安全獨立 mutate）', () => {
    const a = buildGameState(TINY_SCENARIO);
    const b = buildGameState(TINY_SCENARIO);
    const clanA = a.clans[CLAN_ALPHA];
    expect(clanA).toBeDefined();
    if (clanA) clanA.gold = 999_999;
    expect(b.clans[CLAN_ALPHA]?.gold).toBe(1000);
    expect(TINY_SCENARIO.clans.find((c) => c.id === CLAN_ALPHA)?.gold).toBe(1000);
  });

  it('buildTinyState() 便利函式回傳與 buildGameState(TINY_SCENARIO) 等價的狀態', () => {
    const viaHelper = buildTinyState();
    const viaDirect = buildGameState(TINY_SCENARIO);
    expect(viaHelper).toEqual(viaDirect);
    expect(validateState(viaHelper)).toEqual([]);
  });

  it('buildTinyState 支援 overrides（如換種子）且仍零違規', () => {
    const state = buildTinyState({ seed: 7 });
    expect(state.meta.seed).toBe(7);
    expect(validateState(state)).toEqual([]);
  });
});
