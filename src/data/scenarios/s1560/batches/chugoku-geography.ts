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

// Rounded medieval-site anchors; source boundaries are recorded in the companion provenance file.
export const CHUGOKU_CASTLE_SITES: readonly CastleSite[] = [
  ['yoshida-koriyama', '吉田郡山城', 'aki', 'mori', 132.7, 34.67, true, true, false],
  ['sato-kanayama', '佐東銀山城', 'aki', 'mori', 132.45, 34.48, false, true, false],
  ['sakurao', '櫻尾城', 'aki', 'mori', 132.34, 34.35, false, false, true],
  ['konomine', '高嶺城', 'suo', 'mori', 131.46, 34.18, false, true, false],
  ['katsuyama', '勝山城', 'nagato', 'mori', 130.97, 34.03, false, true, false],
  ['bitchu-matsuyama', '松山城', 'bitchu', 'mori', 133.62, 34.81, false, true, false],
  ['kannabe', '神邊城', 'bingo', 'mori', 133.37, 34.54, false, true, false],
  ['gassan-toda', '月山富田城', 'izumo', 'amago', 133.19, 35.36, true, true, false],
  ['shiraga', '白鹿城', 'izumo', 'amago', 133.03, 35.5, false, true, false],
  ['yamabuki', '山吹城', 'iwami', 'amago', 132.45, 35.1, false, true, false],
  ['yonago', '米子城', 'hoki', 'amago', 133.33, 35.42, false, true, true],
  ['tottori', '鳥取城', 'inaba', 'yamana', 134.24, 35.51, false, true, false],
  ['tenjinyama', '天神山城', 'bizen', 'uragami', 134.14, 34.86, true, true, false],
  ['mitsuishi', '三石城', 'bizen', 'uragami', 134.26, 34.81, false, true, false],
  ['okishio', '置鹽城', 'harima', 'akamatsu', 134.68, 34.92, true, true, false],
  ['tatsuno', '龍野城', 'harima', 'akamatsu', 134.55, 34.87, false, true, false],
];

