// tools/validate.ts（M2-2；14-T2）驗收測試。
// 驗收（14 §7-T2／18-roadmap M2-2）：「對每條檢查各構造 1 個違規 fixture 被偵測」。
//
// 策略：先建一個「乾淨基準 world」`base()`——除 V7（規模：小 fixture 天生城/郡/武將數遠低於全國
// 區間）與 V15（地方配額偏差，同理）外，不觸發任何 ERROR。每條檢查 Vk 各取 base() 覆寫一處使其
// 違規，斷言該 Vk 違規被偵測（且基準未觸發該 Vk）。另測 `--regions` 過濾、parseScenario（V1 zod）、
// 與 validateScenario 空資料提示。
import { describe, expect, it } from 'vitest';
import {
  checkWorld,
  scanForbiddenChars,
  parseScenario,
  filterWorldByRegions,
  validateScenario,
  parseArgs,
  loadRawScenario,
  formatViolation,
  type ScenarioWorld,
  type Violation,
  type RawScenarioInputs,
} from '../../tools/validate';
import type {
  CastleData,
  DistrictData,
  OfficerData,
  ClanData,
  ProvinceData,
  RoadEdgeData,
  TraitEntryData,
  TacticEntryData,
  PersonaEntryData,
} from '../../src/data/schemas';

// ── 型別化 factory（帶完整預設，供覆寫） ──
function mkCastle(over: Partial<CastleData> & Pick<CastleData, 'id'>): CastleData {
  return {
    name: '城',
    tier: 'branch',
    provinceId: 'prov.owari',
    pos: { x: 0, y: 0 },
    coastal: false,
    ownerClanId: 'clan.oda',
    lordId: null,
    directControl: true,
    maxDurability: null,
    soldiers: 1000,
    food: 2500,
    morale: 70,
    facilities: [],
    ...over,
  };
}
function mkDistrict(
  over: Partial<DistrictData> & Pick<DistrictData, 'id' | 'castleId'>,
): DistrictData {
  return {
    name: '郡',
    pos: { x: 0, y: 0 },
    isPort: false,
    stewardId: null,
    kokudaka: 40000,
    kokudakaCap: 56000,
    commerce: 200,
    commerceCap: 320,
    population: 13000,
    populationCap: 20000,
    publicOrder: 60,
    developFocus: 'agri',
    ...over,
  };
}
function mkOfficer(over: Partial<OfficerData> & Pick<OfficerData, 'id'>): OfficerData {
  return {
    name: '武將',
    clanId: 'clan.oda',
    locationCastleId: 'castle.kiyosu',
    ldr: 60,
    val: 60,
    int: 60,
    pol: 60,
    traits: [],
    tactics: [],
    rank: 'samurai-taisho',
    isKin: false,
    birthYear: 1530,
    deathYear: 1580,
    ...over,
  };
}
function mkClan(over: Partial<ClanData> & Pick<ClanData, 'id'>): ClanData {
  return {
    name: '家',
    leaderId: 'off.oda-nobunaga',
    homeCastleId: 'castle.kiyosu',
    gold: 1000,
    prestige: 200,
    courtRank: 'none',
    shogunateTitle: 'none',
    personaId: 'persona.oda',
    colorIndex: 5,
    ...over,
  };
}
function mkProvince(over: Partial<ProvinceData> & Pick<ProvinceData, 'id'>): ProvinceData {
  return { name: '國', region: 'tokai', labelPos: { x: 0, y: 0 }, ...over };
}
// RoadEdge.a/b 為 MapNodeId 品牌型別（zNodeId 以 type-guard refine 收窄），測試以字串傳入後轉型。
function mkRoad(
  over: { id: string; a: string; b: string } & Partial<Omit<RoadEdgeData, 'id' | 'a' | 'b'>>,
): RoadEdgeData {
  const { a, b, ...rest } = over;
  return {
    type: 'land',
    grade: 2,
    baseDays: 1,
    ...rest,
    a: a as RoadEdgeData['a'],
    b: b as RoadEdgeData['b'],
  };
}

