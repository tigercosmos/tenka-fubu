import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsSchema } from '../../app/settings';
import { SettingsPanel } from './SettingsPanel';

afterEach(cleanup);
const css = readFileSync('src/ui/screens/SettingsPanel.module.css', 'utf8');

it('keeps canonical group and control DOM order inside three actual paper-card groups', () => {
  const { container } = render(
    <SettingsPanel
      settings={SettingsSchema.parse({})}
      onChange={() => {}}
      onReset={() => {}}
      onClose={() => {}}
    />,
  );
  const groups = Array.from(container.querySelectorAll('h3'));
  expect(groups.map((e) => e.textContent)).toEqual(['時間與暫停', '通知與地圖', '顯示']);
  expect(groups.every((e) => e.parentElement?.className.includes('group'))).toBe(true);
  expect(screen.getAllByRole('radio').map((e) => (e as HTMLInputElement).value)).toEqual([
    'x1',
    'x2',
    'x5',
    'all',
    'major',
    'critical',
    'high',
    'medium',
    'low',
  ]);
  expect(screen.getAllByRole('switch').map((e) => e.closest('label')?.textContent)).toEqual([
    '月初',
    '具申送達',
    '外交來使',
    '我方城被圍',
    '合戰可發動',
    '歷史事件',
    '地圖特效',
  ]);
  expect(screen.getByRole('combobox', { name: '語言' }).hasAttribute('disabled')).toBe(true);
});

it('declares only local opaque cards, intrinsic two-column rows and readable physical floors', () => {
  expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  expect(css).toContain('grid-auto-rows: max-content');
  expect(css).toContain('align-content: start');
  expect(css).toContain('background: var(--surface-panel)');
  expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
  expect(css).toContain('min-width: 32px');
  expect(css).toContain('min-height: 32px');
  expect(css).toContain('order: -1');
  expect(css).toContain('overflow-wrap: anywhere');
  expect(css).not.toContain(':global');
  expect(css).not.toContain('display: none');
});

it('preserves controlled values and native Enter patches without optimistic hidden settings', () => {
  const change = vi.fn();
  const settings = SettingsSchema.parse({
    defaultSpeed: 'x2',
    notificationFilter: 'major',
    mapLabelDensity: 'low',
    effectsEnabled: false,
    uiScale: 1.3,
  });
  render(
    <SettingsPanel settings={settings} onChange={change} onReset={() => {}} onClose={() => {}} />,
  );
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '×2' }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '重要以上' }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '低' }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>('slider').value).toBe('1.3');
  fireEvent.keyDown(screen.getByRole('switch', { name: '地圖特效' }), { key: 'Enter' });
  expect(change).toHaveBeenLastCalledWith({ effectsEnabled: true });
  expect(screen.getByRole<HTMLInputElement>('switch', { name: '地圖特效' }).checked).toBe(false);
});

it('retains cancel-first reset, persistence text and original return callback', () => {
  const reset = vi.fn(),
    close = vi.fn();
  render(
    <SettingsPanel
      settings={SettingsSchema.parse({})}
      onChange={() => {}}
      onReset={reset}
      onClose={close}
      persistenceError
    />,
  );
  expect(screen.getByText('設定無法儲存，仍會在本次使用期間生效。').getAttribute('role')).toBe(
    'status',
  );
  fireEvent.click(screen.getByRole('button', { name: '回復預設值' }));
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(reset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  expect(close).toHaveBeenCalledOnce();
});
