// 劇本資料 zod schema 單元測試（14-T1 驗收：plan/18-roadmap.md M2-1）。
// 驗收兩件事：
// 1. plan/14-scenario-data.md §3.5（東海地方施工樣板）與 §3.9（evt.okehazama）的全部範例
//    JSON 片段，逐一以對應 schema parse 通過（片段原樣轉錄，僅將 JSONC 註解去除）。
// 2. 對 §4 定義的每個 schema，各構造至少一個非法樣本並斷言被拒（safeParse().success === false）。
import { describe, expect, it } from 'vitest';
import {
  zProvince,
  zProvincesFile,
  zCastle,
  zCastlesFile,
  zDistrict,
  zDistrictsFile,
  zPactInit,
  zWarEntry,
  zSentimentEntry,
  zClan,
  zClansFile,
  zOfficer,
  zOfficersFile,
  zEvent,
  zEventsFile,
  zEventCondition,
  zEventEffect,
  zTraitEntry,
  zTraitsFile,
  zTacticEntry,
  zTacticsFile,
  zPolicyEntry,
  zPoliciesFile,
  zPersonaEntry,
  zPersonasFile,
  zRoadEdge,
  zRoadsFile,
  zScenario,
} from '../../src/data/schemas';

// ═══════════════════════════════════════════════════════════════════
// §3.5.1 clans.json（東海三家＋外交區塊示例）
// ═══════════════════════════════════════════════════════════════════
const CLANS_JSON_EXAMPLE = {
  version: 1,
  clans: [
    {
      id: 'clan.oda',
      name: '織田家',
      leaderId: 'off.oda-nobunaga',
      homeCastleId: 'castle.kiyosu',
      gold: 2000,
      prestige: 250,
      courtRank: 'none',
      shogunateTitle: 'none',
      personaId: 'persona.oda',
      colorIndex: 5,
    },
    {
      id: 'clan.imagawa',
      name: '今川家',
      leaderId: 'off.imagawa-yoshimoto',
      homeCastleId: 'castle.sunpu',
      gold: 3500,
      prestige: 500,
      courtRank: 'ju5ge',
      shogunateTitle: 'none',
      personaId: 'persona.imagawa',
      colorIndex: 31,
    },
    {
      id: 'clan.matsudaira',
      name: '松平家',
      leaderId: 'off.matsudaira-motoyasu',
      homeCastleId: 'castle.okazaki',
      gold: 400,
      prestige: 120,
      courtRank: 'none',
      shogunateTitle: 'none',
      personaId: 'persona.matsudaira',
      colorIndex: 17,
    },
  ],
  diplomacy: {
    pacts: [
      { a: 'clan.imagawa', b: 'clan.takeda', kind: 'alliance', months: 48, vassalClanId: null },
      { a: 'clan.imagawa', b: 'clan.takeda', kind: 'marriage', months: null, vassalClanId: null },
      {
        a: 'clan.imagawa',
        b: 'clan.matsudaira',
        kind: 'vassal',
        months: null,
        vassalClanId: 'clan.matsudaira',
      },
    ],
    wars: [
      { a: 'clan.imagawa', b: 'clan.oda' },
      { a: 'clan.oda', b: 'clan.saito' },
    ],
    sentiments: [{ a: 'clan.oda', b: 'clan.saito', aToB: 20, bToA: 20 }],
  },
};

// ═══════════════════════════════════════════════════════════════════
// §3.5.2 castles.json（東海 10 城）
// ═══════════════════════════════════════════════════════════════════
const CASTLES_JSON_EXAMPLE = [
  {
    id: 'castle.kiyosu',
    name: '清洲城',
    tier: 'main',
    provinceId: 'prov.owari',
    pos: { x: 1966, y: 2838 },
    coastal: false,
    ownerClanId: 'clan.oda',
    lordId: 'off.oda-nobunaga',
    soldiers: 2600,
    food: 6500,
    facilities: ['fac.ichi'],
  },
  {
    id: 'castle.nagoya',
    name: '那古野城',
    tier: 'branch',
    provinceId: 'prov.owari',
    pos: { x: 1968, y: 2843 },
    coastal: true,
    ownerClanId: 'clan.oda',
    lordId: 'off.hayashi-hidesada',
    soldiers: 1400,
    food: 3500,
    facilities: [],
  },
  {
    id: 'castle.inuyama',
    name: '犬山城',
    tier: 'branch',
    provinceId: 'prov.owari',
    pos: { x: 1975, y: 2787 },
    coastal: false,
    ownerClanId: 'clan.oda',
    lordId: 'off.ikeda-tsuneoki',
    soldiers: 900,
    food: 2000,
    facilities: [],
  },
  {
    id: 'castle.sunpu',
    name: '駿府館',
    tier: 'main',
    provinceId: 'prov.suruga',
    pos: { x: 2312, y: 2897 },
    coastal: true,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.imagawa-yoshimoto',
    soldiers: 2600,
    food: 7000,
    facilities: ['fac.ichi', 'fac.jisha'],
  },
  {
    id: 'castle.kokokuji',
    name: '興國寺城',
    tier: 'branch',
    provinceId: 'prov.suruga',
    pos: { x: 2427, y: 2856 },
    coastal: true,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.katsurayama-ujimoto',
    soldiers: 1500,
    food: 3500,
    facilities: [],
  },
  {
    id: 'castle.kakegawa',
    name: '掛川城',
    tier: 'branch',
    provinceId: 'prov.totomi',
    pos: { x: 2226, y: 2953 },
    coastal: false,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.asahina-yasutomo',
    soldiers: 1700,
    food: 4000,
    facilities: [],
  },
  {
    id: 'castle.hikuma',
    name: '曳馬城',
    tier: 'branch',
    provinceId: 'prov.totomi',
    pos: { x: 2160, y: 2969 },
    coastal: true,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.ihara-tadatane',
    soldiers: 1600,
    food: 3800,
    facilities: [],
  },
  {
    id: 'castle.yoshida',
    name: '吉田城',
    tier: 'branch',
    provinceId: 'prov.mikawa',
    pos: { x: 2081, y: 2953 },
    coastal: true,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.ohara-shigezane',
    soldiers: 1600,
    food: 3800,
    facilities: [],
  },
  {
    id: 'castle.tahara',
    name: '田原城',
    tier: 'branch',
    provinceId: 'prov.mikawa',
    pos: { x: 2050, y: 2980 },
    coastal: true,
    ownerClanId: 'clan.imagawa',
    lordId: 'off.okabe-masatsuna',
    soldiers: 900,
    food: 2000,
    facilities: [],
  },
  {
    id: 'castle.okazaki',
    name: '岡崎城',
    tier: 'main',
    provinceId: 'prov.mikawa',
    pos: { x: 2029, y: 2905 },
    coastal: false,
    ownerClanId: 'clan.matsudaira',
    lordId: 'off.matsudaira-motoyasu',
    soldiers: 1300,
    food: 3200,
    facilities: [],
  },
];

