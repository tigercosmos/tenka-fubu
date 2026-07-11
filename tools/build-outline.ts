// 日本海岸線背景 japan-outline.json 一次性製作腳本（方案 A：Natural Earth 公有領域資料簡化，
// 04 §3.3.2）。規格：plan/04-map-and-movement.md §3.3.1（輸出格式）、§3.3.2（方案 A 三步驟）、
// §3.3.4（自動檢查標準：範圍/閉合/點數，實作於 src/data/map/outlineGeometry.ts）；
// T2（04-T2 驗收）。18-roadmap.md M2-5 實作。
//
// 這是一次性腳本（tsx 執行後即可丟棄執行環境，非 CI 常駐流程）；重跑時機：更換簡化程度、
// 改用其他年份的 Natural Earth 資料、或發現海岸線需要調整時。完整重製步驟：
//
//   1. 下載 Natural Earth 1:50m land（公有領域）：
//        curl -o ne_50m_land.geojson \
//          https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
//   2. 以 mapshaper CLI 裁切、去小島、簡化（04 §3.3.2 步驟 2）。本州／四國＋九州分別取不同簡化
//      百分比重跑：本州點數基期大、需壓到 60~300 點區間；四國最小，需要較高保留率才能達到
//      單島下限 60 點，若和本州用同一百分比會顧此失彼（本州超過 300 點上限、或四國低於 60 點
//      下限），因此分兩趟裁切+簡化，各自取落在 60~300 點區間的百分比：
//        npx mapshaper ne_50m_land.geojson -clip bbox=128.5,30.5,146.0,45.8 \
//          -filter-islands min-area=2500km2 -simplify visvalingam 70% keep-shapes \
//          -o format=geojson precision=0.01 japan-raw-70.geojson   # 取本州 ring（約 266 點）
//        npx mapshaper ne_50m_land.geojson -clip bbox=128.5,30.5,146.0,45.8 \
//          -filter-islands min-area=2500km2 -simplify visvalingam 90% keep-shapes \
//          -o format=geojson precision=0.01 japan-raw-90.geojson   # 取四國／九州 ring（約 74／133 點）
//      兩趟輸出以本州（面積最大）、四國／九州（面積次之／第三，依 04 §3.3.2 步驟 3「依面積比對
//      命名」規則辨識）三個 exterior ring 手動併入單一 FeatureCollection，捨棄北海道、清切
//      bbox 邊界產生的中國大陸／朝鮮半島碎片（此二者不在 04 §3.3.1 必備／可選島嶼清單內）。
//   3. 本腳本讀取上一步驟產出的 `tools/assets/outline/japan-raw.geojson`（即上述已手動併入、
//      只保留三主島 exterior ring 的精簡版，取代直接內嵌 1.6MB 原始 ne_50m_land.geojson，
//      使本檔輸入可重現且體積可控）：對每個頂點呼叫 `lonLatToWorld` 投影、去除投影後距離
//      < 6 world unit 的相鄰重複點、統一為逆時針纏繞，輸出 `src/data/map/japan-outline.json`。

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lonLatToWorld, type WorldPos } from '../src/data/map/projection';
import { isCounterClockwise, signedArea, totalPointCount } from '../src/data/map/outlineGeometry';
import { zJapanOutlineFile, type OutlinePolygon } from '../src/data/schemas/outline';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const RAW_GEOJSON_PATH = path.join(REPO_ROOT, 'tools/assets/outline/japan-raw.geojson');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src/data/map/japan-outline.json');

/** 相鄰點去重複的世界座標距離門檻（04 §3.3.2 步驟 3）。 */
const DEDUP_DISTANCE_WORLD_UNITS = 6;

interface RawGeoJsonFeature {
  properties: { name: string };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}
interface RawGeoJson {
  type: 'FeatureCollection';
  features: RawGeoJsonFeature[];
}

function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 去除相鄰（含首尾相接，環狀）距離 < 門檻的重複點；保留至少 3 點。 */
function dedupAdjacent(points: readonly WorldPos[], thresholdWorldUnits: number): WorldPos[] {
  const out: WorldPos[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (prev === undefined || distance(prev, p) >= thresholdWorldUnits) {
      out.push(p);
    }
  }
  while (out.length > 3) {
    const last = out[out.length - 1];
    const first = out[0];
    if (last === undefined || first === undefined) break; // 不可能發生：長度已檢查 > 3
    if (distance(last, first) >= thresholdWorldUnits) break;
    out.pop();
  }
  return out;
}

function flattenPoints(points: readonly WorldPos[]): number[] {
  const flat: number[] = [];
  for (const p of points) flat.push(p.x, p.y);
  return flat;
}

/** 統一為逆時針纏繞（land 在左側；04 §3.3.1）；已滿足則原樣回傳。 */
function ensureCounterClockwise(flatPoints: number[]): number[] {
  if (isCounterClockwise(flatPoints)) return flatPoints;
  const points: number[] = [];
  for (let i = flatPoints.length - 2; i >= 0; i -= 2) {
    const x = flatPoints[i];
    const y = flatPoints[i + 1];
    if (x === undefined || y === undefined) continue; // 不可能發生：偶數長度已由呼叫端保證
    points.push(x, y);
  }
  return points;
}

function buildPolygon(feature: RawGeoJsonFeature): OutlinePolygon {
  const ring = feature.geometry.coordinates[0];
  if (ring === undefined) {
    throw new Error(`build-outline: 島嶼 ${feature.properties.name} 缺少 exterior ring`);
  }
  // GeoJSON 環狀首尾座標重複；投影前先去掉收尾重複點（04 §3.3.1「首尾不重複」）。
  const openRing = ring.slice(0, ring.length - 1);
  const projected = openRing.map(([lon, lat]) => lonLatToWorld(lon, lat));
  const deduped = dedupAdjacent(projected, DEDUP_DISTANCE_WORLD_UNITS);
  const wound = ensureCounterClockwise(flattenPoints(deduped));
  return { id: feature.properties.name, points: wound };
}

function main(): void {
  const raw = JSON.parse(readFileSync(RAW_GEOJSON_PATH, 'utf8')) as RawGeoJson;
  // 依面積（世界座標，投影後）由大到小排序＋命名（04 §3.3.2 步驟 3：
  // 最大＝honshu、其餘依面積次序＝kyushu／shikoku——與本檔輸入 `japan-raw.geojson` 內
  // properties.name 標記一致，此處以面積重新核對僅作為完整性檢查，不信任輸入順序）。
  const polygons = raw.features
    .map(buildPolygon)
    .map((polygon) => ({ polygon, area: Math.abs(signedArea(polygon.points)) }))
    .sort((a, b) => b.area - a.area)
    .map(({ polygon }) => polygon);

  const file = { version: 1 as const, source: 'natural-earth' as const, polygons };
  const parsed = zJapanOutlineFile.safeParse(file);
  if (!parsed.success) {
    console.error('產出檔案未通過 zJapanOutlineFile schema 驗證：', parsed.error.format());
    process.exit(1);
  }

  const total = totalPointCount(polygons);
  const perIsland = polygons.map((p) => `${p.id}=${p.points.length / 2}點`).join('、');
  console.log(`japan-outline.json 產出：${perIsland}；總點數 ${total}（規格 300~600）。`);
  if (total < 300 || total > 600) {
    console.error(
      '總點數超出 04 §3.3.1 規定之 300~600 區間，請調整 tools/assets/outline/japan-raw.geojson' +
        '的 mapshaper 簡化百分比後重新產生輸入。',
    );
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(file, null, 2) + '\n');
  console.log(`已寫入 ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
}

if (isDirectRun()) {
  main();
}
