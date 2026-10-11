import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EventId } from '@core/state/ids';
import { EventModal, type EventModalVM } from './EventModal';
import { injectCssVariables } from '../styles/tokens';

const vm: EventModalVM = {
  eventId: 'evt.presentation' as EventId,
  title: '完整事件標題',
  body: '完整敘事。\n保留全部條件與抉擇。',
  monClanId: null,
  requiresChoice: true,
  choices: [
    { label: '第一個完整選項', enabled: true, hint: '' },
    { label: '第二個完整選項', enabled: false, hint: '完整未滿足條件' },
  ],
};

describe('Event war-room presentation', () => {
  it('binds real choices to a local physical font floor without changing their full labels or order', () => {
    render(<EventModal vm={vm} onChoice={vi.fn()} onContinue={vi.fn()} animateText={false} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(
      vm.choices.map((choice) => choice.label),
    );
    expect(buttons[0]!.closest('[class*="choices"]')).not.toBeNull();
    const css = readFileSync('src/ui/screens/EventModal.module.css', 'utf8');
    expect(css).toMatch(/\.choices button\s*\{[^}]*font-size: max\(12px, var\(--font-size-sm\)\)/);
    expect(css).toMatch(/\.choices button:disabled\s*\{[^}]*opacity: 1/);
  });

  it('retains mandatory ownership, complete accessible narration and disabled reason behavior', () => {
    const onChoice = vi.fn(),
      onContinue = vi.fn();
    render(<EventModal vm={vm} onChoice={onChoice} onContinue={onContinue} animateText={false} />);
    expect(screen.getByTestId('event-text').textContent).toBe(vm.body);
    const locked = screen.getByRole('button', { name: vm.choices[1]!.label });
    expect(locked).toHaveProperty('disabled', true);
    fireEvent.focus(locked.parentElement!);
    expect(screen.getByRole('tooltip').textContent).toContain(vm.choices[1]!.hint);
    fireEvent.click(locked);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onChoice).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('bounds only the complete narrative reader, retains the paper/mon, and hardens local heading layout', () => {
    const css = readFileSync('src/ui/screens/EventModal.module.css', 'utf8');
    expect(css).toMatch(/> header h2\s*\{[^}]*line-height: 1\.5/);
    expect(css).toMatch(/\.scene\s*\{[^}]*font-size: max\(12px, var\(--font-size-sm\)\)/);
    expect(css).toMatch(/\.body\s*\{[^}]*max-height: min\(22rem, 42vh\)[^}]*overflow: auto/);
    expect(css).toContain('radial-gradient');
    expect(css).toContain('opacity: 0.07');
    expect(css).not.toContain('min-height: 10rem');
    injectCssVariables();
    for (const variable of css.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(
        document.documentElement.style.getPropertyValue(variable[1]!).trim(),
        variable[1],
      ).not.toBe('');
    }
  });
});
