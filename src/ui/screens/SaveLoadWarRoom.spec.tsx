import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SaveLoadPanel, type SaveLoadPanelProps } from './SaveLoadPanel';
import styles from './SaveLoadPanel.module.css';
import { SAVE_FORMAT_VERSION } from '@core/save/migrate';

afterEach(cleanup);
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
describe('SaveLoad war-room registry', () => {
  it('binds a quiet toolbar and full canonical registry to the actual producer', () => {
    render(<SaveLoadPanel {...props()} />);
    const panel = screen.getByTestId('save-load-panel');
    expect(panel.querySelector(`.${styles.registryNote}`)?.textContent).toContain('僅手動槽');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(14);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `save-slot-manual:${i + 1}`),
      'save-slot-auto:1',
      'save-slot-auto:2',
      'save-slot-auto:3',
      'save-slot-quick:1',
    ]);
    expect(rows.every((row) => row.querySelector(`.${styles.slotTitle}`))).toBe(true);
    expect(rows.every((row) => within(row).getByText('（空）'))).toBe(true);
  });
  it('keeps empty manual saves, managed-slot restrictions and Return ownership intact', async () => {
    const p = props();
    render(<SaveLoadPanel {...p} />);
    const manual = screen.getByTestId('save-slot-manual:1');
    fireEvent.click(within(manual).getByRole('button', { name: '存檔' }));
    expect(p.onSave).toHaveBeenCalledWith(
      'manual:1',
      expect.objectContaining({ isCurrent: expect.any(Function) as () => boolean }),
    );
    for (const id of ['auto:1', 'quick:1']) {
      expect(
        within(screen.getByTestId(`save-slot-${id}`)).getByRole('button', { name: '存檔' }),
      ).toHaveProperty('disabled', true);
    }
    expect(p.onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(p.onClose).toHaveBeenCalledOnce();
  });
  it('keeps corrupt reasons, raw export and full import-preview metadata and target controls', () => {
    const meta = {
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
      version: SAVE_FORMAT_VERSION,
    };
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
      importPreview: { meta, timestamp: 1751808000000, migratedFrom: null, identity: {} },
    });
    render(<SaveLoadPanel {...p} />);
    const row = screen.getByTestId('save-slot-manual:1');
    const load = within(row).getByRole('button', { name: '載入' });
    expect(load).toHaveProperty('disabled', true);
    expect(load.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /匯出/ })).toHaveProperty('disabled', false);
    const preview = screen.getByRole('region', { name: '匯入存檔' });
    expect(preview.textContent).toContain('3城・20將・120,000石');
    expect(preview.textContent).toContain('織田信長');
    expect(within(preview).getByRole('combobox').querySelectorAll('option')).toHaveLength(10);
    expect(within(preview).getAllByRole('button')).toHaveLength(3);
    expect(p.onImportLoad).not.toHaveBeenCalled();
    expect(p.onImportStore).not.toHaveBeenCalled();
  });
  it('retains complete occupied metadata and cancel-first destructive/dirty actions', () => {
    const meta = {
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
    const p = props({
      mode: 'load',
      dirty: true,
      slots: [
        { slotId: 'manual:1', status: 'ok', meta, timestamp: 1751808000000, needsMigration: true },
      ],
    });
    render(<SaveLoadPanel {...p} />);
    const row = screen.getByTestId('save-slot-manual:1');
    for (const text of [
      '織田家',
      '織田信長',
      '1560年1月1日',
      '3城・20將・120,000石',
      '遊玩 1時1分',
    ])
      expect(row.textContent).toContain(text);
    expect(row.textContent).toMatch(/載入時將升級/);
    fireEvent.click(within(row).getByRole('button', { name: '載入' }));
    expect(p.onLoad).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(p.onLoad).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: '刪除' }));
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it('declares intrinsic full-wrap columns, readable paper metadata and disabled controls without hiding information', () => {
    const css = readFileSync('src/ui/screens/SaveLoadPanel.module.css', 'utf8');
    expect(css).toContain('repeat(auto-fit, minmax(min(100%, 19rem), 1fr))');
    expect(css).toContain('grid-auto-rows: max-content');
    expect(css).toContain('font-size: max(12px, var(--font-size-xs))');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toMatch(/\.panel \.header\s*\{[^}]*background:\s*var\(--surface-raised\)/);
    expect(css).toMatch(/\.panel button:disabled\s*\{[^}]*opacity:\s*1/);
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).not.toContain('text-overflow: ellipsis');
  });
});
