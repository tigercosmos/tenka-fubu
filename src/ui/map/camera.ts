// 鏡頭狀態與縮放／平移／慣性／聚焦動畫。
//
// 規格：plan/04-map-and-movement.md §3.11（鏡頭：狀態、縮放操作、平移、慣性、focusOn API）、
// §5.7（縮放錨點公式與 focusOn 演算法，本檔 `onWheel`/`focusOn` 原樣依循）、§4.5（`MAPVIEW`
// 渲染常數；平移夾限 `panBoundsPadding` 之補入見 §8-D13）。18-roadmap.md M2-15（04-T10）。
//
// 純邏輯、無 DOM／PixiJS 相依（框架無關，供任一 host——`MapRenderer`／測試——以純數字驅動）：
// - 座標轉換：`screenToWorld`/`worldToScreen`／`getWorldTransform`（供套用至 Pixi `world`
//   容器的 `scale`/`position`，公式與 M2-13 骨架 `fitWorldToViewport` 一致）。
// - 輸入：`onWheel`（縮放，游標錨點不漂移，§5.7）／`startDrag`+`dragMove`+`endDrag`（拖曳平移
//   與慣性起始速度）／`panByKeyboard`（方向鍵）。任何輸入呼叫皆先取消進行中的 `focusOn` 動畫
//   （其 Promise 仍會 resolve，見 §3.11）與慣性。
// - 驅動：`update(deltaMs)` 由 host 的渲染迴圈（Pixi ticker／`requestAnimationFrame`）每幀呼叫，
//   推進 `focusOn` 補間（依實際經過時間）或慣性衰減（依 §3.11 為「每幀」×`inertiaDamping`，
//   與呼叫頻率而非經過時間掛鉤，逐字對應規格「每幀速度 ×0.92」）。

import { MAPVIEW, WORLD_SIZE } from './mapViewConfig';

/** 鏡頭狀態（04 §3.11）：`x,y` 為畫面中心的世界座標，`scale` = 螢幕 px / world unit。 */
export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** 螢幕視窗尺寸（px），供座標轉換使用（即 Pixi `app.screen.width/height`）。 */
export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

/** 世界座標點。 */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/** 螢幕座標點。 */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** 平移夾限邊界（世界座標，套用於 `CameraState.x/y`）。 */
export interface CameraBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** `focusOn` 選項（04 §3.11）：省略者取 `MAPVIEW.focusScale`/`MAPVIEW.focusDurationMs`。 */
export interface FocusOnOptions {
  readonly scale?: number;
  readonly durationMs?: number;
}

/** 套用至 Pixi 鏡頭變換根 `world` 容器的 `scale`/`position`（`MapRenderer.fitWorldToViewport` 同構）。 */
export interface WorldTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** easeInOutCubic（§5.7 `focusOn` 補間函式）。 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 進行中的聚焦動畫狀態。 */
interface FocusAnim {
  readonly from: CameraState;
  readonly to: CameraState;
  elapsedMs: number;
  readonly durationMs: number;
  readonly resolve: () => void;
}

/** 進行中的慣性速度（世界 unit／幀）。 */
interface Velocity {
  vx: number;
  vy: number;
}

const ZERO_VELOCITY: Velocity = { vx: 0, vy: 0 };

/**
 * 鏡頭引擎（04-T10）。無 Pixi 相依；host 於每次使用者輸入呼叫對應方法、每幀呼叫 `update`，
 * 並以 `getWorldTransform` 取值套用至渲染容器。
 */
export class Camera {
  private state: CameraState;
  private readonly bounds: CameraBounds;

  private dragging = false;
  private velocity: Velocity = { ...ZERO_VELOCITY };
  private inertiaActive = false;
  private focusAnim: FocusAnim | null = null;

  constructor(initial?: Partial<CameraState>, bounds?: Partial<CameraBounds>) {
    const padding = MAPVIEW.panBoundsPadding;
    this.bounds = {
      minX: bounds?.minX ?? -padding,
      maxX: bounds?.maxX ?? WORLD_SIZE + padding,
      minY: bounds?.minY ?? -padding,
      maxY: bounds?.maxY ?? WORLD_SIZE + padding,
    };
    this.state = {
      x: initial?.x ?? WORLD_SIZE / 2,
      y: initial?.y ?? WORLD_SIZE / 2,
      scale: clamp(initial?.scale ?? 1, MAPVIEW.minScale, MAPVIEW.maxScale),
    };
  }

