import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SettingsSchema, type SettingsPatch } from '../../app/settings';
import { SettingsPanel } from './SettingsPanel';
afterEach(cleanup);

it('renders canonical groups and labelled settings, hides reserved audio and locks language', () => {
  render(
    <SettingsPanel
      settings={SettingsSchema.parse({})}
      onChange={() => {}}
      onReset={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole('group', { name: '預設遊戲速度' })).toBeTruthy();
  expect(screen.getAllByRole('switch')).toHaveLength(7);
  expect(screen.getByRole('slider', { name: /介面縮放/ }).getAttribute('min')).toBe('0.8');
  expect(screen.getByRole('slider').getAttribute('max')).toBe('1.5');
  expect(screen.getByRole('slider').getAttribute('step')).toBe('0.05');
  expect(screen.getByRole('combobox', { name: '語言' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText('主音量')).toBeNull();
});
it('calls typed immediate patches for switches, segmented choices and the scale slider', () => {
  const onChange = vi.fn(),
    onClose = vi.fn();
  render(
    <SettingsPanel
      settings={SettingsSchema.parse({})}
      onChange={onChange}
      onReset={() => {}}
      onClose={onClose}
    />,
  );
  fireEvent.click(screen.getByRole('switch', { name: '外交來使' }));
  expect(onChange).toHaveBeenLastCalledWith({ autoPause: { envoy: false } });
  fireEvent.keyDown(screen.getByRole('switch', { name: '地圖特效' }), { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith({ effectsEnabled: false });
  fireEvent.click(screen.getByRole('radio', { name: '僅重大' }));
  expect(onChange).toHaveBeenLastCalledWith({ notificationFilter: 'critical' });
  fireEvent.click(screen.getByRole('radio', { name: '×5' }));
  expect(onChange).toHaveBeenLastCalledWith({ defaultSpeed: 'x5' });
  fireEvent.change(screen.getByRole('slider'), { target: { value: '1.25' } });
  expect(onChange).toHaveBeenLastCalledWith({ uiScale: 1.25 });
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  expect(onClose).toHaveBeenCalledOnce();
});
it('keeps reset behind cancel-first native confirmation and applies only after confirmation', () => {
  const onReset = vi.fn();
  render(
    <SettingsPanel
      settings={SettingsSchema.parse({})}
      onChange={() => {}}
      onReset={onReset}
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '回復預設值' }));
  expect(onReset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(onReset).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '回復預設值' }));
  fireEvent.click(screen.getByRole('button', { name: '確定' }));
  expect(onReset).toHaveBeenCalledOnce();
});
it('reflects controlled updates and shows persistence failure without disabling preferences', () => {
  function Harness() {
    const [settings, setSettings] = useState(SettingsSchema.parse({}));
    const change = (patch: SettingsPatch) =>
      setSettings((previous) =>
        SettingsSchema.parse({
          ...previous,
          ...patch,
          autoPause: { ...previous.autoPause, ...patch.autoPause },
        }),
      );
    return (
      <SettingsPanel
        settings={settings}
        onChange={change}
        onReset={() => setSettings(SettingsSchema.parse({}))}
        onClose={() => {}}
        persistenceError
      />
    );
  }
  render(<Harness />);
  expect(screen.getByText('設定無法儲存，仍會在本次使用期間生效。')).toBeTruthy();
  fireEvent.click(screen.getByRole('switch', { name: '地圖特效' }));
  expect(screen.getByRole<HTMLInputElement>('switch', { name: '地圖特效' }).checked).toBe(false);
  fireEvent.change(screen.getByRole('slider'), { target: { value: '1.3' } });
  expect(screen.getByText('130%')).toBeTruthy();
});
