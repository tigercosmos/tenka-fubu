import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiStore } from '../../hooks/uiStore';
import { UI } from '../../uiConstants';
import { ContextPanel } from '../ContextPanel/ContextPanel';
import { DataTable } from './DataTable';

afterEach(() => {
  cleanup();
  uiStore.getState().actions.setUiScale(1);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const rows = Array.from({ length: 650 }, (_, id) => ({ id, name: `row-${id}` }));
const columns = [
  { key: 'name', header: 'Name', width: 120, render: (row: (typeof rows)[number]) => row.name },
];

describe('logical numeric UI dimensions', () => {
  it('makes interactive rows keyboard reachable without stealing embedded controls', () => {
    const activate = vi.fn();
    const { container } = render(
      <DataTable
        rows={[{ id: 1 }]}
        columns={[
          { key: 'action', header: 'Action', render: () => <button type="button">Control</button> },
        ]}
        rowKey={(row) => String(row.id)}
        onRowClick={activate}
      />,
    );
    const row = container.querySelector('tbody tr')!;
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.getAttribute('role')).toBeNull();
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(activate).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(row.querySelector('button')!, { key: 'Enter' });
    fireEvent.click(row.querySelector('button')!);
    expect(activate).toHaveBeenCalledTimes(2);
  });
  it.each([0.8, 1, 1.5])('scales virtual650-row math and columnwidth at uiScale=%s', (scale) => {
    vi.useFakeTimers();
    uiStore.getState().actions.setUiScale(scale);
    const { container, getByText } = render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => String(row.id)}
        rowHeight={40}
        height={200}
      />,
    );
    const viewport = container.firstElementChild as HTMLDivElement;
    expect(viewport.style.height).toBe(`${200 * scale}px`);
    expect(container.querySelector('th')?.style.width).toBe(`${120 * scale}px`);
    expect(container.querySelector('tbody tr:not([aria-hidden])')?.getAttribute('style')).toContain(
      `height: ${40 * scale}px`,
    );
    fireEvent.scroll(viewport, { target: { scrollTop: (650 * 40 - 200) * scale } });
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(getByText('row-649')).toBeDefined();
    expect(container.querySelectorAll('tbody tr:not([aria-hidden])').length).toBeLessThan(25);
    const spacer = container.querySelector('tbody tr[aria-hidden] td') as HTMLTableCellElement;
    expect(Number.parseFloat(spacer.style.height) / (40 * scale)).toBe(
      650 - 5 - UI.tableOverscanRows,
    );
  });
  it('recalculates physical viewport/row sizes on runtime scale changes', () => {
    const { container } = render(
      <DataTable rows={rows} columns={columns} rowKey={(row) => String(row.id)} height={200} />,
    );
    act(() => uiStore.getState().actions.setUiScale(1.5));
    expect((container.firstElementChild as HTMLElement).style.height).toBe('300px');
    expect(container.querySelector('tbody tr:not([aria-hidden])')?.getAttribute('style')).toContain(
      'height: 60px',
    );
  });
  it('caps a context panel below the HUD and keeps tall content scrollable using logical rem height', () => {
    const { container } = render(
      <ContextPanel open title="Context" height={320} onClose={() => {}}>
        Content
      </ContextPanel>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe('20rem');
    expect(root.style.maxHeight).toBe('calc(100dvh - 3rem)');
    expect(root.style.overflowY).toBe('auto');
  });
});
