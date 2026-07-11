// builder 骨架驗收測試（M1-14）＋資料側擴充測試（M2-8：補值規則／浪人生成／regions 白名單）。
// 規格：plan/02-data-model.md §7（builder 驗收：建置後 validateState 零違規、reports=[]、
// nextSerials 全 1）；plan/18-roadmap.md M1-13／M1-14（tiny 劇本＋builder）／M2-8（builder 資料側：
// 14-T4、本文件 §8-D5——子集建局 validateState 零違規、同 seed 浪人相同）。

import { describe, expect, it } from 'vitest';
import {
  buildGameState,
  buildGameStateFromScenario,
  deriveScenarioInput,
  loadScenarioBundle,
} from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { dayToCalendar } from '../../src/core/systems/time';
import type { ClanId, DistrictId } from '../../src/core/state/ids';
import {
  CLAN_ALPHA,
  CLAN_BETA,
  PERSONA_DEFAULT,
  TINY_SCENARIO,
  TINY_SEED,
  TINY_START_DAY,
  buildTinyState,
} from '../fixtures/tiny';
import { SCENARIO_BUNDLE_FIXTURE } from '../fixtures/scenarioBundle';

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

// ═══════════════════════════════════════════════════════════════════
// M2-8｜builder 資料側：zod 劇本載入
// ═══════════════════════════════════════════════════════════════════

/** 滿足 `zScenario` 全部長度約束（37/12/13/41）但內容為空殼的最小合法劇本原始 JSON。 */
function makeMinimalValidRawScenario(): unknown {
  const traits = Array.from({ length: 37 }, (_, i) => ({
    id: `trait.t${String(i)}`,
    name: '測試',
    rarity: 'common',
  }));
  const tactics = Array.from({ length: 12 }, (_, i) => ({
    id: `tac.t${String(i)}`,
    name: '測試',
    unlockTraitId: null,
  }));
  const policies = Array.from({ length: 13 }, (_, i) => ({
    id: `pol.p${String(i)}`,
    name: '測試',
    prestigeReq: 0,
    costGold: 0,
    exclusiveWith: [],
  }));
  const personas = Array.from({ length: 41 }, (_, i) => ({
    id: `persona.p${String(i)}`,
    aggression: 50,
    diplomacy: 50,
    development: 50,
    loyalty: 50,
    ambition: 50,
  }));
  return {
    id: 's-empty',
    provinces: [],
    castles: [],
    districts: [],
    roads: [],
    clans: [],
    diplomacy: { pacts: [], wars: [], sentiments: [] },
    events: [],
    officers: Array.from({ length: 9 }, () => []),
    catalogs: { traits, policies, tactics, personas },
  };
}

