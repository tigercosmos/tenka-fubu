import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusViewport } from '../map/hudFocus';
const capture = vi.hoisted(() => ({
  viewport: undefined as FocusViewport | null | undefined,
  occlusions: undefined as readonly FocusViewport[] | undefined,
  calls: [] as unknown[][],
}));
vi.mock('../map/MapCanvasHost', async () => {
  const React = await import('react');
  return {
    MapCanvasHost: React.forwardRef(function Host(
      props: { focusViewport?: FocusViewport | null; screenOcclusions?: readonly FocusViewport[] },
      ref,
    ) {
      capture.viewport = props.focusViewport;
      capture.occlusions = props.screenOcclusions;
      React.useImperativeHandle(ref, () => ({
        focusNode: (...args: unknown[]) => capture.calls.push(args),
        panToWorld: (...args: unknown[]) => capture.calls.push(args),
        panByKeyboard: vi.fn(),
        zoomByKeyboard: vi.fn(),
      }));
      return <div data-testid="map-canvas-host" />;
    }),
  };
});
import { MainScreen } from './MainScreen';
import { MotionContext } from '../motion/MotionContext';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { buildTinyState, CASTLE_A1, CASTLE_B1 } from '../../../tests/fixtures/tiny';
import type { SiegeId } from '@core/state/ids';
import { uiStore } from '../hooks/uiStore';
import { ConfirmDialog } from '../components';

