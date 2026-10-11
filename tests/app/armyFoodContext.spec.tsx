import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Only the graphics backend is replaced; MainScreen and its real context controls remain mounted.
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses();
});

import { MainScreen } from '../../src/ui/screens/MainScreen';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { settingsStore } from '../../src/app/settings/runtime';
import { validateCommand } from '../../src/core/index';
import { validateState } from '../../src/core/state/invariants';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.getState().resetSettings();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.getState().resetSettings();
  vi.restoreAllMocks();
});

it('shows eleven actual remaining food days in MainScreen after a queued Heitan march and fourteen normal days', () => {
  // Controlled valid friendly corridor, configured only before dispatch; not a full campaign proof.
  const game = buildTinyState();
  game.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 30;
  game.castles[CASTLE_A1]!.food = 50;
  game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.heitan' as TraitId];
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [],
    soldiers: 101,
    food: 50,
    targetNodeId: CASTLE_A2,
  };
  expect(validateCommand(game, command)).toEqual({ ok: true });
  const beforeQueue = structuredClone(game);
  expect(dispatchCommand(command)).toEqual({ ok: true });
  expect(game).toEqual(beforeQueue);
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  render(<MainScreen />);
  for (let day = 0; day < 14; day += 1) {
    act(() => {
      const events = runOneDay();
      expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    });
    expect(validateState(game)).toEqual([]);
  }
  const army = Object.values(game.armies).find((entry) => entry.leaderId === OFF_ALPHA_BUSHO)!;
  expect(army).toBeDefined();
  expect(army.soldiers).toBe(101);
  expect(army.food).toBe(22);
  expect(army.status).toBe('marching');
  expect(game.time.day).toBe(beforeQueue.time.day + 14);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const beforePresentation = structuredClone(game);
  act(() => {
    store.getState().actions.select({ kind: 'army', id: army.id });
    uiStore.getState().actions.setSelection({ kind: 'army', id: army.id });
  });
  const contextFood = screen.getByText(
    (_, element) =>
      element?.tagName === 'P' &&
      element.textContent?.includes(t('ui.march.foodDays', { days: 11 })) === true,
  );
  expect(contextFood.textContent).toContain(t('ui.march.soldiers'));
  expect(contextFood.textContent).toContain('101');
  expect(contextFood.textContent).toContain(t('ui.march.target'));
  expect(contextFood.textContent).toContain(game.castles[CASTLE_A2]!.name);
  expect(screen.getByTestId('army-orders-control')).toBeTruthy();
  expect(game).toEqual(beforePresentation);
  expect(game.rng).toEqual(beforePresentation.rng);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});
