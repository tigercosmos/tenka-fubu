import { describe, expect, it, vi } from 'vitest';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import {
  createMemorySaveStorage,
  type SaveStorageAdapter,
} from '../../src/app/persistence/storage';
import { buildSaveFile, type SaveMetadataContext } from '../../src/core/save/serialize';
import type { Command } from '../../src/core/commands/types';
import { buildTinyState, CASTLE_A1, CLAN_ALPHA } from '../fixtures/tiny';

function harness(adapter = createMemorySaveStorage()) {
  let session: object | null = {};
  let now = 0;
  let tick = 0;
  const pending: Command[] = [];
  const game = buildTinyState();
  const status = vi.fn();
  const progress = createSessionProgressBinding({
    getSession: () => session,
    getMark: () => ({ tick, lastAppliedCmdSeq: 0, pendingCommands: pending }),
    subscribe: () => () => {},
    now: () => now,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  const captureSnapshot = vi.fn((timestamp: number, context: SaveMetadataContext) =>
    buildSaveFile(game, timestamp, pending, context),
  );
  const controller = createSaveSessionController({
    adapter,
    progress,
    getSession: () => session,
    captureSnapshot,
    wallNow: () => 1234,
    appVersion: 'test-version',
    onAutosaveStatusChange: status,
  });
  controller.resetSession();
  status.mockClear();
  return {
    controller,
    progress,
    pending,
    game,
    status,
    captureSnapshot,
    adapter,
    setTime: (value: number) => {
      now = value;
    },
    setSession: (value: object | null) => {
      session = value;
    },
    advance: () => {
      tick += 1;
    },
  };
}

function blockedStorage() {
  const memory = createMemorySaveStorage();
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const adapter: SaveStorageAdapter = {
    ...memory,
    async setMany(entries) {
      entered();
      await barrier;
      await memory.setMany(entries);
    },
  };
  return { adapter, reached, release: () => release() };
}

const command: Command = {
  type: 'setCastleControl',
  clanId: CLAN_ALPHA,
  castleId: CASTLE_A1,
  directControl: false,
};

describe('M8 save-session boundary', () => {
  it('captures metadata, playtime and queued commands synchronously without live references', async () => {
    const h = harness();
    h.controller.resetSession(60);
    h.setTime(2500);
    h.pending.push(command);
    const captured = h.controller.captureCurrent('Manual label');
    expect(captured?.save.meta).toMatchObject({
      appVersion: 'test-version',
      slotLabel: 'Manual label',
      playtimeSeconds: 62,
    });
    expect(captured?.save.timestamp).toBe(1234);
    const gold = captured?.save.state.clans[CLAN_ALPHA]?.gold;
    h.game.clans[CLAN_ALPHA]!.gold += 100;
    h.pending.length = 0;
    expect(captured?.save.pendingCommands).toEqual([command]);
    expect(captured?.save.state.clans[CLAN_ALPHA]?.gold).toBe(gold);
    h.advance();
    expect(h.progress.isDirty()).toBe(true);
    expect(await h.controller.saveCurrent('quick:1', 'Quick label')).toEqual({ ok: true });
    expect(h.progress.isDirty()).toBe(false);
    expect(await h.controller.store.loadFromSlot('quick:1')).toMatchObject({
      ok: true,
      save: { meta: { slotLabel: 'Quick label', playtimeSeconds: 62 } },
    });
  });

  it('does not clear newer work queued while a manual write is in flight', async () => {
    const storage = blockedStorage();
    const h = harness(storage.adapter);
    h.pending.push(command);
    const saving = h.controller.saveCurrent('manual:1', 'First');
    expect(h.captureSnapshot).toHaveBeenCalledTimes(1);
    await storage.reached;
    h.pending.push({ ...command, directControl: true });
    storage.release();
    expect(await saving).toEqual({ ok: true });
    expect(h.progress.isDirty()).toBe(true);
    expect(await h.controller.store.loadFromSlot('manual:1')).toMatchObject({
      ok: true,
      save: { pendingCommands: [command] },
    });
  });

  it('old-session completion cannot clean replacement-session progress', async () => {
    const storage = blockedStorage();
    const h = harness(storage.adapter);
    h.advance();
    const saving = h.controller.saveCurrent('manual:1');
    await storage.reached;
    h.setSession({});
    h.controller.resetSession(100);
    h.advance();
    storage.release();
    expect(await saving).toEqual({ ok: false, error: 'session-changed' });
    expect(h.progress.isDirty()).toBe(true);
    expect(h.progress.getPlaytimeSeconds()).toBe(100);
  });

  it('season hooks rotate three slots, preserve each queued snapshot and clean only saved work', async () => {
    const h = harness();
    const first = h.controller.saveSeasonSnapshot('Spring');
    h.pending.push(command);
    const second = h.controller.saveSeasonSnapshot('Summer');
    h.advance();
    const third = h.controller.saveSeasonSnapshot('Autumn');
    const fourth = h.controller.saveSeasonSnapshot('Winter');
    expect(await Promise.all([first, second, third, fourth])).toEqual([
      { ok: true, slotId: 'auto:1' },
      { ok: true, slotId: 'auto:2' },
      { ok: true, slotId: 'auto:3' },
      { ok: true, slotId: 'auto:1' },
    ]);
    expect(await h.controller.store.loadFromSlot('auto:2')).toMatchObject({
      ok: true,
      save: { meta: { slotLabel: 'Summer' }, pendingCommands: [command] },
    });
    expect(await h.controller.store.loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { meta: { slotLabel: 'Winter' } },
    });
    expect(h.progress.isDirty()).toBe(false);
  });

  it('reports autosave suspension once, leaves manual saves usable, and resets status', async () => {
    const memory = createMemorySaveStorage();
    const h = harness({
      ...memory,
      async setMany(entries) {
        if (entries.some(([key]) => key === 'tf.save.autosaveCursor'))
          throw new Error('I/O failure');
        await memory.setMany(entries);
      },
    });
    expect(await h.controller.saveSeasonSnapshot()).toEqual({ ok: false, error: 'write-failed' });
    expect(await h.controller.saveSeasonSnapshot()).toEqual({ ok: false, error: 'suspended' });
    expect(h.status.mock.calls).toEqual([[true]]);
    expect(h.controller.isAutosaveSuspended()).toBe(true);
    expect(await h.controller.saveCurrent('manual:1')).toEqual({ ok: true });
    h.controller.resetSession();
    expect(h.status.mock.calls).toEqual([[true], [false]]);
    expect(h.controller.isAutosaveSuspended()).toBe(false);
  });

  it.each([true, false])(
    'suppresses old autosave failure after replacement (reset=%s)',
    async (reset) => {
      const storage = blockedStorage();
      const h = harness({
        ...storage.adapter,
        async setMany(entries) {
          await storage.adapter.setMany(entries);
          throw new Error('old-session failure');
        },
      });
      const saving = h.controller.saveSeasonSnapshot();
      await storage.reached;
      h.setSession({});
      if (reset) h.controller.resetSession();
      h.status.mockClear();
      storage.release();
      expect(await saving).toEqual({ ok: false, error: 'session-changed' });
      expect(h.status).not.toHaveBeenCalled();
      expect(h.controller.isAutosaveSuspended()).toBe(false);
    },
  );

  it('returns explicit no-session and capture-error outcomes without writing', async () => {
    const h = harness();
    h.setSession(null);
    expect(h.controller.captureCurrent()).toBeNull();
    expect(await h.controller.saveCurrent('manual:1')).toEqual({ ok: false, error: 'no-session' });
    expect(await h.controller.saveSeasonSnapshot()).toEqual({ ok: false, error: 'no-session' });
    h.setSession({});
    h.captureSnapshot.mockImplementation(() => {
      throw new Error('capture failure');
    });
    expect(await h.controller.saveCurrent('manual:1')).toEqual({
      ok: false,
      error: 'write-failed',
    });
    expect(await h.controller.saveSeasonSnapshot()).toEqual({ ok: false, error: 'write-failed' });
    expect(await h.adapter.keys()).toEqual([]);
  });
});