  /** 目前鏡頭狀態（複本，呼叫端無法就地突變）。 */
  getState(): CameraState {
    return this.state;
  }

  /** 是否有 `focusOn` 動畫進行中。 */
  isAnimating(): boolean {
    return this.focusAnim !== null;
  }

  /** 是否有慣性滑動進行中。 */
  isInertiaActive(): boolean {
    return this.inertiaActive;
  }

  /** 螢幕座標 → 世界座標（依目前鏡頭狀態）。 */
  screenToWorld(screen: ScreenPoint, viewport: CameraViewport): WorldPoint {
    return {
      x: (screen.x - viewport.width / 2) / this.state.scale + this.state.x,
      y: (screen.y - viewport.height / 2) / this.state.scale + this.state.y,
    };
  }

  /** 世界座標 → 螢幕座標（依目前鏡頭狀態）。 */
  worldToScreen(world: WorldPoint, viewport: CameraViewport): ScreenPoint {
    return {
      x: (world.x - this.state.x) * this.state.scale + viewport.width / 2,
      y: (world.y - this.state.y) * this.state.scale + viewport.height / 2,
    };
  }

  /** 供套用至 Pixi `world` 容器 `scale.set(t.scale)`／`position.set(t.x, t.y)`。 */
  getWorldTransform(viewport: CameraViewport): WorldTransform {
    return {
      scale: this.state.scale,
      x: viewport.width / 2 - this.state.x * this.state.scale,
      y: viewport.height / 2 - this.state.y * this.state.scale,
    };
  }

  /**
   * 滑鼠滾輪縮放（§3.11／§5.7 `onWheel`）：每格 ×`wheelZoomStep`（`deltaY<0`=放大，反向=縮小），
   * 以游標所指世界點為錨——縮放後該世界點仍位於游標下（04-T10 驗收）。
   * 刻意不夾限中心點（§8-D13）：僅「平移」夾限世界邊界，否則會使錨點公式漂移。
   */
  onWheel(deltaY: number, cursor: ScreenPoint, viewport: CameraViewport): void {
    this.cancelAutomatedMotion();
    const s0 = this.state.scale;
    const s1 = clamp(
      s0 * (deltaY < 0 ? MAPVIEW.wheelZoomStep : 1 / MAPVIEW.wheelZoomStep),
      MAPVIEW.minScale,
      MAPVIEW.maxScale,
    );
    const w = this.screenToWorld(cursor, viewport); // 縮放前游標世界座標
    this.state = { ...this.state, scale: s1 };
    const w2 = this.screenToWorld(cursor, viewport); // 縮放後（中心未變）游標世界座標
    this.state = { ...this.state, x: this.state.x + (w.x - w2.x), y: this.state.y + (w.y - w2.y) };
  }

  /** 拖曳開始（左鍵／中鍵，§3.11）：取消慣性與進行中的 `focusOn`。 */
  startDrag(): void {
    this.cancelAutomatedMotion();
    this.dragging = true;
    this.velocity = { ...ZERO_VELOCITY };
  }

  /**
   * 拖曳中位移（螢幕 px 差量；正值 dx = 指標右移）。中心點依世界邊界外擴 `panBoundsPadding`
   * 夾限（§3.11）。同時記錄本次位移換算之世界速度，供 `endDrag` 起始慣性（「以最後速度續滑」）。
   */
  dragMove(dxScreen: number, dyScreen: number): void {
    this.cancelAutomatedMotion();
    const vx = -dxScreen / this.state.scale;
    const vy = -dyScreen / this.state.scale;
    this.state = { ...this.state, x: this.state.x + vx, y: this.state.y + vy };
    this.clampPosition();
    this.velocity = { vx, vy };
  }

  /** 拖曳結束：若最後速度達 `inertiaMinSpeed` 門檻則起始慣性滑動，否則靜止。 */
  endDrag(): void {
    this.dragging = false;
    const { vx, vy } = this.velocity;
    if (Math.hypot(vx, vy) >= MAPVIEW.inertiaMinSpeed) {
      this.inertiaActive = true;
    } else {
      this.velocity = { ...ZERO_VELOCITY };
    }
  }

  /** 目前是否處於拖曳中。 */
  isDragging(): boolean {
    return this.dragging;
  }

