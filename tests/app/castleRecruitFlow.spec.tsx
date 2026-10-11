import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { RecruitPanel } from '../../src/ui/screens/RecruitPanel';
import { OfficerActions } from '../../src/ui/screens/OfficerActions';
import { Dialog } from '../../src/ui/components/Dialog/Dialog';
import type { CommandActionProps } from '../../src/ui/components/CommandAction';
import { resetGameStoreForTests, store, setGame, bumpTickSeq } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import {
  officerAbilityScore,
  recruitRoninSuccessRate,
  validateCommand,
} from '../../src/core/index';
import { BAL } from '../../src/core/balance';
import type { OfficerId, CastleId } from '../../src/core/state/ids';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

const LOCAL = 'off.recruit-local' as OfficerId;
const REMOTE = 'off.recruit-remote' as OfficerId;
const ENEMY = 'off.recruit-enemy' as OfficerId;
const CAPTIVE = 'off.recruit-captive' as OfficerId;
const captured = vi.hoisted(() => ({
  action: null as CommandActionProps | null,
  buttons: new Map<string, () => void>(),
  close: null as (() => void) | null,
}));
vi.mock('../../src/ui/components/CommandAction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/components/CommandAction')>();
  return {
    ...actual,
    CommandAction: (props: CommandActionProps) => {
      if (props.command.type === 'recruitRonin') captured.action = props;
      return <actual.CommandAction {...props} />;
    },
  };
});
vi.mock('../../src/ui/screens/M6Panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/screens/M6Panel')>();
  return {
    ...actual,
    M6Panel: (props: Parameters<typeof actual.M6Panel>[0]) => {
      captured.close = props.onClose;
      function visit(nodes: ReactNode) {
        Children.forEach(nodes, (node) => {
          if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return;
          if (node.type === 'button' && node.props.onClick)
            captured.buttons.set(String(node.key), node.props.onClick);
          visit(node.props.children);
        });
      }
      visit(props.children);
      return <actual.M6Panel {...props} />;
    },
  };
});
beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  captured.action = null;
  captured.buttons.clear();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});
function fixture() {
  const game = buildTinyState();
  game.clans[game.meta.playerClanId]!.gold = 10000;
  for (const [id, location] of [
    [LOCAL, CASTLE_A1],
    [REMOTE, CASTLE_A2],
    [ENEMY, CASTLE_B1],
  ] as const)
    game.officers[id] = {
      ...structuredClone(game.officers[OFF_ALPHA_BUSHO]!),
      id,
      name: id,
      clanId: null,
      status: 'ronin',
      locationCastleId: location,
      armyId: null,
      spouseId: null,
      rank: 'busho',
    };
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  return game;
}
function selectExecutor(id = OFF_ALPHA_BUSHO) {
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.recruit.executor') }), {
    target: { value: id },
  });
}
function scopedPanel() {
  return <RecruitPanel {...{ castleId: CASTLE_A1 }} />;
}

