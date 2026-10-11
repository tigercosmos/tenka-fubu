import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PolicyPanel } from '../../src/ui/screens/panels/PolicyPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { POLICY_DEFS } from '../../src/core/policies';
import { policyUnlocked, validateEnactPolicy } from '../../src/core/commands/domesticCommands';
import { BAL } from '../../src/core/balance';
import type { PolicyId, FacilityTypeId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});
function fixture() {
  const game = buildTinyState();
  game.clans[CLAN_ALPHA]!.gold = 100_000;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  return game;
}
it('lets native selection reveal the selected policy details without core/RNG/queue changes', () => {
  const game = fixture();
  const before = structuredClone(game);
  render(<PolicyPanel />);
  fireEvent.click(screen.getByRole('button', { name: '查看傳馬制詳情' }));
  expect(
    within(screen.getByTestId('policy-detail')).getByRole('heading', { name: /傳馬制/ }),
  ).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('shows effect information, textual state and unlock conditions on all twelve cards', () => {
  const game = fixture();
  const before = structuredClone(game);
  const { container } = render(<PolicyPanel />);
  const cards = container.querySelectorAll('article');
  expect(cards).toHaveLength(POLICY_DEFS.length);
  for (const policy of POLICY_DEFS) {
    const card = screen.getByRole('heading', { name: t(policy.nameKey) }).closest('article')!;
    expect(within(card).getByRole('button', { name: `查看${t(policy.nameKey)}詳情` })).toBeTruthy();
    const cmd = { type: 'enactPolicy' as const, clanId: CLAN_ALPHA, policyId: policy.id };
    const statusKey = !policyUnlocked(game, cmd)
      ? 'ui.policy.statusLocked'
      : validateEnactPolicy(game, cmd).ok
        ? 'ui.policy.statusAvailable'
        : 'ui.policy.statusBlocked';
    expect(within(card).getByTestId('policy-status').textContent).toBe(t(statusKey));
    expect(within(card).getByTestId('policy-summary').textContent?.trim().length).toBeGreaterThan(
      0,
    );
    expect(
      within(card)
        .getAllByText(new RegExp(`威信 ${policy.unlockPrestige}`))
        .some((element) => element.textContent?.startsWith(`威信 ${policy.unlockPrestige}`)),
    ).toBe(true);
    fireEvent.click(within(card).getByRole('button', { name: `查看${t(policy.nameKey)}詳情` }));
    const detail = screen.getByTestId('policy-detail');
    expect(
      within(detail).getByRole('heading', { name: new RegExp(t(policy.nameKey)) }),
    ).toBeTruthy();
  }
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('presents verified numeric effects separately from unresolved policy promises', () => {
  const game = fixture();
  const before = structuredClone(game);
  render(<PolicyPanel />);
  fireEvent.click(screen.getByRole('button', { name: '查看傳馬制詳情' }));
  expect(
    within(screen.getByTestId('policy-detail')).getByText(/陸路起步行軍速度 ×1\.1/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看遠交近攻詳情' }));
  const detail = screen.getByTestId('policy-detail');
  expect(within(detail).getByText(/友好度增益 ×1\.25/)).toBeTruthy();
  expect(within(detail).getByText(/非鄰接.*尚未定案/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看目安箱詳情' }));
  expect(within(screen.getByTestId('policy-detail')).getByText(/忠誠.*尚未定案/)).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('revalidates a previously enabled adopt control against fresh funds before queuing', () => {
  const game = fixture();
  render(<PolicyPanel />);
  const button = within(screen.getByTestId('policy-card-pol.rakuichi')).getByRole('button', {
    name: t('ui.policy.adopt'),
  });
  expect(button.hasAttribute('disabled')).toBe(false);
  game.clans[CLAN_ALPHA]!.gold = 0;
  const before = structuredClone(game);
  fireEvent.click(button);
  expect(screen.getByRole('alert').textContent).toContain('金錢不足');
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it.each(['gold', 'slots', 'exclusive', 'cooldown', 'locked'] as const)(
  'exposes the central disabled action reason for %s without state or queue writes',
  (blocker) => {
    const game = fixture();
    let policyId = 'pol.rakuichi' as PolicyId;
    if (blocker === 'gold') game.clans[CLAN_ALPHA]!.gold = 0;
    if (blocker === 'slots') {
      game.clans[CLAN_ALPHA]!.prestige = BAL.policySlotPrestige;
      game.policies[CLAN_ALPHA]!.active = ['pol.tenmasei', 'pol.meyasubako'] as PolicyId[];
    }
    if (blocker === 'exclusive') {
      game.clans[CLAN_ALPHA]!.prestige = 500;
      game.castles[CASTLE_A1]!.coastal = true;
      game.castles[CASTLE_A1]!.facilities.push('fac.minato' as FacilityTypeId);
      game.policies[CLAN_ALPHA]!.active = ['pol.nanban' as PolicyId];
      policyId = 'pol.jishahogo' as PolicyId;
    }
    if (blocker === 'cooldown')
      game.policies[CLAN_ALPHA]!.cooldownUntil[policyId] = game.time.day + 30;
    if (blocker === 'locked') policyId = 'pol.kenchi' as PolicyId;
    expect(validateState(game)).toEqual([]);
    const verdict = validateEnactPolicy(game, {
      type: 'enactPolicy',
      clanId: CLAN_ALPHA,
      policyId,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error('expected actual central rejection');
    const before = structuredClone(game);
    render(<PolicyPanel />);
    const card = screen.getByTestId(`policy-card-${policyId}`);
    const button = within(card).getByRole('button', { name: t('ui.policy.adopt') });
    expect(button.hasAttribute('disabled')).toBe(true);
    const ids = button.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    const description = ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(description).toContain(t(verdict.reasonKey, verdict.params));
    if (blocker === 'gold') {
      const policy = POLICY_DEFS.find((item) => item.id === policyId)!;
      expect(description).toContain(`需要${policy.upkeepGold}貫`);
      expect(description).not.toContain('{cost}');
    }
    fireEvent.click(button);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('refreshes selected status on tick and same-ID replacement without inheriting an old policy action', () => {
  const game = fixture();
  render(<PolicyPanel />);
  fireEvent.click(screen.getByRole('button', { name: '查看樂市樂座詳情' }));
  const original = structuredClone(game);
  act(() => {
    game.policies[CLAN_ALPHA]!.active.push('pol.rakuichi' as PolicyId);
    bumpTickSeq();
  });
  expect(
    within(screen.getByTestId('policy-card-pol.rakuichi')).getByTestId('policy-status').textContent,
  ).toContain('施行中');
  const replacement = buildTinyState();
  const replacementBefore = structuredClone(replacement);
  const oldBefore = structuredClone(game);
  act(() => setGame(replacement));
  expect(
    within(screen.getByTestId('policy-card-pol.rakuichi')).getByTestId('policy-status').textContent,
  ).toBe(t('ui.policy.statusAvailable'));
  expect(game).toEqual(oldBefore);
  expect(replacement).toEqual(replacementBefore);
  expect(original.rng).toEqual(game.rng);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});

it('keeps actual adopt and revoke queued until their normal daily boundaries', () => {
  const game = fixture();
  render(<PolicyPanel />);
  const card = screen.getByTestId('policy-card-pol.rakuichi');
  const before = structuredClone(game);
  fireEvent.click(within(card).getByRole('button', { name: t('ui.policy.adopt') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'enactPolicy', clanId: CLAN_ALPHA, policyId: 'pol.rakuichi' },
  ]);
  act(() => {
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  expect(game.policies[CLAN_ALPHA]!.active).toContain('pol.rakuichi');
  const adopted = structuredClone(game);
  fireEvent.click(within(card).getByRole('button', { name: t('ui.policy.revoke') }));
  expect(game).toEqual(adopted);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'revokePolicy', clanId: CLAN_ALPHA, policyId: 'pol.rakuichi' },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.policies[CLAN_ALPHA]!.active).not.toContain('pol.rakuichi');
  expect(validateState(game)).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

// Retain the actual handler installed by React, not an invented command callback.
function clickHandler(button: HTMLElement): () => void {
  const propsKey = Object.keys(button).find((key) => key.startsWith('__reactProps$'));
  expect(propsKey).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[propsKey!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
it('does not let an old native close callback close a newly reopened policy owner', () => {
  const game = fixture();
  act(() => uiStore.getState().actions.openPanel('policy'));
  render(<PolicyPanel />);
  const close = clickHandler(screen.getByRole('button', { name: t('ui.policy.title') }));
  const old = uiStore.getState().panelStack.at(-1)!;
  act(() => {
    uiStore.getState().actions.closePanelById('policy');
    uiStore.getState().actions.openPanel('policy');
  });
  const current = uiStore.getState().panelStack.at(-1)!;
  expect(current).not.toBe(old);
  const before = structuredClone(game);
  act(() => close());
  expect(uiStore.getState().panelStack.at(-1)).toBe(current);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it.each(['unmount', 'close', 'fifo', 'native'] as const)(
  'revokes a real policy callback after %s ownership loss without queuing or core mutation',
  (blocker) => {
    const game = fixture();
    act(() => uiStore.getState().actions.openPanel('policy'));
    const view = render(<PolicyPanel />);
    const button = within(screen.getByTestId('policy-card-pol.rakuichi')).getByRole('button', {
      name: t('ui.policy.adopt'),
    });
    const submit = clickHandler(button);
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'close') act(() => uiStore.getState().actions.closePanelById('policy'));
    if (blocker === 'fifo')
      act(() =>
        uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
      );
    if (blocker === 'native')
      render(
        <ConfirmDialog
          open
          title="Other policy consent"
          message="Different owner"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    const panels = uiStore.getState().panelStack;
    act(() => submit());
    if (blocker === 'native') fireEvent.click(button);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().panelStack).toBe(panels);
  },
);
