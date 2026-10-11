import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { t } from '@i18n/zh-TW';
import { makeLoopTestState, TEST_CASTLE, TEST_LEADER } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { MarchModal } from './MarchModal';
import styles from './MarchModal.module.css';

beforeEach(() => {
  const game = makeLoopTestState({ food: 20_000 });
  game.castles[TEST_CASTLE]!.soldiers = 8_000;
  resetGameStoreForTests(game);
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setMarchDraft({
    originCastleId: TEST_CASTLE,
    leaderOfficerId: TEST_LEADER,
    subOfficerIds: [],
    soldiers: 1_000,
    food: 1_000,
    targetNodeId: null,
    previewPath: null,
    previewDays: null,
    phase: 'compose',
    errorKey: null,
  });
});

describe('March war-room composition presentation', () => {
  it('groups personnel before logistics without changing the original control order', () => {
    render(<MarchModal />);
    const modal = screen.getByTestId('march-modal');
    const personnel = modal.querySelector(`.${styles.personnel}`);
    const orders = modal.querySelector(`.${styles.orders}`);
    expect(personnel).not.toBeNull();
    expect(orders).not.toBeNull();
    expect(personnel!.compareDocumentPosition(orders!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(personnel as HTMLElement).getAllByRole('heading')).toHaveLength(2);
    expect(within(orders as HTMLElement).getAllByRole('heading')).toHaveLength(1);
    expect(within(orders as HTMLElement).getAllByRole('slider')).toHaveLength(2);
    expect(
      screen
        .getByTestId(`march-general-${TEST_LEADER}`)
        .querySelector('button')!
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('retains full officer text, enabled target action and cancel without issuing a command', () => {
    const onCommand = vi.fn();
    const before = store.getState().game!;
    render(<MarchModal onCommand={onCommand} />);
    const general = screen.getByTestId(`march-general-${TEST_LEADER}`);
    expect(general.textContent).toContain(before.officers[TEST_LEADER]!.name);
    expect(general.querySelector('small')!.textContent.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: t('ui.march.pickTargetAction') })).toHaveProperty(
      'disabled',
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(uiStore.getState().marchDraft).toBeNull();
    expect(store.getState().game).toBe(before);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('uses token-backed formation registers, responsive columns and physical readability floors', () => {
    const css = readFileSync('src/ui/screens/MarchModal.module.css', 'utf8');
    expect(css).toContain('grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr)');
    expect(css).toContain('background: var(--surface-command)');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('.body button,');
    expect(css).toContain('.body input,');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('@media (max-width: 700px)');
    expect(css).not.toContain('min-height: 32rem');
    expect(css).not.toContain('text-overflow: ellipsis');
  });
});
