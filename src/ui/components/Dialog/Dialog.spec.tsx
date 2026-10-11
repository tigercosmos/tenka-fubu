import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Dialog } from './Dialog';
import { useState } from 'react';

afterEach(cleanup);

describe('Dialog focus scopes', () => {
  it.each([
    { dismissible: false, closeOnBackdrop: true },
    { dismissible: true, closeOnBackdrop: false },
  ])('prevents native focus escape from a retained backdrop: %j', async (options) => {
    const close = vi.fn();
    render(
      <Dialog open title="Retained result" onClose={close} {...options}>
        <button>Confirm result</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Retained result' });
    const button = screen.getByRole('button', { name: 'Confirm result' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    button.focus();
    expect(fireEvent.mouseDown(dialog.parentElement!)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    // Content controls retain their own native pointer focus and activation behavior.
    expect(fireEvent.mouseDown(button)).toBe(true);
  });

  it('restores the parent last-owned opener when native disabling blurs it before child capture', async () => {
    function LockedParent() {
      const [child, setChild] = useState(false);
      return (
        <Dialog open title="Locked parent" onClose={vi.fn()}>
          <button
            disabled={child}
            onClick={(event) => {
              // Browser disabling may blur before the child passive effect reads activeElement.
              event.currentTarget.blur();
              setChild(true);
            }}
          >
            Save opener
          </button>
          <Dialog open={child} title="Nested confirmation" onClose={() => setChild(false)}>
            <button onClick={() => setChild(false)}>Cancel nested</button>
          </Dialog>
        </Dialog>
      );
    }
    render(<LockedParent />);
    const opener = screen.getByRole('button', { name: 'Save opener' });
    opener.focus();
    fireEvent.click(opener);
    const child = screen.getByRole('dialog', { name: 'Nested confirmation' });
    await waitFor(() => expect(child.contains(document.activeElement)).toBe(true));
    const cancel = screen.getByRole('button', { name: 'Cancel nested' });
    cancel.focus();
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(opener);
    expect(
      screen.getByRole('dialog', { name: 'Locked parent' }).contains(document.activeElement),
    ).toBe(true);
  });
  it('acquires a valid fallback when an explicit initial ref is stale, outside, or disabled', async () => {
    const stale = document.createElement('button');
    const { rerender } = render(
      <Dialog open title="Safe initial" initialFocusRef={{ current: stale }} onClose={vi.fn()}>
        <button>Available</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const outside = document.createElement('button');
    document.body.append(outside);
    rerender(
      <Dialog
        open
        title="Safe initial"
        focusScopeKey="outside"
        initialFocusRef={{ current: outside }}
        onClose={vi.fn()}
      >
        <button>Available</button>
      </Dialog>,
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
    const disabled = document.createElement('button');
    disabled.disabled = true;
    dialog.append(disabled);
    rerender(
      <Dialog
        open
        title="Safe initial"
        focusScopeKey="disabled"
        initialFocusRef={{ current: disabled }}
        onClose={vi.fn()}
      >
        <button>Available</button>
      </Dialog>,
    );
    expect(document.activeElement).not.toBe(disabled);
    expect(dialog.contains(document.activeElement)).toBe(true);
    disabled.remove();
    outside.remove();
  });
  it('excludes hidden ancestors, inert content, disabled fieldsets and negative tab indices from root Tab fallback', () => {
    render(
      <Dialog open dismissible={false} title="Filtered focus" onClose={vi.fn()}>
        <div hidden>
          <button>Hidden ancestor</button>
        </div>
        <div style={{ display: 'none' }}>
          <button>CSS hidden ancestor</button>
        </div>
        <div {...{ inert: '' }}>
          <button>Inert ancestor</button>
        </div>
        <fieldset disabled>
          <input aria-label="Disabled by fieldset" />
        </fieldset>
        <button tabIndex={-1}>Programmatic only</button>
        <input type="hidden" />
        <button>First available</button>
        <button>Last available</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First available' }));
    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last available' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First available' }));
  });
  it.each(['removed', 'disabled'] as const)(
    'returns focus to the remaining parent when its prior opener becomes %s',
    async (kind) => {
      function Nested() {
        const [child, setChild] = useState(false);
        const [busy, setBusy] = useState(false);
        return (
          <>
            <Dialog open title="Parent" onClose={vi.fn()}>
              {!(busy && kind === 'removed') && (
                <button disabled={busy} onClick={() => setChild(true)}>
                  Open child
                </button>
              )}
              <button>Parent fallback</button>
            </Dialog>
            <Dialog open={child} title="Child" onClose={() => setChild(false)}>
              <button
                onClick={() => {
                  setBusy(true);
                  setChild(false);
                }}
              >
                Confirm asynchronous work
              </button>
            </Dialog>
          </>
        );
      }
      render(<Nested />);
      const opener = screen.getByRole('button', { name: 'Open child' });
      opener.focus();
      fireEvent.click(opener);
      const child = screen.getByRole('dialog', { name: 'Child' });
      await waitFor(() => expect(child.contains(document.activeElement)).toBe(true));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm asynchronous work' }));
      const parent = screen.getByRole('dialog', { name: 'Parent' });
      expect(parent.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(opener);
      const last = screen.getByRole('button', { name: 'Parent fallback' });
      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(parent.contains(document.activeElement)).toBe(true);
    },
  );
  it('does not steal current top-owner focus when a lower dialog closes or changes focus scope', async () => {
    const { rerender } = render(
      <>
        <Dialog open title="Lower" onClose={vi.fn()}>
          <button>Lower action</button>
        </Dialog>
        <Dialog open title="Higher" onClose={vi.fn()}>
          <input aria-label="Higher edit" />
        </Dialog>
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Higher edit' });
    input.focus();
    rerender(
      <>
        <Dialog open title="Lower" focusScopeKey="changed" onClose={vi.fn()}>
          <button>Lower action</button>
        </Dialog>
        <Dialog open title="Higher" onClose={vi.fn()}>
          <input aria-label="Higher edit" />
        </Dialog>
      </>,
    );
    expect(document.activeElement).toBe(input);
    rerender(
      <>
        <Dialog open={false} title="Lower" focusScopeKey="changed" onClose={vi.fn()}>
          <button>Lower action</button>
        </Dialog>
        <Dialog open title="Higher" onClose={vi.fn()}>
          <input aria-label="Higher edit" />
        </Dialog>
      </>,
    );
    expect(document.activeElement).toBe(input);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Higher' }).contains(document.activeElement)).toBe(
        true,
      ),
    );
  });
  it('does not attempt to restore disconnected or disabled original page openers', async () => {
    for (const kind of ['removed', 'disabled'] as const) {
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const focus = vi.spyOn(opener, 'focus');
      const view = render(
        <Dialog open title="Close safely" onClose={vi.fn()}>
          <button>Inside</button>
        </Dialog>,
      );
      await waitFor(() =>
        expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true),
      );
      if (kind === 'removed') opener.remove();
      else opener.disabled = true;
      view.unmount();
      expect(focus).not.toHaveBeenCalled();
      opener.remove();
    }
  });
  it.each(['input', 'textarea', 'select', 'contenteditable'] as const)(
    'blurs focused %s first, then lets only the next Escape dismiss',
    (kind) => {
      const close = vi.fn();
      render(
        <Dialog open title="Input ownership" onClose={close}>
          {kind === 'input' && <input aria-label="Edit" />}
          {kind === 'textarea' && <textarea aria-label="Edit" />}
          {kind === 'select' && (
            <select aria-label="Edit">
              <option>First</option>
              <option>Second</option>
            </select>
          )}
          {kind === 'contenteditable' && (
            <div
              contentEditable
              suppressContentEditableWarning
              tabIndex={0}
              role="textbox"
              aria-label="Edit"
            >
              <span>Nested text</span>
            </div>
          )}
        </Dialog>,
      );
      const edit = screen.getByLabelText('Edit');
      edit.focus();
      expect(document.activeElement).toBe(edit);
      const target = kind === 'contenteditable' ? edit.firstElementChild! : edit;
      fireEvent.keyDown(target, { key: 'Escape' });
      const dialog = screen.getByRole('dialog');
      expect(document.activeElement).toBe(dialog);
      expect(close).not.toHaveBeenCalled();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it('preserves native prevented Escape, repeats and IME cancellation without blurring', () => {
    const close = vi.fn();
    render(
      <Dialog open title="Native ownership" onClose={close}>
        <input aria-label="IME" />
        <select
          aria-label="Native selection"
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.preventDefault();
          }}
        >
          <option>Selected</option>
        </select>
      </Dialog>,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    for (const guarded of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
      expect(fireEvent.keyDown(input, { key: 'Escape', ...guarded })).toBe(true);
      expect(document.activeElement).toBe(input);
    }
    const select = screen.getByRole('combobox');
    select.focus();
    expect(fireEvent.keyDown(select, { key: 'Escape' })).toBe(false);
    expect(document.activeElement).toBe(select);
    expect(close).not.toHaveBeenCalled();
  });
  it('leaves modified Escape to browser/OS ownership', () => {
    const close = vi.fn();
    render(
      <Dialog open title="Modified keys" onClose={close}>
        <input aria-label="Edit" />
      </Dialog>,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      expect(fireEvent.keyDown(input, { key: 'Escape', [modifier]: true })).toBe(true);
      expect(document.activeElement).toBe(input);
    }
    expect(close).not.toHaveBeenCalled();
  });
  it('blurs mandatory input but does not allow a later Escape to bypass the decision', () => {
    const close = vi.fn();
    render(
      <Dialog open dismissible={false} title="Mandatory" onClose={close}>
        <textarea aria-label="Edit" />
      </Dialog>,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });
  it('leaves a lower dialog untouched and handles only the top dialog input', () => {
    const outerClose = vi.fn(),
      innerClose = vi.fn();
    render(
      <>
        <Dialog open title="Outer" onClose={outerClose}>
          <input aria-label="Outer input" />
        </Dialog>
        <Dialog open title="Inner" onClose={innerClose}>
          <input aria-label="Inner input" />
        </Dialog>
      </>,
    );
    const inner = screen.getByRole('dialog', { name: 'Inner' });
    const input = screen.getByRole('textbox', { name: 'Inner input' });
    input.focus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Outer' }), { key: 'Escape' });
    expect(document.activeElement).toBe(input);
    expect(outerClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(inner);
    expect(innerClose).not.toHaveBeenCalled();
    fireEvent.keyDown(inner, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });
  it.each([false, true])('contains Tab from the root after input blur (reverse=%s)', (reverse) => {
    render(
      <Dialog open title="Tab containment" onClose={vi.fn()}>
        <input aria-label="Edit" />
        <button>Last</button>
      </Dialog>,
    );
    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: reverse });
    expect(document.activeElement).toBe(
      reverse
        ? screen.getByRole('button', { name: 'Last' })
        : screen.getByRole('button', { name: 'Tab containment' }),
    );
  });
  it('activates only an explicitly marked enabled primary action from a non-control target', () => {
    const primary = vi.fn();
    const other = vi.fn();
    const { rerender } = render(
      <Dialog
        open
        title="Primary"
        onClose={other}
        footer={
          <button data-dialog-primary="true" onClick={primary}>
            Continue
          </button>
        }
      >
        <input aria-label="Text" />
        <button onClick={other}>Other</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(primary).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: 'Enter', repeat: true });
    fireEvent.keyDown(dialog, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Other' }), { key: 'Enter' });
    expect(primary).toHaveBeenCalledTimes(1);
    rerender(
      <Dialog
        open
        title="Primary"
        onClose={other}
        footer={
          <button data-dialog-primary="true" disabled onClick={primary}>
            Continue
          </button>
        }
      >
        Body
      </Dialog>,
    );
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(primary).toHaveBeenCalledTimes(1);
  });
  it('refocuses swapped content, preserves input focus across metadata refresh and restores original opener', async () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender, unmount } = render(
      <Dialog open title="Menu" onClose={onClose} focusScopeKey="menu">
        <button>Save</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    screen.getByRole('button', { name: 'Save' }).focus();
    rerender(
      <Dialog open title="Save" onClose={onClose} focusScopeKey="save">
        <input aria-label="Name" />
        <button>Back</button>
      </Dialog>,
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
    const input = screen.getByRole('textbox');
    input.focus();
    rerender(
      <Dialog open title="Save updated" onClose={onClose} focusScopeKey="save">
        <input aria-label="Name" />
        <button>Back</button>
      </Dialog>,
    );
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    const last = within(dialog).getByRole('button', { name: 'Back' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getAllByRole('button')[0]);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
