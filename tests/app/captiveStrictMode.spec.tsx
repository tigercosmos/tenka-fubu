import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { captiveRecruitSuccessRate, officerAbilityScore } from '../../src/core/index';
import { createRngStream } from '../../src/core/rng';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, CASTLE_A1, OFF_BETA_BUSHO } from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it.each(['release', 'recruit'] as const)(
  'allows a fresh legal %s after the actual StrictMode mount replay',
  (action) => {
    resetBridgeForTests();
    uiStore.getState().actions.reset();
    const game = buildTinyState();
    // Valid controlled initial captive metadata, not an actual capture-event
    // campaign. No subject or owner changes are injected after React mounts.
    const captive = game.officers[OFF_BETA_BUSHO]!;
    captive.status = 'captive';
    captive.capturedByClanId = game.meta.playerClanId;
    captive.locationCastleId = CASTLE_A1;
    expect(validateState(game)).toEqual([]);
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.enqueueModal({
      id: 'captive',
      params: { officerId: OFF_BETA_BUSHO },
      pausesTime: true,
    });
    render(
      <StrictMode>
        <CaptiveModal officerId={OFF_BETA_BUSHO} />
      </StrictMode>,
    );
    const before = structuredClone(game);
    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: t(`cmd.captive.${action}`),
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_BUSHO]);
    expect(uiStore.getState().modal).toBeNull();
    fireEvent.click(button);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    const success = createRngStream(structuredClone(game.rng), 'misc').chance(
      captiveRecruitSuccessRate(game, OFF_BETA_BUSHO, null, game.meta.playerClanId),
    );
    const signing = officerAbilityScore(captive) * BAL.recruitSigningBonusPerAbility;
    act(() => {
      runOneDay();
    });
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(captive.status).toBe(action === 'release' || success ? 'serving' : 'captive');
    expect(game.clans[game.meta.playerClanId]!.gold).toBe(
      before.clans[game.meta.playerClanId]!.gold - (action === 'recruit' && success ? signing : 0),
    );
    expect(validateState(game)).toEqual([]);
  },
);

it('opens fresh cancel-first execution consent under StrictMode and settles only once', async () => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  const game = buildTinyState();
  const captive = game.officers[OFF_BETA_BUSHO]!;
  // The same valid controlled captive prerequisite as the release/recruit cases.
  captive.status = 'captive';
  captive.capturedByClanId = game.meta.playerClanId;
  captive.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: OFF_BETA_BUSHO },
    pausesTime: true,
  });
  render(
    <StrictMode>
      <CaptiveModal officerId={OFF_BETA_BUSHO} />
    </StrictMode>,
  );
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
  const dialog = screen.getAllByRole('dialog').at(-1)!;
  const cancel = within(dialog).getByRole('button', { name: t('ui.common.cancel') });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const confirm = within(dialog).getByRole('button', { name: t('ui.common.confirm') });
  fireEvent.click(confirm);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_BUSHO]);
  expect(uiStore.getState().modal).toBeNull();
  fireEvent.click(confirm);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(captive.status).toBe('dead');
  expect(validateState(game)).toEqual([]);
});
