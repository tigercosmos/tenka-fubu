import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const apps = vi.hoisted(() => []);
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(apps);
});

import { MainScreen } from './MainScreen';
import { MapRenderer } from '../map/MapRenderer';
import { resetGameStoreForTests, setGame, store, bumpTickSeq } from '@app/store';
import { initializeBridgeSession, getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { uiStore } from '../hooks/uiStore';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  DIST_A1X,
  OFF_ALPHA_LORD,
} from '../../../tests/fixtures/tiny';
import { validateCommand } from '@core/index';
import { applyCommands } from '@core/commands/queue';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function fixture(kind: 'castle' | 'district' | 'army') {
  const game = buildTinyState();
  if (kind === 'army') {
    const command = {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_B1,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    applyCommands(game, [{ seq: 1, issuedDay: game.time.day, command }], () => {});
  }
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  let renderer: MapRenderer | null = null;
  // The test explicitly restores the receiver with init.call(this, ...).
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const init = MapRenderer.prototype.init;
  const remember = (value: MapRenderer) => {
    renderer = value;
  };
  vi.spyOn(MapRenderer.prototype, 'init').mockImplementation(async function (
    this: MapRenderer,
    host,
    callback,
  ) {
    remember(this);
    await init.call(this, host, callback);
  });
  render(<MainScreen />);
  await waitFor(() => expect(renderer?.isReady()).toBe(true));
  const ready = renderer!;
  const pos = kind === 'district' ? game.districts[DIST_A1X]!.pos : game.castles[CASTLE_A1]!.pos;
  ready.setCameraPose(pos, 1);
  vi.useFakeTimers();
  const pointer = (type: string, x = 400, y = 300) =>
    ready.getApp()!.stage.emit(type, { global: { x, y }, pointerId: 1, button: 0 });
  return { game, ready, pointer };
}

it.each(['castle', 'district', 'army'] as const)(
  'real renderer hover shows a %s tooltip after250ms without commands or core writes',
  async (kind) => {
    const f = await fixture(kind);
    const before = structuredClone(f.game);
    void act(() => f.pointer('pointermove'));
    void act(() => vi.advanceTimersByTime(249));
    expect(screen.queryByRole('tooltip')).toBeNull();
    void act(() => vi.advanceTimersByTime(1));
    const text = screen.getByRole('tooltip').textContent;
    const name =
      kind === 'castle'
        ? f.game.castles[CASTLE_A1]!.name
        : kind === 'district'
          ? f.game.districts[DIST_A1X]!.name
          : f.game.officers[OFF_ALPHA_LORD]!.name;
    expect(text).toContain(name);
    expect(f.game).toEqual(before);
    expect(getQueuedPlayerCommands(f.game)).toEqual([]);
  },
);

it('same-target movement retains the delay, refreshes mutable values and clears on actual pointerdown/blur/leave', async () => {
  const f = await fixture('castle');
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(200));
  void act(() => f.pointer('pointermove', 402));
  void act(() => vi.advanceTimersByTime(50));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  void act(() => {
    f.game.castles[CASTLE_A1]!.food = 123;
    bumpTickSeq();
  });
  expect(screen.getByRole('tooltip').textContent).toContain('糧123石');
  void act(() => f.pointer('pointerdown'));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => f.pointer('pointerup'));
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(250));
  void act(() => window.dispatchEvent(new Event('blur')));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(250));
  void act(() => f.ready.getApp()!.canvas.dispatchEvent(new Event('pointerleave')));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('modal, march, viewport and replacement session invalidate hover without redisplaying old identity', async () => {
  const f = await fixture('castle');
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(250));
  void act(() =>
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false }),
  );
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => uiStore.getState().actions.closeModal());
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => f.pointer('pointermove'));
  void act(() =>
    uiStore.getState().actions.setMarchDraft({
      originCastleId: CASTLE_A1,
      leaderOfficerId: OFF_ALPHA_LORD,
      subOfficerIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: null,
      previewPath: null,
      previewDays: null,
      phase: 'pickTarget',
      errorKey: null,
    }),
  );
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => uiStore.getState().actions.setMarchDraft(null));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => f.pointer('pointermove'));
  void act(() => store.getState().actions.setViewportBlocked(true));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => store.getState().actions.setViewportBlocked(false));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => f.pointer('pointermove'));
  void act(() => setGame(structuredClone(f.game)));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('actual generic HUD tooltip takes ownership and the same map entity can be hovered afresh afterward', async () => {
  const f = await fixture('castle');
  const before = structuredClone(f.game);
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(250));
  expect(screen.getByTestId('map-hover-tooltip')).toBeTruthy();
  const gold = screen.getByText('金錢').closest('[tabindex]')!;
  fireEvent.focus(gold);
  expect(screen.queryByTestId('map-hover-tooltip')).toBeNull();
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  fireEvent.blur(gold);
  void act(() => f.pointer('pointermove'));
  void act(() => vi.advanceTimersByTime(249));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => vi.advanceTimersByTime(1));
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByTestId('map-hover-tooltip').textContent).toContain(
    f.game.castles[CASTLE_A1]!.name,
  );
  expect(f.game).toEqual(before);
  expect(getQueuedPlayerCommands(f.game)).toEqual([]);
});
