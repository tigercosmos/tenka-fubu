import { afterEach, describe, expect, it, vi } from 'vitest';

const apps = vi.hoisted(() => []);
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(apps);
});

import { MapRenderer } from './MapRenderer';
import type { MapRendererEvent } from './mapViewTypes';

const renderers: MapRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
});

async function fixture() {
  const renderer = new MapRenderer();
  renderers.push(renderer);
  const emit = vi.fn<(event: MapRendererEvent) => void>();
  await renderer.init(document.createElement('div'), emit);
  renderer.setCameraPose({ x: 1000, y: 1000 }, 1);
  const app = renderer.getApp()!;
  const tick = () => (app.ticker as unknown as { tick(): void }).tick();
  const position = () => {
    const { x, y } = renderer.getLayers()!.world.position;
    return { x, y };
  };
  const pointer = (type: string, x: number, y = 100, pointerId = 1, button = 0) =>
    app.stage.emit(type, { global: { x, y }, pointerId, button });
  const cancel = (pointerId: number) =>
    app.canvas.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId }));
  return { renderer, emit, tick, position, pointer, cancel, canvas: app.canvas };
}

describe('renderer pointer drag threshold (real handlers, mocked Pixi surface)', () => {
  it.each([3, 4])(
    'keeps a %spx click wiggle stationary, including after release',
    async (distance) => {
      const f = await fixture();
      const before = f.position();
      f.pointer('pointerdown', 100);
      f.pointer('pointermove', 102);
      f.tick();
      f.pointer('pointermove', 100 + distance);
      f.tick();
      expect(f.position()).toEqual(before);
      f.pointer('pointerup', 100 + distance);
      f.pointer('pointertap', 100 + distance);
      for (let i = 0; i < 5; i++) f.tick();
      expect(f.position()).toEqual(before);
      expect(f.emit.mock.calls.filter(([event]) => event.type === 'emptyClick')).toHaveLength(1);
    },
  );

  it('pans the full displacement from down when crossing >4, then increments and suppresses tap', async () => {
    const f = await fixture();
    const before = f.position();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 103);
    f.pointer('pointermove', 106);
    f.tick();
    expect(f.position().x).toBe(before.x + 6);
    f.pointer('pointermove', 108);
    f.tick();
    expect(f.position().x).toBe(before.x + 8);
    f.pointer('pointerup', 108);
    f.pointer('pointertap', 108);
    expect(f.emit.mock.calls.filter(([event]) => event.type === 'emptyClick')).toHaveLength(0);
  });

  it.each([0, 1, 2])(
    'cancels old inertia on button %s down without a new movement',
    async (button) => {
      const f = await fixture();
      f.pointer('pointerdown', 100);
      f.pointer('pointermove', 110);
      f.pointer('pointerup', 110);
      f.tick();
      const before = f.position();
      f.pointer('pointerdown', 110, 100, 1, button);
      f.pointer('pointerup', 110, 100, 1, button);
      for (let i = 0; i < 5; i++) f.tick();
      expect(f.position()).toEqual(before);
    },
  );

  it('retains the owning pointer through secondary moves, presses and releases', async () => {
    const f = await fixture();
    const before = f.position();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 200, 100, 2);
    f.pointer('pointerdown', 200, 100, 2);
    f.pointer('pointerup', 200, 100, 2);
    f.tick();
    expect(f.position()).toEqual(before);
    f.pointer('pointermove', 106);
    f.tick();
    expect(f.position().x).toBe(before.x + 6);
    f.pointer('pointerupoutside', 106);
    f.pointer('pointertap', 106);
    expect(f.emit.mock.calls.filter(([event]) => event.type === 'emptyClick')).toHaveLength(0);
  });

  it('does not let a secondary tap consume the primary drag suppression', async () => {
    const f = await fixture();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 106);
    f.pointer('pointerdown', 200, 100, 2);
    f.pointer('pointerup', 200, 100, 2);
    f.pointer('pointertap', 200, 100, 2);
    f.pointer('pointerup', 106);
    f.pointer('pointertap', 106);
    expect(f.emit.mock.calls.filter(([event]) => event.type === 'emptyClick')).toHaveLength(0);
  });

  it('preserves middle-button pan and right-click events without right-button pan', async () => {
    const f = await fixture();
    const before = f.position();
    f.pointer('pointerdown', 100, 100, 1, 2);
    f.pointer('pointermove', 120, 100, 1, 2);
    f.pointer('pointerup', 120, 100, 1, 2);
    f.pointer('rightclick', 120, 100, 1, 2);
    f.tick();
    expect(f.position()).toEqual(before);
    expect(f.emit.mock.calls.filter(([event]) => event.type === 'rightClick')).toHaveLength(1);
    f.pointer('pointerdown', 100, 100, 1, 1);
    f.pointer('pointermove', 106, 100, 1, 1);
    f.tick();
    expect(f.position().x).toBe(before.x + 6);
  });
});

