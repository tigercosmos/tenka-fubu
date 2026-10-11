import { BAL } from '../../../../core/balance';
import { lonLatToWorld } from '../../../map/projection';
import { pointInPolygon } from '../../../map/outlineGeometry';
import outline from '../../../map/japan-outline.json';
import { zCastlesFile } from '../../../schemas/castle';
import { zDistrictsFile } from '../../../schemas/district';
import { zProvincesFile } from '../../../schemas/province';
import { zRoadsFile } from '../../../schemas/road';
import existingCastles from '../castles.json';
import existingDistricts from '../districts.json';
import { CHUGOKU_GEOGRAPHY } from './chugoku-geography';
const baseCastleIds = new Set(CHUGOKU_GEOGRAPHY.castles.map((c) => c.id));
const baseDistrictIds = new Set(CHUGOKU_GEOGRAPHY.districts.map((d) => d.id));
const baseCastles = [
  ...existingCastles.filter((c) => !baseCastleIds.has(c.id)),
  ...CHUGOKU_GEOGRAPHY.castles,
];
const baseDistricts = [
  ...existingDistricts.filter((d) => !baseDistrictIds.has(d.id)),
  ...CHUGOKU_GEOGRAPHY.districts,
];

type CastleSite = readonly [
  string,
  string,
  string,
  string,
  number,
  number,
  boolean,
  boolean,
  boolean,
];
type DistrictSite = readonly [
  string,
  string,
  string,
  number,
  number,
  'plain' | 'mountain' | 'port',
];

// Rounded medieval-site anchors; source boundaries are recorded in the companion provenance file.
export const SHIKOKU_CASTLE_SITES: readonly CastleSite[] = [
  ['shozui', '勝瑞城', 'awa', 'miyoshi', 134.52, 34.13, false, false, false],
  ['sogo', '十河城', 'sanuki', 'miyoshi', 134.11, 34.26, false, false, false],
  ['toramaru', '虎丸城', 'sanuki', 'miyoshi', 134.34, 34.22, false, true, false],
  ['oko', '岡豐城', 'tosa', 'chosokabe', 133.64, 33.6, true, true, false],
  ['nakamura', '中村御所', 'tosa', 'ichijo', 132.94, 32.99, true, false, false],
  ['yuzuki', '湯築城', 'iyo', 'kono', 132.79, 33.85, true, false, false],
  ['kurushima', '來島城', 'iyo', 'kono', 132.97, 34.12, false, true, true],
  ['kurose', '黑瀨城', 'iyo', 'saionji', 132.51, 33.36, true, true, false],
];

// Named counties and explicit named subdivisions are gameplay nodes, not extra historical counties.
export const SHIKOKU_DISTRICT_SITES: readonly DistrictSite[] = [
  ['awa-itano-muya', '板野撫養', 'shozui', 134.59, 34.18, 'port'],
  ['awa-myodo', '名東郡', 'shozui', 134.54, 34.07, 'plain'],
  ['awa-itano', '板野郡', 'shozui', 134.48, 34.15, 'plain'],
  ['sanuki-yamada', '山田郡', 'sogo', 134.1, 34.25, 'plain'],
  ['sanuki-kagawa', '香川郡', 'sogo', 134.05, 34.34, 'port'],
  ['sanuki-aya', '阿野郡', 'sogo', 133.91, 34.32, 'plain'],
  ['sanuki-sangawa', '寒川郡', 'toramaru', 134.24, 34.27, 'plain'],
  ['sanuki-ouchi', '大內郡', 'toramaru', 134.36, 34.26, 'plain'],
  ['tosa-nagaoka', '長岡郡', 'oko', 133.68, 33.57, 'plain'],
  ['tosa-agawa', '吾川郡', 'oko', 133.43, 33.55, 'plain'],
  ['tosa-kami', '香美郡', 'oko', 133.75, 33.6, 'mountain'],
  ['tosa-hata', '幡多郡', 'nakamura', 132.94, 33.03, 'plain'],
  ['tosa-hata-sukumo', '幡多宿毛', 'nakamura', 132.72, 32.94, 'plain'],
  ['tosa-hata-tosashimizu', '幡多清水', 'nakamura', 132.96, 32.78, 'mountain'],
  ['iyo-wake', '和氣郡', 'yuzuki', 132.74, 33.89, 'plain'],
  ['iyo-onsen', '溫泉郡', 'yuzuki', 132.83, 33.83, 'plain'],
  ['iyo-iyo', '伊予郡', 'yuzuki', 132.7, 33.75, 'plain'],
  ['iyo-ochi-kurushima', '越智來島', 'kurushima', 132.97, 34.07, 'port'],
  ['iyo-ochi', '越智郡', 'kurushima', 133, 34, 'plain'],
  ['iyo-uwa', '宇和郡', 'kurose', 132.51, 33.35, 'plain'],
  ['iyo-uwa-sadamisaki', '宇和佐田岬', 'kurose', 132.2, 33.41, 'port'],
  ['iyo-kita', '喜多郡', 'kurose', 132.55, 33.51, 'mountain'],
];

