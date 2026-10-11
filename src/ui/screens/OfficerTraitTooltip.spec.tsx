import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OfficerDetail } from './OfficerDetail';
import { buildTinyState, OFF_ALPHA_BUSHO, OFF_ALPHA_TAISHO } from '../../../tests/fixtures/tiny';
import type { TraitId } from '@core/state/ids';
import { resetGameStoreForTests, bumpTickSeq, setGame } from '@app/store';
import { initializeBridgeSession, getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { uiStore } from '../hooks/uiStore';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function fixture() {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.traits = [
    'trait.heitan',
    'trait.benzetsu',
    'trait.gunshin',
    'trait.chushin',
  ] as TraitId[];
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  render(<OfficerDetail officerId={OFF_ALPHA_BUSHO} onClose={() => {}} />);
  return game;
}

it('pointer hover explains the canonical modifier without issuing commands or changing game/RNG', () => {
  const game = fixture();
  const before = structuredClone(game);
  vi.useFakeTimers();
  const chip = screen.getByText('兵站上手');
  fireEvent.pointerEnter(chip);
  void act(() => vi.advanceTimersByTime(399));
  expect(screen.queryByRole('tooltip')).toBeNull();
  void act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('tooltip').textContent).toContain('兵糧消耗 ×0.8');
  fireEvent.pointerLeave(chip);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('native keyboard focus exposes unlock-only and immunity facts, then blur releases ownership', () => {
  fixture();
  const chip = screen.getByText('辯舌');
  void act(() => chip.focus());
  expect(document.activeElement).toBe(chip);
  expect(screen.getByRole('tooltip').textContent).toContain('挑撥');
  expect(screen.getByRole('tooltip').textContent).toContain('沒有被動數值加成');
  const loyal = screen.getByText('忠臣');
  void act(() => loyal.focus());
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip').textContent).toContain('不參與出奔與引拔判定');
  void act(() => loyal.blur());
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('removing a trait on a real revision and replacing the same-ID session remove old tooltip content/timers', () => {
  const game = fixture();
  vi.useFakeTimers();
  fireEvent.pointerEnter(screen.getByText('兵站上手'));
  void act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  void act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gunshin' as TraitId];
    bumpTickSeq();
  });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerEnter(screen.getByText('軍神'));
  const replacement = structuredClone(game);
  replacement.officers[OFF_ALPHA_BUSHO]!.traits = [];
  void act(() => setGame(replacement));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('switching officers with the same trait list releases visible and pending tooltip ownership', () => {
  const game = fixture();
  game.officers[OFF_ALPHA_TAISHO]!.traits = [...game.officers[OFF_ALPHA_BUSHO]!.traits];
  cleanup();
  const view = render(<OfficerDetail officerId={OFF_ALPHA_BUSHO} />);
  vi.useFakeTimers();
  fireEvent.pointerEnter(screen.getByText('兵站上手'));
  void act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  view.rerender(<OfficerDetail officerId={OFF_ALPHA_TAISHO} />);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerEnter(screen.getByText('軍神'));
  void act(() => vi.advanceTimersByTime(200));
  view.rerender(<OfficerDetail officerId={OFF_ALPHA_BUSHO} />);
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('same-ID game replacement retains trait facts but releases visible and pending tooltip ownership', () => {
  const game = fixture();
  vi.useFakeTimers();
  fireEvent.pointerEnter(screen.getByText('兵站上手'));
  void act(() => vi.advanceTimersByTime(400));
  expect(screen.getByRole('tooltip')).toBeTruthy();
  void act(() => setGame(structuredClone(game)));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.pointerEnter(screen.getByText('軍神'));
  void act(() => vi.advanceTimersByTime(200));
  void act(() => setGame(structuredClone(game)));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('ordinary mutable ticks preserve the chip and its open tooltip without rearming the delay', () => {
  const game = fixture();
  vi.useFakeTimers();
  const chip = screen.getByText('兵站上手');
  fireEvent.pointerEnter(chip);
  void act(() => vi.advanceTimersByTime(400));
  const tooltip = screen.getByRole('tooltip');
  void act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.loyalty -= 1;
    bumpTickSeq();
  });
  expect(screen.getByText('兵站上手')).toBe(chip);
  expect(screen.getByRole('tooltip')).toBe(tooltip);
});
