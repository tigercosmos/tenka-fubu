import { BAL } from '../../../../core/balance';
import { lonLatToWorld } from '../../../map/projection';
import { zCastlesFile } from '../../../schemas/castle';
import { zDistrictsFile } from '../../../schemas/district';
import { zProvincesFile } from '../../../schemas/province';
import { zRoadsFile } from '../../../schemas/road';
import existingDistricts from '../districts.json';

/** Reviewed B3/B4 authoring payload integrated into production JSON. plan/14 §§3.4–3.9. */
type CastleSite = readonly [
  key: string,
  name: string,
  province: string,
  clan: string,
  lon: number,
  lat: number,
  main: boolean,
  mountain: boolean,
  coastal: boolean,
];
type DistrictSite = readonly [
  key: string,
  name: string,
  castle: string,
  lon: number,
  lat: number,
  terrain: 'plain' | 'mountain' | 'port',
];

// Locations are approximate site coordinates, not reconstructed 1560 castle boundaries.
// The canonical ownership abstraction includes Nagao-aligned Kozuke country lords.
export const CASTLE_SITES: readonly CastleSite[] = [
  ['odawara', '小田原城', 'sagami', 'hojo', 139.15, 35.26, true, false, true],
  ['tamanawa', '玉繩城', 'sagami', 'hojo', 139.51, 35.35, false, true, false],
  ['nirayama', '韮山城', 'izu', 'hojo', 138.96, 35.05, false, true, false],
  ['edo', '江戶城', 'musashi', 'hojo', 139.7, 35.68, false, false, true],
  ['kawagoe', '河越城', 'musashi', 'hojo', 139.49, 35.92, false, false, false],
  ['takiyama', '瀧山城', 'musashi', 'hojo', 139.33, 35.7, false, true, false],
  ['matsuyama', '松山城', 'musashi', 'hojo', 139.42, 36.04, false, true, false],
  ['kururi', '久留里城', 'kazusa', 'satomi', 140.09, 35.29, true, true, false],
  ['sanuki', '佐貫城', 'kazusa', 'satomi', 139.88, 35.26, false, true, false],
  ['ota', '太田城', 'hitachi', 'satake', 140.53, 36.54, true, false, false],
  ['nukada', '額田城', 'hitachi', 'satake', 140.51, 36.46, false, false, false],
  ['utsunomiya', '宇都宮城', 'shimotsuke', 'utsunomiya', 139.89, 36.55, true, false, false],
  ['moka', '真岡城', 'shimotsuke', 'utsunomiya', 140.01, 36.44, false, false, false],
  ['yuki', '結城城', 'shimosa', 'yuki', 139.88, 36.31, true, false, false],
  ['minowa', '箕輪城', 'kozuke', 'nagao', 138.95, 36.4, false, true, false],
  ['umayabashi', '廄橋城', 'kozuke', 'nagao', 139.06, 36.39, false, false, false],
  ['tsutsujigasaki', '躑躅崎館', 'kai', 'takeda', 138.57, 35.67, true, false, false],
  ['iwadono', '岩殿城', 'kai', 'takeda', 138.95, 35.62, false, true, false],
  ['takato', '高遠城', 'shinano', 'takeda', 138.06, 35.83, false, true, false],
  ['fukashi', '深志城', 'shinano', 'takeda', 137.97, 36.24, false, false, false],
  ['kaizu', '海津城', 'shinano', 'takeda', 138.2, 36.56, false, false, false],
  ['kasugayama', '春日山城', 'echigo', 'nagao', 138.25, 37.15, true, true, false],
  ['tochio', '栃尾城', 'echigo', 'nagao', 138.99, 37.47, false, true, false],
  ['sakado', '坂戶城', 'echigo', 'nagao', 138.89, 37.06, false, true, false],
  ['iiyama', '飯山城', 'shinano', 'nagao', 138.37, 36.86, false, false, false],
];

