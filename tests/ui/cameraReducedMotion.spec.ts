import { describe, expect, it } from 'vitest';
import { Camera } from '@ui/map/camera';

describe('camera runtime reduced motion', () => {
  it('jumps an active focus to its exact target and resolves the existing promise', async () => {
    const camera = new Camera({ x: 0, y: 0, scale: 1 });
    let resolved = false;
    const focus = camera.focusOn({ x: 400, y: 700 }, { scale: 2, durationMs: 600 }).then(() => {
      resolved = true;
    });
    camera.update(100);
    expect(camera.isAnimating()).toBe(true);
    camera.setReducedMotion(true);
    expect(camera.getState()).toEqual({ x: 400, y: 700, scale: 2 });
    expect(camera.isAnimating()).toBe(false);
    await focus;
    expect(resolved).toBe(true);
    camera.update(600);
    expect(camera.getState()).toEqual({ x: 400, y: 700, scale: 2 });
  });
  it('makes future focus calls immediate even with an explicit positive duration', async () => {
    const camera = new Camera();
    camera.setReducedMotion(true);
    await camera.focusOn({ x: 50, y: 80 }, { scale: 1, durationMs: 1000 });
    expect(camera.getState()).toEqual({ x: 50, y: 80, scale: 1 });
    expect(camera.isAnimating()).toBe(false);
    camera.setReducedMotion(false);
    const focus = camera.focusOn({ x: 500, y: 800 });
    expect(camera.isAnimating()).toBe(true);
    camera.update(600);
    await focus;
  });
  it('stops existing inertia but retains direct drag, zoom anchoring and keyboard input', () => {
    const camera = new Camera({ x: 100, y: 100, scale: 1 });
    camera.startDrag();
    camera.dragMove(10, 20);
    camera.endDrag();
    expect(camera.isInertiaActive()).toBe(true);
    camera.setReducedMotion(true);
    const stopped = camera.getState();
    camera.update(100);
    expect(camera.getState()).toEqual(stopped);
    camera.startDrag();
    camera.dragMove(5, 10);
    camera.endDrag();
    expect(camera.isInertiaActive()).toBe(false);
    expect(camera.getState().x).toBe(stopped.x - 5);
    const cursor = { x: 200, y: 100 },
      viewport = { width: 800, height: 600 };
    const anchor = camera.screenToWorld(cursor, viewport);
    camera.onWheel(-1, cursor, viewport);
    expect(camera.screenToWorld(cursor, viewport).x).toBeCloseTo(anchor.x, 10);
    expect(camera.screenToWorld(cursor, viewport).y).toBeCloseTo(anchor.y, 10);
    const before = camera.getState();
    camera.panByKeyboard(1, 0);
    expect(camera.getState().x).not.toBe(before.x);
    camera.setReducedMotion(false);
    camera.startDrag();
    camera.dragMove(5, 10);
    camera.endDrag();
    expect(camera.isInertiaActive()).toBe(true);
  });
});
