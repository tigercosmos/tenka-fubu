import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { buildTinyState, OFF_ALPHA_BUSHO } from '../../../tests/fixtures/tiny';
import { t } from '@i18n/zh-TW';
import { uiStore } from '../hooks/uiStore';
import { CorpsScreen } from './CorpsScreen';

beforeEach(() => {
  resetBridgeForTests();
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
  for (const castle of Object.values(game.castles))
    if (castle.ownerClanId === game.meta.playerClanId) castle.directControl = true;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});

describe('Corps war-room presentation', () => {
  it('emits dedicated inline policy choices around the real radios and complete captions', () => {
    render(<CorpsScreen />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const [index, value] of (['advance', 'hold', 'develop'] as const).entries()) {
      const label = radios[index]!.closest('label')!;
      expect(label.textContent).toBe(t(`ui.corps.${value}`));
      expect(label.className).toContain('directiveOption');
    }
    expect(screen.getByRole('group', { name: t('ui.corps.directive') }).className).toContain(
      'directive',
    );
  });

  it('retains complete owned-castle labels, tax information and original navigation/action order', () => {
    render(<CorpsScreen />);
    const panel = screen.getByTestId('corps-panel');
    expect(panel.closest('[class*="screen"]')).not.toBeNull();
    expect(screen.getByText(t('ui.corps.select'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
    const game = store.getState().game!;
    const expected = Object.values(game.castles)
      .filter(
        (castle) =>
          castle.ownerClanId === game.meta.playerClanId &&
          castle.directControl &&
          castle.corpsId === null,
      )
      .map((castle) => castle.name);
    expect(
      screen.getAllByRole('checkbox').map((input) => input.closest('label')!.textContent),
    ).toEqual(expected);
    for (const input of screen.getAllByRole('checkbox'))
      expect(input.closest('label')!.className).toContain('castleRow');
    expect(screen.getByText(t('ui.corps.tithe'))).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '',
      t('ui.corps.create'),
      t('ui.corps.create'),
    ]);
    const submit = screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!;
    expect(submit.hasAttribute('disabled')).toBe(true);
    expect(submit.getAttribute('aria-describedby')).toBeTruthy();
    expect(submit.title).toBe(t('cmd.reject.invalidTarget'));
  });

  it('keeps real directive/target/castle changes local and preserves create validation without queuing', () => {
    render(<CorpsScreen />);
    const before = structuredClone(store.getState().game!);
    fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
    fireEvent.click(screen.getByRole('radio', { name: t('ui.corps.advance') }));
    expect(screen.getByRole('combobox', { name: t('ui.corps.target') })).toBeTruthy();
    expect(screen.getByText(t('ui.corps.advanceEffect'))).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: t('ui.corps.develop') }));
    expect(screen.queryByRole('combobox', { name: t('ui.corps.target') })).toBeNull();
    expect(screen.getByText(t('ui.corps.developEffect'))).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: t('ui.corps.hold') }));
    const castle = screen.getAllByRole('checkbox')[0]!;
    fireEvent.click(castle);
    expect(
      screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!.hasAttribute('disabled'),
    ).toBe(false);
    fireEvent.click(castle);
    expect(
      screen.getAllByRole('button', { name: t('ui.corps.create') })[1]!.hasAttribute('disabled'),
    ).toBe(true);
    expect(store.getState().game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });

  it('uses screen-local token materials, inline choices and physical floors without hiding content', () => {
    const css = readFileSync('src/ui/screens/CorpsScreen.module.css', 'utf8');
    expect(css).toMatch(/\.screen > div\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(
      /\[data-testid='corps-panel'\] > section > header\s*\{[^}]*justify-content: flex-start;[^}]*gap: var\(--space-4\)/,
    );
    expect(css).toMatch(/\.roster\s*\{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.roster button\s*\{[^}]*flex-shrink: 0/);
    expect(css).toMatch(
      /\.directive\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
    );
    expect(css).toMatch(/\.castles\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(
      /\.frame \.editor \.directiveOption\s*\{[^}]*display: flex;[^}]*align-items: center/,
    );
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).not.toMatch(/#[\da-fA-F]{3,8}\b|text-overflow|line-clamp|display:\s*none/);
  });
});
