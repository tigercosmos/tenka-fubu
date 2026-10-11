import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MapHoverTooltip } from './MapHoverTooltip';
import { mapHoverLines, type MapHoverTarget } from './mapHoverContent';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { buildTinyState, CASTLE_A1, DIST_A1X, OFF_ALPHA_LORD } from '../../../tests/fixtures/tiny';
import { BAL } from '@core/balance';
import { applyMarch } from '@core/commands/march';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function target(): MapHoverTarget {
  return { game: buildTinyState(), kind: 'castle', id: CASTLE_A1, screenX: 20, screenY: 30 };
}

it('same entity follows coordinates and fresh facts without restarting its pending delay or visible ownership', () => {
  vi.useFakeTimers();
  const hover = target();
  const dismiss = vi.fn();
  const r = render(<MapHoverTooltip target={hover} onDismiss={dismiss} />);
  void act(() => vi.advanceTimersByTime(200));
  r.rerender(<MapHoverTooltip target={{ ...hover, screenX: 40 }} onDismiss={dismiss} />);
  void act(() => vi.advanceTimersByTime(50));
  expect(screen.getByRole('tooltip').style.left).toBe('56px');
  hover.game.castles[CASTLE_A1]!.food = 123;
  r.rerender(<MapHoverTooltip target={{ ...hover, screenX: 50 }} onDismiss={dismiss} />);
  expect(screen.getByRole('tooltip').textContent).toContain('糧123石');
  expect(dismiss).not.toHaveBeenCalled();
  r.rerender(<MapHoverTooltip target={null} onDismiss={dismiss} />);
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('replacement, missing entities and unmount cancel pending timers', () => {
  vi.useFakeTimers();
  const hover = target();
  const r = render(<MapHoverTooltip target={hover} onDismiss={() => {}} />);
  void act(() => vi.advanceTimersByTime(200));
  r.rerender(
    <MapHoverTooltip
      target={{ ...hover, game: structuredClone(hover.game) }}
      onDismiss={() => {}}
    />,
  );
  void act(() => vi.advanceTimersByTime(50));
  expect(screen.queryByRole('tooltip')).toBeNull();
  r.rerender(<MapHoverTooltip target={{ ...hover, id: 'missing' }} onDismiss={() => {}} />);
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  r.rerender(<MapHoverTooltip target={hover} onDismiss={() => {}} />);
  r.unmount();
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('shares actual generic tooltip ownership in both directions, including pending timers', () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const hover = target();
  const r = render(
    <>
      <MapHoverTooltip target={hover} onDismiss={dismiss} />
      <Tooltip content="generic">
        <button>trigger</button>
      </Tooltip>
    </>,
  );
  fireEvent.focus(screen.getByRole('button'));
  void act(() => vi.advanceTimersByTime(500));
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip').textContent).toBe('generic');
  expect(dismiss).toHaveBeenCalledTimes(1);
  r.rerender(
    <>
      <MapHoverTooltip target={{ ...hover, id: DIST_A1X, kind: 'district' }} onDismiss={dismiss} />
      <Tooltip content="generic">
        <button>trigger</button>
      </Tooltip>
    </>,
  );
  void act(() => vi.advanceTimersByTime(250));
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip').textContent).toContain(hover.game.districts[DIST_A1X]!.name);
});

it('formats detached public district steward and real army carried days, including zero troops', () => {
  const game = buildTinyState();
  game.districts[DIST_A1X]!.stewardId = OFF_ALPHA_LORD;
  applyMarch(
    game,
    {
      type: 'march',
      clanId: game.meta.playerClanId,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: DIST_A1X,
    },
    () => {},
  );
  const army = Object.values(game.armies)[0]!;
  army.soldiers = 101;
  army.food = 17;
  const before = structuredClone(game);
  const lines = mapHoverLines(game, 'army', army.id)!;
  expect(lines[1]).toContain(`${Math.floor(17 / Math.ceil(101 * BAL.fieldFoodPerSoldierDaily))}日`);
  expect(mapHoverLines(game, 'district', DIST_A1X)![1]).toContain(
    game.officers[OFF_ALPHA_LORD]!.name,
  );
  expect(game).toEqual(before);
  army.soldiers = 0;
  expect(mapHoverLines(game, 'army', army.id)![1]).toContain('0日');
  expect(mapHoverLines(game, 'castle', 'missing')).toBeNull();
});

it('clamps lower-right positioning against actual measured viewport bounds', () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 40,
    width: 100,
    height: 40,
    toJSON() {},
  });
  render(
    <MapHoverTooltip
      target={{ ...target(), screenX: window.innerWidth - 5, screenY: window.innerHeight - 5 }}
      onDismiss={() => {}}
    />,
  );
  void act(() => vi.advanceTimersByTime(250));
  expect(screen.getByRole('tooltip').style.left).toBe(`${window.innerWidth - 5 - 100 - 16}px`);
  expect(screen.getByRole('tooltip').style.top).toBe(`${window.innerHeight - 40 - 8}px`);
});

it('keeps the left/top inset and recomputes after a real resize event', () => {
  vi.useFakeTimers();
  let width = 100;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 40,
    width,
    height: 40,
    toJSON() {},
  }));
  const r = render(
    <MapHoverTooltip target={{ ...target(), screenX: -20, screenY: -20 }} onDismiss={() => {}} />,
  );
  void act(() => vi.advanceTimersByTime(250));
  expect(screen.getByRole('tooltip').style.left).toBe('8px');
  expect(screen.getByRole('tooltip').style.top).toBe('8px');
  r.rerender(
    <MapHoverTooltip
      target={{ ...target(), screenX: window.innerWidth - 5, screenY: 20 }}
      onDismiss={() => {}}
    />,
  );
  void act(() => vi.advanceTimersByTime(250));
  const before = screen.getByRole('tooltip').style.left;
  width = 180;
  void act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.getByRole('tooltip').style.left).toBe(`${window.innerWidth - 5 - 180 - 16}px`);
  expect(screen.getByRole('tooltip').style.left).not.toBe(before);
});