// Real county/place names; repeated counties are explicitly named gameplay subdivisions.
// Positions denote representative places, not historical administrative boundary centroids.
export const DISTRICT_SITES: readonly DistrictSite[] = [
  ['sagami-ashigara-kami', '足柄上郡', 'odawara', 139.13, 35.34, 'plain'],
  ['sagami-ashigara-shimo', '足柄下郡', 'odawara', 139.1, 35.2, 'mountain'],
  ['sagami-yurugi', '餘綾郡', 'odawara', 139.25, 35.3, 'plain'],
  ['sagami-kamakura', '鎌倉郡', 'tamanawa', 139.55, 35.32, 'plain'],
  ['sagami-koza', '高座郡', 'tamanawa', 139.4, 35.43, 'plain'],
  ['sagami-miura', '三浦郡', 'tamanawa', 139.65, 35.14, 'port'],
  ['izu-tagata', '田方郡', 'nirayama', 138.93, 35.1, 'plain'],
  ['izu-kimisawa', '君澤郡', 'nirayama', 138.91, 35.0, 'mountain'],
  ['izu-kamo', '賀茂郡', 'nirayama', 138.94, 34.76, 'port'],
  ['musashi-toshima', '豐島郡', 'edo', 139.73, 35.76, 'plain'],
  ['musashi-ebara', '荏原郡', 'edo', 139.7, 35.6, 'port'],
  ['musashi-adachi', '足立郡', 'edo', 139.79, 35.83, 'plain'],
  ['musashi-iruma', '入間郡', 'kawagoe', 139.35, 35.86, 'plain'],
  ['musashi-niiza', '新座郡', 'kawagoe', 139.56, 35.8, 'plain'],
  ['musashi-saitama', '埼玉郡', 'kawagoe', 139.6, 36.14, 'plain'],
  ['musashi-tama-hachioji', '多摩八王子', 'takiyama', 139.28, 35.65, 'mountain'],
  ['musashi-tama-ome', '多摩青梅', 'takiyama', 139.22, 35.79, 'mountain'],
  ['musashi-tama-fuchu', '多摩府中', 'takiyama', 139.48, 35.67, 'plain'],
  ['musashi-hiki', '比企郡', 'matsuyama', 139.36, 36.01, 'plain'],
  ['musashi-obusuma', '男衾郡', 'matsuyama', 139.21, 36.12, 'plain'],
  ['musashi-osato', '大里郡', 'matsuyama', 139.39, 36.15, 'plain'],
  ['kazusa-moda', '望陀郡', 'kururi', 140.02, 35.36, 'plain'],
  ['kazusa-ichihara', '市原郡', 'kururi', 140.13, 35.47, 'plain'],
  ['kazusa-isumi', '夷隅郡', 'kururi', 140.25, 35.25, 'plain'],
  ['kazusa-sue', '周淮郡', 'sanuki', 139.93, 35.32, 'plain'],
  ['kazusa-ama', '天羽郡', 'sanuki', 139.85, 35.19, 'port'],
  ['kazusa-awa', '安房郡', 'sanuki', 139.86, 35.03, 'port'],
  ['hitachi-kuji', '久慈郡', 'ota', 140.44, 36.61, 'mountain'],
  ['hitachi-taga', '多賀郡', 'ota', 140.62, 36.59, 'port'],
  ['hitachi-naka', '那珂郡', 'ota', 140.46, 36.49, 'plain'],
  ['hitachi-ibaraki', '茨城郡', 'nukada', 140.38, 36.33, 'plain'],
  ['hitachi-namegata', '行方郡', 'nukada', 140.48, 36.04, 'plain'],
  ['hitachi-tsukuba', '筑波郡', 'nukada', 140.1, 36.2, 'plain'],
  ['shimotsuke-kawachi', '河內郡', 'utsunomiya', 139.94, 36.63, 'plain'],
  ['shimotsuke-shioya', '鹽谷郡', 'utsunomiya', 139.84, 36.78, 'plain'],
  ['shimotsuke-nasu', '那須郡', 'utsunomiya', 140.0, 36.93, 'mountain'],
  ['shimotsuke-haga', '芳賀郡', 'moka', 140.07, 36.55, 'plain'],
  ['shimotsuke-haga-mashiko', '芳賀益子', 'moka', 140.09, 36.46, 'plain'],
  ['shimotsuke-haga-motegi', '芳賀茂木', 'moka', 140.18, 36.53, 'mountain'],
  ['shimosa-yuki', '結城郡', 'yuki', 139.91, 36.25, 'plain'],
  ['shimosa-sashima', '猿島郡', 'yuki', 139.87, 36.12, 'plain'],
  ['shimosa-toyoda', '豐田郡', 'yuki', 139.99, 36.1, 'plain'],
  ['kozuke-usui', '碓氷郡', 'minowa', 138.79, 36.34, 'mountain'],
  ['kozuke-gunma-misato', '群馬箕鄉', 'minowa', 138.93, 36.36, 'plain'],
  ['kozuke-agatsuma', '吾妻郡', 'minowa', 138.82, 36.56, 'mountain'],
  ['kozuke-gunma', '群馬郡', 'umayabashi', 139.02, 36.48, 'plain'],
  ['kozuke-seta', '勢多郡', 'umayabashi', 139.17, 36.44, 'plain'],
  ['kozuke-tone', '利根郡', 'umayabashi', 139.05, 36.65, 'mountain'],
  ['kai-yamanashi', '山梨郡', 'tsutsujigasaki', 138.68, 35.69, 'plain'],
  ['kai-yatsushiro', '八代郡', 'tsutsujigasaki', 138.65, 35.56, 'plain'],
  ['kai-koma', '巨摩郡', 'tsutsujigasaki', 138.42, 35.62, 'plain'],
  ['kai-tsuru-otsuki', '都留大月', 'iwadono', 138.93, 35.6, 'mountain'],
  ['kai-tsuru-yamura', '都留谷村', 'iwadono', 138.91, 35.55, 'mountain'],
  ['kai-tsuru-uenohara', '都留上野原', 'iwadono', 139.11, 35.63, 'mountain'],
  ['shinano-ina', '伊那郡', 'takato', 137.96, 35.83, 'plain'],
  ['shinano-suwa', '諏訪郡', 'takato', 138.11, 36.04, 'plain'],
  ['shinano-ina-iida', '伊那飯田', 'takato', 137.83, 35.51, 'plain'],
  ['shinano-chikuma', '筑摩郡', 'fukashi', 137.96, 36.14, 'plain'],
  ['shinano-azumi', '安曇郡', 'fukashi', 137.86, 36.32, 'plain'],
  ['shinano-chiisagata', '小縣郡', 'fukashi', 138.25, 36.4, 'plain'],
  ['shinano-hanishina', '埴科郡', 'kaizu', 138.16, 36.48, 'plain'],
  ['shinano-sarashina', '更級郡', 'kaizu', 138.09, 36.55, 'plain'],
  ['shinano-saku', '佐久郡', 'kaizu', 138.47, 36.26, 'mountain'],
  ['echigo-kubiki', '頸城郡', 'kasugayama', 138.34, 37.1, 'plain'],
  ['echigo-kubiki-naoetsu', '頸城直江津', 'kasugayama', 138.24, 37.18, 'port'],
  ['echigo-kubiki-itoigawa', '頸城糸魚川', 'kasugayama', 137.86, 37.04, 'port'],
  ['echigo-koshi', '古志郡', 'tochio', 138.88, 37.44, 'plain'],
  ['echigo-kanbara', '蒲原郡', 'tochio', 139.02, 37.66, 'plain'],
  ['echigo-iwafune', '岩船郡', 'tochio', 139.47, 38.18, 'port'],
  ['echigo-uonuma', '魚沼郡', 'sakado', 138.96, 37.17, 'plain'],
  ['echigo-uonuma-yuzawa', '魚沼湯澤', 'sakado', 138.81, 36.93, 'mountain'],
  ['echigo-uonuma-tsumari', '魚沼妻有', 'sakado', 138.72, 37.13, 'plain'],
  ['shinano-minochi', '水內郡', 'iiyama', 138.34, 36.79, 'plain'],
  ['shinano-takai', '高井郡', 'iiyama', 138.31, 36.66, 'plain'],
  ['shinano-minochi-nozawa', '水內野澤', 'iiyama', 138.44, 36.92, 'mountain'],
];

