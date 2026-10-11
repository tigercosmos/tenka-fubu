import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { SystemMenu } from './SystemMenu';
import { UI_THEME } from '../styles/tokens';

beforeEach(() => {
  resetBridgeForTests();
  const game = makeLoopTestState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
it('keeps five canonical buttons in original DOM order with only resume/exit presentation roles', () => {
  render(<SystemMenu onReturnToTitle={() => {}} onOpenSaveLoad={() => {}} />);
  const buttons = within(screen.getByRole('navigation', { name: '系統選單' })).getAllByRole(
    'button',
  );
  expect(buttons.map((e) => e.textContent)).toEqual([
    '回到遊戲',
    '存檔',
    '讀檔',
    '設定',
    '回到標題',
  ]);
  expect(buttons[0]!.className).toContain('resume');
  expect(buttons[4]!.className).toContain('titleExit');
  expect(buttons.slice(1, 4).every((e) => e.className === '')).toBe(true);
});
it('declares a local single-column intrinsic layout with font/hit floors and restrained hierarchy', () => {
  const css = readFileSync('src/ui/screens/SystemMenu.module.css', 'utf8');
  expect(css).toContain('grid-auto-rows: max-content');
  expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
  expect(css).toContain('min-width: 32px');
  expect(css).toContain('min-height: max(32px, 2rem)');
  expect(css).toContain('border-left: 3px solid var(--brand-gold)');
  expect(css).toContain('color: var(--brand-red)');
  expect(css).not.toContain('grid-template-columns');
  expect(css).not.toContain(':global');
  expect(css).not.toContain('display: none');
});
it('retains unavailable save/load/title controls and the unchanged reason binding', () => {
  render(<SystemMenu saveUnavailableReason="Original unavailable reason" />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '存檔' }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '讀檔' }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '回到標題' }).disabled).toBe(true);
  expect(screen.getByText('Original unavailable reason').id).toBe('system-save-unavailable');
});
it('keeps unavailable controls and the reason readable without global disabled opacity', () => {
  const css = readFileSync('src/ui/screens/SystemMenu.module.css', 'utf8');
  expect(css).toMatch(
    /\.menu button:disabled\s*\{\s*opacity: 1;\s*color: var\(--text-secondary\);\s*border-color: var\(--stroke-subtle\);\s*\}/,
  );
  expect(css).toMatch(
    /\.menu p\s*\{\s*color: var\(--text-inverse\);\s*font-size: max\(12px, var\(--font-size-sm\)\);\s*\}/,
  );
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return rgb
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  };
  for (const [foreground, background] of [
    [UI_THEME['--text-secondary'], UI_THEME['--surface-panel']],
    [UI_THEME['--text-inverse'], UI_THEME['--surface-command']],
  ]) {
    const a = luminance(foreground!),
      b = luminance(background!);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
it('keeps dirty title behind the original cancel-first owner and returns to the unchanged menu', () => {
  const title = vi.fn(),
    save = vi.fn();
  render(<SystemMenu onReturnToTitle={title} onOpenSaveLoad={save} dirty />);
  const before = structuredClone(store.getState().game);
  fireEvent.click(screen.getByRole('button', { name: '回到標題' }));
  expect(title).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: '回到標題' });
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.getByRole('navigation', { name: '系統選單' })).toBeTruthy();
  expect(title).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  expect(store.getState().game).toEqual(before);
});