// ═══════════════════════════════════════════════════════════════════
// §3.5.3 districts.json（東海 22 郡）
// ═══════════════════════════════════════════════════════════════════
const DISTRICTS_JSON_EXAMPLE = [
  {
    id: 'dist.owari-kasugai',
    name: '春日井郡',
    castleId: 'castle.kiyosu',
    pos: { x: 1982, y: 2824 },
    kokudaka: 42000,
    kokudakaCap: 58800,
    commerce: 260,
    commerceCap: 420,
    population: 13900,
    populationCap: 21000,
    publicOrder: 60,
  },
  {
    id: 'dist.owari-kaito',
    name: '海東郡',
    castleId: 'castle.kiyosu',
    pos: { x: 1929, y: 2846 },
    isPort: true,
    kokudaka: 40000,
    kokudakaCap: 56000,
    commerce: 560,
    commerceCap: 900,
    population: 15000,
    populationCap: 22500,
    publicOrder: 65,
  },
  {
    id: 'dist.owari-nakashima',
    name: '中島郡',
    castleId: 'castle.kiyosu',
    pos: { x: 1943, y: 2811 },
    kokudaka: 44000,
    kokudakaCap: 61600,
    commerce: 240,
    commerceCap: 380,
    population: 14500,
    populationCap: 22000,
    publicOrder: 60,
  },
  {
    id: 'dist.owari-kaisai',
    name: '海西郡',
    castleId: 'castle.kiyosu',
    pos: { x: 1924, y: 2859 },
    kokudaka: 34000,
    kokudakaCap: 47600,
    commerce: 180,
    commerceCap: 290,
    population: 11200,
    populationCap: 17000,
    publicOrder: 58,
  },
  {
    id: 'dist.owari-aichi',
    name: '愛知郡',
    castleId: 'castle.nagoya',
    pos: { x: 1968, y: 2859 },
    isPort: true,
    kokudaka: 46000,
    kokudakaCap: 64400,
    commerce: 520,
    commerceCap: 830,
    population: 16800,
    populationCap: 25500,
    publicOrder: 65,
  },
  {
    id: 'dist.owari-chita',
    name: '知多郡',
    castleId: 'castle.nagoya',
    pos: { x: 1973, y: 2910 },
    isPort: true,
    kokudaka: 38000,
    kokudakaCap: 53200,
    commerce: 300,
    commerceCap: 480,
    population: 13300,
    populationCap: 20000,
    publicOrder: 60,
  },
  {
    id: 'dist.owari-niwa',
    name: '丹羽郡',
    castleId: 'castle.inuyama',
    pos: { x: 1978, y: 2798 },
    kokudaka: 36000,
    kokudakaCap: 50400,
    commerce: 170,
    commerceCap: 270,
    population: 11900,
    populationCap: 18000,
    publicOrder: 60,
  },
  {
    id: 'dist.owari-haguri',
    name: '葉栗郡',
    castleId: 'castle.inuyama',
    pos: { x: 1959, y: 2795 },
    stewardId: 'off.mori-yoshinari',
    kokudaka: 30000,
    kokudakaCap: 42000,
    commerce: 140,
    commerceCap: 220,
    population: 9900,
    populationCap: 15000,
    publicOrder: 60,
  },
  {
    id: 'dist.suruga-abe',
    name: '安倍郡',
    castleId: 'castle.sunpu',
    pos: { x: 2312, y: 2878 },
    kokudaka: 52000,
    kokudakaCap: 72800,
    commerce: 420,
    commerceCap: 670,
    population: 18200,
    populationCap: 27500,
    publicOrder: 62,
  },
  {
    id: 'dist.suruga-udo',
    name: '有度郡',
    castleId: 'castle.sunpu',
    pos: { x: 2338, y: 2886 },
    isPort: true,
    kokudaka: 48000,
    kokudakaCap: 67200,
    commerce: 380,
    commerceCap: 610,
    population: 16800,
    populationCap: 25500,
    publicOrder: 62,
  },
  {
    id: 'dist.suruga-sunto',
    name: '駿東郡',
    castleId: 'castle.kokokuji',
    pos: { x: 2425, y: 2865 },
    kokudaka: 55000,
    kokudakaCap: 77000,
    commerce: 250,
    commerceCap: 400,
    population: 18200,
    populationCap: 27500,
    publicOrder: 60,
  },
  {
    id: 'dist.suruga-fuji',
    name: '富士郡',
    castleId: 'castle.kokokuji',
    pos: { x: 2383, y: 2849 },
    kokudaka: 60000,
    kokudakaCap: 84000,
    commerce: 230,
    commerceCap: 370,
    population: 19800,
    populationCap: 30000,
    publicOrder: 60,
  },
  {
    id: 'dist.totomi-sano',
    name: '佐野郡',
    castleId: 'castle.kakegawa',
    pos: { x: 2231, y: 2937 },
    stewardId: 'off.asahina-yasutomo',
    kokudaka: 58000,
    kokudakaCap: 81200,
    commerce: 240,
    commerceCap: 380,
    population: 19100,
    populationCap: 29000,
    publicOrder: 60,
  },
  {
    id: 'dist.totomi-suchi',
    name: '周智郡',
    castleId: 'castle.kakegawa',
    pos: { x: 2205, y: 2926 },
    kokudaka: 55000,
    kokudakaCap: 77000,
    commerce: 200,
    commerceCap: 320,
    population: 18200,
    populationCap: 27500,
    publicOrder: 60,
  },
  {
    id: 'dist.totomi-fuchi',
    name: '敷知郡',
    castleId: 'castle.hikuma',
    pos: { x: 2132, y: 2966 },
    kokudaka: 62000,
    kokudakaCap: 86800,
    commerce: 320,
    commerceCap: 510,
    population: 20500,
    populationCap: 31000,
    publicOrder: 60,
  },
  {
    id: 'dist.totomi-toyoda',
    name: '豐田郡',
    castleId: 'castle.hikuma',
    pos: { x: 2181, y: 2945 },
    kokudaka: 57000,
    kokudakaCap: 79800,
    commerce: 210,
    commerceCap: 340,
    population: 18800,
    populationCap: 28500,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-hoi',
    name: '寶飯郡',
    castleId: 'castle.yoshida',
    pos: { x: 2067, y: 2937 },
    kokudaka: 64000,
    kokudakaCap: 89600,
    commerce: 300,
    commerceCap: 480,
    population: 21100,
    populationCap: 32000,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-yana',
    name: '八名郡',
    castleId: 'castle.yoshida',
    pos: { x: 2100, y: 2918 },
    kokudaka: 52000,
    kokudakaCap: 72800,
    commerce: 160,
    commerceCap: 260,
    population: 17200,
    populationCap: 26000,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-atsumi',
    name: '渥美郡',
    castleId: 'castle.tahara',
    pos: { x: 2055, y: 2982 },
    isPort: true,
    stewardId: 'off.okabe-masatsuna',
    kokudaka: 58000,
    kokudakaCap: 81200,
    commerce: 280,
    commerceCap: 450,
    population: 20200,
    populationCap: 30500,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-hazu',
    name: '幡豆郡',
    castleId: 'castle.tahara',
    pos: { x: 2008, y: 2937 },
    kokudaka: 49000,
    kokudakaCap: 68600,
    commerce: 190,
    commerceCap: 300,
    population: 16200,
    populationCap: 24500,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-nukata',
    name: '額田郡',
    castleId: 'castle.okazaki',
    pos: { x: 2036, y: 2902 },
    kokudaka: 55000,
    kokudakaCap: 77000,
    commerce: 260,
    commerceCap: 420,
    population: 18200,
    populationCap: 27500,
    publicOrder: 62,
  },
  {
    id: 'dist.mikawa-hekikai',
    name: '碧海郡',
    castleId: 'castle.okazaki',
    pos: { x: 2001, y: 2897 },
    kokudaka: 62000,
    kokudakaCap: 86800,
    commerce: 240,
    commerceCap: 380,
    population: 20500,
    populationCap: 31000,
    publicOrder: 60,
  },
  {
    id: 'dist.mikawa-kamo',
    name: '加茂郡',
    castleId: 'castle.okazaki',
    pos: { x: 2036, y: 2865 },
    kokudaka: 50000,
    kokudakaCap: 70000,
    commerce: 150,
    commerceCap: 240,
    population: 16500,
    populationCap: 25000,
    publicOrder: 58,
  },
];

