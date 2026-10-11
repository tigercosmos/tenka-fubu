import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton optical sizes and native interaction', () => {
  it.each([
    ['sm', 16],
    ['md', 24],
    ['lg', 42],
  ] as const)('%s uses explicit %ipx optical glyph', (size, glyph) => {
    render(<IconButton icon="army" size={size} ariaLabel="測試圖示" onClick={() => {}} />);
    const svg = screen.getByRole('button').querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe(String(glyph));
    expect(svg.getAttribute('height')).toBe(String(glyph));
  });
  it('selected/disabled retain native labels and do not call disabled actions', () => {
    const callback = vi.fn();
    render(
      <IconButton icon="warning" toggled disabled ariaLabel="不可操作的警告" onClick={callback} />,
    );
    const button = screen.getByRole('button', { name: '不可操作的警告' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(callback).not.toHaveBeenCalled();
  });
});
