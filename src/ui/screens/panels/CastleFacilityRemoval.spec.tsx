import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { applyCreateCorps, validateCreateCorps } from '@core/commands/corpsCommands';
import { validateState } from '@core/state/invariants';
import { FACILITY_DEFS } from '@core/facilities';
import { BAL } from '@core/balance';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
} from '../../../../tests/fixtures/tiny';
import { uiStore } from '../../hooks/uiStore';
import { CastlePanel } from './CastlePanel';

const captured = vi.hoisted(() => ({ confirm: null as (() => void) | null }));
vi.mock('@ui/components/ConfirmDialog/ConfirmDialog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ui/components/ConfirmDialog/ConfirmDialog')>();
  return {
    ...actual,
    ConfirmDialog: (props: Parameters<typeof actual.ConfirmDialog>[0]) => {
      captured.confirm = props.onConfirm;
      return <actual.ConfirmDialog {...props} />;
    },
  };
});

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  captured.confirm = null;
});

it.each(['facility', 'construction'] as const)(
  'rejects removed or replaced %s at confirmation',
  (kind) => {
    const game = fixture();
    render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
    fireEvent.click(
      screen.getByRole('button', { name: kind === 'facility' ? '拆除 市' : '取消建造 兵舍' }),
    );
    if (kind === 'facility') game.castles[CASTLE_A1]!.facilities = [];
    else game.castles[CASTLE_A1]!.buildQueue[0] = { ...game.castles[CASTLE_A1]!.buildQueue[0]! };
    const before = structuredClone(game);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(screen.getByRole('alert').textContent).toBe('目標無效或已不存在');
    expect(game).toEqual(before);
  },
);

it.each(['ownership', 'corps'] as const)('revalidates %s at confirmation', (kind) => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  if (kind === 'ownership') {
    game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    game.castles[CASTLE_A1]!.lordId = null;
    for (const id of game.castles[CASTLE_A1]!.districtIds) {
      game.districts[id]!.ownerClanId = CLAN_BETA;
      game.districts[id]!.stewardId = null;
    }
    game.clans[CLAN_ALPHA]!.homeCastleId = CASTLE_A2;
    game.castles[CASTLE_A2]!.tier = 'main';
  } else {
    game.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
    const command = {
      type: 'createCorps' as const,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_BUSHO,
      castleIds: [CASTLE_A1],
      directive: 'hold' as const,
      targetNodeId: null,
    };
    expect(validateCreateCorps(game, command)).toEqual({ ok: true });
    applyCreateCorps(game, command, () => {});
  }
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(screen.getByRole('alert').textContent).toBe(
    kind === 'ownership' ? '目標無效或已不存在' : '此城已委由軍團管理，無法直接下令',
  );
});

it('preserves FIFO and removes only the old castle request', () => {
  fixture();
  act(() =>
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false }),
  );
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  expect(uiStore.getState().modal?.id).toBe('systemMenu');
  expect(uiStore.getState().modalQueue[0]!.params.owner).toBe('castleFacilityRemoval');
  view.rerender(<CastlePanel castleId={CASTLE_A2} initialTab="domestic" />);
  expect(uiStore.getState().modal?.id).toBe('systemMenu');
  expect(uiStore.getState().modalQueue).toEqual([]);
});

it('old callbacks cannot submit or close a newer request, and replacement cannot inherit resume', () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  const oldConfirm = captured.confirm!;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  const token = uiStore.getState().modal!.params.token;
  act(() => oldConfirm());
  expect(uiStore.getState().modal!.params.token).toBe(token);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const staleConfirm = captured.confirm!;
  uiStore.setState({ restoreSpeedOnQueueDrain: true });
  act(() => {
    setGame(structuredClone(game));
    staleConfirm();
  });
  expect(uiStore.getState().modal).toBeNull();
  expect(uiStore.getState().restoreSpeedOnQueueDrain).toBe(false);
  expect(store.getState().session.speed).toBe('paused');
});

it('pending removal disables additional requests and unmount releases its owned dialog', () => {
  const game = fixture();
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  const confirm = captured.confirm!;
  act(() => {
    confirm();
    confirm();
  });
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(screen.getByRole('button', { name: '拆除 市' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: '取消建造 兵舍' }).hasAttribute('disabled')).toBe(true);
  view.unmount();
  expect(uiStore.getState().modal).toBeNull();
});

function fixture() {
  const game = buildTinyState();
  game.castles[CASTLE_A1]!.facilities = [FACILITY_DEFS.find((def) => def.id === 'fac.ichi')!.id];
  game.castles[CASTLE_A1]!.buildQueue = [
    { facilityTypeId: FACILITY_DEFS.find((def) => def.id === 'fac.heisha')!.id, daysLeft: 20 },
  ];
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return game;
}

it('offers demolition with cancel focus, queues once and releases the slot without refund on the actual tick', async () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  const dialog = screen.getByRole('dialog', { name: '拆除' });
  await waitFor(() =>
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' })),
  );
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.castles[CASTLE_A1]!.facilities).toEqual([]);
  expect(game.clans[game.meta.playerClanId]!.gold).toBe(before.clans[game.meta.playerClanId]!.gold);
  expect(validateState(game)).toEqual([]);
});

it('offers cancellation of active construction, queues only on confirmation and refunds the actual canonical cost', () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: '取消建造 兵舍' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.castles[CASTLE_A1]!.buildQueue).toEqual([]);
  expect(game.clans[game.meta.playerClanId]!.gold).toBe(
    before.clans[game.meta.playerClanId]!.gold +
      Math.floor(
        FACILITY_DEFS.find((def) => def.id === 'fac.heisha')!.costGold * BAL.buildRefundRate,
      ),
  );
  expect(validateState(game)).toEqual([]);
});
