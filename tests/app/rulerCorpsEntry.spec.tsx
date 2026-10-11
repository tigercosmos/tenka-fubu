import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CorpsScreen } from '../../src/ui/screens/CorpsScreen';
import {
  buildTinyState,
  CASTLE_A1,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('includes the actual current ruler despite a controlled stored low rank, but not ordinary low-rank retainers', () => {
  const game = buildTinyState();
  // Controlled rank boundary, not an earned succession: the canonical ruler's stored
  // samurai-taisho rank remains valid for his existing castle office but is below karo.
  game.officers[OFF_ALPHA_LORD]!.rank = 'samurai-taisho';
  expect(validateState(game)).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  render(<CorpsScreen />);
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
  const select = screen.getByRole<HTMLSelectElement>('combobox', { name: t('ui.corps.leader') });
  expect([...select.options].map((option) => option.value)).toContain(OFF_ALPHA_LORD);
  expect([...select.options].map((option) => option.value)).not.toContain(OFF_ALPHA_BUSHO);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.change(select, { target: { value: OFF_ALPHA_LORD } });
  fireEvent.click(screen.getByRole('checkbox', { name: game.castles[CASTLE_A1]!.name }));
  fireEvent.click(screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(
    Object.values(game.corps).some(
      (corps) => corps.clanId === CLAN_ALPHA && corps.corpsLeaderId === OFF_ALPHA_LORD,
    ),
  ).toBe(true);
  expect(game.officers[OFF_ALPHA_LORD]!.rank).toBe('samurai-taisho');
  expect(validateState(game)).toEqual([]);
});
