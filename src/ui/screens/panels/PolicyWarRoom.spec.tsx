import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { POLICY_DEFS } from '@core/policies';
import { t } from '@i18n/zh-TW';
import { makeLoopTestState } from '../../../../tests/helpers/loopState';
import { uiStore } from '../../hooks/uiStore';
import { PolicyPanel } from './PolicyPanel';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});

describe('Policy war-room presentation', () => {
  it('binds every complete policy fact register to its compact catalog card', () => {
    render(<PolicyPanel />);
    const cards = POLICY_DEFS.map((policy) => screen.getByTestId(`policy-card-${policy.id}`));
    expect(cards).toHaveLength(12);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(
      POLICY_DEFS.map((policy) => t(policy.nameKey)),
    );
    for (const [index, card] of cards.entries()) {
      expect(card.className).toContain('card');
      const facts = card.querySelector('[class*="facts"]')!;
      expect(facts).not.toBeNull();
      expect(facts.querySelector('p')!.textContent).toBe(
        t('ui.policy.upkeep', { gold: POLICY_DEFS[index]!.upkeepGold }),
      );
      expect(facts.querySelectorAll('small')).toHaveLength(3);
      expect(within(card).getByTestId('policy-summary').textContent).not.toBe('');
      expect(within(card).getByTestId('policy-status').textContent).not.toBe('');
      expect(within(card).getAllByRole('button')).toHaveLength(2);
    }
  });

  it('retains catalog order and full selected dossier without game or queue mutations', () => {
    render(<PolicyPanel />);
    const before = structuredClone(store.getState().game!);
    const pending = store.getState().session.pendingCommandCount;
    const last = POLICY_DEFS.at(-1)!;
    const card = screen.getByTestId(`policy-card-${last.id}`);
    const details = within(card).getByRole('button', {
      name: t('ui.policy.viewDetails', { name: t(last.nameKey) }),
    });
    fireEvent.click(details);
    expect(details.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(screen.getByTestId('policy-detail')).getByRole('heading', {
        name: t('ui.policy.detailTitle', { name: t(last.nameKey) }),
      }),
    ).toBeTruthy();
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(pending);
    expect(screen.getAllByTestId(/^policy-card-/).map((card) => card.dataset.testid)).toEqual(
      POLICY_DEFS.map((policy) => `policy-card-${policy.id}`),
    );
  });

  it('keeps validator reasons associated with disabled actions and all facts readable', () => {
    render(<PolicyPanel />);
    const locked = screen.getByTestId('policy-card-pol.nanban');
    const adopt = within(locked).getByRole('button', { name: '採用' });
    expect(adopt.hasAttribute('disabled')).toBe(true);
    const reasonId = adopt.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)!.textContent).not.toBe('');
    expect(within(locked).getAllByText(/南蠻|港/).length).toBeGreaterThan(0);
  });

  it('keeps two-column catalog and independent dossier screen-local with physical floors', () => {
    const css = readFileSync('src/ui/screens/panels/PolicyPanel.module.css', 'utf8');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toMatch(/\.grid\s*\{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.detail\s*\{[^}]*overflow-y: auto/);
    expect(css).toMatch(
      /\.detail\s*\{[^}]*box-sizing: border-box;[^}]*max-height: calc\(100% - min\(192px, 14rem\)\)/,
    );
    expect(css).toContain('font-size: max(12px, var(--font-size-xs))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toMatch(
      /\.frame button:disabled\s*\{[^}]*opacity: 1;[^}]*color: var\(--text-secondary\);[^}]*border-color: var\(--stroke-subtle\)/,
    );
    expect(css).toMatch(/\.anchor > section > header\s*\{[^}]*justify-content: flex-start/);
    for (const selector of ['.card h3', '.detail h3', '.anchor > section > header > span']) {
      const rule = css.slice(css.indexOf(selector));
      expect(rule.slice(0, rule.indexOf('}'))).toContain('line-height: var(--line-height-body)');
    }
    expect(css).not.toMatch(/text-overflow|visibility:\s*hidden|#[\da-f]{3,8}\b/i);
  });
});
