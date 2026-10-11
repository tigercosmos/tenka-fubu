import { expect, it } from 'vitest';
import { buildSaveFile } from '../../src/core/save/serialize';
import { buildTinyState } from '../fixtures/tiny';
import { createSaveStore, type SaveSlotVersion } from '../../src/app/persistence/saveStore';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

async function setup() {
  const adapter = createMemorySaveStorage();
  const store = createSaveStore(adapter);
  const save = buildSaveFile(buildTinyState(), 100);
  expect(await store.saveToSlot('manual:1', save)).toEqual({ ok: true });
  return { adapter, store, save };
}
async function version(store: ReturnType<typeof createSaveStore>) {
  const row = (await store.listSlots()).find((view) => view.slotId === 'manual:1')!;
  return row.version as SaveSlotVersion;
}

it('issues stable content tokens for every production row, including empty slots', async () => {
  const { store } = await setup();
  const first = await store.listSlots();
  const next = await store.listSlots();
  expect(first.every((row) => typeof row.version === 'string')).toBe(true);
  expect(next.map((row) => row.version)).toEqual(first.map((row) => row.version));
});

it('rejects old delete consent for changed content with identical summary metadata', async () => {
  const { store, save } = await setup();
  const expectedVersion = await version(store);
  const replacement = structuredClone(save);
  replacement.state.clans[replacement.state.meta.playerClanId]!.gold += 1;
  expect(replacement.meta).toEqual(save.meta);
  expect(await store.saveToSlot('manual:1', replacement)).toEqual({ ok: true });
  expect(await store.deleteSlot('manual:1', { expectedVersion })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: true, save: replacement });
});

it('rejects old overwrite/load/raw-export consent and preserves replacement bytes', async () => {
  const { store, save } = await setup();
  const expectedVersion = await version(store);
  const replacement = buildSaveFile(buildTinyState(), 200);
  await store.saveToSlot('manual:1', replacement);
  const guard = { expectedVersion };
  expect(await store.saveToSlot('manual:1', save, guard)).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  expect(await store.loadFromSlot('manual:1', guard)).toEqual({ ok: false, error: 'slot-changed' });
  expect(await store.exportRawFromSlot('manual:1', guard)).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: true, save: replacement });
});

it('checks current ownership after awaited reads and before a conditional deletion', async () => {
  const adapter = createMemorySaveStorage();
  let current = true;
  let armed = false;
  const guardedAdapter = {
    ...adapter,
    async get(key: string) {
      const value = await adapter.get(key);
      if (armed) current = false;
      return value;
    },
  };
  const conditional = createSaveStore(guardedAdapter);
  await conditional.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 100));
  const expectedVersion = await version(conditional);
  armed = true;
  expect(
    await conditional.deleteSlot('manual:1', { expectedVersion, isCurrent: () => current }),
  ).toEqual({ ok: false, error: 'slot-changed' });
  expect(await conditional.loadFromSlot('manual:1')).toMatchObject({ ok: true });
});

it('rechecks a queued consent inside the shared-adapter slot lock', async () => {
  const memory = createMemorySaveStorage();
  let block = false;
  const entered = deferred(),
    release = deferred();
  const adapter = {
    ...memory,
    async setMany(entries: [string, unknown][]) {
      if (block) {
        block = false;
        entered.resolve();
        await release.promise;
      }
      await memory.setMany(entries);
    },
  };
  const first = createSaveStore(adapter),
    second = createSaveStore(adapter);
  const original = buildSaveFile(buildTinyState(), 100);
  await first.saveToSlot('manual:1', original);
  const expectedVersion = await version(first);
  block = true;
  const replacement = buildSaveFile(buildTinyState(), 200);
  const writing = first.saveToSlot('manual:1', replacement);
  await entered.promise;
  const removing = second.deleteSlot('manual:1', { expectedVersion });
  release.resolve();
  expect(await writing).toEqual({ ok: true });
  expect(await removing).toEqual({ ok: false, error: 'slot-changed' });
  expect(await second.loadFromSlot('manual:1')).toMatchObject({ ok: true, save: replacement });
});

