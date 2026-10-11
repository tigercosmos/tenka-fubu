import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { buildTinyState } from '../fixtures/tiny';
import { Badge } from '../../src/ui/components/Badge/Badge';
import badgeStyles from '../../src/ui/components/Badge/Badge.module.css';
import { UI_THEME, TOKENS } from '../../src/ui/styles/tokens';

beforeEach(() => resetGameStoreForTests(buildTinyState()));
afterEach(() => {
  cleanup();
  resetGameStoreForTests(null);
});

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = rgb.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

it('source contrast contract: ResourceBar supplies its own command surface on light hosts', () => {
  const css = readFileSync('src/ui/components/ResourceBar/ResourceBar.module.css', 'utf8');
  expect(css.match(/\.root\s*\{([^}]+)\}/)?.[1]).toMatch(/background:\s*var\(--surface-command\)/);
  for (const foreground of ['--text-inverse', '--command-muted', '--command-gold'] as const)
    expect(contrast(UI_THEME[foreground], UI_THEME['--surface-command'])).toBeGreaterThanOrEqual(
      4.5,
    );
});

it('actual neutral labeled Badge uses a readable foreground without changing its swatch color', () => {
  const before = structuredClone(store.getState().game);
  render(<Badge label="浪人" />);
  const badge = screen.getByText('浪人');
  expect(badge.classList.contains(badgeStyles.neutral!)).toBe(true);
  expect(badge.style.backgroundColor).toBe('var(--neutral-clanless)');
  const css = readFileSync('src/ui/components/Badge/Badge.module.css', 'utf8');
  expect(css.match(/\.neutral\s*\{([^}]+)\}/)?.[1]).toMatch(/color:\s*var\(--surface-command\)/);
  expect(
    contrast(UI_THEME['--surface-command'], TOKENS.color.neutralClanless),
  ).toBeGreaterThanOrEqual(4.5);
  expect(store.getState().game).toEqual(before);
});

it('retains actual clan color and unlabeled swatch semantics', () => {
  const game = store.getState().game!;
  const clan = game.clans[game.meta.playerClanId]!;
  const before = structuredClone(game);
  const view = render(<Badge clanId={clan.id} label="勢力" />);
  const badge = screen.getByText('勢力');
  expect(badge.classList.contains(badgeStyles.neutral!)).toBe(false);
  expect(badge.style.backgroundColor).toBe(
    `var(--clan-${String(clan.colorIndex).padStart(2, '0')}-bright)`,
  );
  view.rerender(<Badge />);
  const swatch = view.container.querySelector('span')!;
  expect(swatch.classList.contains(badgeStyles.swatch!)).toBe(true);
  expect(swatch.style.backgroundColor).toBe('var(--neutral-clanless)');
  expect(swatch.textContent).toBe('');
  expect(game).toEqual(before);
});
