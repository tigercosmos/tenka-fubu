import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';
afterEach(cleanup);
it('Enter activates only the focused native button, never a document-wide confirmation', async () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="確認處置"
      message="不可復原"
      confirmText="執行"
      cancelText="取消"
      onConfirm={confirm}
      onCancel={cancel}
    />,
  );
  const user = userEvent.setup();
  screen.getByRole('button', { name: '取消' }).focus();
  await user.keyboard('{Enter}');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  screen.getByRole('button', { name: '執行' }).focus();
  await user.keyboard('{Enter}');
  expect(confirm).toHaveBeenCalledTimes(1);
});