const provinces = [
  ['hitachi', '常陸', 'kanto'],
  ['shimotsuke', '下野', 'kanto'],
  ['kozuke', '上野', 'kanto'],
  ['shimosa', '下總', 'kanto'],
  ['kazusa', '上總', 'kanto'],
  ['musashi', '武藏', 'kanto'],
  ['sagami', '相模', 'kanto'],
  ['izu', '伊豆', 'kanto'],
  ['kai', '甲斐', 'koshinetsu'],
  ['shinano', '信濃', 'koshinetsu'],
  ['echigo', '越後', 'koshinetsu'],
] as const;
const leaders: Readonly<Record<string, string>> = {
  hojo: 'off.hojo-ujiyasu',
  satomi: 'off.satomi-yoshitaka',
  satake: 'off.satake-yoshiaki',
  utsunomiya: 'off.utsunomiya-hirotsuna',
  yuki: 'off.yuki-harutomo',
  takeda: 'off.takeda-shingen',
  nagao: 'off.nagao-kagetora',
};
const kantoCastles = new Set(CASTLE_SITES.slice(0, 16).map(([key]) => key));
const weight = { plain: 15, mountain: 7, port: 12 } as const;
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** District markers are authored gameplay positions, constrained by 14 §3.4. */
function districtPosition(key: string, castleKey: string, lon: number, lat: number) {
  // The coarse outline puts the radial Naoetsu marker offshore. Its port district
  // uses a landward gameplay marker, not a claim about the harbor's coordinates.
  if (key === 'echigo-kubiki-naoetsu') return { x: 2322, y: 2311 };
  const site = CASTLE_SITES.find(([key]) => key === castleKey);
  if (!site) throw new Error(`Missing district parent castle: ${castleKey}`);
  const origin = lonLatToWorld(site[4], site[5]);
  const representative = lonLatToWorld(lon, lat);
  const dx = representative.x - origin.x;
  const dy = representative.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const fittedDistance = Math.max(41, Math.min(179, distance));
  return {
    x: Math.round(origin.x + (dx * fittedDistance) / distance),
    y: Math.round(origin.y + (dy * fittedDistance) / distance),
  };
}

