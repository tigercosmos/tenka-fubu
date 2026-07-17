// UI 邊界：把 core `MapViewModel`（純視圖，無 UI 概念）與目前選取狀態併成 `MapRenderer` 消費之
// `MapViewState`（M6-V4 決策 D7：core selector 不吃 UI 選取型別，避免 core import UI）。
//
// 規格：M6-V4 技術設計 §4.2（composeMapViewState）／§4.1（Layer 1／Layer 2 兩層參考穩定化）；
// mapViewTypes.ts 檔頭（`MapViewState.selection` 收斂為 `'node' | 'army'`）。
//
// 純函式：同一 (model, selection, playerClanId) 輸入必然產生「結構相等」的新物件（不做參考快取，
// 快取交給呼叫端 `useMemo`，見 MainScreen.tsx）。armies[].selected／selection 為 V4「攜帶不消費」
// 欄位（存不畫，選取環留待 V9），此處僅負責正確組裝、不負責渲染。

import type { MapViewModel } from '@core/state/selectors';
import type { MapArmyView, MapViewState } from './mapViewTypes';

/**
 * 呼叫端目前的選取型別（`src/ui/hooks/uiStore.ts` 之 `Selection`）之最小子集。
 * uiStore 區分 `'castle'|'district'|'army'`（面板開啟等 UI 邏輯需要）；地圖 view-model 只需
 * 「節點層級 vs 部隊」的粗粒度區分（04 §4.6 `MapViewState.selection` 為 `'node'|'army'`），
 * 城／郡在地圖上同屬節點，故此處將 `'castle'`／`'district'` 一併對映為 `'node'`。
 */
export interface ComposeSelection {
  readonly kind: 'castle' | 'district' | 'army';
  readonly id: string;
}

/**
 * 組裝 `MapViewState`（唯一橋接點，D7）。`playerClanId` 為擴充欄位，renderer 目前不消費，
 * 省略時維持 `MapViewState.playerClanId` 為 `undefined`（`exactOptionalPropertyTypes` 友善）。
 */
export function composeMapViewState(
  model: MapViewModel,
  selection: ComposeSelection | null,
  playerClanId?: string,
): MapViewState {
  const armies: MapArmyView[] = model.armies.map((army) => ({
    ...army,
    selected: selection !== null && selection.kind === 'army' && selection.id === army.id,
  }));
  const mappedSelection: MapViewState['selection'] =
    selection === null
      ? null
      : { kind: selection.kind === 'army' ? 'army' : 'node', id: selection.id };

  return {
    day: model.day,
    districtOwner: model.districtOwner,
    castles: model.castles,
    districts: model.districts, // M6-V7 AD1：郡次級狀態 pass-through（DistrictNode 知行/制壓/一揆）
    armies,
    sieges: model.sieges,
    battles: model.battles,
    selection: mappedSelection,
    analysisMode: model.analysisMode,
    ...(playerClanId !== undefined ? { playerClanId } : {}),
  };
}
