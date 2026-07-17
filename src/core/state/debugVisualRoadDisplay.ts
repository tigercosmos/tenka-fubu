// visual fixture（scenarioId='debug-visual-map-01'）之道路顯示資料（name/waypoints/bridges，世界座標）。
// 規格：plan/18-roadmap.md M6-V6；設計文件 §4.2／§6.1（DoD 三段 baseline 之來源）。
//
// 純資料葉模組：**只 import 型別**，不 import 任何 core 系統／`debugVisual.ts`（避免 production
// selector 之 `roadDisplayLookup` 因分派 fixture 而拉進整個 debug fixture 建構器，造成耦合／bundle
// 汙染，設計 §4.2／V6D9）。fixture road id 與 s1560 零重疊；座標皆對 `japan-outline.json`（陸/海）
// 與 `terrain.json`（山系 mass）以 point-in-polygon 驗證（見 `debugVisualRoadDisplay.spec.ts`）。
//
// 幾何原則（設計 §6.1）：
//   - 陸路 waypoints 內部點皆落陸且不落任何 mountain mass；僅「合成端點之短逼近段」豁免
//     （`road.narumi-sunpu` 末 waypoint→sunpu 進 mt.akaishi、`road.kakegawa-gifu` 末段陸線接 gifu）。
//   - `road.kakegawa-gifu` 為海路：中段 waypoints 落海（point-in-polygon 為 false），
//     示範海路長節線＋波節線型；此為 **demo-only 例外**——端點為城、gifu 非真沿海港郡，
//     係承襲既有 fixture（`debugVisual.ts`）僅供海路線型展示，不代表真實地理、不擴散至 s1560。
//   - 唯 `road.narumi-sunpu` 帶 `name`（'東海道'，須 ∈ s1560 roads.json name 集以確保 font-subset 涵蓋），
//     避免相鄰多邊皆同名之重複標籤（設計 x1-MINOR4）。

/** visual fixture 之道路顯示欄位查表（依 edge id）。純顯示，永不進 `GameState`／golden。 */
export const DEBUG_VISUAL_ROAD_DISPLAY: Readonly<
  Record<string, { name?: string; waypoints?: readonly number[]; bridges?: readonly number[] }>
> = {
  // 東海道主幹道（grade3）：narumi(1995,2865) → 沿南海岸東行避 mt.akaishi.mass（x2209..2324,y2695..2930），
  // 內部 waypoints 壓 y>2900 走山南麓外側；末段（末 waypoint→sunpu(2312,2897)）逼近段進 mass、豁免。
  // 橋樑跨 rv.tenryu(x~2205) 與 rv.oi(x~2274)（皆為多段線上實際河流交點）。
  'road.narumi-sunpu': {
    name: '東海道',
    waypoints: [2080, 2905, 2170, 2938, 2240, 2946, 2278, 2957],
    bridges: [2205, 2942, 2274, 2956],
  },
  // 尾張幹道微彎（無 name，避三重「東海道」標籤）：kiyosu(1966,2838) → narumi(1995,2865)。
  'road.kiyosu-narumi': { waypoints: [1985, 2848] },
  // sunpu(2312,2897) → kakegawa(2226,2953)（無 name）；跨 rv.oi 下游（多段線實際交點 ~2273,2952）。
  'road.sunpu-kakegawa': { waypoints: [2270, 2955], bridges: [2273, 2952] },
  // 海路（type='sea'，core 固定不可改；無 name）：kakegawa(2226,2953) 南入遠州／伊勢灣水域，
  // 沿灣西北上（中段 waypoints 落海），末段短陸線接合成內陸港 gifu(1938,2774)；
  // 路徑西行不觸 mt.ibuki(x1817..1908)／mt.suzuka(x1821..1890)：末段 x~1940 落其東側。
  'road.kakegawa-gifu': {
    waypoints: [2200, 2988, 2020, 2984, 1948, 2942, 1942, 2900],
  },
};
