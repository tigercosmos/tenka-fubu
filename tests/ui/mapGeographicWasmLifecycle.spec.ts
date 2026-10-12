// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { createWasmGeographicScorer } from '../../src/ui/map/wasmGeographicScorer';
import { createWasmCastleRibbonPlanner } from '../../src/ui/map/wasmCastleRibbonPlanner';
import { createWasmGeographicPreparation } from '../../src/ui/map/wasmGeographicPreparation';
import { realRenderWasmExports } from '../helpers/realRenderWasm';
import type { FatalErrorInfo } from '../../src/app/errors';
import type { MapViewState } from '../../src/ui/map/mapViewTypes';

const tracked = vi.hoisted(() => ({
  apps: [] as { destroyed: boolean }[],
  nextOwners: [] as ReturnType<typeof createWasmGeographicScorer>[],
}));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(tracked.apps);
});
vi.mock('../../src/ui/map/mapFontReady', () => ({ waitForMapFont: async () => {} }));
vi.mock('../../src/ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/map/wasmGeographicScorer')>();
  return {
    ...actual,
    createWasmGeographicScorer: () => {
      const owner = tracked.nextOwners.shift();
      if (!owner) throw new Error('Lifecycle test requires an explicit scorer owner');
      return owner;
    },
  };
});
import { MapRenderer } from '../../src/ui/map/MapRenderer';
import { MapCanvasHost } from '../../src/ui/map/MapCanvasHost';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary';
import {
  getDebugMapRenderer,
  resetDebugMapRendererForTests,
} from '../../src/ui/map/debugMapBridge';

