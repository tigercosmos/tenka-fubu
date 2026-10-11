import { createWasmGeographicScorer } from '@ui/map/wasmGeographicScorer';
import { realRenderWasmExports } from '../../../tests/helpers/realRenderWasm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { MapRenderer } from './MapRenderer';
import { MapInteraction } from './interaction';

afterEach(() => vi.restoreAllMocks());

// The actual renderer receives these structural event records from the shared
// Pixi test emitter; this seam does not pretend to construct a GL/event backend.
function stage(renderer: MapRenderer): { emit(name: string, event: unknown): void } {
  return renderer.getApp()!.stage;
}

function actualDomEvent(target: HTMLElement): Event {
  let recorded: Event | undefined;
  target.addEventListener(
    'pointermove',
    (event) => {
      recorded = event;
    },
    { once: true },
  );
  target.dispatchEvent(new Event('pointermove', { bubbles: true }));
  if (!recorded || recorded.target !== target) throw new Error('No actual DOM event target');
  return recorded;
}

describe('native DOM ownership at the actual renderer pointer router', () => {
  it('does not turn a real DOM trait pointer into a map hover and clears old map ownership', async () => {
    const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
    const events = vi.fn();
    await renderer.init(document.createElement('div'), events);
    const move = vi.spyOn(MapInteraction.prototype, 'handleMove');
    const chip = document.createElement('span');
    chip.textContent = '忠臣';
    const nativeEvent = actualDomEvent(chip);
    stage(renderer).emit('pointermove', { global: { x: 1625.58, y: 366.31 }, nativeEvent });
    expect(move).not.toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith({ type: 'hoverEnd' });
    stage(renderer).emit('pointermove', {
      global: { x: 10, y: 20 },
      nativeEvent: actualDomEvent(renderer.getApp()!.canvas),
    });
    expect(move).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it('preserves native canvas routing and the legacy event-without-native-target path', async () => {
    const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
    await renderer.init(document.createElement('div'), vi.fn());
    const move = vi.spyOn(MapInteraction.prototype, 'handleMove');
    const app = renderer.getApp()!;
    stage(renderer).emit('pointermove', {
      global: { x: 10, y: 20 },
      nativeEvent: actualDomEvent(app.canvas),
    });
    stage(renderer).emit('pointermove', { global: { x: 11, y: 21 } });
    expect(move).toHaveBeenCalledTimes(2);
    renderer.destroy();
  });

  it('retains the existing owned-drag path across DOM overlays without starting hover', async () => {
    const renderer = new MapRenderer(createWasmGeographicScorer(realRenderWasmExports()));
    await renderer.init(document.createElement('div'), vi.fn());
    const move = vi.spyOn(MapInteraction.prototype, 'handleMove');
    stage(renderer).emit('pointerdown', { global: { x: 10, y: 20 }, pointerId: 7, button: 0 });
    const camera = (renderer as unknown as { camera: { dragMove(dx: number, dy: number): void } })
      .camera;
    const drag = vi.spyOn(camera, 'dragMove');
    stage(renderer).emit('pointermove', {
      global: { x: 40, y: 50 },
      pointerId: 8,
      nativeEvent: actualDomEvent(document.createElement('span')),
    });
    expect(drag).not.toHaveBeenCalled();
    stage(renderer).emit('pointermove', {
      global: { x: 30, y: 40 },
      pointerId: 7,
      nativeEvent: actualDomEvent(document.createElement('span')),
    });
    expect(move).not.toHaveBeenCalled();
    expect(drag).toHaveBeenCalledTimes(1);
    expect(drag).toHaveBeenCalledWith(20, 20);
    stage(renderer).emit('pointerup', { pointerId: 7 });
    renderer.destroy();
  });
});
