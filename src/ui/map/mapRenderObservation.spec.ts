import { describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses();
});

import { MapRenderer } from './MapRenderer';
import { Container, Graphics } from 'pixi.js';

/** Local Runner stand-in: invokes the actual renderer's registered postrender method. */
async function observedRenderer() {
  const renderer = new MapRenderer();
  await renderer.init(document.createElement('div'), vi.fn());
  renderer.getDiagnostics(); // Settle the initial scene before tests inject observation-only parts.
  const prerender = renderer.getApp()!.renderer.runners.prerender;
  const observers = new Set<{ postrender(): void }>();
  const runner = {
    add(observer: { postrender(): void }) {
      observers.add(observer);
    },
    remove(observer: { postrender(): void }) {
      observers.delete(observer);
    },
    destroy() {
      observers.clear();
    },
  };
  Object.defineProperty(renderer.getApp()!.renderer, 'runners', {
    value: { prerender, postrender: runner },
  });
  return { renderer, observers, render: () => [...observers].forEach((o) => o.postrender()) };
}

describe('actual MapRenderer postrender observation lifecycle', () => {
  it('counts Graphics own paint alongside children while respecting visibility and alpha', async () => {
    const { renderer } = await observedRenderer();
    const parent = new Graphics();
    const child = new Graphics();
    for (const graphic of [parent, child]) {
      graphic.visible = true;
      graphic.renderable = true;
      graphic.alpha = 1;
      graphic.rect(0, 0, 10, 10).fill(0xffffff);
      // The shared mock does not record Graphics instructions. Supply the public
      // observation shape explicitly; this is drawable counting, not GPU paint proof.
      Object.defineProperty(graphic, 'context', {
        value: { instructions: [{ action: 'fill' }] },
      });
    }
    parent.addChild(child);
    const layer = renderer.getLayers()!.armies;
    layer.visible = true;
    layer.renderable = true;
    layer.alpha = 1;
    layer.addChild(parent);
    const count = () => {
      const observed = renderer.getDiagnostics().layers.armies;
      if (!observed) throw new Error('Missing initialized armies layer observation');
      return observed.visibleDrawables;
    };
    try {
      child.visible = false;
      expect(count()).toBe(1);
      child.visible = true;
      expect(count()).toBe(2);
      parent.visible = false;
      expect(count()).toBe(0);
      parent.visible = true;
      parent.alpha = 0;
      expect(count()).toBe(0);
      parent.alpha = 1;
      child.alpha = 0;
      expect(count()).toBe(1);
    } finally {
      renderer.destroy();
    }
  });

  it('counts only requested unique cohort parts, excluding unrelated AI armies', async () => {
    const { renderer } = await observedRenderer();
    const visible = new Container();
    const hidden = new Container();
    const unrelated = new Container();
    for (const container of [visible, hidden, unrelated]) {
      container.visible = true;
      container.renderable = true;
      container.alpha = 1;
      container.parent = null;
    }
    hidden.visible = false;
    Object.defineProperty(renderer, 'armyParts', {
      value: new Map([
        ['cohort1', { container: visible, destroy: vi.fn() }],
        ['cohort2', { container: hidden, destroy: vi.fn() }],
        ['unrelated', { container: unrelated, destroy: vi.fn() }],
      ]),
    });
    expect(renderer.getArmyRenderObservation()).toEqual({ mounted: 3, cullVisibleArmyChips: 2 });
    expect(renderer.getArmyRenderObservation(['cohort1', 'cohort1', 'cohort2', 'missing'])).toEqual(
      { mounted: 2, cullVisibleArmyChips: 1 },
    );
    expect(renderer.getArmyRenderObservation(['missing'])).toEqual({
      mounted: 0,
      cullVisibleArmyChips: 0,
    });
    renderer.destroy();
  });
  it('observes only postrender, isolates listener failure and disposes exactly once', async () => {
    const { renderer, observers, render } = await observedRenderer();
    const before = renderer.getDiagnostics().resources.eventListeners;
    const listener = vi.fn((timestamp: number) => {
      expect(Number.isFinite(timestamp)).toBe(true);
      throw new Error('observer failure');
    });
    const dispose = renderer.subscribeRenderedFrames(listener);
    expect(listener).not.toHaveBeenCalled();
    expect(renderer.getDiagnostics().resources.eventListeners).toBe(before + 1);
    expect(() => render()).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(Number.isFinite(listener.mock.calls[0]![0])).toBe(true);
    dispose();
    dispose();
    expect(observers.size).toBe(0);
    expect(renderer.getDiagnostics().resources.eventListeners).toBe(before);
    render();
    expect(listener).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it('rejects unready observation and removes owned postrender observers on destroy/remount', async () => {
    expect(() => new MapRenderer().subscribeRenderedFrames(vi.fn())).toThrow('not ready');
    const first = await observedRenderer();
    const listener = vi.fn();
    const dispose = first.renderer.subscribeRenderedFrames(listener);
    first.renderer.destroy();
    dispose();
    expect(first.observers.size).toBe(0);
    first.render();
    expect(listener).not.toHaveBeenCalled();
    const second = await observedRenderer();
    expect(second.observers.size).toBe(0);
    expect(second.renderer.getArmyRenderObservation()).toEqual({
      mounted: 0,
      cullVisibleArmyChips: 0,
    });
    second.renderer.destroy();
  });
});
