import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable/DataTable';
import { Dialog } from './Dialog/Dialog';
import { NumberSlider } from './NumberSlider/NumberSlider';
import { StatBar } from './StatBar/StatBar';
import { TabView } from './TabView/TabView';

describe('UI foundation components', () => {
  it('DataTable virtualizes 650 rows and sorts strings with a stable key tie-break', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 650 }, (_, index) => ({
      id: String(index).padStart(3, '0'),
      name: index < 2 ? '同名' : `武將${index}`,
    }));
    const onSortChange = vi.fn();
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        height={200}
        columns={[
          {
            key: 'name',
            header: '姓名',
            sortable: true,
            sortValue: (row) => row.name,
            render: (row) => row.name,
          },
        ]}
        onSortChange={onSortChange}
      />,
    );
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(40);
    await user.click(screen.getByRole('button', { name: '姓名' }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', dir: 'asc' });
  });

  it('NumberSlider clamps and snaps typed values to step', () => {
    const onChange = vi.fn();
    render(
      <NumberSlider min={0} max={1000} step={100} value={0} label="兵數" onChange={onChange} />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '955' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1000);
  });

  it('NumberSlider restores the controlled value when the typed field is empty', () => {
    const onChange = vi.fn();
    render(
      <NumberSlider min={0} max={1000} step={100} value={500} label="兵數" onChange={onChange} />,
    );
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('500');
  });

  it('TabView keyboard navigation skips disabled tabs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TabView
        tabs={[
          { id: 'a', label: '甲' },
          { id: 'b', label: '乙', disabled: true },
          { id: 'c', label: '丙' },
        ]}
        activeId="a"
        onChange={onChange}
      >
        <TabView.Pane id="a">A</TabView.Pane>
        <TabView.Pane id="b">B</TabView.Pane>
        <TabView.Pane id="c">C</TabView.Pane>
      </TabView>,
    );
    const first = screen.getByRole('tab', { name: '甲' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('Dialog traps focus and restores it on close', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = render(
      <Dialog open title="測試" onClose={onClose}>
        <button>第一</button>
        <button>最後</button>
      </Dialog>,
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const last = screen.getByRole('button', { name: '最後' });
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '測試' }));
    view.rerender(
      <Dialog open={false} title="測試" onClose={onClose}>
        <button>第一</button>
      </Dialog>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('StatBar exposes the full value through an accessible label', () => {
    render(<StatBar label="統率" value={112} />);
    expect(screen.getByRole('img', { name: '統率 112' })).not.toBeNull();
  });

  it('StatBar max=100 快覽尺：滿值填滿整條，非 0..120 能力尺的 83%（M6-V9 review 補跑）', () => {
    const { container } = render(<StatBar label="耐久" value={100} max={100} showValue={false} />);
    const widths = [...container.querySelectorAll('span')].map((span) => span.style.width);
    expect(widths).toContain('100%');
  });

  it('StatBar showValue=false 不外洩尾端數字（可見文字與 aria 皆僅 label）', () => {
    const { container } = render(<StatBar label="士氣" value={83} max={100} showValue={false} />);
    expect(screen.getByRole('img', { name: '士氣' })).not.toBeNull();
    expect(container.textContent).toBe('士氣');
  });
});