function makeDistricts(region: 'kanto' | 'koshinetsu', quota: number) {
  const sites = DISTRICT_SITES.filter((site) => kantoCastles.has(site[2]) === (region === 'kanto'));
  const totalWeight = sites.reduce((sum, site) => sum + weight[site[5]], 0);
  const koku = sites.map((site) => roundTo((quota * weight[site[5]]) / totalWeight, 100));
  // Assign rounding residue to the first named district, preserving the exact regional quota.
  koku[0] = (koku[0] ?? 0) + quota - koku.reduce((sum, value) => sum + value, 0);
  return sites.map(([key, name, castle, lon, lat, terrain], index) => {
    const kokudaka = koku[index] ?? 0;
    const population = roundTo(kokudaka * 0.33 * (terrain === 'port' ? 1.12 : 1), 100);
    const commerce = terrain === 'mountain' ? 160 : terrain === 'port' ? 480 : 260;
    return {
      id: `dist.${key}`,
      name,
      castleId: `castle.${castle}`,
      pos: districtPosition(key, castle, lon, lat),
      isPort: terrain === 'port',
      kokudaka,
      kokudakaCap: roundTo(kokudaka * 1.4, 100),
      commerce,
      commerceCap: Math.min(roundTo(commerce * 1.6, 10), 2000),
      population,
      populationCap: roundTo(population * 1.5, 500),
      publicOrder: terrain === 'port' ? 65 : 60,
      stewardId: null,
      developFocus: 'agri' as const,
    };
  });
}

const districts = zDistrictsFile.parse([
  ...makeDistricts('kanto', 2_750_000),
  ...makeDistricts('koshinetsu', 1_550_000),
]);
const castles = zCastlesFile.parse(
  CASTLE_SITES.map(([key, name, province, clan, lon, lat, main, mountain, coastal]) => {
    const population = districts
      .filter((d) => d.castleId === `castle.${key}`)
      .reduce((sum, district) => sum + district.population, 0);
    const max =
      (main ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch) +
      Math.floor(population * BAL.soldiersPerPop);
    const soldiers = Math.floor(max * (clan === 'takeda' || clan === 'nagao' ? 0.65 : 0.55));
    return {
      id: `castle.${key}`,
      name,
      provinceId: `prov.${province}`,
      tier: main ? 'main' : 'branch',
      ownerClanId: `clan.${clan}`,
      lordId: main ? leaders[clan] : null,
      pos: lonLatToWorld(lon, lat),
      coastal,
      terrainKind: mountain ? 'mountain' : 'plain',
      soldiers,
      food: roundTo(soldiers * 2.5, 500),
    };
  }),
);
const provincePayload = zProvincesFile.parse({
  version: 1,
  provinces: provinces.map(([key, name, region]) => {
    const sites = castles.filter((castle) => castle.provinceId === `prov.${key}`);
    return {
      id: `prov.${key}`,
      name,
      region,
      labelPos: {
        x: Math.round(sites.reduce((sum, castle) => sum + castle.pos.x, 0) / sites.length),
        y: Math.round(sites.reduce((sum, castle) => sum + castle.pos.y, 0) / sites.length),
      },
    };
  }),
});

