import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateViewer } from './StateViewer';
import { UI } from '../uiConstants';
import { useHotkeys } from '../hooks/useHotkeys';
import { createGameLoopController } from '@app/gameLoop';
import { resetGameStoreForTests, store } from '@app/store';
import { uiStore } from '../hooks/uiStore';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { createManualScheduler } from '../../../tests/helpers/manualFrameScheduler';
vi.mock('@ui/viewport', () => ({ useViewportBlocked: () => false }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function node(path: string[] = []): HTMLElement {
  const result = screen
    .getAllByTestId('state-viewer-node')
    .find((item) => item.dataset.path === JSON.stringify(path));
  if (!result) throw new Error('Missing node');
  return result;
}
function expand(path: string[] = []) {
  const details = node(path).querySelector<HTMLDetailsElement>(':scope > details')!;
  act(() => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
}
function copy(path: string[] = []) {
  fireEvent.click(node(path).querySelector(':scope > button')!);
}
function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return writeText;
}

describe('lazy read-only StateViewer', () => {
  it('never enumerates collapsed subtrees or invokes accessor getters', () => {
    const childKeys = vi.fn(() => ['value']);
    const child = new Proxy({ value: 1 }, { ownKeys: childKeys });
    const getter = vi.fn(() => {
      throw new Error('must not execute');
    });
    const data = { child };
    Object.defineProperty(data, 'secret', { enumerable: true, get: getter });
    render(<StateViewer data={data} revision={0} />);
    expect(childKeys).not.toHaveBeenCalled();
    expand();
    expect(childKeys).not.toHaveBeenCalled();
    expect(node(['secret']).textContent).toContain('存取器');
    expand(['child']);
    expect(childKeys).toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });

  it('bounds visible children and descriptors to the first page until explicit show more', () => {
    const data = Object.fromEntries(
      Array.from({ length: UI.stateViewerPageSize + 2 }, (_, i) => [`field${i}`, i]),
    );
    render(<StateViewer data={data} revision={0} />);
    expand();
    expect(screen.getAllByTestId('state-viewer-node')).toHaveLength(UI.stateViewerPageSize + 1);
    fireEvent.click(screen.getByTestId('state-viewer-more'));
    expect(screen.getAllByTestId('state-viewer-node')).toHaveLength(UI.stateViewerPageSize + 3);
    expect(screen.queryByTestId('state-viewer-more')).toBeNull();
  });

  it('refreshes expanded same-object primitives on revision and resets expansion on replacement', () => {
    const data = { value: 1 },
      rendered = render(<StateViewer data={data} revision={0} />);
    expand();
    data.value = 2;
    rendered.rerender(<StateViewer data={data} revision={1} />);
    expect(node(['value']).textContent).toContain('2');
    rendered.rerender(<StateViewer data={{ value: 3 }} revision={2} />);
    expect(screen.getAllByTestId('state-viewer-node')).toHaveLength(1);
    expect(node().querySelector('details')!.open).toBe(false);
  });

  it('copies only the explicitly selected subtree without reading unrelated accessors or mutating data', async () => {
    const write = clipboard(),
      getter = vi.fn(() => {
        throw new Error('unrelated');
      });
    const data = { selected: { count: 2 } };
    Object.defineProperty(data, 'other', { get: getter, enumerable: true });
    render(<StateViewer data={data} revision={0} />);
    expand();
    expect(node(['selected']).querySelector('button')!.getAttribute('aria-label')).toBe(
      '複製此節點 JSON：GameState["selected"]',
    );
    copy(['selected']);
    await waitFor(() => expect(write).toHaveBeenCalledWith(JSON.stringify(data.selected, null, 2)));
    expect(getter).not.toHaveBeenCalled();
    expect(data.selected).toEqual({ count: 2 });
    expect((await screen.findByRole('status')).textContent).toContain('已複製');
  });

  it('treats dangerous own keys literally and preserves sparse array length when copying', async () => {
    const write = clipboard();
    const data: unknown = JSON.parse('{"__proto__":{"safe":true},"constructor":"literal"}');
    const rendered = render(<StateViewer data={data} revision={0} />);
    copy();
    await waitFor(() => expect(write).toHaveBeenCalledWith(JSON.stringify(data, null, 2)));
    const sparse = new Array<unknown>(3);
    sparse[0] = null;
    rendered.rerender(<StateViewer data={sparse} revision={1} />);
    copy();
    await waitFor(() => expect(write).toHaveBeenLastCalledWith('[\n  null,\n  null,\n  null\n]'));
    expect(Object.prototype).not.toHaveProperty('safe');
  });

  it.each(['missing', 'rejected', 'cycle', 'accessor', 'bigint'] as const)(
    'reports %s copy failures accessibly without false success',
    async (kind) => {
      const getter = vi.fn(() => 1),
        write = clipboard(
          kind === 'rejected' ? vi.fn().mockRejectedValue(new Error('denied')) : undefined,
        );
      let data: unknown = { value: 1 };
      if (kind === 'missing') vi.stubGlobal('navigator', {});
      if (kind === 'cycle') {
        const cycle: { self?: unknown } = {};
        cycle.self = cycle;
        data = cycle;
      }
      if (kind === 'accessor') {
        data = {};
        Object.defineProperty(data, 'a', { enumerable: true, get: getter });
      }
      if (kind === 'bigint') data = 1n;
      render(<StateViewer data={data} revision={0} />);
      copy();
      expect((await screen.findByRole('status')).textContent).toContain('無法複製');
      expect(getter).not.toHaveBeenCalled();
      if (kind !== 'rejected') expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(['identity', 'revision'] as const)(
    'ignores delayed clipboard success after %s changes',
    async (kind) => {
      let finish!: () => void;
      clipboard(
        vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finish = resolve;
            }),
        ),
      );
      const data = { value: 1 },
        rendered = render(<StateViewer data={data} revision={0} />);
      copy();
      rendered.rerender(
        <StateViewer data={kind === 'identity' ? { value: 2 } : data} revision={1} />,
      );
      await act(async () => {
        finish();
        await Promise.resolve();
      });
      expect(screen.queryByRole('status')).toBeNull();
    },
  );

  it('shows cycles and empty/null/long primitive values without serializing or crashing', () => {
    const data: { cycle?: unknown; empty: unknown[]; text: string; nil: null } = {
      empty: [],
      text: 'x'.repeat(1000),
      nil: null,
    };
    data.cycle = data;
    render(<StateViewer data={data} revision={0} />);
    expand();
    expect(node(['cycle']).textContent).toContain('循環參照');
    expect(node(['nil']).textContent).toContain('null');
    expect(node(['text']).textContent).toContain(data.text);
    expand(['empty']);
    expect(node(['empty']).textContent).toContain('空節點');
  });

  it('isolates tree keyboard input from real global gameplay hotkeys while preserving native defaults', () => {
    resetGameStoreForTests(makeLoopTestState());
    uiStore.getState().actions.reset();
    uiStore.getState().actions.setScreen('main');
    const loop = createGameLoopController(createManualScheduler().scheduler),
      debug = vi.fn();
    function Host() {
      useHotkeys(loop, debug);
      return <StateViewer data={{ value: 1 }} revision={0} />;
    }
    render(<Host />);
    const summary = node().querySelector('summary')!;
    summary.focus();
    for (const key of ['1', '2', '3', 'F1', 'F5', 'F7', 'F9', 'r'])
      fireEvent.keyDown(summary, { key });
    expect(store.getState().session.speed).toBe('paused');
    expect(uiStore.getState().panelStack).toEqual([]);
    const f5 = new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true });
    summary.dispatchEvent(f5);
    expect(f5.defaultPrevented).toBe(true);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    summary.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    fireEvent.keyDown(summary, { key: '`', code: 'Backquote' });
    expect(debug).toHaveBeenCalledOnce();
    loop.stop();
  });

  it('recovers removed-child and replaced-root focus to a surviving disclosure without stealing external focus', () => {
    const data: Record<string, unknown> = { child: { value: 1 } };
    const rendered = render(
      <>
        <button data-testid="outside">Outside</button>
        <StateViewer data={data} revision={0} />
      </>,
    );
    expand();
    expand(['child']);
    node(['child', 'value']).querySelector<HTMLButtonElement>('button')!.focus();
    delete data.child;
    rendered.rerender(
      <>
        <button data-testid="outside">Outside</button>
        <StateViewer data={data} revision={1} />
      </>,
    );
    expect(document.activeElement).toBe(node().querySelector('summary'));
    rendered.rerender(
      <>
        <button data-testid="outside">Outside</button>
        <StateViewer data={{ next: 2 }} revision={2} />
      </>,
    );
    expect(document.activeElement).toBe(node().querySelector('summary'));
    screen.getByTestId('outside').focus();
    rendered.rerender(
      <>
        <button data-testid="outside">Outside</button>
        <StateViewer data={{ other: 3 }} revision={3} />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('outside'));
  });

  it('recovers a removed paging button when a same-object revision shrinks its page', () => {
    const data: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: UI.stateViewerPageSize + 1 }, (_, i) => [`field${i}`, i]),
    );
    const rendered = render(<StateViewer data={data} revision={0} />);
    expand();
    screen.getByTestId('state-viewer-more').focus();
    for (const key of Object.keys(data)) delete data[key];
    rendered.rerender(<StateViewer data={data} revision={1} />);
    expect(document.activeElement).toBe(node().querySelector('summary'));
  });

  it('does not reacquire tree focus after an explicit blur to the nonfocusable background', () => {
    const data: Record<string, unknown> = { child: 1 };
    const rendered = render(<StateViewer data={data} revision={0} />);
    expand();
    const button = node(['child']).querySelector<HTMLButtonElement>('button')!;
    button.focus();
    button.blur();
    expect(document.activeElement).toBe(document.body);
    delete data.child;
    rendered.rerender(<StateViewer data={data} revision={1} />);
    expect(document.activeElement).toBe(document.body);
  });
});