describe('renderer native pointer cancellation and focus loss', () => {
  it('releases a cancelled owner without inertia and permits a new pointer to drag', async () => {
    const f = await fixture();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 106);
    f.tick();
    const before = f.position();
    f.cancel(1);
    f.pointer('pointermove', 160);
    for (let i = 0; i < 5; i++) f.tick();
    expect(f.position()).toEqual(before);
    f.pointer('pointerdown', 200, 100, 2);
    f.pointer('pointermove', 206, 100, 2);
    f.tick();
    expect(f.position().x).toBe(before.x + 6);
  });

  it('ignores a secondary native cancellation without releasing the primary owner', async () => {
    const f = await fixture();
    const before = f.position();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 106);
    f.cancel(2);
    f.pointer('pointermove', 108);
    f.tick();
    expect(f.position().x).toBe(before.x + 8);
  });

  it('blur releases drag ownership, leaves idle moves stationary and restores ordinary clicks', async () => {
    const f = await fixture();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 106);
    f.tick();
    const before = f.position();
    window.dispatchEvent(new Event('blur'));
    f.pointer('pointermove', 160);
    for (let i = 0; i < 5; i++) f.tick();
    expect(f.position()).toEqual(before);
    f.pointer('pointerdown', 200, 100, 2);
    f.pointer('pointerup', 200, 100, 2);
    f.pointer('pointertap', 200, 100, 2);
    expect(f.emit.mock.calls.filter(([event]) => event.type === 'emptyClick')).toHaveLength(1);
  });

  it('blur also stops existing release inertia rather than restarting it', async () => {
    const f = await fixture();
    f.pointer('pointerdown', 100);
    f.pointer('pointermove', 106);
    f.pointer('pointerup', 106);
    f.tick();
    const before = f.position();
    window.dispatchEvent(new Event('blur'));
    for (let i = 0; i < 5; i++) f.tick();
    expect(f.position()).toEqual(before);
  });

  it('removes its native listeners once, cannot reinitialize a destroyed instance and remounts independently', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const first = await fixture();
      const removeCanvas = vi.spyOn(first.canvas, 'removeEventListener');
      const blurCalls = add.mock.calls.filter(([type]) => type === 'blur');
      expect(blurCalls).toHaveLength(1);
      first.renderer.destroy();
      first.renderer.destroy();
      expect(remove.mock.calls.filter(([type]) => type === 'blur')).toEqual(blurCalls);
      expect(removeCanvas.mock.calls.filter(([type]) => type === 'pointercancel')).toHaveLength(1);
      expect(removeCanvas.mock.calls.filter(([type]) => type === 'pointerleave')).toHaveLength(1);
      expect(first.renderer.getDiagnostics().resources.eventListeners).toBe(0);
      await first.renderer.init(document.createElement('div'), first.emit);
      expect(first.renderer.isReady()).toBe(false);
      expect(add.mock.calls.filter(([type]) => type === 'blur')).toHaveLength(1);
      const next = await fixture();
      const before = next.position();
      next.pointer('pointerdown', 100);
      first.cancel(1);
      next.pointer('pointermove', 106);
      next.tick();
      expect(next.position().x).toBe(before.x + 6);
      next.renderer.destroy();
      expect(remove.mock.calls.filter(([type]) => type === 'blur')).toEqual(
        add.mock.calls.filter(([type]) => type === 'blur'),
      );
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});

it('owned native boundaries end hover without changing normal camera position', async () => {
  const f = await fixture();
  const before = f.position();
  f.emit.mockClear();
  f.canvas.dispatchEvent(new Event('pointerleave'));
  expect(f.emit).toHaveBeenCalledWith({ type: 'hoverEnd' });
  f.emit.mockClear();
  f.pointer('pointerdown', 100);
  expect(f.emit).toHaveBeenCalledWith({ type: 'hoverEnd' });
  f.emit.mockClear();
  f.cancel(2);
  expect(f.emit).not.toHaveBeenCalled();
  f.cancel(1);
  expect(f.emit).toHaveBeenCalledWith({ type: 'hoverEnd' });
  f.emit.mockClear();
  window.dispatchEvent(new Event('blur'));
  expect(f.emit).toHaveBeenCalledWith({ type: 'hoverEnd' });
  expect(f.position()).toEqual(before);
  f.renderer.destroy();
  f.emit.mockClear();
  f.canvas.dispatchEvent(new Event('pointerleave'));
  window.dispatchEvent(new Event('blur'));
  expect(f.emit).not.toHaveBeenCalled();
});
