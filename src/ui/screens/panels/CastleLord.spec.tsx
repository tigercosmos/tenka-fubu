import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, setGame } from '@app/store';
import { applyCreateCorps, validateCreateCorps } from '@core/commands/corpsCommands';
import { applyMarch, validateMarch } from '@core/commands/march';
import { validateState } from '@core/state/invariants';
import type { OfficerId } from '@core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
} from '../../../../tests/fixtures/tiny';
import { uiStore } from '../../hooks/uiStore';
import { CastlePanel } from './CastlePanel';

const LOW = 'off.lord-low' as OfficerId;
const DEPLOYED = 'off.lord-deployed' as OfficerId;

function fixture() {
  const game = buildTinyState();
  const eligible = game.officers[OFF_ALPHA_BUSHO]!;
  eligible.locationCastleId = CASTLE_A2;
  eligible.rank = 'samurai-taisho';
  game.officers[LOW] = {
    ...structuredClone(eligible),
    id: LOW,
    name: '低身分',
    rank: 'ashigaru-taisho',
  };
  game.officers[DEPLOYED] = { ...structuredClone(eligible), id: DEPLOYED, name: '出陣中' };
  const march = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A2,
    leaderId: DEPLOYED,
    deputyIds: [],
    soldiers: 100,
    food: 200,
    targetNodeId: CASTLE_B1,
  };
  expect(validateMarch(game, march)).toEqual({ ok: true });
  applyMarch(game, march, () => {});
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return game;
}

function openAndChoose(game: ReturnType<typeof fixture>) {
  fireEvent.click(screen.getByRole('button', { name: '城主' }));
  const select = screen.getByRole('combobox', { name: '城主' });
  fireEvent.change(select, { target: { value: OFF_ALPHA_BUSHO } });
  expect(
    within(select).getByRole('option', { name: game.officers[OFF_ALPHA_BUSHO]!.name }),
  ).toBeTruthy();
  return screen.getByRole<HTMLButtonElement>('button', { name: '任命城主' });
}

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

describe('Castle-local lord appointment', () => {
  it('lists eligible residents and queues one real appointment without advancing core or RNG', async () => {
    const game = fixture();
    const before = structuredClone(game);
    render(<CastlePanel castleId={CASTLE_A2} />);
    const submit = openAndChoose(game);
    const select = screen.getByRole('combobox', { name: '城主' });
    expect(within(select).queryByRole('option', { name: '低身分' })).toBeNull();
    expect(within(select).queryByRole('option', { name: '出陣中' })).toBeNull();
    fireEvent.click(submit);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'appointLord', clanId: CLAN_ALPHA, castleId: CASTLE_A2, officerId: OFF_ALPHA_BUSHO },
    ]);
    expect(game).toEqual(before);
    expect(game.rng).toEqual(before.rng);
    await act(() => runOneDay());
    expect(game.castles[CASTLE_A2]!.lordId).toBe(OFF_ALPHA_BUSHO);
    expect(validateState(game)).toEqual([]);
  });

  it('allows opening a vacant lord row and cancel restores its focus without dispatch', () => {
    const game = fixture();
    game.castles[CASTLE_A2]!.lordId = null;
    expect(validateState(game)).toEqual([]);
    render(<CastlePanel castleId={CASTLE_A2} />);
    const opener = screen.getByRole('button', { name: '城主' });
    expect(opener.textContent).toContain('空缺');
    fireEvent.click(opener);
    const cancel = screen.getByRole('button', { name: '取消' });
    cancel.focus();
    fireEvent.click(cancel);
    expect(screen.queryByRole('combobox', { name: '城主' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it.each(['unowned', 'corps'] as const)(
    'disables %s entry with the central rejection reason',
    (kind) => {
      const game = fixture();
      if (kind === 'corps') {
        game.officers[LOW]!.rank = 'karo';
        const command = {
          type: 'createCorps' as const,
          clanId: CLAN_ALPHA,
          corpsLeaderId: LOW,
          castleIds: [CASTLE_A2],
          directive: 'hold' as const,
          targetNodeId: null,
        };
        expect(validateCreateCorps(game, command)).toEqual({ ok: true });
        applyCreateCorps(game, command, () => {});
        expect(validateState(game)).toEqual([]);
      }
      render(<CastlePanel castleId={kind === 'unowned' ? CASTLE_B1 : CASTLE_A2} />);
      const opener = screen.getByRole<HTMLButtonElement>('button', { name: '城主' });
      expect(opener.disabled).toBe(true);
      expect(opener.title).toBe(
        kind === 'unowned' ? '目標不屬於我方勢力' : '此城已委由軍團管理，無法直接下令',
      );
      fireEvent.click(opener);
      expect(screen.queryByRole('combobox', { name: '城主' })).toBeNull();
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    },
  );

  it.each(['rank', 'assignment'] as const)('revalidates stale %s at submission', (kind) => {
    const game = fixture();
    render(<CastlePanel castleId={CASTLE_A2} />);
    const submit = openAndChoose(game);
    if (kind === 'rank') game.officers[OFF_ALPHA_BUSHO]!.rank = 'ashigaru-taisho';
    else {
      const command = {
        type: 'march' as const,
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A2,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 100,
        food: 200,
        targetNodeId: CASTLE_B1,
      };
      expect(validateMarch(game, command)).toEqual({ ok: true });
      applyMarch(game, command, () => {});
    }
    expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toContain('身分不足以擔任此職');
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
  });

  it('discards the chooser on same-ID game and castle replacement without dispatching old input', () => {
    const game = fixture();
    const dispatch = vi.fn();
    const view = render(<CastlePanel castleId={CASTLE_A2} onCommand={dispatch} />);
    const oldSubmit = openAndChoose(game);
    const replacement = structuredClone(game);
    act(() => {
      setGame(replacement);
      fireEvent.click(oldSubmit);
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: '城主' })).toBeNull();
    openAndChoose(replacement);
    view.rerender(<CastlePanel castleId={CASTLE_A1} onCommand={dispatch} />);
    expect(screen.queryByRole('combobox', { name: '城主' })).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a stale chooser after a controlled, invariant-valid ownership transfer', () => {
    const game = fixture();
    render(<CastlePanel castleId={CASTLE_A2} />);
    const submit = openAndChoose(game);
    // Controlled ownership transition, not a claim that a battle capture was executed.
    const castle = game.castles[CASTLE_A2]!;
    castle.ownerClanId = CLAN_BETA;
    castle.lordId = null;
    for (const id of castle.districtIds) {
      game.districts[id]!.ownerClanId = CLAN_BETA;
      game.districts[id]!.stewardId = null;
    }
    expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('目標不屬於我方勢力');
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
  });
});
