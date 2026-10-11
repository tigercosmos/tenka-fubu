import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
  getQueuedPlayerCommands,
  dispatchCommand,
} from '@app/bridge';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '@app/store';
import { BAL } from '@core/balance';
import type { TraitId } from '@core/state/ids';
import { validateState } from '@core/state/invariants';
import { uiStore } from '../hooks/uiStore';
import { DiploWork } from './DiplomacyPanel';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../../../tests/fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});

it('names the actual busy envoy after another queued mission settles', () => {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  act(() => {
    expect(
      dispatchCommand({
        type: 'startDiploWork',
        clanId: CLAN_ALPHA,
        target: 'court',
        executorId: OFF_ALPHA_BUSHO,
      }),
    ).toEqual({ ok: true });
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  render(<DiploWork target={CLAN_BETA} />);
  const before = structuredClone(game);
  fireEvent.change(screen.getByRole('combobox', { name: '執行武將' }), {
    target: { value: OFF_ALPHA_BUSHO },
  });
  const button = screen.getByRole('button', { name: '開始工作' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.title).toBe(`${game.officers[OFF_ALPHA_BUSHO]!.name}正在執行其他任務`);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('previews the selected executor, then the actual mission executor on live ticks and replacement', () => {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.chotei' as TraitId];
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  render(<DiploWork target="court" />);
  const cost = Math.round(BAL.courtWorkMonthlyCost * (1 - BAL.traitChotei));
  expect(screen.getByText(`每月費用 ${BAL.courtWorkMonthlyCost}貫`)).not.toBeNull();
  const before = structuredClone(game);
  fireEvent.change(screen.getByRole('combobox', { name: '執行武將' }), {
    target: { value: OFF_ALPHA_BUSHO },
  });
  expect(screen.getByText(`每月費用 ${cost}貫`)).not.toBeNull();
  expect(game).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: '開始工作' }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.missions).toMatchObject([
    { fromClanId: CLAN_ALPHA, target: 'court', officerId: OFF_ALPHA_BUSHO },
  ]);
  expect(screen.getByText(`每月費用 ${cost}貫`)).not.toBeNull();
  expect(validateState(game)).toEqual([]);
  // Controlled presentation refresh: selector must observe the same mutable game on a new tick.
  game.officers[OFF_ALPHA_BUSHO]!.traits = [];
  act(() => {
    bumpTickSeq();
  });
  expect(screen.getByText(`每月費用 ${BAL.courtWorkMonthlyCost}貫`)).not.toBeNull();
  const replacement = buildTinyState();
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  expect(screen.getByText(`每月費用 ${BAL.courtWorkMonthlyCost}貫`)).not.toBeNull();
  expect(replacement.diplomacy.missions).toEqual([]);
});

it('never attributes the executor trait to shogunate or clan work', () => {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_TAISHO]!.traits = ['trait.chotei' as TraitId];
  resetGameStoreForTests(game);
  render(<DiploWork target="shogunate" />);
  fireEvent.change(screen.getByRole('combobox', { name: '執行武將' }), {
    target: { value: OFF_ALPHA_TAISHO },
  });
  expect(screen.getByText(`每月費用 ${BAL.shogunateWorkMonthlyCost}貫`)).not.toBeNull();
});
