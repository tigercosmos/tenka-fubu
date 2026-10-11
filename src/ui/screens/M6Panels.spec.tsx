import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { buildTinyState, OFF_ALPHA_BUSHO } from '../../../tests/fixtures/tiny';
import type { ProposalId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { uiStore, useUIStore } from '../hooks/uiStore';
import { useM6Dialogs } from '../hooks/useM6Dialogs';
import { DiplomacyPanel } from './DiplomacyPanel';
import { PlotPanel } from './PlotPanel';
import { OfficerActions } from './OfficerActions';
import { ProposalInbox } from './ProposalInbox';
import { selectM6View } from '@app/viewModels';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(buildTinyState());
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

describe('M6 validated command panels', () => {
  it('detaches nested presentation values from the canonical game', () => {
    const game = buildTinyState();
    const view = selectM6View(game);
    const clan = view.clans[0]!;
    clan.taimei.activeUntilDay = 123;
    clan.gold = 0;
    expect(game.clans[clan.id]!.taimei.activeUntilDay).not.toBe(123);
    expect(game.clans[clan.id]!.gold).not.toBe(0);
    view.officers[0]!.name = '顯示草稿';
    expect(game.officers[view.officers[0]!.id]!.name).not.toBe('顯示草稿');
  });
  it('renders diplomacy tabs without unstable object-selector snapshots', () => {
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.openPanel('diplomacy');
    render(<DiplomacyPanel />);
    expect(screen.getByTestId('diplomacy-panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: t('ui.court.title') }));
    expect(screen.getByRole('button', { name: t('cmd.court.requestRank') })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: t('ui.shogunate.title') }));
    expect(screen.getByRole('button', { name: t('cmd.shogunate.nominate') })).toBeTruthy();
  });

  it('shows actual validator reasons for empty plot forms and unavailable promotions', () => {
    const { unmount } = render(<PlotPanel />);
    const start = screen.getByRole('button', { name: t('cmd.plot.start') });
    expect(start.hasAttribute('disabled')).toBe(true);
    expect(start.getAttribute('aria-describedby')).toBeTruthy();
    expect(start.title.length).toBeGreaterThan(0);
    unmount();
    render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
    const promote = screen.getByRole('button', { name: t('cmd.officer.promote') });
    expect(promote.hasAttribute('disabled')).toBe(true);
    expect(promote.title.length).toBeGreaterThan(0);
  });

  it('queues each manually-paused inbox decision once, closes, and keeps core pending until tick', () => {
    const game = buildTinyState();
    const id = 'proposal.test' as ProposalId;
    game.proposals[id] = {
      id,
      clanId: game.meta.playerClanId,
      officerId: OFF_ALPHA_BUSHO,
      kind: 'reward',
      command: {
        type: 'rewardOfficer',
        clanId: game.meta.playerClanId,
        officerId: OFF_ALPHA_BUSHO,
        tier: 'small',
      },
      createdDay: game.time.day,
      expiresDay: game.time.day + 60,
      status: 'pending',
      meritReward: 5,
      estimatedCostGold: 100,
      summaryKey: 'ui.officer.actions',
      summaryParams: {},
    };
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.requestPause('user');
    function Harness() {
      useM6Dialogs();
      const modal = useUIStore((state) => state.modal);
      return modal?.id === 'proposalInbox' ? <ProposalInbox /> : null;
    }
    render(<Harness />);
    expect(uiStore.getState().modal?.id).toBe('proposalInbox');
    expect(
      screen.queryByRole('button', {
        name: t('ui.proposal.title', { year: game.time.year, month: game.time.month, count: 1 }),
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.reject') }));
    expect(store.getState().session.pendingCommandCount).toBe(1);
    expect(store.getState().session.speed).toBe('paused');
    expect(game.proposals[id].status).toBe('pending');
    expect(uiStore.getState().modal).toBeNull();
    expect(uiStore.getState().queuedDecisionIds).toEqual([id]);
    expect(screen.queryByTestId('proposal-inbox')).toBeNull();
    act(() => store.getState().actions.setPendingCommandCount(0));
    expect(uiStore.getState().modal?.id).toBe('proposalInbox');
    expect(screen.getByTestId('proposal-inbox')).toBeTruthy();
    act(() => uiStore.getState().actions.closeModal());
    const replacement = buildTinyState();
    replacement.proposals[id] = {
      ...game.proposals[id],
      id,
      command: { ...game.proposals[id].command },
      summaryParams: {},
    };
    act(() => resetGameStoreForTests(replacement));
    expect(uiStore.getState().modal?.id).toBe('proposalInbox');
  });
});