it('compares actual raw metadata without JSON collapsing nonfinite or cyclic values', async () => {
  const { adapter, store } = await setup();
  const cycle: {
    self?: unknown;
    value: number;
    map: Map<string, unknown>;
    set: Set<number>;
    date: Date;
    bytes: Uint8Array;
  } = {
    value: NaN,
    map: new Map([['x', -0]]),
    set: new Set([1, 2]),
    date: new Date(123),
    bytes: new Uint8Array([1, 2]),
  };
  cycle.self = cycle;
  await adapter.setMany([
    ['tf.save.manual:1.blob', 'broken'],
    ['tf.save.manual:1.meta', cycle],
  ]);
  await store.loadFromSlot('manual:1');
  const approved = await version(store);
  expect(await version(store)).toBe(approved);
  cycle.value = Infinity;
  await adapter.setMany([['tf.save.manual:1.meta', cycle]]);
  expect(await store.deleteSlot('manual:1', { expectedVersion: approved })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  const current = await version(store);
  expect(await store.deleteSlot('manual:1', { expectedVersion: current })).toEqual({ ok: true });
});

it('fails closed on unsupported exotic corrupt values without deleting them', async () => {
  const { adapter, store } = await setup();
  await adapter.setMany([
    ['tf.save.manual:1.blob', /opaque/u],
    ['tf.save.manual:1.meta', null],
  ]);
  await store.loadFromSlot('manual:1');
  const expectedVersion = await version(store);
  expect(await store.deleteSlot('manual:1', { expectedVersion })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  expect(await adapter.get('tf.save.manual:1.blob')).toBeInstanceOf(RegExp);
});

it('returns the exact imported version and never grants deletion of an intervening newer slot', async () => {
  const adapter = createMemorySaveStorage();
  const store = createSaveStore(adapter);
  const slot = 'quick:1' as const;
  const empty = (await store.listSlots()).find((row) => row.slotId === slot)!;
  const imported = await store.importLegacySlotIfEmpty(
    slot,
    buildSaveFile(buildTinyState(), 100),
    'legacy-original',
    { expectedVersion: empty.version! },
  );
  expect(imported).toMatchObject({ ok: true, imported: true });
  expect(typeof imported.version).toBe('string');
  expect(imported.version).toBe(
    (await store.listSlots()).find((row) => row.slotId === slot)!.version,
  );
  await store.saveToSlot(slot, buildSaveFile(buildTinyState(), 200));
  expect(await store.deleteSlot(slot, { expectedVersion: imported.version! })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  expect(
    await store.importLegacySlotIfEmpty(
      slot,
      buildSaveFile(buildTinyState(), 100),
      'legacy-original',
      { expectedVersion: empty.version! },
    ),
  ).toEqual({ ok: false, error: 'slot-changed' });
});

it('does not migrate an empty slot when its caller expires during awaited reads', async () => {
  const memory = createMemorySaveStorage();
  let armed = false,
    current = true;
  const adapter = {
    ...memory,
    async get(key: string) {
      const value = await memory.get(key);
      if (armed) current = false;
      return value;
    },
  };
  const store = createSaveStore(adapter);
  const empty = (await store.listSlots()).find((row) => row.slotId === 'quick:1')!;
  armed = true;
  expect(
    await store.importLegacySlotIfEmpty('quick:1', buildSaveFile(buildTinyState(), 100), 'legacy', {
      expectedVersion: empty.version!,
      isCurrent: () => current,
    }),
  ).toEqual({ ok: false, error: 'slot-changed' });
  expect(await memory.get('tf.save.quick:1.blob')).toBeUndefined();
  expect(await memory.get('tf.save.quick:1.legacy.handled')).toBeUndefined();
});

it.each([true, false])(
  'guards queued controller save before session replacement (version guard: %s)',
  async (guarded) => {
    const adapter = createMemorySaveStorage();
    let session: object = {};
    const progress = createSessionProgressBinding({
      getSession: () => session,
      getMark: () => ({ tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] }),
      subscribe: () => () => {},
      now: () => 0,
      target: { addEventListener() {}, removeEventListener() {} },
    });
    const controller = createSaveSessionController({
      adapter,
      progress,
      getSession: () => session,
      captureSnapshot: (timestamp, context) =>
        buildSaveFile(buildTinyState(), timestamp, [], context),
      wallNow: () => 100,
      appVersion: 'test',
    });
    controller.resetSession();
    const expectedVersion = await version(controller.store);
    const saving = controller.saveCurrent(
      'manual:1',
      '',
      guarded ? { expectedVersion } : undefined,
    );
    session = {};
    controller.resetSession();
    expect(await saving).toEqual({ ok: false, error: 'session-changed' });
    expect(await controller.store.loadFromSlot('manual:1')).toEqual({
      ok: false,
      error: 'empty-slot',
    });
  },
);

it('rechecks the current predicate immediately before mutation after version-check continuation', async () => {
  const { store } = await setup();
  const expectedVersion = await version(store);
  let calls = 0;
  expect(
    await store.deleteSlot('manual:1', {
      expectedVersion,
      isCurrent: () => ++calls === 1,
    }),
  ).toEqual({ ok: false, error: 'slot-changed' });
  expect(calls).toBe(2);
  expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: true });
});

