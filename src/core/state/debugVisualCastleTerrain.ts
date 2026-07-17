// visual fixture（scenarioId='debug-visual-map-01'）之城型顯示資料。純資料葉模組（僅供
// selectMapViewModel 之 castleTerrainLookup 分派；比照 debugVisualRoadDisplay.ts，只 import 型別、
// 不 import 任何 core 系統／debugVisual.ts，避免 production selector 因分派 fixture 而拉進整個
// debug fixture 建構器，造成耦合／bundle 汙染，設計 §3.7／CD3）。
//
// castle.gifu = s1560「稻葉山城」之化名（見 debugVisual.ts 檔頭）：史實山城 → mountain，
// 於 fixture 三段 baseline 展示平城／山城剪影對比。其餘 fixture 城（清洲／鳴海／駿府／掛川）
// 皆平地城 → 未列於本表，selectMapViewModel 以 `?? 'plain'` 補為平城。

/** visual fixture 之城型顯示查表（依 castle id）。純顯示，永不進 GameState／golden。 */
export const DEBUG_VISUAL_CASTLE_TERRAIN: Readonly<Record<string, 'plain' | 'mountain'>> = {
  'castle.gifu': 'mountain',
};