describe('loadScenarioBundle（M2-8：zod 劇本載入，14-T4）', () => {
  it('合法劇本原始 JSON 通過 zod 解析', () => {
    const bundle = loadScenarioBundle(makeMinimalValidRawScenario());
    expect(bundle.id).toBe('s-empty');
    expect(bundle.catalogs.traits).toHaveLength(37);
    expect(bundle.officers).toHaveLength(9);
  });

  it('非法劇本（特性數不足 37）被 zod 拒絕', () => {
    const raw = makeMinimalValidRawScenario() as { catalogs: { traits: unknown[] } };
    raw.catalogs.traits = raw.catalogs.traits.slice(0, 36);
    expect(() => loadScenarioBundle(raw)).toThrow();
  });

  it('非法劇本（缺 id 欄位）被 zod 拒絕', () => {
    const raw = makeMinimalValidRawScenario() as Record<string, unknown>;
    delete raw.id;
    expect(() => loadScenarioBundle(raw)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// M2-8｜builder 資料側：補值規則＋子集建局
// ═══════════════════════════════════════════════════════════════════

const BUNDLE_OPTS_FULL = {
  appVersion: '0.0.0-test',
  seed: 42,
  playerClanId: 'clan.alpha' as ClanId,
  difficulty: 'normal' as const,
};

describe('deriveScenarioInput／buildGameStateFromScenario（M2-8：14 §5.3 補值規則全表）', () => {
  it('全載（不傳 regions）建局後 validateState 零違規', () => {
    const state = buildGameStateFromScenario(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    expect(validateState(state)).toEqual([]);
  });

  it('officer.status 依 clanId 推導（serving／ronin）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const lord = input.officers.find((o) => o.id === 'off.alpha-lord');
    expect(lord?.status).toBe('serving');
    const ronin = input.officers.filter((o) => o.status === 'ronin' && o.clanId === null);
    expect(ronin.length).toBeGreaterThan(0);
  });

  it('officer.kinship 由 isKin 推導（true→kin／false→tozama）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    expect(input.officers.find((o) => o.id === 'off.alpha-lord')?.kinship).toBe('kin');
    expect(input.officers.find((o) => o.id === 'off.alpha-retainer')?.kinship).toBe('tozama');
  });

  it('debutYear／debutClanId／debutCastleId 缺欄位時依 14 §5.3 推導', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const lord = input.officers.find((o) => o.id === 'off.alpha-lord');
    expect(lord?.debutYear).toBe(1520 + 15); // birthYear + BAL.comingOfAgeAge
    expect(lord?.debutClanId).toBe('clan.alpha'); // 缺欄位 → clanId
    expect(lord?.debutCastleId).toBe('castle.a1'); // 缺欄位 → locationCastleId
  });

  it('當主忠誠恆 100（INV-08）；其餘 serving 依 06 §3.6.1 公式（範圍合法）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    expect(input.officers.find((o) => o.id === 'off.alpha-lord')?.loyalty).toBe(100);
    expect(input.officers.find((o) => o.id === 'off.beta-lord')?.loyalty).toBe(100);
    const retainer = input.officers.find((o) => o.id === 'off.alpha-retainer');
    expect(retainer?.loyalty).toBeGreaterThanOrEqual(0);
    expect(retainer?.loyalty).toBeLessThanOrEqual(100);
  });

  it('district.ownerClanId 衍生自所轄城 ownerClanId（§8-D7）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    expect(input.districts.find((d) => d.id === 'dist.a1x')?.ownerClanId).toBe('clan.alpha');
    expect(input.districts.find((d) => d.id === 'dist.b1x')?.ownerClanId).toBe('clan.beta');
  });

  it('castle.durability 依 tier 基準值推導（maxDurability=null 時）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const a1 = input.castles.find((c) => c.id === 'castle.a1');
    expect(a1?.durability).toBe(3000); // BAL.durabilityMain（tier='main'）
    expect(a1?.maxDurability).toBe(3000);
  });

  it('浪人程序生成 BAL.roninPoolSize（40）名，clanId=null／status=ronin', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const ronin = input.officers.filter((o) => o.id.startsWith('off.ronin-'));
    expect(ronin).toHaveLength(40);
    for (const o of ronin) {
      expect(o.clanId).toBeNull();
      expect(o.status).toBe('ronin');
      expect(o.rank).toBe('kumigashira');
    }
  });

  it('外交：wars/sentiments materialize 進 diplomacyRows（全載時 alpha/beta 皆存在）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const row = input.diplomacyRows?.['clan.alpha|clan.beta' as never];
    expect(row).toBeDefined();
    expect(row?.lastHostileDay).toBe(0);
    expect(row?.sentimentAtoB).toBe(20);
    expect(row?.sentimentBtoA).toBe(25);
  });
});

