import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
  dispatchCommand,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
  getQueuedPlayerCommands,
} from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { validateState } from '@core/state/invariants';
import { ArmyOrdersControl } from '../../army/ArmyOrdersControl';
import { ArmyAutoReturnControl } from '../../army/ArmyAutoReturnControl';
import { selectArmyOrders } from '../../army/orders';
import { selectArmyAutoReturn } from '../../army/autoReturn';
import { ContextPanel } from './ContextPanel';
import styles from './ContextPanel.module.css';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
} from '../../../../tests/fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

it('provides distinct facts-first and action-side JSX regions for a compact wide context', () => {
  const view = render(
    <ContextPanel
      open
      title="Castle"
      height={112}
      onClose={vi.fn()}
      actions={<button type="button">Deploy</button>}
    >
      <dl data-testid="castle-facts">
        <dt>Soldiers</dt>
        <dd>101</dd>
      </dl>
    </ContextPanel>,
  );
  // Structural contract only: jsdom does not measure grid or native viewport pixels.
  const body = view.container.querySelector(`.${styles.body}`);
  expect(body).not.toBeNull();
  const facts = screen.getByTestId('castle-facts').closest(`.${styles.facts}`)!;
  const actions = screen.getByRole('button', { name: 'Deploy' }).closest(`.${styles.actions}`)!;
  expect(facts.parentElement).toBe(body);
  expect(actions.parentElement).toBe(body);
  expect(facts.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});

it('keeps real deployed-army controls in a wrapping side region after primary facts within a bounded body', () => {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  expect(
    dispatchCommand({
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_B1,
    }),
  ).toEqual({ ok: true });
  runOneDay();
  expect(validateState(game)).toEqual([]);
  const army = Object.values(game.armies).find((entry) => entry.clanId === CLAN_ALPHA)!;
  const orders = selectArmyOrders(game, army.id)!;
  const autoReturn = selectArmyAutoReturn(game, army.id)!;
  const before = structuredClone(game);
  const pending = getQueuedPlayerCommands(game);
  const recall = vi.fn(),
    retarget = vi.fn(),
    toggle = vi.fn(),
    close = vi.fn();
  render(
    <ContextPanel
      open
      title="Army context"
      onClose={close}
      actions={
        <div>
          <ArmyAutoReturnControl view={autoReturn} onToggle={toggle} />
          <ArmyOrdersControl view={orders} onRecall={recall} onRetarget={retarget} />
        </div>
      }
    >
      <dl data-testid="army-facts">
        <dt>Soldiers</dt>
        <dd>{army.soldiers}</dd>
      </dl>
    </ContextPanel>,
  );
  const actions = screen.getByTestId('army-orders-control').closest(`.${styles.actions}`)!;
  const facts = screen.getByTestId('army-facts');
  const factsRegion = facts.closest(`.${styles.facts}`)!;
  expect(actions.parentElement).toBe(factsRegion.parentElement);
  expect(factsRegion.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
    0,
  );
  expect(screen.getByTestId('army-auto-return-control')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual(pending);
  fireEvent.click(screen.getByTestId('army-recall'));
  expect(recall).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Army context' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(game).toEqual(before);
  const css = readFileSync('src/ui/components/ContextPanel/ContextPanel.module.css', 'utf8');
  const actionRule = css.match(/\.actions\s*\{([^}]+)\}/)![1]!;
  expect(actionRule).toMatch(/position:\s*static/);
  expect(actionRule).toMatch(/flex-wrap:\s*wrap/);
  // Reject positioned overlays, not normal-flow border-top/padding-top.
  expect(actionRule).not.toMatch(/^\s*(?:top|right):/m);
  expect(css).toMatch(/\.root\s*>\s*section\s*>\s*div\s*\{[^}]*overflow-y:\s*auto/s);
  expect(css).toMatch(/\.actions button\s*\{[^}]*min-height:\s*32px/s);
  expect(css).toMatch(/@media\s*\(min-width:\s*64rem\)/);
  expect(css).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(15rem, 35%\)/);
  expect(css).toMatch(/\.hasActions > \.facts,[\s\S]*?overflow-y:\s*auto/);
  expect(css).not.toMatch(/position:\s*absolute/);
});

it('keeps native keyboard order close, scrollable facts, then every action and lets Escape bubble', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  const escape = vi.fn();
  window.addEventListener('keydown', escape);
  try {
    const view = render(
      <ContextPanel
        open
        title="Context"
        onClose={close}
        actions={
          <>
            <button type="button">First</button>
            <button type="button">Second</button>
          </>
        }
      >
        <p>Current facts</p>
      </ContextPanel>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Context' }));
    await user.tab();
    expect(document.activeElement).toBe(view.container.querySelector(`.${styles.facts}`));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Second' }));
    escape.mockClear();
    await user.keyboard('{Escape}');
    expect(escape).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Context' }));
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('keydown', escape);
  }
});

it('retains closed visibility and custom height without an empty action divider', () => {
  const close = vi.fn();
  const view = render(
    <ContextPanel open={false} title="Castle context" height={320} onClose={close}>
      <p>Castle facts</p>
    </ContextPanel>,
  );
  const root = view.container.firstElementChild as HTMLElement;
  expect(root.getAttribute('aria-hidden')).toBe('true');
  expect(root.hasAttribute('inert')).toBe(true);
  expect(root.style.height).toBe('20rem');
  expect(root.style.maxHeight).toBe('calc(100dvh - 3rem)');
  expect(root.style.overflowY).toBe('auto');
  expect(view.container.querySelector(`.${styles.actions}`)).toBeNull();
  view.rerender(
    <ContextPanel open title="Castle context" height={320} onClose={close}>
      <p>Castle facts</p>
    </ContextPanel>,
  );
  expect(root.hasAttribute('inert')).toBe(false);
  expect(root.getAttribute('aria-hidden')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Castle context' }));
  expect(close).toHaveBeenCalledTimes(1);
});
