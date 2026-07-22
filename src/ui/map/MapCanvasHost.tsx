// React 掛載點：建立／銷毀 `MapRenderer`（imperative Pixi 渲染器）。
//
// 規格：plan/01-architecture.md §3.6.2（掛載範式與 destroy 冪等／StrictMode 雙掛載防護）、§3.6.1
// （滿版單一 canvas；HTML overlay 疊於其上）、A10（M2-13 驗收：StrictMode 掛載→卸載→再掛載無
// WebGL context 洩漏、resize/DPR 正確）。畫面佈局（overlay pointer-events）詳見 plan/11。
//
// 掛載一次（`useEffect` 空依賴，01 §3.6.2）：`onMapEvent` 以 ref 保存最新值，避免父層每次 render
// 傳入新 inline function 造成渲染器反覆重建（同時滿足 react-hooks/exhaustive-deps）。
//
// `staticData`／`viewState`／`focusNodeId`（M2-19 新增，18-roadmap「MainScreen 掛 MapCanvasHost
// 顯示地圖」接線）：以獨立 `useEffect` 觀察其變化，經 `rendererRef` 呼叫既有的 `MapRenderer.
// setMapData`／`updateView`；`focusNodeId` 只在掛載完成後套用一次（`MapRenderer.focusNode` 經
// `camera.focusOn` 補間聚焦，鏡頭已於 M2-15 接入 `MapRenderer`）。
//
// M6-V2 新增：init 完成後（且未在等待期間被卸載）向 `debugMapBridge` 登記目前渲染器實例、
// unmount 時取消登記，供 `window.__TENKA_DEBUG__.setMapCameraPreset`／`waitMapIdle`（src/app/
// debug.ts）取得活躍渲染器以驅動決定論截圖（17 §3.9.3）。

import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactElement } from 'react';
import { MapRenderer } from './MapRenderer';
import { registerDebugMapRenderer, unregisterDebugMapRenderer } from './debugMapBridge';
import type {
  MapEventHandler,
  MapInteractionMode,
  MapPathPreview,
  MapStaticData,
  MapViewState,
} from './mapViewTypes';

/** M6-V9 §4.4：對外命令式握把（MainScreen 端 ref 取名 `mapHandleRef`，與內部 `hostRef` 區隔）。 */
export interface MapHandle {
  /** 鏡頭補間至世界座標（MiniMap `onNavigate` 接線；`MapRenderer.panToWorld`）。 */
  panToWorld(x: number, y: number): void;
}

export interface MapCanvasHostProps {
  /** 渲染器對外事件的接收者（React 收到後轉 Command 丟入佇列，01 §3.6.1／§3.12.2）。 */
  onMapEvent: MapEventHandler;
  /** 靜態地圖資料（省略／`null`＝尚未載入）；變更時重繪 roads/nodeMarkers（`MapRenderer.setMapData`）。 */
  staticData?: MapStaticData | null | undefined;
  /** 每 tick 動態視圖（省略＝渲染器維持內建的無主全圖預設）。 */
  viewState?: MapViewState | undefined;
  /** 掛載完成後鏡頭瞬移聚焦的節點 id（僅套用一次；供「開局聚焦玩家居城」用）。 */
  focusNodeId?: string | undefined;
  /** 行軍目標選取時的 authoritative path result；null 清除 selectionAndPath 層。 */
  pathPreview?: MapPathPreview | null | undefined;
  interactionMode?: MapInteractionMode | undefined;
  /** 出陣目標城 id（M6-V9b §3.4）：該城名牌金框高亮＋declutter 破例；null 清除。 */
  marchTargetId?: string | null | undefined;
}

export const MapCanvasHost = forwardRef<MapHandle, MapCanvasHostProps>(function MapCanvasHost(
  {
    onMapEvent,
    staticData,
    viewState,
    focusNodeId,
    pathPreview,
    interactionMode = 'idle',
    marchTargetId = null,
  }: MapCanvasHostProps,
  ref,
): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const onMapEventRef = useRef(onMapEvent);
  onMapEventRef.current = onMapEvent;
  const rendererRef = useRef<MapRenderer | null>(null);

  // M6-V9 §4.4：只暴露 panToWorld（補間導航）；renderer 尚未 init 完成時為安全 no-op。
  useImperativeHandle(
    ref,
    () => ({
      panToWorld(x: number, y: number): void {
        rendererRef.current?.panToWorld(x, y);
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;
    const renderer = new MapRenderer();
    rendererRef.current = renderer;
    const handler: MapEventHandler = (event) => onMapEventRef.current(event);
    // init 完成前若已卸載（StrictMode／快速切畫面）則立即銷毀，防 WebGL context 洩漏（01 §3.6.2）。
    void renderer.init(host, handler).then(() => {
      if (disposed) {
        renderer.destroy();
        return;
      }
      if (focusNodeId !== undefined) renderer.focusNode(focusNodeId);
      // M6-V2：登記為目前活躍渲染器，供 window.__TENKA_DEBUG__ 的地圖鏡頭 preset／idle 等待使用
      // （src/app/debug.ts；src/ui/map/debugMapBridge.ts）。
      registerDebugMapRenderer(renderer);
    });
    return () => {
      disposed = true;
      unregisterDebugMapRenderer(renderer);
      renderer.destroy(); // 冪等
      rendererRef.current = null;
    };
    // focusNodeId 僅供掛載當下的初始聚焦（見上方檔頭），刻意不列入依賴陣列。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.setMapData(staticData ?? null);
  }, [staticData]);

  useEffect(() => {
    if (viewState !== undefined) rendererRef.current?.updateView(viewState);
  }, [viewState]);

  useEffect(() => {
    rendererRef.current?.showPathPreview(pathPreview ?? null);
  }, [pathPreview]);

  useEffect(() => {
    rendererRef.current?.setMode(interactionMode);
  }, [interactionMode]);

  useEffect(() => {
    rendererRef.current?.setMarchTarget(marchTargetId);
  }, [marchTargetId]);

  return (
    <div
      ref={hostRef}
      data-testid="map-canvas-host"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-map)' }}
    />
  );
});
