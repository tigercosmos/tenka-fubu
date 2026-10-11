import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SaveMeta } from '@core/save/serialize';
import type { SaveSlotView } from '@app/persistence/saveStore';
import { SAVE_FORMAT_VERSION } from '@core/save/migrate';
import { SaveLoadPanel, type SaveLoadPanelProps } from './SaveLoadPanel';

const meta: SaveMeta = {
  scenarioId: 's1560',
  appVersion: 'test',
  clanId: 'clan.oda',
  clanName: '織田家',
  leaderName: '織田信長',
  day: 0,
  castleCount: 3,
  officerCount: 20,
  totalKokudaka: 120000,
  difficulty: 'normal',
  dateText: '1560年1月1日',
  playtimeSeconds: 3660,
  version: SAVE_FORMAT_VERSION - 1,
};
function occupied(slotId: SaveSlotView['slotId'] = 'manual:1'): SaveSlotView {
  return { slotId, status: 'ok', meta, timestamp: 1751808000000, needsMigration: true };
}
function props(patch: Partial<SaveLoadPanelProps> = {}): SaveLoadPanelProps {
  return {
    mode: 'save',
    context: 'main',
    slots: [],
    dirty: false,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onImportLoad: vi.fn(),
    onImportStore: vi.fn(),
    onImportCancel: vi.fn(),
    ...patch,
  };
}
afterEach(cleanup);

