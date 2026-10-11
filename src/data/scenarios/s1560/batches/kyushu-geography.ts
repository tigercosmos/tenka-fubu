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
import { SHIKOKU_GEOGRAPHY } from './shikoku-geography';
const baseCastleIds = new Set(SHIKOKU_GEOGRAPHY.castles.map((c) => c.id));
const baseDistrictIds = new Set(SHIKOKU_GEOGRAPHY.districts.map((d) => d.id));
const baseCastles = [
  ...existingCastles.filter((c) => !baseCastleIds.has(c.id)),
  ...SHIKOKU_GEOGRAPHY.castles,
];
const baseDistricts = [
  ...existingDistricts.filter((d) => !baseDistrictIds.has(d.id)),
  ...SHIKOKU_GEOGRAPHY.districts,
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
export const KYUSHU_CASTLE_SITES: readonly CastleSite[] = [
  ['funai', '府內館', 'bungo', 'otomo', 131.61, 33.23, true, false, true],
  ['usuki', '臼杵城', 'bungo', 'otomo', 131.81, 33.12, false, false, true],
  ['kokura', '小倉城', 'buzen', 'otomo', 130.87, 33.88, false, false, true],
  ['tachibanayama', '立花山城', 'chikuzen', 'otomo', 130.46, 33.68, false, true, false],
  ['kumamoto', '隈本城', 'higo', 'otomo', 130.7, 32.8, false, false, false],
  ['yanagawa', '柳川城', 'chikugo', 'otomo', 130.4, 33.16, false, false, false],
  ['uchijo', '內城', 'satsuma', 'shimazu', 130.56, 31.61, true, false, false],
  ['kaseda', '加世田城', 'satsuma', 'shimazu', 130.32, 31.42, false, true, false],
  ['shimizu', '清水城', 'osumi', 'shimazu', 130.79, 31.76, false, true, false],
  ['muranaka', '村中城', 'hizen', 'ryuzoji', 130.3, 33.25, true, false, false],
  ['hasuike', '蓮池城', 'hizen', 'ryuzoji', 130.38, 33.26, false, false, false],
  ['tonokori', '都於郡城', 'hyuga', 'ito', 131.36, 32.05, true, true, false],
  ['sadowara', '佐土原城', 'hyuga', 'ito', 131.4, 32.05, false, true, false],
  ['hitoyoshi', '人吉城', 'higo', 'sagara', 130.75, 32.21, true, true, false],
];

// Named counties and explicit named subdivisions are gameplay nodes, not extra historical counties.
export const KYUSHU_DISTRICT_SITES: readonly DistrictSite[] = [
  ['bungo-oita', '大分郡', 'funai', 131.61, 33.22, 'plain'],
  ['bungo-hayami', '速見郡', 'funai', 131.5, 33.35, 'plain'],
  ['bungo-kusu', '玖珠郡', 'funai', 131.15, 33.28, 'mountain'],
  ['bungo-amabe-saganoseki', '海部佐賀關', 'usuki', 131.89, 33.25, 'port'],
  ['bungo-amabe-usuki', '海部臼杵', 'usuki', 131.8, 33.13, 'port'],
  ['bungo-ono', '大野郡', 'usuki', 131.57, 32.97, 'plain'],
  ['buzen-kiku-moji', '企救門司', 'kokura', 130.96, 33.95, 'port'],
  ['buzen-kiku', '企救郡', 'kokura', 130.88, 33.83, 'plain'],
  ['buzen-miyako', '京都郡', 'kokura', 130.96, 33.7, 'plain'],
  ['chikuzen-kasuya', '糟屋郡', 'tachibanayama', 130.48, 33.64, 'plain'],
  ['chikuzen-naka-hakata', '那珂博多', 'tachibanayama', 130.4, 33.6, 'port'],
  ['chikuzen-munakata', '宗像郡', 'tachibanayama', 130.55, 33.8, 'plain'],
  ['higo-akita', '飽田郡', 'kumamoto', 130.66, 32.79, 'plain'],
  ['higo-tamana', '玉名郡', 'kumamoto', 130.56, 32.94, 'plain'],
  ['higo-uto', '宇土郡', 'kumamoto', 130.66, 32.69, 'plain'],
  ['chikugo-yamato', '山門郡', 'yanagawa', 130.43, 33.13, 'plain'],
  ['chikugo-mii', '御井郡', 'yanagawa', 130.56, 33.31, 'plain'],
  ['chikugo-mizuma', '三潴郡', 'yanagawa', 130.45, 33.21, 'plain'],
  ['satsuma-kagoshima', '鹿兒島郡', 'uchijo', 130.54, 31.6, 'plain'],
  ['satsuma-hioki', '日置郡', 'uchijo', 130.4, 31.63, 'plain'],
  ['satsuma-izumi', '出水郡', 'uchijo', 130.36, 32.09, 'plain'],
  ['satsuma-kawabe', '川邊郡', 'kaseda', 130.36, 31.4, 'plain'],
  ['satsuma-ibusuki', '指宿郡', 'kaseda', 130.58, 31.26, 'plain'],
  ['osumi-so', '囎唹郡', 'shimizu', 130.8, 31.78, 'plain'],
  ['osumi-kimotsuki', '肝屬郡', 'shimizu', 130.86, 31.39, 'plain'],
  ['hizen-saga', '佐嘉郡', 'muranaka', 130.29, 33.26, 'plain'],
  ['hizen-ogi', '小城郡', 'muranaka', 130.2, 33.29, 'plain'],
  ['hizen-matsuura', '松浦郡', 'muranaka', 129.88, 33.27, 'plain'],
  ['hizen-kanzaki', '神埼郡', 'hasuike', 130.37, 33.31, 'plain'],
  ['hizen-kishima', '杵島郡', 'hasuike', 130.12, 33.21, 'plain'],
  ['hizen-fujitsu', '藤津郡', 'hasuike', 130.09, 33.1, 'plain'],
  ['hyuga-koyu', '兒湯郡', 'tonokori', 131.47, 32.13, 'plain'],
  ['hyuga-naka', '那珂郡', 'tonokori', 131.38, 32.05, 'plain'],
  ['hyuga-usuki', '臼杵郡', 'tonokori', 131.5, 32.42, 'mountain'],
  ['hyuga-miyazaki', '宮崎郡', 'sadowara', 131.42, 31.96, 'plain'],
  ['hyuga-morokata', '諸縣郡', 'sadowara', 131.17, 31.99, 'mountain'],
  ['hyuga-naka-sadowara', '那珂佐土原', 'sadowara', 131.41, 32.02, 'plain'],
  ['higo-kuma', '球磨郡', 'hitoyoshi', 130.85, 32.23, 'plain'],
  ['higo-ashikita', '葦北郡', 'hitoyoshi', 130.5, 32.27, 'mountain'],
  ['higo-yatsushiro', '八代郡', 'hitoyoshi', 130.61, 32.42, 'plain'],
];

const leaders: Readonly<Record<string, string>> = {
  otomo: 'off.otomo-yoshishige',
  shimazu: 'off.shimazu-takahisa',
  ryuzoji: 'off.ryuzoji-takanobu',
  ito: 'off.ito-yoshisuke',
  sagara: 'off.sagara-yoshihi',
};
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const batchNodeIds = new Set([
  ...KYUSHU_CASTLE_SITES.map((s) => `castle.${s[0]}`),
  ...KYUSHU_DISTRICT_SITES.map((s) => `dist.${s[0]}`),
]);
const occupied = [...baseCastles, ...baseDistricts]
  .filter((n) => !batchNodeIds.has(n.id))
  .map((n) => n.pos);
for (const site of KYUSHU_CASTLE_SITES) occupied.push(lonLatToWorld(site[4], site[5]));

/** Fit authored district markers inside the coarse outline, retaining their named-site direction. */
function districtPosition(site: DistrictSite) {
  const parent = KYUSHU_CASTLE_SITES.find((c) => c[0] === site[2]);
  if (!parent) throw new Error(`Missing Kyushu parent ${site[2]}`);
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
const totalWeight = KYUSHU_DISTRICT_SITES.reduce((sum, site) => sum + weight[site[5]], 0);
const koku = KYUSHU_DISTRICT_SITES.map((s) =>
  roundTo((1_800_000 * weight[s[5]]) / totalWeight, 100),
);
koku[0] = koku[0]! + 1_800_000 - koku.reduce((a, b) => a + b, 0);
const districts = zDistrictsFile.parse(
  KYUSHU_DISTRICT_SITES.map((site, index) => {
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
  KYUSHU_CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
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
    ['chikuzen', '筑前'],
    ['chikugo', '筑後'],
    ['buzen', '豐前'],
    ['bungo', '豐後'],
    ['hizen', '肥前'],
    ['higo', '肥後'],
    ['hyuga', '日向'],
    ['osumi', '大隅'],
    ['satsuma', '薩摩'],
  ].map(([key, name]) => {
    const cs = castles.filter((c) => c.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region: 'kyushu',
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
  if (!from || !to) throw new Error(`Missing B8 road endpoint ${a}/${b}`);
  edges.push({
    id: `road.b8-${edges.length + 1}`,
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
    KYUSHU_DISTRICT_SITES.find((s) => `dist.${s[0]}` === d.id)?.[5] === 'mountain',
  );

road('castle.kokura', 'castle.tachibanayama', 2, '筑前往還');
road('castle.tachibanayama', 'castle.yanagawa', 2, '筑後往還');
road('castle.yanagawa', 'castle.muranaka', 2, '長崎街道');
road('castle.muranaka', 'castle.hasuike', 1, '肥前往還');
road('castle.yanagawa', 'castle.kumamoto', 2, '薩摩街道');
road('castle.kokura', 'castle.funai', 2, '豐前豐後往還', true);
road('castle.funai', 'castle.kumamoto', 1, '豐後街道', true);
road('castle.funai', 'castle.usuki', 2, '豐後往還');
road('castle.usuki', 'castle.tonokori', 1, '日向往還', true);
road('castle.tonokori', 'castle.sadowara', 1, '日向往還');
road('castle.sadowara', 'castle.shimizu', 1, '日向大隅山道', true);
road('castle.shimizu', 'castle.uchijo', 1, '薩隅往還', true);
road('castle.uchijo', 'castle.kaseda', 2, '薩摩街道');
road('castle.kumamoto', 'castle.hitoyoshi', 1, '球磨往還', true);
road('castle.hitoyoshi', 'castle.uchijo', 1, '薩摩街道', true);
// No Hitoyoshi–Hyuga edge: canonical mountainous boundary remains indirect.
road('dist.nagato-toyoura', 'dist.buzen-kiku-moji', 1, '關門海峽', false, true);
edges[edges.length - 1]!.baseDays = 0.5;
road('dist.bungo-amabe-saganoseki', 'dist.iyo-uwa-sadamisaki', 1, '豐後水道航路', false, true);
edges[edges.length - 1]!.baseDays = 2;
road('dist.suo-kumage-kaminoseki', 'dist.buzen-kiku-moji', 1, '周防灘航路', false, true);
edges[edges.length - 1]!.baseDays = 2;
road('dist.buzen-kiku-moji', 'dist.chikuzen-naka-hakata', 1, '北九州航路', false, true);
edges[edges.length - 1]!.baseDays = 2;
export const KYUSHU_GEOGRAPHY = {
  provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};
