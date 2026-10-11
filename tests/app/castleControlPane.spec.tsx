import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import { buildMiniState } from '../fixtures/mini';
import { CASTLE_A1, CASTLE_A2, CASTLE_B1, CLAN_ALPHA } from '../fixtures/tiny';
import { OFF_ALPHA_LORD } from '../fixtures/mini';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameState } from '../../src/core/state/gameState';
import { t } from '../../src/i18n/zh-TW';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function setup(game = buildMiniState()) {
  expect(validateState(game)).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  return game;
}
function button(name: string) {
  return screen.getByRole<HTMLButtonElement>('button', { name });
}
function retained(element: HTMLElement): () => void {
  const key = Object.keys(element).find((item) => item.startsWith('__reactProps$'))!;
  return (element as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}
function loyalties(game: GameState) {
  return Object.fromEntries(Object.values(game.officers).map((o) => [o.id, o.loyalty]));
}
function normalDay() {
  act(() => {
    runOneDay();
  });
}
it('provides current control mode without changing the unchanged mini or queue on render', () => {
  const game = setup();
  const before = structuredClone(game);
  render(<CastlePanel castleId={CASTLE_A1} />);
  expect(button('大名直轄').getAttribute('aria-pressed')).toBe('true');
  expect(button('大名直轄').disabled).toBe(true);
  expect(button('委任城主').disabled).toBe(false);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('delegates and restores through actual queued player commands on normal days', () => {
  const game = setup();
  const twin = structuredClone(game);
  render(<CastlePanel castleId={CASTLE_A1} />);
  const old = retained(button('委任城主'));
  const before = structuredClone(game);
  fireEvent.click(button('委任城主'));
  act(old);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'setCastleControl', clanId: CLAN_ALPHA, castleId: CASTLE_A1, directControl: false },
  ]);
  normalDay();
  expect(game.castles[CASTLE_A1]!.directControl).toBe(false);
  expect(button('委任城主').getAttribute('aria-pressed')).toBe('true');
  expect(button('大名直轄').disabled).toBe(false);
  // Normal-day loyalty changes belong to the officer pipeline, not to this command.
  cleanup();
  setup(twin);
  normalDay();
  expect(loyalties(game)).toEqual(loyalties(twin));
  setup(game);
  render(<CastlePanel castleId={CASTLE_A1} />);
  fireEvent.click(button('大名直轄'));
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'setCastleControl', clanId: CLAN_ALPHA, castleId: CASTLE_A1, directControl: true },
  ]);
  normalDay();
  expect(game.castles[CASTLE_A1]!.directControl).toBe(true);
  expect(validateState(game)).toEqual([]);
});
it('saves a genuine pending delegation and settles it once after fresh native continuation', () => {
  const game = setup();
  render(<CastlePanel castleId={CASTLE_A1} />);
  fireEvent.click(button('委任城主'));
  const pending = getQueuedPlayerCommands(game);
  const saved = decodeSave(encodeSave(game, 123, [...pending]));
  if (!saved.ok) throw new Error(saved.code);
  expect(saved.saveFile.pendingCommands).toEqual(pending);
  normalDay();
  const expected = structuredClone(game);
  cleanup();
  resetBridgeForTests();
  const resumed = setup(saved.saveFile.state);
  initializeBridgeSession(resumed, saved.saveFile.pendingCommands);
  render(<CastlePanel castleId={CASTLE_A1} />);
  expect(button('委任城主').disabled).toBe(true);
  normalDay();
  expect(resumed).toEqual(expected);
  expect(getQueuedPlayerCommands(resumed)).toEqual([]);
  expect(validateState(resumed)).toEqual([]);
});
it('rejects a lordless castle and a foreign castle without dispatch or mutations', () => {
  const game = setup();
  // A controlled lordless state exercises the explicit delegation prerequisite.
  game.castles[CASTLE_A1]!.lordId = null;
  expect(validateState(game)).toEqual([]);
  render(<CastlePanel castleId={CASTLE_A1} />);
  expect(button('委任城主').disabled).toBe(true);
  const before = structuredClone(game);
  fireEvent.click(button('委任城主'));
  expect(game).toEqual(before);
  cleanup();
  render(<CastlePanel castleId={CASTLE_B1} />);
  expect(button('委任城主').disabled).toBe(true);
  fireEvent.click(button('委任城主'));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('rejects retained controls after native same-ID replacement and unmount', () => {
  const game = setup();
  render(<CastlePanel castleId={CASTLE_A1} />);
  const old = retained(button('委任城主'));
  const saved = decodeSave(encodeSave(game, 123));
  if (!saved.ok) throw new Error(saved.code);
  const replacement = saved.saveFile.state;
  act(() => {
    setup(replacement);
  });
  const before = structuredClone(replacement);
  act(old);
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  const fresh = retained(button('委任城主'));
  cleanup();
  act(fresh);
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});
it('revalidates authority when castle ownership changes after render', () => {
  const game = setup();
  render(<CastlePanel castleId={CASTLE_A1} />);
  const old = retained(button('委任城主'));
  game.castles[CASTLE_A1]!.ownerClanId = game.castles[CASTLE_B1]!.ownerClanId;
  const before = structuredClone(game);
  act(old);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  act(() => bumpTickSeq());
  expect(button('委任城主').disabled).toBe(true);
});
it('does not change corps administration through the ordinary castle toggle', () => {
  const game = setup();
  expect(
    dispatchCommand({
      type: 'createCorps',
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      castleIds: [CASTLE_A2],
      directive: 'hold',
      targetNodeId: null,
    }),
  ).toEqual({ ok: true });
  normalDay();
  expect(game.castles[CASTLE_A2]!.corpsId).not.toBeNull();
  expect(validateState(game)).toEqual([]);
  render(<CastlePanel castleId={CASTLE_A2} />);
  expect(button('大名直轄').disabled).toBe(true);
  expect(button('委任城主').disabled).toBe(true);
  const before = structuredClone(game);
  fireEvent.click(button('大名直轄'));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('makes delegated conscription read-only and reenables it after real restoration', () => {
  const game = setup();
  render(<CastlePanel castleId={CASTLE_A1} />);
  fireEvent.click(button('委任城主'));
  normalDay();
  fireEvent.click(screen.getByRole('tab', { name: t('ui.castle.tab.domestic') }));
  for (const radio of screen.getAllByRole<HTMLInputElement>('radio')) {
    expect(radio.disabled).toBe(true);
    fireEvent.click(radio);
  }
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(screen.getByRole('tab', { name: t('ui.castle.tab.overview') }));
  fireEvent.click(button('大名直轄'));
  normalDay();
  fireEvent.click(screen.getByRole('tab', { name: t('ui.castle.tab.domestic') }));
  for (const radio of screen.getAllByRole<HTMLInputElement>('radio'))
    expect(radio.disabled).toBe(false);
  expect(validateState(game)).toEqual([]);
});
it('does not let synchronous day settlement leave obsolete pending feedback', () => {
  const game = setup();
  render(
    <CastlePanel
      castleId={CASTLE_A1}
      onCommand={(cmd) => {
        const result = dispatchCommand(cmd);
        runOneDay();
        return result;
      }}
    />,
  );
  fireEvent.click(button('委任城主'));
  expect(game.castles[CASTLE_A1]!.directControl).toBe(false);
  expect(screen.queryByText('管理方式指令待下一日執行')).toBeNull();
  fireEvent.click(button('大名直轄'));
  expect(game.castles[CASTLE_A1]!.directControl).toBe(true);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});
it('rejects retained actions behind modal, viewport, non-main screen and removed panel', () => {
  const game = setup();
  uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
  render(<CastlePanel castleId={CASTLE_A1} />);
  const old = retained(button('委任城主'));
  const before = structuredClone(game);
  act(() => uiStore.setState({ modal: { id: 'confirm', params: {}, pausesTime: false } }));
  act(old);
  act(() => uiStore.setState({ modal: null }));
  act(() => store.setState((state) => ({ session: { ...state.session, viewportBlocked: true } })));
  act(old);
  act(() => store.setState((state) => ({ session: { ...state.session, viewportBlocked: false } })));
  act(() => store.getState().actions.setScreen('title'));
  act(old);
  act(() => store.getState().actions.setScreen('main'));
  const panel = uiStore.getState().panelStack[0]!;
  act(() => uiStore.setState({ panelStack: [] }));
  act(() => uiStore.setState({ panelStack: [panel] }));
  act(old);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('retains legal conscription even with a controlled empty garrison', () => {
  const game = setup();
  game.castles[CASTLE_A1]!.soldiers = 0;
  expect(validateState(game)).toEqual([]);
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  fireEvent.click(screen.getByRole('radio', { name: t('term.conscript.high') }));
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'setConscriptPolicy', clanId: CLAN_ALPHA, castleId: CASTLE_A1, policy: 'high' },
  ]);
});
