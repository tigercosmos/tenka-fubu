import { expect, it, vi } from 'vitest';
import { classifyLateWarmupOwner, clickInDocumentWarmup } from '../../e2e/warmup-owner-snapshot';

const timeout = () => Object.assign(new Error('Action timeout'), { name: 'TimeoutError' });
it('retains 750ms native actionability while disabling only the post-click navigation wait', async () => {
  const click = vi.fn(() => Promise.resolve());
  const snapshot = vi.fn(() => Promise.resolve({ dialogs: 0, owners: [], unknownDialogs: 0 }));
  expect(await clickInDocumentWarmup(click, snapshot)).toBe('clicked');
  expect(click).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledWith({ timeout: 750, noWaitAfter: true });
  expect(snapshot).not.toHaveBeenCalled();
});
it('defers an action timeout only with one atomically acknowledged registered FIFO owner', async () => {
  const error = timeout();
  const click = vi.fn(() => Promise.reject(error));
  const snapshot = vi.fn(() =>
    Promise.resolve({
      dialogs: 1,
      owners: ['proposal-inbox'],
      unknownDialogs: 0,
    }),
  );
  expect(await clickInDocumentWarmup(click, snapshot)).toBe('retry');
  expect(click).toHaveBeenCalledTimes(1);
  expect(snapshot).toHaveBeenCalledTimes(1);
});
it.each([
  { dialogs: 0, owners: [], unknownDialogs: 0 },
  { dialogs: 1, owners: [], unknownDialogs: 1 },
  { dialogs: 2, owners: ['proposal-inbox', 'envoy-modal'], unknownDialogs: 0 },
  { dialogs: 1, owners: ['proposal-inbox', 'envoy-modal'], unknownDialogs: 0 },
  { dialogs: 1, owners: ['unregistered'], unknownDialogs: 0 },
])(
  'never swallows a timeout after empty, unknown or simultaneous owner snapshot %j',
  async (value) => {
    await expect(
      clickInDocumentWarmup(
        () => Promise.reject(timeout()),
        () => Promise.resolve(value),
      ),
    ).rejects.toThrow();
  },
);
it('preserves other native input failures without consulting an owner snapshot', async () => {
  const error = new Error('Page closed');
  const snapshot = vi.fn(() =>
    Promise.resolve({
      dialogs: 1,
      owners: ['proposal-inbox'],
      unknownDialogs: 0,
    }),
  );
  await expect(clickInDocumentWarmup(() => Promise.reject(error), snapshot)).rejects.toBe(error);
  expect(snapshot).not.toHaveBeenCalled();
});

it('recognizes a registered owner arriving after all sequential visibility reads were negative', () => {
  const earlierReads = [false, false, false, false];
  expect(earlierReads.every((visible) => !visible)).toBe(true);
  expect(
    classifyLateWarmupOwner({ dialogs: 1, owners: ['proposal-inbox'], unknownDialogs: 0 }),
  ).toBe('retry');
});
it.each(['month-summary', 'proposal-inbox', 'envoy-modal', 'event-modal'])(
  'only retries the registered late owner %s without resolving it',
  (owner) => {
    const snapshot = { dialogs: 1, owners: [owner], unknownDialogs: 0 };
    expect(classifyLateWarmupOwner(snapshot)).toBe('retry');
    expect(snapshot).toEqual({ dialogs: 1, owners: [owner], unknownDialogs: 0 });
  },
);
it('accepts genuinely empty owner snapshots', () => {
  expect(classifyLateWarmupOwner({ dialogs: 0, owners: [], unknownDialogs: 0 })).toBe('none');
});
it.each([
  { dialogs: 1, owners: [], unknownDialogs: 1 },
  { dialogs: 1, owners: ['unregistered'], unknownDialogs: 0 },
  { dialogs: 2, owners: ['proposal-inbox', 'envoy-modal'], unknownDialogs: 0 },
  { dialogs: 1, owners: ['proposal-inbox', 'envoy-modal'], unknownDialogs: 0 },
  { dialogs: 2, owners: ['proposal-inbox'], unknownDialogs: 1 },
  { dialogs: 0, owners: ['proposal-inbox'], unknownDialogs: 0 },
  { dialogs: 1, owners: ['proposal-inbox'], unknownDialogs: 1 },
  { dialogs: -1, owners: [], unknownDialogs: 0 },
])('fails closed for unknown, simultaneous or inconsistent owner snapshots %j', (snapshot) => {
  expect(() => classifyLateWarmupOwner(snapshot)).toThrow();
});
