import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import {
  buildMiniState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B2,
  CLAN_ALPHA,
  OFF_ALPHA_TAISHO_A,
} from '../fixtures/mini';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function setup() {
  const game = buildMiniState();
  expect(validateState(game)).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  render(<CastlePanel castleId={CASTLE_A2} />);
  return game;
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: '罷免城主' }));
  return screen.getByRole('dialog');
}
function confirm() {
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
  );
}
function retained(element: HTMLElement): () => void {
  const key = Object.keys(element).find((item) => item.startsWith('__reactProps$'))!;
  return (element as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}
it('warns about the actual castle lord before queuing and cancels without core effects', () => {
  const game = setup();
  const before = structuredClone(game);
  const dialog = open();
  expect(dialog.textContent).toContain(game.officers[OFF_ALPHA_TAISHO_A]!.name);
  expect(dialog.textContent).toContain(String(BAL.loyaltyDismiss));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: t('ui.common.cancel') }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('queues actual nonleader dismissal once and settles loyalty only on the normal day', () => {
  const game = setup();
  const loyalty = game.officers[OFF_ALPHA_TAISHO_A]!.loyalty;
  const before = structuredClone(game);
  open();
  const click = retained(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
  );
  act(click);
  act(click);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'appointLord', clanId: CLAN_ALPHA, castleId: CASTLE_A2, officerId: null },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.castles[CASTLE_A2]!.lordId).toBeNull();
  expect(game.officers[OFF_ALPHA_TAISHO_A]!.loyalty).toBe(loyalty - BAL.loyaltyDismiss);
  expect(validateState(game)).toEqual([]);
});
it('persists a genuine pending dismissal and settles decoded commands once', () => {
  const game = setup();
  open();
  confirm();
  const pending = getQueuedPlayerCommands(game);
  const saved = decodeSave(encodeSave(game, 123, [...pending]));
  if (!saved.ok) throw new Error(saved.code);
  expect(saved.saveFile.pendingCommands).toEqual(pending);
  act(() => {
    runOneDay();
  });
  const expected = encodeSave(game, 123);
  cleanup();
  resetBridgeForTests();
  setGame(saved.saveFile.state);
  initializeBridgeSession(saved.saveFile.state, saved.saveFile.pendingCommands);
  act(() => {
    runOneDay();
  });
  expect(encodeSave(saved.saveFile.state, 123)).toEqual(expected);
  expect(getQueuedPlayerCommands(saved.saveFile.state)).toEqual([]);
  expect(validateState(saved.saveFile.state)).toEqual([]);
});
it('does not apply an old confirmation after the actual lord changes', () => {
  const game = setup();
  open();
  const click = retained(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
  );
  // Controlled prerequisite change is not an earned appointment journey.
  game.castles[CASTLE_A2]!.lordId = null;
  const before = structuredClone(game);
  act(click);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('does not let a removed confirmation dispatch after same-ID native replacement or unmount', () => {
  const game = setup();
  open();
  const click = retained(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
  );
  const saved = decodeSave(encodeSave(game, 123));
  if (!saved.ok) throw new Error(saved.code);
  act(() => {
    setGame(saved.saveFile.state);
    initializeBridgeSession(saved.saveFile.state);
  });
  const before = structuredClone(saved.saveFile.state);
  act(click);
  cleanup();
  act(click);
  expect(saved.saveFile.state).toEqual(before);
  expect(getQueuedPlayerCommands(saved.saveFile.state)).toEqual([]);
});
it('keeps a dismissed current clan leader at loyalty100', () => {
  const game = setup();
  cleanup();
  render(<CastlePanel castleId={CASTLE_A1} />);
  open();
  confirm();
  act(() => {
    runOneDay();
  });
  expect(game.castles[CASTLE_A1]!.lordId).toBeNull();
  expect(game.officers[game.clans[CLAN_ALPHA]!.leaderId]!.loyalty).toBe(100);
  expect(validateState(game)).toEqual([]);
});
it('does not offer player dismissal of a foreign lord', () => {
  const game = setup();
  cleanup();
  render(<CastlePanel castleId={CASTLE_B2} />);
  const before = structuredClone(game);
  const dismiss = screen.getByRole<HTMLButtonElement>('button', { name: '罷免城主' });
  expect(dismiss.disabled).toBe(true);
  fireEvent.click(dismiss);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('does not reuse removed FIFO consent when the same descriptor reappears', () => {
  const game = setup();
  open();
  const modal = uiStore.getState().modal!;
  const click = retained(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
  );
  act(() => uiStore.setState({ modal: null }));
  act(() => uiStore.setState({ modal }));
  const before = structuredClone(game);
  act(click);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
