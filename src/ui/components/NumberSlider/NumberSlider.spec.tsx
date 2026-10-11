import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberSlider } from './NumberSlider';

function Controlled({
  initial,
  min = 0,
  max = 1000,
  onChange,
}: {
  initial: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberSlider
      min={min}
      max={max}
      step={100}
      value={value}
      label="兵數"
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('NumberSlider typed value normalization', () => {
  it('names both native quantity controls with the supplied label', () => {
    const onChange = vi.fn();
    render(<Controlled initial={500} onChange={onChange} />);
    expect(screen.getByRole<HTMLInputElement>('slider', { name: '兵數' }).value).toBe('500');
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: '兵數' }).value).toBe('500');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    [1000, '1500', 1000],
    [0, '-50', 0],
    [1000, '955', 1000],
    [500, '525', 500],
    [0, '955', 1000],
    [1000, '245', 200],
  ] as const)('normalizes %s → %s on blur to %s exactly once', (initial, typed, expected) => {
    const onChange = vi.fn();
    render(<Controlled initial={initial} onChange={onChange} />);
    const input = screen.getByRole<HTMLInputElement>('spinbutton');
    fireEvent.change(input, { target: { value: typed } });
    expect(input.value).toBe(typed);
    fireEvent.blur(input);
    expect(input.value).toBe(String(expected));
    expect(screen.getByRole<HTMLInputElement>('slider').value).toBe(String(expected));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it.each(['', 'not-a-number'])(
    'restores the controlled value for %j without notifying',
    (typed) => {
      const onChange = vi.fn();
      render(<Controlled initial={500} onChange={onChange} />);
      const input = screen.getByRole<HTMLInputElement>('spinbutton');
      // A native number input sanitizes invalid nonnumeric text to an empty value.
      fireEvent.change(input, { target: { value: typed } });
      fireEvent.blur(input);
      expect(input.value).toBe('500');
      expect(screen.getByRole<HTMLInputElement>('slider').value).toBe('500');
      expect(onChange).not.toHaveBeenCalled();
    },
  );
});

describe('NumberSlider exact bound controls', () => {
  it.each([2340, 2365])('End reaches the exact nonaligned maximum %s', (max) => {
    const onChange = vi.fn();
    render(<Controlled initial={500} max={max} onChange={onChange} />);
    const range = screen.getByRole<HTMLInputElement>('slider');
    fireEvent.keyDown(range, { key: 'End' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(max);
    expect(range.value).toBe(String(max));
    expect(range.validity.stepMismatch).toBe(false);
    const numeric = screen.getByRole<HTMLInputElement>('spinbutton');
    expect(numeric.value).toBe(String(max));
    expect(numeric.step).toBe('100');
  });

  it('None/All and range endpoints reach exact bounds while interior values still snap', () => {
    const onChange = vi.fn();
    render(<Controlled initial={500} min={15} max={2340} onChange={onChange} />);
    const range = screen.getByRole<HTMLInputElement>('slider');
    fireEvent.click(screen.getByRole('button', { name: '全' }));
    expect(range.value).toBe('2340');
    expect(onChange).toHaveBeenLastCalledWith(2340);
    fireEvent.click(screen.getByRole('button', { name: '零' }));
    expect(range.value).toBe('15');
    expect(onChange).toHaveBeenLastCalledWith(15);
    fireEvent.change(range, { target: { value: '2340' } });
    expect(range.value).toBe('2340');
    expect(onChange).toHaveBeenLastCalledWith(2340);
    fireEvent.change(range, { target: { value: '955' } });
    expect(range.value).toBe('915');
    expect(onChange).toHaveBeenLastCalledWith(915);
    fireEvent.keyDown(range, { key: 'Home' });
    expect(range.value).toBe('15');
    expect(onChange).toHaveBeenLastCalledWith(15);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('preserves native numeric step and ordinary interior keyboard increments', () => {
    const onChange = vi.fn();
    render(<Controlled initial={500} max={3000} onChange={onChange} />);
    const range = screen.getByRole<HTMLInputElement>('slider');
    expect(range.step).toBe('100');
    for (const [key, expected] of [
      ['ArrowRight', 600],
      ['ArrowDown', 500],
      ['PageUp', 1500],
      ['PageDown', 500],
    ] as const) {
      fireEvent.keyDown(range, { key });
      expect(range.value).toBe(String(expected));
      expect(onChange).toHaveBeenLastCalledWith(expected);
    }
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('represents an existing off-grid controlled value without native step mismatch', () => {
    render(<Controlled initial={555} onChange={() => {}} />);
    const range = screen.getByRole<HTMLInputElement>('slider');
    expect(range.step).toBe('any');
    expect(range.value).toBe('555');
    expect(range.validity.stepMismatch).toBe(false);
    expect(screen.getByRole<HTMLInputElement>('spinbutton').step).toBe('100');
  });
});
