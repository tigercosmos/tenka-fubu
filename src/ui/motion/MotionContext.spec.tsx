import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './MotionContext';
import { MotionProvider } from './MotionProvider';
import { StrictMode } from 'react';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function ReadMotion() {
  return <output>{String(useReducedMotion())}</output>;
}
describe('OS-only MotionContext runtime', () => {
  it('StrictMode replay keeps only one active subscription and restores prior root metadata', () => {
    const listeners = new Set<unknown>();
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: (_type: string, listener: unknown) => listeners.add(listener),
      removeEventListener: (_type: string, listener: unknown) => listeners.delete(listener),
    }));
    document.documentElement.setAttribute('data-reduced-motion', 'previous');
    const view = render(
      <StrictMode>
        <MotionProvider>
          <ReadMotion />
        </MotionProvider>
      </StrictMode>,
    );
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(listeners.size).toBe(0);
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('previous');
    document.documentElement.removeAttribute('data-reduced-motion');
  });
  it('reads initial preference once, subscribes live changes and cleans listener/root attribute', () => {
    let change: ((event: MediaQueryListEvent) => void) | undefined;
    const add = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      change = listener;
    });
    const remove = vi.fn();
    const query = { matches: true, addEventListener: add, removeEventListener: remove };
    const match = vi.fn(() => query);
    vi.stubGlobal('matchMedia', match);
    const view = render(
      <MotionProvider>
        <ReadMotion />
      </MotionProvider>,
    );
    expect(match).toHaveBeenCalledOnce();
    expect(match).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(screen.getByRole('status').textContent).toBe('true');
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    act(() => change?.({ matches: false } as MediaQueryListEvent));
    expect(screen.getByRole('status').textContent).toBe('false');
    expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('false');
    view.unmount();
    expect(remove).toHaveBeenCalledWith('change', change);
    expect(document.documentElement.hasAttribute('data-reduced-motion')).toBe(false);
  });
  it('supports legacy media listeners and missing matchMedia without throwing', () => {
    const add = vi.fn(),
      remove = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addListener: add,
      removeListener: remove,
    }));
    const view = render(
      <MotionProvider>
        <ReadMotion />
      </MotionProvider>,
    );
    expect(add).toHaveBeenCalledOnce();
    view.unmount();
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0]![0]);
    vi.stubGlobal('matchMedia', undefined);
    render(
      <MotionProvider>
        <ReadMotion />
      </MotionProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('false');
  });
});