const leaders: Readonly<Record<string, string>> = {
  chosokabe: 'off.chosokabe-kunichika',
  ichijo: 'off.ichijo-kanesada',
  kono: 'off.kono-michinobu',
  saionji: 'off.saionji-sanemitsu',
};
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const batchNodeIds = new Set([
  ...SHIKOKU_CASTLE_SITES.map((s) => `castle.${s[0]}`),
  ...SHIKOKU_DISTRICT_SITES.map((s) => `dist.${s[0]}`),
]);
const occupied = [...baseCastles, ...baseDistricts]
  .filter((n) => !batchNodeIds.has(n.id))
  .map((n) => n.pos);
for (const site of SHIKOKU_CASTLE_SITES) occupied.push(lonLatToWorld(site[4], site[5]));

/** Fit authored district markers inside the coarse outline, retaining their named-site direction. */
function districtPosition(site: DistrictSite) {
  const parent = SHIKOKU_CASTLE_SITES.find((c) => c[0] === site[2]);
  if (!parent) throw new Error(`Missing Shikoku parent ${site[2]}`);
  const origin = lonLatToWorld(parent[4], parent[5]);
  const representative = lonLatToWorld(site[3], site[4]);
  const angle = Math.atan2(representative.y - origin.y, representative.x - origin.x);
  const preferred = Math.max(
    41,
    Math.min(179, Math.hypot(representative.x - origin.x, representative.y - origin.y)),
  );
  const candidates: { x: number; y: number; distance: number }[] = [];
  for (let radius = 41; radius <= 179; radius += 6)
    for (let offset = -12; offset <= 12; offset++) {
      const direction = angle + (offset * Math.PI) / 24;
      const x = Math.round(origin.x + radius * Math.cos(direction));
      const y = Math.round(origin.y + radius * Math.sin(direction));
      const parentDistance = Math.hypot(x - origin.x, y - origin.y);
      if (
        parentDistance < 40 ||
        parentDistance > 180 ||
        !outline.polygons.some((p) => pointInPolygon(x, y, p.points)) ||
        occupied.some((p) => Math.hypot(x - p.x, y - p.y) < 24)
      )
        continue;
      candidates.push({ x, y, distance: Math.abs(radius - preferred) + Math.abs(offset) * 6 });
    }
  candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
  const chosen = candidates[0];
  if (!chosen) throw new Error(`No valid authored district marker for ${site[0]}`);
  const pos = { x: chosen.x, y: chosen.y };
  occupied.push(pos);
  return pos;
}
const totalWeight = SHIKOKU_DISTRICT_SITES.reduce((sum, site) => sum + weight[site[5]], 0);
const koku = SHIKOKU_DISTRICT_SITES.map((s) =>
  roundTo((950_000 * weight[s[5]]) / totalWeight, 100),
);
koku[0] = koku[0]! + 950_000 - koku.reduce((a, b) => a + b, 0);
const districts = zDistrictsFile.parse(
  SHIKOKU_DISTRICT_SITES.map((site, index) => {
    const kokudaka = koku[index]!;
    const population = roundTo(kokudaka * 0.33 * (site[5] === 'port' ? 1.12 : 1), 100);
    const commerce = site[5] === 'mountain' ? 160 : site[5] === 'port' ? 480 : 260;
    return {
      id: `dist.${site[0]}`,
      name: site[1],
      castleId: `castle.${site[2]}`,
      pos: districtPosition(site),
      isPort: site[5] === 'port',
      kokudaka,
      kokudakaCap: roundTo(kokudaka * 1.4, 100),
      population,
      populationCap: roundTo(population * 1.5, 500),
      commerce,
      commerceCap: roundTo(commerce * 1.6, 10),
      publicOrder: site[5] === 'port' ? 65 : 60,
      stewardId: null,
      developFocus: 'agri',
    };
  }),
);
const castles = zCastlesFile.parse(
  SHIKOKU_CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
    const population = districts
      .filter((d) => d.castleId === `castle.${key}`)
      .reduce((s, d) => s + d.population, 0);
    const max =
      (main ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
      Math.floor(population * BAL.soldiersPerPop);
    const soldiers = Math.floor(max * 0.55);
    return {
      id: `castle.${key}`,
      name,
      provinceId: `prov.${province}`,
      ownerClanId: `clan.${clan}`,
      lordId: main ? leaders[clan] : null,
      tier: main ? 'main' : 'branch',
      pos: lonLatToWorld(lon, lat),
      coastal,
      terrainKind: mountain ? 'mountain' : 'plain',
      soldiers,
      food: roundTo(soldiers * 2.5, 500),
    };
  }),
);
const provinces = zProvincesFile.parse({
  version: 1,
  provinces: [
    ['awa', '阿波'],
    ['sanuki', '讚岐'],
    ['iyo', '伊予'],
    ['tosa', '土佐'],
  ].map(([key, name]) => {
    const cs = castles.filter((c) => c.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region: 'shikoku',
      labelPos: {
        x: Math.round(cs.reduce((s, c) => s + c.pos.x, 0) / cs.length),
        y: Math.round(cs.reduce((s, c) => s + c.pos.y, 0) / cs.length),
      },
    };
  }),
}).provinces;
const positions = new Map([...baseDistricts, ...castles, ...districts].map((n) => [n.id, n.pos]));
const edges: {
  id: string;
  a: string;
  b: string;
  type: 'land' | 'sea';
  grade: 1 | 2 | 3;
  name: string;
  baseDays: number;
}[] = [];
function road(a: string, b: string, grade: 1 | 2 | 3, name: string, mountain = false, sea = false) {
  const from = positions.get(a),
    to = positions.get(b);
  if (!from || !to) throw new Error(`Missing B7 road endpoint ${a}/${b}`);
  edges.push({
    id: `road.b7-${edges.length + 1}`,
    a,
    b,
    grade,
    type: sea ? 'sea' : 'land',
    name,
    baseDays: Math.max(
      0.5,
      Math.min(
        8,
        roundTo((Math.hypot(to.x - from.x, to.y - from.y) / 90) * (mountain ? 1.5 : 1), 0.5),
      ),
    ),
  });
}
for (const d of districts)
  road(
    d.castleId,
    d.id,
    1,
    '領內往還',
    SHIKOKU_DISTRICT_SITES.find((s) => `dist.${s[0]}` === d.id)?.[5] === 'mountain',
  );

road('castle.shozui', 'castle.toramaru', 2, '阿讚往還', true);
road('castle.toramaru', 'castle.sogo', 2, '讚岐往還');
road('castle.sogo', 'castle.kurushima', 2, '北四國往還', true);
road('castle.kurushima', 'castle.yuzuki', 2, '伊予往還');
road('castle.yuzuki', 'castle.kurose', 1, '南予往還', true);
road('castle.kurose', 'castle.nakamura', 1, '予土往還', true);
road('castle.nakamura', 'castle.oko', 1, '土佐往還', true);
road('castle.oko', 'castle.shozui', 1, '土佐阿波山道', true);
road('dist.awa-itano-muya', 'dist.kii-nagusa', 1, '紀淡航路', false, true);
road('dist.iyo-ochi-kurushima', 'dist.aki-sato', 1, '瀨戶內航路', false, true);
road('dist.sanuki-kagawa', 'dist.bizen-kojima', 1, '瀨戶內航路', false, true);
edges[edges.length - 3]!.baseDays = 2;
edges[edges.length - 2]!.baseDays = 2;
edges[edges.length - 1]!.baseDays = 1.5;
export const SHIKOKU_GEOGRAPHY = {
  provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};