it('detects metadata-only changes and publishes repaired metadata with its actual persisted version', async () => {
  const { adapter, store, save } = await setup();
  const old = await version(store);
  const cache = (await adapter.get('tf.save.manual:1.meta')) as { timestamp: number };
  cache.timestamp += 1;
  await adapter.setMany([['tf.save.manual:1.meta', cache]]);
  expect(await store.deleteSlot('manual:1', { expectedVersion: old })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  await adapter.delMany(['tf.save.manual:1.meta']);
  const repaired = (await store.listSlots()).find((row) => row.slotId === 'manual:1')!;
  expect(repaired.timestamp).toBe(save.timestamp);
  expect(repaired.version).toBe(await version(store));
  expect(
    await store.loadFromSlot('manual:1', { expectedVersion: repaired.version! }),
  ).toMatchObject({ ok: true, save });
});

it('freshly reads cached corrupt slots and admits an externally repaired valid save', async () => {
  const { adapter, store, save } = await setup();
  const originalBlob = await adapter.get('tf.save.manual:1.blob');
  await store.listSlots();
  await adapter.setMany([['tf.save.manual:1.blob', 'broken']]);
  expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: false, error: 'corrupt' });
  const corrupted = (await store.listSlots()).find((row) => row.slotId === 'manual:1')!;
  expect(corrupted.status).toBe('corrupt');
  await adapter.setMany([['tf.save.manual:1.blob', originalBlob]]);
  const repaired = (await store.listSlots()).find((row) => row.slotId === 'manual:1')!;
  expect(repaired.status).toBe('ok');
  expect(repaired.version).not.toBe(corrupted.version);
  expect(
    await store.loadFromSlot('manual:1', { expectedVersion: repaired.version! }),
  ).toMatchObject({ ok: true, save });
});

it('supports valid guarded deletion of corrupt bytes but rejects later corrupt replacements', async () => {
  const { adapter, store } = await setup();
  await adapter.setMany([
    ['tf.save.manual:1.blob', 'broken'],
    ['tf.save.manual:1.meta', null],
  ]);
  expect(await store.loadFromSlot('manual:1')).toMatchObject({ ok: false });
  const approved = await version(store);
  await adapter.setMany([['tf.save.manual:1.blob', 'different broken']]);
  expect(await store.deleteSlot('manual:1', { expectedVersion: approved })).toEqual({
    ok: false,
    error: 'slot-changed',
  });
  const fresh = await version(store);
  expect(await store.deleteSlot('manual:1', { expectedVersion: fresh })).toEqual({ ok: true });
  expect(await store.loadFromSlot('manual:1')).toEqual({ ok: false, error: 'empty-slot' });
});
