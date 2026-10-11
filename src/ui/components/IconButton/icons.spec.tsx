import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, type IconName } from './icons';
import { IconButton } from './IconButton';

const additions = [
  'army',
  'road',
  'bridge',
  'terrain',
  'layer',
  'supply',
  'morale',
  'siege',
  'warning',
  'blocked',
  'eye',
  'eye-off',
] as const satisfies readonly IconName[];

describe('original six-family SVG vocabulary', () => {
  for (const size of [16, 24, 32]) {
    it.each(additions)(
      `renders %s at ${size}px without text, external assets or global IDs`,
      (name) => {
        const markup = renderToStaticMarkup(<Icon name={name} width={size} height={size} />);
        const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        const svg = doc.documentElement;
        expect(svg.tagName).toBe('svg');
        expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg.getAttribute('width')).toBe(String(size));
        expect(svg.getAttribute('height')).toBe(String(size));
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('stroke-width')).toBe('1.75');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.querySelectorAll('path,circle').length).toBeGreaterThan(0);
        expect(svg.querySelector('text,image,use,foreignObject,[id]')).toBeNull();
        expect(svg.textContent).toBe('');
        expect(renderToStaticMarkup(<Icon name={name} width={size} height={size} />)).toBe(markup);
      },
    );
  }

  it('removes small-scale detail rather than scaling dense contours unchanged', () => {
    for (const name of ['army', 'road', 'terrain', 'supply'] as const) {
      const compact = renderToStaticMarkup(<Icon name={name} width={16} />);
      const regular = renderToStaticMarkup(<Icon name={name} width={24} />);
      const contours = (markup: string) =>
        new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement.innerHTML;
      expect(contours(compact)).not.toBe(contours(regular));
      expect(contours(renderToStaticMarkup(<Icon name={name} style={{ width: '16px' }} />))).toBe(
        contours(compact),
      );
    }
  });

  it('preserves representative pre-existing icon geometry', () => {
    for (const [name, path] of [
      ['close', 'M5 5l14 14M19 5L5 19'],
      ['flag', 'M6 21V4m0 1h11l-2 4 2 4H6'],
      ['castle', 'M4 21V9h4V5h3v4h2V5h3v4h4v12M3 21h18M9 21v-5h6v5'],
    ] as const) {
      const markup = renderToStaticMarkup(<Icon name={name} width={16} />);
      expect(
        new DOMParser()
          .parseFromString(markup, 'image/svg+xml')
          .querySelector('path')
          ?.getAttribute('d'),
      ).toBe(path);
    }
  });

  it('retains accessible selected/disabled controls, including a distinct warning contour', () => {
    const onClick = vi.fn();
    render(
      <>
        <IconButton icon="layer" ariaLabel="layers" toggled onClick={onClick} />
        <IconButton icon="blocked" ariaLabel="unavailable" disabled onClick={onClick} />
        <IconButton icon="warning" ariaLabel="warning" onClick={onClick} />
      </>,
    );
    const selected = screen.getByRole('button', { name: 'layers' });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(selected);
    expect(onClick).toHaveBeenCalledTimes(1);
    const disabled = screen.getByRole('button', { name: 'unavailable' });
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.hasAttribute('disabled')).toBe(true);
    fireEvent.click(disabled);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'warning' }).querySelector('path')?.getAttribute('d'),
    ).toContain('L3 21h18z');
  });
});