// Named counties and explicit named subdivisions are gameplay nodes, not extra historical counties.
export const CHUGOKU_DISTRICT_SITES: readonly DistrictSite[] = [
  ['aki-takata', '高田郡', 'yoshida-koriyama', 132.72, 34.7, 'plain'],
  ['aki-yamagata', '山縣郡', 'yoshida-koriyama', 132.5, 34.75, 'mountain'],
  ['aki-takata-yoshida', '高田吉田', 'yoshida-koriyama', 132.7, 34.65, 'plain'],
  ['aki-sato', '佐東郡', 'sato-kanayama', 132.45, 34.42, 'port'],
  ['aki-numata', '沼田郡', 'sato-kanayama', 132.4, 34.45, 'plain'],
  ['aki-takamiya', '高宮郡', 'sato-kanayama', 132.56, 34.55, 'mountain'],
  ['aki-saeki', '佐伯郡', 'sakurao', 132.28, 34.36, 'plain'],
  ['aki-saeki-hatsukaichi', '佐伯廿日市', 'sakurao', 132.33, 34.35, 'port'],
  ['aki-toyota', '豐田郡', 'sakurao', 132.88, 34.33, 'plain'],
  ['suo-yoshiki', '吉敷郡', 'konomine', 131.47, 34.16, 'plain'],
  ['suo-tsuno', '都濃郡', 'konomine', 131.83, 34.05, 'plain'],
  ['suo-kumage-kaminoseki', '熊毛上關', 'konomine', 132.11, 33.83, 'port'],
  ['nagato-toyoura', '豐浦郡', 'katsuyama', 130.94, 33.96, 'port'],
  ['nagato-abu', '阿武郡', 'katsuyama', 131.4, 34.41, 'plain'],
  ['nagato-mine', '美禰郡', 'katsuyama', 131.2, 34.18, 'mountain'],
  ['bitchu-jobo', '上房郡', 'bitchu-matsuyama', 133.64, 34.8, 'plain'],
  ['bitchu-kawakami', '川上郡', 'bitchu-matsuyama', 133.52, 34.72, 'plain'],
  ['bitchu-tetta', '哲多郡', 'bitchu-matsuyama', 133.43, 34.91, 'mountain'],
  ['bingo-yasuna', '安那郡', 'kannabe', 133.36, 34.56, 'plain'],
  ['bingo-fukatsu', '深津郡', 'kannabe', 133.39, 34.49, 'port'],
  ['bingo-ashida', '蘆田郡', 'kannabe', 133.24, 34.56, 'plain'],
  ['izumo-nogi', '能義郡', 'gassan-toda', 133.26, 35.41, 'plain'],
  ['izumo-ohara', '大原郡', 'gassan-toda', 132.9, 35.32, 'plain'],
  ['izumo-nogi-hirosek', '能義廣瀨', 'gassan-toda', 133.25, 35.37, 'mountain'],
  ['izumo-shimane', '島根郡', 'shiraga', 133.05, 35.53, 'port'],
  ['izumo-ou', '意宇郡', 'shiraga', 133.07, 35.45, 'plain'],
  ['izumo-akika', '秋鹿郡', 'shiraga', 132.94, 35.47, 'plain'],
  ['iwami-nima', '邇摩郡', 'yamabuki', 132.4, 35.15, 'mountain'],
  ['iwami-nima-yunotsu', '邇摩溫泉津', 'yamabuki', 132.35, 35.09, 'port'],
  ['iwami-naka', '那賀郡', 'yamabuki', 132.09, 34.91, 'plain'],
  ['hoki-aimi', '會見郡', 'yonago', 133.36, 35.42, 'plain'],
  ['hoki-hino', '日野郡', 'yonago', 133.44, 35.23, 'mountain'],
  ['hoki-aseiri', '汗入郡', 'yonago', 133.49, 35.46, 'plain'],
  ['inaba-iwai', '岩井郡', 'tottori', 134.33, 35.55, 'port'],
  ['inaba-homi', '法美郡', 'tottori', 134.28, 35.45, 'plain'],
  ['inaba-keta', '氣多郡', 'tottori', 134.08, 35.51, 'plain'],
  ['bizen-wake', '和氣郡', 'tenjinyama', 134.16, 34.8, 'plain'],
  ['bizen-mimasaka-aida', '美作英田', 'tenjinyama', 134.14, 35, 'mountain'],
  ['bizen-jodo', '上道郡', 'mitsuishi', 134.02, 34.72, 'plain'],
  ['bizen-kojima', '兒島郡', 'mitsuishi', 133.81, 34.47, 'port'],
  ['harima-shikama', '飾磨郡', 'okishio', 134.68, 34.82, 'plain'],
  ['harima-jinto', '神東郡', 'okishio', 134.79, 34.99, 'plain'],
  ['harima-ibo', '揖保郡', 'tatsuno', 134.55, 34.85, 'plain'],
  ['harima-ako', '赤穗郡', 'tatsuno', 134.39, 34.75, 'port'],
];

const leaders: Readonly<Record<string, string>> = {
  mori: 'off.mori-motonari',
  amago: 'off.amago-haruhisa',
  uragami: 'off.uragami-munekage',
  akamatsu: 'off.akamatsu-harumasa',
};
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const batchNodeIds = new Set([
  ...CHUGOKU_CASTLE_SITES.map((s) => `castle.${s[0]}`),
  ...CHUGOKU_DISTRICT_SITES.map((s) => `dist.${s[0]}`),
]);
const occupied = [...existingCastles, ...existingDistricts]
  .filter((n) => !batchNodeIds.has(n.id))
  .map((n) => n.pos);
for (const site of CHUGOKU_CASTLE_SITES) occupied.push(lonLatToWorld(site[4], site[5]));

