import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSaveLoad } from '../../src/app/persistence/useSaveLoad';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { buildSaveFile } from '../../src/core/save/serialize';
import { buildTinyState } from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('a retained error-dismiss callback cannot close a newly opened save panel', async () => {
  const memory = createMemorySaveStorage();
  await memory.setMany([['tf.save.quick:1.blob', 'invalid compressed save']]);
  const session = {};
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] }),
    subscribe: () => () => {},
    now: () => 0,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const controller = createSaveSessionController({
    adapter: memory,
    progress,
    getSession: () => session,
    captureSnapshot: (timestamp, context) =>
      buildSaveFile(buildTinyState(), timestamp, [], context),
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession();
  const hook = renderHook(() => useSaveLoad(controller, vi.fn()));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  await act(() => hook.result.current.quickLoad());
  expect(hook.result.current.error).not.toBeNull();
  const oldDismiss = hook.result.current.close;
  act(() => {
    hook.result.current.resetUi();
    hook.result.current.open('save');
  });
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  act(() => oldDismiss());
  expect(hook.result.current.mode).toBe('save');
});

it('an old panel delete callback cannot delete a newer slot after close and reopen', async () => {
  const session = {};
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] }),
    subscribe: () => () => {},
    now: () => 0,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const controller = createSaveSessionController({
    adapter: createMemorySaveStorage(),
    progress,
    getSession: () => session,
    captureSnapshot: (timestamp, context) =>
      buildSaveFile(buildTinyState(), timestamp, [], context),
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession();
  await controller.store.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 123));
  const hook = renderHook(() => useSaveLoad(controller, vi.fn()));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  act(() => hook.result.current.open('load'));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  const old = hook.result.current.panelProps('title', false);
  act(() => hook.result.current.close());
  const replacement = buildSaveFile(buildTinyState(), 456);
  await controller.store.saveToSlot('manual:1', replacement);
  act(() => hook.result.current.open('load'));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  await act(async () => {
    await old.onDelete('manual:1');
  });
  const actual = await controller.store.loadFromSlot('manual:1');
  expect(actual.ok).toBe(true);
  if (actual.ok) expect(actual.save.timestamp).toBe(456);
});

it('cannot delete from an unreadable snapshot; refreshed content remains usable', async () => {
  const memory = createMemorySaveStorage();
  const session = {};
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] }),
    subscribe: () => () => {},
    now: () => 0,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const controller = createSaveSessionController({
    adapter: memory,
    progress,
    getSession: () => session,
    captureSnapshot: (timestamp, context) =>
      buildSaveFile(buildTinyState(), timestamp, [], context),
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession();
  await controller.store.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 456));
  const blocked = vi.spyOn(memory, 'get').mockRejectedValue(new Error('temporarily unreadable'));
  const hook = renderHook(() => useSaveLoad(controller, vi.fn()));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  const old = hook.result.current.panelProps('title', false);
  expect(old.slots.find((slot) => slot.slotId === 'manual:1')).toMatchObject({ status: 'corrupt' });
  const unreadableVersion = old.slots.find((slot) => slot.slotId === 'manual:1')?.version;
  expect(unreadableVersion).toBeTruthy();
  blocked.mockRestore();
  await act(async () => {
    await old.onDelete('manual:1');
  });
  const survived = await controller.store.loadFromSlot('manual:1');
  expect(survived.ok).toBe(true);
  if (survived.ok) expect(survived.save.timestamp).toBe(456);
  await act(() => hook.result.current.refresh());
  expect(
    hook.result.current.panelProps('title', false).slots.find((slot) => slot.slotId === 'manual:1')
      ?.version,
  ).toBeTruthy();
  expect(
    hook.result.current.panelProps('title', false).slots.find((slot) => slot.slotId === 'manual:1')
      ?.version,
  ).not.toBe(unreadableVersion);
  await act(async () => {
    await hook.result.current.panelProps('title', false).onDelete('manual:1');
  });
  expect(await controller.store.loadFromSlot('manual:1')).toMatchObject({
    ok: false,
    error: 'empty-slot',
  });
});
