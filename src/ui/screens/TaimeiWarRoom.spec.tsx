import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TaimeiPanel } from './TaimeiPanel';
import styles from './TaimeiPanel.module.css';
import { TAIMEI_CATALOG } from '@core/index';
import { resetGameStoreForTests, store } from '@app/store';
import { getBridgeProgressMark, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { useUIStore } from '../hooks/uiStore';
import { buildTinyState, CLAN_ALPHA } from '../../../tests/fixtures/tiny';
import { t } from '@i18n/zh-TW';

beforeEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
});
function mount(prestige = 1000) {
  const game = buildTinyState();
  game.clans[CLAN_ALPHA]!.prestige = prestige;
  game.clans[CLAN_ALPHA]!.gold = 1000;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  store.getState().actions.requestPause('user');
  render(<TaimeiPanel />);
  return game;
}

describe('Taimei war-room presentation', () => {
  it('binds the actual eight complete catalog entries to the framed catalog and prestige strip', () => {
    mount();
    const panel = screen.getByTestId('taimei-panel');
    expect(panel.querySelector(`.${styles.frame}`)).not.toBeNull();
    expect(panel.querySelector(`.${styles.prestige}`)?.textContent).toBe(
      t('ui.taimei.prestige', { value: 1000 }),
    );
    for (const def of TAIMEI_CATALOG) {
      const row = screen.getByRole('button', { name: new RegExp(`^${def.name}`) });
      expect(row.classList.contains(styles.card!)).toBe(true);
      expect(row.textContent).toContain(def.description);
      expect(row.textContent).toContain(t('ui.taimei.cost', { cost: def.prestigeCost }));
      expect(row.textContent).toContain(
        def.durationDays === 0
          ? t('ui.taimei.instant')
          : t('ui.taimei.duration', { days: def.durationDays }),
      );
    }
  });
  it('preserves catalog order, selected dossier and state without queueing on navigation', () => {
    const game = mount(),
      before = structuredClone(game);
    const rows = [...screen.getByTestId('taimei-panel').querySelectorAll(`.${styles.card}`)];
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(
      TAIMEI_CATALOG.map((def) => def.name),
    );
    for (const def of TAIMEI_CATALOG) {
      const row = screen.getByRole('button', { name: new RegExp(`^${def.name}`) });
      fireEvent.click(row);
      expect(row.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('region', { name: t('ui.taimei.detail') }).textContent).toContain(
        def.description,
      );
    }
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });
  it('keeps real owned cancel-first confirmation and rejection reasons unchanged', () => {
    const game = mount(),
      before = structuredClone(game);
    const detail = screen.getByRole('region', { name: t('ui.taimei.detail') });
    fireEvent.click(within(detail).getByRole('button', { name: t('ui.taimei.invoke') }));
    expect(screen.getByRole('dialog').textContent).toContain(
      t('ui.taimei.confirm', {
        name: TAIMEI_CATALOG[0]!.name,
        cost: TAIMEI_CATALOG[0]!.prestigeCost,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });
  it('keeps readable local material, independent scroll and actual wider minimap clearance', () => {
    const css = readFileSync('src/ui/screens/TaimeiPanel.module.css', 'utf8');
    expect(css).toMatch(/\.frame\s*\{[^}]*background:\s*var\(--surface-panel\)/);
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toContain('grid-auto-rows: max-content');
    expect(css).toMatch(/\.grid\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.detail\s*\{[^}]*max-height:\s*calc\(100% - min\(192px, 14rem\)\)/);
    expect(css).toMatch(/\.detail\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toMatch(/\.card\s*\{[^}]*font-weight:\s*400/);
    expect(css).toMatch(/header\s*\{[^}]*justify-content:\s*flex-start/);
    expect(css).toMatch(/button:disabled\s*\{[^}]*opacity:\s*1/);
  });
});