const TRAITS: TraitEntryData[] = [
  { id: 'trait.gunshin', name: '軍神', rarity: 'legendary' },
  { id: 'trait.teppo', name: '鐵砲', rarity: 'rare' },
];
const TACTICS: TacticEntryData[] = [
  { id: 'tac.charge', name: '突擊', unlockTraitId: null },
  { id: 'tac.teppo3', name: '鐵砲三段', unlockTraitId: 'trait.teppo' },
];
const PERSONAS: PersonaEntryData[] = [
  { id: 'persona.oda', aggression: 60, diplomacy: 40, development: 50, loyalty: 50, ambition: 70 },
  {
    id: 'persona.imagawa',
    aggression: 50,
    diplomacy: 50,
    development: 50,
    loyalty: 50,
    ambition: 50,
  },
];

/** 乾淨基準 world：僅 V7（規模）＋V15（配額）會觸發，其餘 ERROR 均無。 */
function base(): ScenarioWorld {
  return {
    id: 'test',
    provinces: [
      mkProvince({ id: 'prov.owari', name: '尾張', region: 'tokai' }),
      mkProvince({ id: 'prov.suruga', name: '駿河', region: 'tokai' }),
    ],
    castles: [
      mkCastle({
        id: 'castle.kiyosu',
        name: '尾張本城',
        tier: 'main',
        provinceId: 'prov.owari',
        pos: { x: 1000, y: 1000 },
        ownerClanId: 'clan.oda',
        lordId: 'off.oda-nobunaga',
      }),
      mkCastle({
        id: 'castle.sunpu',
        name: '駿河本城',
        tier: 'main',
        provinceId: 'prov.suruga',
        pos: { x: 1200, y: 1000 },
        ownerClanId: 'clan.imagawa',
        lordId: 'off.imagawa-yoshimoto',
      }),
    ],
    districts: [
      mkDistrict({
        id: 'dist.owari-a',
        name: '愛知郡',
        castleId: 'castle.kiyosu',
        pos: { x: 1000, y: 1050 },
      }),
      mkDistrict({
        id: 'dist.owari-b',
        name: '春日井郡',
        castleId: 'castle.kiyosu',
        pos: { x: 1050, y: 1000 },
      }),
      mkDistrict({
        id: 'dist.suruga-a',
        name: '安倍郡',
        castleId: 'castle.sunpu',
        pos: { x: 1200, y: 1050 },
      }),
      mkDistrict({
        id: 'dist.suruga-b',
        name: '有度郡',
        castleId: 'castle.sunpu',
        pos: { x: 1250, y: 1000 },
      }),
    ],
    roads: [
      mkRoad({ id: 'road.kiyosu-owaria-01', a: 'castle.kiyosu', b: 'dist.owari-a' }),
      mkRoad({ id: 'road.kiyosu-owarib-01', a: 'castle.kiyosu', b: 'dist.owari-b' }),
      mkRoad({ id: 'road.kiyosu-sunpu-01', a: 'castle.kiyosu', b: 'castle.sunpu' }),
      mkRoad({ id: 'road.sunpu-surugaa-01', a: 'castle.sunpu', b: 'dist.suruga-a' }),
      mkRoad({ id: 'road.sunpu-surugab-01', a: 'castle.sunpu', b: 'dist.suruga-b' }),
    ],
    clans: [
      mkClan({
        id: 'clan.oda',
        name: '織田家',
        leaderId: 'off.oda-nobunaga',
        homeCastleId: 'castle.kiyosu',
        personaId: 'persona.oda',
        colorIndex: 5,
      }),
      mkClan({
        id: 'clan.imagawa',
        name: '今川家',
        leaderId: 'off.imagawa-yoshimoto',
        homeCastleId: 'castle.sunpu',
        personaId: 'persona.imagawa',
        colorIndex: 31,
      }),
    ],
    diplomacy: { pacts: [], wars: [], sentiments: [] },
    officerGroups: [
      {
        fileRegion: 'tokai',
        declaredRegion: 'tokai',
        officers: [
          mkOfficer({
            id: 'off.oda-nobunaga',
            name: '織田信長',
            clanId: 'clan.oda',
            locationCastleId: 'castle.kiyosu',
            rank: 'shukuro',
            birthYear: 1534,
            deathYear: 1582,
            tactics: ['tac.charge'],
          }),
          mkOfficer({
            id: 'off.imagawa-yoshimoto',
            name: '今川義元',
            clanId: 'clan.imagawa',
            locationCastleId: 'castle.sunpu',
            rank: 'shukuro',
            birthYear: 1519,
            deathYear: 1570,
            tactics: ['tac.charge'],
          }),
        ],
      },
    ],
    events: [],
    traits: TRAITS,
    tactics: TACTICS,
    policies: [],
    personas: PERSONAS,
    outline: null,
  };
}