const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
function flushFrames() {
  act(() => {
    const batch = [...frames.values()];
    frames.clear();
    for (const callback of batch) callback(100);
  });
}
let contextTop = 600;
beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(buildTinyState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setScreen('main');
  capture.calls.length = 0;
  capture.viewport = undefined;
  capture.occlusions = undefined;
  frames.clear();
  contextTop = 600;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    let rect = [0, 0, 0, 0];
    if (this.dataset.testid === 'map-canvas-host') rect = [100, 50, 1280, 720];
    else if (this.tagName === 'HEADER' && this.parentElement?.dataset.testid === 'screen-strategy')
      rect = [110, 60, 1260, 72];
    else if (this.dataset.testid === 'layer-control') rect = [1100, 140, 200, 32];
    else if (this.tagName === 'NAV') rect = [110, 140, 96, 540];
    else if (
      this.getAttribute('aria-hidden') === 'false' &&
      this.parentElement?.dataset.testid === 'screen-strategy'
    )
      rect = [200, contextTop, 1170, 158];
    else if (this.dataset.testid === 'minimap') rect = [1100, 470, 264, 264];
    else if (this.dataset.testid === 'minimap-frame') rect = [1100, 470, 264, 264];
    else if (this.dataset.testid === 'siege-overlay') rect = [218, 184, 280, 220];
    else if (this.parentElement?.matches('section[aria-live="polite"]'))
      rect = [1000, 180, 350, 160];
    return new DOMRect(...(rect as [number, number, number, number]));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  return render(
    <MotionContext.Provider value>
      <MainScreen />
    </MotionContext.Provider>,
  );
}
describe('Main measured focus viewport (controlled DOM bounds, not native geometry)', () => {
  it('permits actual minimap navigation under the owned march target picker without commands', () => {
    uiStore.getState().actions.setMarchDraft({
      originCastleId: CASTLE_A1,
      leaderOfficerId: null,
      subOfficerIds: [],
      soldiers: 0,
      food: 0,
      targetNodeId: null,
      previewPath: null,
      previewDays: null,
      phase: 'pickTarget',
      errorKey: null,
    });
    uiStore.getState().actions.enqueueModal({ id: 'march', params: {}, pausesTime: false });
    const before = structuredClone(store.getState().game);
    const view = mount();
    fireEvent(
      view.getByTestId('minimap-frame'),
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 1232,
        clientY: 602,
      }),
    );
    flushFrames();
    expect(capture.calls).toEqual([[2048, 2048, { x: 118, y: 134, width: 770, height: 586 }]]);
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it.each(['picker-exit', 'owner-change', 'game-change', 'foreign-dialog'] as const)(
    'cancels pending picker navigation after %s',
    (change) => {
      const draft = {
        originCastleId: CASTLE_A1,
        leaderOfficerId: null,
        subOfficerIds: [],
        soldiers: 0,
        food: 0,
        targetNodeId: null,
        previewPath: null,
        previewDays: null,
        phase: 'pickTarget' as const,
        errorKey: null,
      };
      const parent = { id: 'march' as const, params: {}, pausesTime: false };
      uiStore.getState().actions.setMarchDraft(draft);
      uiStore.getState().actions.enqueueModal(parent);
      const view = mount();
      const navigate = () =>
        fireEvent(
          view.getByTestId('minimap-frame'),
          new MouseEvent('pointerdown', {
            bubbles: true,
            clientX: 1232,
            clientY: 602,
          }),
        );
      navigate();
      if (change === 'picker-exit')
        act(() => {
          uiStore.getState().actions.setMarchDraft({ ...draft, phase: 'compose' });
          uiStore.getState().actions.setMarchDraft(draft);
        });
      if (change === 'owner-change')
        act(() => {
          uiStore.setState({ modal: { ...parent } });
          uiStore.setState({ modal: parent });
        });
      if (change === 'game-change') act(() => setGame(buildTinyState()));
      if (change === 'foreign-dialog')
        render(
          <ConfirmDialog
            open
            title="Foreign picker owner"
            message="Blocking"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        );
      flushFrames();
      expect(capture.calls).toEqual([]);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      if (change === 'picker-exit' || change === 'owner-change') {
        navigate();
        flushFrames();
        expect(capture.calls).toHaveLength(1);
      }
    },
  );
  it('forwards individual HUD rectangles rather than broad focus bands, without navigation', () => {
    mount();
    expect(capture.occlusions).toEqual([
      { x: 10, y: 10, width: 1260, height: 72 },
      { x: 1000, y: 90, width: 200, height: 32 },
      { x: 10, y: 90, width: 96, height: 540 },
      { x: 1000, y: 420, width: 264, height: 264 },
      { x: 900, y: 130, width: 350, height: 160 },
    ]);
    const previous = capture.occlusions;
    fireEvent(window, new Event('resize'));
    flushFrames();
    expect(capture.occlusions).toBe(previous);
    expect(capture.calls).toEqual([]);
  });
  it('reserves the compact siege inspector as a left obstacle (controlled presentation fixture)', () => {
    const game = store.getState().game!;
    const siegeId = 'siege.layout' as SiegeId;
    game.sieges[siegeId] = {
      id: siegeId,
      castleId: CASTLE_B1,
      attackerClanId: game.meta.playerClanId,
      attackerArmyIds: [],
      mode: 'assault',
      startDay: 0,
      interrupted: false,
      betrayalUsed: false,
    };
    uiStore.getState().actions.setSelection({ kind: 'castle', id: CASTLE_B1 });
    const before = structuredClone(game);
    mount();
    expect(capture.viewport).toEqual({ x: 410, y: 134, width: 478, height: 404 });
    const inspector = document.querySelector<HTMLElement>('[data-testid="siege-overlay"]')!;
    expect(inspector.style.left).toBe('218px');
    expect(inspector.style.top).toBe('184px');
    expect(inspector.style.maxWidth).toBe('280px');
    expect(inspector.style.maxHeight).toBe('404px');
    contextTop = 550;
    fireEvent(window, new Event('resize'));
    flushFrames();
    expect(inspector.style.maxHeight).toBe('354px');
    expect(game).toEqual(before);
    expect(capture.calls).toEqual([]);
  });
  it('does not execute pending navigation beneath an actual shared dialog', () => {
    mount();
    fireEvent.keyDown(document.body, { key: 'Home' });
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(
      <ConfirmDialog
        open
        title="Foreign owner"
        message="Blocking navigation"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    flushFrames();
    expect(capture.calls).toEqual([]);
    expect(game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it('measures all visible HUD bands in canvas-local CSS pixels without panning', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    mount();
    expect(capture.viewport).toEqual({ x: 118, y: 134, width: 770, height: 586 });
    expect(capture.calls).toEqual([]);
    expect(game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it('explicit Home focus measures the newly opened context before navigation; resize alone does not focus', () => {
    mount();
    fireEvent.keyDown(document.body, { key: 'Home' });
    expect(capture.calls).toEqual([]);
    flushFrames();
    expect(capture.calls).toEqual([[CASTLE_A1, { x: 118, y: 134, width: 770, height: 404 }]]);
    capture.calls.length = 0;
    contextTop = 550;
    fireEvent(window, new Event('resize'));
    flushFrames();
    expect(capture.viewport).toEqual({ x: 118, y: 134, width: 770, height: 354 });
    expect(capture.calls).toEqual([]);
  });
  it('cancels pending explicit focus on unmount and never navigates a replacement game', () => {
    const view = mount();
    fireEvent.keyDown(document.body, { key: 'Home' });
    view.unmount();
    flushFrames();
    expect(capture.calls).toEqual([]);
    mount();
    fireEvent.keyDown(document.body, { key: 'Home' });
    act(() => {
      setGame(buildTinyState());
    });
    flushFrames();
    expect(capture.calls).toEqual([]);
  });
  it.each([
    ['matrix(1, 0, 0, 1, 0, 120)', 404],
    ['matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 120, 0, 1)', 404],
    ['matrix(1, 0, 0, 1, 0, invalid)', 524],
  ])('focuses against the context resting footprint with computed %s', (transform, height) => {
    const computedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = computedStyle(element, pseudo);
      if (element.matches('[data-testid="screen-strategy"] > div[aria-hidden="false"]'))
        style.transform = transform;
      return style;
    });
    contextTop = 720;
    mount();
    fireEvent.keyDown(document.body, { key: 'Home' });
    flushFrames();
    expect(capture.calls).toEqual([[CASTLE_A1, { x: 118, y: 134, width: 770, height }]]);
  });
});
