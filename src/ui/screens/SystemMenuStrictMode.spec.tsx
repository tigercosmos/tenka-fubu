import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGameStoreForTests, store } from '@app/store';
import { t } from '@i18n/zh-TW';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { SystemMenuHost } from './SystemMenuHost';

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState());
  uiStore.getState().actions.reset();
});

describe('SystemMenu owner across React effect replay', () => {
  it.each([
    ['ordinary mount', false],
    ['StrictMode mount', true],
  ])('keeps the real modal after %s', (_name, strict) => {
    render(
      strict ? (
        <StrictMode>
          <SystemMenuHost />
        </StrictMode>
      ) : (
        <SystemMenuHost />
      ),
    );
    act(() => {
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: true,
      });
    });

    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(screen.getByRole('dialog', { name: t('ui.system.menu') })).toBeTruthy();
  });

  it('releases a real unmount without resuming its owned pause', async () => {
    store.getState().actions.setSpeed('x2');
    const view = render(
      <StrictMode>
        <SystemMenuHost />
      </StrictMode>,
    );
    act(() =>
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: true,
      }),
    );
    expect(store.getState().session.speed).toBe('paused');
    view.unmount();
    await act(async () => Promise.resolve());
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
    expect(uiStore.getState().restoreSpeedOnQueueDrain).toBe(false);
  });

  it('does not dismiss a different modal promoted after real unmount', async () => {
    const view = render(
      <StrictMode>
        <SystemMenuHost />
      </StrictMode>,
    );
    act(() =>
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: false,
      }),
    );
    const original = uiStore.getState().modal!;
    view.unmount();
    const replacement = { id: 'event' as const, params: {}, pausesTime: false };
    uiStore.getState().actions.closeOwnedModal(original, { resume: false });
    uiStore.getState().actions.enqueueModal(replacement);
    await act(async () => Promise.resolve());
    expect(uiStore.getState().modal).toBe(replacement);
  });

  it('keeps confirmation callbacks owned after replay', () => {
    const returnToTitle = vi.fn();
    render(
      <StrictMode>
        <SystemMenuHost dirty onReturnToTitle={returnToTitle} />
      </StrictMode>,
    );
    act(() =>
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: false,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    expect(screen.getByText(t('ui.system.confirmToTitle'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(returnToTitle).not.toHaveBeenCalled();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(returnToTitle).toHaveBeenCalledOnce();
  });
});
