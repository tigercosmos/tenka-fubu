// M1-12 驗收：canonicalStringify／stateHash／nextId（02 §3.4 第 6 點／§5.3／§5.4）。
// 規格：plan/02-data-model.md §5.3（nextId 六位流水）／§5.4（canonical stringify／stateHash，
// 02 §8「M1 型別基座實作裁決」M1-F3 定案採 fnv1a64）／§3.4 第 6 點（ai.intentLog transient 剔除，勘誤 E-60）。

import { describe, expect, it } from 'vitest';
import { canonicalStringify, fnv1a64, nextId, stateHash } from '../../src/core/state/serialize';
import { ID_PATTERN } from '../../src/core/state/ids';
import type { ClanId } from '../../src/core/state/ids';
import type { AiIntent, GameState } from '../../src/core/state/gameState';

// —— 測試用最小合法 GameState（非官方 tiny 劇本 fixture，M1-13/14 另建；本檔僅供 serialize 單元測試）——
function buildState(): GameState {
  return {
    meta: {
      saveVersion: 1,
      appVersion: '0.0.0',
      scenarioId: 's1560',
      seed: 42,
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      nextSerials: {
        army: 1,
        battle: 1,
        siege: 1,
        corps: 1,
        proposal: 1,
        report: 1,
        transport: 1,
        plot: 1,
      },
      gameOver: null,
      stateVersion: 0,
      lastAppliedCmdSeq: 0,
      debugMode: false,
      territoryChangedToday: false,
      deferredEvents: [],
    },
    time: { day: 0, year: 1560, month: 1, dayOfMonth: 1 },
    rng: { battle: 1, dev: 2, ai: 3, event: 4, misc: 5 },
    clans: {},
    officers: {},
    castles: {},
    districts: {},
    provinces: {},
    roads: {},
    armies: {},
    fieldCombats: {},
    battles: {},
    sieges: {},
    corps: {},
    transports: {},
    diplomacy: { rows: {}, missions: [], plots: [], pendingProposals: [] },
    court: {
      courtFavor: {},
      shogunateFavor: {},
      shogunateExists: true,
      shogunClanId: null,
      patronClanId: null,
      mediationCooldownUntil: {},
    },
    policies: {},
    proposals: {},
    events: {
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    },
    ai: { personas: {}, clans: {}, intentLog: [], deferredPhases: [] },
    reports: [],
  };
}

/** 淺層打亂物件 key 順序（保留內容不變），供「key 順序打亂 hash 不變」測試用。 */
function shuffleKeys<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).reverse()) as T;
}

const dummyIntent = (kind: string): AiIntent => ({
  day: 0,
  clanId: 'clan.oda' as ClanId,
  layer: 'council',
  kind,
  detail: {},
  scores: null,
  commands: [],
});

