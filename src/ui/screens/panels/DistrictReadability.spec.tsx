import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../../tests/helpers/loopState';
import type { DistrictId } from '@core/state/ids';
import { uiStore } from '../../hooks/uiStore';
import { DistrictPanel } from './DistrictPanel';

const districtId = 'dist.readability' as DistrictId;
beforeEach(() => {
  const game = makeLoopTestState();
  game.castles[TEST_CASTLE]!.districtIds = [districtId];
  game.districts[districtId] = {
    id: districtId,
    name: '春日井郡',
    castleId: TEST_CASTLE,
    isPort: false,
    pos: { x: 0, y: 0 },
    ownerClanId: TEST_CLAN,
    stewardId: null,
    kokudaka: 42000,
    kokudakaCap: 60000,
    commerce: 380,
    commerceCap: 2000,
    population: 21000,
    populationCap: 30000,
    publicOrder: 64,
    developFocus: 'agri',
    subjugation: null,
    uprising: null,
  };
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  uiStore.getState().actions.reset();
});
it('floors district body text locally while retaining the original normal and large-scale token', () => {
  const css = readFileSync('src/ui/screens/panels/DistrictPanel.module.css', 'utf8');
  expect(css).toMatch(/\.content\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/);
  expect(css).not.toMatch(/\.content\s*\{[^}]*background(?:-image)?:/);
});
it('preserves actual metrics, steward options and checked development policy without interaction', () => {
  const onCommand = vi.fn(),
    game = store.getState().game!,
    before = structuredClone(game);
  render(<DistrictPanel districtId={districtId} onCommand={onCommand} />);
  const panel = screen.getByTestId('district-panel');
  expect(panel.textContent).toContain('春日井郡');
  expect(panel.textContent).toContain('42,000／60,000石');
  expect(panel.textContent).toContain('380／2,000');
  expect(panel.textContent).toContain('21,000／30,000人');
  expect(panel.querySelectorAll('progress')).toHaveLength(4);
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '領主' }).value).toBe('');
  expect(screen.getByRole('option', { name: '直轄' })).toBeTruthy();
  expect(screen.getByRole<HTMLOptionElement>('option', { name: /當主/ }).disabled).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '農業優先' }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '商業優先' }).checked).toBe(false);
  expect(screen.getByRole<HTMLInputElement>('radio', { name: '兵舍優先' }).checked).toBe(false);
  expect(onCommand).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});
it('retains the real close owner callback without issuing a fief or focus command', () => {
  const onCommand = vi.fn(),
    onClose = vi.fn(),
    game = store.getState().game!,
    before = structuredClone(game);
  render(<DistrictPanel districtId={districtId} onCommand={onCommand} onClose={onClose} />);
  const close = screen.getByTestId('district-panel').querySelector('header button');
  if (!(close instanceof HTMLButtonElement)) throw new Error('Missing real district close button');
  fireEvent.click(close);
  expect(onClose).toHaveBeenCalledOnce();
  expect(onCommand).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});
