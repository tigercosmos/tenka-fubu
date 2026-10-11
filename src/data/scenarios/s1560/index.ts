// s1560「桶狹間前夜」劇本動態載入殼（M2-8 骨架 → M2-19 接上實資料）。
//
// 規格：plan/01-architecture.md §3.9.3（劇本資料不進主 bundle：`boot.ts` 以
// `await import('@data/scenarios/s1560/index.ts')` 動態載入，Vite 自動 code-split）；
// plan/14-scenario-data.md §3.1（`index.ts` 彙整匯出全部子檔為單一 `ScenarioBundleData` 形狀）、
// §7-T7（`index.ts` 彙整＋動態載入接線）；plan/18-roadmap.md M2-9（B1 東海）／M2-10（B2 近畿）／
// M2-19（本檔自殼轉實作，接上新遊戲流程）。
//
// 【M8 型錄】政策 manifest 收錄 05 §3.7.2 的 12 項政策；效果仍由 core 定義。
// 各資料檔以共用 schema 解析，再以 zScenario 驗證完整彙整契約。
// events.json 由 loadS1560EventCatalog 解析為 canonical 定義；舊資料束的 events 不承載該格式。
//
// 官員按勢力本城地方分檔；B3 關東與 B4 甲信越共同載入，保留長尾跨地方領地。
// 北陸包含本願寺加賀領；加賀坊官仍按本城地方留在近畿檔。
// 中國包含山名因幡領；山名武將仍按本城地方留在近畿檔。
// 四國包含三好阿波與讚岐領；三好武將仍按本城地方留在近畿檔。
// 九州接入關門與豐後水道航路；東北接入日本海航路，九地方資料已載入。
//
// 【`S1560_SCENARIO_ID`／`S1560_LOADED_REGIONS` 定義於 `./meta.ts`，本檔轉出】見該檔檔頭：
// `src/app/boot.ts` 需要這兩個常數在模組載入當下即可用，若直接對本檔（同時含 JSON 靜態 import）
// 做「靜態 import 常數＋動態 import 載入函式」的混寫，Rollup 會放棄 code-split，劇本 JSON 因而
// 混入主 bundle（實測 grep 主 chunk 可見「織田信長」等資料字串），違反 01 §3.9.3／14 §7-T7 驗收。

import provincesJson from './provinces.json';
import castlesJson from './castles.json';
import districtsJson from './districts.json';
import roadsJson from './roads.json';
import clansJson from './clans.json';
import personasJson from './personas.json';
import traitsJson from './traits.json';
import tacticsJson from './tactics.json';
import policiesJson from './policies.json';
import eventsJson from './events.json';
import tokaiOfficersJson from './officers/tokai.json';
import kinkiOfficersJson from './officers/kinki.json';
import kantoOfficersJson from './officers/kanto.json';
import koshinetsuOfficersJson from './officers/koshinetsu.json';
import hokurikuOfficersJson from './officers/hokuriku.json';
import chugokuOfficersJson from './officers/chugoku.json';
import shikokuOfficersJson from './officers/shikoku.json';
import kyushuOfficersJson from './officers/kyushu.json';
import tohokuOfficersJson from './officers/tohoku.json';

import {
  zProvincesFile,
  zCastlesFile,
  zDistrictsFile,
  zRoadsFile,
  zClansFile,
  zPersonasFile,
  zTraitsFile,
  zTacticsFile,
  zOfficersFile,
  zPoliciesFile,
  zScenario,
} from '../../schemas';
import type { ScenarioBundleData } from '../../schemas';
import { zCanonicalEventsFile } from '../../schemas/eventDefinitions';
import type { EventDef } from '../../../core/systems/events/types';
import { REGION_VALUES } from '../../../core/state/enums';
import { S1560_SCENARIO_ID, S1560_LOADED_REGIONS } from './meta';

export { S1560_SCENARIO_ID, S1560_LOADED_REGIONS };

export function loadS1560EventCatalog(): readonly EventDef[] {
  return zCanonicalEventsFile.parse(eventsJson).events;
}

/** 九地方索引；各地方資料解析為獨立物件。 */
function buildOfficersByRegion(): ScenarioBundleData['officers'] {
  const tokaiOfficers = zOfficersFile.parse(tokaiOfficersJson).officers;
  const kinkiOfficers = zOfficersFile.parse(kinkiOfficersJson).officers;
  const kantoOfficers = zOfficersFile.parse(kantoOfficersJson).officers;
  const koshinetsuOfficers = zOfficersFile.parse(koshinetsuOfficersJson).officers;
  const hokurikuOfficers = zOfficersFile.parse(hokurikuOfficersJson).officers;
  const chugokuOfficers = zOfficersFile.parse(chugokuOfficersJson).officers;
  const shikokuOfficers = zOfficersFile.parse(shikokuOfficersJson).officers;
  const kyushuOfficers = zOfficersFile.parse(kyushuOfficersJson).officers;
  const tohokuOfficers = zOfficersFile.parse(tohokuOfficersJson).officers;

  return REGION_VALUES.map((region) => {
    if (region === 'tokai') return tokaiOfficers;
    if (region === 'kinki') return kinkiOfficers;
    if (region === 'kanto') return kantoOfficers;
    if (region === 'koshinetsu') return koshinetsuOfficers;
    if (region === 'hokuriku') return hokurikuOfficers;
    if (region === 'chugoku') return chugokuOfficers;
    if (region === 'shikoku') return shikokuOfficers;
    if (region === 'kyushu') return kyushuOfficers;
    if (region === 'tohoku') return tohokuOfficers;
    return [];
  });
}

/**
 * 動態載入 s1560 劇本資料束（01 §3.9.3）；`await import('@data/scenarios/s1560/index.ts')`
 * 觸發本模組（含其內部靜態 import 之全部 JSON）整體載入，達成主 bundle 不含劇本資料之目標。
 *
 * 個別資料檔與彙整契約共用 schema；解析失敗拋出 ZodError，不吞下資料錯誤。
 * canonical 事件由獨立型錄載入；舊資料束的 events 保持空陣列。
 */
export function loadS1560Scenario(): Promise<ScenarioBundleData> {
  const clansFile = zClansFile.parse(clansJson);

  const bundle: ScenarioBundleData = {
    id: S1560_SCENARIO_ID,
    provinces: zProvincesFile.parse(provincesJson).provinces,
    castles: zCastlesFile.parse(castlesJson),
    districts: zDistrictsFile.parse(districtsJson),
    roads: zRoadsFile.parse(roadsJson).edges,
    clans: clansFile.clans,
    diplomacy: clansFile.diplomacy,
    events: [],
    officers: buildOfficersByRegion(),
    catalogs: {
      traits: zTraitsFile.parse(traitsJson).traits,
      policies: zPoliciesFile.parse(policiesJson).policies,
      tactics: zTacticsFile.parse(tacticsJson).tactics,
      personas: zPersonasFile.parse(personasJson).personas,
    },
  };
  return Promise.resolve(zScenario.parse(bundle));
}
