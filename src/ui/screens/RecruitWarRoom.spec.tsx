import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { selectM6View } from '@app/viewModels';
import { t } from '@i18n/zh-TW';
import { REJECT_REASONS } from '@core/commands/reasons';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_TAISHO,
} from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { RecruitPanel } from './RecruitPanel';

function fixture() {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.status = 'ronin';
  game.officers[OFF_BETA_BUSHO]!.status = 'captive';
  game.officers[OFF_BETA_BUSHO]!.capturedByClanId = CLAN_ALPHA;
  game.officers[OFF_BETA_TAISHO]!.status = 'ronin';
  game.officers[OFF_BETA_TAISHO]!.hasComeOfAge = false;
  return game;
}
beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(fixture());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.openPanel('ronin');
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});

describe('Recruitment war-room presentation and original bindings', () => {
  it('retains complete actual eligible names/status/location and view-model order', () => {
    const game = store.getState().game!;
    const expected = selectM6View(game).officers.filter(
      (o) => o.status === 'ronin' || (o.status === 'captive' && o.capturedByClanId === CLAN_ALPHA),
    );
    const before = structuredClone(game);
    render(<RecruitPanel />);
    const cards = screen.getByTestId('recruit-panel').querySelectorAll('button[class*="card"]');
    expect(cards).toHaveLength(2);
    expect(Array.from(cards, (c) => c.querySelector('[class*="name"]')!.textContent)).toEqual(
      expected.map((o) => o.name),
    );
    for (const [i, card] of Array.from(cards).entries()) {
      const officer = expected[i]!;
      expect(card.textContent).toBe(
        `${officer.name} · ${t(officer.status === 'captive' ? 'ui.captive.title' : 'ui.recruit.ronin')} · ${officer.locationCastleId === null ? t('ui.common.noData') : game.castles[officer.locationCastleId]!.name}`,
      );
      expect(card.querySelector('[class*="status"]')!.textContent).not.toBe('');
      expect(card.querySelector('[class*="location"]')!.textContent).not.toBe('');
    }
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it('keeps the ronin native detail callback read-only', () => {
    const before = structuredClone(store.getState().game!);
    render(<RecruitPanel />);
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(before.officers[OFF_ALPHA_BUSHO]!.name) }),
    );
    expect(uiStore.getState().panelStack.at(-1)).toMatchObject({
      id: 'officerDetail',
      params: { officerId: OFF_ALPHA_BUSHO },
    });
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it('retains the actual owned captive modal callback without pretending campaign coverage', () => {
    const before = structuredClone(store.getState().game!);
    render(<RecruitPanel />);
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(before.officers[OFF_BETA_BUSHO]!.name) }),
    );
    expect(uiStore.getState().modal).toMatchObject({
      id: 'captive',
      params: { officerId: OFF_BETA_BUSHO },
      pausesTime: true,
    });
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
  it('preserves castle-local adult filtering, unavailable reason and real empty state', () => {
    const { unmount } = render(<RecruitPanel castleId={CASTLE_A1} />);
    const panel = screen.getByTestId('recruit-panel');
    expect(panel.querySelectorAll('button[class*="card"]')).toHaveLength(1);
    expect(
      within(panel).queryByText(store.getState().game!.officers[OFF_BETA_BUSHO]!.name),
    ).toBeNull();
    unmount();
    const other = render(<RecruitPanel castleId={CASTLE_B1} />);
    expect(screen.getByRole('alert').textContent).toBe(t(REJECT_REASONS.notOwner));
    expect(
      screen.getByTestId('recruit-panel').querySelectorAll('button[class*="card"]'),
    ).toHaveLength(0);
    other.unmount();
    resetGameStoreForTests(buildTinyState());
    store.getState().actions.setScreen('main');
    render(<RecruitPanel castleId={CASTLE_A1} />);
    expect(screen.getByText(t('ui.castle.roninEmpty'))).toBeTruthy();
  });
  it('keeps modal ownership blocking and the original close callback', () => {
    render(<RecruitPanel />);
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(store.getState().game!.officers[OFF_ALPHA_BUSHO]!.name),
      }),
    );
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('ronin');
    const close = screen.getByTestId('recruit-panel').querySelector('header button')!;
    fireEvent.click(close);
    expect(uiStore.getState().panelStack.some((p) => p.id === 'ronin')).toBe(false);
  });
  it('uses the actual scoped M6 wrapper, intrinsic rows and physical readable/hit floors', () => {
    render(<RecruitPanel />);
    const panel = screen.getByTestId('recruit-panel');
    expect(panel.matches('div > section')).toBe(true);
    expect(panel.querySelector(':scope > section > header > button')).not.toBeNull();
    const css = readFileSync('src/ui/screens/RecruitPanel.module.css', 'utf8');
    expect(css).toContain('.anchor > div > section > section > header > button');
    expect(css).toContain('order: -1');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('grid-auto-rows: max-content');
    expect(css).toContain('align-content: start');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('white-space: normal');
    expect(css).toContain('background: var(--surface-panel)');
    expect(css).not.toMatch(/text-overflow:\s*ellipsis|display:\s*none|#[0-9a-f]{3,8}/i);
  });
});
