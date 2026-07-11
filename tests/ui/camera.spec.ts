// 鏡頭引擎（src/ui/map/camera.ts）純函式測試。
// 規格：plan/04-map-and-movement.md §3.11（鏡頭狀態／縮放／平移／慣性／focusOn）、
// §5.7（縮放錨點公式、focusOn 補間演算法）、§4.5（`MAPVIEW` 常數；`panBoundsPadding` 見 §8-D13）；
// 18-roadmap.md M2-15（04-T10）驗收：「滾輪縮放時游標下世界點不漂移（縮放前後 `screenToWorld`
// 誤差 < 0.5）」「focusOn 期間拖曳立即接管」。
//
// 無 Pixi／DOM 相依，於 core（node）project 執行（tests/**/*.spec.ts）。

import { describe, expect, it } from 'vitest';
import { Camera, easeInOutCubic } from '@ui/map/camera';
import { MAPVIEW, WORLD_SIZE } from '@ui/map/mapViewConfig';

const VIEWPORT = { width: 1280, height: 720 };

describe('easeInOutCubic', () => {
  it('端點與中點為已知值', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
  });
});

describe('Camera 建構與座標轉換', () => {
  it('預設鏡頭置中於世界中心、scale=1', () => {
    const cam = new Camera();
    expect(cam.getState()).toEqual({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, scale: 1 });
  });

  it('screenToWorld／worldToScreen 互為反函式', () => {
    const cam = new Camera({ x: 1000, y: 2000, scale: 2 });
    const world = { x: 1234, y: 987 };
    const screen = cam.worldToScreen(world, VIEWPORT);
    const back = cam.screenToWorld(screen, VIEWPORT);
    expect(back.x).toBeCloseTo(world.x, 9);
    expect(back.y).toBeCloseTo(world.y, 9);
  });

  it('screen 中心點對應鏡頭中心世界座標', () => {
    const cam = new Camera({ x: 500, y: 600, scale: 1.5 });
    const w = cam.screenToWorld({ x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }, VIEWPORT);
    expect(w).toEqual({ x: 500, y: 600 });
  });

  it('getWorldTransform 與 fitWorldToViewport 骨架公式同構（scale=1 置中）', () => {
    const cam = new Camera({ x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, scale: 1 });
    const t = cam.getWorldTransform(VIEWPORT);
    expect(t).toEqual({
      scale: 1,
      x: VIEWPORT.width / 2 - WORLD_SIZE / 2,
      y: VIEWPORT.height / 2 - WORLD_SIZE / 2,
    });
  });
});