// V10 fixture 用的日文新字體字元（U+56FD，正體為「國」U+570B）。以 code point 建構，避免本測試
// 原始碼自身觸發 repo 全域簡體／新字體掃描器（tools/scan-simplified.ts；同一黑名單真相）。
const KUNI_SHINJITAI = String.fromCodePoint(0x56fd);

const checks = (vs: readonly Violation[]): Set<string> => new Set(vs.map((v) => v.check));
const errorsExcept = (vs: readonly Violation[], except: string): Violation[] =>
  vs.filter((v) => v.severity === 'ERROR' && v.check !== except);

describe('base() 基準：僅 V7（規模）觸發 ERROR', () => {
  it('checkWorld(base()) 除 V7 外無其他 ERROR，且 V7、V15 有觸發', () => {
    const vs = checkWorld(base());
    expect(errorsExcept(vs, 'V7')).toEqual([]);
    expect(checks(vs).has('V7')).toBe(true); // 小 fixture 城/郡/武將數遠低於全國區間
    expect(vs.some((v) => v.check === 'V15' && v.severity === 'WARN')).toBe(true);
  });
});

describe('每條檢查各一違規 fixture 被偵測（14-T2）', () => {
  it('V1：officers 檔 region 與檔名不一致', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: w.officerGroups.map((g) => ({ ...g, declaredRegion: 'kinki' as const })),
    };
    expect(checks(checkWorld(bad)).has('V1')).toBe(true);
  });

  it('V2：全域 ID 跨檔重複（兩武將同 id）', () => {
    const w = base();
    const dup = mkOfficer({
      id: 'off.oda-nobunaga',
      name: '影武者',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
    });
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [{ ...w.officerGroups[0]!, officers: [...w.officerGroups[0]!.officers, dup] }],
    };
    const vs = checkWorld(bad);
    expect(vs.some((v) => v.check === 'V2' && v.message.includes('重複'))).toBe(true);
  });

  it('V2：前綴 regex 不合（勢力 id 缺 clan. 前綴）', () => {
    const w = base();
    const bad: ScenarioWorld = { ...w, clans: [{ ...w.clans[0]!, id: 'oda' }, w.clans[1]!] };
    expect(checkWorld(bad).some((v) => v.check === 'V2' && v.message.includes('前綴'))).toBe(true);
  });

  it('V3：城 lordId 引用不存在武將', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      castles: w.castles.map((c) => (c.id === 'castle.kiyosu' ? { ...c, lordId: 'off.ghost' } : c)),
    };
    expect(checkWorld(bad).some((v) => v.check === 'V3' && v.ids.includes('off.ghost'))).toBe(true);
  });

  it('V3：事件內引用不存在勢力', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      events: [
        {
          id: 'evt.test',
          name: '測試事件',
          once: true,
          window: { startDay: 0, endDay: null },
          conditions: [{ kind: 'clanAlive', clanId: 'clan.ghost' }],
          text: '測試',
          choices: [],
          effects: [],
        },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V3' && v.ids.includes('clan.ghost'))).toBe(
      true,
    );
  });

  it('V4：INV-09 本城 tier 非 main', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      castles: w.castles.map((c) =>
        c.id === 'castle.kiyosu' ? { ...c, tier: 'branch' as const } : c,
      ),
    };
    expect(checkWorld(bad).some((v) => v.check === 'V4' && v.message.includes('INV-09'))).toBe(
      true,
    );
  });

  it('V4：INV-04 城主身分未達 samurai-taisho', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        {
          ...w.officerGroups[0]!,
          officers: w.officerGroups[0]!.officers.map((o) =>
            o.id === 'off.oda-nobunaga' ? { ...o, rank: 'kumigashira' as const } : o,
          ),
        },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V4' && v.message.includes('INV-04'))).toBe(
      true,
    );
  });

  it('V4：INV-17 alliance 協定 months 為 null', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      diplomacy: {
        ...w.diplomacy,
        pacts: [
          { a: 'clan.oda', b: 'clan.imagawa', kind: 'alliance', months: null, vassalClanId: null },
        ],
      },
    };
    expect(checkWorld(bad).some((v) => v.check === 'V4' && v.message.includes('INV-17'))).toBe(
      true,
    );
  });

  it('V4：蜂窩欄位 kokudaka > kokudakaCap', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      districts: w.districts.map((d) => (d.id === 'dist.owari-a' ? { ...d, kokudaka: 999999 } : d)),
    };
    expect(checkWorld(bad).some((v) => v.check === 'V4' && v.message.includes('kokudaka'))).toBe(
      true,
    );
  });

  it('V4：INV-05 知行領主非所轄城勢力（stewardId 指向他勢力武將）', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      // dist.owari-a 屬 castle.kiyosu（clan.oda），改令知行領主為 off.imagawa-yoshimoto（clan.imagawa）。
      districts: w.districts.map((d) =>
        d.id === 'dist.owari-a' ? { ...d, stewardId: 'off.imagawa-yoshimoto' } : d,
      ),
    };
    expect(
      checkWorld(bad).some(
        (v) =>
          v.check === 'V4' && v.message.includes('INV-05') && v.message.includes('非所轄城勢力'),
      ),
    ).toBe(true);
  });

  it('V4：INV-05 武將受封郡數超過 fiefCapOf(rank) 上限', () => {
    const w = base();
    // kumigashira（足輕組頭）之 fiefMaxByRank 上限為 0，受封任何一郡即違規。
    const vassal = mkOfficer({
      id: 'off.oda-vassal',
      name: '組頭某',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      rank: 'kumigashira',
    });
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        { ...w.officerGroups[0]!, officers: [...w.officerGroups[0]!.officers, vassal] },
      ],
      districts: w.districts.map((d) =>
        d.id === 'dist.owari-a' ? { ...d, stewardId: 'off.oda-vassal' } : d,
      ),
    };
    expect(
      checkWorld(bad).some(
        (v) => v.check === 'V4' && v.message.includes('INV-05') && v.message.includes('超過上限'),
      ),
    ).toBe(true);
  });

  it('V5：街道圖不連通（移除橋接邊）', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      roads: w.roads.filter((r) => r.id !== 'road.kiyosu-sunpu-01'),
    };
    expect(checkWorld(bad).some((v) => v.check === 'V5' && v.message.includes('連通'))).toBe(true);
  });

  it('V5：海路端點非港郡', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      roads: w.roads.map((r) =>
        r.id === 'road.sunpu-surugaa-01' ? { ...r, type: 'sea' as const, grade: 1 as const } : r,
      ),
    };
    // dist.suruga-a isPort=false 且 castle.sunpu 非港 → 兩端皆非港郡
    expect(checkWorld(bad).some((v) => v.check === 'V5' && v.message.includes('港郡'))).toBe(true);
  });

  it('V6：城轄郡數超出 [2,4]（某城僅 1 郡）', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      districts: w.districts.filter((d) => d.id !== 'dist.owari-b'),
      roads: w.roads.filter((r) => r.id !== 'road.kiyosu-owarib-01'),
    };
    const vs = checkWorld(bad);
    expect(vs.some((v) => v.check === 'V6' && v.ids.includes('castle.kiyosu'))).toBe(true);
  });

  it('V7：全國規模低於區間（基準即觸發）', () => {
    expect(checks(checkWorld(base())).has('V7')).toBe(true);
  });

  it('V8：deathYear ≤ birthYear', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        {
          ...w.officerGroups[0]!,
          officers: w.officerGroups[0]!.officers.map((o) =>
            o.id === 'off.imagawa-yoshimoto' ? { ...o, deathYear: 1500 } : o,
          ),
        },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V8')).toBe(true);
  });

  it('V9：仕官武將所在城非本家', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        {
          ...w.officerGroups[0]!,
          officers: w.officerGroups[0]!.officers.map((o) =>
            o.id === 'off.oda-nobunaga' ? { ...o, locationCastleId: 'castle.sunpu' } : o,
          ),
        },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V9' && v.message.includes('非本家'))).toBe(
      true,
    );
  });

  it('V9：同名武將未以生年後綴消歧', () => {
    const w = base();
    const twin = mkOfficer({
      id: 'off.oda-nobunaga-2',
      name: '織田信長',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      birthYear: 1534,
      deathYear: 1590,
    });
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        { ...w.officerGroups[0]!, officers: [...w.officerGroups[0]!.officers, twin] },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V9' && v.message.includes('消歧'))).toBe(true);
  });

  it('V10：name 值含日文新字體（U+56FD → 國）', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      districts: w.districts.map((d) =>
        d.id === 'dist.owari-a' ? { ...d, name: `${KUNI_SHINJITAI}境郡` } : d,
      ),
    };
    const vs = checkWorld(bad);
    expect(vs.some((v) => v.check === 'V10' && v.message.includes(KUNI_SHINJITAI))).toBe(true);
    // 直接呼叫純掃描亦命中。
    expect(scanForbiddenChars(bad).length).toBeGreaterThan(0);
  });

  it('V11：戰法缺解鎖特性', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      officerGroups: [
        {
          ...w.officerGroups[0]!,
          officers: w.officerGroups[0]!.officers.map((o) =>
            o.id === 'off.oda-nobunaga' ? { ...o, tactics: ['tac.teppo3'], traits: [] } : o,
          ),
        },
      ],
    };
    expect(checkWorld(bad).some((v) => v.check === 'V11' && v.ids.includes('trait.teppo'))).toBe(
      true,
    );
  });

  it('V12：勢力 colorIndex 與 §3.3 釘選值不符', () => {
    const w = base();
    const bad: ScenarioWorld = { ...w, clans: [{ ...w.clans[0]!, colorIndex: 32 }, w.clans[1]!] };
    expect(checkWorld(bad).some((v) => v.check === 'V12')).toBe(true);
  });

  it('V12：相鄰勢力色環距 < 4', () => {
    const w = base();
    // 讓 imagawa 用 3（與 oda 的 5 環距 2）；同時 imagawa 釘選值本為 31，故亦會有釘選 V12，
    // 但此處聚焦「相鄰環距」訊息。
    const bad: ScenarioWorld = { ...w, clans: [w.clans[0]!, { ...w.clans[1]!, colorIndex: 3 }] };
    expect(checkWorld(bad).some((v) => v.check === 'V12' && v.message.includes('環距'))).toBe(true);
  });

  it('V13：錨點城座標偏離基準 > 容差', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      castles: w.castles.map((c) =>
        c.id === 'castle.kiyosu' ? { ...c, name: '清洲城', pos: { x: 100, y: 100 } } : c,
      ),
    };
    expect(checkWorld(bad).some((v) => v.check === 'V13' && v.message.includes('錨點'))).toBe(true);
  });

  it('V13：兩節點座標完全相同', () => {
    const w = base();
    const bad: ScenarioWorld = {
      ...w,
      districts: w.districts.map((d) =>
        d.id === 'dist.owari-b' ? { ...d, pos: { x: 1000, y: 1050 } } : d,
      ),
    };
    // dist.owari-b 與 dist.owari-a 同座標 (1000,1050)
    expect(checkWorld(bad).some((v) => v.check === 'V13' && v.message.includes('座標'))).toBe(true);
  });

  it('V14：branch 城 facilities 超過 slot 數', () => {
    const w = base();
    const branch = mkCastle({
      id: 'castle.branch',
      name: '支城',
      tier: 'branch',
      provinceId: 'prov.owari',
      pos: { x: 1300, y: 1300 },
      ownerClanId: 'clan.oda',
      facilities: ['fac.a', 'fac.b', 'fac.c', 'fac.d'],
    });
    const bad: ScenarioWorld = { ...w, castles: [...w.castles, branch] };
    expect(checkWorld(bad).some((v) => v.check === 'V14' && v.ids.includes('castle.branch'))).toBe(
      true,
    );
  });

  it('V15（WARN）：地方配額偏差 > 10%（基準即觸發）', () => {
    const vs = checkWorld(base());
    expect(vs.some((v) => v.check === 'V15' && v.severity === 'WARN')).toBe(true);
  });
});

