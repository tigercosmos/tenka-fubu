import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { getQueuedPlayerCommands, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { selectM6View } from '@app/viewModels';
import { t } from '@i18n/zh-TW';
import { BAL } from '@core/balance';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { DiplomacyPanel, DiploWork } from './DiplomacyPanel';

beforeEach(() => {
  resetBridgeForTests();
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.openPanel('diplomacy');
});

describe('Diplomacy war-room presentation', () => {
  it('leaves standalone diplomatic work outside all new scoped work rules', () => {
    render(<DiploWork target="court" />);
    const work = screen
      .getByRole('heading', { name: t('ui.diplomacy.assignWork') })
      .closest('section')!;
    expect(work.closest('[class*="frame"]')).toBeNull();
    expect(
      within(work).getByRole('combobox', { name: t('ui.diplomacy.workOfficer') }),
    ).toBeTruthy();
    const css = readFileSync('src/ui/screens/DiplomacyPanel.module.css', 'utf8');
    const workSelectors = css
      .split('{')
      .slice(0, -1)
      .map((part) => part.split('}').at(-1)!)
      .filter((selector) => selector.includes('.work'));
    expect(workSelectors.length).toBeGreaterThan(0);
    for (const selectors of workSelectors) {
      for (const selector of selectors.split(',').filter((selector) => selector.includes('.work')))
        expect(selector.trim()).toMatch(/^\.frame /);
    }
    expect(css).toMatch(
      /\.frame \.work\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(/\.frame \.work > p:not\(:first-of-type\)\s*\{[^}]*grid-column: 1 \/ -1/);
  });
  it('keeps the real roster selection/order and three tabs inside a screen-local bounded frame', () => {
    const model = selectM6View(store.getState().game!);
    render(<DiplomacyPanel />);
    const panel = screen.getByTestId('diplomacy-panel');
    expect(panel.closest('[class*="screen"]')).not.toBeNull();
    const roster = panel.querySelector('[class*="roster"]');
    expect(roster).not.toBeNull();
    const buttons = within(roster as HTMLElement).getAllByRole('button');
    expect(buttons.map((button) => button.textContent.split(' · ')[0])).toEqual(
      model.relations.map((clan) => clan.name),
    );
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(
      1,
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      t('ui.diplomacy.clans'),
      t('ui.court.title'),
      t('ui.shogunate.title'),
    ]);
  });

  it('retains six ordered proposals with all original cost/term/outlook and validator messages', () => {
    render(<DiplomacyPanel />);
    const panel = screen.getByTestId('diplomacy-panel');
    const register = panel.querySelector('[class*="proposals"]');
    expect(register).not.toBeNull();
    const kinds = [
      'proposeAlliance',
      'proposeMarriage',
      'proposeCeasefire',
      'demandVassal',
      'offerVassal',
      'requestReinforce',
    ] as const;
    expect(
      within(register as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(kinds.map((kind) => t(`cmd.diplomacy.${kind}`)));
    expect(
      within(register as HTMLElement).getByText(
        t('ui.diplomacy.remaining', { months: BAL.allianceMonths }),
      ),
    ).toBeTruthy();
    expect(
      within(register as HTMLElement).getByText(
        t('ui.diplomacy.remaining', { months: BAL.ceasefireMonths }),
      ),
    ).toBeTruthy();
    for (const button of within(register as HTMLElement).getAllByRole('button')) {
      if (button.hasAttribute('disabled')) {
        expect(button.title).not.toBe('');
        expect(button.getAttribute('aria-describedby')).toBeTruthy();
      }
    }
  });

  it('keeps real court/clan navigation and executor selection presentation-only', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(<DiplomacyPanel />);
    fireEvent.click(screen.getByRole('tab', { name: t('ui.court.title') }));
    expect(screen.getByRole('button', { name: t('cmd.court.requestRank') })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: t('ui.diplomacy.clans') }));
    const executor = screen.getByRole('combobox', { name: t('ui.diplomacy.workOfficer') });
    const choice = within(executor)
      .getAllByRole('option')
      .find((option) => option.getAttribute('value'))!;
    fireEvent.change(executor, { target: { value: choice.getAttribute('value') } });
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('uses only local token-backed hierarchy and physical floors without removing text or shared styles', () => {
    const css = readFileSync('src/ui/screens/DiplomacyPanel.module.css', 'utf8');
    expect(css).toContain('max-width: 100%');
    expect(css).toMatch(
      /\.screen \[data-testid='diplomacy-panel'\] > section > header\s*\{[^}]*justify-content: flex-start;[^}]*gap: var\(--space-4\)/,
    );
    expect(css).toMatch(/\.screen > div\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.roster\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.roster button\s*\{[^}]*flex-shrink:\s*0/);
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toMatch(/button:disabled\s*\{[^}]*opacity:\s*1/);
    expect(css).not.toContain('text-overflow: ellipsis');
    expect(css).not.toContain('display: none');
    expect(css).toContain('var(--command-gold)');
  });
});
