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

// Approximate named-site coordinates; ownership follows 14 §3.6, not a historical survey.
// Ono uses the later Kameyama site as an explicit geographical abstraction.
export const HOKURIKU_CASTLE_SITES: readonly CastleSite[] = [
  ['ichijodani', '一乘谷城', 'echizen', 'asakura', 136.29, 36.0, true, true, false],
  ['kanegasaki', '金崎城', 'echizen', 'asakura', 136.07, 35.67, false, true, true],
  ['ono', '大野城', 'echizen', 'asakura', 136.48, 35.99, false, true, false],
  ['nochiseyama', '後瀨山城', 'echizen', 'asakura', 135.74, 35.49, false, true, true],
  ['nanao', '七尾城', 'noto', 'hatakeyama', 136.99, 37.01, true, true, false],
  ['suemori', '末森城', 'noto', 'hatakeyama', 136.77, 36.83, false, true, false],
  ['toyama', '富山城', 'etchu', 'jinbo', 137.21, 36.69, true, false, false],
  ['masuyama', '增山城', 'etchu', 'jinbo', 137.04, 36.64, false, true, false],
  ['oyama-gobo', '尾山御坊', 'kaga', 'honganji', 136.66, 36.56, false, false, false],
  ['daishoji', '大聖寺城', 'kaga', 'honganji', 136.3, 36.3, false, true, false],
];

// Named counties and explicit named subdivisions are gameplay nodes, not extra historical counties.
export const HOKURIKU_DISTRICT_SITES: readonly DistrictSite[] = [
  ['echizen-asuwa', '足羽郡', 'ichijodani', 136.22, 36.06, 'plain'],
  ['echizen-yoshida', '吉田郡', 'ichijodani', 136.33, 36.09, 'plain'],
  ['echizen-sakai-mikuni', '坂井三國', 'ichijodani', 136.15, 36.22, 'port'],
  ['echizen-tsuruga', '敦賀郡', 'kanegasaki', 136.06, 35.62, 'port'],
  ['echizen-nanjo', '南條郡', 'kanegasaki', 136.2, 35.8, 'mountain'],
  ['echizen-imadate', '今立郡', 'kanegasaki', 136.21, 35.91, 'plain'],
  ['echizen-ono', '大野郡', 'ono', 136.51, 35.9, 'plain'],
  ['echizen-ono-katsuyama', '大野勝山', 'ono', 136.5, 36.06, 'mountain'],
  ['echizen-ono-izumi', '大野和泉', 'ono', 136.64, 35.9, 'mountain'],
  ['echizen-wakasa-onyu', '遠敷郡', 'nochiseyama', 135.81, 35.45, 'plain'],
  ['echizen-wakasa-mikata', '三方郡', 'nochiseyama', 135.92, 35.55, 'port'],
  ['noto-kashima', '鹿島郡', 'nanao', 136.94, 36.95, 'plain'],
  ['noto-fugeshi-wajima', '鳳至輪島', 'nanao', 136.9, 37.39, 'port'],
  ['noto-suzu', '珠洲郡', 'nanao', 137.25, 37.43, 'port'],
  ['noto-hakui', '羽咋郡', 'suemori', 136.78, 36.89, 'plain'],
  ['noto-hakui-togi', '羽咋富來', 'suemori', 136.72, 37.14, 'port'],
  ['noto-hakui-oshimizu', '羽咋押水', 'suemori', 136.8, 36.78, 'plain'],
  ['etchu-nei', '婦負郡', 'toyama', 137.13, 36.65, 'plain'],
  ['etchu-niikawa', '新川郡', 'toyama', 137.42, 36.87, 'port'],
  ['etchu-niikawa-kamiichi', '新川上市', 'toyama', 137.36, 36.7, 'plain'],
  ['etchu-tonami', '礪波郡', 'masuyama', 136.96, 36.63, 'plain'],
  ['etchu-imizu', '射水郡', 'masuyama', 137.09, 36.77, 'port'],
  ['kaga-ishikawa', '石川郡', 'oyama-gobo', 136.56, 36.51, 'plain'],
  ['kaga-kahoku', '河北郡', 'oyama-gobo', 136.7, 36.71, 'plain'],
  ['kaga-ishikawa-kanaiwa', '石川金石', 'oyama-gobo', 136.6, 36.61, 'port'],
  ['kaga-enuma', '江沼郡', 'daishoji', 136.34, 36.31, 'plain'],
  ['kaga-nomi', '能美郡', 'daishoji', 136.46, 36.42, 'plain'],
  ['kaga-enuma-yamanaka', '江沼山中', 'daishoji', 136.37, 36.25, 'mountain'],
];