describe('--regions 白名單批次模式', () => {
  function twoRegionWorld(): ScenarioWorld {
    const w = base();
    // 追加一個 kinki 國＋城＋郡＋勢力＋officers 檔。
    return {
      ...w,
      provinces: [
        ...w.provinces,
        mkProvince({ id: 'prov.yamashiro', name: '山城', region: 'kinki' }),
      ],
      castles: [
        ...w.castles,
        mkCastle({
          id: 'castle.nijo',
          name: '二條御所',
          tier: 'main',
          provinceId: 'prov.yamashiro',
          pos: { x: 1701, y: 2889 },
          ownerClanId: 'clan.ashikaga',
          lordId: 'off.ashikaga-yoshiteru',
        }),
      ],
      districts: [
        ...w.districts,
        mkDistrict({
          id: 'dist.yamashiro-a',
          name: '愛宕郡',
          castleId: 'castle.nijo',
          pos: { x: 1701, y: 2900 },
        }),
        mkDistrict({
          id: 'dist.yamashiro-b',
          name: '葛野郡',
          castleId: 'castle.nijo',
          pos: { x: 1710, y: 2889 },
        }),
      ],
      roads: [
        ...w.roads,
        mkRoad({ id: 'road.nijo-atago-01', a: 'castle.nijo', b: 'dist.yamashiro-a' }),
        mkRoad({ id: 'road.nijo-kadono-01', a: 'castle.nijo', b: 'dist.yamashiro-b' }),
      ],
      clans: [
        ...w.clans,
        mkClan({
          id: 'clan.ashikaga',
          name: '足利將軍家',
          leaderId: 'off.ashikaga-yoshiteru',
          homeCastleId: 'castle.nijo',
          personaId: 'persona.oda',
          colorIndex: 16,
        }),
      ],
      officerGroups: [
        ...w.officerGroups,
        {
          fileRegion: 'kinki',
          declaredRegion: 'kinki',
          officers: [
            mkOfficer({
              id: 'off.ashikaga-yoshiteru',
              name: '足利義輝',
              clanId: 'clan.ashikaga',
              locationCastleId: 'castle.nijo',
              rank: 'shukuro',
              birthYear: 1536,
              deathYear: 1565,
            }),
          ],
        },
      ],
    };
  }

  it('filterWorldByRegions 只保留白名單地方的城/郡/勢力/officers/roads', () => {
    const filtered = filterWorldByRegions(twoRegionWorld(), ['tokai']);
    expect(filtered.castles.some((c) => c.id === 'castle.nijo')).toBe(false);
    expect(filtered.districts.some((d) => d.castleId === 'castle.nijo')).toBe(false);
    expect(filtered.clans.some((c) => c.id === 'clan.ashikaga')).toBe(false);
    expect(filtered.officerGroups.some((g) => g.fileRegion === 'kinki')).toBe(false);
    expect(filtered.roads.some((r) => r.a === 'castle.nijo' || r.b === 'castle.nijo')).toBe(false);
    // tokai 內容保留。
    expect(filtered.castles.some((c) => c.id === 'castle.kiyosu')).toBe(true);
  });

  it('批次模式 V7 用配額縮放；過濾後不因 kinki 節點誤報 V5/V3', () => {
    const full = twoRegionWorld();
    const filtered = filterWorldByRegions(full, ['tokai']);
    const vs = checkWorld(filtered, { regions: ['tokai'] });
    // 過濾後 tokai 子圖仍單一連通分量、引用完整 → 無 V3/V5 ERROR。
    expect(vs.some((v) => v.check === 'V5' && v.severity === 'ERROR')).toBe(false);
    expect(vs.some((v) => v.check === 'V3' && v.severity === 'ERROR')).toBe(false);
    // V7 批次期望＝tokai 配額（城 16 等），基準只有 2 城 → 仍低於帶寬，V7 觸發（規模檢查生效）。
    expect(vs.some((v) => v.check === 'V7')).toBe(true);
  });

  it('parseArgs 解析 --regions 與 scenarioId', () => {
    expect(parseArgs(['s1560', '--regions=tokai,kinki'])).toEqual({
      scenarioId: 's1560',
      regions: ['tokai', 'kinki'],
    });
    expect(parseArgs([])).toEqual({ scenarioId: 's1560' });
  });
});

