// MiniMap —— 小地圖（canvas 縮圖＋視窗框；規格：plan/12-ui-components.md §3.2.12／§4／§5.5，
// plan/04-map-and-movement.md §3.13.1；18-roadmap.md M2-18（04-T13、12-T9））。
//
// E-69（19-glossary.md §3.13；11 D13）定案：迷你地圖統一為正方（世界座標 4096² 正方、均勻縮放），
// 尺寸預設 `UI.minimapSizePx`＝224。
//
// 兩層 `<canvas>`（§3.2.12）：
// - 底圖層：日本輪廓＋城點＋部隊點；依 `model.version` 變更且距上次重繪 ≥ `UI.minimapRedrawMs`
//   節流重繪（§5.5）。
// - 視窗框層：主鏡頭可視範圍矩形（金 1.5px）；`viewport` prop 變動即清框重畫（成本可忽略）。
//
// 互動（§5.5）：mousedown／drag 皆呼叫 `onNavigate(worldX, worldY)`（mini→world 換算）；
// 主鏡頭實際移動（`camera.focusOn`）與補間動畫由呼叫端負責——鏡頭狀態刻意不進本元件
// （01 §8-D5：鏡頭狀態放 renderer/camera 內部，不進 store），本元件與鏡頭解耦、僅提供
// 世界座標導航意圖，供尚待落地之地圖畫面整合層接上 `camera.focusOn({x, y})`。
//
// 資料來源：`selectMiniMapModel`（core selector，不直接讀 Pixi，§3.2.12「不直接讀 Pixi」）。
// 經 `makeCachedSelector`／`useCachedGameSelector`（01 §5.3）以 `tickSeq` 為版本快取包裝——
// `selectMiniMapModel` 每次呼叫皆重建 `castles`/`armies` 陣列（供 §5.5 `version` 比對用途），
// 若不快取，`useGameSelector` 底層 `useShallow` 的淺比較會在同一 tickSeq 內視每次呼叫為
// 「輸出已變」（陣列參考不同），導致 `useSyncExternalStore` 判定快照持續變動而觸發無限重渲染
// （React「Maximum update depth exceeded」）；快取確保同一 tickSeq 內重複呼叫回傳同一參考。
//
// 勢力圖模式（04 §3.13.2）：「迷你地圖不受此模式影響（本來就是勢力概覽）」——本元件刻意不消費
// 該模式旗標。

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { selectMiniMapModel } from '@core/state/selectors';
import { t } from '@i18n/zh-TW';
import { TOKENS } from '@ui/styles/tokens';
import { UI } from '../uiConstants';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import {
  drawMiniMapBase,
  drawMiniMapViewportFrame,
  miniToWorld,
  type MiniMapDrawCtx,
  type MiniMapViewport,
  type Point2D,
} from './miniMapDraw';

export type { MiniMapViewport };

export interface MiniMapProps {
  /** px 邊長，預設 `UI.minimapSizePx`（224，E-69 正方定案）。 */
  size?: number;
  /** 主鏡頭可視範圍（世界座標）。 */
  viewport: MiniMapViewport;
  /** 點擊／拖曳 → 主鏡頭中心移至該世界座標（呼叫端接 `camera.focusOn`，見檔頭說明）。 */
  onNavigate: (worldX: number, worldY: number) => void;
}

/** canvas 元素相對版面的本地座標（小地圖座標系，左上為原點）。 */
function localPoint(e: ReactPointerEvent<HTMLCanvasElement>): Point2D {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** 模組級快取（見檔頭說明）：同一 `tickSeq` 內重複呼叫回傳同一參考，避免無限重渲染。 */
const cachedSelectMiniMapModel = makeCachedSelector(selectMiniMapModel);

export function MiniMap({
  size = UI.minimapSizePx,
  viewport,
  onNavigate,
}: MiniMapProps): ReactElement {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const lastDrawnVersionRef = useRef<number | null>(null);
  const lastDrawTimeRef = useRef(-Infinity);
  const pendingRedrawRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const model = useCachedGameSelector(cachedSelectMiniMapModel);

  // 底圖層：`model.version` 變更節流重繪（§5.5）。節流採「trailing」語意：距上次重繪未滿
  // `UI.minimapRedrawMs` 時改排程一次延後重繪，確保暫停中／低速下的單次歸屬變動終究會反映
  // （而非需等到下一次 version 變更才有機會重繪）。
  useEffect(() => {
    if (pendingRedrawRef.current !== null) {
      clearTimeout(pendingRedrawRef.current);
      pendingRedrawRef.current = null;
    }
    if (lastDrawnVersionRef.current === model.version) return;

    const draw = (): void => {
      const ctx = baseCanvasRef.current?.getContext('2d') as MiniMapDrawCtx | null | undefined;
      if (ctx == null) return;
      drawMiniMapBase(ctx, model, size);
      lastDrawnVersionRef.current = model.version;
      lastDrawTimeRef.current = Date.now();
      pendingRedrawRef.current = null;
    };

    const elapsed = Date.now() - lastDrawTimeRef.current;
    if (elapsed >= UI.minimapRedrawMs) {
      draw();
    } else {
      pendingRedrawRef.current = setTimeout(draw, UI.minimapRedrawMs - elapsed);
    }
    return () => {
      if (pendingRedrawRef.current !== null) {
        clearTimeout(pendingRedrawRef.current);
        pendingRedrawRef.current = null;
      }
    };
  }, [model, size]);

  // 框層：viewport 每次變動即清框重畫（§5.5：「視窗框層每幀清除重畫」）。
  useEffect(() => {
    const ctx = frameCanvasRef.current?.getContext('2d') as MiniMapDrawCtx | null | undefined;
    if (ctx == null) return;
    drawMiniMapViewportFrame(ctx, viewport, size);
  }, [viewport, size]);

  function navigate(e: ReactPointerEvent<HTMLCanvasElement>): void {
    const world = miniToWorld(localPoint(e), size);
    onNavigate(world.x, world.y);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void {
    draggingRef.current = true;
    // jsdom（測試環境）未實作 Pointer Capture API；瀏覽器內為選配強化（拖出畫布邊界仍追蹤）。
    e.currentTarget.setPointerCapture?.(e.pointerId);
    navigate(e);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!draggingRef.current) return;
    navigate(e);
  }

  function endDrag(e: ReactPointerEvent<HTMLCanvasElement>): void {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  const canvasStyle = { position: 'absolute' as const, inset: 0, width: size, height: size };

  return (
    <div
      data-testid="minimap"
      role="img"
      aria-label={t('ui.minimap.ariaLabel')}
      style={{
        position: 'fixed',
        right: TOKENS.space.space3,
        bottom: TOKENS.space.space3,
        width: size,
        height: size,
        zIndex: 'var(--z-hud)',
      }}
    >
      <canvas
        ref={baseCanvasRef}
        width={size}
        height={size}
        style={canvasStyle}
        data-testid="minimap-base"
      />
      <canvas
        ref={frameCanvasRef}
        width={size}
        height={size}
        style={{ ...canvasStyle, cursor: 'pointer' }}
        data-testid="minimap-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
