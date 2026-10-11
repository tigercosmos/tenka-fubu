import { zClansFile } from '../../../schemas/clan';
import existingClans from '../clans.json';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import { CHUGOKU_GEOGRAPHY as geography } from './chugoku-geography';

export const CHUGOKU_CLAN_PROVENANCE = {
  identityAndPalette:
    'plan/14 §3.3 scenario identities, homes and palette; not historical-control proof',
  gold: 'plan/14 §3.2: round(actual owned district kokudaka / 200 / 100) * 100',
  prestigeAndTitles: 'Authored prestige; no unrequired court or shogunate title asserted',
  diplomacy: 'Only Mori/Amago war and Amago/Yamana40 close loaded endpoints; Otomo/Kono deferred',
  status: 'Staged B6 authoring payload; not imported by production',
} as const;

const batchCastleIds = new Set(geography.castles.map(({ id }) => id));
const castles = [
  ...existingCastles.filter(({ id }) => !batchCastleIds.has(id)),
  ...geography.castles,
];
const batchDistrictIds = new Set(geography.districts.map(({ id }) => id));
const districts = [
  ...existingDistricts.filter(({ id }) => !batchDistrictIds.has(id)),
  ...geography.districts,
];

function treasury(clanId: string): number {
  const owned = new Set(
    castles.filter(({ ownerClanId }) => ownerClanId === clanId).map(({ id }) => id),
  );
  const koku = districts
    .filter(({ castleId }) => owned.has(castleId))
    .reduce((sum, district) => sum + district.kokudaka, 0);
  return Math.round(koku / 200 / 100) * 100;
}

const identities = [
  ['mori', '毛利家', 'mori-motonari', 'yoshida-koriyama', 15, 500],
  ['amago', '尼子家', 'amago-haruhisa', 'gassan-toda', 23, 450],
  ['uragami', '浦上家', 'uragami-munekage', 'tenjinyama', 29, 250],
  ['akamatsu', '赤松家', 'akamatsu-harumasa', 'okishio', 12, 300],
] as const;

export const CHUGOKU_CLANS = zClansFile.parse({
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
    wars: [{ a: 'clan.mori', b: 'clan.amago' }],
    sentiments: [{ a: 'clan.amago', b: 'clan.yamana', aToB: 40, bToA: 40 }],
  },
});

// D22/D11: preserve Yamana's Kinki identity and roster; calibrate its new Tottori territory.
const yamana = zClansFile.parse(existingClans).clans.find(({ id }) => id === 'clan.yamana');
if (!yamana) throw new Error('B6 requires the existing Kinki Yamana clan');
export const CHUGOKU_EXISTING_CLAN_UPDATES = [{ ...yamana, gold: treasury(yamana.id) }];
