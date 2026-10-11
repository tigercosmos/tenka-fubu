import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});

import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { gameLoop } from '../../src/app/gameLoop';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';

function resize(width: number, height: number) {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, writable: true, value: width },
    innerHeight: { configurable: true, writable: true, value: height },
  });
  fireEvent(window, new Event('resize'));
}

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({ uiScale: 1.25 }) });
  window.history.replaceState({}, '', '/?skipTitle=1&speed=x5');
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  gameLoop.stop();
  window.history.replaceState({}, '', '/');
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  document.documentElement.style.removeProperty('--ui-scale');
  document.documentElement.style.removeProperty('font-size');
  vi.restoreAllMocks();
});

describe('App viewport ownership', () => {
  it('blocks initial undersized boot and debug advancement, then recovers paused without changing scale', async () => {
    resize(1279, 720);
    render(<App />);
    await waitFor(() => expect(store.getState().game).not.toBeNull());
    expect(screen.getByTestId('viewport-too-small')).toBeTruthy();
    expect(store.getState().session.viewportBlocked).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
    const before = JSON.stringify(store.getState().game);
    act(() => {
      gameLoop.resume();
      gameLoop.setSpeed('x5');
      gameLoop.stepDays(5);
      runOneDay();
    });
    expect(JSON.stringify(store.getState().game)).toBe(before);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');
    act(() => resize(1280, 720));
    expect(screen.queryByTestId('viewport-too-small')).toBeNull();
    expect(store.getState().session.viewportBlocked).toBe(false);
    expect(store.getState().session.speed).toBe('paused');
    expect(settingsStore.getState().settings.uiScale).toBe(1.25);
  });

  it('keeps a shared settings dialog mounted and preserves a manual pause through resize', async () => {
    render(<App />);
    await screen.findByTestId('screen-strategy');
    act(() => gameLoop.requestPause('user'));
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.menu') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.settings') }));
    const dialog = screen.getByRole('dialog', { name: t('ui.settings.title') });
    act(() => resize(1280, 719));
    expect(screen.getByTestId('viewport-too-small')).toBeTruthy();
    expect(dialog.isConnected).toBe(true);
    expect(dialog.closest('[inert]')).not.toBeNull();
    expect(store.getState().session.lastPauseReason).toBe('user');
    const modal = uiStore.getState().modal;
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(uiStore.getState().modal).toBe(modal);
    act(() => resize(1280, 720));
    expect(screen.getByRole('dialog', { name: t('ui.settings.title') })).toBe(dialog);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
    expect(settingsStore.getState().settings.uiScale).toBe(1.25);
  });
});
