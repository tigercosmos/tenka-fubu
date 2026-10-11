import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSaveLoad } from '../../src/app/persistence/useSaveLoad';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { buildSaveFile, type SaveFile } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState } from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function setup() {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  const session = {};
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] }),
    subscribe: () => () => {},
    now: () => 0,
    target: { addEventListener() {}, removeEventListener() {} },
  });
  const controller = createSaveSessionController({
    adapter: createMemorySaveStorage(),
    progress,
    getSession: () => session,
    captureSnapshot: (timestamp, context) => buildSaveFile(game, timestamp, [], context),
    wallNow: () => 300,
    appVersion: 'test',
  });
  controller.resetSession();
  const selected = buildSaveFile(game, 200);
  const other = buildSaveFile(game, 150);
  expect(await controller.store.saveToSlot('manual:1', selected)).toEqual({ ok: true });
  expect(await controller.store.saveToSlot('manual:2', other)).toEqual({ ok: true });
  const onLoad = vi.fn((_save: SaveFile, current: () => boolean) => {
    expect(current()).toBe(true);
  });
  const hook = renderHook(() => useSaveLoad(controller, onLoad));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  return { controller, hook, selected, other, onLoad };
}

it('continues the actual newest unchanged save through the native storage codec', async () => {
  const { hook, selected, onLoad } = await setup();
  await act(async () => hook.result.current.continueLatest());
  expect(onLoad).toHaveBeenCalledOnce();
  expect(onLoad.mock.calls[0]?.[0]).toEqual(selected);
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.busy).toBe(false);
});

it('rejects a real replacement between latest selection and guarded loading', async () => {
  const { controller, hook, selected, other, onLoad } = await setup();
  const replacement = structuredClone(selected);
  replacement.timestamp = 100;
  replacement.state.clans[replacement.state.meta.playerClanId]!.gold += 1;
  expect(validateState(replacement.state)).toEqual([]);
  const findLatest = controller.store.findLatestSave.bind(controller.store);
  // Deterministic orchestration seam only: the selection delegates to the real
  // store, then a real serialized write interleaves before the caller resumes.
  // This is not a browser race or a mocked decode/acceptance result.
  vi.spyOn(controller.store, 'findLatestSave').mockImplementation(async () => {
    const candidate = await findLatest();
    expect(candidate?.slotId).toBe('manual:1');
    expect(candidate?.timestamp).toBe(200);
    expect(await controller.store.saveToSlot('manual:1', replacement)).toEqual({ ok: true });
    return candidate;
  });
  await act(async () => hook.result.current.continueLatest());
  expect(onLoad).not.toHaveBeenCalled();
  expect(hook.result.current.error).not.toBeNull();
  expect(hook.result.current.busy).toBe(false);
  const persistedReplacement = await controller.store.loadFromSlot('manual:1');
  const persistedOther = await controller.store.loadFromSlot('manual:2');
  expect(persistedReplacement).toMatchObject({ ok: true, save: replacement });
  expect(persistedOther).toMatchObject({ ok: true, save: other });
});
