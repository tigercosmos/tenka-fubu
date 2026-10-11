import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Panel } from './Panel';
import { Dialog } from '../Dialog/Dialog';

afterEach(cleanup);
const css = (component: string) =>
  readFileSync(`src/ui/components/${component}/${component}.module.css`, 'utf8');

it('gives shared panel and dialog headers command-ink framing while retaining parchment bodies', () => {
  const panel = css('Panel');
  const dialog = css('Dialog');
  for (const [source, selector] of [
    [panel, /\.header\s*\{([^}]+)\}/],
    [dialog, /\.dialog header\s*\{([^}]+)\}/],
  ] as const) {
    const header = source.match(selector)?.[1];
    expect(header).toMatch(/background:\s*var\(--surface-command\);/);
    expect(header).toMatch(/color:\s*var\(--text-inverse\);/);
    expect(header).toMatch(/border-top:\s*2px solid var\(--command-gold\);/);
  }
  expect(panel.match(/\.panel\s*\{([^}]+)\}/)?.[1]).toContain('var(--surface-panel)');
  expect(dialog.match(/\.dialog\s*\{([^}]+)\}/)?.[1]).toContain('var(--surface-panel)');
  expect(dialog.match(/\.body\s*\{([^}]+)\}/)?.[1]).toMatch(/overflow:\s*auto;/);
  const event = readFileSync('src/ui/screens/EventModal.module.css', 'utf8');
  expect(event.match(/> header h2\s*\{([^}]+)\}/)?.[1]).toMatch(/color:\s*var\(--text-inverse\);/);
});

it('protects long title and close targets and wraps the complete dialog action row', () => {
  const panel = css('Panel');
  const dialog = css('Dialog');
  expect(panel).toMatch(/\.header > span\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/);
  expect(dialog).toMatch(/\.dialog h2\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/);
  for (const [source, selector] of [
    [panel, /\.header button\s*\{([^}]+)\}/],
    [dialog, /\.dialog header button\s*\{([^}]+)\}/],
  ] as const) {
    const button = source.match(selector)?.[1];
    expect(button).toMatch(/flex-shrink:\s*0;/);
    expect(button).toMatch(/min-width:\s*32px;/);
    expect(button).toMatch(/min-height:\s*32px;/);
  }
  expect(dialog.match(/\.dialog footer\s*\{([^}]+)\}/)?.[1]).toMatch(/flex-wrap:\s*wrap;/);
  expect(dialog).toMatch(
    /\.dialog header button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--command-gold\);/,
  );
});

it('retains Panel title, complete contents and the original close callback', () => {
  const close = vi.fn();
  render(
    <Panel title="城池與內政" onClose={close}>
      <button>實際內政操作</button>
      <p>完整資源與城池資訊</p>
    </Panel>,
  );
  expect(screen.getByText('城池與內政')).toBeTruthy();
  expect(screen.getByText('完整資源與城池資訊')).toBeTruthy();
  expect(screen.getByRole('button', { name: '實際內政操作' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '城池與內政' }));
  expect(close).toHaveBeenCalledOnce();
});

it('keeps dialog content and footer actions in logical order with original focus and Escape ownership', async () => {
  const close = vi.fn(),
    confirm = vi.fn(),
    cancel = vi.fn();
  render(
    <Dialog
      open
      title="保留同意所有權"
      onClose={close}
      footer={
        <>
          <button onClick={cancel}>取消</button>
          <button onClick={confirm}>確定</button>
        </>
      }
    >
      <label>
        命令內容
        <input aria-label="命令內容" />
      </label>
    </Dialog>,
  );
  const dialog = screen.getByRole('dialog', { name: '保留同意所有權' });
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  expect(
    within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['', '取消', '確定']);
  const cancelButton = within(dialog).getByRole('button', { name: '取消' });
  const confirmButton = within(dialog).getByRole('button', { name: '確定' });
  expect(cancelButton.closest('footer')).toBe(confirmButton.closest('footer'));
  cancelButton.focus();
  fireEvent.click(cancelButton);
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
});