const positions = new Map(
  [...existingDistricts, ...castles, ...districts].map((node) => [node.id, node.pos]),
);
const edges: {
  id: string;
  a: string;
  b: string;
  type: 'land' | 'sea';
  grade: 1 | 2 | 3;
  baseDays: number;
  name: string;
}[] = [];
function road(a: string, b: string, grade: 1 | 2 | 3, name: string, mountain = false, sea = false) {
  const from = positions.get(a);
  const to = positions.get(b);
  if (!from || !to) throw new Error(`Missing staged geography road endpoint: ${a}/${b}`);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  edges.push({
    id: `road.b34-${edges.length + 1}`,
    a,
    b,
    type: sea ? 'sea' : 'land',
    grade,
    baseDays: Math.max(0.5, Math.min(8, roundTo((distance / 90) * (mountain ? 1.5 : 1), 0.5))),
    name,
  });
}
// Every district has an authored local connection to its parent castle.
for (const district of districts) {
  const site = DISTRICT_SITES.find(([key]) => district.id === `dist.${key}`);
  road(district.castleId, district.id, 1, '領內往還', site?.[5] === 'mountain');
}
// Main corridors are gameplay graph links, not historical road polylines.
const corridors: readonly (readonly [string, string, 1 | 2 | 3, string, boolean?])[] = [
  ['edo', 'kawagoe', 2, '鎌倉街道'],
  ['kawagoe', 'matsuyama', 2, '鎌倉街道'],
  ['kawagoe', 'takiyama', 2, '甲州街道'],
  ['odawara', 'nirayama', 2, '箱根道', true],
  ['kururi', 'sanuki', 1, '房總往還'],
  ['edo', 'yuki', 2, '奧州街道'],
  ['yuki', 'utsunomiya', 2, '奧州街道'],
  ['utsunomiya', 'moka', 1, '下野往還'],
  ['moka', 'nukada', 1, '常陸往還'],
  ['nukada', 'ota', 1, '常陸往還'],
  ['matsuyama', 'minowa', 2, '中山道'],
  ['minowa', 'umayabashi', 1, '上野往還'],
  ['tsutsujigasaki', 'iwadono', 2, '甲州街道'],
  ['tsutsujigasaki', 'takato', 1, '杖突峠', true],
  ['takato', 'fukashi', 2, '中山道'],
  ['fukashi', 'kaizu', 2, '信濃往還'],
  ['kaizu', 'iiyama', 1, '川中島'],
  ['iiyama', 'kasugayama', 1, '北國街道', true],
  ['kasugayama', 'tochio', 2, '北陸道'],
  ['tochio', 'sakado', 1, '越後往還'],
];
for (const [a, b, grade, name, mountain] of corridors)
  road(`castle.${a}`, `castle.${b}`, grade, name, mountain);
road('dist.sagami-yurugi', 'dist.sagami-koza', 2, '鎌倉街道');
road('dist.sagami-koza', 'dist.sagami-kamakura', 2, '鎌倉街道');
road('dist.sagami-kamakura', 'dist.musashi-ebara', 2, '鎌倉街道');
road('dist.sagami-miura', 'dist.kazusa-awa', 1, '江戶灣口航路', false, true);
road('dist.izu-tagata', 'dist.suruga-sunto', 2, '箱根道', true);
road('dist.musashi-iruma', 'dist.kai-yamanashi', 2, '甲州街道', true);
road('dist.kozuke-usui', 'dist.shinano-saku', 2, '中山道', true);
road('dist.kozuke-gunma', 'dist.echigo-uonuma', 1, '三國峠', true);
road('dist.mikawa-kamo', 'dist.shinano-ina', 1, '三州街道', true);
road('dist.mino-kamo', 'dist.shinano-chikuma', 1, '中山道木曾路', true);
road('dist.suruga-fuji', 'dist.kai-yatsushiro', 1, '中道', true);

/** Plain mergeable payload; roster/whole-world validation is deliberately a separate gate. */
export const KANTO_KOSHINETSU_GEOGRAPHY = {
  provinces: provincePayload.provinces,
  castles,
  districts,
  roads: zRoadsFile.parse({ version: 1, edges }).edges,
};

/** Future seams are not dangling edges in the staged graph. */
export const FUTURE_GEOGRAPHY_SEAMS = [
  { a: 'dist.shimotsuke-kawachi', b: 'dist.iwashiro-shirakawa', grade: 2, name: '奧州街道' },
  { a: 'dist.echigo-iwafune', b: 'dist.uzen-okitama', grade: 1, name: '米澤街道' },
] as const;
