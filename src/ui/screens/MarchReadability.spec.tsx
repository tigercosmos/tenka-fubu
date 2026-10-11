import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { makeLoopTestState, TEST_CASTLE } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { UI_THEME } from '../styles/tokens';
import { MarchModal } from './MarchModal';
beforeEach(() => {
  const game = makeLoopTestState({ food: 20_000 });
  game.castles[TEST_CASTLE]!.soldiers = 8000;
  resetGameStoreForTests(game);
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setMarchDraft({
    originCastleId: TEST_CASTLE,
    leaderOfficerId: null,
    subOfficerIds: [],
    soldiers: 0,
    food: 0,
    targetNodeId: null,
    previewPath: null,
    previewDays: null,
    phase: 'compose',
    errorKey: null,
  });
});
afterEach(() => {
  cleanup();
  uiStore.getState().actions.reset();
});
it('targets only the actual compose owner footer with a physical text floor', () => {
  const css = readFileSync('src/ui/screens/MarchModal.module.css', 'utf8');
  expect(css).toMatch(
    /\[data-ui-dialog\]:has\(\.body\)\s*>\s*footer button\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/,
  );
});
it('keeps disabled compose actions opaque with readable token-backed paint', () => {
  const css = readFileSync('src/ui/screens/MarchModal.module.css', 'utf8');
  expect(css).toMatch(
    /\.body button:disabled,\s*\[data-ui-dialog\]:has\(\.body\)\s*>\s*footer button:disabled\s*\{[^}]*opacity:\s*1;[^}]*color:\s*var\(--text-secondary\);[^}]*background:\s*var\(--surface-raised\);[^}]*border-color:\s*var\(--stroke-subtle\)/,
  );
  const lum = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
        .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i]!, 0),
    a = lum(UI_THEME['--text-secondary']),
    b = lum(UI_THEME['--surface-raised']);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
it('retains disabled no-leader actions and genuine cancellation without dispatching', () => {
  const onCommand = vi.fn(),
    before = store.getState().game!;
  render(<MarchModal onCommand={onCommand} />);
  expect(screen.getByRole('button', { name: '在地圖選擇目標' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: /^出陣$/ })).toHaveProperty('disabled', true);
  expect(screen.getByTestId('march-modal').textContent).toContain(
    before.officers[before.clans[before.meta.playerClanId]!.leaderId]!.name,
  );
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(uiStore.getState().marchDraft).toBeNull();
  expect(store.getState().game).toBe(before);
  expect(onCommand).not.toHaveBeenCalled();
});
