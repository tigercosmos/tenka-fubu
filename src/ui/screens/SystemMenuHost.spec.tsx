import { useContext, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SaveConfirmationContext } from './SaveConfirmationContext';
import { SystemMenuHost } from './SystemMenuHost';
import { SaveLoadPanel, type SaveLoadPanelProps } from './SaveLoadPanel';
import { uiStore } from '../hooks/uiStore';
import { resetGameStoreForTests, store } from '@app/store';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { t } from '@i18n/zh-TW';

function ConfirmationContent({ disableOnConfirm = false }: { disableOnConfirm?: boolean }) {
  const host = useContext(SaveConfirmationContext)!;
  const opener = useRef<HTMLButtonElement>(null);
  const [disabled, setDisabled] = useState(false);
  return (
    <button
      ref={opener}
      disabled={disabled}
      onClick={() => {
        const token = {};
        host.present(
          {
            token,
            title: 'overwrite',
            message: 'saved slot',
            onCancel: () => host.dismiss(token),
            onConfirm: () => {
              if (disableOnConfirm) setDisabled(true);
              host.dismiss(token);
            },
          },
          opener.current?.closest('[data-ui-dialog]') ?? undefined,
        );
      }}
    >
      save opener
    </button>
  );
}

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState());
  uiStore.getState().actions.reset();
});
describe('screen-independent SystemMenuHost', () => {
  it('restores the real SaveLoadPanel opener captured before its locked render disables focus', async () => {
    const original = Reflect.get(Element.prototype, 'setAttribute');
    // jsdom retains focus on disabled buttons; model the browser's native focus loss,
    // while all panel/parent rendering and confirmation ownership remain production code.
    const disable = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
      this: Element,
      name,
      value,
    ) {
      original.call(this, name, value);
      if (
        name === 'disabled' &&
        this instanceof HTMLButtonElement &&
        document.activeElement === this
      )
        this.blur();
    });
    try {
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
      const props: SaveLoadPanelProps = {
        mode: 'save',
        context: 'main',
        dirty: false,
        slots: [
          { slotId: 'manual:1', status: 'ok', meta: null, timestamp: 1, needsMigration: false },
        ],
        onClose: vi.fn(),
        onSave: vi.fn(),
        onLoad: vi.fn(),
        onDelete: vi.fn(),
        onExport: vi.fn(),
        onImport: vi.fn(),
        onImportLoad: vi.fn(),
        onImportStore: vi.fn(),
        onImportCancel: vi.fn(),
      };
      const before = structuredClone(store.getState().game);
      render(
        <SystemMenuHost
          systemPanel={{
            title: 'save panel',
            content: <SaveLoadPanel {...props} />,
            onBack: vi.fn(),
          }}
        />,
      );
      const opener = screen
        .getByTestId('save-slot-manual:1')
        .querySelector<HTMLButtonElement>('button')!;
      opener.focus();
      // Explicit native focus-loss boundary: the DOM focus event has recorded the
      // opener, but activeElement is no longer reliable when the request is admitted.
      opener.addEventListener('click', () => opener.blur(), { capture: true, once: true });
      fireEvent.click(opener);
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: t('ui.common.cancel') }),
        ),
      );
      expect(opener.disabled).toBe(true);
      expect(opener.disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(props.onSave).not.toHaveBeenCalled();
      expect(store.getState().game).toEqual(before);
    } finally {
      disable.mockRestore();
    }
  });
  it('restores an accepted save-confirmation opener in the same native parent', async () => {
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    render(
      <SystemMenuHost
        systemPanel={{ title: 'save panel', content: <ConfirmationContent />, onBack: vi.fn() }}
      />,
    );
    const opener = screen.getByRole('button', { name: 'save opener' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t('ui.common.cancel') }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it('falls back inside the parent when confirmation disables its opener', async () => {
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    render(
      <SystemMenuHost
        systemPanel={{
          title: 'save panel',
          content: <ConfirmationContent disableOnConfirm />,
          onBack: vi.fn(),
        }}
      />,
    );
    const opener = screen.getByRole('button', { name: 'save opener' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'save panel' })),
    );
    expect((opener as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
  it('never restores the previous opener after parent subview replacement', async () => {
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    const view = render(
      <SystemMenuHost
        systemPanel={{ title: 'save panel', content: <ConfirmationContent />, onBack: vi.fn() }}
      />,
    );
    const opener = screen.getByRole('button', { name: 'save opener' });
    opener.focus();
    fireEvent.click(opener);
    view.rerender(
      <SystemMenuHost
        systemPanel={{
          title: 'replacement',
          content: <button>new control</button>,
          onBack: vi.fn(),
        }}
      />,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'replacement' })),
    );
    expect(document.activeElement).not.toBe(opener);
    expect(screen.queryByRole('button', { name: t('ui.common.cancel') })).toBeNull();
  });
  it('renders only the active FIFO systemMenu and preserves save/load callbacks', () => {
    const open = vi.fn();
    render(<SystemMenuHost onOpenSaveLoad={open} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() =>
      uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true }),
    );
    act(() =>
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => uiStore.getState().actions.closeModal());
    expect(screen.getByRole('dialog', { name: t('ui.system.menu') })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.save') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.load') }));
    expect(open.mock.calls).toEqual([['save'], ['load']]);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('delegates custom panels/back and clean return-to-title without changing tactical or core state', () => {
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    const before = structuredClone(store.getState().game);
    const back = vi.fn();
    const title = vi.fn();
    const view = render(
      <SystemMenuHost
        systemPanel={{ title: 'save panel', content: <p>slot content</p>, onBack: back }}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'save panel' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(back).toHaveBeenCalledOnce();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    view.rerender(<SystemMenuHost dirty={false} onReturnToTitle={title} />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    expect(title).toHaveBeenCalledOnce();
    expect(screen.queryByText(t('ui.system.confirmToTitle'))).toBeNull();
    expect(store.getState().game).toEqual(before);
  });
  it('keeps dirty return-to-title cancel-first and settings subpage under the same modal owner', () => {
    const title = vi.fn();
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    render(<SystemMenuHost dirty onReturnToTitle={title} />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.settings') }));
    expect(screen.getByRole('dialog', { name: t('ui.settings.title') })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    expect(screen.getByText(t('ui.system.confirmToTitle'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(title).not.toHaveBeenCalled();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
  });
});
