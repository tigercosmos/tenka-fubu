import { zClansFile } from '../../../schemas/clan';
import { TOHOKU_GEOGRAPHY } from './tohoku-geography';

export const TOHOKU_CLAN_PROVENANCE = {
  status: 'Staged B9 factory; production does not import this module.',
  identities:
    'plan/14 sections3.3 and3.6 prescribe five distinct leaders and their gameplay capitals.',
  resources: 'Treasuries use actual supplied owned district koku divided by200, rounded to100.',
  authored: 'Prestige and existing persona profiles are gameplay design. Titles default to none.',
  boundary:
    'Canonical regional aggregation does not prove direct1560 control over every branch castle. The geography source record must describe actual historical houses and construction dates separately. Factory unit fixtures are not national closure evidence.',
  diplomacy:
    'Only the prescribed Date–Mogami marriage, Ando–Nanbu war and Ashina–Date65/65 sentiment are included. The marriage pact does not infer officer kinship.',
} as const;

export const TOHOKU_CLAN_IDENTITIES = [
  ['date', '伊達家', 'date-harumune', 'yonezawa', 38, 350],
  ['ashina', '蘆名家', 'ashina-moriuji', 'kurokawa', 11, 300],
  ['mogami', '最上家', 'mogami-yoshimori', 'yamagata', 19, 250],
  ['nanbu', '南部家', 'nanbu-harumasa', 'sannohe', 25, 300],
  ['ando', '安東家', 'ando-chikasue', 'hiyama', 33, 250],
] as const;

interface TohokuTerritory {
  readonly castles: readonly {
    readonly id: string;
    readonly ownerClanId: string;
    readonly tier: string;
    readonly lordId: string | null;
  }[];
  readonly districts: readonly { readonly castleId: string; readonly kokudaka: number }[];
}

/** Build only from the geography owner's territory, without inventing roster records. */
export function buildTohokuClans(geography: TohokuTerritory) {
  const castleIds = new Set(geography.castles.map(({ id }) => id));
  if (castleIds.size !== geography.castles.length) throw new Error('B9 duplicate castle ID');
  if (geography.districts.some(({ castleId }) => !castleIds.has(castleId)))
    throw new Error('B9 district references missing castle');
  const treasury = (clanId: string, homeId: string, leaderId: string) => {
    const home = geography.castles.find(({ id }) => id === homeId);
    if (home?.ownerClanId !== clanId || home.tier !== 'main' || home.lordId !== leaderId)
      throw new Error(`B9 requires matching capital and leader for ${clanId}`);
    const owned = new Set(
      geography.castles.filter(({ ownerClanId }) => ownerClanId === clanId).map(({ id }) => id),
    );
    const districts = geography.districts.filter(({ castleId }) => owned.has(castleId));
    if (districts.some(({ kokudaka }) => !Number.isFinite(kokudaka) || kokudaka <= 0))
      throw new Error(`B9 requires positive district koku for ${clanId}`);
    const koku = districts.reduce((sum, district) => sum + district.kokudaka, 0);
    if (koku <= 0) throw new Error(`B9 requires owned territory for ${clanId}`);
    return Math.round(koku / 200 / 100) * 100;
  };
  return zClansFile.parse({
    version: 1,
    clans: TOHOKU_CLAN_IDENTITIES.map(([slug, name, leader, home, colorIndex, prestige]) => ({
      id: `clan.${slug}`,
      name,
      leaderId: `off.${leader}`,
      homeCastleId: `castle.${home}`,
      gold: treasury(`clan.${slug}`, `castle.${home}`, `off.${leader}`),
      prestige,
      courtRank: 'none',
      shogunateTitle: 'none',
      personaId: `persona.${slug}`,
      colorIndex,
    })),
    diplomacy: {
      pacts: [{ a: 'clan.date', b: 'clan.mogami', kind: 'marriage', months: null }],
      wars: [{ a: 'clan.ando', b: 'clan.nanbu' }],
      sentiments: [{ a: 'clan.ashina', b: 'clan.date', aToB: 65, bToA: 65 }],
    },
  });
}

export const TOHOKU_CLANS = buildTohokuClans(TOHOKU_GEOGRAPHY);