// ═══════════════════════════════════════════════════════════════════
// §3.5.4 roads.json（東海節錄 14 邊）
// ═══════════════════════════════════════════════════════════════════
const ROADS_JSON_EXAMPLE = {
  version: 1,
  edges: [
    {
      id: 'road.kiyosu-kasugai-01',
      a: 'castle.kiyosu',
      b: 'dist.owari-kasugai',
      type: 'land',
      grade: 2,
      baseDays: 0.5,
    },
    {
      id: 'road.kiyosu-nakashima-01',
      a: 'castle.kiyosu',
      b: 'dist.owari-nakashima',
      type: 'land',
      grade: 2,
      baseDays: 0.5,
    },
    {
      id: 'road.kiyosu-kaito-01',
      a: 'castle.kiyosu',
      b: 'dist.owari-kaito',
      type: 'land',
      grade: 2,
      baseDays: 0.5,
    },
    {
      id: 'road.kaito-kaisai-01',
      a: 'dist.owari-kaito',
      b: 'dist.owari-kaisai',
      type: 'land',
      grade: 1,
      baseDays: 0.5,
    },
    {
      id: 'road.kiyosu-nagoya-01',
      a: 'castle.kiyosu',
      b: 'castle.nagoya',
      type: 'land',
      grade: 3,
      baseDays: 0.5,
      name: '東海道',
    },
    {
      id: 'road.nagoya-aichi-01',
      a: 'castle.nagoya',
      b: 'dist.owari-aichi',
      type: 'land',
      grade: 3,
      baseDays: 0.5,
      name: '東海道',
    },
    {
      id: 'road.aichi-hekikai-01',
      a: 'dist.owari-aichi',
      b: 'dist.mikawa-hekikai',
      type: 'land',
      grade: 3,
      baseDays: 1,
      name: '東海道',
    },
    {
      id: 'road.hekikai-okazaki-01',
      a: 'dist.mikawa-hekikai',
      b: 'castle.okazaki',
      type: 'land',
      grade: 3,
      baseDays: 0.5,
      name: '東海道',
    },
    {
      id: 'road.okazaki-hoi-01',
      a: 'castle.okazaki',
      b: 'dist.mikawa-hoi',
      type: 'land',
      grade: 3,
      baseDays: 1,
      name: '東海道',
    },
    {
      id: 'road.hoi-yoshida-01',
      a: 'dist.mikawa-hoi',
      b: 'castle.yoshida',
      type: 'land',
      grade: 3,
      baseDays: 0.5,
      name: '東海道',
    },
    {
      id: 'road.yoshida-fuchi-01',
      a: 'castle.yoshida',
      b: 'dist.totomi-fuchi',
      type: 'land',
      grade: 3,
      baseDays: 1.5,
      name: '東海道',
    },
    {
      id: 'road.kakegawa-abe-01',
      a: 'castle.kakegawa',
      b: 'dist.suruga-abe',
      type: 'land',
      grade: 3,
      baseDays: 2,
      name: '東海道',
    },
    {
      id: 'road.kasugai-inuyama-01',
      a: 'dist.owari-kasugai',
      b: 'castle.inuyama',
      type: 'land',
      grade: 2,
      baseDays: 1,
    },
    {
      id: 'road.chita-atsumi-01',
      a: 'dist.owari-chita',
      b: 'dist.mikawa-atsumi',
      type: 'sea',
      grade: 1,
      baseDays: 2,
      name: '伊勢灣口航路',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// §3.5.5 officers/tokai.json（織田 15＋今川 12＋松平 6）
// ═══════════════════════════════════════════════════════════════════
const OFFICERS_TOKAI_JSON_EXAMPLE = {
  version: 1,
  region: 'tokai',
  officers: [
    {
      id: 'off.oda-nobunaga',
      name: '織田信長',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 105,
      val: 92,
      int: 108,
      pol: 104,
      traits: ['trait.ifudodo', 'trait.teppo', 'trait.yashin'],
      tactics: ['tac.charge', 'tac.triple-volley'],
      rank: 'shukuro',
      isKin: true,
      birthYear: 1534,
      deathYear: 1582,
    },
    {
      id: 'off.shibata-katsuie',
      name: '柴田勝家',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 92,
      val: 95,
      int: 62,
      pol: 70,
      traits: ['trait.goketsu', 'trait.kesshi'],
      tactics: ['tac.charge', 'tac.last-stand'],
      rank: 'karo',
      birthYear: 1522,
      deathYear: 1583,
    },
    {
      id: 'off.niwa-nagahide',
      name: '丹羽長秀',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 78,
      val: 70,
      int: 82,
      pol: 95,
      traits: ['trait.naisei', 'trait.chushin'],
      tactics: ['tac.volley'],
      rank: 'busho',
      birthYear: 1535,
      deathYear: 1585,
    },
    {
      id: 'off.kinoshita-tokichiro',
      name: '木下藤吉郎',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 90,
      val: 62,
      int: 96,
      pol: 98,
      traits: ['trait.hitotarashi', 'trait.chikujo', 'trait.yashin'],
      tactics: ['tac.charge'],
      rank: 'kumigashira',
      birthYear: 1537,
      deathYear: 1598,
    },
    {
      id: 'off.maeda-toshiie',
      name: '前田利家',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 82,
      val: 88,
      int: 66,
      pol: 84,
      traits: ['trait.goketsu'],
      tactics: ['tac.charge'],
      rank: 'ashigaru-taisho',
      birthYear: 1538,
      deathYear: 1599,
    },
    {
      id: 'off.sassa-narimasa',
      name: '佐佐成政',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 78,
      val: 84,
      int: 60,
      pol: 68,
      traits: ['trait.teppo'],
      tactics: ['tac.volley'],
      rank: 'ashigaru-taisho',
      birthYear: 1536,
      deathYear: 1588,
    },
    {
      id: 'off.ikeda-tsuneoki',
      name: '池田恆興',
      clanId: 'clan.oda',
      locationCastleId: 'castle.inuyama',
      ldr: 74,
      val: 72,
      int: 62,
      pol: 70,
      traits: [],
      tactics: ['tac.charge'],
      rank: 'samurai-taisho',
      birthYear: 1536,
      deathYear: 1584,
    },
    {
      id: 'off.hayashi-hidesada',
      name: '林秀貞',
      clanId: 'clan.oda',
      locationCastleId: 'castle.nagoya',
      ldr: 45,
      val: 38,
      int: 58,
      pol: 78,
      traits: ['trait.jinsei'],
      tactics: [],
      rank: 'karo',
      birthYear: 1513,
      deathYear: 1580,
    },
    {
      id: 'off.sakuma-nobumori',
      name: '佐久間信盛',
      clanId: 'clan.oda',
      locationCastleId: 'castle.nagoya',
      ldr: 68,
      val: 60,
      int: 64,
      pol: 72,
      traits: ['trait.rojo'],
      tactics: ['tac.volley'],
      rank: 'karo',
      birthYear: 1528,
      deathYear: 1582,
    },
    {
      id: 'off.takigawa-kazumasu',
      name: '瀧川一益',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 86,
      val: 80,
      int: 84,
      pol: 72,
      traits: ['trait.teppo', 'trait.ninja'],
      tactics: ['tac.triple-volley', 'tac.volley'],
      rank: 'samurai-taisho',
      birthYear: 1525,
      deathYear: 1586,
    },
    {
      id: 'off.mori-yoshinari',
      name: '森可成',
      clanId: 'clan.oda',
      locationCastleId: 'castle.inuyama',
      ldr: 80,
      val: 82,
      int: 64,
      pol: 60,
      traits: ['trait.goketsu', 'trait.kesshi'],
      tactics: ['tac.charge', 'tac.last-stand'],
      rank: 'busho',
      birthYear: 1523,
      deathYear: 1570,
    },
    {
      id: 'off.kawajiri-hidetaka',
      name: '河尻秀隆',
      clanId: 'clan.oda',
      locationCastleId: 'castle.nagoya',
      ldr: 70,
      val: 72,
      int: 60,
      pol: 66,
      traits: ['trait.reisei'],
      tactics: ['tac.charge'],
      rank: 'samurai-taisho',
      birthYear: 1527,
      deathYear: 1582,
    },
    {
      id: 'off.murai-sadakatsu',
      name: '村井貞勝',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 30,
      val: 20,
      int: 70,
      pol: 94,
      traits: ['trait.naisei', 'trait.chotei'],
      tactics: [],
      rank: 'samurai-taisho',
      birthYear: 1520,
      deathYear: 1585,
    },
    {
      id: 'off.yanada-masatsuna',
      name: '簗田政綱',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 55,
      val: 50,
      int: 76,
      pol: 58,
      traits: ['trait.hayamimi'],
      tactics: ['tac.volley'],
      rank: 'samurai-taisho',
      birthYear: 1524,
      deathYear: 1579,
    },
    {
      id: 'off.oda-nobukane',
      name: '織田信包',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 60,
      val: 55,
      int: 62,
      pol: 72,
      traits: ['trait.jinsei'],
      tactics: ['tac.volley'],
      rank: 'busho',
      isKin: true,
      birthYear: 1543,
      deathYear: 1614,
    },
    {
      id: 'off.imagawa-yoshimoto',
      name: '今川義元',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.sunpu',
      ldr: 88,
      val: 70,
      int: 86,
      pol: 92,
      traits: ['trait.gunryaku', 'trait.chotei'],
      tactics: ['tac.disrupt', 'tac.charge'],
      rank: 'shukuro',
      isKin: true,
      birthYear: 1519,
      deathYear: 1560,
    },
    {
      id: 'off.imagawa-ujizane',
      name: '今川氏真',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.sunpu',
      ldr: 30,
      val: 24,
      int: 40,
      pol: 62,
      traits: [],
      tactics: [],
      rank: 'busho',
      isKin: true,
      birthYear: 1538,
      deathYear: 1615,
    },
    {
      id: 'off.asahina-yasutomo',
      name: '朝比奈泰朝',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.kakegawa',
      ldr: 78,
      val: 76,
      int: 58,
      pol: 64,
      traits: ['trait.chushin', 'trait.fudou'],
      tactics: ['tac.hold', 'tac.charge'],
      rank: 'karo',
      birthYear: 1538,
      deathYear: 1592,
    },
    {
      id: 'off.okabe-motonobu',
      name: '岡部元信',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.sunpu',
      ldr: 82,
      val: 84,
      int: 66,
      pol: 58,
      traits: ['trait.kesshi', 'trait.chushin'],
      tactics: ['tac.last-stand', 'tac.charge'],
      rank: 'busho',
      birthYear: 1525,
      deathYear: 1581,
    },
    {
      id: 'off.okabe-masatsuna',
      name: '岡部正綱',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.tahara',
      ldr: 70,
      val: 66,
      int: 68,
      pol: 74,
      traits: ['trait.rojo'],
      tactics: ['tac.volley'],
      rank: 'samurai-taisho',
      birthYear: 1542,
      deathYear: 1584,
    },
    {
      id: 'off.udono-nagateru',
      name: '鵜殿長照',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.yoshida',
      ldr: 68,
      val: 70,
      int: 52,
      pol: 58,
      traits: ['trait.fudou'],
      tactics: ['tac.hold'],
      rank: 'busho',
      isKin: true,
      birthYear: 1530,
      deathYear: 1562,
    },
    {
      id: 'off.sekiguchi-chikanaga',
      name: '關口親永',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.sunpu',
      ldr: 52,
      val: 48,
      int: 62,
      pol: 72,
      traits: ['trait.chotei'],
      tactics: [],
      rank: 'karo',
      isKin: true,
      birthYear: 1518,
      deathYear: 1562,
    },
    {
      id: 'off.ii-naomori',
      name: '井伊直盛',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.hikuma',
      ldr: 66,
      val: 62,
      int: 56,
      pol: 60,
      traits: ['trait.kesshi'],
      tactics: ['tac.charge'],
      rank: 'busho',
      birthYear: 1526,
      deathYear: 1560,
    },
    {
      id: 'off.ohara-shigezane',
      name: '小原鎮實',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.yoshida',
      ldr: 60,
      val: 58,
      int: 64,
      pol: 62,
      traits: ['trait.rojo'],
      tactics: ['tac.volley'],
      rank: 'samurai-taisho',
      birthYear: 1520,
      deathYear: 1570,
    },
    {
      id: 'off.katsurayama-ujimoto',
      name: '葛山氏元',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.kokokuji',
      ldr: 54,
      val: 50,
      int: 58,
      pol: 66,
      traits: ['trait.shosai'],
      tactics: [],
      rank: 'busho',
      birthYear: 1520,
      deathYear: 1573,
    },
    {
      id: 'off.ihara-tadatane',
      name: '庵原忠胤',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.hikuma',
      ldr: 62,
      val: 60,
      int: 58,
      pol: 60,
      traits: ['trait.heitan'],
      tactics: ['tac.volley'],
      rank: 'samurai-taisho',
      birthYear: 1515,
      deathYear: 1580,
    },
    {
      id: 'off.yui-masanobu',
      name: '由比正信',
      clanId: 'clan.imagawa',
      locationCastleId: 'castle.sunpu',
      ldr: 58,
      val: 54,
      int: 60,
      pol: 64,
      traits: ['trait.naisei'],
      tactics: [],
      rank: 'samurai-taisho',
      birthYear: 1515,
      deathYear: 1560,
    },
    {
      id: 'off.matsudaira-motoyasu',
      name: '松平元康',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 96,
      val: 84,
      int: 92,
      pol: 98,
      traits: ['trait.gunryaku', 'trait.jinbo'],
      tactics: ['tac.charge', 'tac.disrupt'],
      rank: 'shukuro',
      isKin: true,
      birthYear: 1543,
      deathYear: 1616,
    },
    {
      id: 'off.sakai-tadatsugu',
      name: '酒井忠次',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 88,
      val: 78,
      int: 84,
      pol: 80,
      traits: ['trait.roukou'],
      tactics: ['tac.pin', 'tac.charge'],
      rank: 'karo',
      birthYear: 1527,
      deathYear: 1596,
    },
    {
      id: 'off.ishikawa-kazumasa',
      name: '石川數正',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 70,
      val: 58,
      int: 80,
      pol: 84,
      traits: ['trait.gaiko'],
      tactics: ['tac.volley'],
      rank: 'busho',
      birthYear: 1533,
      deathYear: 1593,
    },
    {
      id: 'off.torii-mototada',
      name: '鳥居元忠',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 76,
      val: 74,
      int: 58,
      pol: 62,
      traits: ['trait.chushin', 'trait.fudou'],
      tactics: ['tac.hold'],
      rank: 'samurai-taisho',
      birthYear: 1539,
      deathYear: 1600,
    },
    {
      id: 'off.okubo-tadayo',
      name: '大久保忠世',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 78,
      val: 80,
      int: 62,
      pol: 64,
      traits: ['trait.goketsu'],
      tactics: ['tac.charge'],
      rank: 'samurai-taisho',
      birthYear: 1532,
      deathYear: 1594,
    },
    {
      id: 'off.honda-tadakatsu',
      name: '本多忠勝',
      clanId: 'clan.matsudaira',
      locationCastleId: 'castle.okazaki',
      ldr: 94,
      val: 110,
      int: 68,
      pol: 48,
      traits: ['trait.onimusha', 'trait.kesshi'],
      tactics: ['tac.charge', 'tac.last-stand'],
      rank: 'kumigashira',
      birthYear: 1548,
      deathYear: 1610,
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════
// §3.9 events.json（evt.okehazama 範例）
// ═══════════════════════════════════════════════════════════════════
const OKEHAZAMA_EVENT_EXAMPLE = {
  id: 'evt.okehazama',
  name: '桶狹間之戰',
  once: true,
  window: { startDay: 120, endDay: 359 },
  conditions: [
    { kind: 'clanAlive', clanId: 'clan.oda' },
    { kind: 'clanAlive', clanId: 'clan.imagawa' },
    { kind: 'atWar', a: 'clan.oda', b: 'clan.imagawa' },
    { kind: 'officerServing', officerId: 'off.imagawa-yoshimoto' },
    {
      kind: 'armiesInEnemyTerritory',
      clanId: 'clan.imagawa',
      targetClanId: 'clan.oda',
      minSoldiers: 6000,
    },
  ],
  text: '永祿三年五月，今川治部大輔義元親率大軍上洛，兵鋒直指尾張……',
  choices: [],
  effects: [
    { kind: 'officerDies', officerId: 'off.imagawa-yoshimoto', cause: 'battle' },
    { kind: 'routClanArmies', clanId: 'clan.imagawa' },
    { kind: 'prestigeAdd', clanId: 'clan.oda', amount: 300 },
    { kind: 'sentimentSet', a: 'clan.oda', b: 'clan.imagawa', aToB: 30, bToA: 10 },
  ],
};

describe('§3.5 東海地方施工樣板：範例片段 parse 通過（14-T1）', () => {
  it('clans.json 節錄（zClansFile）', () => {
    expect(() => zClansFile.parse(CLANS_JSON_EXAMPLE)).not.toThrow();
  });

  it('castles.json 東海 10 城（zCastlesFile）', () => {
    const parsed = zCastlesFile.parse(CASTLES_JSON_EXAMPLE);
    expect(parsed).toHaveLength(10);
  });

  it('districts.json 東海 22 郡（zDistrictsFile；§3.5.3 JSON 本體實列 23 筆，見 §8 D16）', () => {
    const parsed = zDistrictsFile.parse(DISTRICTS_JSON_EXAMPLE);
    expect(parsed).toHaveLength(23);
  });

  it('roads.json 東海節錄 14 邊（zRoadsFile）', () => {
    const parsed = zRoadsFile.parse(ROADS_JSON_EXAMPLE);
    expect(parsed.edges).toHaveLength(14);
  });

  it('officers/tokai.json 織田15＋今川12＋松平6（zOfficersFile）', () => {
    const parsed = zOfficersFile.parse(OFFICERS_TOKAI_JSON_EXAMPLE);
    expect(parsed.officers).toHaveLength(33);
  });

  it('本多忠勝（生年1548）未元服少年武將樣板可通過 zOfficer（§4.6 上限 1570）', () => {
    const honda = OFFICERS_TOKAI_JSON_EXAMPLE.officers.find((o) => o.id === 'off.honda-tadakatsu');
    expect(() => zOfficer.parse(honda)).not.toThrow();
  });
});

describe('§3.9 events.json：evt.okehazama 範例 parse 通過（14-T1）', () => {
  it('zEvent 通過，effects/conditions 各判別聯集分支解析正確', () => {
    const parsed = zEvent.parse(OKEHAZAMA_EVENT_EXAMPLE);
    expect(parsed.conditions).toHaveLength(5);
    expect(parsed.effects).toHaveLength(4);
  });

  it('包成 zEventsFile（version 1）通過', () => {
    expect(() =>
      zEventsFile.parse({ version: 1, events: [OKEHAZAMA_EVENT_EXAMPLE] }),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 每個 schema 各一非法樣本被拒（14-T1 驗收第二項）
// ═══════════════════════════════════════════════════════════════════
describe('每個 schema 各一非法樣本被拒（14-T1）', () => {
  it('zProvince：id 前綴錯誤（缺 "prov." 前綴）被拒', () => {
    const result = zProvince.safeParse({
      id: 'owari', // 應為 'prov.owari'
      name: '尾張',
      region: 'tokai',
      labelPos: { x: 1050, y: 1000 },
    });
    expect(result.success).toBe(false);
  });

  it('zProvincesFile：region 不在 9 地方枚舉內被拒', () => {
    const result = zProvincesFile.safeParse({
      version: 1,
      provinces: [{ id: 'prov.owari', name: '尾張', region: 'ryukyu', labelPos: { x: 0, y: 0 } }],
    });
    expect(result.success).toBe(false);
  });

  it('zCastle：tier 非 main/branch 被拒', () => {
    const result = zCastle.safeParse({
      id: 'castle.kiyosu',
      name: '清洲城',
      tier: 'fortress', // 非法：只允許 'main'/'branch'
      provinceId: 'prov.owari',
      pos: { x: 1966, y: 2838 },
      coastal: false,
      ownerClanId: 'clan.oda',
      lordId: 'off.oda-nobunaga',
      soldiers: 2600,
      food: 6500,
    });
    expect(result.success).toBe(false);
  });

  it('zCastlesFile：空陣列（min(1)）被拒', () => {
    expect(zCastlesFile.safeParse([]).success).toBe(false);
  });

  it('zDistrict：developFocus 用已廢棄的 "security"（14 §4.4 勘誤前之誤字）被拒', () => {
    const result = zDistrict.safeParse({
      id: 'dist.owari-kasugai',
      name: '春日井郡',
      castleId: 'castle.kiyosu',
      pos: { x: 1982, y: 2824 },
      kokudaka: 42000,
      kokudakaCap: 58800,
      commerce: 260,
      commerceCap: 420,
      population: 13900,
      populationCap: 21000,
      publicOrder: 60,
      developFocus: 'security', // 非法：應為 agri/commerce/barracks（02 §3.3，E-07）
    });
    expect(result.success).toBe(false);
  });

  it('zDistrict：developFocus 用 02/05 定案值 "barracks" 通過（確認勘誤已生效）', () => {
    const result = zDistrict.safeParse({
      id: 'dist.owari-kasugai',
      name: '春日井郡',
      castleId: 'castle.kiyosu',
      pos: { x: 1982, y: 2824 },
      kokudaka: 42000,
      kokudakaCap: 58800,
      commerce: 260,
      commerceCap: 420,
      population: 13900,
      populationCap: 21000,
      publicOrder: 60,
      developFocus: 'barracks',
    });
    expect(result.success).toBe(true);
  });

  it('zPactInit：kind 非法值被拒', () => {
    const result = zPactInit.safeParse({
      a: 'clan.imagawa',
      b: 'clan.takeda',
      kind: 'trade', // 非法：只允許 alliance/marriage/ceasefire/vassal
      months: 48,
      vassalClanId: null,
    });
    expect(result.success).toBe(false);
  });

  it('zWarEntry：id 前綴錯誤被拒', () => {
    expect(zWarEntry.safeParse({ a: 'oda', b: 'clan.imagawa' }).success).toBe(false);
  });

  it('zSentimentEntry：aToB 超出 0..100 被拒', () => {
    expect(
      zSentimentEntry.safeParse({ a: 'clan.oda', b: 'clan.saito', aToB: 120, bToA: 20 }).success,
    ).toBe(false);
  });

  it('zClan：colorIndex 超出 0..39 被拒', () => {
    const result = zClan.safeParse({
      id: 'clan.oda',
      name: '織田家',
      leaderId: 'off.oda-nobunaga',
      homeCastleId: 'castle.kiyosu',
      gold: 2000,
      prestige: 250,
      personaId: 'persona.oda',
      colorIndex: 40, // 非法：0..39
    });
    expect(result.success).toBe(false);
  });

  it('zClansFile：缺 diplomacy 區塊被拒', () => {
    const result = zClansFile.safeParse({ version: 1, clans: [] });
    expect(result.success).toBe(false); // clans.min(1) 亦會擋，但此處聚焦 diplomacy 必填
  });

  it('zOfficer：ldr 超出 1..120 上限被拒', () => {
    const result = zOfficer.safeParse({
      id: 'off.oda-nobunaga',
      name: '織田信長',
      clanId: 'clan.oda',
      locationCastleId: 'castle.kiyosu',
      ldr: 130, // 非法：上限 120
      val: 92,
      int: 108,
      pol: 104,
      birthYear: 1534,
      deathYear: 1582,
    });
    expect(result.success).toBe(false);
  });

  it('zOfficersFile：region 與 REGION_VALUES 枚舉不符被拒', () => {
    const result = zOfficersFile.safeParse({
      version: 1,
      region: 'edo', // 非法：非 9 地方之一
      officers: [],
    });
    expect(result.success).toBe(false);
  });

  it('zEvent：once 非 true（v1.0 全部一生一次）被拒', () => {
    const result = zEvent.safeParse({ ...OKEHAZAMA_EVENT_EXAMPLE, once: false });
    expect(result.success).toBe(false);
  });

  it('zEventCondition：未知 kind 不在判別聯集內被拒', () => {
    const result = zEventCondition.safeParse({ kind: 'unknownKind', clanId: 'clan.oda' });
    expect(result.success).toBe(false);
  });

  it('zEventEffect：officerDies 的 cause 不在枚舉內被拒', () => {
    const result = zEventEffect.safeParse({
      kind: 'officerDies',
      officerId: 'off.imagawa-yoshimoto',
      cause: 'poison', // 非法：只允許 age/battle/execution
    });
    expect(result.success).toBe(false);
  });

  it('zEventsFile：version 非字面值 1 被拒', () => {
    const result = zEventsFile.safeParse({ version: 2, events: [] });
    expect(result.success).toBe(false);
  });

  it('zTraitEntry：rarity 非法值被拒', () => {
    const result = zTraitEntry.safeParse({ id: 'trait.gunshin', name: '軍神', rarity: 'epic' });
    expect(result.success).toBe(false);
  });

  it('zTraitsFile：長度不等於 37（D2 定案）被拒', () => {
    const result = zTraitsFile.safeParse({
      version: 1,
      traits: [{ id: 'trait.gunshin', name: '軍神', rarity: 'legendary' }],
    });
    expect(result.success).toBe(false);
  });

  it('zTacticEntry：id 前綴錯誤被拒', () => {
    expect(
      zTacticEntry.safeParse({ id: 'tactic.charge', name: '突擊', unlockTraitId: null }).success,
    ).toBe(false);
  });

  it('zTacticsFile：長度不等於 12 被拒', () => {
    expect(zTacticsFile.safeParse({ version: 1, tactics: [] }).success).toBe(false);
  });

  it('zPolicyEntry：costGold 為負值被拒', () => {
    const result = zPolicyEntry.safeParse({
      id: 'pol.rakuichi',
      name: '樂市樂座',
      prestigeReq: 0,
      costGold: -100,
    });
    expect(result.success).toBe(false);
  });

  it('zPoliciesFile：長度不等於 13 被拒', () => {
    expect(zPoliciesFile.safeParse({ version: 1, policies: [] }).success).toBe(false);
  });

  it('zPersonaEntry：aggression 超出 0..100 被拒', () => {
    const result = zPersonaEntry.safeParse({
      id: 'persona.oda',
      aggression: 150,
      diplomacy: 50,
      development: 50,
      loyalty: 50,
      ambition: 50,
    });
    expect(result.success).toBe(false);
  });

  it('zPersonasFile：筆數少於 41 被拒', () => {
    expect(
      zPersonasFile.safeParse({
        version: 1,
        personas: [
          {
            id: 'persona.default',
            aggression: 50,
            diplomacy: 50,
            development: 50,
            loyalty: 50,
            ambition: 50,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('zRoadEdge：a/b 非城或郡節點（MapNodeId）被拒', () => {
    const result = zRoadEdge.safeParse({
      id: 'road.kiyosu-kasugai-01',
      a: 'prov.owari', // 非法：國不是地圖節點（僅城∪郡）
      b: 'dist.owari-kasugai',
      type: 'land',
      grade: 2,
      baseDays: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('zRoadEdge：baseDays 非 0.5 倍數被拒', () => {
    const result = zRoadEdge.safeParse({
      id: 'road.kiyosu-kasugai-01',
      a: 'castle.kiyosu',
      b: 'dist.owari-kasugai',
      type: 'land',
      grade: 2,
      baseDays: 0.3, // 非法：0.5 為最小刻度
    });
    expect(result.success).toBe(false);
  });

  it('zRoadEdge：grade 超出 1|2|3 被拒', () => {
    const result = zRoadEdge.safeParse({
      id: 'road.kiyosu-kasugai-01',
      a: 'castle.kiyosu',
      b: 'dist.owari-kasugai',
      type: 'land',
      grade: 4,
      baseDays: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('zRoadsFile：邊陣列為空（min(1)）被拒', () => {
    expect(zRoadsFile.safeParse({ version: 1, edges: [] }).success).toBe(false);
  });
});

describe('zScenario：東海子集彙整後可通過總 schema（§3.1 s1560 shape）', () => {
  it('整合全部 §3.5 範例＋合成型錄後 parse 通過', () => {
    const trait = { id: 'trait.gunshin', name: '軍神', rarity: 'legendary' as const };
    const traits = Array.from({ length: 37 }, (_, i) => ({
      id: `trait.t${String(i).padStart(2, '0')}`,
      name: i === 0 ? trait.name : `特性${i}`,
      rarity: 'common' as const,
    }));
    const tactics = Array.from({ length: 12 }, (_, i) => ({
      id: `tac.t${String(i).padStart(2, '0')}`,
      name: `戰法${i}`,
      unlockTraitId: null,
    }));
    const policies = Array.from({ length: 13 }, (_, i) => ({
      id: `pol.p${String(i).padStart(2, '0')}`,
      name: `政策${i}`,
      prestigeReq: 0,
      costGold: 0,
    }));
    const personas = Array.from({ length: 41 }, (_, i) => ({
      id: `persona.p${String(i).padStart(2, '0')}`,
      aggression: 50,
      diplomacy: 50,
      development: 50,
      loyalty: 50,
      ambition: 50,
    }));

    const bundle = {
      id: 's1560',
      provinces: [
        { id: 'prov.owari', name: '尾張', region: 'tokai', labelPos: { x: 1966, y: 2838 } },
        { id: 'prov.suruga', name: '駿河', region: 'tokai', labelPos: { x: 2312, y: 2897 } },
        { id: 'prov.totomi', name: '遠江', region: 'tokai', labelPos: { x: 2200, y: 2950 } },
        { id: 'prov.mikawa', name: '三河', region: 'tokai', labelPos: { x: 2050, y: 2930 } },
      ],
      castles: CASTLES_JSON_EXAMPLE,
      districts: DISTRICTS_JSON_EXAMPLE,
      roads: ROADS_JSON_EXAMPLE.edges,
      clans: CLANS_JSON_EXAMPLE.clans,
      diplomacy: CLANS_JSON_EXAMPLE.diplomacy,
      events: [OKEHAZAMA_EVENT_EXAMPLE],
      officers: [OFFICERS_TOKAI_JSON_EXAMPLE.officers, [], [], [], [], [], [], [], []],
      catalogs: { traits, policies, tactics, personas },
    };

    expect(() => zScenario.parse(bundle)).not.toThrow();
  });
});