describe('regions 白名單載入（M2-8：18 §8-D5）', () => {
  it('僅載 tokai：kinki 之勢力/城/郡不出現，跨地方接縫邊被剔除，仍零違規', () => {
    const state = buildGameStateFromScenario(SCENARIO_BUNDLE_FIXTURE, {
      ...BUNDLE_OPTS_FULL,
      regions: ['tokai'],
    });
    expect(validateState(state)).toEqual([]);
    expect(state.clans['clan.beta' as ClanId]).toBeUndefined();
    expect(Object.keys(state.clans)).toEqual(['clan.alpha']);
    expect(state.castles['castle.b1' as never]).toBeUndefined();
    expect(state.districts['dist.b1x' as DistrictId]).toBeUndefined();
    // 跨地方接縫邊、以及 kinki 內部邊皆不應存在。
    expect(Object.values(state.roads).some((r) => r.id === 'road.a1-b1-01')).toBe(false);
    expect(Object.values(state.roads).some((r) => r.id === 'road.b1-b1x-01')).toBe(false);
    expect(Object.values(state.roads).some((r) => r.id === 'road.a1-a1x-01')).toBe(true);
  });

  it('僅載 tokai：未載入勢力（beta）不建外交列', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, {
      ...BUNDLE_OPTS_FULL,
      regions: ['tokai'],
    });
    expect(Object.keys(input.diplomacyRows ?? {})).toHaveLength(0);
  });

  it('僅載 tokai：武將僅保留 tokai 檔且駐在城仍存在者（beta 官員全數被剔除）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, {
      ...BUNDLE_OPTS_FULL,
      regions: ['tokai'],
    });
    expect(input.officers.some((o) => o.id === 'off.beta-lord')).toBe(false);
    expect(input.officers.some((o) => o.id === 'off.alpha-lord')).toBe(true);
  });

  it('僅載 tokai：40 名浪人仍全數生成（安置於僅存的城）', () => {
    const input = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, {
      ...BUNDLE_OPTS_FULL,
      regions: ['tokai'],
    });
    const ronin = input.officers.filter((o) => o.id.startsWith('off.ronin-'));
    expect(ronin).toHaveLength(40);
    for (const o of ronin) {
      expect(o.locationCastleId).toBe('castle.a1');
    }
  });
});

describe('浪人程序生成決定論（M2-8：14 §3.8，同 seed 浪人相同）', () => {
  it('同 seed 兩次 deriveScenarioInput 產生完全相同的浪人序列', () => {
    const a = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const b = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const roninA = a.officers.filter((o) => o.id.startsWith('off.ronin-'));
    const roninB = b.officers.filter((o) => o.id.startsWith('off.ronin-'));
    expect(roninA).toEqual(roninB);
  });

  it('同 seed 兩次 buildGameStateFromScenario 產生位元相同的 rng 狀態與浪人', () => {
    const stateA = buildGameStateFromScenario(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const stateB = buildGameStateFromScenario(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    expect(stateA.rng).toEqual(stateB.rng);
    expect(stateA.officers).toEqual(stateB.officers);
  });

  it('不同 seed 產生不同的浪人序列（sanity：非恆定輸出）', () => {
    const a = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, { ...BUNDLE_OPTS_FULL, seed: 1 });
    const b = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, { ...BUNDLE_OPTS_FULL, seed: 2 });
    const roninA = a.officers.filter((o) => o.id.startsWith('off.ronin-'));
    const roninB = b.officers.filter((o) => o.id.startsWith('off.ronin-'));
    expect(roninA).not.toEqual(roninB);
  });
});

describe('applyInitialLoyalty 忠誠光環（M2-8：06 §3.3 trait.jinbo／trait.hitotarashi 同城光環）', () => {
  it('trait.jinbo 持有者使同城同勢力其他武將忠誠目標值 +3（不含自身）', () => {
    const withJinbo: typeof SCENARIO_BUNDLE_FIXTURE = {
      ...SCENARIO_BUNDLE_FIXTURE,
      officers: SCENARIO_BUNDLE_FIXTURE.officers.map((regionOfficers) =>
        regionOfficers.map((o) =>
          o.id === 'off.alpha-lord' ? { ...o, traits: ['trait.jinbo'] } : o,
        ),
      ),
    };
    const baseline = deriveScenarioInput(SCENARIO_BUNDLE_FIXTURE, BUNDLE_OPTS_FULL);
    const withAura = deriveScenarioInput(withJinbo, BUNDLE_OPTS_FULL);
    const baseLoyalty = baseline.officers.find((o) => o.id === 'off.alpha-retainer')?.loyalty ?? 0;
    const auraLoyalty = withAura.officers.find((o) => o.id === 'off.alpha-retainer')?.loyalty ?? 0;
    expect(auraLoyalty - baseLoyalty).toBe(3);
  });
});
