// `?debug=visual-map` 啟動邏輯（M6-V2；17 §3.9.3）：載入固定 `buildVisualMapState()` fixture，
// 並佈置一次性場景 UI 態——選取一支行軍中的我方部隊、顯示其路徑預覽，讓地圖畫面「開場即有內容」
// 供 e2e 截圖 harness 使用（見 plan/18-roadmap.md M6-V2 任務說明第 6 點）。
//
// 決定論：全程只呼叫 core 的純函式（`buildVisualMapState`／`selectMapStaticModel`／`computePath`），
// 不讀 `Math.random`／`Date.now`；刻意不經 `src/app/newGame.ts`（其 `startNewDemoGame` 於未給
// `?seed=` 時呼叫 `Math.random` 挑種子，M6-V2 路徑必須完全略過該檔，見任務說明第 7 點）。
//
// 路徑預覽沿用既有 `MarchDraft.previewPath` 機制（`MainScreen.tsx` 已將其原樣轉給
// `MapCanvasHost.pathPreview`）而非另闢新 API：只設定 `marchDraft`、不 `enqueueModal('march')`，
// 故 `MarchModal` 不會彈出、`interactionMode` 維持 'idle'（`MainScreen` 之
// `marchDraft?.phase === 'pickTarget'` 判斷為 false）——純粹讓路徑線出現在地圖上。

import { buildVisualMapState } from '@core/debugVisual';
import { selectMapStaticModel } from '@core/state/selectors';
import { computePath } from '@core/index';
import type { GameState } from '@core/state/gameState';
import type { ArmyId } from '@core/state/ids';
import type { MapPathPreview } from '@ui/map/mapViewTypes';
import { uiStore } from '@ui/hooks/uiStore';

/** 挑一支「本方（玩家勢力）行軍中」的部隊做為路徑預覽展示對象；fixture 保證恰有一支符合（`丹羽長秀`）。 */
function findMarchingPlayerArmy(
  state: GameState,
): { id: ArmyId; originNodeId: string; targetNodeId: string } | null {
  const candidate = Object.values(state.armies).find(
    (army) => army.clanId === state.meta.playerClanId && army.status === 'marching',
  );
  if (candidate === undefined || candidate.targetNodeId === null) return null;
  const originNodeId = candidate.path[0] ?? candidate.originCastleId;
  return { id: candidate.id, originNodeId, targetNodeId: candidate.targetNodeId };
}

/** 佈置一次性場景 UI 態（選取＋路徑預覽）；找不到符合條件的部隊時安靜略過（不影響 fixture 本體）。 */
function applyVisualMapSceneState(state: GameState): void {
  const marching = findMarchingPlayerArmy(state);
  if (marching === null) return;

  const { graph } = selectMapStaticModel(state);
  const result = computePath(state, graph, {
    clanId: state.meta.playerClanId,
    from: marching.originNodeId as never,
    to: marching.targetNodeId as never,
    speedFactor: 1,
  });
  const previewPath: MapPathPreview | null = !result.found
    ? null
    : {
        result,
        originNodeId: marching.originNodeId as never,
        targetNodeId: marching.targetNodeId as never,
        unreachable: false,
        hostileNodeIds: [],
      };

  uiStore.getState().actions.setSelection({ kind: 'army', id: marching.id });
  uiStore.getState().actions.setMarchDraft({
    originCastleId: marching.originNodeId,
    leaderOfficerId: null,
    subOfficerIds: [],
    soldiers: 0,
    food: 0,
    targetNodeId: marching.targetNodeId,
    previewPath,
    previewDays: result.found ? result.totalDays : null,
    phase: 'compose',
    errorKey: null,
  });
}

/** 建立 M6-V2 固定視覺 fixture 並佈置場景 UI 態；供 `App.tsx` 於 `?debug=visual-map` 時呼叫。 */
export function bootVisualMapGame(): GameState {
  const state = buildVisualMapState();
  applyVisualMapSceneState(state);
  return state;
}
