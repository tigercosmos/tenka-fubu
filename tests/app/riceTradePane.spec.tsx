import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA } from '../fixtures/tiny';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  dispatchCommand,
  initializeBridgeSession,
  resetBridgeForTests,
  getQueuedPlayerCommands,
  runOneDay,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import type { FacilityTypeId } from '../../src/core/state/ids';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import { castleFoodCap, garrisonFoodMonthly } from '../../src/core/domestic';
import { RiceTradePane } from '../../src/ui/screens/panels/RiceTradePane';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { OFF_ALPHA_LORD, CASTLE_B1 } from '../fixtures/tiny';
import { FACILITIES } from '../../src/core/facilities';
import { buildMiniState } from '../fixtures/mini';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function setup() {
  const game = buildTinyState();
  game.castles[CASTLE_A1]!.facilities = ['fac.ichi', 'fac.komedoiya'] as FacilityTypeId[];
  expect(validateState(game)).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  return game;
}
it('provides castle-local buying and selling without changing game or queue on render', () => {
  const game = setup();
  const before = structuredClone(game);
  expect(screen.getByRole('button', { name: t('cmd.rice.buy') })).toBeTruthy();
  expect(screen.getByRole('button', { name: t('cmd.rice.sell') })).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('queues real buy and sell once and settles actual prices and monthly volume on normal days', () => {
  const game = setup();
  const castle = game.castles[CASTLE_A1]!;
  const food = castle.food;
  const gold = game.clans[CLAN_ALPHA]!.gold;
  fireEvent.change(screen.getByRole('spinbutton', { name: t('ui.rice.amount') }), {
    target: { value: '101' },
  });
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold - Math.ceil(101 * BAL.riceBuyRate));
  expect(castle.riceTradedThisMonth).toBe(101);
  expect(castle.food).toBe(food + 101 - Math.floor(garrisonFoodMonthly(game, castle) / 30));
  const saleGold = game.clans[CLAN_ALPHA]!.gold;
  const saleFood = castle.food;
  const saleConsumption = Math.floor(castle.foodFrac + garrisonFoodMonthly(game, castle) / 30);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.sell') }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(saleGold + Math.floor(101 * BAL.riceSellRate));
  expect(castle.food).toBe(saleFood - 101 - saleConsumption);
  expect(castle.riceTradedThisMonth).toBe(202);
  expect(validateState(game)).toEqual([]);
});
it('rejects invalid amounts and inactive brokers without queue or game mutations', () => {
  const game = setup();
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.buy') }).disabled).toBe(
    true,
  );
  act(() => {
    game.castles[CASTLE_A1]!.facilities = ['fac.komedoiya'] as FacilityTypeId[];
    bumpTickSeq();
  });
  const before = structuredClone(game);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
  expect(screen.getByText(t('ui.rice.requiresBroker'))).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.sell') }).disabled).toBe(
    true,
  );
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
function retained(button: HTMLElement): () => void {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'))!;
  return (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}
it('shows remaining monthly allowance and actual resource rejection costs', () => {
  const game = setup();
  act(() => {
    game.castles[CASTLE_A1]!.riceTradedThisMonth = BAL.riceTradeCapMonthly - 1;
    game.castles[CASTLE_A1]!.food = 0;
    game.clans[CLAN_ALPHA]!.gold = 0;
    bumpTickSeq();
  });
  expect(validateState(game)).toEqual([]);
  expect(screen.getByText(t('ui.rice.remaining', { amount: 1 }))).toBeTruthy();
  const buy = screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.buy') });
  const sell = screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.sell') });
  expect(buy.disabled).toBe(true);
  expect(buy.title).toBe(t('cmd.reject.insufficientGold', { cost: Math.ceil(BAL.riceBuyRate) }));
  expect(sell.disabled).toBe(true);
  expect(sell.title).toBe(t('cmd.reject.insufficientFood', { cost: 1 }));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
  expect(buy.disabled).toBe(true);
  expect(buy.title).toBe(t('cmd.reject.invalidTarget'));
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('does not dispatch retained controls after native same-ID replacement or unmount', () => {
  const game = setup();
  const old = retained(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  const saved = decodeSave(encodeSave(game, 123));
  if (!saved.ok) throw new Error(saved.code);
  const replacement = saved.saveFile.state;
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  const before = structuredClone(replacement);
  act(old);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(replacement).toEqual(before);
  const fresh = retained(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  cleanup();
  act(fresh);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});
it('shows uncompensated overflow and pays the full purchase before capacity truncation', () => {
  const game = setup();
  const castle = game.castles[CASTLE_A1]!;
  act(() => {
    castle.food = castleFoodCap(castle);
    bumpTickSeq();
  });
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '101' } });
  expect(screen.getByText(t('ui.rice.overflow', { amount: 101 }))).toBeTruthy();
  const gold = game.clans[CLAN_ALPHA]!.gold;
  const cap = castleFoodCap(castle);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  act(() => {
    runOneDay();
  });
  expect(castle.food).toBe(cap - Math.floor(garrisonFoodMonthly(game, castle) / 30));
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold - Math.ceil(101 * BAL.riceBuyRate));
  expect(castle.riceTradedThisMonth).toBe(101);
  expect(validateState(game)).toEqual([]);
});
it('uses central player authority for actual corps delegation and foreign castles', () => {
  const game = setup();
  act(() => {
    expect(
      dispatchCommand({
        type: 'createCorps',
        clanId: CLAN_ALPHA,
        corpsLeaderId: OFF_ALPHA_LORD,
        castleIds: [CASTLE_A1],
        directive: 'hold',
        targetNodeId: null,
      }),
    ).toEqual({ ok: true });
  });
  act(() => {
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.buy') }).disabled).toBe(
    true,
  );
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.sell') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  cleanup();
  render(<RiceTradePane castleId={CASTLE_B1} />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.rice.buy') }).disabled).toBe(
    true,
  );
});
it('reaches trading through actual queued construction and settles a native saved pending trade once', () => {
  const game = buildMiniState();
  expect(game.castles[CASTLE_A1]!.facilities).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  for (const id of ['fac.ichi', 'fac.komedoiya'] as FacilityTypeId[]) {
    expect(
      dispatchCommand({
        type: 'buildFacility',
        clanId: CLAN_ALPHA,
        castleId: CASTLE_A1,
        facilityTypeId: id,
      }),
    ).toEqual({ ok: true });
    for (
      let days = 0;
      !game.castles[CASTLE_A1]!.facilities.includes(id) && days <= FACILITIES[id]!.buildDays;
      days++
    )
      runOneDay();
    expect(game.castles[CASTLE_A1]!.facilities).toContain(id);
    expect(validateState(game)).toEqual([]);
  }
  // Required notifications are outside this standalone panel journey; dismiss the UI
  // queue before entering the completed castle. No game facts are changed.
  uiStore.getState().actions.reset();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  const before = structuredClone(game);
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '101' } });
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  const decoded = decodeSave(encodeSave(game, 987, [...getQueuedPlayerCommands(game)]));
  if (!decoded.ok) throw new Error(decoded.code);
  const continuation = decoded.saveFile.state;
  act(() => {
    setGame(continuation);
    initializeBridgeSession(continuation, decoded.saveFile.pendingCommands);
  });
  const gold = continuation.clans[CLAN_ALPHA]!.gold;
  const volume = continuation.castles[CASTLE_A1]!.riceTradedThisMonth;
  act(() => {
    runOneDay();
  });
  expect(continuation.clans[CLAN_ALPHA]!.gold).toBe(gold - Math.ceil(101 * BAL.riceBuyRate));
  expect(continuation.castles[CASTLE_A1]!.riceTradedThisMonth).toBe(volume + 101);
  expect(getQueuedPlayerCommands(continuation)).toEqual([]);
  expect(validateState(continuation)).toEqual([]);
});
it('does not publish obsolete pending feedback when a real dispatch port settles the same game synchronously', () => {
  const game = setup();
  cleanup();
  render(
    <RiceTradePane
      castleId={CASTLE_A1}
      onCommand={(command) => {
        const result = dispatchCommand(command);
        runOneDay();
        return result;
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: t('cmd.rice.buy') }));
  expect(game.castles[CASTLE_A1]!.riceTradedThisMonth).toBe(1);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(screen.queryByText(t('ui.rice.pending'))).toBeNull();
  expect(validateState(game)).toEqual([]);
});
