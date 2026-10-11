import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Replace only the graphics backend; the actual MainScreen context remains mounted.
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

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
import { resetGameStoreForTests, setGame, store, bumpTickSeq } from '../../src/app/store';
import type { OfficerId } from '../../src/core/state/ids';
import { settingsStore } from '../../src/app/settings/runtime';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, CLAN_ALPHA, DIST_A1X, OFF_ALPHA_BUSHO } from '../fixtures/tiny';

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

function setup() {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  render(<MainScreen />);
  act(() => {
    uiStore.getState().actions.setSelection({ kind: 'district', id: DIST_A1X });
  });
  return game;
}

it('shows actual district public order, direct administration and current focus without simulation writes', () => {
  const game = setup();
  const before = structuredClone(game);
  expect(
    screen.getByRole('img', {
      name: `${t('ui.district.security')} ${game.districts[DIST_A1X]!.publicOrder}`,
    }),
  ).toBeTruthy();
  const context = within(screen.getByTestId('district-context-facts'));
  expect(context.getByText(t('ui.district.direct'))).toBeTruthy();
  expect(context.getByText(t('term.devPolicy.agri'))).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('refreshes actual focus and steward after legally queued commands settle on normal days', () => {
  const game = setup();
  const focus = {
    type: 'setDevelopFocus' as const,
    clanId: CLAN_ALPHA,
    districtId: DIST_A1X,
    focus: 'commerce' as const,
  };
  const before = structuredClone(game);
  act(() => {
    expect(dispatchCommand(focus)).toEqual({ ok: true });
  });
  expect(game).toEqual(before);
  expect(
    within(screen.getByTestId('district-context-facts')).getByText(t('term.devPolicy.agri')),
  ).toBeTruthy();
  act(() => {
    expect(runOneDay().filter((event) => event.type === 'command.rejected')).toEqual([]);
  });
  expect(game.districts[DIST_A1X]!.developFocus).toBe('commerce');
  expect(
    within(screen.getByTestId('district-context-facts')).getByText(t('term.devPolicy.commerce')),
  ).toBeTruthy();
  act(() => {
    expect(
      dispatchCommand({
        type: 'grantFief',
        clanId: CLAN_ALPHA,
        districtId: DIST_A1X,
        officerId: OFF_ALPHA_BUSHO,
      }),
    ).toEqual({ ok: true });
  });
  act(() => {
    expect(runOneDay().filter((event) => event.type === 'command.rejected')).toEqual([]);
  });
  expect(game.districts[DIST_A1X]!.stewardId).toBe(OFF_ALPHA_BUSHO);
  expect(
    within(screen.getByTestId('district-context-facts')).getByText(
      game.officers[OFF_ALPHA_BUSHO]!.name,
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('img', {
      name: `${t('ui.district.security')} ${game.districts[DIST_A1X]!.publicOrder}`,
    }),
  ).toBeTruthy();
  expect(validateState(game)).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const presented = structuredClone(game);
  act(() => {
    bumpTickSeq();
  });
  expect(game).toEqual(presented);
});

it('reads fresh same-ID native replacement facts and keeps presentation state and RNG pure', () => {
  const game = setup();
  const replacement = buildTinyState();
  replacement.districts[DIST_A1X]!.publicOrder = 29;
  replacement.districts[DIST_A1X]!.developFocus = 'barracks';
  expect(validateState(replacement)).toEqual([]);
  const decoded = decodeSave(encodeSave(replacement, 123));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const loaded = decoded.saveFile.state;
  expect(loaded.meta.scenarioId).toBe(game.meta.scenarioId);
  expect(loaded.meta.seed).toBe(game.meta.seed);
  const before = structuredClone(loaded);
  act(() => {
    setGame(loaded);
    initializeBridgeSession(loaded);
  });
  expect(screen.getByRole('img', { name: `${t('ui.district.security')} 29` })).toBeTruthy();
  expect(
    within(screen.getByTestId('district-context-facts')).getByText(t('term.devPolicy.barracks')),
  ).toBeTruthy();
  expect(loaded).toEqual(before);
  expect(loaded.rng).toEqual(before.rng);
  expect(getQueuedPlayerCommands(loaded)).toEqual([]);
  expect(validateState(loaded)).toEqual([]);
});

it('uses the stored officer ID instead of inventing a name for a missing steward reference', () => {
  const game = setup();
  // Defensive malformed-reference display only, not a valid gameplay or save fixture.
  const missing = 'off.missing-steward' as OfficerId;
  game.districts[DIST_A1X]!.stewardId = missing;
  const before = structuredClone(game);
  act(() => {
    bumpTickSeq();
  });
  expect(within(screen.getByTestId('district-context-facts')).getByText(missing)).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
