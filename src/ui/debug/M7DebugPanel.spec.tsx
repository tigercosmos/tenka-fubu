import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { store, resetGameStoreForTests } from '@app/store';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../../../tests/fixtures/tiny';
import { t } from '@i18n/zh-TW';
import { M7DebugPanel } from './M7DebugPanel';

beforeEach(() => {
  resetGameStoreForTests(buildTinyState());
});
afterEach(() => {
  cleanup();
  resetGameStoreForTests();
});

it('is hidden with the existing closed debug flag and safely handles an unbooted game', () => {
  const { container, unmount } = render(<M7DebugPanel />);
  expect(container.childElementCount).toBe(0);
  unmount();
  resetGameStoreForTests();
  store.getState().actions.setDebugPanelOpen(true);
  render(<M7DebugPanel />);
  expect(screen.getByText(t('ui.debugAi.empty'))).toBeTruthy();
  expect(screen.getByText(t('ui.debugAi.budgetUnavailable'))).toBeTruthy();
});

it('filters clan/day/layer/kind and displays score/command details without canonical writes', () => {
  const game = store.getState().game!;
  game.ai.intentLog = [
    {
      day: 10,
      clanId: CLAN_ALPHA,
      layer: 'corps',
      kind: 'expand.select',
      detail: { castle: '城' },
      scores: [{ label: 'value', value: 12 }],
      commands: [{ type: 'debugGrant', clanId: CLAN_ALPHA, gold: 100, food: null, castleId: null }],
    },
    {
      day: 11,
      clanId: CLAN_BETA,
      layer: 'reactive',
      kind: 'defense.hold',
      detail: { ratio: 0.5 },
      scores: null,
      commands: [],
    },
  ];
  store.getState().actions.setDebugPanelOpen(true);
  const before = structuredClone(game);
  render(<M7DebugPanel />);
  expect(screen.getAllByTestId('ai-intent-row')).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.debugAi.filterClan') }), {
    target: { value: CLAN_ALPHA },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: t('ui.debugAi.filterDay') }), {
    target: { value: '10' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.debugAi.filterLayer') }), {
    target: { value: 'corps' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: t('ui.debugAi.filterKind') }), {
    target: { value: 'expand' },
  });
  expect(screen.getAllByTestId('ai-intent-row')).toHaveLength(1);
  expect(screen.getByText(/"value": 12/)).toBeTruthy();
  expect(screen.getByText(/"type": "debugGrant"/)).toBeTruthy();
  expect(game).toEqual(before);
  expect(store.getState().session.pendingCommandCount).toBe(0);
});

it('caps the snapshot at1024 entries and the DOM at50 rows with native pagination', () => {
  const game = store.getState().game!;
  game.ai.intentLog = Array.from({ length: 1300 }, (_, day) => ({
    day,
    clanId: CLAN_ALPHA,
    layer: 'council' as const,
    kind: 'defense.hold',
    detail: {},
    scores: null,
    commands: [],
  }));
  store.getState().actions.setDebugPanelOpen(true);
  render(<M7DebugPanel />);
  expect(screen.getAllByTestId('ai-intent-row')).toHaveLength(50);
  expect(screen.getByRole('status').textContent).toBe(
    t('ui.debugAi.page', { page: 1, pages: 21, count: 1024 }),
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.debugAi.next') }));
  expect(screen.getByRole('status').textContent).toBe(
    t('ui.debugAi.page', { page: 2, pages: 21, count: 1024 }),
  );
  expect(screen.getAllByTestId('ai-intent-row')).toHaveLength(50);
});
