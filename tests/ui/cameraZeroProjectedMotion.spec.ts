import { expect, it, vi } from 'vitest';
import { Camera } from '@ui/map/camera';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';

const viewport = { width: 1280, height: 720 };
const pointer = { x: viewport.width / 2, y: viewport.height / 2 };

it('retains the exact canonical center when zooming at viewport center on the actual national height field', () => {
  const field = createTerrainElevation(buildTerrainPack().mountains!);
  const inverse = vi.spyOn(field, 'unproject');
  const start = { x: 2130, y: 2613, scale: 1.5 };
  const camera = new Camera(start, undefined, field);
  for (let tick = 0; tick < 19; tick++) {
    camera.onWheel(1, pointer, viewport);
    const state = camera.getState();
    expect({ x: state.x, y: state.y }).toEqual({ x: start.x, y: start.y });
  }
  expect(inverse).not.toHaveBeenCalled();
  expect(camera.getState().scale).toBeLessThan(start.scale);
});

it('does not re-invert the unchanged projected center when wheel zoom is already clamped', () => {
  const field = createTerrainElevation(buildTerrainPack().mountains!);
  const inverse = vi.spyOn(field, 'unproject');
  const start = { x: 2130, y: 2613, scale: MAPVIEW.maxScale };
  const camera = new Camera(start, undefined, field);
  camera.onWheel(-1, { x: 257, y: 512 }, viewport);
  expect(camera.getState()).toEqual(start);
  expect(inverse).not.toHaveBeenCalled();
});

it('still re-inverts nonzero pointer-anchor motion on the actual national height field', () => {
  const field = createTerrainElevation(buildTerrainPack().mountains!);
  const inverse = vi.spyOn(field, 'unproject');
  const camera = new Camera({ x: 2130, y: 2613, scale: 1.5 }, undefined, field);
  const offCenter = { x: 257, y: 512 };
  const anchor = camera.screenToWorld(offCenter, viewport);
  inverse.mockClear();
  camera.onWheel(-1, offCenter, viewport);
  expect(inverse).toHaveBeenCalledTimes(1);
  const after = camera.screenToWorld(offCenter, viewport);
  expect(after.x).toBeCloseTo(anchor.x, 9);
  expect(after.y).toBeCloseTo(anchor.y, 9);
});