function deferredOwner() {
  const exports = realRenderWasmExports();
  const planner = createWasmCastleRibbonPlanner(exports);
  const preparation = createWasmGeographicPreparation(exports);
  let resolve!: () => void, reject!: (error: Error) => void;
  const gate = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  let ready = false,
    disposed = false;
  const initialize = vi.fn(async () => {
    await gate;
    if (!disposed) ready = true;
  });
  const scorer: ReturnType<typeof createWasmGeographicScorer> = {
    initialize,
    prepareCastlePlanner: () => {
      if (!ready || disposed) throw new Error('Explicit reference owner is not ready');
    },
    layoutCastleRibbons: (...args) => {
      if (!ready || disposed) throw new Error('Explicit reference owner is not ready');
      return planner.layout(...args);
    },
    getPreparation: () => {
      if (!ready || disposed) throw new Error('Explicit reference owner is not ready');
      return preparation;
    },
    install: () => {
      throw new Error('Explicit reference owner cannot install a backend');
    },
    isReady: () => ready && !disposed,
    getNumericVariant: () => 'scalar',
    score: (input) => {
      if (!ready || disposed) throw new Error('Explicit reference owner is not ready');
      return input.offsets[0];
    },
    dispose: vi.fn(() => {
      planner.dispose();
      preparation.dispose();
      disposed = true;
      ready = false;
    }),
  };
  return { scorer, initialize, resolve, reject };
}
const view = (day: number): MapViewState => ({
  day,
  districtOwner: {},
  castles: [],
  armies: [],
  battles: [],
  selection: null,
  analysisMode: 'none',
});
beforeEach(() => {
  tracked.apps.length = 0;
  tracked.nextOwners.length = 0;
  resetDebugMapRendererForTests();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  resetDebugMapRendererForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderer geographic scorer owner readiness and cancellation', () => {
  it('creates no Application before ready and serializes duplicate init calls', async () => {
    const owner = deferredOwner(),
      renderer = new MapRenderer(owner.scorer);
    const host = document.createElement('div');
    const first = renderer.init(host, vi.fn()),
      second = renderer.init(host, vi.fn());
    expect(owner.initialize).toHaveBeenCalledTimes(1);
    expect(renderer.isReady()).toBe(false);
    expect(tracked.apps).toHaveLength(0);
    expect(host.querySelector('canvas')).toBeNull();
    owner.resolve();
    await Promise.all([first, second]);
    expect(renderer.isReady()).toBe(true);
    expect(tracked.apps).toHaveLength(1);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    renderer.destroy();
    renderer.destroy();
    expect(owner.scorer.isReady()).toBe(false);
    expect(tracked.apps.every((app) => app.destroyed)).toBe(true);
  });

  it('rejects a missing castle ABI before constructing any Application', async () => {
    const actual = await vi.importActual<typeof import('../../src/ui/map/wasmGeographicScorer')>(
      '../../src/ui/map/wasmGeographicScorer',
    );
    const exports = { ...realRenderWasmExports() };
    delete exports.castle_ribbon_solve;
    const owner = actual.createWasmGeographicScorer(exports);
    const renderer = new MapRenderer(owner);
    await expect(renderer.init(document.createElement('div'), vi.fn())).rejects.toThrow(
      'Unsupported castle ribbon planner ABI',
    );
    expect(tracked.apps).toHaveLength(0);
    expect(renderer.isReady()).toBe(false);
    renderer.destroy();
    expect(owner.isReady()).toBe(false);
  });

  it.each(['geo_prepare', 'geo_score_prepared', 'geographic_preparation_abi_version'])(
    'rejects missing preparation export %s before constructing any Application',
    async (name) => {
      const actual = await vi.importActual<typeof import('../../src/ui/map/wasmGeographicScorer')>(
        '../../src/ui/map/wasmGeographicScorer',
      );
      const exports = { ...realRenderWasmExports() };
      delete exports[name];
      const owner = actual.createWasmGeographicScorer(exports);
      const renderer = new MapRenderer(owner);
      await expect(renderer.init(document.createElement('div'), vi.fn())).rejects.toThrow(
        'Unsupported geographic preparation ABI',
      );
      expect(tracked.apps).toHaveLength(0);
      expect(renderer.isReady()).toBe(false);
      renderer.destroy();
      expect(owner.isReady()).toBe(false);
    },
  );

  it('does not resurrect a renderer destroyed while its scorer prepares', async () => {
    const owner = deferredOwner(),
      renderer = new MapRenderer(owner.scorer);
    const host = document.createElement('div');
    const pending = renderer.init(host, vi.fn());
    renderer.destroy();
    owner.resolve();
    await pending;
    expect(renderer.isReady()).toBe(false);
    expect(owner.scorer.isReady()).toBe(false);
    expect(tracked.apps).toHaveLength(0);
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('keeps independent owners ready when another pending owner is destroyed', async () => {
    const a = deferredOwner(),
      b = deferredOwner();
    const first = new MapRenderer(a.scorer),
      second = new MapRenderer(b.scorer);
    const firstPending = first.init(document.createElement('div'), vi.fn());
    const secondPending = second.init(document.createElement('div'), vi.fn());
    first.destroy();
    b.resolve();
    await secondPending;
    a.resolve();
    await firstPending;
    expect(first.isReady()).toBe(false);
    expect(second.isReady()).toBe(true);
    expect(b.scorer.isReady()).toBe(true);
    expect(tracked.apps).toHaveLength(1);
    second.destroy();
    expect(tracked.apps[0]!.destroyed).toBe(true);
  });

  it('publishes only after ready and uses the latest props received during preparation', async () => {
    const owner = deferredOwner();
    tracked.nextOwners.push(owner.scorer);
    const handler = vi.fn();
    const mounted = render(
      createElement(MapCanvasHost, { onMapEvent: handler, viewState: view(1) }),
    );
    await waitFor(() => expect(owner.initialize).toHaveBeenCalledTimes(1));
    mounted.rerender(createElement(MapCanvasHost, { onMapEvent: handler, viewState: view(7) }));
    expect(getDebugMapRenderer()).toBeNull();
    expect(tracked.apps).toHaveLength(0);
    await act(async () => {
      owner.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(getDebugMapRenderer()?.isReady()).toBe(true));
    expect(getDebugMapRenderer()!.getPublishedViewSnapshot().day).toBe(7);
    mounted.unmount();
    expect(getDebugMapRenderer()).toBeNull();
    expect(owner.scorer.isReady()).toBe(false);
  });

  it('routes active initialization failure through the existing ErrorBoundary without a canvas or fallback', async () => {
    const owner = deferredOwner();
    tracked.nextOwners.push(owner.scorer);
    const fatal = vi.fn<(info: FatalErrorInfo) => void>();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      createElement(ErrorBoundary, {
        onFatalError: fatal,
        children: createElement(MapCanvasHost, { onMapEvent: vi.fn() }),
      }),
    );
    await waitFor(() => expect(owner.initialize).toHaveBeenCalledTimes(1));
    await act(async () => {
      owner.reject(new Error('Geographic scorer fetch failed: 404'));
      await Promise.resolve();
    });
    await waitFor(() => expect(fatal).toHaveBeenCalledTimes(1));
    expect(fatal.mock.calls[0]![0].message).toContain('Geographic scorer fetch failed: 404');
    expect(tracked.apps).toHaveLength(0);
    expect(getDebugMapRenderer()).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
    expect(owner.scorer.isReady()).toBe(false);
  });

  it('ignores an old unmounted owner rejection after a replacement has published', async () => {
    const old = deferredOwner(),
      fresh = deferredOwner();
    tracked.nextOwners.push(old.scorer);
    const oldMount = render(createElement(MapCanvasHost, { onMapEvent: vi.fn() }));
    await waitFor(() => expect(old.initialize).toHaveBeenCalledTimes(1));
    oldMount.unmount();
    tracked.nextOwners.push(fresh.scorer);
    const fatal = vi.fn<(info: FatalErrorInfo) => void>();
    const current = render(
      createElement(ErrorBoundary, {
        onFatalError: fatal,
        children: createElement(MapCanvasHost, { onMapEvent: vi.fn(), viewState: view(9) }),
      }),
    );
    await waitFor(() => expect(fresh.initialize).toHaveBeenCalledTimes(1));
    await act(async () => {
      fresh.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(getDebugMapRenderer()?.isReady()).toBe(true));
    const registered = getDebugMapRenderer();
    await act(async () => {
      old.reject(new Error('late old owner failure'));
      await Promise.resolve();
    });
    expect(fatal).not.toHaveBeenCalled();
    expect(getDebugMapRenderer()).toBe(registered);
    expect(registered!.getPublishedViewSnapshot().day).toBe(9);
    expect(tracked.apps).toHaveLength(1);
    current.unmount();
  });
});
