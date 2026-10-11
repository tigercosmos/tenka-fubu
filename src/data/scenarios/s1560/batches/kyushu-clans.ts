import { zClansFile } from '../../../schemas/clan';
import { KYUSHU_GEOGRAPHY } from './kyushu-geography';

export const KYUSHU_CLAN_PROVENANCE = {
  status: 'Staged B8 payload. Production does not import this module.',
  identities: 'plan/14 §3.3 fixes five leaders, capitals, palette indices and persona IDs.',
  resources:
    'plan/14 §3.2 uses actual owned district koku. Otomo receives the commercial multiplier 1.3 before rounding to 100.',
  prestige:
    'Prestige values are scenario design. Titles default to none; historical lineage does not imply a court award.',
  personas: 'Existing persona profiles are gameplay design, not historical psychological evidence.',
  diplomacy:
    'Only plan/14 §3.3 prescribed wars and sentiments are included. No extra pact or kinship is inferred.',
  sourceClasses:
    'Municipal histories and institutional site descriptions support the stated facts. They do not prove every prescribed 1560 territorial boundary.',
  sources: {
    shimazu: {
      url: 'https://higashi.edu.pref.kagoshima.jp/article/2021090400066/',
      supports:
        'Prefectural school account identifies Takahisa as the fifteenth leader and places his residence at Uchijo.',
    },
    otomo: {
      url: 'https://www.city.oita.oita.jp/o157/bunkasports/citypromotion/1369370791117.html',
      supports:
        'Municipal history identifies Yoshishige as the twenty-first leader from 1550, and describes his trade from Funai.',
      capitalUrl: 'https://www.city.oita.oita.jp/o204/bunkasports/rekishi/map/route3.html',
    },
    ryuzoji: {
      url: 'https://www.city.saga.lg.jp/bunka-sports/rekishi-bunkazai/4/3/2281.html',
      supports:
        'Municipal history identifies Takanobu succeeding the Muranaka main family in 1548.',
    },
    ito: {
      url: 'https://www.city.saito.lg.jp/post_372.html',
      supports:
        'Municipal account identifies Yoshisuke as Yoshimasu’s father. The museum identifies Tonokori as the Ito political base.',
      capitalUrl: 'https://www.city.saito.lg.jp/kanko_bunka/cat177/post_1620.html',
    },
    sagara: {
      url: 'https://www.city.hitoyoshi.lg.jp/resource.php?e=5f68f128e726ff4de5db83aaecfd809ccfa0271c33af56f8d1d22819e3744abcef76ce921037405d3969fc8273b5d8f9',
      supports:
        'Municipal publication identifies Yoshihi as the young successor in 1555 and describes a surviving 1557 letter.',
      capitalUrl: 'https://www.city.hitoyoshi.lg.jp/kanko/kankojyoho/21341',
    },
  },
} as const;

interface KyushuTerritory {
  readonly castles: readonly { readonly id: string; readonly ownerClanId: string }[];
  readonly districts: readonly { readonly castleId: string; readonly kokudaka: number }[];
}

const identities = [
  ['shimazu', '島津家', 'shimazu-takahisa', 'uchijo', 27, 350],
  ['otomo', '大友家', 'otomo-yoshishige', 'funai', 28, 450],
  ['ryuzoji', '龍造寺家', 'ryuzoji-takanobu', 'muranaka', 10, 300],
  ['ito', '伊東家', 'ito-yoshisuke', 'tonokori', 39, 250],
  ['sagara', '相良家', 'sagara-yoshihi', 'hitoyoshi', 2, 200],
] as const;

/** The geography owner supplies real staged territory; this factory never creates roster placeholders. */
export function buildKyushuClans(geography: KyushuTerritory) {
  const treasury = (clanId: string) => {
    const owned = new Set(
      geography.castles.filter((castle) => castle.ownerClanId === clanId).map(({ id }) => id),
    );
    const koku = geography.districts
      .filter(({ castleId }) => owned.has(castleId))
      .reduce((sum, district) => sum + district.kokudaka, 0);
    if (koku <= 0) throw new Error(`B8 requires owned territory for ${clanId}`);
    return Math.round(((koku / 200) * (clanId === 'clan.otomo' ? 1.3 : 1)) / 100) * 100;
  };
  return zClansFile.parse({
    version: 1,
    clans: identities.map(([slug, name, leader, home, colorIndex, prestige]) => ({
      id: `clan.${slug}`,
      name,
      leaderId: `off.${leader}`,
      homeCastleId: `castle.${home}`,
      gold: treasury(`clan.${slug}`),
      prestige,
      courtRank: 'none',
      shogunateTitle: 'none',
      personaId: `persona.${slug}`,
      colorIndex,
    })),
    diplomacy: {
      pacts: [],
      wars: [
        { a: 'clan.mori', b: 'clan.otomo' },
        { a: 'clan.ryuzoji', b: 'clan.otomo' },
        { a: 'clan.ito', b: 'clan.shimazu' },
      ],
      sentiments: [
        { a: 'clan.sagara', b: 'clan.shimazu', aToB: 45, bToA: 45 },
        { a: 'clan.otomo', b: 'clan.mori', aToB: 25, bToA: 25 },
      ],
    },
  });
}

export const KYUSHU_CLANS = buildKyushuClans(KYUSHU_GEOGRAPHY);
