import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { buildTinyState, OFF_ALPHA_BUSHO } from '../../../tests/fixtures/tiny';
import { t } from '@i18n/zh-TW';
import { uiStore } from '../hooks/uiStore';
import { CorpsScreen } from './CorpsScreen';

beforeEach(() => {
  resetBridgeForTests();
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
  for (const castle of Object.values(game.castles))
    if (castle.ownerClanId === game.meta.playerClanId) castle.directControl = true;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

it('uses an accessible form and explains the canonical empty-castle rejection', () => {
  render(<CorpsScreen />);
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
  expect(screen.getByRole('combobox', { name: t('ui.corps.leader') })).toBeTruthy();
  expect(screen.getByRole('radio', { name: t('ui.corps.hold') })).toBeTruthy();
  const submit = screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!;
  expect(submit.hasAttribute('disabled')).toBe(true);
  expect(submit.getAttribute('aria-describedby')).toBeTruthy();
  expect(submit.title).toBe(t('cmd.reject.invalidTarget'));
});

it('queues creation through the bridge without mutating core or releasing manual pause', () => {
  store.getState().actions.requestPause('user');
  render(<CorpsScreen />);
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  const submit = screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!;
  expect(submit.hasAttribute('disabled')).toBe(false);
  fireEvent.click(submit);
  expect(Object.keys(store.getState().game!.corps)).toHaveLength(0);
  expect(store.getState().session.pendingCommandCount).toBe(1);
  expect(store.getState().session.speed).toBe('paused');
});
