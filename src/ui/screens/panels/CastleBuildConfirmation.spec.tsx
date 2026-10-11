import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { initializeBridgeSession, getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { validateState } from '@core/state/invariants';
import { getMissingKeys, resetMissingKeyTrackingForTests } from '@i18n/zh-TW';
import { applyCreateCorps, validateCreateCorps } from '@core/commands/corpsCommands';
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
// Retain callbacks for adversarial ownership tests while rendering the real shared Dialog.
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
  resetMissingKeyTrackingForTests();
  captured.confirm = null;
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

function fixture() {
  const game = buildTinyState();
  game.clans[CLAN_ALPHA]!.gold = 2_000;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return game;
}

function selectBuild() {
  fireEvent.click(screen.getAllByRole('button', { name: /空位/ })[0]!);
  fireEvent.click(screen.getByRole('button', { name: /市.*200貫.*60日/ }));
}

it('cancel is focused and submits nothing; confirmation queues exactly once without core or RNG writes', async () => {
  const game = fixture();
  const before = structuredClone(game);
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  const dialog = screen.getByRole('dialog', { name: '建造選單' });
  await waitFor(() =>
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' })),
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  selectBuild();
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '確定' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'buildFacility', clanId: CLAN_ALPHA, castleId: CASTLE_A1, facilityTypeId: 'fac.ichi' },
  ]);
  expect(game).toEqual(before);
  expect(game.rng).toEqual(before.rng);
});

it('revalidates current resources at confirmation instead of submitting a stale valid choice', () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  game.clans[CLAN_ALPHA]!.gold = 0;
  const before = structuredClone(game);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確定' }));
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(screen.getByRole('alert').textContent).toBe('金錢不足（需要200貫）');
  expect(getMissingKeys()).toEqual([]);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
});

it('queues behind an existing modal, removes only its stamped request on castle change, and can reopen', () => {
  fixture();
  act(() =>
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false }),
  );
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  const oldRequest = uiStore.getState().modalQueue[0]!;
  expect(oldRequest.params.owner).toBe('castleBuild');
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<CastlePanel castleId={CASTLE_A2} initialTab="domestic" />);
  expect(uiStore.getState().modal?.id).toBe('systemMenu');
  expect(uiStore.getState().modalQueue).toEqual([]);
  selectBuild();
  expect(uiStore.getState().modalQueue[0]!.params.token).not.toBe(oldRequest.params.token);
  act(() => uiStore.getState().actions.closeModal());
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('discards replacement-session requests without dispatching or inheriting a resume claim', () => {
  const game = fixture();
  const dispatch = vi.fn();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" onCommand={dispatch} />);
  selectBuild();
  const oldConfirm = within(screen.getByRole('dialog')).getByRole('button', { name: '確定' });
  uiStore.setState({ restoreSpeedOnQueueDrain: true });
  const replacement = structuredClone(game);
  act(() => {
    setGame(replacement);
    fireEvent.click(oldConfirm);
  });
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(uiStore.getState().modal).toBeNull();
  expect(uiStore.getState().restoreSpeedOnQueueDrain).toBe(false);
  expect(store.getState().session.speed).toBe('paused');
});

it('unmount removes its queued descriptor without closing another active owner', () => {
  fixture();
  act(() =>
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false }),
  );
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  view.unmount();
  expect(uiStore.getState().modal?.id).toBe('systemMenu');
  expect(uiStore.getState().modalQueue).toEqual([]);
});

it('checks current resources before opening a stale enabled facility option', () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  game.clans[CLAN_ALPHA]!.gold = 0;
  const before = structuredClone(game);
  selectBuild();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe('金錢不足（需要200貫）');
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
});

it.each(['ownership', 'corps'] as const)('revalidates stale %s before confirming', (kind) => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  if (kind === 'ownership') {
    // Controlled valid ownership transition; no claim of simulated battle capture.
    game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    game.castles[CASTLE_A1]!.lordId = null;
    for (const id of game.castles[CASTLE_A1]!.districtIds) {
      game.districts[id]!.ownerClanId = CLAN_BETA;
      game.districts[id]!.stewardId = null;
    }
    // Alpha's living leader still needs an owned home castle.
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
  expect(screen.getByRole('alert').textContent).toBe(
    kind === 'ownership' ? '目標不屬於我方勢力' : '此城已委由軍團管理，無法直接下令',
  );
  expect(game).toEqual(before);
  expect(getMissingKeys()).toEqual([]);
});

it('a descriptor closed externally can be reopened with a fresh request token', () => {
  fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  const token = uiStore.getState().modal!.params.token;
  act(() => uiStore.getState().actions.closeModal());
  selectBuild();
  expect(uiStore.getState().modal!.params.token).not.toBe(token);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('a retained old confirmation callback cannot submit or dismiss a newer same-castle request', () => {
  const game = fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  selectBuild();
  const oldConfirm = captured.confirm;
  expect(oldConfirm).not.toBeNull();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
  selectBuild();
  const currentModal = uiStore.getState().modal;
  act(() => oldConfirm?.());
  expect(uiStore.getState().modal).toBe(currentModal);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