  /**
   * 鍵盤方向鍵平移（§3.11：「每幀平移 `600/scale` px」）：`dirX`/`dirY` 為方向分量
   * （建議 -1/0/1）；每次呼叫視為一幀。中心點依世界邊界夾限。
   */
  panByKeyboard(dirX: number, dirY: number): void {
    this.cancelAutomatedMotion();
    const step = 600 / this.state.scale;
    this.state = { ...this.state, x: this.state.x + dirX * step, y: this.state.y + dirY * step };
    this.clampPosition();
  }

  /**
   * 聚焦動畫（§3.11／§5.7）：以 `easeInOutCubic` 於 `opts.durationMs ?? MAPVIEW.focusDurationMs`
   * 內同時內插中心到 `target`、scale 到 `opts.scale ?? MAPVIEW.focusScale`；回傳的 Promise 於動畫
   * 完成或被使用者鏡頭輸入中止時 resolve（中止時鏡頭停在中止當下的狀態，不跳至終點）。
   * 呼叫本方法前若已有動畫進行中，該舊動畫視同被中止（其 Promise 立即 resolve）。
   */
  focusOn(target: WorldPoint, opts?: FocusOnOptions): Promise<void> {
    this.cancelAutomatedMotion();
    const durationMs = opts?.durationMs ?? MAPVIEW.focusDurationMs;
    const targetScale = clamp(
      opts?.scale ?? MAPVIEW.focusScale,
      MAPVIEW.minScale,
      MAPVIEW.maxScale,
    );
    const to: CameraState = { x: target.x, y: target.y, scale: targetScale };
    if (durationMs <= 0) {
      this.state = to;
      return Promise.resolve();
    }
    const from = this.state;
    return new Promise<void>((resolve) => {
      this.focusAnim = { from, to, elapsedMs: 0, durationMs, resolve };
    });
  }

  /**
   * 每幀推進：`focusOn` 動畫依經過時間內插；否則若慣性進行中依 §3.11「每幀 ×`inertiaDamping`，
   * 低於 `inertiaMinSpeed` 停止」推進（呼叫頻率即「幀」，與 `deltaMs` 無關，逐字對應規格）。
   * 由 host 的渲染迴圈（Pixi ticker）每幀呼叫；`deltaMs` 供 `focusOn` 補間換算進度。
   */
  update(deltaMs: number): void {
    if (this.focusAnim !== null) {
      const anim = this.focusAnim;
      anim.elapsedMs += deltaMs;
      const t = clamp(anim.elapsedMs / anim.durationMs, 0, 1);
      const e = easeInOutCubic(t);
      this.state = {
        x: anim.from.x + (anim.to.x - anim.from.x) * e,
        y: anim.from.y + (anim.to.y - anim.from.y) * e,
        scale: anim.from.scale + (anim.to.scale - anim.from.scale) * e,
      };
      if (t >= 1) {
        this.focusAnim = null;
        anim.resolve();
      }
      return;
    }
    if (this.inertiaActive) {
      this.state = {
        ...this.state,
        x: this.state.x + this.velocity.vx,
        y: this.state.y + this.velocity.vy,
      };
      this.clampPosition();
      this.velocity = {
        vx: this.velocity.vx * MAPVIEW.inertiaDamping,
        vy: this.velocity.vy * MAPVIEW.inertiaDamping,
      };
      if (Math.hypot(this.velocity.vx, this.velocity.vy) < MAPVIEW.inertiaMinSpeed) {
        this.inertiaActive = false;
        this.velocity = { ...ZERO_VELOCITY };
      }
    }
  }

  /** 中心點依世界邊界外擴 `panBoundsPadding` 夾限（§3.11；僅平移操作使用，見類別頂端說明）。 */
  private clampPosition(): void {
    this.state = {
      ...this.state,
      x: clamp(this.state.x, this.bounds.minX, this.bounds.maxX),
      y: clamp(this.state.y, this.bounds.minY, this.bounds.maxY),
    };
  }

  /** 任何使用者鏡頭輸入的共通前置動作：中止 `focusOn`（Promise 仍 resolve）、清除慣性（§3.11）。 */
  private cancelAutomatedMotion(): void {
    if (this.focusAnim !== null) {
      const { resolve } = this.focusAnim;
      this.focusAnim = null;
      resolve();
    }
    if (this.inertiaActive) {
      this.inertiaActive = false;
      this.velocity = { ...ZERO_VELOCITY };
    }
  }
}
