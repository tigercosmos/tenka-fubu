import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests } from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { t } from '../../src/i18n/zh-TW';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
  vi.spyOn(indexedDbSaveStorage, 'setMany').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
it('actual App quicksave/load ignore select and nested contenteditable while CtrlS still prevents browser save', async () => {
  render(<App />);
  fireEvent.click(screen.getByTestId('title-save-list'));
  await waitFor(() =>
    expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
  fireEvent.click(screen.getByTestId('title-newgame'));
  await waitFor(() =>
    expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
  );
  fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
  fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
  fireEvent.click(screen.getByTestId('daimyo-next'));
  fireEvent.click(screen.getByTestId('difficulty-next'));
  fireEvent.click(screen.getByTestId('newgame-start'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
  const original = store.getState().game;
  const get = vi.spyOn(indexedDbSaveStorage, 'get');
  get.mockClear();
  const write = vi.spyOn(indexedDbSaveStorage, 'setMany');
  write.mockClear();
  const controls = render(
    <>
      <select aria-label="focus select">
        <option>choice</option>
      </select>
      <div contentEditable suppressContentEditableWarning>
        <span data-testid="editable-child">text</span>
      </div>
    </>,
  );
  for (const target of [controls.getByRole('combobox'), controls.getByTestId('editable-child')]) {
    const save = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(save);
    expect(save.defaultPrevented).toBe(true);
    fireEvent.keyDown(target, { key: 'F9' });
  }
  expect(write).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(store.getState().game).toBe(original);
  controls.unmount();
  fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
  await waitFor(() => expect(write).toHaveBeenCalled());
});