const leaders: Readonly<Record<string, string>> = {
  asakura: 'off.asakura-yoshikage',
  hatakeyama: 'off.hatakeyama-yoshitsuna',
  jinbo: 'off.jinbo-nagamoto',
};
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const batchNodeIds = new Set([
  ...HOKURIKU_CASTLE_SITES.map((s) => `castle.${s[0]}`),
  ...HOKURIKU_DISTRICT_SITES.map((s) => `dist.${s[0]}`),
]);
const occupied = [...existingCastles, ...existingDistricts]
  .filter((n) => !batchNodeIds.has(n.id))
  .map((n) => n.pos);
for (const site of HOKURIKU_CASTLE_SITES) occupied.push(lonLatToWorld(site[4], site[5]));

/** Fit authored district markers inside the coarse outline, retaining their named-site direction. */
function districtPosition(site: DistrictSite) {
  const parent = HOKURIKU_CASTLE_SITES.find((c) => c[0] === site[2]);
  if (!parent) throw new Error(`Missing Hokuriku parent ${site[2]}`);
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
const totalWeight = HOKURIKU_DISTRICT_SITES.reduce((sum, site) => sum + weight[site[5]], 0);
const koku = HOKURIKU_DISTRICT_SITES.map((s) =>
  roundTo((1_350_000 * weight[s[5]]) / totalWeight, 100),
);
koku[0] = koku[0]! + 1_350_000 - koku.reduce((a, b) => a + b, 0);
const districts = zDistrictsFile.parse(
  HOKURIKU_DISTRICT_SITES.map((site, index) => {
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
  HOKURIKU_CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
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
    ['echizen', '越前'],
    ['kaga', '加賀'],
    ['noto', '能登'],
    ['etchu', '越中'],
  ].map(([key, name]) => {
    const cs = castles.filter((c) => c.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region: 'hokuriku',
      labelPos: {
        x: Math.round(cs.reduce((s, c) => s + c.pos.x, 0) / cs.length),
        y: Math.round(cs.reduce((s, c) => s + c.pos.y, 0) / cs.length),
      },
    };
  }),
}).provinces;
const positions = new Map(
  [...existingDistricts, ...castles, ...districts].map((n) => [n.id, n.pos]),
);
const edges: {
  id: string;
  a: string;
  b: string;
  type: 'land' | 'sea';
  grade: 1 | 2;
  name: string;
  baseDays: number;
}[] = [];
function road(a: string, b: string, grade: 1 | 2, name: string, mountain = false, sea = false) {
  const from = positions.get(a),
    to = positions.get(b);
  if (!from || !to) throw new Error(`Missing B5 road endpoint ${a}/${b}`);
  edges.push({
    id: `road.b5-${edges.length + 1}`,
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
    HOKURIKU_DISTRICT_SITES.find((s) => `dist.${s[0]}` === d.id)?.[5] === 'mountain',
  );
for (const [a, b] of [
  ['ichijodani', 'kanegasaki'],
  ['ichijodani', 'ono'],
  ['kanegasaki', 'nochiseyama'],
  ['ichijodani', 'daishoji'],
  ['daishoji', 'oyama-gobo'],
  ['oyama-gobo', 'suemori'],
  ['suemori', 'nanao'],
  ['oyama-gobo', 'masuyama'],
  ['masuyama', 'toyama'],
])
  road(`castle.${a}`, `castle.${b}`, 2, '北陸道', a === 'ichijodani' && b === 'kanegasaki');
road('dist.echizen-tsuruga', 'dist.omi-shiga', 2, '北國街道', true);
road('dist.etchu-niikawa', 'dist.echigo-kubiki-itoigawa', 1, '親不知', true);
road('dist.echizen-wakasa-mikata', 'dist.echizen-sakai-mikuni', 1, '若狹越前航路', false, true);
road('dist.echizen-sakai-mikuni', 'dist.noto-fugeshi-wajima', 1, '日本海西段航路', false, true);
road('dist.noto-fugeshi-wajima', 'dist.echigo-kubiki-naoetsu', 1, '日本海航路', false, true);
/** Staged plain payload; full officer/clan closure remains a separate integration gate. */
export const HOKURIKU_GEOGRAPHY = {
  provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};
