import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@app/store';
import { Dialog } from '../components/Dialog/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { ViewportProvider } from './ViewportProvider';
import { isViewportTooSmall, useViewportBlocked } from './ViewportContext';

function resize(width: number, height: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  fireEvent(window, new Event('resize'));
}
function ReadViewport() {
  return <output>{String(useViewportBlocked())}</output>;
}
beforeEach(() => {
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 720);
  store.setState({
    session: {
      ...store.getState().session,
      speed: 'paused',
      viewportBlocked: false,
      lastPauseReason: 'user',
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('minimum production viewport', () => {
  it('honors cancel-first initial focus when a confirmation first mounts under the shield', async () => {
    resize(1279, 720);
    render(
      <ViewportProvider>
        <ConfirmDialog
          open
          danger
          title="New confirmation"
          message="Confirm?"
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </ViewportProvider>,
    );
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
    resize(1280, 720);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }));
    expect(store.getState().session.speed).toBe('paused');
  });
  it('recovers into a new dialog first mounted while the viewport was blocked', async () => {
    resize(1279, 720);
    render(
      <ViewportProvider>
        <Dialog open dismissible={false} title="New decision" onClose={vi.fn()}>
          <button>New choice</button>
        </Dialog>
      </ViewportProvider>,
    );
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
    resize(1280, 720);
    const dialog = screen.getByRole('dialog', { name: 'New decision' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
  });
  it('uses the current dialog owner when its saved input is replaced while blocked', () => {
    const view = render(
      <ViewportProvider>
        <Dialog open title="Changing owner" onClose={vi.fn()}>
          <input key="old" aria-label="Old input" />
        </Dialog>
      </ViewportProvider>,
    );
    screen.getByRole('textbox', { name: 'Old input' }).focus();
    resize(1279, 720);
    view.rerender(
      <ViewportProvider>
        <Dialog open title="Changing owner" focusScopeKey="new" onClose={vi.fn()}>
          <textarea key="new" aria-label="New input" />
        </Dialog>
      </ViewportProvider>,
    );
    resize(1280, 720);
    const dialog = screen.getByRole('dialog', { name: 'Changing owner' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
    const last = screen.getByRole('textbox', { name: 'New input' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
  it('recovers to the remaining parent when a child closes asynchronously under the shield', async () => {
    function Owners({ child }: { child: boolean }) {
      return (
        <ViewportProvider>
          <Dialog open title="Parent owner" onClose={vi.fn()}>
            <button disabled={!child}>Old opener</button>
            <button>Available action</button>
            <Dialog open={child} title="Child owner" onClose={vi.fn()}>
              <button>Child choice</button>
            </Dialog>
          </Dialog>
        </ViewportProvider>
      );
    }
    const view = render(<Owners child={false} />);
    view.rerender(<Owners child />);
    const child = screen.getByRole('dialog', { name: 'Child owner' });
    await waitFor(() => expect(child.contains(document.activeElement)).toBe(true));
    screen.getByRole('button', { name: 'Child choice' }).focus();
    resize(1279, 720);
    view.rerender(<Owners child={false} />);
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
    resize(1280, 720);
    const parent = screen.getByRole('dialog', { name: 'Parent owner' });
    expect(parent.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(store.getState().session.speed).toBe('paused');
  });
  it('uses independent strict CSS pixel boundaries, without scale conversion', () => {
    expect(isViewportTooSmall(1280, 720)).toBe(false);
    expect(isViewportTooSmall(1920, 1080)).toBe(false);
    expect(isViewportTooSmall(1279, 1080)).toBe(true);
    expect(isViewportTooSmall(1920, 719)).toBe(true);
  });
  it('reads the initial size, publishes live changes and leaves manual pause intact on recovery', () => {
    resize(1279, 720);
    const view = render(
      <ViewportProvider>
        <ReadViewport />
      </ViewportProvider>,
    );
    const overlay = screen.getByRole('alertdialog');
    expect(overlay.textContent).toBe('視窗過小：本遊戲需要至少 1280×720 的視窗');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(overlay);
    expect(store.getState().session.viewportBlocked).toBe(true);
    expect(store.getState().session.lastPauseReason).toBe('user');
    resize(1280, 720);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('false');
    expect(store.getState().session.viewportBlocked).toBe(false);
    expect(store.getState().session.speed).toBe('paused');
    resize(1920, 719);
    expect(screen.getByRole('alertdialog')).not.toBeNull();
    view.unmount();
    expect(store.getState().session.viewportBlocked).toBe(false);
  });
  it('makes content inert, suppresses shortcuts and restores connected enabled focus', () => {
    const key = vi.fn();
    window.addEventListener('keydown', key);
    const view = render(
      <ViewportProvider>
        <button>Existing action</button>
      </ViewportProvider>,
    );
    const button = screen.getByRole('button');
    button.focus();
    resize(1279, 720);
    expect(button.parentElement?.hasAttribute('inert')).toBe(true);
    expect(button.parentElement?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.keyDown(window, { key: 'F7' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false);
    expect(fireEvent.keyDown(window, { key: 's', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: 's', metaKey: true })).toBe(false);
    expect(key).not.toHaveBeenCalled();
    button.focus();
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
    resize(1280, 720);
    expect(button.parentElement?.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(window, { key: 'F7' });
    expect(key).toHaveBeenCalledOnce();
    view.unmount();
    window.removeEventListener('keydown', key);
  });
  it('leaves browser zoom/navigation/devtools chords usable for recovery', () => {
    render(
      <ViewportProvider>
        <ReadViewport />
      </ViewportProvider>,
    );
    resize(1279, 720);
    expect(fireEvent.keyDown(window, { key: '-', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'l', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'F4', altKey: true })).toBe(true);
    expect(fireEvent.keyDown(window, { key: 'F12' })).toBe(true);
    expect(fireEvent.keyDown(window, { key: '1', altKey: true })).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
  });
  it('shields existing and newly created body portals, restoring their original attributes', async () => {
    const portal = document.createElement('div');
    portal.id = 'modal-root';
    portal.setAttribute('inert', 'existing');
    portal.setAttribute('aria-hidden', 'false');
    document.body.append(portal);
    const view = render(
      <ViewportProvider>
        <button>Background</button>
      </ViewportProvider>,
    );
    resize(1279, 720);
    expect(portal.getAttribute('inert')).toBe('');
    expect(portal.getAttribute('aria-hidden')).toBe('true');
    const tooltip = document.createElement('div');
    tooltip.id = 'tooltip-root';
    act(() => {
      document.body.append(tooltip);
    });
    await waitFor(() => expect(tooltip.hasAttribute('inert')).toBe(true));
    resize(1280, 720);
    expect(portal.getAttribute('inert')).toBe('existing');
    expect(portal.getAttribute('aria-hidden')).toBe('false');
    expect(tooltip.hasAttribute('inert')).toBe(false);
    expect(tooltip.hasAttribute('aria-hidden')).toBe(false);
    view.unmount();
    portal.remove();
    tooltip.remove();
  });
  it('retains an existing mandatory Dialog rather than discarding its decision or remounting it', () => {
    const mounted = vi.fn(),
      unmounted = vi.fn(),
      close = vi.fn();
    function ExistingDecision() {
      useEffect(() => {
        mounted();
        return () => {
          unmounted();
        };
      }, []);
      return (
        <Dialog open title="Mandatory decision" dismissible={false} onClose={close}>
          <button>Choose</button>
        </Dialog>
      );
    }
    render(
      <ViewportProvider>
        <ExistingDecision />
      </ViewportProvider>,
    );
    const choice = screen.getByRole('button', { name: 'Choose' });
    choice.focus();
    resize(1279, 720);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    resize(1280, 720);
    expect(screen.getByRole('dialog').contains(choice)).toBe(true);
    expect(document.activeElement).toBe(choice);
    expect(mounted).toHaveBeenCalledOnce();
    expect(unmounted).not.toHaveBeenCalled();
  });
  it('does not restore a removed focus target and cleans its resize listener', () => {
    const removed = document.createElement('button');
    document.body.append(removed);
    removed.focus();
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <ViewportProvider>
        <ReadViewport />
      </ViewportProvider>,
    );
    resize(1279, 720);
    removed.remove();
    resize(1280, 720);
    expect(document.activeElement).not.toBe(removed);
    view.unmount();
    expect(removeListener.mock.calls.some(([event]) => event === 'resize')).toBe(true);
  });
});
