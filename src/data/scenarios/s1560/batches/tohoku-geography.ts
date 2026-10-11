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
import { KYUSHU_GEOGRAPHY } from './kyushu-geography';
const baseCastleIds = new Set(existingCastles.map((c) => c.id));
const baseDistrictIds = new Set(existingDistricts.map((d) => d.id));
const baseCastles = [
  ...existingCastles,
  ...KYUSHU_GEOGRAPHY.castles.filter((c) => !baseCastleIds.has(c.id)),
];
const baseDistricts = [
  ...existingDistricts,
  ...KYUSHU_GEOGRAPHY.districts.filter((d) => !baseDistrictIds.has(d.id)),
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
export const TOHOKU_CASTLE_SITES: readonly CastleSite[] = [
  ['yonezawa', '米澤城', 'uzen', 'date', 140.12, 37.92, true, false, false],
  ['koori-nishiyama', '桑折西山城', 'iwashiro', 'date', 140.5, 37.84, false, true, false],
  ['namo', '名生城', 'rikuzen', 'date', 140.88, 38.62, false, false, false],
  ['kurokawa', '黑川城', 'iwashiro', 'ashina', 139.93, 37.49, true, false, false],
  ['naganuma', '長沼城', 'iwashiro', 'ashina', 140.22, 37.29, false, true, false],
  ['shirakawa', '白河城', 'iwashiro', 'ashina', 140.21, 37.13, false, false, false],
  ['yamagata', '山形城', 'uzen', 'mogami', 140.33, 38.25, true, false, false],
  ['kaminoyama', '上山城', 'uzen', 'mogami', 140.28, 38.16, false, false, false],
  ['sannohe', '三戶城', 'mutsu', 'nanbu', 141.26, 40.4, true, true, false],
  ['kunohe', '九戶城', 'mutsu', 'nanbu', 141.3, 40.27, false, true, false],
  ['kozukata', '不來方城', 'rikuchu', 'nanbu', 141.15, 39.7, false, false, false],
  ['hanamaki', '花卷城', 'rikuchu', 'nanbu', 141.12, 39.39, false, false, false],
  ['hiyama', '檜山城', 'ugo', 'ando', 140.11, 40.14, true, true, false],
  ['minato', '湊城', 'ugo', 'ando', 140.08, 39.75, false, false, true],
];

// Named counties and explicit named subdivisions are gameplay nodes, not extra historical counties.
export const TOHOKU_DISTRICT_SITES: readonly DistrictSite[] = [
  ['uzen-okitama', '置賜郡', 'yonezawa', 140.05, 37.9, 'plain'],
  ['uzen-okitama-east', '置賜東部', 'yonezawa', 140.25, 37.95, 'plain'],
  ['uzen-okitama-west', '置賜西部', 'yonezawa', 139.85, 38.05, 'mountain'],
  ['iwashiro-shinobu', '信夫郡', 'koori-nishiyama', 140.42, 37.75, 'plain'],
  ['iwashiro-date', '伊達郡', 'koori-nishiyama', 140.6, 37.83, 'plain'],
  ['iwashiro-adachi', '安達郡', 'koori-nishiyama', 140.43, 37.6, 'plain'],
  ['rikuzen-shida', '志田郡', 'namo', 140.96, 38.58, 'plain'],
  ['rikuzen-tamazukuri', '玉造郡', 'namo', 140.75, 38.74, 'mountain'],
  ['rikuzen-miyagi', '宮城郡', 'namo', 140.96, 38.33, 'plain'],
  ['iwashiro-aizu', '會津郡', 'kurokawa', 139.86, 37.45, 'plain'],
  ['iwashiro-yama', '耶麻郡', 'kurokawa', 139.9, 37.65, 'mountain'],
  ['iwashiro-onuma', '大沼郡', 'kurokawa', 139.76, 37.35, 'mountain'],
  ['iwashiro-iwase', '岩瀨郡', 'naganuma', 140.29, 37.3, 'plain'],
  ['iwashiro-asaka', '安積郡', 'naganuma', 140.37, 37.4, 'plain'],
  ['iwashiro-iwase-west', '岩瀨西部', 'naganuma', 140.1, 37.3, 'mountain'],
  ['iwashiro-shirakawa', '白河郡', 'shirakawa', 140.22, 37.06, 'plain'],
  ['iwashiro-shirakawa-east', '白河東部', 'shirakawa', 140.42, 37.12, 'plain'],
  ['iwashiro-iwaki', '磐城郡', 'shirakawa', 140.56, 37.06, 'mountain'],
  ['uzen-murayama', '村山郡', 'yamagata', 140.34, 38.35, 'plain'],
  ['uzen-mogami', '最上郡', 'yamagata', 140.3, 38.8, 'mountain'],
  ['uzen-tagawa', '田川郡', 'yamagata', 139.83, 38.7, 'plain'],
  ['uzen-murayama-south', '村山南部', 'kaminoyama', 140.2, 38.13, 'plain'],
  ['uzen-murayama-east', '村山東部', 'kaminoyama', 140.46, 38.18, 'mountain'],
  ['mutsu-sannohe', '三戶郡', 'sannohe', 141.15, 40.45, 'plain'],
  ['mutsu-tsugaru-tosaminato', '津輕十三湊', 'sannohe', 140.33, 41.03, 'port'],
  ['mutsu-kamikita', '上北郡', 'sannohe', 141.18, 40.7, 'plain'],
  ['mutsu-ninohe', '二戶郡', 'kunohe', 141.22, 40.25, 'mountain'],
  ['mutsu-sannohe-east', '三戶東部', 'kunohe', 141.47, 40.36, 'plain'],
  ['mutsu-ninohe-west', '二戶西部', 'kunohe', 141.1, 40.22, 'mountain'],
  ['rikuchu-iwate', '岩手郡', 'kozukata', 141.2, 39.8, 'plain'],
  ['rikuchu-shiwa', '紫波郡', 'kozukata', 141.15, 39.56, 'plain'],
  ['rikuchu-hei', '閉伊郡', 'kozukata', 141.55, 39.65, 'mountain'],
  ['rikuchu-hienuki', '稗貫郡', 'hanamaki', 141.04, 39.39, 'plain'],
  ['rikuchu-waga', '和賀郡', 'hanamaki', 140.96, 39.32, 'plain'],
  ['rikuchu-isawa', '膽澤郡', 'hanamaki', 141.12, 39.18, 'plain'],
  ['ugo-yamamoto-hiyama', '山本檜山', 'hiyama', 140.22, 40.15, 'mountain'],
  ['ugo-yamamoto', '山本郡', 'hiyama', 140.04, 40.24, 'plain'],
  ['ugo-kitaakita', '北秋田郡', 'hiyama', 140.4, 40.17, 'mountain'],
  ['ugo-akita-tsuchizaki', '秋田土崎', 'minato', 140.06, 39.76, 'port'],
  ['ugo-akita', '秋田郡', 'minato', 140.23, 39.72, 'plain'],
];

const leaders: Readonly<Record<string, string>> = {
  date: 'off.date-harumune',
  ashina: 'off.ashina-moriuji',
  mogami: 'off.mogami-yoshimori',
  nanbu: 'off.nanbu-harumasa',
  ando: 'off.ando-chikasue',
};
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const batchNodeIds = new Set([
  ...TOHOKU_CASTLE_SITES.map((s) => `castle.${s[0]}`),
  ...TOHOKU_DISTRICT_SITES.map((s) => `dist.${s[0]}`),
]);
const occupied = [...baseCastles, ...baseDistricts]
  .filter((n) => !batchNodeIds.has(n.id))
  .map((n) => n.pos);
for (const site of TOHOKU_CASTLE_SITES) occupied.push(lonLatToWorld(site[4], site[5]));

/** Fit authored district markers inside the coarse outline, retaining their named-site direction. */
function districtPosition(site: DistrictSite) {
  const parent = TOHOKU_CASTLE_SITES.find((c) => c[0] === site[2]);
  if (!parent) throw new Error(`Missing Tohoku parent ${site[2]}`);
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
const totalWeight = TOHOKU_DISTRICT_SITES.reduce((sum, site) => sum + weight[site[5]], 0);
const koku = TOHOKU_DISTRICT_SITES.map((s) =>
  roundTo((2_100_000 * weight[s[5]]) / totalWeight, 100),
);
koku[0] = koku[0]! + 2_100_000 - koku.reduce((a, b) => a + b, 0);
const districts = zDistrictsFile.parse(
  TOHOKU_DISTRICT_SITES.map((site, index) => {
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
  TOHOKU_CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
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
    ['mutsu', '陸奧'],
    ['rikuchu', '陸中'],
    ['rikuzen', '陸前'],
    ['iwashiro', '岩代'],
    ['uzen', '羽前'],
    ['ugo', '羽後'],
  ].map(([key, name]) => {
    const cs = castles.filter((c) => c.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region: 'tohoku',
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
  if (!from || !to) throw new Error(`Missing B9 road endpoint ${a}/${b}`);
  edges.push({
    id: `road.b9-${edges.length + 1}`,
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
    TOHOKU_DISTRICT_SITES.find((s) => `dist.${s[0]}` === d.id)?.[5] === 'mountain',
  );

road('castle.shirakawa', 'castle.naganuma', 2, '奧州街道');
road('castle.naganuma', 'castle.koori-nishiyama', 2, '奧州街道');
road('castle.koori-nishiyama', 'castle.namo', 2, '奧州街道');
road('castle.namo', 'castle.hanamaki', 2, '奧州街道');
road('castle.hanamaki', 'castle.kozukata', 2, '奧州街道');
road('castle.kozukata', 'castle.kunohe', 2, '奧州街道');
road('castle.kunohe', 'castle.sannohe', 2, '奧州街道');
road('castle.kurokawa', 'castle.naganuma', 1, '會津往還', true);
road('castle.kurokawa', 'castle.yonezawa', 1, '米澤街道', true);
road('castle.yonezawa', 'castle.koori-nishiyama', 1, '米澤街道', true);
road('castle.yonezawa', 'castle.kaminoyama', 2, '羽州街道');
road('castle.kaminoyama', 'castle.yamagata', 2, '羽州街道');
road('castle.yamagata', 'castle.minato', 2, '羽州街道', true);
road('castle.minato', 'castle.hiyama', 2, '羽州街道');
road('castle.hiyama', 'castle.sannohe', 1, '北奧山道', true);
road('dist.shimotsuke-kawachi', 'dist.iwashiro-shirakawa', 2, '奧州街道');
road('dist.echigo-iwafune', 'dist.uzen-okitama', 1, '米澤街道', true);
road('dist.echigo-kubiki-naoetsu', 'dist.ugo-akita-tsuchizaki', 1, '日本海北航路', false, true);
edges[edges.length - 1]!.baseDays = 4;
road('dist.ugo-akita-tsuchizaki', 'dist.mutsu-tsugaru-tosaminato', 1, '日本海北航路', false, true);
edges[edges.length - 1]!.baseDays = 3;
export const TOHOKU_GEOGRAPHY = {
  provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};
