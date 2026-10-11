import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import { buildMiniState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/mini';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import { validateState } from '../../src/core/state/invariants';
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
  render(<CastlePanel castleId={CASTLE_A1} initialTab="transport" />);
  fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: CASTLE_A2 } });
  return game;
}
function amount(label: string, value: number) {
  const input = screen.getByRole('spinbutton', { name: label });
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
}
it('queues gold-only transport from unchanged mini and settles actual source treasury on a normal day', () => {
  const game = setup();
  const gold = game.clans[CLAN_ALPHA]!.gold;
  amount(t('ui.hud.gold'), 123);
  const before = structuredClone(game);
  fireEvent.click(screen.getByTestId('transport-execute'));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 0,
      food: 0,
      gold: 123,
    },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold - 123);
  expect(Object.values(game.transports)[0]).toMatchObject({ gold: 123, food: 0, soldiers: 0 });
  expect(validateState(game)).toEqual([]);
});
it('preserves mixed cargo in actual pending native save and settles it once', () => {
  const game = setup();
  amount(t('ui.hud.gold'), 77);
  amount(t('ui.castle.food'), 100);
  amount(t('ui.castle.soldiers'), 100);
  fireEvent.click(screen.getByTestId('transport-execute'));
  const pending = getQueuedPlayerCommands(game);
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ gold: 77, food: 100, soldiers: 100 });
  const decoded = decodeSave(encodeSave(game, 0, [...pending]));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  expect(decoded.saveFile.pendingCommands).toEqual(pending);
  const originalGold = game.clans[CLAN_ALPHA]!.gold;
  act(() => {
    runOneDay();
  });
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(originalGold - 77);
  const originalSettled = encodeSave(game, 0);
  cleanup();
  resetBridgeForTests();
  setGame(decoded.saveFile.state);
  initializeBridgeSession(decoded.saveFile.state, decoded.saveFile.pendingCommands);
  act(() => {
    runOneDay();
  });
  expect(Object.values(decoded.saveFile.state.transports)[0]).toMatchObject({
    gold: 77,
    food: 100,
    soldiers: 100,
  });
  expect(getQueuedPlayerCommands(decoded.saveFile.state)).toEqual([]);
  expect(decoded.saveFile.state.clans[CLAN_ALPHA]!.gold).toBe(originalGold - 77);
  expect(encodeSave(decoded.saveFile.state, 0)).toBe(originalSettled);
  expect(validateState(decoded.saveFile.state)).toEqual([]);
});

function retainedClick() {
  const element = screen.getByTestId('transport-execute');
  const key = Object.keys(element).find((item) => item.startsWith('__reactProps$'));
  if (!key) throw new Error('Missing React event props');
  return (element as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}
it('rejects changed live funds and delegated sources through current central validation', () => {
  const game = setup();
  amount(t('ui.hud.gold'), 123);
  const click = retainedClick();
  game.clans[CLAN_ALPHA]!.gold = 100;
  act(click);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  act(() => {
    bumpTickSeq();
  });
  expect(screen.getByRole<HTMLInputElement>('slider', { name: t('ui.hud.gold') }).max).toBe('100');
  game.castles[CASTLE_A1]!.directControl = false;
  act(() => {
    bumpTickSeq();
  });
  amount(t('ui.hud.gold'), 50);
  expect(screen.getByTestId<HTMLButtonElement>('transport-execute').disabled).toBe(true);
  act(retainedClick());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});
it('invalidates old gold draft callbacks and queues the displayed fresh command only once', () => {
  const game = setup();
  amount(t('ui.hud.gold'), 123);
  const oldClick = retainedClick();
  amount(t('ui.hud.gold'), 77);
  act(oldClick);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const click = retainedClick();
  act(click);
  act(click);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(getQueuedPlayerCommands(game)[0]).toMatchObject({ gold: 77 });
});