describe('castle-local recruitment through existing command authority', () => {
  it.each(['fifo', 'native'] as const)(
    'blocks retained navigation and recruitment beneath a %s modal owner',
    (kind) => {
      const game = fixture();
      render(
        <>
          <RecruitPanel castleId={CASTLE_A1} />
          <OfficerActions officerId={LOCAL} />
        </>,
      );
      selectExecutor();
      const navigate = captured.buttons.get(LOCAL)!;
      const action = captured.action!;
      if (kind === 'fifo')
        act(() =>
          uiStore.getState().actions.enqueueModal({ id: 'confirm', params: {}, pausesTime: true }),
        );
      else
        render(
          <Dialog open title="Native owned dialog" onClose={() => {}}>
            <button type="button">Owned control</button>
          </Dialog>,
        );
      const before = structuredClone(game);
      act(navigate);
      expect(uiStore.getState().panelStack).toEqual([]);
      expect(action.onCommand!(action.command).ok).toBe(false);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
      expect(game).toEqual(before);
    },
  );
  it.each([CASTLE_B1, 'castle.missing' as CastleId])(
    'does not claim known empty recruitment for unavailable scope %s',
    (castleId) => {
      fixture();
      render(<RecruitPanel castleId={castleId} />);
      expect(screen.getByRole('alert').textContent).toBe(
        t(castleId === CASTLE_B1 ? 'cmd.reject.notOwner' : 'cmd.reject.invalidTarget'),
      );
      expect(screen.queryByText(t('ui.castle.roninEmpty'))).toBeNull();
    },
  );
  it('scopes the list to the owned castle while retaining the omitted global list', () => {
    const game = fixture();
    game.officers[CAPTIVE] = {
      ...structuredClone(game.officers[ENEMY]!),
      id: CAPTIVE,
      name: CAPTIVE,
      status: 'captive',
      clanId: game.castles[CASTLE_B1]!.ownerClanId,
      capturedByClanId: game.meta.playerClanId,
      locationCastleId: CASTLE_A1,
    };
    expect(validateState(game)).toEqual([]);
    act(() => bumpTickSeq());
    const before = structuredClone(game);
    const view = render(scopedPanel());
    expect(screen.getByRole('button', { name: new RegExp(LOCAL) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(REMOTE) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(ENEMY) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(CAPTIVE) })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(LOCAL) }));
    expect(uiStore.getState().panelStack.at(-1)).toEqual({
      id: 'officerDetail',
      params: { officerId: LOCAL },
    });
    view.rerender(<RecruitPanel />);
    expect(screen.getByRole('button', { name: new RegExp(REMOTE) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(ENEMY) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(CAPTIVE) }));
    expect(uiStore.getState().modal).toMatchObject({
      id: 'captive',
      params: { officerId: CAPTIVE },
    });
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it.each(['location', 'status', 'age', 'ownership', 'replacement', 'unmount', 'close'] as const)(
    'rejects retained scoped navigation after %s changes',
    (change) => {
      const game = fixture();
      const view = render(scopedPanel());
      const stale = captured.buttons.get(LOCAL)!;
      expect(stale).toBeTypeOf('function');
      if (change === 'location') game.officers[LOCAL]!.locationCastleId = CASTLE_A2;
      else if (change === 'status') game.officers[LOCAL]!.status = 'dead';
      else if (change === 'age') game.officers[LOCAL]!.hasComeOfAge = false;
      else if (change === 'ownership')
        game.castles[CASTLE_A1]!.ownerClanId = game.castles[CASTLE_B1]!.ownerClanId;
      else if (change === 'replacement') act(() => setGame(buildTinyState()));
      else if (change === 'unmount') view.unmount();
      else act(() => captured.close!());
      const before = structuredClone(store.getState().game);
      act(stale);
      expect(uiStore.getState().panelStack).toEqual([]);
      expect(store.getState().game).toEqual(before);
    },
  );
  it('shows both actual fee components and executor-specific chance, queues once and settles on a real day', () => {
    const game = fixture();
    render(<OfficerActions officerId={LOCAL} />);
    selectExecutor();
    const command = {
      type: 'recruitRonin' as const,
      clanId: game.meta.playerClanId,
      officerId: LOCAL,
      executorId: OFF_ALPHA_BUSHO,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    expect(
      screen.getByText(t('ui.recruit.attemptCost', { value: BAL.recruitAttemptCost })),
    ).toBeTruthy();
    const signing = officerAbilityScore(game.officers[LOCAL]!) * BAL.recruitSigningBonusPerAbility;
    expect(screen.getByText(t('ui.recruit.signingCost', { value: signing }))).toBeTruthy();
    expect(
      screen.getByText(
        t('ui.plot.chance', {
          chance: Math.round(
            recruitRoninSuccessRate(game, LOCAL, OFF_ALPHA_BUSHO, game.meta.playerClanId) * 100,
          ),
        }),
      ),
    ).toBeTruthy();
    const before = structuredClone(game);
    const stale = captured.action!;
    fireEvent.click(screen.getByRole('button', { name: t('cmd.officer.recruit') }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    expect(screen.getByText(t('ui.recruit.pending'))).toBeTruthy();
    expect(stale.onCommand!(command).ok).toBe(false);
    act(() => {
      runOneDay();
    });
    const success = game.officers[LOCAL]!.status === 'serving';
    expect(game.clans[game.meta.playerClanId]!.gold).toBe(
      before.clans[game.meta.playerClanId]!.gold - BAL.recruitAttemptCost - (success ? signing : 0),
    );
    if (!success) {
      expect(game.events.cooldownUntil[`officer.recruit:${LOCAL}:${game.meta.playerClanId}`]).toBe(
        before.time.day + BAL.recruitRetryCooldownDays,
      );
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: t('cmd.officer.recruit') }).disabled,
      ).toBe(true);
    }
    expect(validateState(game)).toEqual([]);
  });
  it('resets executor draft for a changed subject and rejects retained submission on a replacement session', () => {
    const game = fixture();
    const view = render(<OfficerActions officerId={LOCAL} />);
    selectExecutor();
    const stale = captured.action!;
    view.rerender(<OfficerActions officerId={REMOTE} />);
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: t('ui.recruit.executor') }).value,
    ).toBe('');
    expect(stale.onCommand!(stale.command).ok).toBe(false);
    view.rerender(<OfficerActions officerId={LOCAL} />);
    selectExecutor();
    const replaced = captured.action!;
    act(() => setGame(fixture()));
    expect(replaced.onCommand!(replaced.command).ok).toBe(false);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('filters unavailable executors and rejects changed physical facts before a UI tick', () => {
    const game = fixture();
    render(<OfficerActions officerId={LOCAL} />);
    selectExecutor();
    const stale = captured.action!;
    game.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
    const before = structuredClone(game);
    expect(stale.onCommand!(stale.command).ok).toBe(false);
    expect(game).toEqual(before);
    act(() => bumpTickSeq());
    expect(
      within(screen.getByRole('combobox', { name: t('ui.recruit.executor') })).queryByRole(
        'option',
        { name: game.officers[OFF_ALPHA_BUSHO]!.name },
      ),
    ).toBeNull();
    expect(screen.getByRole('option', { name: game.officers[OFF_ALPHA_LORD]!.name })).toBeTruthy();
  });
  it.each([
    'selection',
    'unmount',
    'viewport',
    'main',
    'targetAge',
    'executorAge',
    'ownership',
  ] as const)(
    'rejects retained ronin submission after %s changes without a queue or resource write',
    (change) => {
      const game = fixture();
      const view = render(<OfficerActions officerId={LOCAL} />);
      selectExecutor();
      const stale = captured.action!;
      if (change === 'selection') selectExecutor(OFF_ALPHA_LORD);
      else if (change === 'unmount') view.unmount();
      else if (change === 'viewport') act(() => store.getState().actions.setViewportBlocked(true));
      else if (change === 'main') act(() => store.getState().actions.setScreen('title'));
      else if (change === 'targetAge') game.officers[LOCAL]!.hasComeOfAge = false;
      else if (change === 'executorAge') game.officers[OFF_ALPHA_BUSHO]!.hasComeOfAge = false;
      else game.castles[CASTLE_A1]!.ownerClanId = game.castles[CASTLE_B1]!.ownerClanId;
      const before = structuredClone(game);
      expect(stale.onCommand!(stale.command).ok).toBe(false);
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    },
  );
});
