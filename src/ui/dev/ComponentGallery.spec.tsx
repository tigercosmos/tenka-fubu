import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ComponentGallery from './ComponentGallery';
import { resetGameStoreForTests, store } from '@app/store';
import { getBridgeProgressMark, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { buildTinyState } from '../../../tests/fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
function section(name: string) {
  return document.querySelector<HTMLElement>(`[data-gallery-component="${name}"]`)!;
}

describe('DEV ComponentGallery real isolated examples', () => {
  it('mounts all19 exported components plus12crests and six complete icon families with no live game', () => {
    const before = store.getState();
    render(<ComponentGallery />);
    expect(document.querySelectorAll('[data-gallery-component]')).toHaveLength(20);
    expect(
      within(screen.getByRole('navigation', { name: '元件錨點目錄' })).getAllByRole('link'),
    ).toHaveLength(20);
    expect(document.querySelectorAll('[data-gallery-icon]')).toHaveLength(38 * 3);
    expect(document.querySelectorAll('[data-kamon-shape]')).toHaveLength(12 * 3);
    expect(section('OfficerCard').textContent).toContain('展示武將');
    expect(section('CastleListItem').textContent).toContain('展示本城');
    expect(
      within(section('CastleListItem')).getAllByRole('progressbar', { name: /展示.*城 耐久/ }),
    ).toHaveLength(3);
    expect(within(section('ResourceBar')).getByRole('group', { name: '展示家' })).toBeTruthy();
    expect(store.getState()).toBe(before);
    expect(store.getState().game).toBeNull();
  });
  it('uses actual650row virtualization and controlled sorting/selection', async () => {
    render(<ComponentGallery />);
    const table = screen.getByTestId('gallery-large-table');
    expect(table.querySelectorAll('tbody tr').length).toBeLessThan(50);
    fireEvent.click(within(table).getByRole('button', { name: /兵力/ }));
    expect(table.querySelector('th[aria-sort="descending"]')).not.toBeNull();
    fireEvent.click(within(table).getByText('展示第650城'));
    expect(section('DataTable').textContent).toContain('已選取：650');
    const viewport = table.firstElementChild as HTMLElement;
    fireEvent.scroll(viewport, { target: { scrollTop: 16000 } });
    await waitFor(() => expect(table.querySelectorAll('tbody tr').length).toBeLessThan(50));
  });
  it('Dialog traps native keyboard focus and restores opening focus; confirmation starts on cancel', async () => {
    render(<ComponentGallery />);
    const opener = screen.getByRole('button', { name: '開啟sm對話框' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '展示對話框' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const last = within(dialog).getByRole('button', { name: '關閉展示' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).not.toBe(last);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(screen.getByRole('button', { name: '開啟危險確認' }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('取消'));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByText('展示確認次數：0')).toBeTruthy();
  });
  it('local slider/cards/tabs/menu/notifications preserve live state RNG and pending queue', async () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const before = structuredClone(game),
      pending = getBridgeProgressMark();
    render(<ComponentGallery />);
    fireEvent.click(within(section('NumberSlider')).getAllByRole('button', { name: '全' })[0]!);
    fireEvent.click(within(section('EmptyState')).getByRole('button', { name: '執行展示動作' }));
    fireEvent.click(within(section('MenuList')).getByRole('menuitem', { name: '一般動作' }));
    fireEvent.click(screen.getByRole('button', { name: '加一條情報' }));
    fireEvent.click(screen.getByRole('button', { name: '加一條重要' }));
    expect(screen.getByRole('alert').textContent).toContain('重要通知');
    expect(screen.getByRole('alert').tagName).toBe('DIV');
    const dismiss = within(screen.getByRole('alert')).getByRole('button');
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()).toEqual(pending);
    expect(store.getState().game).toBe(game);
    act(() => cleanup());
    expect(game).toEqual(before);
  });
});
