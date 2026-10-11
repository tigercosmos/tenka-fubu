import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBridgeProgressMark, resetBridgeForTests } from '@app/bridge';
import { bumpTickSeq, resetGameStoreForTests as resetStore, store } from '@app/store';
import type { GameState } from '@core/state/gameState';
import type { CastleId, MapNodeId, RoadEdgeId, ClanId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE } from '../../../../tests/helpers/loopState';
import { CastlePanel } from './CastlePanel';
import type { TransportId } from '@core/state/ids';

const DEST = 'castle.destination' as CastleId;
const ISOLATED = 'castle.isolated' as CastleId;
const ORDER = 'transport.000001' as TransportId;
beforeEach(() => resetBridgeForTests());
function resetGameStoreForTests(game: GameState) {
  resetStore(game);
  store.getState().actions.setScreen('main');
}
function fixture() {
  const game = makeLoopTestState({ food: 500 });
  const source = game.castles[TEST_CASTLE]!;
  source.name = '起點';
  source.soldiers = 400;
  source.directControl = true;
  game.castles[DEST] = { ...structuredClone(source), id: DEST, name: '終點', pos: { x: 10, y: 0 } };
  game.castles[ISOLATED] = {
    ...structuredClone(source),
    id: ISOLATED,
    name: '不連通城',
    pos: { x: 50, y: 0 },
  };
  const id = 'road.transport' as RoadEdgeId;
  game.roads[id] = {
    id,
    a: TEST_CASTLE,
    b: DEST,
    grade: 1,
    baseDays: 2,
    type: 'land',
  };
  const enemy = 'castle.enemy' as CastleId;
  game.castles[enemy] = {
    ...structuredClone(source),
    id: enemy,
    ownerClanId: 'clan.enemy' as ClanId,
    pos: { x: 30, y: 0 },
  };
  for (const [index, a, b] of [
    [1, DEST, enemy],
    [2, enemy, ISOLATED],
  ] as const) {
    const edgeId = `road.extra.${index}` as RoadEdgeId;
    game.roads[edgeId] = {
      id: edgeId,
      a: a,
      b: b,
      grade: 1,
      baseDays: 2,
      type: 'land',
    };
  }
  return game;
}
describe('Castle transport form', () => {
  it('shows detached source-associated cargo/status and queues validated recall without immediate core effects', () => {
    const game = fixture();
    game.transports[ORDER] = {
      id: ORDER,
      clanId: game.meta.playerClanId,
      fromCastleId: TEST_CASTLE,
      toCastleId: DEST,
      soldiers: 100,
      food: 200,
      gold: 0,
      path: [TEST_CASTLE, DEST],
      pathCursor: 0,
      edgeProgressDays: 1,
      edgeCostDays: 2,
      returning: false,
    };
    const other = 'transport.000002' as TransportId;
    game.transports[other] = {
      ...structuredClone(game.transports[ORDER]),
      id: other,
      fromCastleId: DEST,
    };
    game.castles[TEST_CASTLE]!.ownerClanId = 'clan.enemy' as ClanId;
    resetGameStoreForTests(game);
    const before = structuredClone(game);
    render(<CastlePanel castleId={TEST_CASTLE} />);
    expect(screen.getByRole('tab', { name: '輸送' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: '輸送' }));
    expect(screen.getByTestId('transport-execute').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId(`transport-order-${ORDER}`).textContent).toContain(
      '兵力100人・兵糧200石',
    );
    expect(screen.getByTestId(`transport-order-${ORDER}`).textContent).toContain('起點與終點之間');
    expect(screen.queryByTestId(`transport-order-${other}`)).toBeNull();
    const recall = screen.getByTestId(`transport-recall-${ORDER}`);
    fireEvent.click(recall);
    expect(game).toEqual(before);
    expect(screen.getByTestId(`transport-status-${ORDER}`).textContent).toBe('撤回指令待執行');
    expect(recall.hasAttribute('disabled')).toBe(true);
    fireEvent.click(recall);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([
      { type: 'recallTransport', clanId: game.meta.playerClanId, transportId: ORDER },
    ]);
  });
  it('refreshes returning/order/source ownership and session identity without stale recall dispatch', () => {
    const game = fixture();
    game.transports[ORDER] = {
      id: ORDER,
      clanId: game.meta.playerClanId,
      fromCastleId: TEST_CASTLE,
      toCastleId: DEST,
      soldiers: 100,
      food: 200,
      gold: 0,
      path: [TEST_CASTLE, DEST],
      pathCursor: 1,
      edgeProgressDays: 0,
      edgeCostDays: 1,
      returning: true,
    };
    resetGameStoreForTests(game);
    const dispatch = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={dispatch} />);
    expect(screen.getByTestId(`transport-status-${ORDER}`).textContent).toBe('折返中');
    expect(screen.getByTestId(`transport-order-${ORDER}`).textContent).toContain('終點與起點之間');
    expect(screen.getByTestId(`transport-recall-${ORDER}`).hasAttribute('disabled')).toBe(true);
    act(() => {
      game.transports[ORDER]!.returning = false;
      bumpTickSeq();
    });
    const stale = screen.getByTestId(`transport-recall-${ORDER}`);
    act(() => {
      delete game.transports[ORDER];
      bumpTickSeq();
    });
    fireEvent.click(stale);
    expect(dispatch).not.toHaveBeenCalled();
    act(() => {
      game.castles[TEST_CASTLE]!.ownerClanId = 'clan.enemy' as ClanId;
      bumpTickSeq();
    });
    expect(screen.queryByTestId(`transport-order-${ORDER}`)).toBeNull();
    act(() => resetGameStoreForTests(fixture()));
    expect(screen.queryByTestId(`transport-order-${ORDER}`)).toBeNull();
    fireEvent.click(stale);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('lists connected owned destinations, previews without mutation, and emits one bounded command only on execution', () => {
    const game = fixture();
    resetGameStoreForTests(game);
    const before = structuredClone(game),
      dispatch = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={dispatch} />);
    expect(screen.getByRole('tab', { name: '輸送' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: '終點' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '不連通城' })).toBeNull();
    fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: DEST } });
    expect(screen.getByTestId('transport-preview').textContent).toContain('預估2日');
    expect(screen.getByTestId('transport-preview').textContent).toContain('起點 → 終點');
    const food = screen.getByRole('slider', { name: '兵糧' });
    fireEvent.keyDown(food, { key: 'End' });
    expect(food.getAttribute('max')).toBe('500');
    expect(dispatch).not.toHaveBeenCalled();
    expect(game).toEqual(before);
    fireEvent.click(screen.getByTestId('transport-execute'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'transport',
      clanId: game.meta.playerClanId,
      fromCastleId: TEST_CASTLE,
      toCastleId: DEST,
      soldiers: 0,
      gold: 0,
      food: 500,
    });
    expect(game).toEqual(before);
  });
  it('disables stale resource, route, destination and source ownership snapshots on actual publications', () => {
    const game = fixture();
    resetGameStoreForTests(game);
    const dispatch = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={dispatch} />);
    fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: DEST } });
    fireEvent.keyDown(screen.getByRole('slider', { name: '兵糧' }), { key: 'End' });
    act(() => {
      game.castles[TEST_CASTLE]!.food = 100;
      bumpTickSeq();
    });
    expect(screen.getByTestId('transport-execute').hasAttribute('disabled')).toBe(true);
    act(() => {
      game.castles[TEST_CASTLE]!.food = 500;
      game.roads['road.transport' as RoadEdgeId]!.b = 'castle.enemy' as MapNodeId;
      bumpTickSeq();
    });
    expect(screen.queryByRole('option', { name: '終點' })).toBeNull();
    expect(screen.getByTestId('transport-execute').hasAttribute('disabled')).toBe(true);
    act(() => {
      game.castles[DEST]!.ownerClanId = 'clan.enemy' as ClanId;
      game.castles[TEST_CASTLE]!.ownerClanId = 'clan.enemy' as ClanId;
      bumpTickSeq();
    });
    fireEvent.click(screen.getByTestId('transport-execute'));
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not let a delegated source bypass central player transport authority', () => {
    const game = fixture();
    game.castles[TEST_CASTLE]!.directControl = false;
    resetGameStoreForTests(game);
    const dispatch = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={dispatch} />);
    fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: DEST } });
    fireEvent.keyDown(screen.getByRole('slider', { name: '兵糧' }), { key: 'End' });
    const before = structuredClone(game);
    expect(screen.getByTestId<HTMLButtonElement>('transport-execute').disabled).toBe(true);
    fireEvent.click(screen.getByTestId('transport-execute'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(game).toEqual(before);
  });
  it('does not submit a retained transport callback outside the main screen', () => {
    const game = fixture();
    resetGameStoreForTests(game);
    const dispatch = vi.fn();
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={dispatch} />);
    fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: DEST } });
    fireEvent.keyDown(screen.getByRole('slider', { name: '兵糧' }), { key: 'End' });
    const execute = screen.getByTestId('transport-execute');
    const key = Object.keys(execute).find((value) => value.startsWith('__reactProps$'))!;
    const click = (execute as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
    act(() => store.getState().actions.setScreen('title'));
    const before = structuredClone(game);
    act(click);
    expect(dispatch).not.toHaveBeenCalled();
    expect(game).toEqual(before);
  });
  it('resets draft cargo and destination on source or same-ID game replacement', () => {
    const game = fixture();
    resetGameStoreForTests(game);
    const view = render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" />);
    fireEvent.change(screen.getByTestId('transport-destination'), { target: { value: DEST } });
    fireEvent.keyDown(screen.getByRole('slider', { name: '兵糧' }), { key: 'End' });
    view.rerender(<CastlePanel castleId={DEST} initialTab="transport" />);
    expect(screen.getByTestId<HTMLSelectElement>('transport-destination').value).toBe('');
    expect(screen.getByRole<HTMLInputElement>('slider', { name: '兵糧' }).value).toBe('0');
    act(() => resetGameStoreForTests(fixture()));
    expect(screen.getByTestId<HTMLSelectElement>('transport-destination').value).toBe('');
    expect(screen.getByTestId('transport-execute').hasAttribute('disabled')).toBe(true);
  });
});
