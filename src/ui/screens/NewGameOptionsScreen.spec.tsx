import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewGameOptionsScreen, validWizardSeed } from './NewGameOptionsScreen';

afterEach(cleanup);

describe('M8-17 difficulty and seed steps', () => {
  it.each([
    ['0', 0],
    ['4294967295', 4294967295],
    ['00042', 42],
    ['', null],
    ['-1', null],
    ['1.5', null],
    ['NaN', null],
    ['4294967296', null],
    ['1e3', null],
    [' 1', null],
  ])('validates the complete uint32 seed %s', (raw, expected) => {
    expect(validWizardSeed(raw)).toBe(expected);
  });

  it('selects each difficulty while the parent owns its retained choice', () => {
    const onDifficulty = vi.fn();
    const onNext = vi.fn();
    for (const [name, value] of [
      ['初級', 'easy'],
      ['中級', 'normal'],
      ['上級', 'hard'],
    ] as const) {
      const view = render(
        <NewGameOptionsScreen
          step="difficulty"
          difficulty={value === 'normal' ? 'easy' : 'normal'}
          seedText="42"
          onDifficulty={onDifficulty}
          onSeedText={vi.fn()}
          onBack={vi.fn()}
          onNext={onNext}
          onStart={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('radio', { name }));
      expect(onDifficulty).toHaveBeenCalledWith(value);
      fireEvent.click(screen.getByTestId('difficulty-next'));
      view.unmount();
    }
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  it('does not start for invalid text and retains that exact text on rerender', () => {
    const onSeedText = vi.fn();
    const onStart = vi.fn();
    const props = {
      step: 'seed' as const,
      difficulty: 'hard' as const,
      onDifficulty: vi.fn(),
      onSeedText,
      onBack: vi.fn(),
      onNext: vi.fn(),
      onStart,
    };
    const view = render(<NewGameOptionsScreen {...props} seedText="4294967296" />);
    const input = screen.getByTestId('newgame-seed');
    expect(input).toHaveProperty('value', '4294967296');
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('0 到 4294967295');
    fireEvent.change(input, { target: { value: '0' } });
    expect(onSeedText).toHaveBeenCalledWith('0');
    view.rerender(<NewGameOptionsScreen {...props} seedText="0" />);
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByTestId('newgame-start'));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