describe('controlled SaveLoadPanel', () => {
  it('defers removed file-picker focus restoration until the simultaneous busy/preview update finishes', () => {
    const p = props({ mode: 'load' });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    screen.getByRole('button', { name: '匯入存檔' }).focus();
    const preview = { meta, timestamp: 1751808000000, migratedFrom: null, identity: {} };
    rerender(<SaveLoadPanel {...p} busy importPreview={preview} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<SaveLoadPanel {...p} importPreview={preview} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }));
  });
  it('does not steal a surviving focused control when programmatic file selection creates a preview', () => {
    const p = props({ mode: 'load' });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    const back = screen.getByRole('button', { name: '返回' });
    back.focus();
    const preview = { meta, timestamp: 1751808000000, migratedFrom: null, identity: {} };
    rerender(<SaveLoadPanel {...p} importPreview={preview} />);
    expect(document.activeElement).toBe(back);
  });
  it('restores removed import controls only on actual preview transitions, not metadata refresh', () => {
    const p = props({ mode: 'load' });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    screen.getByRole('button', { name: '匯入存檔' }).focus();
    const preview = { meta, timestamp: 1751808000000, migratedFrom: null, identity: {} };
    rerender(<SaveLoadPanel {...p} importPreview={preview} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }));
    const target = screen.getByRole('combobox');
    target.focus();
    rerender(<SaveLoadPanel {...p} importPreview={{ ...preview, meta: { ...meta } }} />);
    expect(document.activeElement).toBe(target);
    screen.getByRole('button', { name: '取消' }).focus();
    rerender(<SaveLoadPanel {...p} importPreview={null} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '匯入存檔' }));
  });
  it('blocks portal drops during confirmation and invalidates a replaced import token', () => {
    const preview = { meta, timestamp: 1751808000000, migratedFrom: null, identity: {} };
    const p = props({ mode: 'load', importPreview: preview });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: '直接開始' }));
    const dialog = screen.getByRole('dialog');
    const file = new File(['{}'], 'replacement.tenkafubu.json');
    fireEvent.drop(dialog, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(p.onImport).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
    rerender(
      <SaveLoadPanel
        {...p}
        importPreview={{ ...preview, meta: { ...meta, dateText: '1560年1月2日' } }}
      />,
    );
    expect(screen.getByRole('dialog')).toBe(dialog);
    rerender(<SaveLoadPanel {...p} importPreview={{ ...preview, identity: {} }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(p.onImportLoad).not.toHaveBeenCalled();
    expect(p.onImportStore).not.toHaveBeenCalled();
  });
  it('renders all14 slots in canonical order and keeps auto/quick saves read-only', () => {
    render(<SaveLoadPanel {...props({ slots: [occupied('auto:2'), occupied()] })} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(14);
    expect(rows[0]?.getAttribute('data-testid')).toBe('save-slot-manual:1');
    expect(rows[9]?.getAttribute('data-testid')).toBe('save-slot-manual:10');
    expect(rows[10]?.getAttribute('data-testid')).toBe('save-slot-auto:1');
    expect(rows[13]?.getAttribute('data-testid')).toBe('save-slot-quick:1');
    expect(within(rows[0]!).getByText('3城・20將・120,000石')).toBeTruthy();
    expect(within(rows[0]!).getByText('遊玩 1時1分')).toBeTruthy();
    expect(within(rows[0]!).getByText(/載入時將升級/)).toBeTruthy();
    expect(within(rows[10]!).getByRole('button', { name: '存檔' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(
      within(rows[10]!).getByRole('button', { name: '存檔' }).getAttribute('aria-describedby'),
    ).toBeTruthy();
    expect(within(rows[13]!).getByRole('button', { name: '存檔' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('saves empty manual slots immediately but makes occupied overwrite cancel-first', async () => {
    const p = props({ slots: [occupied()] });
    render(<SaveLoadPanel {...p} />);
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:2')).getByRole('button', { name: '存檔' }),
    );
    await waitFor(() =>
      expect(p.onSave).toHaveBeenCalledWith(
        'manual:2',
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', { name: '存檔' }),
    );
    expect(p.onSave).toHaveBeenCalledTimes(1);
    const cancel = screen.getByRole('button', { name: '取消' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    expect(p.onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', { name: '存檔' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await waitFor(() =>
      expect(p.onSave).toHaveBeenCalledWith(
        'manual:1',
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
  });
  it('loads clean title slots directly and confirms dirty replacement without a save action', async () => {
    const p = props({ context: 'title', mode: 'load', slots: [occupied()] });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    expect(screen.queryByRole('button', { name: '存檔' })).toBeNull();
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', { name: '載入' }),
    );
    await waitFor(() =>
      expect(p.onLoad).toHaveBeenCalledWith(
        'manual:1',
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    rerender(<SaveLoadPanel {...p} dirty />);
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', { name: '載入' }),
    );
    expect(screen.getByText(/尚有未存檔的進度/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(p.onLoad).toHaveBeenCalledTimes(1);
  });
  it('offers raw export and confirmed deletion for corrupt slots, never load', async () => {
    const p = props({
      mode: 'load',
      slots: [
        {
          slotId: 'manual:1',
          status: 'corrupt',
          meta: null,
          timestamp: null,
          needsMigration: false,
        },
      ],
    });
    render(<SaveLoadPanel {...p} />);
    const row = within(screen.getByTestId('save-slot-manual:1'));
    expect(row.getByRole('button', { name: '載入' })).toHaveProperty('disabled', true);
    fireEvent.click(row.getByRole('button', { name: '匯出原始資料' }));
    await waitFor(() =>
      expect(p.onExport).toHaveBeenCalledWith(
        'manual:1',
        { raw: true },
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(row.getByRole('button', { name: '刪除' }));
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await waitFor(() =>
      expect(p.onDelete).toHaveBeenCalledWith(
        'manual:1',
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
  });
  it('previews imports without auto-loading and confirms direct load or occupied manual storage', async () => {
    const p = props({
      mode: 'load',
      slots: [occupied()],
      importPreview: { meta, timestamp: 1751808000000, migratedFrom: 1 },
    });
    render(<SaveLoadPanel {...p} />);
    expect(p.onImportLoad).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox').querySelectorAll('option')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: '直接開始' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
    expect(p.onImportLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '直接開始' }));
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await waitFor(() => expect(p.onImportLoad).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '存入槽位' }));
    expect(p.onImportStore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    await waitFor(() =>
      expect(p.onImportStore).toHaveBeenCalledWith(
        'manual:1',
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
  });
  it('forwards file selection and whole-panel drops to the controller only', async () => {
    const p = props({ mode: 'load' });
    render(<SaveLoadPanel {...p} />);
    const file = new File(['{}'], 'save.tenkafubu.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('save-import-file'), { target: { files: [file] } });
    await waitFor(() =>
      expect(p.onImport).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    const transfer = { files: [file], types: ['Files'] };
    fireEvent.dragEnter(screen.getByTestId('save-load-panel'), { dataTransfer: transfer });
    expect(screen.getByText('放開以匯入存檔')).toBeTruthy();
    fireEvent.drop(screen.getByTestId('save-load-panel'), { dataTransfer: transfer });
    await waitFor(() => expect(p.onImport).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('放開以匯入存檔')).toBeNull();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(p.onLoad).not.toHaveBeenCalled();
  });
  it('locks duplicate actions until async completion and surfaces unexpected failures', async () => {
    let finish: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const p = props({ onSave });
    const { rerender } = render(<SaveLoadPanel {...p} />);
    const save = within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
      name: '存檔',
    });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '返回' })).toHaveProperty('disabled', true);
    finish();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    rerender(<SaveLoadPanel {...p} onSave={() => Promise.reject(new Error('I/O failed'))} />);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('存檔寫入失敗'));
  });
});
