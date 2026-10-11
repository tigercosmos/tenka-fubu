import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { getQueuedPlayerCommands, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests } from '@app/store';
import { t } from '@i18n/zh-TW';
import { buildTinyState, OFF_ALPHA_TAISHO } from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { OfficerList } from './OfficerList';
import styles from './OfficerList.module.css';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

describe('Officer war-room register presentation', () => {
  it('groups both original personnel actions before the four original filters and eleven columns', () => {
    resetGameStoreForTests(buildTinyState());
    render(<OfficerList onClose={vi.fn()} />);
    const list = screen.getByTestId('officer-list');
    const actions = list.querySelector(`.${styles.actions}`);
    expect(actions).not.toBeNull();
    expect(
      within(actions as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([t('ui.recruit.title'), t('ui.reward.title')]);
    const filters = list.querySelector(`.${styles.filters}`)!;
    expect(actions!.compareDocumentPosition(filters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(filters as HTMLElement).getAllByRole('combobox')).toHaveLength(3);
    expect(within(filters as HTMLElement).getByRole('searchbox')).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(11);
    expect(screen.getByRole('button', { name: t('ui.officer.traits') })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('keeps recruitment and rewards connected to their existing UI routes without game commands', () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const before = structuredClone(game);
    render(<OfficerList onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.recruit.title') }));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('ronin');
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.title') }));
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('preserves full trait titles, risk markers and ordinary detail opening', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    officer.loyalty = 29;
    resetGameStoreForTests(game);
    const onOpenOfficer = vi.fn();
    render(<OfficerList onClose={vi.fn()} onOpenOfficer={onOpenOfficer} />);
    const row = screen.getByText(officer.name).closest('tr')!;
    expect(row.querySelector('[data-loyalty-risk="true"]')).not.toBeNull();
    expect(row.querySelector(`.${styles.traits}`)!.getAttribute('title')).toContain(
      t('ui.officer.loyaltyRisk'),
    );
    fireEvent.click(within(row).getByText(officer.name));
    expect(onOpenOfficer).toHaveBeenCalledWith(officer.id);
  });

  it('uses a compact token-backed command register with local physical floors and unchanged trait truncation', () => {
    const css = readFileSync('src/ui/screens/OfficerList.module.css', 'utf8');
    expect(css).toContain('.actions {');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(12rem, 1.4fr)');
    expect(css).toContain('background: var(--surface-command)');
    expect(css).toContain('border: 1px solid var(--command-gold)');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toMatch(/\.tableShell th button:disabled\s*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/\.traits\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.traits\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toContain('color: var(--status-danger)');
    expect(css).toContain('color: var(--status-warning)');
  });
});
