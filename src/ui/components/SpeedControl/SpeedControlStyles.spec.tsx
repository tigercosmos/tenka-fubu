import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { SpeedControl, type GameSpeed } from './SpeedControl';
import speedStyles from './SpeedControl.module.css';
import iconStyles from '../IconButton/IconButton.module.css';
import { buildBaseCssVarEntries, UI_THEME } from '@ui/styles/tokens';

const sheets: HTMLStyleElement[] = [];

const rgb = (hex: string): string =>
  `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;

// Exercise the real rendered controls with their source styles. Resolve literal token values
// because jsdom cannot compute CSS custom properties. This is a supported-property cascade
// regression, not a browser layout, hover, GPU or screenshot acceptance test.
function attachStyles(css: string, classes: Record<string, string>): void {
  const variables = new Map<string, string>([
    ...buildBaseCssVarEntries(),
    ...Object.entries(UI_THEME),
  ]);
  const sheet = document.createElement('style');
  sheet.textContent = css
    .replace(/\.([a-zA-Z][\w-]*)/g, (match, name: string) =>
      classes[name] ? `.${classes[name]}` : match,
    )
    .replace(/var\((--[\w-]+)\)/g, (match, name: string) => variables.get(name) ?? match);
  document.head.append(sheet);
  sheets.push(sheet);
}

afterEach(() => {
  cleanup();
  for (const sheet of sheets.splice(0)) sheet.remove();
});

describe('SpeedControl selected-state source cascade', () => {
  it.each<GameSpeed>(['paused', 'x1', 'x2', 'x5'])(
    'visually distinguishes %s without relying on a parent HUD override',
    (speed) => {
      attachStyles(
        readFileSync('src/ui/components/IconButton/IconButton.module.css', 'utf8'),
        iconStyles,
      );
      attachStyles(
        readFileSync('src/ui/components/SpeedControl/SpeedControl.module.css', 'utf8'),
        speedStyles,
      );
      render(<SpeedControl speed={speed} onChange={vi.fn()} />);
      const buttons = screen.getAllByRole('button');
      const selected = buttons.find((button) => button.getAttribute('aria-pressed') === 'true')!;
      const inactive = buttons.find((button) => button.getAttribute('aria-pressed') === 'false')!;
      const selectedStyle = getComputedStyle(selected);
      expect(selectedStyle.backgroundColor).not.toBe(getComputedStyle(inactive).backgroundColor);
      expect(selectedStyle.backgroundColor).toBe(rgb(UI_THEME['--brand-red']));
      expect(selectedStyle.color).toBe(rgb(UI_THEME['--text-inverse']));
      expect(getComputedStyle(inactive).color).toBe(rgb(UI_THEME['--text-inverse']));
      expect(
        buttons.filter((button) => button.getAttribute('aria-pressed') === 'true'),
      ).toHaveLength(1);
    },
  );
});