describe('onWheel（04-T10 驗收：縮放錨點不漂移）', () => {
  it('放大：游標下世界點縮放前後誤差 < 0.5（實務應近乎為 0）', () => {
    const cam = new Camera({ x: 2000, y: 1500, scale: 0.8 });
    const cursor = { x: 300, y: 500 };
    const before = cam.screenToWorld(cursor, VIEWPORT);
    cam.onWheel(-1, cursor, VIEWPORT);
    const after = cam.screenToWorld(cursor, VIEWPORT);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(cam.getState().scale).toBeCloseTo(0.8 * MAPVIEW.wheelZoomStep, 12);
  });

  it('縮小：游標下世界點縮放前後誤差 < 0.5', () => {
    const cam = new Camera({ x: 900, y: 3000, scale: 2 });
    const cursor = { x: 1100, y: 50 };
    const before = cam.screenToWorld(cursor, VIEWPORT);
    cam.onWheel(1, cursor, VIEWPORT);
    const after = cam.screenToWorld(cursor, VIEWPORT);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    expect(cam.getState().scale).toBeCloseTo(2 / MAPVIEW.wheelZoomStep, 12);
  });

  it('多次不同游標位置連續縮放皆不漂移', () => {
    const cam = new Camera({ x: 1234, y: 4321, scale: 1 });
    const cursors = [
      { x: 0, y: 0 },
      { x: 1280, y: 720 },
      { x: 640, y: 10 },
      { x: 3, y: 700 },
    ];
    for (const cursor of cursors) {
      const before = cam.screenToWorld(cursor, VIEWPORT);
      cam.onWheel(-1, cursor, VIEWPORT);
      const after = cam.screenToWorld(cursor, VIEWPORT);
      expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
      expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    }
  });

  it('scale 夾限於 [minScale, maxScale]', () => {
    const zoomIn = new Camera({ scale: MAPVIEW.maxScale });
    zoomIn.onWheel(-1, { x: 0, y: 0 }, VIEWPORT);
    expect(zoomIn.getState().scale).toBe(MAPVIEW.maxScale);

    const zoomOut = new Camera({ scale: MAPVIEW.minScale });
    zoomOut.onWheel(1, { x: 0, y: 0 }, VIEWPORT);
    expect(zoomOut.getState().scale).toBe(MAPVIEW.minScale);
  });

  it('縮放不夾限中心點（§8-D13：僅平移夾限，避免破壞錨點不變式）', () => {
    // 起始中心已在世界邊界外（合法輸入，如 focusOn 或拖曳後再縮放的極端情境）。
    const cam = new Camera({ x: -500, y: -500, scale: 1 }, {});
    const cursor = { x: 640, y: 360 };
    const before = cam.screenToWorld(cursor, VIEWPORT);
    cam.onWheel(-1, cursor, VIEWPORT);
    const after = cam.screenToWorld(cursor, VIEWPORT);
    // 中心點仍在邊界外（未被拉回），錨點不變式維持。
    expect(cam.getState().x).toBeLessThan(-MAPVIEW.panBoundsPadding);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
  });

  it('onWheel 取消進行中的慣性與 focusOn', async () => {
    const cam = new Camera();
    cam.startDrag();
    cam.dragMove(100, 0);
    cam.endDrag();
    expect(cam.isInertiaActive()).toBe(true);
    const p = cam.focusOn({ x: 100, y: 100 });
    expect(cam.isAnimating()).toBe(true);
    cam.onWheel(-1, { x: 0, y: 0 }, VIEWPORT);
    expect(cam.isInertiaActive()).toBe(false);
    expect(cam.isAnimating()).toBe(false);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('拖曳平移（startDrag／dragMove／endDrag）', () => {
  it('dragMove 依螢幕位移換算世界位移（世界 = -螢幕位移/scale）', () => {
    const cam = new Camera({ x: 2000, y: 2000, scale: 2 });
    cam.startDrag();
    cam.dragMove(40, -20);
    const s = cam.getState();
    expect(s.x).toBeCloseTo(2000 - 40 / 2, 9);
    expect(s.y).toBeCloseTo(2000 - -20 / 2, 9);
  });

  it('中心點夾限於世界範圍外擴 panBoundsPadding', () => {
    const cam = new Camera({ x: 10, y: 10, scale: 1 });
    cam.startDrag();
    cam.dragMove(1_000_000, 1_000_000); // 巨量位移應被夾限，不外溢
    const s = cam.getState();
    expect(s.x).toBe(-MAPVIEW.panBoundsPadding);
    expect(s.y).toBe(-MAPVIEW.panBoundsPadding);

    cam.dragMove(-2_000_000, -2_000_000);
    const s2 = cam.getState();
    expect(s2.x).toBe(WORLD_SIZE + MAPVIEW.panBoundsPadding);
    expect(s2.y).toBe(WORLD_SIZE + MAPVIEW.panBoundsPadding);
  });

  it('自訂 bounds 覆蓋預設世界邊界', () => {
    const cam = new Camera({ x: 0, y: 0 }, { minX: -10, maxX: 10, minY: -10, maxY: 10 });
    cam.startDrag();
    cam.dragMove(1000, 1000);
    expect(cam.getState()).toEqual({ x: -10, y: -10, scale: 1 });
  });

  it('isDragging 反映拖曳中／結束狀態', () => {
    const cam = new Camera();
    expect(cam.isDragging()).toBe(false);
    cam.startDrag();
    expect(cam.isDragging()).toBe(true);
    cam.endDrag();
    expect(cam.isDragging()).toBe(false);
  });

  it('拖曳結束後速度低於 inertiaMinSpeed 門檻：不啟動慣性', () => {
    const cam = new Camera({ scale: 1 });
    cam.startDrag();
    cam.dragMove(0.001, 0.001); // 換算世界速度遠低於 inertiaMinSpeed(0.02)
    cam.endDrag();
    expect(cam.isInertiaActive()).toBe(false);
  });
});

describe('慣性（endDrag 後續滑，§3.11）', () => {
  it('每幀速度 ×inertiaDamping，低於 inertiaMinSpeed 停止', () => {
    const cam = new Camera({ x: 2000, y: 2000, scale: 1 });
    cam.startDrag();
    cam.dragMove(-100, 0); // 世界速度 vx=100（螢幕左移 → 世界右移）
    cam.endDrag();
    expect(cam.isInertiaActive()).toBe(true);

    const before = cam.getState();
    cam.update(16);
    const after1 = cam.getState();
    expect(after1.x - before.x).toBeCloseTo(100, 9);

    cam.update(16);
    const after2 = cam.getState();
    expect(after2.x - after1.x).toBeCloseTo(100 * MAPVIEW.inertiaDamping, 9);
  });

  it('持續 update 至速度低於門檻後自動停止且狀態不再變動', () => {
    const cam = new Camera({ x: 2000, y: 2000, scale: 1 });
    cam.startDrag();
    cam.dragMove(-1, 0); // 世界速度 vx=1，很快衰減至門檻以下
    cam.endDrag();
    expect(cam.isInertiaActive()).toBe(true);

    for (let i = 0; i < 500 && cam.isInertiaActive(); i++) cam.update(16);
    expect(cam.isInertiaActive()).toBe(false);

    const settled = cam.getState();
    cam.update(16);
    expect(cam.getState()).toEqual(settled);
  });

  it('慣性滑動中心點亦受邊界夾限（持續朝左邊界外滑動時被夾在邊界上）', () => {
    const cam = new Camera({ x: -MAPVIEW.panBoundsPadding + 1, y: 0, scale: 1 });
    cam.startDrag();
    cam.dragMove(1000, 0); // 世界速度 vx=-1000（持續朝左邊界外滑動）
    cam.endDrag();
    for (let i = 0; i < 50; i++) {
      cam.update(16);
      expect(cam.getState().x).toBeGreaterThanOrEqual(-MAPVIEW.panBoundsPadding);
    }
    expect(cam.getState().x).toBe(-MAPVIEW.panBoundsPadding);
  });

  it('新輸入（拖曳／縮放／鍵盤平移）立即取消慣性', () => {
    const cam = new Camera();
    cam.startDrag();
    cam.dragMove(-100, 0);
    cam.endDrag();
    expect(cam.isInertiaActive()).toBe(true);
    cam.panByKeyboard(1, 0);
    expect(cam.isInertiaActive()).toBe(false);
  });
});

describe('panByKeyboard（方向鍵，每幀 600/scale）', () => {
  it('位移量為 600/scale 乘方向分量', () => {
    const cam = new Camera({ x: 2000, y: 2000, scale: 2 });
    cam.panByKeyboard(1, -1);
    const s = cam.getState();
    expect(s.x).toBeCloseTo(2000 + 600 / 2, 9);
    expect(s.y).toBeCloseTo(2000 - 600 / 2, 9);
  });

  it('中心點夾限於世界邊界', () => {
    const cam = new Camera({ x: 0, y: 0, scale: 0.15 }); // 低 scale → 大步幅，易觸及邊界
    cam.panByKeyboard(-1, -1);
    const s = cam.getState();
    expect(s.x).toBe(-MAPVIEW.panBoundsPadding);
    expect(s.y).toBe(-MAPVIEW.panBoundsPadding);
  });
});

describe('focusOn（§3.11／§5.7：easeInOutCubic 補間、Promise、輸入中止）', () => {
  it('省略 opts 時取 MAPVIEW.focusScale／focusDurationMs', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const target = { x: 500, y: 700 };
    const p = cam.focusOn(target);
    cam.update(MAPVIEW.focusDurationMs);
    await p;
    expect(cam.getState()).toEqual({ x: 500, y: 700, scale: MAPVIEW.focusScale });
    expect(cam.isAnimating()).toBe(false);
  });

  it('中途（t=0.5）狀態為 easeInOutCubic(0.5)=0.5 之精確中點', () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    void cam.focusOn({ x: 1000, y: 2000 }, { scale: 3, durationMs: 1000 });
    cam.update(500);
    const s = cam.getState();
    expect(s.x).toBeCloseTo(500, 9);
    expect(s.y).toBeCloseTo(1000, 9);
    expect(s.scale).toBeCloseTo(2, 9); // 1 + (3-1)*0.5
  });

  it('分幀累積達 durationMs 才 resolve；到達後鏡頭精確落在目標', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 100, y: 100 }, { scale: 2, durationMs: 300 });
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    cam.update(100);
    await Promise.resolve();
    expect(resolved).toBe(false);
    cam.update(100);
    await Promise.resolve();
    expect(resolved).toBe(false);
    cam.update(100); // 累積滿 300ms
    await p;
    expect(resolved).toBe(true);
    expect(cam.getState()).toEqual({ x: 100, y: 100, scale: 2 });
  });

  it('durationMs<=0：立即套用終點狀態並 resolve', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 9, y: 9 }, { scale: 1.2, durationMs: 0 });
    await p;
    expect(cam.getState()).toEqual({ x: 9, y: 9, scale: 1.2 });
  });

  it('opts.scale 亦夾限於 [minScale, maxScale]', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 0, y: 0 }, { scale: 999, durationMs: 0 });
    await p;
    expect(cam.getState().scale).toBe(MAPVIEW.maxScale);
  });

  it('04-T10 驗收：動畫中使用者拖曳立即接管，Promise 仍 resolve，鏡頭停在中止當下狀態', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 1000, y: 1000 }, { scale: 2, durationMs: 1000 });
    cam.update(500); // 動畫進行到一半
    const midway = cam.getState();
    expect(cam.isAnimating()).toBe(true);

    cam.startDrag(); // 使用者輸入接管
    expect(cam.isAnimating()).toBe(false);
    await expect(p).resolves.toBeUndefined(); // Promise 仍 resolve（中止語意）

    // 中止當下鏡頭狀態不變（未跳至終點），且後續 update 不再套用動畫終點。
    expect(cam.getState()).toEqual(midway);
    cam.update(1000);
    expect(cam.getState().x).not.toBe(1000);
  });

  it('動畫中使用者滾輪縮放亦立即中止動畫', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 500, y: 500 }, { durationMs: 1000 });
    cam.update(200);
    cam.onWheel(-1, { x: 0, y: 0 }, VIEWPORT);
    expect(cam.isAnimating()).toBe(false);
    await expect(p).resolves.toBeUndefined();
  });

  it('動畫中使用者鍵盤平移亦立即中止動畫', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p = cam.focusOn({ x: 500, y: 500 }, { durationMs: 1000 });
    cam.update(200);
    cam.panByKeyboard(1, 0);
    expect(cam.isAnimating()).toBe(false);
    await expect(p).resolves.toBeUndefined();
  });

  it('新 focusOn 呼叫取代進行中的舊動畫（舊 Promise 立即 resolve）', async () => {
    const cam = new Camera({ x: 0, y: 0, scale: 1 });
    const p1 = cam.focusOn({ x: 1000, y: 1000 }, { durationMs: 1000 });
    cam.update(100);
    const p2 = cam.focusOn({ x: 50, y: 50 }, { scale: 1, durationMs: 200 });
    await expect(p1).resolves.toBeUndefined();
    cam.update(200);
    await p2;
    expect(cam.getState()).toEqual({ x: 50, y: 50, scale: 1 });
  });
});
