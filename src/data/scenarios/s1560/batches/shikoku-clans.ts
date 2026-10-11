import { zClansFile } from '../../../schemas/clan';
import existingClans from '../clans.json';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import { SHIKOKU_GEOGRAPHY as geography } from './shikoku-geography';

export const SHIKOKU_CLAN_PROVENANCE = {
  status: 'Staged B7 payload; no production loader import or officer creation',
  identityAndPalette: 'plan/14 §3.3 prescribed leaders, capitals and palette',
  gold: 'plan/14 §3.2: owned district koku / 200, rounded to 100; Miyoshi commerce multiplier 1.3 before rounding',
  personality:
    'Existing persona.* design profiles reused unchanged; not historical psychological evidence',
  prestigeAndTitles: 'Authored prestige; no court rank or shogunate title inferred from lineage',
  sources: {
    chosokabe: {
      url: 'https://www.town.sakawa.lg.jp/file/?fid=20922&id=3210&t=LD',
      supports:
        'Municipal historical plan: Kunichika based at Oko in May1560, died the following month; not an exact death-day claim',
    },
    ichijo: {
      url: 'https://www.city.shimanto.lg.jp/uploaded/attachment/4675.pdf',
      supports:
        'Municipal history article identifies Kanesada succeeding after Fusamoto; capital site separately documented by city',
      capitalUrl: 'https://www.city.shimanto.lg.jp/soshiki/13/1337.html',
    },
    kono: {
      url: 'https://www.city.matsuyama.ehime.jp/kanko/kankoguide/rekishibunka/rekishi/muromachi-azuchi.html',
      supports:
        'Municipal timeline explicitly records Michinobu in October1560; no earlier namesake date transferred',
      capitalUrl:
        'https://www.city.matsuyama.ehime.jp/kanko/kankoguide/rekishibunka/bunkazai/kuni/yudukijou_ato.html',
    },
    saionji: {
      url: 'https://www.city.uwajima.ehime.jp/site/sizen-bunka/106saionnjibo.html',
      supports:
        'Municipal cultural-property account names Sanemitsu as Kurose lord; no precise construction or lifespan claim',
    },
  },
} as const;

const castleIds = new Set(geography.castles.map(({ id }) => id));
const districtIds = new Set(geography.districts.map(({ id }) => id));
const castles = [...existingCastles.filter(({ id }) => !castleIds.has(id)), ...geography.castles];
const districts = [
  ...existingDistricts.filter(({ id }) => !districtIds.has(id)),
  ...geography.districts,
];

function treasury(clanId: string): number {
  const owned = new Set(
    castles.filter(({ ownerClanId }) => ownerClanId === clanId).map(({ id }) => id),
  );
  const koku = districts
    .filter(({ castleId }) => owned.has(castleId))
    .reduce((sum, district) => sum + district.kokudaka, 0);
  return Math.round(((koku / 200) * (clanId === 'clan.miyoshi' ? 1.3 : 1)) / 100) * 100;
}

const identities = [
  ['chosokabe', '長宗我部家', 'chosokabe-kunichika', 'oko', 6, 200],
  ['ichijo', '一條家', 'ichijo-kanesada', 'nakamura', 36, 250],
  ['kono', '河野家', 'kono-michinobu', 'yuzuki', 21, 180],
  ['saionji', '西園寺家', 'saionji-sanemitsu', 'kurose', 32, 150],
] as const;

export const SHIKOKU_CLANS = zClansFile.parse({
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
    wars: [],
    sentiments: [
      { a: 'clan.chosokabe', b: 'clan.ichijo', aToB: 75, bToA: 75 },
      { a: 'clan.kono', b: 'clan.mori', aToB: 70, bToA: 70 },
    ],
  },
});

// D11: Miyoshi's Awa/Sanuki retainers remain in Kinki; identity and home are unchanged.
const miyoshi = zClansFile.parse(existingClans).clans.find(({ id }) => id === 'clan.miyoshi');
if (!miyoshi) throw new Error('B7 requires the existing Kinki Miyoshi clan');
export const SHIKOKU_EXISTING_CLAN_UPDATES = [{ ...miyoshi, gold: treasury(miyoshi.id) }];