describe('canonicalStringify（02 §5.4）', () => {
  it('key 順序不同但內容相同的物件序列化結果相同', () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('巢狀陣列與物件皆依 key 字典序序列化', () => {
    const v = { list: [3, 1, { z: 1, y: 2 }], name: '織田' };
    expect(canonicalStringify(v)).toBe('{"list":[3,1,{"y":2,"z":1}],"name":"織田"}');
  });

  it('-0 視為 0', () => {
    expect(canonicalStringify(-0)).toBe('0');
  });

  it('undefined 欄位視為不存在（02 §3.4 第 1 點禁 undefined 之防禦）', () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('NaN／Infinity 立即 throw（02 §3.4 第 2 點）', () => {
    expect(() => canonicalStringify(Number.NaN)).toThrow();
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('Map/Set 等非純物件立即 throw（02 §3.4 第 1 點）', () => {
    expect(() => canonicalStringify(new Map())).toThrow();
    expect(() => canonicalStringify(new Set())).toThrow();
  });
});

describe('fnv1a64（M1-F3：02 §5.4 採 64-bit，見 §8）', () => {
  it('對空字串有固定測試向量（同 17 §7-T2／tests/helpers/hash.ts 之測試向量）', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });

  it('對已知字串輸出穩定的十六進位雜湊', () => {
    const first = fnv1a64('天下布武');
    const second = fnv1a64('天下布武');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('stateHash（02 §5.4；transient 剔除見 §3.4 第 6 點）', () => {
  it('同一 state 兩次 hash 一致', () => {
    const state = buildState();
    expect(stateHash(state)).toBe(stateHash(state));
  });

  it('頂層 key 順序打亂後 hash 不變', () => {
    const state = buildState();
    const shuffled = shuffleKeys(state);
    expect(stateHash(shuffled)).toBe(stateHash(state));
  });

  it('巢狀物件（meta）key 順序打亂後 hash 不變', () => {
    const state = buildState();
    const shuffled: GameState = { ...state, meta: shuffleKeys(state.meta) };
    expect(stateHash(shuffled)).toBe(stateHash(state));
  });

  it('ai.intentLog 內容不影響 hash（transient 剔除，勘誤 E-60）', () => {
    const base = buildState();
    const withIntents: GameState = {
      ...base,
      ai: { ...base.ai, intentLog: [dummyIntent('expand.select'), dummyIntent('defense.hold')] },
    };
    expect(stateHash(withIntents)).toBe(stateHash(base));
  });

  it('不同 intentLog 內容彼此之間 hash 亦相同（只要其餘欄位相同）', () => {
    const base = buildState();
    const intentsA: GameState = { ...base, ai: { ...base.ai, intentLog: [dummyIntent('a')] } };
    const intentsB: GameState = {
      ...base,
      ai: { ...base.ai, intentLog: [dummyIntent('b'), dummyIntent('c')] },
    };
    expect(stateHash(intentsA)).toBe(stateHash(intentsB));
  });

  it('不改動傳入的原 state（§3.4 第 6 點：淺拷貝、不變動記憶體中的原 state）', () => {
    const state = buildState();
    const intentLogRef = state.ai.intentLog;
    stateHash(state);
    expect(state.ai.intentLog).toBe(intentLogRef);
    expect(state.ai.intentLog).toEqual([]);
  });

  it('其餘欄位真的不同時 hash 亦不同（雜湊非恆真）', () => {
    const state = buildState();
    const changed: GameState = { ...state, time: { ...state.time, day: 1 } };
    expect(stateHash(changed)).not.toBe(stateHash(state));
  });
});

describe('nextId（02 §5.3：六位流水，決定論）', () => {
  it('各 kind 產生之 ID 符合對應 regex（02 §3.2）', () => {
    const state = buildState();
    expect(nextId(state, 'army')).toMatch(ID_PATTERN.ArmyId);
    expect(nextId(state, 'battle')).toMatch(ID_PATTERN.BattleId);
    expect(nextId(state, 'siege')).toMatch(ID_PATTERN.SiegeId);
    expect(nextId(state, 'corps')).toMatch(ID_PATTERN.CorpsId);
    expect(nextId(state, 'proposal')).toMatch(ID_PATTERN.ProposalId);
    expect(nextId(state, 'report')).toMatch(ID_PATTERN.ReportId);
    expect(nextId(state, 'transport')).toMatch(ID_PATTERN.TransportId);
    expect(nextId(state, 'plot')).toMatch(ID_PATTERN.PlotId);
  });

  it('前綴與 kind 名不同者（proposal→prop／report→rep）正確對應', () => {
    const state = buildState();
    expect(nextId(state, 'proposal')).toBe('prop.000001');
    expect(nextId(state, 'report')).toBe('rep.000001');
  });

  it('流水號只增不減、連續呼叫遞增（重放決定論前提）', () => {
    const state = buildState();
    expect(nextId(state, 'army')).toBe('army.000001');
    expect(nextId(state, 'army')).toBe('army.000002');
    expect(nextId(state, 'army')).toBe('army.000003');
    expect(state.meta.nextSerials.army).toBe(4);
  });

  it('只遞增被呼叫的 kind，其餘 kind 之流水號不受影響', () => {
    const state = buildState();
    nextId(state, 'army');
    nextId(state, 'army');
    expect(state.meta.nextSerials.army).toBe(3);
    expect(state.meta.nextSerials.battle).toBe(1);
    expect(state.meta.nextSerials.plot).toBe(1);
  });
});
