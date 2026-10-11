import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { t } from '@i18n/zh-TW';
import { uiStore } from '../hooks/uiStore';
import { PlotPanel } from './PlotPanel';
import { readFileSync } from 'node:fs';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(buildTinyState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});

describe('Plot war-room presentation', () => {
  it('binds complete strategy captions directly to dedicated inline radio choices', () => {
    render(<PlotPanel />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const [index, kind] of (['poach', 'rumor', 'betrayal'] as const).entries()) {
      const label = radios[index]!.closest('label')!;
      expect(label.textContent).toBe(t(`term.plot.${kind}`));
      expect(label.className).toContain('strategyOption');
    }
  });

  it('preserves full form labels, source option ordering and validator rejection', () => {
    render(<PlotPanel />);
    const labels = ['targetClan', 'target', 'executor', 'investGold'] as const;
    for (const label of labels)
      expect(screen.getByRole('combobox', { name: t(`ui.plot.${label}`) })).toBeTruthy();
    const start = screen.getByRole('button', { name: t('cmd.plot.start') });
    expect(start.hasAttribute('disabled')).toBe(true);
    expect(start.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '',
      t('cmd.plot.start'),
      t('ui.common.cancel'),
    ]);
    const game = store.getState().game!;
    expect(
      [...screen.getByRole<HTMLSelectElement>('combobox', { name: t('ui.plot.executor') }).options]
        .slice(1)
        .map((option) => option.textContent),
    ).toEqual(
      Object.values(game.officers)
        .filter(
          (officer) => officer.clanId === game.meta.playerClanId && officer.status === 'serving',
        )
        .map((officer) => officer.name),
    );
  });

  it('keeps real mode edits and cancellation local without changing game or queue', () => {
    render(<PlotPanel />);
    const before = structuredClone(store.getState().game!);
    const count = store.getState().session.pendingCommandCount;
    fireEvent.click(screen.getByRole('radio', { name: t('term.plot.rumor') }));
    const castleMode = screen.getByRole('checkbox', { name: t('ui.plot.castleMode') });
    fireEvent.click(castleMode);
    expect((castleMode as HTMLInputElement).checked).toBe(true);
    const investment = screen.getByRole('spinbutton', { name: t('ui.plot.investGold') });
    expect((investment as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: t('term.plot.betrayal') }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(count);
    expect(screen.getByRole('button', { name: t('cmd.plot.start') }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('keeps layout/material values screen-local, physical floors and full wrapping', () => {
    const css = readFileSync('src/ui/screens/PlotPanel.module.css', 'utf8');
    expect(css).toContain('justify-content: flex-start');
    expect(css).toMatch(
      /\[data-testid='plot-panel'\] > section > header\s*\{[^}]*justify-content: flex-start/,
    );
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('font-size: max(12px, 1rem)');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('opacity: 1');
    expect(css).toMatch(/\.frame\s*\{[^}]*background: var\(--surface-panel\)/);
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|text-overflow|display:\s*none|visibility:\s*hidden/i);
  });
});
