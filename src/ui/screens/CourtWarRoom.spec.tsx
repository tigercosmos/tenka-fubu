import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { getQueuedPlayerCommands, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { BAL } from '@core/balance';
import { t } from '@i18n/zh-TW';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { DiplomacyPanel } from './DiplomacyPanel';
import { injectCssVariables } from '../styles/tokens';

beforeEach(() => {
  resetBridgeForTests();
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.openPanel('diplomacy');
});

describe('Court war-room presentation', () => {
  it('resolves every local custom property from the real injected palette or its explicit fallback', () => {
    injectCssVariables();
    const css = readFileSync('src/ui/screens/CourtPage.module.css', 'utf8');
    const root = document.documentElement.style;
    const resolves = (
      name: string,
      fallback: string | undefined,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(name)) return false;
      seen.add(name);
      const value = root.getPropertyValue(name).trim() || fallback?.trim();
      if (!value) return false;
      return [...value.matchAll(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g)].every((match) =>
        resolves(match[1]!, match[2], new Set(seen)),
      );
    };
    for (const match of css.matchAll(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g)) {
      expect(resolves(match[1]!, match[2]), match[0]).toBe(true);
    }
    expect(resolves('--not-a-theme-token', undefined)).toBe(false);
    expect(resolves('--not-a-theme-token', 'var(--text-primary)')).toBe(true);
  });
  it('binds both real ladders to independent, full-text registers without changing ranks or commands', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(<DiplomacyPanel />);
    for (const target of ['court', 'shogunate'] as const) {
      fireEvent.click(screen.getByRole('tab', { name: t(`ui.${target}.title`) }));
      const table = screen.getByRole('table');
      expect(table.closest('[class*="register"]')).not.toBeNull();
      expect(table.closest('[class*="courtFrame"]')).not.toBeNull();
      const definitions = target === 'court' ? BAL.courtRankTable : BAL.shogunateTitleTable;
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(definitions.length);
      expect(
        rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent?.replace(/^✓ /, '')),
      ).toEqual(definitions.map((def) => def.name));
      expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
      expect(screen.getByRole('progressbar').getAttribute('max')).toBe('100');
    }
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('retains complete work, rank, mediation and nomination controls and their disabled reasons', () => {
    render(<DiplomacyPanel />);
    for (const target of ['court', 'shogunate'] as const) {
      fireEvent.click(screen.getByRole('tab', { name: t(`ui.${target}.title`) }));
      expect(screen.getByRole('heading', { name: t('ui.diplomacy.assignWork') })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: t('ui.diplomacy.workOfficer') })).toBeTruthy();
      expect(
        screen.getByRole('button', {
          name: t(target === 'court' ? 'cmd.court.requestRank' : 'cmd.shogunate.requestTitle'),
        }),
      ).toBeTruthy();
      for (const button of screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('disabled'))) {
        expect(button.title).not.toBe('');
      }
    }
  });

  it('keeps all rank text wrapped and headings glyph-safe inside screen-local scrolling owners', () => {
    const css = readFileSync('src/ui/screens/CourtPage.module.css', 'utf8');
    expect(css).toMatch(/\.courtFrame[^}]*font-size: max\(12px, var\(--font-size-sm\)\)/);
    expect(css).toMatch(/\.courtFrame h3[^}]*line-height: 1\.5/);
    expect(css).toMatch(/\.rankTable th,[\s\S]*?\.rankTable td[^}]*white-space: normal/);
    expect(css).toMatch(/\.dossier,[\s\S]*?\.register[^}]*overflow: auto/);
    expect(css).toMatch(/min-height: max\(32px, 2rem\)/);
    expect(css).not.toMatch(/text-overflow: ellipsis/);
  });
});