/** Fit authored district markers inside the coarse outline, retaining their named-site direction. */
function districtPosition(site: DistrictSite) {
  // Once integrated, authored markers stay fixed when a later region adds nearby nodes.
  const integrated = existingDistricts.find(({ id }) => id === `dist.${site[0]}`);
  if (integrated) {
    const pos = { ...integrated.pos };
    occupied.push(pos);
    return pos;
  }
  const parent = CHUGOKU_CASTLE_SITES.find((c) => c[0] === site[2]);
  if (!parent) throw new Error(`Missing Chugoku parent ${site[2]}`);
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
const totalWeight = CHUGOKU_DISTRICT_SITES.reduce((sum, site) => sum + weight[site[5]], 0);
const koku = CHUGOKU_DISTRICT_SITES.map((s) =>
  roundTo((2_150_000 * weight[s[5]]) / totalWeight, 100),
);
koku[0] = koku[0]! + 2_150_000 - koku.reduce((a, b) => a + b, 0);
const districts = zDistrictsFile.parse(
  CHUGOKU_DISTRICT_SITES.map((site, index) => {
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
  CHUGOKU_CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
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
    ['inaba', '因幡'],
    ['hoki', '伯耆'],
    ['izumo', '出雲'],
    ['iwami', '石見'],
    ['harima', '播磨'],
    ['bizen', '備前'],
    ['bitchu', '備中'],
    ['bingo', '備後'],
    ['aki', '安藝'],
    ['suo', '周防'],
    ['nagato', '長門'],
  ].map(([key, name]) => {
    const cs = castles.filter((c) => c.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region: 'chugoku',
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
  grade: 1 | 2 | 3;
  name: string;
  baseDays: number;
}[] = [];
function road(a: string, b: string, grade: 1 | 2 | 3, name: string, mountain = false, sea = false) {
  const from = positions.get(a),
    to = positions.get(b);
  if (!from || !to) throw new Error(`Missing B6 road endpoint ${a}/${b}`);
  edges.push({
    id: `road.b6-${edges.length + 1}`,
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
    CHUGOKU_DISTRICT_SITES.find((s) => `dist.${s[0]}` === d.id)?.[5] === 'mountain',
  );

for (const [a, b] of [
  ['tatsuno', 'okishio'],
  ['tatsuno', 'mitsuishi'],
  ['mitsuishi', 'tenjinyama'],
  ['tenjinyama', 'bitchu-matsuyama'],
  ['bitchu-matsuyama', 'kannabe'],
  ['kannabe', 'yoshida-koriyama'],
  ['yoshida-koriyama', 'sato-kanayama'],
  ['sato-kanayama', 'sakurao'],
  ['sakurao', 'konomine'],
  ['konomine', 'katsuyama'],
])
  road('castle.' + a, 'castle.' + b, 3, '山陽道');
for (const [a, b] of [
  ['tottori', 'yonago'],
  ['yonago', 'gassan-toda'],
  ['gassan-toda', 'shiraga'],
  ['shiraga', 'yamabuki'],
])
  road('castle.' + a, 'castle.' + b, 2, '山陰道');
road('castle.yamabuki', 'castle.yoshida-koriyama', 2, '銀山往還', true);
road('castle.tenjinyama', 'castle.tottori', 2, '出雲街道', true);
road('dist.harima-shikama', 'dist.settsu-nishinari', 3, '山陽道');
road('dist.inaba-keta', 'dist.tajima-keta', 2, '山陰道', true);
road('dist.iwami-nima-yunotsu', 'dist.kaga-ishikawa-kanaiwa', 1, '日本海西段航路', false, true);
road('dist.aki-saeki-hatsukaichi', 'dist.suo-kumage-kaminoseki', 1, '瀨戶內西段航路', false, true);
road('dist.suo-kumage-kaminoseki', 'dist.nagato-toyoura', 1, '周防灘航路', false, true);
/** Staged geography only; complete roster/clan closure is validated separately. */
export const CHUGOKU_GEOGRAPHY = {
  provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};
