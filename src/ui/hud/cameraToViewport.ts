// 主鏡頭狀態 → MiniMap 視窗框世界矩形（M6-V9 §4.4；純算 helper，非 core）。
//
// 與 `Camera.worldToScreen`（src/ui/map/camera.ts）同構之逆推：`scale` = 螢幕 px / world unit、
// `(x, y)` 為畫面中心的世界座標，故可視範圍世界寬高 = 視窗 px / scale、左上角 = 中心 − 寬高/2。

import type { CameraState } from '@ui/map/camera';
import type { MiniMapViewport } from '../components/miniMapDraw';

export function cameraToViewport(
  camera: CameraState,
  width: number,
  height: number,
): MiniMapViewport {
  const worldWidth = width / camera.scale;
  const worldHeight = height / camera.scale;
  return {
    x: camera.x - worldWidth / 2,
    y: camera.y - worldHeight / 2,
    width: worldWidth,
    height: worldHeight,
  };
}
