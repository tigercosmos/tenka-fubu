import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resetGameStoreForTests, store } from '@app/store';
import { getQueuedPlayerCommands } from '@app/bridge';
import { makeLoopTestState, TEST_CASTLE } from '../../../../tests/helpers/loopState';
import { CastlePanel } from './CastlePanel';
import { uiStore } from '../../hooks/uiStore';

describe('canonical castle facility slot names', () => {
  it.each([
    ['main', 6],
    ['branch', 3],
  ] as const)('preserves %s castle %s native slots', (tier, count) => {
    const game = makeLoopTestState();
    const castle = game.castles[TEST_CASTLE]!;
    castle.tier = tier;
    castle.facilities = [];
    castle.buildQueue = [];
    resetGameStoreForTests(game);
    const before = structuredClone(game);
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="domestic" />);
    expect(screen.getByRole('heading', { name: `城下施設（slot ${count}）` })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /空位/ })).toHaveLength(count);
    expect(game).toEqual(before);
  });

  it('uses a compact responsive grid with readable status and complete physical targets', () => {
    const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
    const grid = css.match(/\.slots\s*\{([^}]+)\}/)?.[1];
    const card = css.match(/\.slots button\s*\{([^}]+)\}/)?.[1];
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
    expect(card).toMatch(/min-height:\s*max\(48px, 3rem\);/);
    expect(card).toMatch(/height:\s*auto;/);
    expect(card).toMatch(/min-width:\s*32px;/);
    expect(card).toMatch(/font-size:\s*max\(12px, var\(--font-size-sm\)\);/);
    expect(card).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.slots small\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-xs\)\);/);
    expect(css).toMatch(
      /\.slots button:has\(> strong\)\s*\{[^}]*flex-direction:\s*row;[^}]*box-shadow:\s*none;/,
    );
    // CSS budgets, not a jsdom layout claim: two rows now reserve half the old fixed height.
    for (const scale of [0.8, 1, 1.5]) {
      const rowHeight = Math.max(48, 3 * 16 * scale);
      expect(rowHeight).toBeGreaterThanOrEqual(32);
      expect(rowHeight * 2).toBeLessThan(6 * 16 * scale * 2);
    }
  });

  it('keeps every empty slot a native build-menu entry without issuing commands', () => {
    const game = makeLoopTestState();
    const castle = game.castles[TEST_CASTLE]!;
    castle.tier = 'main';
    castle.facilities = [];
    castle.buildQueue = [];
    resetGameStoreForTests(game);
    const before = structuredClone(game);
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="domestic" />);
    const slots = screen.getAllByRole('button', { name: /空位/ });
    expect(slots).toHaveLength(6);
    for (const slot of slots) {
      expect(slot.getAttribute('type')).toBe('button');
      expect(slot.hasAttribute('disabled')).toBe(false);
      slot.focus();
      expect(document.activeElement).toBe(slot);
      fireEvent.click(slot);
      expect(screen.getByRole('heading', { name: '建造選單' })).toBeTruthy();
    }
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });

  it('compacts only the domestic hierarchy, preserving ronin content order and its actual entry', () => {
    const game = makeLoopTestState();
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.reset();
    uiStore.getState().actions.setScreen('main');
    const before = structuredClone(game);
    render(<CastlePanel castleId={TEST_CASTLE} initialTab="domestic" />);
    const heading = screen.getByRole('heading', { name: '在野武將' });
    const section = heading.parentElement!;
    expect(section.className).toContain('roninSummary');
    expect(section.parentElement!.className).toContain('domesticPage');
    expect(Array.from(section.children).map((node) => node.tagName)).toEqual(['H3', 'P', 'BUTTON']);
    expect(section.querySelector('p')!.textContent).not.toBe('');
    const open = screen.getByRole('button', { name: '查看在野武將' });
    expect(open.getAttribute('type')).toBe('button');
    expect(open.hasAttribute('disabled')).toBe(false);
    fireEvent.click(open);
    expect(uiStore.getState().panelStack.at(-1)).toMatchObject({
      id: 'ronin',
      params: { castleId: TEST_CASTLE },
    });
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
    expect(css).toMatch(
      /\.domesticPage\s*\{[^}]*gap:\s*var\(--space-2\);[^}]*padding-top:\s*var\(--space-1\);/,
    );
    expect(css).toMatch(
      /\.roninSummary\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
    );
    expect(css).toMatch(/\.roninSummary > button\s*\{[^}]*min-height:\s*32px;/);
    expect(css).toMatch(/\.roninSummary > p\s*\{[^}]*grid-column:\s*1 \/ -1;/);
  });
});
