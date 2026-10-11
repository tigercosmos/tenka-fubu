import { describe, expect, it } from 'vitest';
import { Camera, type CameraBounds, type CameraState, type WorldPoint } from '@ui/map/camera';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';

const viewport = { width: 1280, height: 720 };
// Concrete Lipschitz .1 height field, with an independent closed-form inverse.
const surface = {
  project(point: WorldPoint): WorldPoint {
    const height = 10 + 0.1 * point.y;
    return { x: point.x - 0.18 * height, y: point.y - height };
  },
  unproject(point: WorldPoint): WorldPoint {
    const y = (point.y + 10) / 0.9;
    return { x: point.x + 0.18 * (10 + 0.1 * y), y };
  },
};
// Execute the original Camera with an ignored optional argument for behavioral
// RED, not a missing API error.
const Constructor: new (
  initial?: Partial<CameraState>,
  bounds?: Partial<CameraBounds>,
  projection?: typeof surface | null,
) => Camera = Camera;

function close(a: WorldPoint, b: WorldPoint) {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
}

describe('canonical-world camera with optional shared presentation projection', () => {
  it('uses the concrete projected point and canonical projected center in the actual affine transform', () => {
    const camera = new Constructor({ x: 100, y: 200, scale: 2 }, undefined, surface);
    const point = { x: 140, y: 260 };
    const projected = surface.project(point);
    const center = surface.project(camera.getState());
    const expected = {
      x: (projected.x - center.x) * 2 + 640,
      y: (projected.y - center.y) * 2 + 360,
    };
    close(camera.worldToScreen(point, viewport), expected);
    close(camera.screenToWorld(expected, viewport), point);
    expect(camera.getWorldTransform(viewport)).toEqual({
      scale: 2,
      x: 640 - center.x * 2,
      y: 360 - center.y * 2,
    });
    close(camera.screenToWorld({ x: 640, y: 360 }, viewport), camera.getState());
  });

  it('keeps the same canonical world point under the pointer through repeated wheel zooms', () => {
    const camera = new Constructor({ x: 1000, y: 1200, scale: 1 }, undefined, surface);
    const pointer = { x: 257, y: 512 };
    const anchor = camera.screenToWorld(pointer, viewport);
    for (const delta of [-1, -1, 1, -1, 1, 1]) {
      camera.onWheel(delta, pointer, viewport);
      close(camera.screenToWorld(pointer, viewport), anchor);
      close(camera.worldToScreen(anchor, viewport), pointer);
    }
  });

  it('does not double-project scene geometry and resets to exact flat arithmetic without changing canonical state', () => {
    const camera = new Camera({ x: 100, y: 200, scale: 2 }, undefined, surface);
    const point = { x: 140, y: 260 };
    const screen = camera.worldToScreen(point, viewport);
    close(camera.sceneToScreen(surface.project(point), viewport), screen);
    close(camera.screenToScene(screen, viewport), surface.project(point));
    const state = camera.getState();
    camera.setPresentationProjection(null);
    expect(camera.getState()).toEqual(state);
    const flat = new Camera(state);
    expect(camera.worldToScreen(point, viewport)).toEqual(flat.worldToScreen(point, viewport));
    expect(camera.getWorldTransform(viewport)).toEqual(flat.getWorldTransform(viewport));
    camera.setPresentationProjection(surface);
    close(camera.worldToScreen(point, viewport), screen);
  });

  it('drag, keyboard and inertia translate in scene space while storing canonical centers', () => {
    const camera = new Camera({ x: 1000, y: 1200, scale: 2 }, undefined, surface);
    const before = surface.project(camera.getState());
    camera.startDrag();
    camera.dragMove(80, -40);
    close(surface.project(camera.getState()), { x: before.x - 40, y: before.y + 20 });
    camera.endDrag();
    expect(camera.isInertiaActive()).toBe(true);
    camera.update(16);
    close(surface.project(camera.getState()), { x: before.x - 80, y: before.y + 40 });
    camera.update(16);
    close(surface.project(camera.getState()), {
      x: before.x - 80 - 40 * MAPVIEW.inertiaDamping,
      y: before.y + 40 + 20 * MAPVIEW.inertiaDamping,
    });
    const keyboardBefore = surface.project(camera.getState());
    camera.panByKeyboard(1, -1);
    expect(camera.isInertiaActive()).toBe(false);
    close(surface.project(camera.getState()), {
      x: keyboardBefore.x + 300,
      y: keyboardBefore.y - 300,
    });
  });

  it('keeps focus/minimap targets canonical, clamps canonical pan bounds, and cancels old-basis inertia on reset', async () => {
    const camera = new Camera({ x: 100, y: 200, scale: 1 }, undefined, surface);
    const target = { x: 500, y: 700 };
    const finished = camera.focusOn(target, { scale: 2, durationMs: 100 });
    camera.update(50);
    expect(camera.getState()).toEqual({ x: 300, y: 450, scale: 1.5 });
    camera.update(50);
    await finished;
    expect(camera.getState()).toEqual({ ...target, scale: 2 });
    close(camera.worldToScreen(target, viewport), { x: 640, y: 360 });
    close(camera.screenToWorld({ x: 640, y: 360 }, viewport), target);
    camera.startDrag();
    camera.dragMove(80, 20);
    camera.endDrag();
    const state = camera.getState();
    camera.setPresentationProjection(null);
    camera.update(16);
    expect(camera.isInertiaActive()).toBe(false);
    expect(camera.getState()).toEqual(state);
    const bounded = new Camera(
      { x: 0, y: 0, scale: 1 },
      { minX: -10, maxX: 10, minY: -10, maxY: 10 },
      surface,
    );
    bounded.dragMove(1000, 1000);
    expect(bounded.getState()).toEqual({ x: -10, y: -10, scale: 1 });
  });

  it('round-trips actual shared national height fields with bounded convergent inverse over camera scales', () => {
    const elevation = createTerrainElevation(buildTerrainPack().mountains!);
    let raised = 0;
    for (const scale of [0.15, 0.8, 1, 1.5, 3.215]) {
      const camera = new Camera({ x: 2130, y: 2613, scale }, undefined, elevation);
      for (let y = 2500; y <= 2750; y += 25)
        for (let x = 2000; x <= 2250; x += 25) {
          const point = { x, y };
          if (elevation.sample(point) > 0) raised++;
          const projected = elevation.project(point);
          const inverse = elevation.unprojectWithDiagnostics(projected);
          expect(inverse.iterations).toBeLessThanOrEqual(64);
          expect(inverse.errorBound).toBeLessThanOrEqual(1e-9);
          close(inverse.point, point);
          close(camera.screenToWorld(camera.worldToScreen(point, viewport), viewport), point);
        }
      const pointer = { x: 712, y: 289 };
      const anchor = camera.screenToWorld(pointer, viewport);
      camera.onWheel(-1, pointer, viewport);
      close(camera.worldToScreen(anchor, viewport), pointer);
    }
    expect(raised).toBeGreaterThan(0);
  });

  it('default and explicit-null cameras retain exact original transitions and affine formulas', () => {
    const original = new Camera({ x: 1000, y: 1200, scale: 1 });
    const explicitNull = new Camera(original.getState(), undefined, null);
    for (const camera of [original, explicitNull]) {
      camera.onWheel(-1, { x: 257, y: 512 }, viewport);
      camera.dragMove(80, 20);
      camera.endDrag();
      camera.update(16);
      camera.panByKeyboard(1, -1);
    }
    expect(explicitNull.getState()).toEqual(original.getState());
    const state = original.getState();
    expect(original.worldToScreen({ x: 11, y: 22 }, viewport)).toEqual({
      x: (11 - state.x) * state.scale + 640,
      y: (22 - state.y) * state.scale + 360,
    });
  });
});
