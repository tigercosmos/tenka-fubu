// React 掛載點：建立／銷毀 `MapRenderer`（imperative Pixi 渲染器）。
//
// 規格：plan/01-architecture.md §3.6.2（掛載範式與 destroy 冪等／StrictMode 雙掛載防護）、§3.6.1
// （滿版單一 canvas；HTML overlay 疊於其上）、A10（M2-13 驗收：StrictMode 掛載→卸載→再掛載無
// WebGL context 洩漏、resize/DPR 正確）。畫面佈局（overlay pointer-events）詳見 plan/11。
//
// 掛載一次（`useEffect` 空依賴，01 §3.6.2）：`onMapEvent` 以 ref 保存最新值，避免父層每次 render
// 傳入新 inline function 造成渲染器反覆重建（同時滿足 react-hooks/exhaustive-deps）。

import { useEffect, useRef, type ReactElement } from 'react';
import { MapRenderer } from './MapRenderer';
import type { MapEventHandler } from './mapViewTypes';

export interface MapCanvasHostProps {
  /** 渲染器對外事件的接收者（React 收到後轉 Command 丟入佇列，01 §3.6.1／§3.12.2）。 */
  onMapEvent: MapEventHandler;
}

export function MapCanvasHost({ onMapEvent }: MapCanvasHostProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const onMapEventRef = useRef(onMapEvent);
  onMapEventRef.current = onMapEvent;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;
    const renderer = new MapRenderer();
    const handler: MapEventHandler = (event) => onMapEventRef.current(event);
    // init 完成前若已卸載（StrictMode／快速切畫面）則立即銷毀，防 WebGL context 洩漏（01 §3.6.2）。
    void renderer.init(host, handler).then(() => {
      if (disposed) renderer.destroy();
    });
    return () => {
      disposed = true;
      renderer.destroy(); // 冪等
    };
  }, []);

  return (
    <div
      ref={hostRef}
      data-testid="map-canvas-host"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-map)' }}
    />
  );
}