describe('parseScenario（V1 zod）與 validateScenario', () => {
  it('parseScenario：castles 非法（tier 錯）→ V1 違規', () => {
    const raw: RawScenarioInputs = {
      id: 'test',
      castles: [
        {
          id: 'castle.x',
          name: '城',
          tier: 'fortress',
          provinceId: 'prov.owari',
          pos: { x: 1, y: 1 },
          coastal: false,
          ownerClanId: 'clan.oda',
          lordId: null,
          soldiers: 1,
          food: 1,
        },
      ],
    };
    const { violations } = parseScenario(raw);
    expect(violations.some((v) => v.check === 'V1' && v.message.includes('castles.json'))).toBe(
      true,
    );
  });

  it('parseScenario：officers 檔 region 與檔名不一致 → checkWorld 報 V1', () => {
    const raw: RawScenarioInputs = {
      id: 'test',
      officers: [
        {
          region: 'tokai',
          value: {
            version: 1,
            region: 'kinki',
            officers: [
              {
                id: 'off.x',
                name: '甲',
                clanId: null,
                locationCastleId: 'castle.x',
                ldr: 1,
                val: 1,
                int: 1,
                pol: 1,
                birthYear: 1530,
                deathYear: 1580,
              },
            ],
          },
        },
      ],
    };
    const { world } = parseScenario(raw);
    expect(world.officerGroups[0]?.fileRegion).toBe('tokai');
    expect(world.officerGroups[0]?.declaredRegion).toBe('kinki');
    expect(checkWorld(world).some((v) => v.check === 'V1')).toBe(true);
  });

  it('validateScenario：不存在的劇本 → notice「尚無劇本資料」、無違規（資料夾缺席，確定性案例）', () => {
    const result = validateScenario('does-not-exist');
    expect(result.notice).toBe('尚無劇本資料');
    expect(result.errors).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('validateScenario(s1560)：回傳合法 ValidationResult（資料尚未落地時 notice；落地後跑完整檢查，不拋錯）', () => {
    // s1560 內容在 M2-9 起會由其他任務填入 JSON；本測試只確認介面契約穩定、不因並行狀態拋錯：
    // 尚無 JSON（僅 index.ts）→ notice「尚無劇本資料」；有 JSON → notice=null 且回傳 violations 陣列。
    const result = validateScenario('s1560');
    if (result.notice !== null) {
      expect(result.notice).toBe('尚無劇本資料');
      expect(result.violations).toEqual([]);
    } else {
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// M2-12（17-T8）：載入實際 s1560 資料的整合案例
// ═══════════════════════════════════════════════════════════════════
describe('M2-12：載入實際 s1560 資料跑 validate（18-roadmap M2-12／17 §3.6.1）', () => {
  it('V1：已落地批次（--regions=tokai,kinki）全綠（0 ERROR、0 WARN）', () => {
    // B1 東海（M2-9）＋B2 近畿（M2-10）已落地；全量（不帶 --regions）因僅 2/9 地方到位，
    // V7（全國規模）與 V15（地方配額）必然觸發（其餘 7 地方尚未落地，屬預期未完工狀態，非缺陷）——
    // 故本案例比照 wip.md 既有驗收方式，以 --regions 白名單模式驗證「已落地部分」乾淨。
    const result = validateScenario('s1560', { regions: ['tokai', 'kinki'] });
    expect(result.notice).toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('V3：刪除一名被引用的武將（clan.oda 當主 off.oda-nobunaga，記憶體內修改，不動實檔）→ 報錯含武將 id 與引用實體、可定位所屬 officers 檔', () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded).not.toBeNull();
    const { raw } = loaded!;
    expect(raw.officers).toBeDefined();

    const TARGET_OFFICER_ID = 'off.oda-nobunaga'; // clan.oda 的 leaderId（見 s1560/clans.json）
    const targetGroup = raw.officers!.find((f) =>
      (f.value as { officers?: { id: string }[] }).officers?.some(
        (o) => o.id === TARGET_OFFICER_ID,
      ),
    );
    expect(targetGroup).toBeDefined(); // 確認武將確實存在於某 officers/<region>.json（本案為 tokai）
    expect(targetGroup!.region).toBe('tokai');

    // 記憶體內刪除該武將（不寫回任何檔案）。
    const mutatedOfficers = raw.officers!.map((f) => {
      if (f !== targetGroup) return f;
      const val = f.value as { officers: { id: string }[] } & Record<string, unknown>;
      return {
        region: f.region,
        value: { ...val, officers: val.officers.filter((o) => o.id !== TARGET_OFFICER_ID) },
      };
    });
    const mutatedRaw: RawScenarioInputs = { ...raw, officers: mutatedOfficers };

    const { world, violations: v1 } = parseScenario(mutatedRaw);
    const violations = [...loaded!.violations, ...v1, ...checkWorld(world)];

    // 該武將同時是 clan.oda 的 leaderId 與其本城 castle.kiyosu 的 lordId，刪除後兩處引用皆斷裂。
    const hits = violations.filter(
      (v) => v.check === 'V3' && v.severity === 'ERROR' && v.ids.includes(TARGET_OFFICER_ID),
    );
    expect(hits.length).toBeGreaterThan(0);
    const messages = hits.map(formatViolation);
    // 錯誤可讀性（17 §3.6.1 V3）：每筆訊息皆含被刪武將 id（定位「誰不見了」）＋引用實體/欄位
    // （定位「路徑」）；所屬檔案（officers/tokai.json）由 targetGroup.region 已於上方斷言。
    expect(messages.every((m) => m.includes(TARGET_OFFICER_ID))).toBe(true);
    expect(messages.some((m) => m.includes('leaderId') && m.includes('clan.oda'))).toBe(true);
    expect(messages.some((m) => m.includes('lordId') && m.includes('castle.kiyosu'))).toBe(true);
  });
});
